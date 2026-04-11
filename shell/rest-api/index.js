/**
 * HundunOS v3.0 - REST API Layer
 * RESTful API 服务层
 * 
 * 功能:
 * - HTTP API 服务
 * - 路由管理
 * - 中间件支持
 */

import { EventEmitter } from 'events';
import { createServer } from 'http';
import { URL } from 'url';
import { timingSafeEqual } from 'crypto';

// ============================================================================
// 路由定义
// ============================================================================

export class Router {
    constructor() {
        this.routes = new Map();
    }

    /**
     * 注册路由
     */
    on(method, path, handler) {
        const key = `${method.toUpperCase()} ${path}`;
        this.routes.set(key, handler);
        return this;
    }

    get(path, handler) { return this.on('GET', path, handler); }
    post(path, handler) { return this.on('POST', path, handler); }
    put(path, handler) { return this.on('PUT', path, handler); }
    delete(path, handler) { return this.on('DELETE', path, handler); }

    /**
     * 匹配路由
     */
    match(method, path) {
        const key = `${method.toUpperCase()} ${path}`;
        if (this.routes.has(key)) {
            return { handler: this.routes.get(key), params: {} };
        }

        // 支持参数路由 :id
        for (const [route, handler] of this.routes) {
            const [routeMethod, routePath] = route.split(' ');
            if (routeMethod !== method.toUpperCase()) continue;

            const params = this._matchPath(routePath, path);
            if (params !== null) {
                return { handler, params };
            }
        }

        return null;
    }

    _matchPath(pattern, path) {
        const patternParts = pattern.split('/');
        const pathParts = path.split('/');

        if (patternParts.length !== pathParts.length) return null;

        const params = {};

        for (let i = 0; i < patternParts.length; i++) {
            if (patternParts[i].startsWith(':')) {
                params[patternParts[i].slice(1)] = pathParts[i];
            } else if (patternParts[i] !== pathParts[i]) {
                return null;
            }
        }

        return params;
    }
}

// ============================================================================
// REST API Server
// ============================================================================

export class RestAPI extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            port: config.port || 38080,
            host: config.host || 'localhost',
            cors: config.cors !== false,
            apiKey: config.apiKey || process.env.HUNDUNOS_API_KEY || null,
            rateLimit: config.rateLimit || { windowMs: 60000, max: 100 },
            ...config
        };

        this.router = new Router();
        this.server = null;
        this.state = 'stopped';
        this.middlewares = [];

        this._setupDefaultRoutes();

        // 添加限流和认证中间件
        this.use(this._rateLimiter());
        this.use(this._authenticate());

        // review: removed // review: removed console.log('[REST] API initialized');
    }

    // ========================================================================
    // 中间件
    // ========================================================================

    use(middleware) {
        this.middlewares.push(middleware);
        return this;
    }

    // ========================================================================
    // 路由注册
    // ========================================================================

    get(path, handler) { this.router.get(path, handler); return this; }
    post(path, handler) { this.router.post(path, handler); return this; }
    put(path, handler) { this.router.put(path, handler); return this; }
    delete(path, handler) { this.router.delete(path, handler); return this; }

    // ========================================================================
    // 服务管理
    // ========================================================================

    /**
     * 启动服务
     */
    async start() {
        if (this.state === 'running') {
            return { alreadyRunning: true };
        }

        return new Promise((resolve, reject) => {
            this.server = createServer((req, res) => this._handleRequest(req, res));

            this.server.on('error', reject);

            this.server.listen(this.config.port, this.config.host, () => {
                this.state = 'running';
                // review: removed // review: removed console.log(`[REST] API listening on http://${this.config.host}:${this.config.port}`);
                this.emit('started');
                resolve({ started: true, url: `http://${this.config.host}:${this.config.port}` });
            });
        });
    }

    /**
     * 停止服务
     */
    async stop() {
        if (this.state === 'stopped') {
            return { alreadyStopped: true };
        }

        return new Promise((resolve) => {
            this.server.close(() => {
                this.state = 'stopped';
                // review: removed // review: removed console.log('[REST] API stopped');
                this.emit('stopped');
                resolve({ stopped: true });
            });
        });
    }

    /**
     * 获取状态
     */
    getStatus() {
        return {
            state: this.state,
            url: `http://${this.config.host}:${this.config.port}`,
            routes: this.router.routes.size
        };
    }

    // ========================================================================
    // 内部方法
    // ========================================================================

    // 限流器
    _rateLimiter() {
        const requests = new Map();
        
        return async (ctx) => {
            if (!this.config.rateLimit) return;
            
            const key = ctx.headers['x-forwarded-for'] || ctx.req.socket.remoteAddress;
            const now = Date.now();
            const window = this.config.rateLimit.windowMs || 60000;
            const max = this.config.rateLimit.max || 100;
            
            if (!requests.has(key)) {
                requests.set(key, []);
            }
            
            const times = requests.get(key).filter(t => now - t < window);
            times.push(now);
            requests.set(key, times);
            
            if (times.length > max) {
                throw new Error('Rate limit exceeded');
            }
        };
    }

    // API Key 验证
    _authenticate() {
        return async (ctx) => {
            // 跳过健康检查和根 API
            if (ctx.path === '/health' || ctx.path === '/api') return;
            
            const apiKey = this.config.apiKey;
            if (!apiKey) return; // 未配置 API Key 时跳过验证（开发模式）
            
            const provided = ctx.headers['x-api-key'];
            if (!provided) {
                throw new Error('Unauthorized: X-API-Key header required');
            }

            // 修复 M1：timingSafeEqual 要求两个 Buffer 长度相同，
            // 否则会抛出 RangeError。用固定长度的 SHA-256 哈希比较避免崩溃。
            const { createHash } = await import('crypto');
            const hashProvided = createHash('sha256').update(provided).digest();
            const hashExpected = createHash('sha256').update(apiKey).digest();
            const valid = timingSafeEqual(hashProvided, hashExpected);
            if (!valid) {
                throw new Error('Unauthorized: Invalid API key');
            }
        };
    }

    _setupDefaultRoutes() {
        // 健康检查
        this.router.get('/health', async () => ({
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        }));

        // API 信息
        this.router.get('/api', async () => ({
            name: 'HundunOS REST API',
            version: '3.0.0',
            endpoints: Array.from(this.router.routes.keys())
        }));

        // 系统状态
        this.router.get('/api/system', async () => ({
            platform: process.platform,
            nodeVersion: process.version,
            memory: process.memoryUsage(),
            uptime: process.uptime()
        }));
    }

    async _handleRequest(req, res) {
        const startTime = Date.now();
        const url = new URL(req.url, `http://${req.headers.host}`);
        const path = url.pathname;

        // CORS
        if (this.config.cors) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            // 修复 H3：添加 X-API-Key 到 CORS 允许头，否则浏览器预检失败
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
        }

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        // 路由匹配
        const match = this.router.match(req.method, path);

        if (!match) {
            this._sendResponse(res, 404, { error: 'Not Found', path });
            return;
        }

        try {
            // 解析请求体
            const body = await this._parseBody(req);

            // 构建请求上下文
            const ctx = {
                req,
                res,
                path,
                query: Object.fromEntries(url.searchParams),
                params: match.params,
                body,
                headers: req.headers
            };

            // 执行中间件
            for (const middleware of this.middlewares) {
                await middleware(ctx);
            }

            // 执行处理器
            const result = await match.handler(ctx);

            this._sendResponse(res, 200, result);
            this.emit('request', { method: req.method, path, elapsed: Date.now() - startTime });
        } catch (error) {
            console.error(`[REST] Error handling ${req.method} ${path}:`, error.message);
            this._sendResponse(res, 500, { error: error.message });
            this.emit('error', { method: req.method, path, error });
        }
    }

    _parseBody(req) {
        return new Promise((resolve) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                if (!body) return resolve(null);
                try {
                    resolve(JSON.parse(body));
                } catch {
                    resolve(body);
                }
            });
        });
    }

    _sendResponse(res, status, data) {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data, null, 2));
    }
}

// ============================================================================
// 单例
// ============================================================================

let instance = null;

export function getRestAPI() {
    if (!instance) {
        instance = new RestAPI();
    }
    return instance;
}

export default {
    RestAPI,
    Router,
    getRestAPI
};
