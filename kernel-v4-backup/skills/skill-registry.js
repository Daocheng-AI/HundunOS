// kernel/skills/skill-registry.js
// HundunOS v3.9+v4.1 — Skill 注册表
// 职责：Skill 发现 / 加载 / 触发匹配 / 注册注销
// v3.9: 集成 skill-validator 验证逻辑
// v4.1: 用户目录自动发现（~/.hundunos/skills/）

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import YAML from 'yaml';
import { validateSkillDef, getSkillNameError } from './skill-validator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, 'skills');
const MAX_CONCURRENT = parseInt(process.env.HUNDUNOS_SKILL_CONCURRENCY || '3', 10);

export class SkillRegistry extends EventTarget {
    /**
     * @param {import('../core.js').HundunOSKernel} kernel
     */
    constructor(kernel) {
        super();
        this.kernel = kernel;
        this.skills = new Map();         // name → SkillDefinition
        this.activeRunners = new Map();  // name → SkillRunner instance
        this.matchCache = new Map();      // query → matched skills (TTL 5min)
        this.matchCacheTTL = 5 * 60 * 1000;
        this._initialized = false;
    }

    /** 初始化：扫描内置 + 用户目录，加载所有 YAML */
    async initialize() {
        if (this._initialized) return;

        // 1. 内置 Skills（kernel/skills/skills/）
        if (existsSync(SKILLS_DIR)) {
            await this._loadFromDir(SKILLS_DIR);
        } else {
            // console.log('[SkillRegistry] 内置 skills/ 目录不存在，跳过');
        }

        // 2. 用户自定义 Skills（~/.hundunos/skills/）
        const userSkillsDir = join(homedir(), '.hundunos', 'skills');
        if (existsSync(userSkillsDir)) {
            const userCount = await this._loadFromDir(userSkillsDir, { source: 'user' });
            if (userCount > 0) {
                // console.log(`[SkillRegistry] 已加载 ${userCount} 个用户自定义 Skill（来自 ${userSkillsDir}）`);
            }
        }
        // 不存在的用户目录不警告，静默跳过

        this._initialized = true;
        const userSkills = [...this.skills.values()].filter(s => s._source === 'user').length;
        const builtInSkills = this.skills.size - userSkills;
        // console.log(`[SkillRegistry] 共 ${this.skills.size} 个 Skill（内置 ${builtInSkills} + 用户 ${userSkills}）`);
    }

    /**
     * 从目录加载所有 YAML Skill
     * @param {string} dir
     * @param {{ source?: string }} [options]
     * @returns {Promise<number>} 成功加载的数量
     */
    async _loadFromDir(dir, options = {}) {
        const { source = 'builtin' } = options;
        const files = readdirSync(dir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
        let loaded = 0;

        await Promise.allSettled(
            files.map(async (file) => {
                try {
                    const filePath = join(dir, file);
                    const content = readFileSync(filePath, 'utf-8');
                    const def = YAML.parse(content);
                    def._source = source; // 标记来源：builtin | user
                    this._registerDef(def);
                    loaded++;
                } catch (e) {
                    console.warn(`[SkillRegistry] 加载失败 ${file}: ${e.message}`);
                }
            })
        );

        return loaded;
    }

    /** 注册单个 Skill 定义（内部） */
    _registerDef(def) {
        // v3.9: 使用 skill-validator 验证
        const validation = validateSkillDef(def);
        
        if (!validation.valid) {
            console.warn(`[SkillRegistry] Skill 验证失败: ${validation.errors.join(', ')}`);
            return;
        }
        
        // 输出警告（不影响注册）
        if (validation.warnings.length > 0) {
            console.warn(`[SkillRegistry] Skill "${def.name}" 警告: ${validation.warnings.join(', ')}`);
        }
        
        // 确保 version 有默认值
        if (!def.version) def.version = '1.0.0';
        
        def._loadedAt = Date.now();
        def._file = def._file || def.name;
        this.skills.set(def.name, def);
        this.dispatchEvent(new CustomEvent('skill_registered', { detail: def }));
    }

    /** 动态注册 Skill（支持 JS 对象或 YAML 字符串） */
    async register(spec) {
        let def = spec;
        if (typeof spec === 'string') {
            def = YAML.parse(spec);
        }
        this._registerDef(def);
        return def;
    }

    /** 注销 Skill */
    unregister(name) {
        const removed = this.skills.delete(name);
        if (removed) {
            this.dispatchEvent(new CustomEvent('skill_unregistered', { detail: { name } }));
        }
        return removed;
    }

    /** 根据查询文本匹配最合适的 Skill */
    async match(query, options = {}) {
        const { force = false } = options;
        const cacheKey = query.slice(0, 100);

        // 缓存命中
        if (!force) {
            const cached = this.matchCache.get(cacheKey);
            if (cached && Date.now() - cached.ts < this.matchCacheTTL) {
                return cached.result;
            }
        }

        const lower = query.toLowerCase();
        const candidates = [];

        for (const [name, skill] of this.skills) {
            const score = this._computeMatchScore(skill, lower, query);
            // 语义匹配（异步，叠加到基础分数）
            const semBonus = await this._semanticMatchScore(skill, query, score);
            const totalScore = Math.min(score + semBonus, 1.0);
            if (totalScore > 0) {
                candidates.push({ skill, score: totalScore });
            }
        }

        candidates.sort((a, b) => b.score - a.score);
        const result = candidates.slice(0, options.limit || 3);

        const out = result.map(c => ({
            name: c.skill.name,
            version: c.skill.version,
            score: c.score,
            description: c.skill.description,
            triggers: c.skill._matchedTriggers || [],
        }));

        this.matchCache.set(cacheKey, { ts: Date.now(), result: out });
        return out;
    }

    /** 计算单个 Skill 对查询的匹配分数（同步部分） */
    _computeMatchScore(skill, lower, query) {
        let score = 0;
        const triggers = skill.trigger || {};
        const patterns = triggers.patterns || [];

        // 1. 精确触发词匹配（最高优先）
        for (const p of patterns) {
            const pl = p.toLowerCase();
            if (lower === pl) score += 0.8;       // 完全匹配
            else if (lower.includes(pl)) score += 0.5; // 包含匹配
        }

        // 2. 描述相关性（中等优先）
        if (skill.description) {
            const dl = skill.description.toLowerCase();
            const descWords = query.split(/\s+/).filter(w => w.length > 2);
            for (const word of descWords) {
                if (dl.includes(word)) score += 0.15;
            }
        }

        // 3. 系统提示词相关性
        if (skill.system_prompt) {
            const spl = skill.system_prompt.toLowerCase();
            const promptWords = query.split(/\s+/).filter(w => w.length > 3);
            for (const word of promptWords) {
                if (spl.includes(word)) score += 0.1;
            }
        }

        // 4. 工具名称相关性
        if (skill.tools) {
            for (const tool of skill.tools) {
                if (typeof tool === 'object' && tool.id) {
                    const tl = tool.id.toLowerCase();
                    if (lower.includes(tl)) score += 0.2;
                }
            }
        }

        return Math.min(score, 1.0);
    }

    /** 语义匹配分数（异步，降级时返回 0） */
    async _semanticMatchScore(skill, query, baseScore) {
        const skillTrigger = skill.trigger || {};
        if (skillTrigger.semantic === false || !this.kernel?.modelRouter || baseScore >= 0.6) {
            return 0;
        }
        try {
            const semScore = await this._semanticMatch(skill, query);
            return semScore * 0.7;
        } catch (_) {
            return 0;
        }
    }

    /** LLM 语义匹配（降级：不依赖外部 API 时返回 0） */
    async _semanticMatch(skill, query) {
        if (!this.kernel?.modelRouter) return 0;
        try {
            const prompt = `判断以下 Skill 描述是否适合用户查询：
Skill: ${skill.name} — ${skill.description}
查询: ${query}
回答 JSON: { "score": 0.0-1.0, "reason": "原因" }`;
            const result = await this.kernel.modelRouter.route({
                content: prompt,
                type: 'system',
            });
            const parsed = JSON.parse(result.content || '{}');
            return Math.max(0, Math.min(1, parseFloat(parsed.score) || 0));
        } catch {
            return 0;
        }
    }

    /** 获取单个 Skill 定义 */
    get(name) {
        return this.skills.get(name) || null;
    }

    /** 列出所有已加载的 Skill */
    list() {
        return Array.from(this.skills.values()).map(s => ({
            name: s.name,
            version: s.version,
            description: s.description,
            trigger: s.trigger,
            loadedAt: s._loadedAt,
        }));
    }

    /** 检查是否有匹配的 Skill */
    async hasMatch(query) {
        const matches = await this.match(query, { limit: 1 });
        return matches.length > 0;
    }

    /** 获取匹配分数最高的 Skill */
    async bestMatch(query) {
        const matches = await this.match(query, { limit: 1 });
        return matches[0] || null;
    }

    /** 获取统计信息 */
    getStats() {
        const all = [...this.skills.values()];
        return {
            totalSkills: this.skills.size,
            builtinSkills: all.filter(s => s._source !== 'user').length,
            userSkills: all.filter(s => s._source === 'user').length,
            cachedEntries: this.matchCache.size,
            activeRunners: this.activeRunners.size,
            skills: this.list(),
        };
    }
}

export default SkillRegistry;
