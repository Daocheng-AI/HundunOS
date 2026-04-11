// hundunos/kernel/intent-engine.js — HundunOS Intent Engine v4.0
// 意图解析：从用户输入提取结构化意图
// 支持热插拔：内置意图 + config/intents/*.json 外部意图
// v4.0: 集成 IntentVectorCache — 压缩域汉明相似度加速路由

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { IntentVectorCache } from './intent-vector-cache.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class IntentEngine {
    constructor(kernel) {
        this.kernel = kernel;
        this.classifiers = [];
        this.intentMap = new Map();
        // v4.0: Intent 向量缓存（压缩域汉明相似度加速）
        this.vectorCache = null;
        // 意图配置文件目录（支持热插拔）
        this.intentsDir = this._resolveIntentsDir();
        this._initIntentPatterns();
    }

    _resolveIntentsDir() {
        // 默认：项目根目录/config/intents/
        const projectRoot = this.kernel?.config?.projectRoot || join(__dirname, '..');
        const configDir = join(projectRoot, 'config', 'intents');
        return configDir;
    }

    async initialize() {
        // 加载内置意图（已通过 _initIntentPatterns 加载）
        // review: removed // review: removed console.log('[IntentEngine] Built-in classifiers:', this.classifiers.length);

        // 热插拔：加载外部意图
        await this._loadExternalIntents();

        // review: removed // review: removed console.log('[IntentEngine] Total classifiers:', this.classifiers.length);

        // v4.0: 初始化 IntentVectorCache（预量化所有意图 embedding）
        try {
            this.vectorCache = new IntentVectorCache(this.kernel);
            // 使用正确的 API: initialize() 而非 preload()
            await this.vectorCache.initialize();
            // review: removed // review: removed console.log(
                `[IntentEngine] IntentVectorCache enabled: ${this.vectorCache.indexSize()} intent nodes`
            );
        } catch (e) {
            console.warn('[IntentEngine] IntentVectorCache init failed:', e.message);
        }
    }

    async _loadExternalIntents() {
        // 从 config/intents/ 目录热加载意图定义
        if (!existsSync(this.intentsDir)) {
            // review: removed // review: removed console.log('[IntentEngine] No external intents dir:', this.intentsDir);
            return;
        }

        let files;
        try {
            files = readdirSync(this.intentsDir).filter(f => f.endsWith('.json'));
        } catch {
            console.warn('[IntentEngine] Cannot read intents dir:', this.intentsDir);
            return;
        }

        for (const file of files) {
            try {
                const filePath = join(this.intentsDir, file);
                const raw = readFileSync(filePath, 'utf8');
                const intentDefs = JSON.parse(raw);

                const defs = Array.isArray(intentDefs) ? intentDefs : [intentDefs];
                let loaded = 0;

                for (const def of defs) {
                    if (!def.name || !def.type || !def.action) {
                        console.warn(`[IntentEngine] Invalid intent def in ${file}:`, def.name || 'missing name');
                        continue;
                    }
                    // 检查是否已存在同名意图（内置优先）
                    if (this.classifiers.find(c => c.name === def.name)) {
                        console.warn(`[IntentEngine] Skipping duplicate intent '${def.name}' from ${file} (already exists)`);
                        continue;
                    }

                    // 构造分类器
                    const patterns = Array.isArray(def.patterns)
                        ? def.patterns.map(p => new RegExp(p, def.caseInsensitive !== false ? 'i' : ''))
                        : [];

                    const classifier = {
                        name: String(def.name),
                        _external: true,
                        type: String(def.type),
                        action: String(def.action),
                        description: String(def.description || ''),
                        priority: Number(def.priority || 0),
                        patterns,
                        extract: typeof def.extract === 'function' ? def.extract : () => ({})
                    };

                    // 插入到分类器列表（高优先级排前面）
                    const insertIdx = this.classifiers.findIndex(c => (c.priority || 0) < classifier.priority);
                    if (insertIdx === -1) {
                        this.classifiers.push(classifier);
                    } else {
                        this.classifiers.splice(insertIdx, 0, classifier);
                    }
                    loaded++;
                }

                if (loaded > 0) {
                    // review: removed // review: removed console.log(`[IntentEngine] Loaded ${loaded} external intent(s) from ${file}`);
                }
            } catch (e) {
                console.warn(`[IntentEngine] Failed to load intent file ${file}:`, e.message);
            }
        }
    }

    /** 运行时热注册意图（无需重启） */
    register(classifier) {
        // 确保 patterns 是正则数组
        if (Array.isArray(classifier.patterns)) {
            classifier.patterns = classifier.patterns.map(p =>
                typeof p === 'string' ? new RegExp(p, 'i') : p
            );
        }
        // 确保 extract 是函数
        if (!classifier.extract || typeof classifier.extract !== 'function') {
            classifier.extract = () => ({});
        }
        // 检查重复
        if (this.classifiers.find(c => c.name === classifier.name)) {
            console.warn(`[IntentEngine] register: '${classifier.name}' already exists, skipping`);
            return false;
        }
        this.classifiers.unshift(classifier);

        // v4.0: 同步到向量缓存
        if (this.vectorCache && typeof this.vectorCache.preload === 'function') {
            this.vectorCache.preload({ classifiers: this.classifiers }).catch(() => {});
        }
        return true;
    }

    /** 运行时卸载意图（无需重启） */
    unregister(name) {
        const idx = this.classifiers.findIndex(c => c.name === name);
        if (idx === -1) return false;
        this.classifiers.splice(idx, 1);
        // review: removed // review: removed console.log(`[IntentEngine] Unregistered intent: ${name}`);

        // v4.0: 同步向量缓存
        if (this.vectorCache) {
            this.vectorCache.registerIntent({ name }); // 注销时更新缓存
        }
        return true;
    }

    /** 重载外部意图文件（热更新） */
    async reload() {
        // 保留内置（_builtin=true）和手动注册的（_external 未标记）
        const before = this.classifiers.length;
        this.classifiers = this.classifiers.filter(c => c._builtin || !c._external);
        // review: removed // review: removed console.log(`[IntentEngine] Cleared external intents (${before} -> ${this.classifiers.length})`);
        await this._loadExternalIntents();
        // review: removed // review: removed console.log(`[IntentEngine] Reload complete. Total classifiers: ${this.classifiers.length}`);

        // v4.0: 重建向量缓存
        if (this.vectorCache) {
            await this.vectorCache.initialize();
            // review: removed // review: removed console.log(`[IntentEngine] IntentVectorCache reloaded`);
        }
    }

    /**
     * v4.0: 获取意图引擎统计（含向量缓存信息）
     */
    getStats() {
        return {
            totalClassifiers: this.classifiers.length,
            vectorCache: this.vectorCache ? this.vectorCache.getStats() : null,
        };
    }

    _initIntentPatterns() {
        // 意图分类规则
        this.classifiers = [
            // === 系统类 ===
            {
                name: 'kernel_upgrade',
                _builtin: true,
                type: 'system', action: 'kernel_upgrade',
                _builtin: true,
                patterns: [
                    /升级kernel|更新kernel|kernel升级|kernel更新/i,
                    /upgrade kernel|update kernel/i
                ],
                extract: (m) => ({ newSource: m.metadata?.source || 'unknown' })
            },
            {
                name: 'system_status',
                _builtin: true,
                type: 'system', action: 'status',
                patterns: [
                    /系统状态|运行状态|查看状态/i,
                    /status|system status/i
                ],
                extract: () => ({})
            },
            {
                name: 'system_shutdown',
                _builtin: true,
                type: 'system', action: 'shutdown',
                patterns: [
                    /关机|关闭系统|停止运行/i,
                    /shutdown|turn off/i
                ],
                extract: () => ({})
            },
            {
                name: 'system_restart',
                _builtin: true,
                type: 'system', action: 'restart',
                patterns: [
                    /重启|重新启动|restart/i
                ],
                extract: () => ({})
            },

            // === 文件类 ===
            {
                name: 'file_read',
                _builtin: true,
                type: 'file', action: 'read',
                patterns: [
                    /读取|读文件|打开文件|查看文件|文件内容/i,
                    /read file|open file|cat file/i
                ],
                extract: (m) => ({ target: this._extractPath(m.content) })
            },
            {
                name: 'file_write',
                _builtin: true,
                type: 'file', action: 'write',
                patterns: [
                    /写文件|创建文件|新建文件|保存文件/i,
                    /write file|create file|new file/i
                ],
                extract: (m) => ({ target: this._extractPath(m.content) })
            },
            {
                name: 'file_delete',
                _builtin: true,
                type: 'file', action: 'delete',
                patterns: [
                    /删除文件|移除文件|删掉/i,
                    /delete file|remove file/i
                ],
                extract: (m) => ({ target: this._extractPath(m.content) })
            },
            {
                name: 'file_search',
                _builtin: true,
                type: 'file', action: 'search',
                patterns: [
                    /搜索文件|找文件|文件搜索/i,
                    /search file|find file|everything/i
                ],
                extract: (m) => ({ query: this._extractQuery(m.content) })
            },

            // === 代码类 ===
            {
                name: 'code_generate',
                _builtin: true,
                type: 'code', action: 'generate',
                patterns: [
                    /写代码|生成代码|帮我写|编写|实现|写一个/i,
                    /write code|generate code|implement|write a/i
                ],
                extract: (m) => ({
                    language: this._extractLanguage(m.content),
                    description: m.content
                })
            },
            {
                name: 'code_review',
                _builtin: true,
                type: 'code', action: 'review',
                patterns: [
                    /审查|review|检查代码|代码审查/i,
                    /check code|audit code/i
                ],
                extract: (m) => ({ focus: this._extractReviewFocus(m.content) })
            },
            {
                name: 'code_debug',
                _builtin: true,
                type: 'code', action: 'debug',
                patterns: [
                    /调试|debug|报错|错误|异常|修复/i,
                    /fix error|bug|exception/i
                ],
                extract: (m) => ({ error: this._extractError(m.content) })
            },
            {
                name: 'code_refactor',
                _builtin: true,
                type: 'code', action: 'refactor',
                patterns: [
                    /重构|优化|简化/i,
                    /refactor|optimize|simplify/i
                ],
                extract: (m) => ({ instructions: m.content })
            },
            {
                name: 'test_generate',
                _builtin: true,
                type: 'code', action: 'generate_test',
                patterns: [
                    /写测试|生成测试|单元测试/i,
                    /write test|unit test|test case/i
                ],
                extract: (m) => ({ framework: 'pytest' })
            },

            // === 分析类 ===
            {
                name: 'text_summary',
                _builtin: true,
                type: 'analysis', action: 'summarize',
                patterns: [
                    /总结|摘要|概括|归纳/i,
                    /summarize|summary|abstract/i
                ],
                extract: (m) => ({ length: 'medium' })
            },
            {
                name: 'text_translate',
                _builtin: true,
                type: 'analysis', action: 'translate',
                patterns: [
                    /翻译/i,
                    /translate/i
                ],
                extract: (m) => ({
                    targetLang: this._extractLanguage(m.content) || 'en'
                })
            },
            {
                name: 'code_analyze',
                _builtin: true,
                type: 'code', action: 'analyze',
                patterns: [
                    /分析.*代码|代码.*分析|分析一下/i,
                    /analyze.*code|code.*analysis/i
                ],
                extract: (m) => ({})
            },
            {
                name: 'data_analysis',
                _builtin: true,
                type: 'analysis', action: 'analyze',
                patterns: [
                    /分析|统计|数据处理/i,
                    /analyze|analysis|statistics/i
                ],
                extract: (m) => ({})
            },
            {
                name: 'data_report',
                _builtin: true,
                type: 'analysis', action: 'report',
                patterns: [
                    /生成报告|报表|报告/i,
                    /report|generate report/i
                ],
                extract: (m) => ({ format: 'json' })
            },

            // === 研究类（Phase B: B3）===
            {
                name: 'autoresearch',
                _builtin: true,
                type: 'research', action: 'autocode',
                priority: 90,
                patterns: [
                    /自主研究|autoresearch|研究一下|调查一下/i,
                    /how does|how is|what is the|explain.*working/i,
                    /find out how|understand.*codebase/i,
                    /分析.*代码|代码.*分析|研究.*代码/i,
                ],
                extract: (m) => ({ query: m.content, scope: 'codebase' })
            },

            // === 搜索类 ===
            {
                name: 'web_search',
                _builtin: true,
                type: 'search', action: 'web',
                patterns: [
                    /搜索|查找|网上|搜一下|查一下/i,
                    /search the web|look up|find out/i
                ],
                extract: (m) => ({ query: this._extractQuery(m.content) })
            },
            {
                name: 'knowledge_query',
                _builtin: true,
                type: 'search', action: 'knowledge',
                patterns: [
                    /什么是|怎么|如何|原理|解释/i,
                    /what is|how to|what are|explain/i
                ],
                extract: (m) => ({ query: m.content })
            },

            // === 任务类 ===
            {
                name: 'task_create',
                _builtin: true,
                type: 'task', action: 'create',
                patterns: [
                    /创建任务|新建任务|添加任务|安排|记住|记一下/i,
                    /create task|new task|add task|remember/i
                ],
                extract: (m) => ({ task: m.content })
            },
            {
                name: 'task_query',
                _builtin: true,
                type: 'task', action: 'query',
                patterns: [
                    /查看任务|任务列表|我的任务/i,
                    /list tasks|task list/i
                ],
                extract: (m) => ({})
            },

            // === 提醒类 ===
            {
                name: 'reminder_set',
                _builtin: true,
                type: 'reminder', action: 'remind',
                patterns: [
                    /提醒我|设置提醒|定时|稍后|以后/i,
                    /remind me|set reminder|notify/i
                ],
                extract: (m) => ({ time: this._extractTime(m.content), content: m.content })
            },
            {
                name: 'weather_query',
                _builtin: true,
                type: 'info', action: 'weather',
                patterns: [
                    /天气|气象/i,
                    /weather/i
                ],
                extract: (m) => ({ location: this._extractLocation(m.content) })
            },

            // === 自动化类 ===
            {
                name: 'automation_setup',
                _builtin: true,
                type: 'automation', action: 'setup',
                patterns: [
                    /设置自动化|自动执行|定时任务|cron/i,
                    /set up automation|schedule|automate/i
                ],
                extract: (m) => ({ schedule: this._extractSchedule(m.content) })
            },
            {
                name: 'aware_focus',
                _builtin: true,
                type: 'aware', action: 'track',
                patterns: [
                    /追踪|关注|持续跟踪/i,
                    /track|follow|monitor/i
                ],
                extract: (m) => ({ focus: this._extractQuery(m.content) })
            },

            // === 权限/安全类 ===
            {
                name: 'permission_query',
                _builtin: true,
                type: 'permission', action: 'permission',
                patterns: [
                    /权限|需要权限|有权限吗|权限检查/i,
                    /permission|need permission|have permission/i
                ],
                extract: (m) => ({})
            },
            {
                name: 'permission_approve',
                _builtin: true,
                type: 'permission', action: 'approve',
                patterns: [
                    /批准|允许|授权|同意/i,
                    /approve|allow|grant/i
                ],
                extract: (m) => ({ approved: true })
            },
            {
                name: 'permission_deny',
                _builtin: true,
                type: 'permission', action: 'deny',
                patterns: [
                    /拒绝|不允许|取消/i,
                    /deny|reject|cancel/i
                ],
                extract: (m) => ({ approved: false })
            },

            // === 默认 ===
            {
                name: 'general_chat',
                _builtin: true,
                type: 'chat', action: 'respond',
                patterns: [],
                extract: (m) => ({})
            }
        ];
    }

    // ================================================================
    // parse() — 主解析方法
    // ================================================================
    async parse(message, session) {
        const content = message.content || '';

        // 1. 按优先级匹配
        let bestMatch = null;
        let bestScore = 0;

        for (const clf of this.classifiers) {
            if (!clf.patterns || clf.patterns.length === 0) continue;

            for (const pattern of clf.patterns) {
                if (pattern.test(content)) {
                    const score = this._calcScore(clf, content, pattern);
                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = clf;
                    }
                }
            }
        }

        // 2. 无匹配 → 默认闲聊
        if (!bestMatch) {
            bestMatch = { name: 'unknown', type: 'unknown', action: 'unknown', extract: () => ({}), patterns: [] };
        }

        // 3. 提取参数
        const params = bestMatch.extract(message) || {};

        // 4. 计算置信度（无匹配时给默认置信度）
        let confidence;
        if (bestScore > 0) {
            confidence = Math.min(1, bestScore / 100);
        } else {
            // 无匹配时，给默认置信度 0.5，避免完全无法区分
            confidence = 0.5;
        }

        const intent = {
            name: bestMatch.name,
            type: bestMatch.type,
            action: bestMatch.action,
            raw: message,
            content,
            // description 保留原始内容（包括 Unicode），而非截断版本
            description: content,
            confidence,
            parameters: params,
            sessionId: session?.id || 'default',
            timestamp: Date.now()
        };

        return intent;
    }

    // ================================================================
    // 辅助提取方法
    // ================================================================
    _calcScore(clf, content, pattern) {
        let score = 70; // 基础分
        // 关键词密度
        const matchLen = (content.match(pattern) || [''])[0].length;
        score += Math.min(30, matchLen * 2);
        // 位置权重（开头匹配权重更高）
        if (pattern.test(content.slice(0, 20))) score += 10;
        return score;
    }

    _extractPath(content) {
        const patterns = [
            /[A-Za-z]:\\[^\s<>"|?*]+/g,   // Windows: C:\path
            /\/[^\s<>"|?*]+/g,            // Unix: /path
            /"([^"]+)"/g,                  // 引号内: "path"
            /'([^']+)'/g,                  // 单引号: 'path'
        ];
        for (const p of patterns) {
            const m = content.match(p);
            if (m) return m[0].replace(/["']/g, '');
        }
        return '';
    }

    _extractQuery(content) {
        // 支持 query: 前缀
        const match = content.match(/query:\s*(.+)/i);
        if (match) return match[1].trim().slice(0, 200);

        const cleaned = content
            .replace(/搜索|找|查找|搜一下|查一下|search|find/gi, '')
            .trim();
        return cleaned.slice(0, 200);
    }

    _extractPaths(content) {
        const matches = content.match(/path:([^\s,]+)/gi) || [];
        return matches.map(m => m.replace(/^path:/i, ''));
    }

    _extractLanguage(content) {
        const langs = [
            ['python', /python|py/], ['javascript', /javascript|js|node/],
            ['typescript', /typescript|ts/], ['java', /java/],
            ['go', /golang|go /], ['rust', /rust|rs/],
            ['c++', /c\+\+|cpp/], ['c#', /c#/],
            ['shell', /bash|shell|sh|ps1|powershell/],
            ['json', /json/], ['html', /html/], ['css', /css/],
            ['sql', /sql/], ['markdown', /markdown|md/]
        ];
        for (const [lang, p] of langs) {
            if (p.test(content)) return lang;
        }
        return null;
    }

    _extractReviewFocus(content) {
        if (/安全|security/i.test(content)) return 'security';
        if (/性能|performance/i.test(content)) return 'performance';
        if (/风格|style/i.test(content)) return 'style';
        if (/bug|错误/i.test(content)) return 'bugs';
        return 'general';
    }

    _extractError(content) {
        const match = content.match(/(Error|Exception|报错|错误|exception)[:\s]*(.+)/i);
        return match ? match[2].trim() : content;
    }

    _extractLocation(content) {
        const match = content.match(/(?:在|of|at)?\s*([\u4e00-\u9fa5a-zA-Z\s]{2,20}?(?:北京|上海|天气|城市))/);
        return match ? match[1].trim() : 'current';
    }

    _extractTime(content) {
        const now = new Date();

        // 相对时间：X分钟/小时后
        const relMatch = content.match(/(\d+)\s*(分钟|小时|分钟后|小时后)/);
        if (relMatch) {
            const val = parseInt(relMatch[1]);
            if (relMatch[2].startsWith('分')) now.setMinutes(now.getMinutes() + val);
            else now.setHours(now.getHours() + val);
            return now.toISOString();
        }

        // 中文时间：明天上午九点、后天下午三点
        const dayMap = { '今天': 0, '明天': 1, '后天': 2 };
        const hourMap = { '零点': 0, '一点': 1, '两点': 2, '三点': 3, '四点': 4, '五点': 5, '六点': 6, '七点': 7, '八点': 8, '九点': 9, '十点': 10, '十一点': 11, '十二点': 12 };

        for (const [day, offset] of Object.entries(dayMap)) {
            if (content.includes(day)) {
                now.setDate(now.getDate() + offset);
                // 检查上午/下午
                const isPm = /下午|晚上|晚间/.test(content);
                // 检查具体时间
                for (const [time, hour] of Object.entries(hourMap)) {
                    if (content.includes(time)) {
                        now.setHours(isPm ? hour + 12 : hour, 0, 0, 0);
                        return now.toISOString();
                    }
                }
                // 没有具体时间，返回日期
                return now.toISOString().slice(0, 10);
            }
        }

        return null;
    }

    _extractSchedule(content) {
        if (/每天/.test(content)) return '0 9 * * *';
        if (/每周/.test(content)) return '0 9 * * 1';
        if (/每小时/.test(content)) return '0 * * * *';
        return null;
    }

    // ================================================================
    // autoresearch — 自主研究命令（Phase B: B3）
    // 借鉴 OMX omx autoresearch 端到端代码库研究工作流
    // 工作流：探索 → 分析 → 合成 → 报告
    // ================================================================

    /**
     * 执行自主研究
     *
     * @param {string} question - 研究问题
     * @param {Object} options  - 配置选项
     * @returns {Promise<ResearchReport>}
     *
     * 使用示例：
     *   const report = await kernel.intentEngine.autoresearch(
     *     'how does the auth middleware work?',
     *     { depth: 'deep', scope: 'codebase' }
     *   );
     */
    async autoresearch(question, options = {}) {
        const {
            depth = 'medium',      // 'shallow' | 'medium' | 'deep'
            scope = 'codebase',    // 'codebase' | 'docs' | 'all'
            maxFiles = 20,         // 最多探索文件数
            maxIterations = 5,    // 最多分析轮次
            saveToMemory = true,  // 是否存入记忆系统
        } = options;

        const startTime = Date.now();
        const id = `research-${Date.now()}`;

        // 广播开始事件
        this._emit('research:start', { id, question, depth });

        try {
            // ── 阶段 1：探索（Exploration）───────────────────────────────────
            const exploration = await this._researchExplore(question, maxFiles);

            // ── 阶段 2：分析（Analysis）──────────────────────────────────────
            const analysisSteps = [];
            let currentContext = exploration;
            for (let i = 0; i < maxIterations; i++) {
                const step = await this._researchAnalyze(question, currentContext, {
                    iteration: i + 1,
                    depth,
                });
                analysisSteps.push(step);

                // 检查是否已充分回答
                if (step.confidence >= 0.85) break;

                // 追加新发现的上下文
                if (step.newContext) {
                    currentContext = this._mergeContext(currentContext, step.newContext);
                }
            }

            // ── 阶段 3：合成（Synthesis）────────────────────────────────────
            const synthesis = await this._researchSynthesize(question, {
                exploration,
                analysis: analysisSteps,
                depth,
            });

            // ── 阶段 4：报告生成（Report）────────────────────────────────────
            const report = this._buildResearchReport(id, question, {
                exploration,
                analysis: analysisSteps,
                synthesis,
                duration: Date.now() - startTime,
                depth,
            });

            // ── 存入记忆系统 ────────────────────────────────────────────────
            if (saveToMemory && this.kernel?.memoryGraph) {
                await this._saveResearchToMemory(report);
            }

            this._emit('research:complete', { id, report });
            return report;

        } catch (e) {
            this._emit('research:error', { id, error: e.message });
            return {
                id,
                question,
                success: false,
                error: e.message,
                duration: Date.now() - startTime,
            };
        }
    }

    /**
     * 阶段 1：探索 — 在代码库中定位相关文件和代码段
     */
    async _researchExplore(question, maxFiles) {
        const fileSearch = this.kernel?.toolBridge;
        const findings = [];

        if (fileSearch) {
            // 使用 ToolBridge 搜索相关文件
            try {
                const keywords = this._extractKeywords(question);
                for (const kw of keywords.slice(0, 5)) {
                    // 简单搜索（实际实现中调用 toolBridge）
                    const result = await (fileSearch.searchFiles || fileSearch.execute)?.call?.(
                        fileSearch,
                        { query: kw, limit: maxFiles / keywords.length }
                    ).catch(() => null);

                    if (result?.files) {
                        findings.push(...result.files.slice(0, 5));
                    }
                }
            } catch (_) {}
        }

        // 使用 ModelRouter 分析探索结果
        const modelRouter = this.kernel?.modelRouter;
        if (modelRouter) {
            const systemPrompt = 'You are a code exploration expert. Identify the most relevant ' +
                'files and code sections for the given research question. ' +
                'Respond in JSON: {"keyFiles":[{"path","relevance","summary"}],"patterns":["pattern1"]}';

            const response = await modelRouter.route({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Research question: ${question}\nExplored findings: ${JSON.stringify(findings)}` },
                ],
                strategy: 'QUALITY',
            });

            const text = response?.content?.[0]?.text || response?.choices?.[0]?.message?.content || '';
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        }

        return { keyFiles: findings.map(f => ({ path: f, relevance: 0.5, summary: '' })), patterns: [] };
    }

    /**
     * 阶段 2：分析 — 多轮迭代深入分析代码
     */
    async _researchAnalyze(question, context, { iteration, depth }) {
        const modelRouter = this.kernel?.modelRouter;

        if (!modelRouter) {
            return { iteration, confidence: 0.5, newContext: null };
        }

        const maxTokens = depth === 'deep' ? 2000 : depth === 'medium' ? 1000 : 500;

        const systemPrompt = `You are a code analysis expert performing iteration ${iteration}. ` +
            `Analyze the provided code context to answer: "${question}". ` +
            `Identify: dependencies, data flows, key functions, potential issues. ` +
            `If the question is answered with high confidence, set confidence >= 0.85. ` +
            `Respond in JSON: {"answer":"<partial or full answer>",` +
            `"confidence":0.0-1.0,"newContext":{"additionalFiles":["..."],"focus":"..."},"gaps":["..."]}`;

        try {
            const response = await modelRouter.route({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Context:\n${JSON.stringify(context, null, 2)}` },
                ],
                strategy: 'QUALITY',
                maxTokens,
            });

            const text = response?.content?.[0]?.text || response?.choices?.[0]?.message?.content || '';
            const jsonMatch = text.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    iteration,
                    answer: parsed.answer || '',
                    confidence: parsed.confidence || 0.5,
                    newContext: parsed.newContext || null,
                    gaps: parsed.gaps || [],
                };
            }

            return { iteration, confidence: 0.5, answer: text.slice(0, 500), newContext: null, gaps: [] };

        } catch (e) {
            return { iteration, confidence: 0, error: e.message, newContext: null, gaps: [] };
        }
    }

    /**
     * 阶段 3：合成 — 将所有分析结果整合为连贯结论
     */
    async _researchSynthesize(question, { exploration, analysis, depth }) {
        const modelRouter = this.kernel?.modelRouter;

        if (!modelRouter) {
            return { summary: question, conclusions: [] };
        }

        const systemPrompt = 'You are a technical synthesis expert. Integrate all analysis findings ' +
            'into a coherent, comprehensive answer to the research question. ' +
            'Structure the response with: ## Summary, ## Key Findings, ## Details, ## Caveats. ' +
            'Use Chinese for the output unless the question is in English.';

        const analysisTexts = analysis
            .map(a => `=== Iteration ${a.iteration} ===\nAnswer: ${a.answer}\nConfidence: ${a.confidence}`)
            .join('\n\n');

        const keyFiles = (exploration?.keyFiles || [])
            .map(f => `${f.path}: ${f.summary || f.relevance}`)
            .join('\n');

        try {
            const response = await modelRouter.route({
                messages: [
                    { role: 'system', content: systemPrompt },
                    {
                        role: 'user',
                        content: `Research question: ${question}\n\nKey files:\n${keyFiles}\n\nAnalysis iterations:\n${analysisTexts}`,
                    },
                ],
                strategy: 'QUALITY',
                maxTokens: depth === 'deep' ? 3000 : 1500,
            });

            const text = response?.content?.[0]?.text || response?.choices?.[0]?.message?.content || '';
            return {
                summary: text.split('##')[1] || text.slice(0, 500),
                fullText: text,
            };
        } catch (e) {
            return { summary: `Error in synthesis: ${e.message}`, fullText: '' };
        }
    }

    /**
     * 阶段 4：构建结构化研究报告
     */
    _buildResearchReport(id, question, { exploration, analysis, synthesis, duration, depth }) {
        const overallConfidence = analysis.reduce((sum, a) => sum + (a.confidence || 0), 0) / Math.max(analysis.length, 1);
        const answeredIterations = analysis.filter(a => a.confidence >= 0.85).length;

        return {
            id,
            question,
            success: true,
            timestamp: new Date().toISOString(),
            duration,
            depth,
            overview: {
                overallConfidence: Math.round(overallConfidence * 100) / 100,
                iterationsRun: analysis.length,
                iterationsAnswered: answeredIterations,
                keyFilesCount: (exploration?.keyFiles || []).length,
            },
            exploration: {
                keyFiles: (exploration?.keyFiles || []).slice(0, 10),
                patterns: exploration?.patterns || [],
            },
            analysis: analysis.map(a => ({
                iteration: a.iteration,
                confidence: a.confidence,
                answer: a.answer?.slice(0, 300),
                gaps: a.gaps || [],
            })),
            synthesis: synthesis?.fullText || synthesis?.summary || '',
            recommendations: this._generateRecommendations(analysis, synthesis),
        };
    }

    /**
     * 从分析结果生成建议
     */
    _generateRecommendations(analysis, synthesis) {
        const recs = [];

        // 从高置信度分析中提取结论
        const highConf = analysis.filter(a => a.confidence >= 0.7);
        if (highConf.length > 0) {
            recs.push({ type: 'finding', text: `基于 ${highConf.length} 个高置信度分析，结果可信` });
        }

        // 检查未填补的 gaps
        const allGaps = analysis.flatMap(a => a.gaps || []);
        if (allGaps.length > 0) {
            recs.push({ type: 'gap', text: `存在 ${allGaps.length} 个未解答的问题，建议进一步探索` });
            allGaps.slice(0, 3).forEach(g => recs.push({ type: 'suggestion', text: `→ ${g}` }));
        }

        return recs;
    }

    /**
     * 将研究结果存入记忆系统
     */
    async _saveResearchToMemory(report) {
        try {
            const memoryGraph = this.kernel.memoryGraph;
            const memory = {
                type: 'research_report',
                question: report.question,
                id: report.id,
                confidence: report.overview?.overallConfidence,
                keyFiles: report.exploration?.keyFiles?.map(f => f.path) || [],
                summary: typeof report.synthesis === 'string' ? report.synthesis.slice(0, 500) : '',
                timestamp: report.timestamp,
            };
            // 使用内核的记忆注入接口
            if (typeof memoryGraph?.inject === 'function') {
                await memoryGraph.inject(memory);
            } else if (this.kernel?.emit) {
                this.kernel.emit('memory:inject', { memory });
            }
        } catch (e) {
            console.warn('[IntentEngine] Failed to save research to memory:', e.message);
        }
    }

    /**
     * 辅助：从问题中提取关键词
     */
    _extractKeywords(question) {
        return question
            .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length >= 3)
            .slice(0, 10);
    }

    /**
     * 辅助：合并多轮分析上下文
     */
    _mergeContext(base, newContext) {
        if (!newContext) return base;
        return {
            ...base,
            additionalFiles: [
                ...(base.additionalFiles || []),
                ...(newContext.additionalFiles || []),
            ],
            focus: newContext.focus || base.focus,
        };
    }

    /**
     * 广播内部事件
     */
    _emit(event, data) {
        if (this.kernel?.emit) {
            this.kernel.emit(event, { source: 'intent-engine', ...data });
        }
    }
}
