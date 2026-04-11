// hundunos/kernel/mixins/ModuleMixin.js
// HundunOS v4.1 — ModuleMixin：20+ 模块初始化编排
// 来源：core.js initialize() Phase 1–6（所有模块 new + initialize()）
// 参考：MemOS BaseScheduler.init_modules() 分层初始化模式

import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// 所有动态 import 的根路径（相对于 kernel/mixins/ → 上两级到项目根）
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// 辅助函数：将 Windows 绝对路径转为 file:// URL（ESM import() 需要）
const _r = (subPath) => pathToFileURL(join(ROOT, subPath)).href;

/**
 * ModuleMixin — 所有核心模块的初始化编排
 *
 * 职责（从 core.js initialize() 提取）：
 * Phase 1 — 核心基础设施（Storage / MessageBus / Platform / EnvHealth）
 * Phase 2 — 安全模块（AuditLogger / PrivacyShield）
 * Phase 3 — 感知+路由（AwareSystem / ModuleRegistry / IntentEngine / MessageRouter）
 * Phase 4 — 权限+监控（PermissionGating / CoworkMonitor / RecoverableMemory）
 * Phase 5 — 模型路由（ModelRouter / HealthMonitor / ClientAdapter）
 * Phase 6 — 高级模块（UpgradeController / MemoryGraph / ToolBridge / Rust）
 * Phase 7 — 任务系统（TaskScientist / SkillSystem / Tracing / Citation / DeepResearch）
 * Phase 8 — 增强模块（ContextEnhancer / ToolScheduler / AgentTeams / MCPMgr / Provider / ComputerUse / Proactive / Compactor）
 * Phase 9 — Hook + REST + 注册完成
 *
 * v4.1: 从 430 行 initialize() 提取，按 phase 分离关注点
 */
export const ModuleMixin = class ModuleMixin {

    // ================================================================
    // Phase 分组初始化
    // ================================================================

    /**
     * init — MixinFactory 验证要求的方法（实现在 init_modules）
     * @param {CoreKernel} kernel
     */
    async init(kernel) { return this.init_modules(kernel); }

    /**
     * init_modules — 核心模块初始化（真实实现）
     * @param {CoreKernel} kernel
     */
    async init_modules(kernel) {
        const start = Date.now();
        console.log('[Kernel] HundunOS v4.1 initializing via Mixins...');

        // FIX-M3: 生产环境强制加密密钥检查
        if (kernel.config.environment === 'production') {
            if (!process.env.HUNDUNOS_ENCRYPTION_KEY) {
                throw new Error('[Kernel] Security: HUNDUNOS_ENCRYPTION_KEY required in production.');
            }
            if (process.env.HUNDUNOS_ENCRYPTION_KEY.length < 32) {
                throw new Error('[Kernel] Security: HUNDUNOS_ENCRYPTION_KEY must be >= 32 chars.');
            }
            console.log('[Kernel] Production security checks passed.');
        }

        // v3.6: Feature Flag 系统（最先执行）
        try {
            const { initFeatureFlags } = await import('../feature-flags.js');
            initFeatureFlags(kernel);
        } catch (e) {
            console.warn('[Kernel] FeatureFlags init failed:', e.message);
        }

        // Phase 1: 核心基础设施（延迟加载，失败即阻断）
        await this._initPhase1_infrastructure(kernel);

        // Phase 2: 安全模块（失败不阻断，启动警告）
        await this._initPhase2_security(kernel);

        // Phase 3: 感知 + 路由
        await this._initPhase3_awareness(kernel);

        // Phase 4: 权限 + 监控
        await this._initPhase4_permissions(kernel);

        // Phase 5: 模型路由
        await this._initPhase5_model(kernel);

        // Phase 6: Rust Core
        await this._initPhase6_rust(kernel);

        // Phase 7: 任务系统
        await this._initPhase7_tasks(kernel);

        // Phase 8: 增强模块
        await this._initPhase8_enhanced(kernel);

        // Phase 9: Hook + REST（由 HookMixin / RestMixin 提供）
        // 已在 _initMixins 调用链中处理

        kernel._registerBuiltInModules();
        kernel.state.initialized = true;
        kernel.state.running = true;

        const elapsed = Date.now() - start;
        console.log(`[Kernel] Registered modules: ${kernel.moduleRegistry?.getRegisteredIds?.()?.join(', ') || 'N/A'}`);
        console.log(`[Kernel] HundunOS v4.1 ready in ${elapsed}ms (Mixin composition)`);
        kernel.emit('kernel:ready', { elapsed, modules: kernel.moduleRegistry?.count?.() || 0 });
    }

    // ── Phase 1: 核心基础设施 ──────────────────────────────────────

    async _initPhase1_infrastructure(k) {
        const _ri = async (p, key) => {
            try {
                const m = await import(p);
                return m[key] || m.default || m;
            } catch (e) {
                throw new Error(`Required module load failed for ${key} (${p}): ${e.message}`);
            }
        };

        const [
            _Storage_class,
            _MessageBus_class,
            _WindowsAdapter_class,
            _EnvHealthChecker_class,
        ] = await Promise.all([
            _ri(_r('infrastructure/storage/index.js'), 'Storage'),
            _ri(_r('infrastructure/message-bus/index.js'), 'MessageBus'),
            _ri(_r('infrastructure/platform-adapter/windows.js'), 'WindowsAdapter'),
            _ri(_r('stable-modules/env-health-checker/index.js'), 'EnvHealthChecker'),
        ]);

        // Storage
        mkdirSync(k.config.storageDir, { recursive: true });
        k.storage = new _Storage_class({ dir: k.config.storageDir });
        await k.storage.initialize();

        // Platform
        k.platform = new _WindowsAdapter_class();
        k.platform.kernel = k;
        k.env = await k.platform.detect();
        console.log(`[Kernel] Platform: ${k.env.platform}`);
        console.log(`[Kernel] Python: ${k.env.python?.available ? k.env.python.version : 'NOT FOUND'}`);
        console.log(`[Kernel] Ollama: ${k.env.ollama?.available ? 'running' : 'NOT FOUND'}`);

        // MessageBus
        k.messageBus = new _MessageBus_class(k);
        await k.messageBus.initialize();

        // EnvHealthChecker
        k.envHealth = new _EnvHealthChecker_class(k);
        const health = await k.envHealth.checkAll().catch(() => ({ status: 'unknown' }));
        if (health.issues?.length > 0) {
            console.warn('[Kernel] Env issues:', health.issues.map(i => i.name).join(', '));
        }
    }

    // ── Phase 2: 安全模块 ──────────────────────────────────────────

    async _initPhase2_security(k) {
        const _li = async (path, key) => {
            try {
                const m = await import(path);
                const cls = m[key] || m.default;
                const inst = new cls(k);
                await inst.initialize?.().catch(e => console.warn(`[Kernel] ${key} init failed:`, e.message));
                return inst;
            } catch (e) {
                console.warn(`[Kernel] ${key} init failed:`, e.message);
                return null;
            }
        };

        const [_AuditLogger_class, _PrivacyShield_class] = await Promise.all([
            import(_r('stable-modules/audit-logger/index.js')).then(m => m.AuditLogger),
            import(_r('stable-modules/privacy-shield/index.js')).then(m => m.PrivacyShield),
        ]);

        k.auditLogger = new _AuditLogger_class(k);
        await k.auditLogger.initialize().catch(e => console.warn('[Kernel] AuditLogger init failed:', e.message));

        k.privacyShield = new _PrivacyShield_class(k);
        await k.privacyShield.initialize().catch(e => console.warn('[Kernel] PrivacyShield init failed:', e.message));
    }

    // ── Phase 3: 感知 + 路由 ───────────────────────────────────────

    async _initPhase3_awareness(k) {
        const _li = async (path, key) => {
            try {
                const m = await import(path);
                const cls = m[key] || m.default;
                const inst = new cls(k);
                await inst.initialize?.().catch(e => console.warn(`[Kernel] ${key} init failed:`, e.message));
                return inst;
            } catch (e) {
                console.warn(`[Kernel] ${key} init failed:`, e.message);
                return null;
            }
        };

        const [_AwareSystem_class, _ModuleRegistry_class, _IntentEngine_class, _MessageRouter_class] =
            await Promise.all([
                import('../aware-system.js').then(m => m.AwareSystem),
                import('../module-registry.js').then(m => m.ModuleRegistry),
                import('../intent-engine.js').then(m => m.IntentEngine),
                import('../message-router.js').then(m => m.MessageRouter),
            ]);

        k.aware = new _AwareSystem_class(k);
        await k.aware.initialize().catch(e => console.warn('[Kernel] AwareSystem init failed:', e.message));

        k.moduleRegistry = new _ModuleRegistry_class(k);
        await k.moduleRegistry.initialize().catch(e => console.warn('[Kernel] ModuleRegistry init failed:', e.message));

        k.intentEngine = new _IntentEngine_class(k);
        await k.intentEngine.initialize().catch(e => console.warn('[Kernel] IntentEngine init failed:', e.message));

        k.messageRouter = new _MessageRouter_class(k);
        await k.messageRouter.initialize().catch(e => console.warn('[Kernel] MessageRouter init failed:', e.message));
    }

    // ── Phase 4: 权限 + 监控 ───────────────────────────────────────

    async _initPhase4_permissions(k) {
        const _li = async (path, key) => {
            try {
                const m = await import(path);
                const cls = m[key] || m.default;
                const inst = new cls(k);
                await inst.initialize?.().catch(e => console.warn(`[Kernel] ${key} init failed:`, e.message));
                return inst;
            } catch (e) {
                console.warn(`[Kernel] ${key} init failed:`, e.message);
                return null;
            }
        };

        const [_PermissionGating_class, _CoworkMonitor_class, _RecoverableMemory_class] =
            await Promise.all([
                import(_r('stable-modules/permission-gating/index.js')).then(m => m.PermissionGating),
                import(_r('stable-modules/cowork-monitor/index.js')).then(m => m.CoworkMonitor),
                import(_r('stable-modules/recoverable-memory/index.js')).then(m => m.RecoverableMemory),
            ]);

        k.permissionGating = new _PermissionGating_class(k);
        await k.permissionGating.initialize().catch(e => console.warn('[Kernel] PermissionGating init failed:', e.message));

        k.coworkMonitor = new _CoworkMonitor_class(k);
        await k.coworkMonitor.initialize().catch(e => console.warn('[Kernel] CoworkMonitor init failed:', e.message));

        k.recoverableMemory = new _RecoverableMemory_class(k);
        await k.recoverableMemory.initialize().catch(e => console.warn('[Kernel] RecoverableMemory init failed:', e.message));
    }

    // ── Phase 5: 模型路由 ──────────────────────────────────────────

    async _initPhase5_model(k) {
        // ModelRouter
        try {
            const { ModelRouter } = await import(_r('model-router/index.js'));
            k.modelRouter = new ModelRouter(k);
            await k.modelRouter.initialize();
            console.log(`[Kernel] ModelRouter: initialized`);
        } catch (e) {
            console.warn('[Kernel] ModelRouter init failed:', e.message);
        }

        // HealthMonitor
        try {
            const { HealthMonitor } = await import(_r('health-monitor/index.js'));
            k.healthMonitor = new HealthMonitor(k);
            await k.healthMonitor.checkAll();
            console.log(`[Kernel] HealthMonitor: score=${k.healthMonitor.history?.[0]?.overall?.score}`);
        } catch (e) {
            console.warn('[Kernel] HealthMonitor init failed:', e.message);
        }

        // ClientAdapter
        try {
            const { ClientAdapterModule } = await import(_r('stable-modules/client-adapter-module/index.js'));
            k.clientAdapter = new ClientAdapterModule(k);
            await k.clientAdapter.initialize();
            console.log(`[Kernel] ClientAdapter: ${k.clientAdapter.getActiveAdapter()?.name || 'none'}`);
        } catch (e) {
            console.warn('[Kernel] ClientAdapter init failed:', e.message);
        }
    }

    // ── Phase 6: Rust Core ─────────────────────────────────────────

    async _initPhase6_rust(k) {
        try {
            const { RustModules } = await import(_r('adapters/rust-modules/index.js'));
            k.rust = new RustModules({
                enabled: k.config.system?.rustModules?.enabled ?? true,
                mode: k.config.system?.rustModules?.mode ?? 'auto',
                tcpPort: k.config.system?.rustModules?.tcpPort ?? 38082,
                socketPath: k.config.system?.rustModules?.socketPath,
                binaryRoot: k.config.system?.rustModules?.binaryRoot,
                fallbackToJS: k.config.system?.rustModules?.fallbackToJS ?? true,
            });
            const rustHealth = await k.rust.initialize().catch(e => ({ allHealthy: false, error: e.message }));
            k.rustHealth = rustHealth;
            if (rustHealth.allHealthy) {
                console.log(`[Kernel] RustModules: ✓ ${rustHealth.transport || 'daemon'} — all modules healthy`);
            } else {
                console.warn(`[Kernel] RustModules: ✗ daemon unavailable — using JS fallback`);
            }
            // 暴露快捷引用
            if (k.rust) {
                k.rustTool = k.rust.tool;
                k.rustMemory = k.rust.memory;
                k.rustRouter = k.rust.router;
                k.rustPolicy = k.rust.policy;
                k.rustScientist = k.rust.scientist;
            }
        } catch (e) {
            console.warn('[Kernel] RustModules init failed:', e.message);
            k.rust = null;
            k.rustHealth = { allHealthy: false, error: e.message };
        }
    }

    // ── Phase 7: 任务系统 ─────────────────────────────────────────

    async _initPhase7_tasks(k) {
        // TaskScientist + MemoryTool
        try {
            const { TaskScientist } = await import(_r('kernel/task-scientist.js'));
            const { TaskScientistMemoryTool } = await import(_r('kernel/task-scientist-memory-tool.js'));
            k.taskScientist = new TaskScientist(k);
            await k.taskScientist.initialize();
            k.taskScientistMemoryTool = new TaskScientistMemoryTool(k.memoryGraph);
            k.taskScientist.setMemoryTool(k.taskScientistMemoryTool);
            const status = k.taskScientist.getStatus();
            const memStats = k.taskScientistMemoryTool.getStats();
            console.log(`[Kernel] TaskScientist: ${status.engine} — ${status.activeTasks} active — memory: ${memStats.recentCount} recent`);
        } catch (e) {
            console.warn('[Kernel] TaskScientist init failed:', e.message);
        }

        // SkillSystem
        try {
            const { SkillRegistry } = await import(_r('skills/skill-registry.js'));
            const { SkillRunner } = await import(_r('skills/skill-runner.js'));
            const { SkillContextInjector } = await import(_r('skills/skill-context-injector.js'));
            const { SkillMarket } = await import(_r('skills/skill-market.js'));
            k.skills = new SkillRegistry(k);
            await k.skills.initialize();
            k.skills.runner = new SkillRunner(k.skills);
            k.skills.injector = new SkillContextInjector(k.skills);
            k.skills.market = new SkillMarket(k.skills);
            const stats = k.skills.getStats();
            console.log(`[Kernel] Skills: ${stats.totalSkills} local — market: ${k.skills.market.list().length} official`);
        } catch (e) {
            console.warn('[Kernel] Skill system init failed:', e.message);
        }

        // Onyx 优化模块
        try {
            const { HundunTracer } = await import(_r('kernel/tracing.js'));
            const { CitationProcessor } = await import(_r('kernel/citation-processor.js'));
            const { DeepResearchOrchestrator } = await import(_r('kernel/deep-research.js'));
            const { errors, HundunOSErrorCode } = await import(_r('kernel/error-codes.js'));

            k.tracing = new HundunTracer(k);
            k.citationProcessor = new CitationProcessor(k);
            await k.citationProcessor.initialize?.().catch(e =>
                console.warn('[Kernel] CitationProcessor init failed:', e.message));
            k.deepResearch = new DeepResearchOrchestrator(k);
            await k.deepResearch.initialize?.().catch(e =>
                console.warn('[Kernel] DeepResearch init failed:', e.message));
            k.errors = errors;
            k.errorCodes = HundunOSErrorCode;
        } catch (e) {
            console.warn('[Kernel] Onyx modules init failed:', e.message);
        }
    }

    // ── Phase 8: 增强模块 ──────────────────────────────────────────

    async _initPhase8_enhanced(k) {
        // ContextEnhancer
        try {
            const { ContextEnhancer } = await import(_r('kernel/context-enhancer.js'));
            k.contextEnhancer = new ContextEnhancer(k);
            await k.contextEnhancer.initialize();
        } catch (e) {
            console.warn('[Kernel] ContextEnhancer init failed:', e.message);
        }

        // ToolScheduler
        try {
            const { ToolScheduler } = await import(_r('kernel/tool-scheduler.js'));
            k.toolScheduler = new ToolScheduler(k.toolBridge, {
                maxConcurrency: k.config.system?.toolScheduler?.maxConcurrency || 10,
                enableRwSplit: true,
            });
            console.log('[Kernel] ToolScheduler: RW split enabled');
        } catch (e) {
            console.warn('[Kernel] ToolScheduler init failed:', e.message);
        }

        // AgentTeams
        try {
            const { AgentTeamManager } = await import(_r('agent-teams/manager.js'));
            k.agentTeams = new AgentTeamManager(k);
            await k.agentTeams.initialize();
        } catch (e) {
            const { AgentTeams } = await import(_r('agent-teams/index.js')).catch(() => ({ AgentTeams: null }));
            if (AgentTeams) {
                k.agentTeams = new AgentTeams({ kernel: k });
                console.log('[Kernel] AgentTeams: legacy mode');
            } else {
                console.warn('[Kernel] AgentTeams init failed:', e.message);
            }
        }

        // MCP Manager
        try {
            const { McpClientManager } = await import(_r('mcp/index.js'));
            k.mcpManager = new McpClientManager(k);
            await k.mcpManager.initialize();
        } catch (e) {
            console.warn('[Kernel] McpManager init failed:', e.message);
        }

        // Provider Compat
        try {
            const { UnifiedProvider } = await import(_r('providers/provider-compat.js'));
            k.unifiedProvider = new UnifiedProvider(k);
            console.log('[Kernel] UnifiedProvider:', k.unifiedProvider.listProviders().join(', '));
        } catch (e) {
            console.warn('[Kernel] UnifiedProvider init failed:', e.message);
        }

        // ComputerUse
        try {
            const { ComputerUse } = await import(_r('computer-use/computer-use.js'));
            k.computerUse = new ComputerUse(k);
            console.log('[Kernel] ComputerUse:', k.computerUse.enabled ? 'enabled' : 'disabled');
        } catch (e) {
            console.warn('[Kernel] ComputerUse init failed:', e.message);
        }

        // Proactive
        try {
            const { ProactiveManager } = await import(_r('proactive/proactive.js'));
            k.proactive = new ProactiveManager(k);
            k.proactive.start(30_000);
        } catch (e) {
            console.warn('[Kernel] ProactiveManager init failed:', e.message);
        }

        // SessionCompactor
        try {
            const { SessionCompactor } = await import(_r('compact/compactor.js'));
            k.compactor = new SessionCompactor(k);
        } catch (e) {
            console.warn('[Kernel] SessionCompactor init failed:', e.message);
        }

        // AgentTeam Tools
        try {
            const { registerAgentTeamTools } = await import(_r('agent-teams/agent-tools.js'));
            if (registerAgentTeamTools && k.toolBridge) {
                const count = registerAgentTeamTools(k.toolBridge);
                console.log(`[Kernel] Registered ${count} AgentTeam tools`);
            }
        } catch (e) {
            console.warn('[Kernel] AgentTeam tools registration failed:', e.message);
        }

        // v3.8+ 核心模块（依赖前面 Phase）
        try {
            const { UpgradeController } = await import(_r('kernel/upgrade-controller.js'));
            k.upgradeController = new UpgradeController(k);
            await k.upgradeController.initialize().catch(e =>
                console.warn('[Kernel] UpgradeController init failed:', e.message));
        } catch (e) {
            console.warn('[Kernel] UpgradeController init failed:', e.message);
        }

        try {
            const { MemoryGraph } = await import(_r('kernel/memory-graph.js'));
            k.memoryGraph = new MemoryGraph(k);
            await k.memoryGraph.initialize().catch(e =>
                console.warn('[Kernel] MemoryGraph init failed:', e.message));
        } catch (e) {
            console.warn('[Kernel] MemoryGraph init failed:', e.message);
        }

        try {
            const { ToolBridge } = await import(_r('kernel/tool-bridge.js'));
            k.toolBridge = new ToolBridge(k);
            await k.toolBridge.initialize().catch(e =>
                console.warn('[Kernel] ToolBridge init failed:', e.message));
        } catch (e) {
            console.warn('[Kernel] ToolBridge init failed:', e.message);
        }
    }

    // ================================================================
    // 内置模块注册（被 init() 末尾调用）
    // ================================================================

    _registerBuiltInModules() {
        const builtins = [
            {
                id: 'status',
                name: 'Kernel Status',
                type: 'kernel',
                instance: { execute: async () => ({ success: true, status: this.getStatus() }) },
            },
            {
                id: 'shutdown',
                name: 'Kernel Shutdown',
                type: 'kernel',
                instance: {
                    execute: async () => {
                        await this.shutdown();
                        return { success: true, message: 'Kernel shutdown complete' };
                    },
                },
            },
            {
                id: 'modelRouter',
                name: 'Model Router',
                type: 'kernel',
                instance: {
                    execute: async (intent, session) => this.modelRouter?.route?.(intent, session),
                    shutdown: async () => this.modelRouter?.shutdown?.(),
                },
            },
            {
                id: 'aware',
                name: 'Aware System',
                type: 'kernel',
                instance: {
                    execute: async () => ({ success: true, aware: this.aware?.getSummary?.() || {} }),
                    shutdown: async () => this.aware?.shutdown?.(),
                },
            },
            {
                id: 'permissionGating',
                name: 'Permission Gating',
                type: 'stable',
                instance: { execute: async () => ({ success: true, stats: this.permissionGating?.getStats?.() || {} }) },
            },
            {
                id: 'auditLogger',
                name: 'Audit Logger',
                type: 'stable',
                instance: {
                    execute: async () => ({ success: true, stats: this.auditLogger?.getStats?.() || {} }),
                    shutdown: async () => this.auditLogger?.shutdown?.(),
                },
            },
            {
                id: 'privacyShield',
                name: 'Privacy Shield',
                type: 'stable',
                instance: { execute: async () => ({ success: true, stats: this.privacyShield?.getStats?.() || {} }) },
            },
            {
                id: 'recoverableMemory',
                name: 'Recoverable Memory',
                type: 'stable',
                instance: {
                    execute: async () => ({ success: true, stats: this.recoverableMemory?.getStats?.() || {} }),
                    shutdown: async () => this.recoverableMemory?.shutdown?.(),
                },
            },
            {
                id: 'memoryGraph',
                name: 'Memory Graph',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'recall') return this.memoryGraph?.recall?.(intent.query);
                        if (intent?.action === 'record') return this.memoryGraph?.record?.(intent.input, intent.metadata, intent.result);
                        if (intent?.action === 'advancedSearch') return this.memoryGraph?.advancedSearch?.(intent.query, intent.options);
                        if (intent?.action === 'cotSearch') return this.memoryGraph?.cotSearch?.(intent.query, intent.options);
                        return { success: true, stats: this.memoryGraph?.getStats?.() || {} };
                    },
                },
            },
            {
                id: 'toolBridge',
                name: 'Tool Bridge',
                type: 'kernel',
                instance: {
                    execute: async (intent) => this.toolBridge?.execute?.(intent?.tool, intent?.args),
                    shutdown: async () => this.toolBridge?.shutdown?.(),
                },
            },
        ];

        for (const mod of builtins) {
            try {
                this.moduleRegistry?.register?.(mod);
            } catch (_) { /* ignore duplicate */ }
        }
    }

    // ================================================================
    // getMixinStatus — ModuleMixin 贡献的状态
    // ================================================================
    getMixinStatus_Modules() {
        return {
            modules: this.moduleRegistry?.getStats?.() || { total: 0 },
        };
    }
};

export default ModuleMixin;
