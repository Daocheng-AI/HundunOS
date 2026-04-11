// hundunos/infrastructure/rest-server/index.js
// HundunOS v3.8 Phase 7 Fix — REST API 服务器
// 提供所有 HundunOS 内核组件的 HTTP 接口
// 端口: 38080（可配置）
// 安全：API Key 鉴权 + RateLimiter + Feature Flag 端点控制

import http from 'node:http';
import { URL } from 'node:url';
import { createHash } from 'node:crypto';

export class RestServer {
    /**
     * @param {Object} kernel - HundunOS 内核引用
     */
    constructor(kernel) {
        this.kernel = kernel;
        this.port = parseInt(process.env.HUNDUNOS_PORT || '38080', 10);
        this.host = process.env.HUNDUNOS_HOST || '0.0.0.0';
        this.server = null;
        this._routes = [];
        this._registerRoutes();

        // FIX-R1: API Key 鉴权配置
        // 支持 HUNDUN_API_KEY 环境变量 + system.json restApi.apiKeys
        const envKey = process.env.HUNDUN_API_KEY;
        const configKeys = kernel?.config?.system?.restApi?.apiKeys || [];
        this._apiKeys = new Set(
            envKey ? [envKey, ...configKeys] : configKeys
        );
        this._authEnabled = this._apiKeys.size > 0;
        if (this._authEnabled) {
            console.log(`[RestServer] API Key auth: ENABLED (${this._apiKeys.size} key(s))`);
        } else {
            console.log('[RestServer] API Key auth: DISABLED (no keys configured)');
        }

        // FIX-R2: RateLimiter 引用（由 core.js 注入）
        this._rateLimiter = null;

        // FIX-R6: Feature Flag 控制的端点白名单
        // 格式: { flagName: [method, pathPattern] }
        this._flagGates = [];
    }

    /**
     * 注入 RateLimiter（由 core.js 初始化时调用）
     * @param {Object} rateLimiter
     */
    setRateLimiter(rateLimiter) {
        this._rateLimiter = rateLimiter;
    }

    /**
     * 注册 Feature Flag 门控
     * @param {string} flagName - feature flag 名称
     * @param {string} method  - HTTP 方法
     * @param {string} path     - 路径模式（如 '/api/tasks'）
     */
    addFlagGate(flagName, method, path) {
        this._flagGates.push({ flagName, method, path });
    }

    // ────────────────────────────────────────────────────────────────
    // FIX-R1: API Key 鉴权
    // ────────────────────────────────────────────────────────────────
    _getClientKey(req) {
        // 支持两种格式: X-Api-Key header 或 Authorization: Bearer <key>
        const apiKey = req.headers['x-api-key']
            || req.headers['authorization']?.replace(/^Bearer\s+/i, '')
            || '';
        return apiKey;
    }

    _authenticate(req) {
        if (!this._authEnabled) return { ok: true, reason: 'auth disabled' };

        const key = this._getClientKey(req);
        if (!key) return { ok: false, reason: 'Missing API key', status: 401 };

        // FIX-S2: 改用 SHA-256 哈希比对，与 core.js _validateApiKey 逻辑保持一致
        // stored key 可以是明文（自动转哈希）或已哈希的 64 位 hex 字符串
        const providedHash = createHash('sha256').update(key).digest('hex');
        let matched = false;
        for (const stored of this._apiKeys) {
            const storedHash = (stored.length === 64 && /^[0-9a-f]+$/.test(stored))
                ? stored
                : createHash('sha256').update(stored).digest('hex');
            if (providedHash === storedHash) { matched = true; break; }
        }
        if (!matched) return { ok: false, reason: 'Invalid API key', status: 401 };

        return { ok: true };
    }

    // ────────────────────────────────────────────────────────────────
    // FIX-R6: Feature Flag 端点控制
    // ────────────────────────────────────────────────────────────────
    _checkFlagGate(method, pathname) {
        for (const gate of this._flagGates) {
            if (gate.method !== method && gate.method !== '*') continue;
            // 简单前缀匹配
            if (pathname.startsWith(gate.path)) {
                const { isEnabled } = this.kernel?.featureFlags || {};
                if (typeof isEnabled === 'function') {
                    if (!isEnabled(gate.flagName)) {
                        return { blocked: true, flag: gate.flagName };
                    }
                }
            }
        }
        return { blocked: false };
    }

    /** 启动 REST 服务器 */
    async start() {
        if (this.server) return;
        this.server = http.createServer((req, res) => this._handle(req, res));
        this.server.listen(this.port, this.host, () => {
            console.log(`[RestServer] HTTP API listening on http://${this.host}:${this.port}`);
        });
        this.server.on('error', (e) => {
            console.error('[RestServer] Server error:', e.message);
        });
    }

    /** 关闭服务器 */
    async stop() {
        return new Promise((resolve) => {
            if (!this.server) return resolve();
            this.server.close(resolve);
            this.server = null;
        });
    }

    /** 注册路由 */
    _registerRoutes() {
        // ── 基础路由 ──────────────────────────────────
        this._get('/api/status', () => ({ ok: true, kernel: 'v3.8.0', uptime: Date.now() }));

        // ── Hooks 路由 (Phase 7) ─────────────────────
        this._get('/api/hooks', () => {
            const loader = this.kernel?.hooks?.loader;
            return {
                events: loader ? loader.listEvents() : [],
                stats: loader ? loader.getStats() : { loadedFiles: 0, events: 0 },
                registered: this.kernel?.hooks ? this.kernel.hooks.getHooks() : {},
            };
        });
        this._get('/api/hooks/events', () => ({ events: this.kernel?.hooks ? Object.keys(this.kernel.hooks.getHooks()) : [] }));
        this._get('/api/hooks/events/:event', (params) => {
            if (!this.kernel?.hooks) return { error: 'hooks not available' };
            return { event: params.event, hooks: this.kernel.hooks.getHooks(params.event) };
        });
        this._post('/api/hooks/trigger/:event', async (params, body) => {
            if (!this.kernel?.hooks) return { error: 'hooks not available' };
            const result = await this.kernel.hooks.trigger(params.event, body || {}).catch(e => ({ error: e.message }));
            return { event: params.event, result };
        });
        this._post('/api/hooks/register', (params, body) => {
            if (!this.kernel?.hooks) return { error: 'hooks not available' };
            if (body.event && body.hookGroup) {
                this.kernel.hooks.register(body.event, body.hookGroup);
                return { success: true, event: body.event };
            }
            return { error: 'event and hookGroup required' };
        });

        // ── Skills 路由 (Phase 6) ───────────────────
        this._get('/api/skills', () => {
            const skills = this.kernel?.skills;
            if (!skills) return { error: 'skills not available' };
            return typeof skills.list === 'function' ? skills.list() : { error: 'not initialized' };
        });
        this._post('/api/skills', async (params, body) => {
            const skills = this.kernel?.skills;
            if (!skills) return { error: 'skills not available' };
            if (typeof skills.register === 'function') {
                await skills.register(body);
                return { success: true };
            }
            return { error: 'register not available' };
        });
        this._get('/api/skills/:name', (params) => {
            const skills = this.kernel?.skills;
            if (!skills) return { error: 'skills not available' };
            const skill = typeof skills.get === 'function' ? skills.get(params.name) : null;
            return skill || { error: `Skill '${params.name}' not found` };
        });
        this._delete('/api/skills/:name', (params) => {
            const skills = this.kernel?.skills;
            if (!skills || typeof skills.unregister !== 'function') return { error: 'unavailable' };
            const removed = skills.unregister(params.name);
            return { removed };
        });
        this._post('/api/skills/match', async (params, body) => {
            const skills = this.kernel?.skills;
            if (!skills || typeof skills.match !== 'function') return { error: 'skills.match not available' };
            const matches = await skills.match(body.query || '', body.options || {});
            return { matches };
        });
        this._post('/api/skills/run', async (params, body) => {
            const runner = this.kernel?.skills?.runner;
            if (!runner || typeof runner.run !== 'function') return { error: 'runner not available' };
            const result = await runner.run(body.name, body.params || {}, body.options || {}).catch(e => ({ error: e.message }));
            return { result };
        });
        this._post('/api/skills/inject', async (params, body) => {
            const injector = this.kernel?.skills?.injector;
            if (!injector || typeof injector.inject !== 'function') return { error: 'injector not available' };
            const result = await injector.inject(body.query || '', body.options || {}).catch(e => ({ error: e.message }));
            return { result };
        });
        this._get('/api/skills/stats', () => {
            const skills = this.kernel?.skills;
            if (!skills || typeof skills.getStats !== 'function') return { error: 'unavailable' };
            return skills.getStats();
        });

        // ── SkillMarket 路由 (Phase 7) ────────────────
        this._get('/api/skills/market', () => {
            const market = this.kernel?.skills?.market;
            if (!market) return { error: 'skill market not available' };
            return typeof market.list === 'function' ? market.list() : { error: 'not initialized' };
        });
        this._post('/api/skills/market/install', async (params, body) => {
            const market = this.kernel?.skills?.market;
            if (!market) return { error: 'skill market not available' };
            const result = await market.install(body.url || body.name, body.options || {}).catch(e => ({ error: e.message }));
            return { result };
        });
        this._delete('/api/skills/market/:name', (params) => {
            const market = this.kernel?.skills?.market;
            if (!market || typeof market.uninstall !== 'function') return { error: 'market unavailable' };
            const result = market.uninstall(params.name);
            return { success: result };
        });

        // ── TaskScientist 路由 (Phase 5) ──────────────
        this._get('/api/tasks', () => {
            const ts = this.kernel?.taskScientist;
            if (!ts) return { error: 'taskScientist not available' };
            return { tasks: ts.listTasks ? ts.listTasks() : [] };
        });
        this._post('/api/tasks', async (params, body) => {
            const ts = this.kernel?.taskScientist;
            if (!ts) return { error: 'taskScientist not available' };
            const result = await ts.createTask(body.task || 'Untitled', body.context || {}).catch(e => ({ error: e.message }));
            return result;
        });
        this._post('/api/tasks/run/:taskId', async (params) => {
            const ts = this.kernel?.taskScientist;
            if (!ts) return { error: 'taskScientist not available' };
            const result = await ts.runBFTS(params.taskId).catch(e => ({ error: e.message }));
            return result;
        });
        this._get('/api/tasks/:taskId', (params) => {
            const ts = this.kernel?.taskScientist;
            if (!ts) return { error: 'taskScientist not available' };
            return ts.getStats ? (ts.getStats(params.taskId) || { error: 'not found' }) : { error: 'unavailable' };
        });
        this._get('/api/tasks/:taskId/journal', async (params) => {
            const ts = this.kernel?.taskScientist;
            if (!ts || !ts.getJournal) return { error: 'taskScientist not available' };
            const journal = await ts.getJournal(params.taskId).catch(() => null);
            return journal || { error: 'not found' };
        });
        this._get('/api/tasks/stats', async () => {
            const ts = this.kernel?.taskScientist;
            if (!ts) return { error: 'taskScientist not available' };
            return ts.getGlobalStats ? await ts.getGlobalStats() : { error: 'unavailable' };
        });
        this._delete('/api/tasks/:taskId', (params) => {
            const ts = this.kernel?.taskScientist;
            if (!ts) return { error: 'taskScientist not available' };
            if (ts.deleteTask) { ts.deleteTask(params.taskId); }
            return { deleted: params.taskId };
        });
        this._post('/api/tasks/analyze', (params, body) => {
            const ts = this.kernel?.taskScientist;
            if (!ts || !ts.analyzeTask) return { error: 'taskScientist not available' };
            return ts.analyzeTask(body.task || '');
        });

        // ── Memory 路由 ─────────────────────────────
        this._get('/api/memory', () => {
            const mg = this.kernel?.memoryGraph;
            if (!mg) return { error: 'memoryGraph not available' };
            return { recent: mg.recent?.length || 0, semantic: mg.semantic?.size || 0, episodic: mg.episodic?.length || 0 };
        });
        this._post('/api/memory', (params, body) => {
            const mg = this.kernel?.memoryGraph;
            if (!mg) return { error: 'memoryGraph not available' };
            if (mg.add) { mg.add(body); }
            return { success: true };
        });
        this._post('/api/memory/search', async (params, body) => {
            const mg = this.kernel?.memoryGraph;
            if (!mg) return { error: 'memoryGraph not available' };
            const query = body.query || '';
            if (mg.recall) return await mg.recall(query);
            return { error: 'recall not available' };
        });

        // ── Feature Flags ────────────────────────────
        this._get('/api/features', async () => {
            const { listAllFeatures } = await import('../../kernel/feature-flags.js');
            return { features: listAllFeatures() };
        });
        this._get('/api/features/:name', async (params) => {
            const { getFeatureInfo } = await import('../../kernel/feature-flags.js');
            return getFeatureInfo(params.name) || { error: 'not found' };
        });
    }

    /** 注册 GET 路由 */
    _get(path, handler) {
        this._routes.push({ method: 'GET', path, handler });
    }

    /** 注册 POST 路由 */
    _post(path, handler) {
        this._routes.push({ method: 'POST', path, handler });
    }

    /** 注册 DELETE 路由 */
    _delete(path, handler) {
        this._routes.push({ method: 'DELETE', path, handler });
    }

    /** 解析路由参数 */
    _matchRoute(method, pathname) {
        for (const route of this._routes) {
            if (route.method !== method) continue;
            const pattern = route.path.replace(/:(\w+)/g, '(?<$1>[^/]+)');
            const regex = new RegExp(`^${pattern}$`);
            const match = pathname.match(regex);
            if (match) return { handler: route.handler, params: match.groups || {} };
        }
        return null;
    }

    // ────────────────────────────────────────────────────────────────
    // FIX-S1: CORS 白名单检查（替换硬编码 '*'）
    // 从 system.json restApi.cors.allowedOrigins 读取白名单
    // ────────────────────────────────────────────────────────────────
    _setCorsHeaders(req, res) {
        const corsConfig = this.kernel?.config?.system?.restApi?.cors || {};
        const allowedOrigins = corsConfig.allowedOrigins || [];
        const origin = req.headers['origin'];

        if (allowedOrigins.length === 0) {
            // 未配置白名单 → 拒绝所有跨域请求（最安全默认值）
            return false;
        }

        if (origin && allowedOrigins.includes(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            // Vary 头：确保代理缓存不复用错误的 CORS 响应
            res.setHeader('Vary', 'Origin');
            if (corsConfig.allowCredentials) {
                res.setHeader('Access-Control-Allow-Credentials', 'true');
            }
            if (corsConfig.maxAge) {
                res.setHeader('Access-Control-Max-Age', String(corsConfig.maxAge));
            }
        } else if (!origin) {
            // 同源请求（无 Origin 头），允许
        } else {
            // Origin 不在白名单中
            return false;
        }

        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key');
        return true;
    }

    /** 处理请求 */
    async _handle(req, res) {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const route = this._matchRoute(req.method, url.pathname);

        res.setHeader('Content-Type', 'application/json');

        // FIX-S1: 用白名单 CORS 替换 '*' 通配符
        const corsOk = this._setCorsHeaders(req, res);
        if (!corsOk) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Forbidden', reason: 'CORS origin not allowed' }));
            return;
        }

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        // 路由不存在
        if (!route) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found', path: url.pathname }));
            return;
        }

        // FIX-R1: API Key 鉴权（跳过 /api/status 公开端点）
        if (url.pathname !== '/api/status') {
            const auth = this._authenticate(req);
            if (!auth.ok) {
                res.writeHead(auth.status);
                res.end(JSON.stringify({ error: 'Unauthorized', reason: auth.reason }));
                return;
            }
        }

        // FIX-R2: RateLimiter 限流
        if (this._rateLimiter) {
            const { check } = this._rateLimiter;
            if (typeof check === 'function') {
                const rateResult = check.call(this._rateLimiter, req);
                res.setHeader('X-RateLimit-Remaining', String(rateResult.remaining ?? '?'));
                res.setHeader('X-RateLimit-Reset', String(rateResult.resetMs ?? 0));
                if (!rateResult.allowed) {
                    res.writeHead(429);
                    res.end(JSON.stringify({
                        error: 'Too Many Requests',
                        reason: rateResult.reason || 'Rate limit exceeded',
                        retryAfterMs: rateResult.resetMs,
                    }));
                    return;
                }
            }
        }

        // FIX-R6: Feature Flag 端点控制
        const flagCheck = this._checkFlagGate(req.method, url.pathname);
        if (flagCheck.blocked) {
            res.writeHead(403);
            res.end(JSON.stringify({
                error: 'Feature Disabled',
                reason: `Endpoint requires feature flag '${flagCheck.flag}' which is currently disabled`,
            }));
            return;
        }

        // 解析请求体
        let body = {};
        if (['POST', 'DELETE'].includes(req.method)) {
            try {
                const raw = await new Promise((resolve, reject) => {
                    let data = '';
                    req.on('data', chunk => data += chunk);
                    req.on('end', () => resolve(data));
                    req.on('error', reject);
                });
                if (raw) body = JSON.parse(raw);
            } catch (_) {}
        }

        try {
            const result = await route.handler(route.params, body);
            res.writeHead(200);
            res.end(JSON.stringify(result, null, 2));
        } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: e.message }));
        }
    }
}

export default RestServer;
