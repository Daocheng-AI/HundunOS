/**
 * kernel/skills/skill-matcher.js v3.6
 * HundunOS Phase 1: Skill 匹配引擎
 *
 * 功能：
 * - 关键词模式匹配（精确 + 模糊）
 * - LLM 语义匹配（当 trigger.semantic=true 时）
 * - 多 Skill 同时匹配 + 置信度排序
 * - 缓存匹配结果（TTL）
 *
 * 匹配策略：
 *   1. 精确关键词匹配（patterns 中有完全包含的词）
 *   2. 模糊匹配（包含/子串/编辑距离）
 *   3. LLM 语义匹配（启用时，对高优先级请求进行判断）
 */

export class SkillMatcher {
    /**
     * @param {object} options
     * @param {import('./skill-registry.js').SkillRegistry} options.registry
     * @param {object} [options.kernel]    - Kernel 引用（用于 LLM 调用）
     * @param {object} [options.modelRouter] - ModelRouter（用于语义匹配）
     */
    constructor(options = {}) {
        this.registry = options.registry;
        this.kernel = options.kernel || null;
        this.modelRouter = options.modelRouter || null;

        // 缓存：query hash -> MatchResult[]
        this._cache = new Map();
        this._cacheTTL = options.cacheTTL || 60_000; // 1min
        this._cacheMeta = new Map(); // query hash -> timestamp
    }

    // ================================================================
    // 主入口
    // ================================================================

    /**
     * 匹配用户查询触发的所有 Skill
     * @param {string} query - 用户输入
     * @param {object} [options]
     * @param {number} [options.limit=5]      - 最多返回数量
     * @param {boolean} [options.semantic]   - 强制语义匹配
     * @param {string[]} [options.tags]       - 按标签过滤
     * @returns {Promise<MatchResult[]>}
     */
    async match(query, options = {}) {
        const limit = options.limit || 5;
        const queryLower = query.toLowerCase().trim();

        // 缓存查询
        const cacheKey = this._makeCacheKey(queryLower, options);
        const cached = this._getCached(cacheKey);
        if (cached) return cached.slice(0, limit);

        let skills;
        if (options.tags?.length) {
            skills = options.tags.flatMap(tag => this.registry.getByTag(tag));
        } else {
            skills = this.registry.getAllSkills();
        }

        // Step 1: 关键词匹配（快速）
        const keywordMatches = this._keywordMatch(queryLower, skills);

        // Step 2: 语义匹配（慢速，可选）
        let semanticMatches = [];
        if (options.semantic || keywordMatches.length === 0) {
            semanticMatches = await this._semanticMatch(query, skills);
        }

        // Step 3: 合并去重，按置信度排序
        const merged = this._mergeMatches(keywordMatches, semanticMatches);

        const results = merged.slice(0, limit);
        this._setCached(cacheKey, results);
        return results;
    }

    // ================================================================
    // 关键词匹配
    // ================================================================

    _keywordMatch(query, skills) {
        const results = [];
        const queryTokens = this._tokenize(query);

        for (const skill of skills) {
            const trigger = skill.trigger || {};
            const patterns = trigger.patterns || [];

            let score = 0;
            let matchedPattern = null;

            for (const pattern of patterns) {
                const patternLower = pattern.toLowerCase();
                const patternTokens = this._tokenize(patternLower);

                // 精确包含
                if (query.includes(patternLower)) {
                    score = Math.max(score, 10);
                    matchedPattern = pattern;
                }
                // 词根匹配（主要 token 相同）
                else if (patternTokens.some(t => queryTokens.includes(t) && t.length > 2)) {
                    score = Math.max(score, 6);
                    matchedPattern = matchedPattern || pattern;
                }
                // 子串匹配（短词）
                else if (patternLower.length >= 3 && query.includes(patternLower.slice(0, -1))) {
                    score = Math.max(score, 3);
                }
            }

            // 描述匹配
            const descLower = (skill.description || '').toLowerCase();
            if (queryTokens.some(t => t.length > 3 && descLower.includes(t))) {
                score = Math.max(score, 2);
            }

            // 标签匹配
            if (skill.tags?.some(tag => queryTokens.includes(tag.toLowerCase()))) {
                score = Math.max(score, 1);
            }

            if (score > 0) {
                results.push({
                    skill: skill.name,
                    confidence: score / 10,
                    method: 'keyword',
                    matchedPattern,
                    skillDef: skill,
                });
            }
        }

        return results.sort((a, b) => b.confidence - a.confidence);
    }

    // ================================================================
    // 语义匹配（LLM 驱动）
    // ================================================================

    /**
     * 使用 LLM 判断 Skill 是否与查询相关
     * @param {string} query
     * @param {object[]} skills
     * @returns {Promise<MatchResult[]>}
     */
    async _semanticMatch(query, skills) {
        const results = [];

        // 只对 semantic=true 的 skill 做 LLM 判断
        const semanticSkills = skills.filter(s => s.trigger?.semantic);
        if (semanticSkills.length === 0) return results;

        for (const skill of semanticSkills) {
            try {
                const reason = await this._llmJudge(query, skill);
                if (reason.relevant) {
                    results.push({
                        skill: skill.name,
                        confidence: reason.confidence || 0.7,
                        method: 'semantic',
                        reason: reason.reason,
                        skillDef: skill,
                    });
                }
            } catch (e) {
                // LLM 不可用时降级
                console.warn(`[SkillMatcher] LLM match failed for ${skill.name}: ${e.message}`);
            }
        }

        return results.sort((a, b) => b.confidence - a.confidence);
    }

    /**
     * 调用 LLM 判断查询是否与 Skill 相关
     * @returns {Promise<{relevant: boolean, confidence: number, reason: string}>}
     */
    async _llmJudge(query, skill) {
        // 优先使用 kernel 的 modelRouter
        const router = this.modelRouter || this.kernel?.modelRouter;

        if (!router) {
            // 无 LLM 时，使用本地启发式
            return this._localJudge(query, skill);
        }

        const systemPrompt = `你是一个 Skill 匹配助手。判断用户的查询是否应该触发以下 Skill。
只返回 JSON：{"relevant": true/false, "confidence": 0.0-1.0, "reason": "一句话原因"}

Skill: ${skill.name}
Description: ${skill.description}
Trigger Patterns: ${(skill.trigger?.patterns || []).join(', ')}

Query: "${query}"`;

        try {
            const response = await router.complete?.({
                prompt: query,
                systemPrompt,
                maxTokens: 100,
                temperature: 0.0,
            });

            // 尝试解析 JSON 响应
            const text = typeof response === 'string' ? response : response?.text || response?.content || '';
            const match = text.match(/\{[\s\S]*\}/);
            if (match) {
                return JSON.parse(match[0]);
            }
        } catch (e) {
            console.warn(`[SkillMatcher] LLM call failed: ${e.message}`);
        }

        return this._localJudge(query, skill);
    }

    /**
     * 本地启发式判断（无 LLM 时的降级方案）
     */
    _localJudge(query, skill) {
        const queryLower = query.toLowerCase();
        const patterns = skill.trigger?.patterns || [];

        // 检查模式匹配
        for (const pattern of patterns) {
            const patternLower = pattern.toLowerCase();
            if (queryLower.includes(patternLower) || patternLower.includes(queryLower.slice(0, 10))) {
                return { relevant: true, confidence: 0.75, reason: `pattern match: ${pattern}` };
            }
        }

        // 描述关键词检查
        const descWords = (skill.description || '').toLowerCase().split(/\s+/);
        const queryWords = queryLower.split(/\s+/);
        const overlap = queryWords.filter(w => descWords.some(d => d.includes(w) || w.includes(d)));
        if (overlap.length >= 2) {
            return { relevant: true, confidence: 0.6, reason: 'description overlap' };
        }

        return { relevant: false, confidence: 0, reason: 'no match' };
    }

    // ================================================================
    // 合并 & 排序
    // ================================================================

    _mergeMatches(keywordMatches, semanticMatches) {
        const map = new Map();

        for (const m of [...keywordMatches, ...semanticMatches]) {
            const existing = map.get(m.skill);
            if (!existing) {
                map.set(m.skill, m);
            } else {
                // 合并置信度
                existing.confidence = Math.max(existing.confidence, m.confidence);
                existing.method = existing.confidence === m.confidence ? 'hybrid' : existing.method;
            }
        }

        return Array.from(map.values()).sort((a, b) => b.confidence - a.confidence);
    }

    // ================================================================
    // 工具函数
    // ================================================================

    _tokenize(text) {
        return text.toLowerCase().split(/[\s\-\_\.\/\\:]+/).filter(s => s.length > 1);
    }

    _makeCacheKey(query, options) {
        const tags = (options.tags || []).sort().join(',');
        const semantic = options.semantic ? '1' : '0';
        return `${query}|${tags}|${semantic}`;
    }

    _getCached(key) {
        const ts = this._cacheMeta.get(key);
        if (!ts || Date.now() - ts > this._cacheTTL) {
            this._cache.delete(key);
            this._cacheMeta.delete(key);
            return null;
        }
        return this._cache.get(key);
    }

    _setCached(key, results) {
        this._cache.set(key, results);
        this._cacheMeta.set(key, Date.now());
    }

    clearCache() {
        this._cache.clear();
        this._cacheMeta.clear();
    }

    getStats() {
        return {
            cacheSize: this._cache.size,
            cachedQueries: Array.from(this._cacheMeta.keys()).length,
        };
    }
}

/**
 * @typedef {Object} MatchResult
 * @property {string} skill - Skill 名称
 * @property {number} confidence - 置信度 0-1
 * @property {'keyword'|'semantic'|'hybrid'} method - 匹配方法
 * @property {string} [matchedPattern] - 匹配的关键词
 * @property {string} [reason] - 语义匹配原因
 * @property {object} skillDef - Skill 定义（完整对象）
 */

export default SkillMatcher;
