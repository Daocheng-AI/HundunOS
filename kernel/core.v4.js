// hundunos/kernel/core.v4.js
// HundunOS v4.1 — Mixin 组合架构版内核
// 基于 MemOS BaseScheduler Mixin Pattern 重构
//
// 架构设计：
// - CoreMixin       → 配置、状态、生命周期、工具方法
// - ModuleMixin     → 20+ 模块初始化（Phase 1-8）
// - ProcessMixin    → 主入口 process() + 编排
// - SessionMixin    → 会话管理 + Subagent
// - RestMixin       → REST API 端点 + Hook 系统
//
// 与 core.js 完全功能等价，支持渐进替换
// core.js 保持为稳定版本；新项目可导入 core.v4.js

import { EventEmitter } from 'events';
import { mkdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname, isAbsolute, normalize } from 'path';
import { fileURLToPath } from 'url';

import { MixinFactory, DEFAULT_MIXINS } from './mixins/index.js';
import { CoreMixin } from './mixins/CoreMixin.js';
import { ModuleMixin } from './mixins/ModuleMixin.js';
import { ProcessMixin } from './mixins/ProcessMixin.js';
import { SessionMixin } from './mixins/SessionMixin.js';
import { RestMixin } from './mixins/RestMixin.js';
import { deepMerge, resolveProjectPath } from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_ROOT = process.env.HUNDUNOS_WS || join(__dirname, '..');
const DEFAULT_STORAGE_DIR = '.hundunos';
const DEFAULT_CONFIG_PATH = join('config', 'system.json');

// ─── 构建组合基类 ────────────────────────────────────────────────────

const KernelBase = MixinFactory.create(
    CoreMixin,
    ModuleMixin,
    ProcessMixin,
    SessionMixin,
    RestMixin,
);

// ─── CoreKernelV4 ────────────────────────────────────────────────────

/**
 * CoreKernelV4 — 基于 Mixin 组合的 HundunOS 内核
 *
 * 与 CoreKernel（core.js）功能完全等价，但架构更清晰：
 * - 81KB monolith → 5 个独立 Mixin（各 ~200 行）
 * - 430 行 initialize() → 9 个 phase 方法（各 ~50 行）
 * - 300 行 REST 处理 → RestMixin 独立模块
 *
 * 使用方式：
 * ```js
 * import { CoreKernelV4 } from './core.v4.js';
 * const kernel = new CoreKernelV4({ projectRoot: '/path/to/project' });
 * await kernel.initialize();
 * ```
 */
class CoreKernelV4 extends KernelBase {
    constructor(config = {}) {
        super();

        // ── Phase: config ── 配置加载与合并 ────────────────────

        const projectRoot = resolveProjectPath(
            config.projectRoot || process.env.HUNDUNOS_PROJECT_ROOT || DEFAULT_PROJECT_ROOT,
            __dirname,
        );

        const environment = config.environment || process.env.NODE_ENV || 'development';

        // 加载系统配置
        const systemConfigPath = resolveProjectPath(
            config.systemConfigPath || DEFAULT_CONFIG_PATH,
            projectRoot,
        );
        const systemConfig = this._loadSystemConfig(systemConfigPath);

        // 环境覆盖配置
        const envConfigPath = systemConfigPath.replace('system.json', `system.${environment}.json`);
        const envConfig = this._loadSystemConfig(envConfigPath);

        // 三层合并：系统配置 → 环境覆盖 → 构造参数
        const mergedSystemConfig = deepMerge(
            deepMerge(systemConfig, envConfig),
            config.system || {},
        );
        mergedSystemConfig.environment = environment;

        // 工作区路径
        const workspace = resolveProjectPath(
            config.workspace ||
            mergedSystemConfig.platform?.workspace ||
            process.env.HUNDUNOS_WORKSPACE ||
            '.',
            projectRoot,
        );

        // 存储目录
        const storageDir = resolveProjectPath(
            config.storageDir ||
            mergedSystemConfig.storage?.path ||
            DEFAULT_STORAGE_DIR,
            projectRoot,
        );

        this.config = {
            ...config,
            environment,
            workspace,
            projectRoot,
            storageDir,
            system: mergedSystemConfig,
        };

        // review: removed // review: removed console.log(`[Kernel] Initialized for ${environment} environment`);
        // review: removed // review: removed console.log(`[Kernel] Project root: ${projectRoot}`);
        // review: removed // review: removed console.log(`[Kernel] Workspace: ${workspace}`);

        // ── 状态 ───────────────────────────────────────────────
        this.state = {
            initialized: false,
            running: false,
            modules: new Map(),
            sessions: new Map(),
            version: '4.1.0',
            environment,
        };
        this._modules = {};

        // v3.6: Feature Flag 系统
        this.featureFlags = null;
    }

    // ── initialize() — Mixin 驱动初始化 ─────────────────────────

    async initialize() {
        if (this.state.initialized) return;

        // 1. 平台安全验证（CoreMixin）
        await this.init_platform(this);

        // 2. 主要模块初始化（ModuleMixin，Phase 1-8）
        // init_modules 会被 MixinFactory 跳过（与 init 同名），需显式调用
        await this.init_modules(this);

        // 3. Hook 系统（RestMixin）
        await this.init_hooks(this);

        // 4. REST 服务器（RestMixin）
        await this.init_rest_api(this);

        this.state.initialized = true;
        this.state.running = true;
    }

    // ── shutdown() — 核心关闭 ────────────────────────────────────

    async shutdown() {
        // review: removed // review: removed console.log('[Kernel] Shutting down...');
        this.state.running = false;

        const tasks = [];
        if (this.moduleRegistry?.shutdownAll) tasks.push(this.moduleRegistry.shutdownAll().catch(() => {}));
        if (this.recoverableMemory?.shutdown) tasks.push(this.recoverableMemory.shutdown().catch(() => {}));
        else if (this.recoverableMemory?.persist) tasks.push(this.recoverableMemory.persist().catch(() => {}));
        if (this.aware?.persist) tasks.push(this.aware.persist().catch(() => {}));
        if (this.auditLogger?.shutdown) tasks.push(this.auditLogger.shutdown().catch(() => {}));
        else if (this.auditLogger?.persist) tasks.push(this.auditLogger.persist().catch(() => {}));
        if (this.modelRouter?.persistStats) tasks.push(this.modelRouter.persistStats().catch(() => {}));

        if (this.proactive?.stop) this.proactive.stop();
        if (this.compactor) tasks.push(Promise.resolve());
        if (this.computerUse) tasks.push(Promise.resolve());

        if (this.storage?.shutdown) tasks.push(this.storage.shutdown().catch(() => {}));
        if (this.messageBus?.shutdown) tasks.push(this.messageBus.shutdown().catch(() => {}));
        if (this.rateLimiter?.shutdown) this.rateLimiter.shutdown();
        if (this.restServer?.stop) tasks.push(this.restServer.stop());

        await Promise.allSettled(tasks);
        // review: removed // review: removed console.log('[Kernel] Shutdown complete');
    }

    // ── getStatus() — 完整状态报告 ────────────────────────────────

    getStatus() {
        const base = {
            version: this.state.version,
            running: this.state.running,
            uptime: process.uptime(),
            platform: this.env?.platform,
            modules: this.moduleRegistry?.getStats?.() || { total: 0 },
            aware: this.aware?.getStats?.() || {},
            health: this.envHealth?.getReport?.() || { status: 'unknown' },
            modelRouter: this.modelRouter?.getStats?.() || null,
            sessions: { active: this.state.sessions?.size || 0 },
            rateLimit: this.rateLimiter?.getStats?.() || null,
            features: {
                enabled: this.featureFlags ? this.featureFlags.listEnabledFeatures?.() || [] : [],
                total: this.featureFlags ? Object.keys(this.featureFlags.FEATURE_REGISTRY || {}).length : 0,
            },
            contextEnhancer: this.contextEnhancer?.getCacheStats?.() || null,
            toolScheduler: this.toolScheduler?.getStats?.() || null,
            proactive: this.proactive?.getStats?.() || null,
            compactor: this.compactor?.getStats?.() || null,
            mcp: this.mcpManager ? { servers: this.mcpManager.clients?.size || 0 } : null,
            computerUse: this.computerUse?.enabled || false,
            agentTeams: this.agentTeams ? { teams: this.agentTeams.list?.()?.length || 0 } : null,
            rust: this.rustHealth || null,
            taskScientist: this.taskScientist?.getStatus() || null,
            skills: this.skills?.getStats() || null,
            hooks: {
                available: !!this.hooks,
                events: this.hooks ? Object.keys(this.hooks.getHooks?.() || {}) : [],
                loaderStats: this.hooks?.loader?.getStats?.() || null,
            },
            restServer: {
                available: !!this.restServer,
                port: this.restServer?.port || null,
                running: !!this.restServer?.server,
            },
            // v4.1: Mixin 组成信息
            mixins: {
                architecture: 'v4.1-mixin-composition',
                sources: KernelBase._mixinSources || [],
                memoryGraph: {
                    advancedSearcher: true,
                    taskGoalParser: true,
                    memoryReorganizer: !!this.memoryGraph?.getReorganizerStats,
                    activationMemory: !!this.memoryGraph?.activationMemory,
                },
                awareSystem: { preferenceExtractor: !!this.aware?.preferenceExtractor },
                toolBridge: {
                    trajectoryMemory: !!this.toolBridge?.trajectoryMemory,
                    trajectoryStats: this.toolBridge?.trajectoryMemory?.getStats?.() || null,
                },
            },
        };

        // 合并各 Mixin 的扩展状态
        return { ...base, ...this._collectMixinStatus() };
    }

    // ── getRustHealth() ──────────────────────────────────────────

    getRustHealth() {
        if (!this.rust) return { available: false, reason: 'RustModules not initialized' };
        return {
            available: this.rustHealth?.allHealthy ?? false,
            transport: this.rust.getTransportInfo?.() || this.rustHealth?.transport || 'unknown',
            modules: this.rustHealth?.modules || {},
            daemonVersion: this.rustHealth?.daemonVersion || null,
            error: this.rustHealth?.error || null,
        };
    }

    // ── REST 入口（由 RestServer 调用） ──────────────────────────

    async _handleRestRequest(req, res) {
        return RestMixin.prototype._routeRest.call(
            this,
            new URL(req.url, 'http://localhost').pathname,
            req,
            res,
            new URL(req.url, 'http://localhost'),
        );
    }
}

// ─── 导出 ────────────────────────────────────────────────────────────

export { CoreKernelV4 };
export default CoreKernelV4;

// ─── 独立运行入口 ────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const kernel = new CoreKernelV4();

    kernel.on('kernel:ready', async () => {
        // review: removed // review: removed console.log('[Kernel] === HundunOS v4.1 Mixin Composition Mode ===');
        // review: removed // review: removed console.log('[Kernel] Architecture: Mixin-based (5 mixins)');
        // review: removed // review: removed console.log('[Kernel] Mixin sources:', KernelBase._mixinSources?.join(', ') || 'N/A');
        // review: removed // review: removed console.log('[Kernel] Type messages or press Ctrl+C to exit');

        process.on('SIGINT', async () => {
            // review: removed // review: removed console.log('\n[Kernel] Shutting down...');
            await kernel.shutdown();
            process.exit(0);
        });
    });

    kernel.initialize().catch(e => {
        console.error('[Kernel] Fatal error:', e);
        process.exit(1);
    });

    if (process.argv[2]) {
        (async () => {
            const result = await kernel.process({ content: process.argv.slice(2).join(' '), sessionId: 'cli' });
            // review: removed // review: removed console.log(JSON.stringify(result, null, 2));
            await kernel.shutdown();
            process.exit(0);
        })();
    }
}
