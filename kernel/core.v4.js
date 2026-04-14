// hundunos/kernel/core.v4.js
// HundunOS v4.1 — 基于 v5 微内核的兼容层
//
// 此文件现在作为 v5 架构的兼容接口，保留 v4 API 但内部使用 v5 实现
//

import { createV4Adapter } from './v5/compat/v4-adapter.js';
import { createKernel } from './v5/index.js';

/**
 * CoreKernelV4 — v4 API 兼容层（基于 v5 微内核）
 *
 * 此实现保持与 v4.1 完全相同的 API，但内部使用 v5 微内核架构：
 * - 启动更快（懒加载插件）
 * - 内存占用更低
 * - 更好的错误隔离
 *
 * 使用方式：
 * ```js
 * import { CoreKernelV4 } from './core.v4.js';
 * const kernel = new CoreKernelV4({ projectRoot: '/path/to/project' });
 * await kernel.initialize();
 * ```
 */
class CoreKernelV4 {
    constructor(config = {}) {
        this._config = config;
        this._kernel = null;
        this._adapter = null;
        this.state = {
            initialized: false,
            running: false,
            version: '4.1.0-v5-compat',
            environment: config.environment || process.env.NODE_ENV || 'development',
        };
        this.config = config;
        this._modules = {};
        this.featureFlags = null;
    }

    /**
     * 初始化内核
     */
    async initialize() {
        if (this.state.initialized) return;

        // 创建 v5 内核
        this._kernel = createKernel(this._config);

        // 创建 v4 适配器
        this._adapter = createV4Adapter(this._kernel);

        // 初始化 v5 内核
        await this._kernel.initialize();

        // 同步状态
        this.state.initialized = true;
        this.state.running = true;

        // 暴露 v5 服务到 v4 API
        this._exposeServices();
    }

    /**
     * 暴露 v5 服务到 v4 API
     */
    _exposeServices() {
        const services = this._kernel.services;

        // 核心服务映射
        this.logger = services.get('logger');
        this.config = services.get('config') || this._config;
        this.cache = services.get('cache');
        this.database = services.get('database');
        this.api = services.get('api');
        this.security = services.get('security');

        // 功能服务映射
        this.modelRouter = services.get('modelRouter');
        this.agent = services.get('agent');
        this.rag = services.get('rag');
        this.tenant = services.get('tenant');
        this.billing = services.get('billing');

        // 事件总线
        this.events = this._kernel.events;
    }

    /**
     * 处理请求（v4 API）
     */
    async process(message, options = {}) {
        if (!this.state.initialized) {
            throw new Error('Kernel not initialized. Call initialize() first.');
        }

        return this._adapter.process(message, options);
    }

    /**
     * 获取状态（v4 API 兼容）
     */
    getStatus() {
        const v5Status = this._kernel?.getStatus?.() || {};

        return {
            version: this.state.version,
            running: this.state.running,
            uptime: process.uptime(),
            platform: this.config?.platform,
            modules: v5Status.plugins || { total: 0 },
            health: v5Status.health || { status: 'unknown' },
            sessions: { active: 0 },
            features: {
                enabled: this.featureFlags ? [] : [],
                total: 0,
            },
            // v5 架构信息
            architecture: {
                type: 'v5-microkernel',
                mode: 'v4-compat',
                plugins: v5Status.plugins?.loaded || [],
            },
        };
    }

    /**
     * 关闭内核
     */
    async shutdown() {
        if (!this._kernel) return;

        this.state.running = false;
        await this._kernel.shutdown();
        this.state.initialized = false;
    }

    /**
     * 获取服务（v4 API）
     */
    get(serviceName) {
        return this._kernel?.services?.get(serviceName);
    }

    /**
     * 注册服务（v4 API）
     */
    register(name, service) {
        return this._kernel?.services?.register(name, service);
    }

    /**
     * 事件监听（v4 API）
     */
    on(event, handler) {
        return this._kernel?.events?.on(event, handler);
    }

    /**
     * 触发事件（v4 API）
     */
    emit(event, data) {
        return this._kernel?.events?.emit(event, data);
    }

    /**
     * 获取日志记录器
     */
    getLogger(name) {
        return this.logger?.child?.({ component: name }) || this.logger;
    }

    /**
     * 获取配置
     */
    getConfig(path, defaultValue) {
        return this._adapter?.getConfig?.(path, defaultValue);
    }

    /**
     * 获取 Mixin（v4 API 兼容，返回空对象）
     */
    getMixin(name) {
        console.warn(`[CoreKernelV4] getMixin('${name}') is deprecated in v5. Use get('${name}') instead.`);
        return {};
    }

    /**
     * 使用 Mixin（v4 API 兼容，无操作）
     */
    useMixin(mixin) {
        console.warn('[CoreKernelV4] useMixin() is deprecated in v5. Use plugins instead.');
        return this;
    }

    /**
     * 注册阶段（v4 API 兼容，转换为事件监听）
     */
    onPhase(phase, handler) {
        console.warn(`[CoreKernelV4] onPhase('${phase}') is deprecated. Use events.on() instead.`);
        const eventMap = {
            'init': 'kernel:init',
            'ready': 'kernel:ready',
            'shutdown': 'kernel:shutdown',
        };
        return this.on(eventMap[phase] || phase, handler);
    }

    /**
     * 获取 Rust 健康状态
     */
    getRustHealth() {
        return { available: false, reason: 'Rust modules not available in v5 compat mode' };
    }

    /**
     * REST 请求处理（v4 API）
     */
    async _handleRestRequest(req, res) {
        if (this.api?._handleRequest) {
            return this.api._handleRequest(req, res);
        }
        res.writeHead(501);
        res.end(JSON.stringify({ error: 'REST API not available' }));
    }
}

// ─── 导出 ────────────────────────────────────────────────────────────

export { CoreKernelV4 };
export default CoreKernelV4;

// ─── 独立运行入口 ────────────────────────────────────────────────────

if (process.argv[1] === (await import('url')).fileURLToPath(import.meta.url)) {
    const kernel = new CoreKernelV4();

    process.on('SIGINT', async () => {
        await kernel.shutdown();
        process.exit(0);
    });

    kernel.initialize().then(() => {
        console.log('[CoreKernelV4] === HundunOS v4.1 (v5 Compat Mode) ===');
        console.log('[CoreKernelV4] Architecture: v5 Microkernel with v4 API');
        console.log('[CoreKernelV4] Status:', kernel.getStatus());

        if (process.argv[2]) {
            kernel.process({ content: process.argv.slice(2).join(' '), sessionId: 'cli' })
                .then(result => {
                    console.log(JSON.stringify(result, null, 2));
                    return kernel.shutdown();
                })
                .then(() => process.exit(0));
        }
    }).catch(e => {
        console.error('[CoreKernelV4] Fatal error:', e);
        process.exit(1);
    });
}
