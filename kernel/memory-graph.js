// hundunos/kernel/memory-graph.js — MemoryGraph v4.1
// 功能: 四层记忆系统，支持层级化上下文 (参考 OpenViking 设计)
// v4.1: MemOS v2.0 Stardust 优化移植 — AdvancedSearcher 多路径并行检索、
//       TaskGoalParser CoT 分解、MemoryReorganizer 后台图优化、ActivationMemory 激活缓存
// v4.0: 集成 MemoryGraphVectorCompressor — 语义层 PolarQuant 3-bit 量化压缩
// v3.7 Phase 4: 集成 adapters/rust-modules/memory-graph.js（hundunos-core daemon）
//   - kernel.rustMemory 作为 Rust 图谱后端（TCP:38082）
//   - rustRecall() / rustSemanticSearch() 优先 Rust，JS 层兜底
import { randomUUID } from 'crypto';
import { MemoryGraphVectorCompressor } from './memory-graph-vector-compressor.js';

export class MemoryGraph {
    constructor(kernel) {
        this.kernel = kernel;
        // 四层记忆
        this.working = new Map();    // 当前会话
        this.recent = [];            // 最近 100 条
        this.semantic = new Map();    // 重要概念
        this.episodic = [];          // 完整事件

        // v4.0: 语义层向量压缩器（PolarQuant 3-bit）
        this.compressor = null;

        // Phase 4: Rust 图谱后端（adapters/rust-modules/memory-graph.js）
        this.rustAdapter = kernel?.rustMemory || null;

        // 新增：层级化上下文 (参考 OpenViking)
        this.hierarchy = {
            session: {},    // 当前会话上下文
            project: {},    // 项目级上下文
            user: {},       // 用户级上下文
            global: {}      // 全局上下文
        };

        // 配置
        this.config = {
            maxRecent: 100,
            maxEpisodic: 50,
            promotionThreshold: 5,
            semanticKeyWeight: 0.8,
            // 层级化配置
            contextTTL: 3600000,  // 1小时
            maxHierarchyDepth: 3
        };

        this.stats = { reads: 0, writes: 0, promotions: 0 };
    }

    async initialize() {
        // 从存储加载
        try {
            const recentData = await this.kernel.storage.get('memory:recent');
            if (recentData) this.recent = recentData;

            const episodicData = await this.kernel.storage.get('memory:episodic');
            if (episodicData) this.episodic = episodicData;

            const semanticData = await this.kernel.storage.get('memory:semantic');
            if (semanticData) this.semantic = new Map(semanticData);
        } catch(e) {
            // review: removed // review: removed console.log('[MemoryGraph] Loaded from storage');
        }

        // v4.0: 初始化向量压缩器（注入 semantic 层）
        try {
            this.compressor = new MemoryGraphVectorCompressor(this.kernel);
            // review: removed // review: removed console.log('[MemoryGraph] MemoryGraphVectorCompressor enabled (v4.0)');
        } catch (e) {
            console.warn('[MemoryGraph] VectorCompressor init failed:', e.message);
        }

        // Phase 4: Rust 图谱后端状态
        if (this.rustAdapter) {
            // review: removed // review: removed console.log('[MemoryGraph] Rust backend: ✅ adapters/rust-modules/memory (hundunos-core daemon)');
        } else {
            // review: removed // review: removed console.log('[MemoryGraph] Rust backend: ⚠️  using JS layer only (daemon unavailable)');
        }

        // v4.1: MemOS 优化 — 初始化新组件
        this._initReorganizer();
        this._initActivationMemory();
        // review: removed // review: removed console.log('[MemoryGraph] v4.1: AdvancedSearcher + TaskGoalParser + MemoryReorganizer + ActivationMemory enabled');
        // review: removed // review: removed console.log('[MemoryGraph] Initialized');
    }

    // update: 别名，方便调用
    async update(message, intent, result) {
        return this.record(message, intent, result);
    }

    // 记录新记忆
    async record(message, intent, result) {
        this.stats.writes++;
        
        const entry = {
            id: `mem_${randomUUID()}`,
            timestamp: Date.now(),
            message: message.content || '',
            intent: intent.type,
            result: result.success,
            importance: this._calculateImportance(intent, result)
        };
        
        // 1. 加入 Working (当前会话)
        this.working.set(entry.id, entry);
        
        // 2. 加入 Recent
        this.recent.unshift(entry);
        if (this.recent.length > this.config.maxRecent) {
            this.recent.pop();
        }
        
        // 3. 检查是否需要提升到 Semantic
        if (entry.importance >= this.config.promotionThreshold) {
            this._promoteToSemantic(entry);
        }
        
        // 4. 完整事件记录
        if (entry.importance >= 3) {
            this.episodic.unshift({ ...entry, full: true });
            if (this.episodic.length > this.config.maxEpisodic) {
                this.episodic.pop();
            }
        }
        
        // 定期持久化
        await this._persist();

        // v4.1: 触发后台图重组（防抖 5 分钟）
        this.triggerReorganize();
    }

    // 检索记忆
    // v4.3: 添加 type/scope 过滤（参考 learn-claude-code s09）
    async recall(query, options = {}) {
        this.stats.reads++;
        
        const { type, scope, limit = 10 } = options;
        
        const results = {
            working: [],
            recent: [],
            semantic: [],
            episodic: []
        };
        
        // 搜索 Recent
        const q = query.toLowerCase();
        results.recent = this.recent.filter(e => {
            const matchesQuery = e.message.toLowerCase().includes(q) || e.intent.includes(q);
            if (!matchesQuery) return false;
            
            // type 过滤
            if (type && e.type !== type) return false;
            
            // scope 过滤
            if (scope && e.scope !== scope) return false;
            
            return true;
        }).slice(0, limit);
        
        // 搜索 Semantic
        for (const [key, value] of this.semantic) {
            const matchesQuery = key.includes(q) || value.description?.includes(q);
            if (!matchesQuery) continue;
            
            // type 过滤
            if (type && value.type !== type) continue;
            
            // scope 过滤
            if (scope && value.scope !== scope) continue;
            
            results.semantic.push({ key, ...value });
        }
        
        // 搜索 Episodic
        results.episodic = this.episodic.filter(e => {
            const matchesQuery = e.message.toLowerCase().includes(q);
            if (!matchesQuery) return false;
            
            // type 过滤
            if (type && e.type !== type) return false;
            
            // scope 过滤
            if (scope && e.scope !== scope) return false;
            
            return true;
        }).slice(0, Math.floor(limit / 2));
        
        return results;
    }

    // 获取上下文
    getContext(sessionId, limit = 10) {
        const context = this.recent.slice(0, limit).map(e => ({
            role: 'user',
            content: e.message
        }));
        return context;
    }

    // 计算重要性
    _calculateImportance(intent, result) {
        let score = 1;
        if (intent?.type === 'system') score += 2;
        if (intent?.action === 'kernel_upgrade') score += 3;
        if (result?.success === false) score += 1;
        return Math.min(score, 5);
    }

    // 提升到语义层
    _promoteToSemantic(entry) {
        this.stats.promotions++;
        
        const key = this._extractKey(entry);
        const existing = this.semantic.get(key) || { count: 0, entries: [] };
        
        existing.count++;
        existing.entries.push(entry.id);
        if (entry.message) existing.description = entry.message.slice(0, 100);
        existing.lastSeen = entry.timestamp;
        
        this.semantic.set(key, existing);

        // v4.0: 同步量化压缩到 compressor（写 semanticMap）
        if (this.compressor) {
            this.compressor.compressEntity(key, {
                description: existing.description || '',
                importance: entry.importance || 1,
            }).catch(() => {});
        }
    }

    /**
     * v4.0: 语义搜索 — 压缩域汉明相似度
     * @param {string} query - 搜索查询
     * @param {number} topK - 返回数量
     * @returns {Promise<Array>} 相似条目列表
     */
    async semanticSearch(query, topK = 5) {
        if (!this.compressor) return [];
        return this.compressor.semanticSearch(query, topK);
    }

    // 提取关键概念
    _extractKey(entry) {
        // 简单实现：从意图提取关键词
        return `${entry.intent}:${entry.result ? 'success' : 'fail'}`;
    }

    // 持久化
    async _persist() {
        try {
            await this.kernel.storage.put('memory:recent', this.recent.slice(0, 50));
            await this.kernel.storage.put('memory:episodic', this.episodic.slice(0, 20));
            await this.kernel.storage.put('memory:semantic', Array.from(this.semantic.entries()));
        } catch(e) {
            console.warn('[MemoryGraph] Persist failed:', e.message);
        }
    }

    // 获取统计
    getStats() {
        return {
            working: this.working.size,
            recent: this.recent.length,
            semantic: this.semantic.size,
            episodic: this.episodic.length,
            hierarchy: {
                session: Object.keys(this.hierarchy.session).length,
                project: Object.keys(this.hierarchy.project).length,
                user: Object.keys(this.hierarchy.user).length,
                global: Object.keys(this.hierarchy.global).length
            },
            ...this.stats,
            // v4.0: 向量压缩统计
            compressor: this.compressor ? this.compressor.getQuantStats() : null,
        };
    }

    // ================================================================
    // 层级化上下文 (参考 OpenViking)
    // ================================================================

    /**
     * 更新层级上下文
     * @param {string} level - session | project | user | global
     * @param {string} key - 上下文键
     * @param {any} value - 上下文值
     */
    setContext(level, key, value) {
        if (!this.hierarchy[level]) return;
        
        this.hierarchy[level][key] = {
            value,
            timestamp: Date.now(),
            ttl: this.config.contextTTL
        };
    }

    /**
     * 获取层级上下文
     */
    getContextValue(level, key) {
        const ctx = this.hierarchy[level]?.[key];
        if (!ctx) return null;
        
        // 检查过期
        if (Date.now() - ctx.timestamp > ctx.ttl) {
            delete this.hierarchy[level][key];
            return null;
        }
        
        return ctx.value;
    }

    /**
     * 获取完整上下文链 (从 global 到 session)
     */
    getContextChain() {
        return {
            global: this.hierarchy.global,
            user: this.hierarchy.user,
            project: this.hierarchy.project,
            session: this.hierarchy.session
        };
    }

    /**
     * 蒸馏上下文 - 提取重要信息到更高层级
     */
    async distill() {
        // 从 recent 中提取重要概念到 project 层级
        const important = this.recent.filter(e => e.importance >= 4);
        for (const entry of important) {
            const key = `concept_${entry.intent}`;
            this.setContext('project', key, {
                description: entry.message.slice(0, 100),
                count: (this.getContextValue('project', key)?.count || 0) + 1
            });
        }
    }

    // ================================================================
    // Phase 4: Rust 图谱后端（adapters/rust-modules/memory-graph.js）
    // ================================================================

    /**
     * v3.7 Phase 4: 通过 Rust 图谱检索（优先 Rust，JS 兜底）
     * @param {string} query - 搜索查询
     */
    async rustRecall(query) {
        if (!this.rustAdapter) return this.recall(query);
        try {
            const rustResults = await this.rustAdapter.recall(query);
            if (rustResults) return rustResults;
        } catch (e) {
            console.warn('[MemoryGraph/Rust] recall failed, using JS fallback:', e.message);
        }
        return this.recall(query);
    }

    /**
     * v3.7 Phase 4: 语义搜索优先 Rust（PolarQuant 向量 + JS compressor 兜底）
     */
    async rustSemanticSearch(query, topK = 5) {
        if (!this.rustAdapter) return this.semanticSearch(query, topK);
        try {
            const rustResults = await this.rustAdapter.semanticSearch(query, topK);
            // Rust 返回空数组不代表失败；空数组说明确实没有匹配结果
            if (rustResults && Array.isArray(rustResults)) return rustResults;
        } catch (e) {
            console.warn('[MemoryGraph/Rust] semanticSearch failed, using JS fallback:', e.message);
        }
        return this.semanticSearch(query, topK);
    }

    /**
     * v3.7 Phase 4: 获取 Rust 图谱统计
     */
    async getRustStats() {
        if (!this.rustAdapter) return null;
        try {
            return await this.rustAdapter.getStats();
        } catch {
            return null;
        }
    }

    // ================================================================
    // v4.1: MemOS AdvancedSearcher — 6 路径并行检索管道
    // 参考: MemOS/src/memos/memories/textual/tree_text_memory/retrieve/searcher.py
    // ================================================================

    /**
     * 高级多路径并行检索
     * @param {string} query - 搜索查询
     * @param {object} options - { topK, sessionId }
     * @returns {Promise<Array>} 合并排序后的检索结果
     */
    async advancedSearch(query, options = {}) {
        const { topK = 10, sessionId = 'default' } = options;

        // 并行 5 路径（去掉 C Internet 路径，JS 环境无 Web Access）
        const paths = await Promise.allSettled([
            this._searchPathA_working(query, sessionId),   // 激活会话
            this._searchPathB_longterm(query),             // 长期+语义
            this._searchPathD_tool(query),                 // 工具历史
            this._searchPathE_skill(query),               // 技能库
            this._searchPathF_preference(query, sessionId), // 偏好记忆
        ]);

        const results = [];
        for (const p of paths) {
            if (p.status === 'fulfilled' && Array.isArray(p.value)) {
                results.push(...p.value);
            }
        }

        // Rerank: 去重 + 加权排序
        return this._advancedRerank(results, query, topK);
    }

    // Path A: WorkingMemory — 精确/模糊文本匹配
    async _searchPathA_working(query, sessionId) {
        const session = this.kernel?.state?.sessions?.get(sessionId);
        const working = session?.context?.working || [];
        const q = query.toLowerCase();
        return working
            .filter(e => (e.message || '').toLowerCase().includes(q) || (e.intent || '').includes(q))
            .slice(0, 5)
            .map(e => ({ ...e, path: 'A', pathLabel: 'WorkingMemory', score: this._bm25Score(query, e.message || '') }));
    }

    // Path B: LongTerm + Semantic — 向量语义相似度
    async _searchPathB_longterm(query) {
        const results = [];

        // Recent 层：关键词匹配
        const q = query.toLowerCase();
        const recentMatches = this.recent
            .filter(e => (e.message || '').toLowerCase().includes(q))
            .slice(0, 8)
            .map(e => ({ ...e, path: 'B', pathLabel: 'LongTermMemory', score: this._bm25Score(query, e.message || '') }));

        // Semantic 层：压缩向量搜索（优先 Rust）
        let semanticResults = [];
        if (this.compressor) {
            try {
                semanticResults = await this.semanticSearch(query, 8);
            } catch {}
        }
        const semanticMatches = semanticResults.map(e => ({
            ...e,
            path: 'B',
            pathLabel: 'SemanticMemory',
            score: e.score || 0.7,
        }));

        return [...recentMatches, ...semanticMatches];
    }

    // Path D: ToolHistory — 工具使用轨迹检索
    async _searchPathD_tool(query) {
        const toolBridge = this.kernel?.toolBridge;
        const history = toolBridge?.trajectoryMemory?.getRecent?.() || [];
        const q = query.toLowerCase();
        return history
            .filter(t =>
                (t.toolName || '').toLowerCase().includes(q) ||
                (t.args || '').toLowerCase().includes(q) ||
                (t.description || '').toLowerCase().includes(q)
            )
            .slice(0, 5)
            .map(t => ({
                id: `tool_${t.toolName}_${t.timestamp}`,
                message: `${t.toolName}(${t.args || ''}) → ${t.success ? 'success' : 'fail'}`,
                path: 'D',
                pathLabel: 'ToolMemory',
                score: 0.6,
                toolData: t,
            }));
    }

    // Path E: SkillMemory — 技能库匹配
    async _searchPathE_skill(query) {
        const skills = this.kernel?.skills;
        if (!skills) return [];
        const all = skills.list?.() || [];
        const q = query.toLowerCase();
        return all
            .filter(s =>
                (s.name || '').toLowerCase().includes(q) ||
                (s.description || '').toLowerCase().includes(q) ||
                (s.tags || []).some(t => t.toLowerCase().includes(q))
            )
            .slice(0, 3)
            .map(s => ({
                id: `skill_${s.name}`,
                message: `Skill: ${s.name} — ${s.description || ''}`,
                path: 'E',
                pathLabel: 'SkillMemory',
                score: 0.65,
                skillData: s,
            }));
    }

    // Path F: Preference — 偏好记忆（来自 AwareSystem PreferenceExtractor）
    async _searchPathF_preference(query, sessionId) {
        const aware = this.kernel?.aware;
        const prefs = aware?.preferenceExtractor?.getRelevant?.(sessionId, query) || [];
        const q = query.toLowerCase();
        return prefs
            .filter(p => (p.key || '').toLowerCase().includes(q) || (p.value || '').toLowerCase().includes(q))
            .slice(0, 3)
            .map(p => ({
                id: `pref_${p.key}`,
                message: `偏好: ${p.key} = ${p.value}`,
                path: 'F',
                pathLabel: 'PreferenceMemory',
                score: 0.7,
                prefData: p,
            }));
    }

    // Advanced Rerank: 去重 + 分类配额 + 综合排序
    _advancedRerank(results, query, topK) {
        const seen = new Set();
        const byPath = { A: [], B: [], D: [], E: [], F: [] };
        const pathQuota = { A: 3, B: 4, D: 2, E: 2, F: 2 };

        // 分类
        for (const r of results) {
            const key = r.id || JSON.stringify(r);
            if (seen.has(key)) continue;
            seen.add(key);
            const p = r.path || 'B';
            if (byPath[p]) byPath[p].push(r);
        }

        // 配额采样 + 全局排序
        const selected = [];
        for (const [path, items] of Object.entries(byPath)) {
            const quota = pathQuota[path] || 2;
            selected.push(...items.slice(0, quota));
        }

        // 按分数降序
        return selected
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .slice(0, topK)
            .map(r => ({
                ...r,
                reranked: true,
                rerankScore: (r.score || 0) * (r.path === 'B' ? 1.2 : 1.0), // Semantic 层加权
            }));
    }

    // BM25 简化实现（无外部依赖）
    _bm25Score(query, text) {
        if (!text || !query) return 0;
        const qTerms = query.toLowerCase().split(/\s+/);
        const textLower = text.toLowerCase();
        const textWords = textLower.split(/\s+/);
        const textLen = textWords.length;
        if (textLen === 0) return 0;

        let score = 0;
        const avgLen = 50; // 假设平均长度
        const k1 = 1.5, b = 0.75;

        for (const term of qTerms) {
            const freq = (textLower.match(new RegExp(term, 'g')) || []).length;
            if (freq === 0) continue;
            // 简化的 IDF（假设文档数足够大）
            const idf = 1.0;
            score += idf * (freq * (k1 + 1)) / (freq + k1 * (1 - b + b * textLen / avgLen));
        }
        return Math.min(score, 1.0);
    }

    // ================================================================
    // v4.1: TaskGoalParser — CoT 任务分解检索
    // 参考: MemOS/src/memos/memories/textual/tree_text_memory/retrieve/searcher.py _cot_query()
    // ================================================================

    /**
     * 复杂查询分解 + 并行子查询检索
     * @param {string} query - 原始查询
     * @param {object} options - 传给 advancedSearch 的选项
     */
    async cotSearch(query, options = {}) {
        const subQueries = this._decomposeQuery(query);
        if (subQueries.length <= 1) {
            return this.advancedSearch(query, options);
        }
        // 并行检索所有子查询
        const results = await Promise.all(
            subQueries.map(sq => this.advancedSearch(sq.subQuery, { ...options, topK: 5 }))
        );
        // 合并去重
        return this._mergeSearchResults(results, query);
    }

    /** 启发式查询分解 */
    _decomposeQuery(query) {
        // 检测复合查询模式
        const separators = [
            /(?:并且|同时|而且|also|and|并且说|再问)/g,
            /[,，;；]/g,
        ];

        const sentences = query.split(new RegExp(separators.map(s => s.source).join('|'))).filter(s => s.trim());
        if (sentences.length <= 1) {
            return [{ subQuery: query.trim(), priority: 1, isMain: true }];
        }

        return sentences.map((s, i) => ({
            subQuery: s.trim(),
            priority: i === 0 ? 2 : 1, // 首句权重更高
            isMain: i === 0,
        }));
    }

    /** 合并多个子查询的检索结果 */
    _mergeSearchResults(resultArrays, originalQuery) {
        const map = new Map();
        for (const results of resultArrays) {
            for (const r of results) {
                const key = r.id || JSON.stringify(r.message || r);
                if (!map.has(key)) {
                    map.set(key, { ...r });
                } else {
                    // 累加分数
                    const existing = map.get(key);
                    existing.score = Math.max(existing.score || 0, r.score || 0) + (r.priority || 1) * 0.1;
                    existing.fromSubQueries = (existing.fromSubQueries || 1) + 1;
                }
            }
        }
        return [...map.values()]
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .slice(0, 10)
            .map(r => ({ ...r, merged: true }));
    }

    // ================================================================
    // v4.1: MemoryReorganizer — 后台图重组优化
    // 参考: MemOS/src/memos/memories/textual/tree_text_memory/organize/manager.py
    // ================================================================

    _initReorganizer() {
        this._reorganizer = new MemoryReorganizer(this);
    }

    /**
     * 触发图重组（防抖：5 分钟后执行）
     */
    triggerReorganize() {
        if (!this._reorganizer) return;
        clearTimeout(this._reorganizer._debounceTimer);
        this._reorganizer._debounceTimer = setTimeout(() => {
            this._reorganizer.run().catch(e =>
                console.warn('[MemoryReorganizer] reorganize failed:', e.message)
            );
        }, 5 * 60 * 1000);
    }

    getReorganizerStats() {
        return this._reorganizer?.getStats() || null;
    }


    // ================================================================
    // v4.1: ActivationMemory — 会话激活上下文缓存
    // 参考: MemOS/src/memos/memories/activation/kv.py (简化版)
    // ================================================================

    _initActivationMemory() {
        this.activationMemory = new ActivationMemory();
    }

    /**
     * 保存会话激活上下文（会话结束时调用）
     */
    saveActivation(sessionId) {
        if (!this.activationMemory) return;
        const recent = this.recent.slice(0, 10);
        if (recent.length === 0) return;
        const summary = this._summarizeSession(recent);
        this.activationMemory.save(sessionId, summary);
    }

    /**
     * 恢复会话激活上下文（会话开始时调用）
     */
    restoreActivation(sessionId) {
        if (!this.activationMemory) return null;
        return this.activationMemory.restore(sessionId);
    }

    /** 生成会话摘要 */
    _summarizeSession(messages) {
        return {
            intentCounts: messages.reduce((acc, m) => {
                acc[m.intent || 'unknown'] = (acc[m.intent || 'unknown'] || 0) + 1;
                return acc;
            }, {}),
            lastIntent: messages[0]?.intent || null,
            messageCount: messages.length,
            timestamp: Date.now(),
            keyTopics: this._extractKeyTopics(messages),
        };
    }

    _extractKeyTopics(messages) {
        const allText = messages.map(m => m.message || '').join(' ');
        const words = allText.toLowerCase().split(/\s+/).filter(w => w.length > 4);
        const freq = {};
        words.forEach(w => freq[w] = (freq[w] || 0) + 1);
        return Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([w]) => w);
    }
}


// ================================================================
// v4.1: MemoryReorganizer — 后台图重组器（独立类）
// 参考: MemOS/src/memos/memories/textual/tree_text_memory/organize/manager.py
// ================================================================

class MemoryReorganizer {
    constructor(memoryGraph) {
        this.mg = memoryGraph;
        this._debounceTimer = null;
        this.stats = { runs: 0, deduplications: 0, promotions: 0, errors: 0 };
    }

    /** 执行一轮图重组 */
    async run() {
        this.stats.runs++;
        try {
            await this._deduplicate();
            await this._promoteHot();
            await this._cleanupExpired();
            // review: removed // review: removed console.log('[MemoryReorganizer] reorganized:', JSON.stringify(this.stats));
        } catch (e) {
            this.stats.errors++;
            console.warn('[MemoryReorganizer] error:', e.message);
        }
    }

    /** 去重：找出语义相似度 > 0.85 的 Recent 条目，合并 */
    async _deduplicate() {
        const recent = this.mg.recent;
        if (recent.length < 2) return;

        const SIM_THRESHOLD = 0.85;
        const toRemove = new Set();

        for (let i = 0; i < recent.length; i++) {
            if (toRemove.has(i)) continue;
            for (let j = i + 1; j < recent.length; j++) {
                if (toRemove.has(j)) continue;
                const sim = this._semanticSimilarity(recent[i], recent[j]);
                if (sim > SIM_THRESHOLD) {
                    toRemove.add(j);
                    this.stats.deduplications++;
                }
            }
        }

        if (toRemove.size > 0) {
            this.mg.recent = recent.filter((_, i) => !toRemove.has(i));
            // review: removed // review: removed console.log(`[MemoryReorganizer] deduplicated: removed ${toRemove.size} duplicates`);
        }
    }

    /** 提升高频 Recent 条目到 Semantic */
    async _promoteHot() {
        const intentCounts = {};
        for (const m of this.mg.recent) {
            const key = m.intent;
            intentCounts[key] = (intentCounts[key] || 0) + 1;
        }
        const hotIntents = Object.entries(intentCounts)
            .filter(([, count]) => count >= 3)
            .map(([intent]) => intent);

        for (const intent of hotIntents) {
            const sample = this.mg.recent.find(m => m.intent === intent);
            if (sample) {
                this.mg._promoteToSemantic(sample);
                this.stats.promotions++;
            }
        }
    }

    /** 清理过期的层级化上下文 */
    async _cleanupExpired() {
        const now = Date.now();
        const TTL = this.mg.config?.contextTTL || 3600000;
        for (const level of Object.keys(this.mg.hierarchy || {})) {
            const ctx = this.mg.hierarchy[level];
            for (const key of Object.keys(ctx || {})) {
                if (ctx[key]?.timestamp && now - ctx[key].timestamp > TTL) {
                    delete ctx[key];
                }
            }
        }
    }

    _semanticSimilarity(a, b) {
        const textA = (a.message || '').toLowerCase();
        const textB = (b.message || '').toLowerCase();
        if (!textA || !textB) return 0;
        const wordsA = new Set(textA.split(/\s+/).filter(w => w.length > 2));
        const wordsB = new Set(textB.split(/\s+/).filter(w => w.length > 2));
        if (wordsA.size === 0 || wordsB.size === 0) return 0;
        const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
        const union = new Set([...wordsA, ...wordsB]).size;
        return union > 0 ? intersection / union : 0;
    }

    getStats() {
        return { ...this.stats, lastRun: this.stats.runs > 0 ? Date.now() : null };
    }
}


// ================================================================
// v4.1: ActivationMemory — 会话激活上下文缓存（独立类）
// 参考: MemOS/src/memos/memories/activation/kv.py (简化版)
// ================================================================

class ActivationMemory {
    constructor(options = {}) {
        this.maxSessions = options.maxSessions || 50;
        this.cache = new Map(); // sessionId → { context, timestamp }
        this.ttlMs = options.ttlMs || 30 * 60 * 1000; // 30 分钟
    }

    /** 保存激活上下文 */
    save(sessionId, context) {
        // LRU 淘汰
        if (this.cache.size >= this.maxSessions && !this.cache.has(sessionId)) {
            const oldest = [...this.cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
            if (oldest) this.cache.delete(oldest[0]);
        }
        this.cache.set(sessionId, { context, timestamp: Date.now() });
    }

    /** 恢复激活上下文（过期自动清除） */
    restore(sessionId) {
        const entry = this.cache.get(sessionId);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(sessionId);
            return null;
        }
        return entry.context;
    }

    /** 获取缓存统计 */
    getStats() {
        return {
            cached: this.cache.size,
            max: this.maxSessions,
            ttlSeconds: this.ttlMs / 1000,
        };
    }
}