// hundunos/kernel/mixins/RestMixin.js
// HundunOS v4.1 — RestMixin：REST API 端点 + Hook 系统
// 来源：core.js _handleRestRequest()（40+ 端点）+ initialize() Hook 段
// 参考：MemOS REST API Server 模式

import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { rateLimitPresets } from '../rate-limiter.js';
import { createLogger } from '../logger.js';

const logger = createLogger('RestMixin');

// ROOT: 相对于 kernel/mixins/ → 上两级到项目根
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
// Windows ESM: 动态 import() 需要 file:// URL
const _r = (subPath) => pathToFileURL(join(ROOT, subPath)).href;

/**
 * RestMixin — REST API 服务器 + Hook 系统
 *
 * 职责：
 * - REST API 端点注册（40+ 端点）
 * - Hook 系统初始化（HookExecutor + HookLoader + YAML 合并）
 * - REST 服务器启动（HTTP，端口 38080）
 * - API Key 验证 + Rate Limiter 集成
 *
 * v4.1: 从 core.js ~300 行 REST 处理代码提取，职责独立
 */
export const RestMixin = class RestMixin {

    /**
     * init — MixinFactory 验证要求的方法（实现在 init_rest_api）
     * @param {CoreKernel} kernel
     */
    async init(kernel) { return this.init_rest_api(kernel); }

    /**
     * init_rest_api — REST + Hook 初始化
     * @param {CoreKernel} kernel
     */
    async init_rest_api(kernel) {
        // RateLimiter（process 管线中也用到，提前初始化）
        const rateLimitConfig = kernel.config.system?.rateLimit || rateLimitPresets.default;
        const { RateLimiter } = await import(_r('kernel/rate-limiter.js'));
        kernel.rateLimiter = new RateLimiter(rateLimitConfig);
        // review: removed // review: removed console.log(`[Kernel] Rate limiter: ${rateLimitConfig.maxRequests} req/${rateLimitConfig.windowMs / 1000}s`);

        // REST 服务器
        try {
            const { RestServer } = await import(_r('infrastructure/rest-server/index.js'));
            kernel.restServer = new RestServer(kernel);
            if (kernel.rateLimiter) kernel.restServer.setRateLimiter(kernel.rateLimiter);
            // Feature Flag 门控
            kernel.restServer.addFlagGate('REST_SERVER', '*', '/api/');
            kernel.restServer.addFlagGate('HOOK_SYSTEM', '*', '/api/hooks');
            kernel.restServer.addFlagGate('SKILLS_SYSTEM', '*', '/api/skills');
            await kernel.restServer.start();
            // review: removed // review: removed console.log('[Kernel] RestServer: HTTP API ready (auth+rateLimit+flags enabled)');
        } catch (e) {
            logger.warn('RestServer init failed:', e.message);
        }

        // SubagentManager
        try {
            const { SubagentManager, TaskMode, IsolationLevel } = await import(_r('subagents/index.js'));
            kernel.subagents = new SubagentManager(kernel);
            kernel.TaskMode = TaskMode;
            kernel.IsolationLevel = IsolationLevel;
            // review: removed // review: removed console.log(`[Kernel] SubagentManager: ${kernel.subagents.getNames().join(', ')}`);
        } catch (e) {
            logger.warn('SubagentManager init failed:', e.message);
        }
    }

    // ================================================================
    // REST 请求处理（由 RestServer 在内部调用）
    // ================================================================

    async _handleRestRequest(req, res) {
        const url = new URL(req.url, `http://localhost`);
        const path = url.pathname;

        // API Key 认证（/api/* 路径必需）
        if (path.startsWith('/api/')) {
            const rawKey = req.headers['x-api-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
            if (!this._validateApiKey(rawKey)) {
                res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'ApiKey' });
                res.end(JSON.stringify({ error: 'Unauthorized', message: 'Valid X-API-Key header required' }));
                return;
            }
        }

        // 路由分发（按 path 分组）
        await this._routeRest(path, req, res, url);
    }

    async _routeRest(path, req, res, url) {
        // ── /api/process ──────────────────────────────────────────
        if (path === '/api/process' && req.method === 'POST') {
            const body = await this._readBody(req);
            let input;
            try { input = JSON.parse(body); }
            catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }
            const result = await this.process(input);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
        }

        // ── /api/status ──────────────────────────────────────────
        if (path === '/api/status' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(this.getStatus()));
            return;
        }

        // ── /api/intents ─────────────────────────────────────────
        if (path === '/api/intents' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ count: this.intentEngine?.classifiers.length || 0, names: (this.intentEngine?.classifiers || []).map(c => c.name) }));
            return;
        }
        if (path === '/api/intents/reload' && req.method === 'POST') {
            await this.intentEngine?.reload();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Intents reloaded', count: this.intentEngine?.classifiers.length }));
            return;
        }

        // ── /api/rate-limit/stats ────────────────────────────────
        if (path === '/api/rate-limit/stats' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(this.rateLimiter?.getStats() || {}));
            return;
        }

        // ── /api/modules ─────────────────────────────────────────
        if (path === '/api/modules' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(this.moduleRegistry?.getStats?.() || {}));
            return;
        }

        // ── /api/model-router ────────────────────────────────────
        if (path === '/api/model-router' && req.method === 'GET') {
            const mr = this.modelRouter;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                providers: Array.from(mr.providers?.values?.() || []).map(p => ({
                    id: p.id, name: p.name, type: p.type,
                    model: p.model, capabilities: p.capabilities,
                    costPer1M: p.costPer1M, maxTokens: p.maxTokens,
                })),
                strategy: mr.strategy || 'BALANCED',
                localFirst: mr.localFirst,
                catalog: mr.getModelCatalog?.() || {},
                stats: mr.getStats?.() || {},
            }, null, 2));
            return;
        }

        // ── /api/health ──────────────────────────────────────────
        if (path === '/api/health' && req.method === 'GET') {
            const hm = this.healthMonitor;
            if (hm?.getStatus) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(hm.getStatus()));
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ healthy: this.state.running, overall: this.state.running ? 85 : 0, uptime: process.uptime() }));
            }
            return;
        }

        // ── /api/audit ───────────────────────────────────────────
        if (path === '/api/audit' && req.method === 'GET') {
            const logs = this.auditLogger?.recent?.slice?.(-20) || [];
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ logs, count: logs.length }));
            return;
        }

        // ── /api/rust + /api/rust/execute ────────────────────────
        if (path === '/api/rust' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(this.getRustHealth(), null, 2));
            return;
        }
        if (path === '/api/rust/execute' && req.method === 'POST') {
            if (!this.rust) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'RustModules not available' })); return; }
            const body = await this._readBody(req);
            let reqData;
            try { reqData = JSON.parse(body); } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }
            const { module, method, params = {} } = reqData;
            const moduleMap = { tool: 'tool', memory: 'memory', router: 'router', policy: 'policy', scientist: 'scientist' };
            const rustModule = this.rust[moduleMap[module]];
            if (!rustModule) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: `Unknown module: ${module}` })); return; }
            try {
                const result = await rustModule[method]?.(params);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, result }));
            } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
            return;
        }

        // ── v4.1: /api/memory/search ─────────────────────────────
        if (path === '/api/memory/search' && req.method === 'POST') {
            const body = await this._readBody(req);
            let reqData;
            try { reqData = JSON.parse(body); } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }
            const results = await this.memoryGraph?.advancedSearch?.(reqData.query || '', { topK: reqData.topK || 10, sessionId: reqData.sessionId || 'default' }) || [];
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ query: reqData.query, count: results.length, results }, null, 2));
            return;
        }

        // ── v4.1: /api/memory/cot-search ─────────────────────────
        if (path === '/api/memory/cot-search' && req.method === 'POST') {
            const body = await this._readBody(req);
            let reqData;
            try { reqData = JSON.parse(body); } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }
            const results = await this.memoryGraph?.cotSearch?.(reqData.query || '', { topK: reqData.topK || 10, sessionId: reqData.sessionId || 'default' }) || [];
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ query: reqData.query, count: results.length, results }, null, 2));
            return;
        }

        // ── v3.2: /api/aware/preferences ─────────────────────────
        if (path === '/api/aware/preferences' && req.method === 'GET') {
            const userId = url.searchParams.get('userId') || 'default';
            const prefs = this.aware?.preferenceExtractor?.getForContext?.(userId, url.searchParams.get('query') || '') || null;
            const stats = this.aware?.preferenceExtractor?.getStats?.(userId) || {};
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ userId, preferences: prefs, stats }, null, 2));
            return;
        }
        if (path === '/api/aware/preferences/extract' && req.method === 'POST') {
            const body = await this._readBody(req);
            let reqData;
            try { reqData = JSON.parse(body); } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }
            const extracted = this.aware?.extractPreference?.(reqData.messages || [], reqData.userId || 'default');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ userId: reqData.userId, extracted }, null, 2));
            return;
        }

        // ── v3.8: /api/toolbridge/trajectory ─────────────────────
        if (path === '/api/toolbridge/trajectory' && req.method === 'GET') {
            const q = url.searchParams.get('q') || '';
            const limit = parseInt(url.searchParams.get('limit') || '20');
            const recent = this.toolBridge?.trajectoryMemory?.getRecent?.(limit) || [];
            const ranked = this.toolBridge?.trajectoryMemory?.getFrequencyRanked?.(10) || [];
            const stats = this.toolBridge?.trajectoryMemory?.getStats?.() || {};
            const matching = q ? this.toolBridge?.trajectoryMemory?.retrieve?.(q, 5) || [] : [];
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ recent, ranked, stats, matching: q ? matching : undefined }, null, 2));
            return;
        }

        // ── Phase 5: /api/task-scientist ─────────────────────────
        if (path === '/api/task-scientist' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(this.taskScientist?.getStatus() || { enabled: false }, null, 2));
            return;
        }
        if (path === '/api/task-scientist/analyze' && req.method === 'POST') {
            const body = await this._readBody(req);
            let reqData;
            try { reqData = JSON.parse(body); } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }
            const analysis = this.taskScientist?.analyzeTask(reqData.task || '') || {};
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(analysis, null, 2));
            return;
        }
        if (path === '/api/task-scientist/tasks' && req.method === 'POST') {
            const body = await this._readBody(req);
            let reqData;
            try { reqData = JSON.parse(body); } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }
            const result = await this.taskScientist?.createTask(reqData.task, reqData.context || {});
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result, null, 2));
            return;
        }

        // /api/task-scientist/tasks/:id — GET Journal / DELETE
        const taskIdMatch = path.match(/^\/api\/task-scientist\/tasks\/([^/]+)$/);
        if (taskIdMatch && req.method === 'GET') {
            const taskId = taskIdMatch[1];
            const journal = await this.taskScientist?.getJournal(taskId);
            const stats = await this.taskScientist?.getStats(taskId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ taskId, journal, stats }, null, 2));
            return;
        }
        if (taskIdMatch && req.method === 'DELETE') {
            await this.taskScientist?.deleteTask(taskIdMatch[1]);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ deleted: true, taskId: taskIdMatch[1] }));
            return;
        }

        // /api/task-scientist/tasks/:id/run — POST BFTS
        const taskRunMatch = path.match(/^\/api\/task-scientist\/tasks\/([^/]+)\/run$/);
        if (taskRunMatch && req.method === 'POST') {
            const taskId = taskRunMatch[1];
            try {
                const result = await this.taskScientist?.runBFTS(taskId);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result, null, 2));
            } catch (e) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
            return;
        }

        // ── Phase 6: /api/skills ─────────────────────────────────
        if (path === '/api/skills' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(this.skills?.getStats() || { totalSkills: 0, skills: [] }, null, 2));
            return;
        }
        if (path === '/api/skills/match' && req.method === 'POST') {
            const body = await this._readBody(req);
            let reqData;
            try { reqData = JSON.parse(body); } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }
            const matches = await this.skills?.match(reqData.query || '', { limit: reqData.limit || 5 });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(matches || [], null, 2));
            return;
        }
        if (path === '/api/skills/run' && req.method === 'POST') {
            const body = await this._readBody(req);
            let reqData;
            try { reqData = JSON.parse(body); } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }
            try {
                const result = await this.skills?.runner?.run(reqData.name, reqData.params || {}, reqData.options || {});
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result, null, 2));
            } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
            return;
        }
        if (path === '/api/skills/inject' && req.method === 'POST') {
            const body = await this._readBody(req);
            let reqData;
            try { reqData = JSON.parse(body); } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ 'error': 'Invalid JSON' })); return; }
            const result = await this.skills?.injector?.inject(reqData.query || '', reqData.options || {});
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result, null, 2));
            return;
        }
        if (path === '/api/skills' && req.method === 'POST') {
            const body = await this._readBody(req);
            try {
                const skill = await this.skills?.register(body);
                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ registered: true, skill: { name: skill?.name, version: skill?.version } }, null, 2));
            } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
            return;
        }

        // /api/skills/:name — GET / DELETE
        const skillNameMatch = path.match(/^\/api\/skills\/([^/]+)$/);
        if (skillNameMatch && req.method === 'GET') {
            const skill = this.skills?.get(skillNameMatch[1]);
            if (!skill) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: `Skill "${skillNameMatch[1]}" not found` })); return; }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(skill, null, 2));
            return;
        }
        if (skillNameMatch && req.method === 'DELETE') {
            const removed = this.skills?.unregister(skillNameMatch[1]);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ removed: !!removed, name: skillNameMatch[1] }));
            return;
        }

        // ── /api/skills/market — v4.1 新增 ──────────────────────
        if (path === '/api/skills/market' && req.method === 'GET') {
            const market = this.skills?.market;
            if (!market) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'SkillMarket not available' })); return; }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ official: market.list ? market.list() : [], stats: market.getStats ? market.getStats() : {} }, null, 2));
            return;
        }
        if (path === '/api/skills/market/install' && req.method === 'POST') {
            const body = await this._readBody(req);
            let reqData;
            try { reqData = JSON.parse(body); } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }
            try {
                const result = await this.skills?.market?.install?.(reqData.url);
                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ installed: true, result }, null, 2));
            } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
            return;
        }

        // /api/skills/market/:name — DELETE (uninstall)
        const marketMatch = path.match(/^\/api\/skills\/market\/([^/]+)$/);
        if (marketMatch && req.method === 'DELETE') {
            const removed = this.skills?.market?.uninstall?.(marketMatch[1]);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ uninstalled: !!removed, name: marketMatch[1] }));
            return;
        }

        // ── /api/client-adapters ─────────────────────────────────
        if (path === '/api/client-adapters' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ adapters: this.clientAdapter?.getAdaptersStatus?.() || [], active: this.clientAdapter?.getActiveAdapter?.() }, null, 2));
            return;
        }
        if (path === '/api/client-adapters/switch' && req.method === 'POST') {
            const body = JSON.parse(await this._readBody(req));
            const result = await this.clientAdapter?.switchAdapter?.(body.adapterId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, adapter: result }, null, 2));
            return;
        }

        // 404
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found', path }));
    }

    // ================================================================
    // Hook 系统初始化（Phase: hooks）
    // ================================================================

    async init_hooks(kernel) {
        try {
            const { HookExecutor, HookEvent, createDefaultHooks } = await import(_r('hooks/index.js'));
            const { HookLoader } = await import(_r('hooks/hook-loader.js'));

            const hookLoader = new HookLoader(kernel);
            const yamlHooks = await hookLoader.loadAll();
            const mergedHooks = this._mergeHooks(yamlHooks, createDefaultHooks());

            kernel.hooks = new HookExecutor({ kernel, hooks: mergedHooks });
            kernel.hooks.loader = hookLoader;

            // 触发 SESSION_START
            await kernel.hooks.trigger(HookEvent.SESSION_START, {
                kernelVersion: '4.1.0',
                workspace: kernel.config.workspace,
                hooksLoaded: hookLoader.getStats().loadedFiles,
            }).catch(() => {});

            // review: removed // review: removed console.log(`[Kernel] HookExecutor: ${Object.keys(mergedHooks).length} events registered`);
        } catch (e) {
            logger.warn('HookExecutor init failed:', e.message);
        }
    }

    _mergeHooks(yamlHooks, defaultHooks) {
        const merged = { ...defaultHooks };
        for (const [event, hooks] of Object.entries(yamlHooks || {})) {
            if (!merged[event]) {
                merged[event] = hooks;
            } else {
                merged[event] = [...merged[event], ...hooks];
            }
        }
        return merged;
    }

    // ================================================================
    // getMixinStatus
    // ================================================================
    getMixinStatus_Rest() {
        return {
            restServer: {
                available: !!this.restServer,
                port: this.restServer?.port || null,
                running: !!this.restServer?.server,
            },
            hooks: {
                available: !!this.hooks,
                events: this.hooks ? Object.keys(this.hooks.getHooks?.() || {}) : [],
                loaderStats: this.hooks?.loader?.getStats?.() || null,
            },
        };
    }
};

export default RestMixin;
