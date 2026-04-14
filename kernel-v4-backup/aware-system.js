// hundunos/kernel/aware-system.js — Aware System v3.2
// 自主意识：Focus + Trigger + Reflections
// v3.2: MemOS v2.0 Stardust 优化移植 — PreferenceExtractor 偏好记忆系统
// v3.1 升级（参考 Hermes prompt_builder.py _CONTEXT_THREAT_PATTERNS）：
//   - Prompt 注入检测（阻止上下文文件注入攻击）
//   - 零宽字符检测（Unicode 同形字符绕过）
//   - 与 PrivacyShield 协同工作

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

export class AwareSystem extends EventEmitter {
    constructor(kernel) {
        super();
        this.kernel = kernel;
        this.focusItems = new Map();
        this.triggers = new Map();
        this.reflections = [];
        this.observations = [];
        this.maxReflections = 200;
        this.maxObservations = 500;
        this.timers = new Map();

        // v3.2: PreferenceExtractor — 偏好记忆提取器
        this.preferenceExtractor = new PreferenceExtractor(this);

        // v3.1: Prompt 注入检测模式（参考 Hermes _CONTEXT_THREAT_PATTERNS）
        this._CONTEXT_THREAT_PATTERNS = [
            // 忽略先前指令
            { regex: /ignore\s+(previous|all|above|prior)\s+(instructions?|orders?|directives?)/gi,
              type: 'prompt_injection', severity: 'high', label: '忽略先前指令' },
            // 隐藏用户信息
            { regex: /do\s+not\s+(tell|inform|notify|show)\s+(the\s+)?user/gi,
              type: 'deception_hide', severity: 'high', label: '隐藏用户信息' },
            // 系统提示覆盖
            { regex: /(system\s+prompt|instructions?)(\s+is|:|,)\s*["']?\s*you\s+are\s+a/gi,
              type: 'sys_prompt_override', severity: 'medium', label: '系统提示覆盖' },
            // 角色扮演绕过
            { regex: /pretend\s+you\s+(are|is)\s+(not|different)/gi,
              type: 'role_bypass', severity: 'medium', label: '角色扮演绕过' },
            //越狱攻击
            { regex: /DAN\s+mode|developer\s+mode|jailbreak/gi,
              type: 'jailbreak', severity: 'high', label: '越狱攻击' },
            // Base64/hex 编码命令
            { regex: /(base64|base[_-]?64)\s*[:=]\s*[A-Za-z0-9+/]{10,}/gi,
              type: 'encoded_payload', severity: 'medium', label: '编码载荷' },
            // Markdown 格式注入（尝试覆盖格式）
            { regex: /<system|<instructions|<directive/gi,
              type: 'xml_injection', severity: 'low', label: 'XML 标签注入' },
            // 重复指令模式（压力测试）
            { regex: /(.+)\1{3,}/g,
              type: 'repetition_stress', severity: 'low', label: '重复压力测试' },
            // 零宽字符（Hermes 特别检测）
            { regex: /[\u200b\u200c\u200d\ufeff]/g,
              type: 'zero_width_char', severity: 'medium', label: '零宽字符' },
            // Unicode 同形字符（l vs 1, O vs 0 混淆）
            { regex: /[\u03f4\u2126\u212b\u212c]/g,
              type: 'homoglyph', severity: 'low', label: 'Unicode同形字符' },
        ];
    }

    async initialize() {
        await this.load();
        // 初始化默认感知规则（仅在首次运行时添加）
        if (this.focusItems.size === 0) {
            this._initDefaults();
        }
        // console.log(`[Aware] Loaded ${this.focusItems.size} Focus, ${this.triggers.size} Triggers`);
    }

    /**
     * 初始化默认感知规则
     */
    _initDefaults() {
        // 默认触发器：定期感知检查
        this.createTrigger('interval', {
            interval: 300000,  // 每5分钟
            callback: (trigger) => {
                this.addReflection({
                    type: 'periodic_check',
                    reasoning: 'Scheduled perception check'
                });
            }
        });

        // 默认 Focus：系统健康关注
        this.createFocus('系统健康监控', {
            description: '持续关注系统运行状态',
            priority: 'normal',
            tags: ['system', 'health']
        });

        // 默认 Focus：任务执行关注
        this.createFocus('任务执行效率', {
            description: '关注当前任务的执行效率',
            priority: 'normal',
            tags: ['performance', 'tasks']
        });

        this.persist();
    }

    // ================================================================
    // v3.1: Prompt 注入检测（参考 Hermes prompt_builder.py）
    // ================================================================

    /**
     * 检测 Prompt 注入威胁
     * @returns {{ safe: boolean, threats: Array }}
     */
    checkInjection(text) {
        if (!text || typeof text !== 'string') return { safe: true, threats: [] };

        const threats = [];
        for (const pattern of this._CONTEXT_THREAT_PATTERNS) {
            // 重置 lastIndex（全局 flag 会污染）
            const re = new RegExp(pattern.regex.source, pattern.regex.flags);
            const matches = text.match(re);
            if (matches) {
                threats.push({
                    type: pattern.type,
                    label: pattern.label,
                    severity: pattern.severity,
                    count: matches.length,
                    samples: matches.slice(0, 3), // 最多3个样本
                });
            }
        }

        const safe = threats.length === 0;
        return { safe, threats, summary: safe ? 'Clean' : `${threats.length} threat(s) detected: ${threats.map(t => t.label).join(', ')}` };
    }

    /**
     * 集成注入检测到观察流程（Hermes 模式）
     */
    observe(message) {
        // 安全获取 content，确保为字符串类型
        let content = message.content ?? '';
        if (typeof content !== 'string') {
            content = typeof content === 'object' ? JSON.stringify(content) : String(content);
        }
        const injectionCheck = this.checkInjection(content);

        // 记录检测结果到 reflection
        if (!injectionCheck.safe) {
            this.addReflection({
                type: 'injection_detected',
                severity: injectionCheck.threats[0]?.severity,
                threats: injectionCheck.threats,
                reasoning: `检测到 ${injectionCheck.threats.length} 个注入威胁: ${injectionCheck.threats.map(t => t.label).join(', ')}`,
            });
            console.warn('[Aware/Injection]', injectionCheck.summary);
        }

        this.observations.push({
            timestamp: Date.now(),
            content: content.replace(/[\u200b\u200c\u200d\ufeff]/g, ''), // 自动净化零宽字符
            type: message.type,
            injectionSafe: injectionCheck.safe,
            injectionThreats: injectionCheck.threats.length,
        });
        if (this.observations.length > this.maxObservations) this.observations = this.observations.slice(-this.maxObservations);
    }

    learn(message, intent, result) {
        this.addReflection({
            type: 'learning',
            intent: intent?.name,
            success: result?.success,
            reasoning: result?.success ? `Success: ${intent?.name}` : `Failed: ${intent?.name}`
        });
    }

    // Focus Items
    createFocus(task, opts = {}) {
        const focus = {
            id: `focus_${randomUUID()}`,
            task, description: opts.description || task,
            status: 'pending',
            priority: opts.priority || 'normal',
            tags: opts.tags || [],
            triggers: [], parent: opts.parent || null, children: [],
            created: Date.now(), updated: Date.now(), started: null, completed: null
        };
        this.focusItems.set(focus.id, focus);
        this.addReflection({ type: 'focus_created', focusId: focus.id, reasoning: `Created: "${task}"` });
        this.persist();
        return focus;
    }

    startFocus(id) {
        const f = this.focusItems.get(id);
        if (!f) return null;
        f.status = 'in_progress'; f.started = Date.now(); f.updated = Date.now();
        this.persist(); return f;
    }

    completeFocus(id, result = null) {
        const f = this.focusItems.get(id);
        if (!f) return null;
        f.status = 'completed'; f.completed = Date.now(); f.updated = Date.now(); f.result = result;
        f.triggers.forEach(tid => this.cancelTrigger(tid));
        this.addReflection({ type: 'focus_completed', focusId: id, reasoning: `Completed: "${f.task}"` });
        this.persist(); return f;
    }

    cancelFocus(id, reason = '') {
        const f = this.focusItems.get(id);
        if (!f) return null;
        f.status = 'cancelled'; f.completed = Date.now(); f.updated = Date.now();
        f.triggers.forEach(tid => this.cancelTrigger(tid));
        this.addReflection({ type: 'focus_cancelled', focusId: id, reason, reasoning: `Cancelled: "${f.task}" — ${reason}` });
        this.persist(); return f;
    }

    getActiveFocuses() {
        return Array.from(this.focusItems.values())
            .filter(f => f.status !== 'completed' && f.status !== 'cancelled')
            .sort((a, b) => {
                const order = { urgent: 0, high: 1, normal: 2, low: 3 };
                return (order[a.priority] || 2) - (order[b.priority] || 2);
            });
    }

    // Triggers
    createTrigger(type, config, focusId = null) {
        const trigger = {
            id: `trigger_${randomUUID()}`,
            type, config, status: 'active', focusRef: focusId,
            fireCount: 0, lastFired: null, lastError: null,
            created: Date.now(), enabled: true, callback: config.callback || null
        };
        this.triggers.set(trigger.id, trigger);
        if (focusId) {
            const focus = this.focusItems.get(focusId);
            if (focus) focus.triggers.push(trigger.id);
        }
        this._registerTrigger(trigger);
        this.persist();
        return trigger;
    }

    _registerTrigger(t) {
        switch (t.type) {
            case 'once': {
                const delay = (t.config.at || Date.now()) - Date.now();
                if (delay > 0) {
                    const tid = setTimeout(() => this._fireTrigger(t), delay);
                    this.timers.set(t.id, tid);
                }
                break;
            }
            case 'interval': {
                const tid = setInterval(() => {
                    if (t.enabled && t.status === 'active') this._fireTrigger(t);
                }, t.config.interval || 60000);
                this.timers.set(t.id, tid);
                break;
            }
            case 'cron': {
                // cron 简化为每分钟检查一次
                const tid = setInterval(() => {
                    if (!t.enabled || t.status !== 'active') return;
                    this._fireTrigger(t);
                }, 60000);
                this.timers.set(t.id, tid);
                break;
            }
        }
    }

    _fireTrigger(t) {
        if (!t.enabled || t.status !== 'active') return;
        t.fireCount++; t.lastFired = Date.now();
        this.addReflection({ type: 'trigger_fired', triggerId: t.id, reasoning: `Fired: ${t.type}` });
        if (t.focusRef) {
            const focus = this.focusItems.get(t.focusRef);
            if (focus && focus.status === 'pending') this.startFocus(focus.id);
        }
        if (t.callback) { try { t.callback(t); } catch (e) { t.lastError = e.message; } }
        this.kernel.emit('trigger:fired', { trigger: t });
        this.persist();
    }

    cancelTrigger(id, reason = '') {
        const t = this.triggers.get(id);
        if (!t) return;
        t.status = 'cancelled'; t.enabled = false;
        const timer = this.timers.get(id);
        if (timer) { clearTimeout(timer); clearInterval(timer); this.timers.delete(id); }
        this.addReflection({ type: 'trigger_cancelled', triggerId: id, reason, reasoning: `Cancelled: ${reason}` });
        this.persist();
    }

    addReflection(r) {
        this.reflections.push({ ...r, timestamp: Date.now() });
        if (this.reflections.length > this.maxReflections) this.reflections = this.reflections.slice(-this.maxReflections);
    }

    async createSessionContext(sessionId) {
        return { sessionId, activeFocuses: [], recentReflections: this.reflections.slice(-10) };
    }

    async persist() {
        try {
            await this.kernel.storage.put('aware', {
                focusItems: Array.from(this.focusItems.entries()),
                triggers: Array.from(this.triggers.entries()),
                reflections: this.reflections.slice(-100)
            });
        } catch {}
    }

    async load() {
        try {
            const data = await this.kernel.storage.get('aware');
            if (data) {
                this.focusItems = new Map(data.focusItems || []);
                this.triggers = new Map(data.triggers || []);
                this.reflections = data.reflections || [];
                for (const [, t] of this.triggers) {
                    if (t.status === 'active') this._registerTrigger(t);
                }
            }
        } catch {}
    }

    getSummary() {
        return {
            activeFocuses: this.getActiveFocuses().length,
            activeTriggers: Array.from(this.triggers.values()).filter(t => t.status === 'active').length,
            reflectionsCount: this.reflections.length
        };
    }

    async shutdown() {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
            clearInterval(timer);
        }
        this.timers.clear();
        await this.persist();
    }

    getStats() { return this.getSummary(); }

    // ================================================================
    // v3.2: PreferenceExtractor — MemOS PreferenceMemory 移植
    // 参考: MemOS/src/memos/memories/textual/tree_text_memory/specialized/preference_memory.py
    // ================================================================

    /**
     * 从对话历史中提取用户偏好
     * @param {Array} messages - 对话消息数组
     * @param {string} userId - 用户 ID
     */
    extractPreference(messages, userId) {
        return this.preferenceExtractor.extract(messages, userId);
    }

    /**
     * 获取偏好以供 Context 注入
     * @param {string} userId - 用户 ID
     * @param {string} query - 当前查询
     */
    getPreferenceContext(userId, query) {
        return this.preferenceExtractor.getForContext(userId, query);
    }
}


// ================================================================
// v3.2: PreferenceExtractor — 独立偏好提取器类
// ================================================================

class PreferenceExtractor {
    constructor(awareSystem) {
        this.aware = awareSystem;
        // userId → PreferenceSet
        this.preferences = new Map();
        // 提取器配置
        this.config = {
            minMessagesForExtract: 5,
            maxPreferencesPerUser: 30,
            decayFactor: 0.95,       // 时间衰减
            confidenceThreshold: 0.3,
        };
    }

    /**
     * 从消息历史中提取偏好
     * @param {Array} messages - 消息数组（{ content, role, timestamp }）
     * @param {string} userId - 用户 ID
     */
    extract(messages, userId) {
        if (!messages || messages.length < this.config.minMessagesForExtract) return null;
        const prefs = this.preferences.get(userId) || new PreferenceSet();

        // 1. 通信风格偏好
        this._extractStylePreference(messages, prefs);

        // 2. 时间模式偏好
        this._extractTimePreferences(messages, prefs);

        // 3. 主题兴趣偏好（关键词频率）
        this._extractTopicPreferences(messages, prefs);

        // 4. 工具使用偏好
        this._extractToolPreferences(messages, prefs);

        // 5. 响应长度偏好
        this._extractLengthPreference(messages, prefs);

        // 更新新鲜度
        prefs.updatedAt = Date.now();
        this.preferences.set(userId, prefs);

        return prefs.getAll();
    }

    /** 获取与当前 context 相关的偏好 */
    getRelevant(userId, query) {
        const prefs = this.preferences.get(userId);
        if (!prefs) return [];
        const q = (query || '').toLowerCase();
        const all = prefs.getAll();
        return all.filter(p =>
            // 关键词匹配
            (p.key || '').toLowerCase().includes(q) ||
            (p.value || '').toLowerCase().includes(q) ||
            // 高置信度偏好无条件通过
            p.confidence > 0.8
        ).slice(0, 10);
    }

    /** 获取完整偏好（用于 Context 注入） */
    getForContext(userId, query) {
        const relevant = this.getRelevant(userId, query);
        if (relevant.length === 0) return null;
        return {
            userId,
            query,
            preferences: relevant,
            summary: this._summarizePrefs(relevant),
            timestamp: Date.now(),
        };
    }

    _extractStylePreference(messages, prefs) {
        const texts = messages.map(m => m.content || '');
        const avgLen = texts.reduce((s, t) => s + t.length, 0) / texts.length;
        const hasEmoji = texts.some(t => /[\u{1F300}-\u{1F9FF}]/u.test(t));
        const hasQuestions = texts.some(t => /[?？]/.test(t));
        const allLower = texts.every(t => t === t.toLowerCase());

        if (avgLen > 300) {
            prefs.set('style', 'verbose', { confidence: Math.min(avgLen / 500, 1) });
        } else if (avgLen < 80) {
            prefs.set('style', 'terse', { confidence: Math.min(80 / avgLen, 1) });
        } else {
            prefs.set('style', 'balanced', { confidence: 0.6 });
        }
        if (hasEmoji) prefs.set('style.emoji', true, { confidence: 0.7 });
        if (hasQuestions) prefs.set('style.questions', true, { confidence: 0.5 });
        if (allLower) prefs.set('style.casual', true, { confidence: 0.4 });
    }

    _extractTimePreferences(messages, prefs) {
        const timestamps = messages.map(m => m.timestamp).filter(Boolean);
        if (timestamps.length === 0) return;

        const hours = timestamps.map(t => new Date(t).getHours());
        const avgHour = hours.reduce((s, h) => s + h, 0) / hours.length;

        if (avgHour >= 6 && avgHour < 12) prefs.set('time.active', 'morning', { confidence: 0.6 });
        else if (avgHour >= 12 && avgHour < 18) prefs.set('time.active', 'afternoon', { confidence: 0.6 });
        else if (avgHour >= 18 && avgHour < 22) prefs.set('time.active', 'evening', { confidence: 0.6 });
        else prefs.set('time.active', 'night', { confidence: 0.6 });

        // 工作日 vs 周末
        const weekdayCount = timestamps.filter(t => {
            const d = new Date(t).getDay();
            return d >= 1 && d <= 5;
        }).length;
        const weekdayRatio = weekdayCount / timestamps.length;
        if (weekdayRatio > 0.7) prefs.set('time.pattern', 'workday', { confidence: 0.5 });
        else if (weekdayRatio < 0.3) prefs.set('time.pattern', 'weekend', { confidence: 0.5 });
    }

    _extractTopicPreferences(messages, prefs) {
        const STOPWORDS = new Set([
            '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到',
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'and', 'in', 'that', 'it', 'for', 'on', 'with',
        ]);

        const allText = messages.map(m => m.content || '').join(' ');
        const words = allText.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !STOPWORDS.has(w));
        const freq = {};
        words.forEach(w => freq[w] = (freq[w] || 0) + 1);

        const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
        const topTopics = sorted.slice(0, 10).map(([w]) => w);

        prefs.set('topics.top', topTopics.join(','), { confidence: 0.6 });
        prefs.set('topics.count', topTopics.length, { confidence: 0.3 });

        // 分类兴趣（关键词映射）
        const categories = {
            '技术': ['python', 'javascript', 'code', 'api', 'function', 'algorithm', 'bug', '编程', '代码', '开发'],
            '产品': ['feature', 'design', 'ui', 'ux', 'product', '用户', '产品', '界面', '设计'],
            '商业': ['business', 'revenue', 'customer', 'market', '商业', '客户', '市场', '增长'],
            '创意': ['creative', 'story', 'idea', 'design', '创意', '故事', '想法'],
        };
        for (const [cat, keywords] of Object.entries(categories)) {
            const match = topTopics.filter(t => keywords.some(k => t.includes(k)));
            if (match.length >= 2) {
                prefs.set(`topics.${cat}`, match.slice(0, 5).join(','), { confidence: 0.5 });
            }
        }
    }

    _extractToolPreferences(messages, prefs) {
        // 从消息中检测工具使用模式
        const toolMentions = messages
            .map(m => m.content || '')
            .join(' ')
            .match(/(?:使用|call|invoke|run)\s+[\w]+(?:工具|tool)?/gi) || [];
        if (toolMentions.length > 0) {
            prefs.set('tools.frequency', toolMentions.length, { confidence: 0.5 });
        }
    }

    _extractLengthPreference(messages, prefs) {
        const userMsgs = messages.filter(m => (m.role || '').toLowerCase() === 'user');
        if (userMsgs.length === 0) return;

        const avgLen = userMsgs.reduce((s, m) => s + (m.content || '').length, 0) / userMsgs.length;
        if (avgLen > 200) prefs.set('response.expectedLength', 'long', { confidence: 0.6 });
        else if (avgLen < 50) prefs.set('response.expectedLength', 'short', { confidence: 0.6 });
        else prefs.set('response.expectedLength', 'medium', { confidence: 0.5 });
    }

    _summarizePrefs(prefs) {
        const highConf = prefs.filter(p => (p.confidence || 0) > 0.6);
        return highConf.map(p => `${p.key}=${p.value}`).join('; ');
    }

    getStats(userId) {
        const prefs = this.preferences.get(userId);
        return {
            count: prefs ? prefs.size() : 0,
            categories: prefs ? [...new Set(prefs.getAll().map(p => p.key.split('.')[0]))].length : 0,
            lastUpdated: prefs?.updatedAt || null,
        };
    }
}


// ================================================================
// v3.2: PreferenceSet — 单用户偏好集合
// ================================================================

class PreferenceSet {
    constructor() {
        this._data = new Map(); // key → { value, confidence, updatedAt }
        this.updatedAt = null;
    }

    set(key, value, meta = {}) {
        this._data.set(key, {
            value,
            confidence: meta.confidence || 0.5,
            updatedAt: Date.now(),
        });
    }

    get(key) {
        return this._data.get(key)?.value;
    }

    getWithMeta(key) {
        return this._data.get(key);
    }

    getAll() {
        return [...this._data.entries()].map(([key, meta]) => ({ key, ...meta }));
    }

    size() {
        return this._data.size;
    }
}
