// hundunos/kernel/mixins/ModuleMixin.js
// HundunOS v4.1 — ModuleMixin：20+ 模块初始化编排
// 来源：core.js initialize() Phase 1–6（所有模块 new + initialize()）
// 参考：MemOS BaseScheduler.init_modules() 分层初始化模式

import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { errorManager, ErrorType } from '../error-manager.js';
import { envManager } from '../config/env-manager.js';

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
    // 共享辅助方法
    // ================================================================

    /**
     * 加载并初始化模块
     * @param {string} path - 模块路径
     * @param {string} key - 模块导出的键名
     * @returns {Promise<{success:boolean, instance?:any, error?:Error}>}
     */
    async _li(path, key) {
        try {
            const m = await import(path);
            const cls = m[key] || m.default;
            const inst = new cls(this.kernel);
            await inst.initialize?.().catch(e => console.warn(`[Kernel] ${key} init failed:`, e.message));
            return { success: true, instance: inst };
        } catch (e) {
            console.warn(`[Kernel] ${key} init failed:`, e.message);
            return { success: false, error: e };
        }
    }

    // ================================================================
    // Phase 分组初始化
    // ================================================================

    /**
     * init — MixinFactory 验证要求的方法（实现在 init_modules）
     * @param {CoreKernel} kernel
     */
    async init(kernel) { 
        this.kernel = kernel;
        return this.init_modules(kernel); 
    }

    /**
     * init_modules — 核心模块初始化（真实实现）
     * @param {CoreKernel} kernel
     */
    async init_modules(kernel) {
        this.kernel = kernel;
        const start = Date.now();
        // console.log('[Kernel] HundunOS v4.1 initializing via Mixins...');

        // FIX-M3: 生产环境强制加密密钥检查
        if (kernel.config.environment === 'production') {
            try {
                const encryptionKey = envManager.require('HUNDUNOS_ENCRYPTION_KEY', 'HUNDUNOS_ENCRYPTION_KEY is required in production');
                if (encryptionKey.length < 32) {
                    throw errorManager.createError(
                        'HUNDUNOS_ENCRYPTION_KEY must be >= 32 chars',
                        ErrorType.SECURITY,
                        'ENCRYPTION_KEY_TOO_SHORT'
                    );
                }
                // console.log('[Kernel] Production security checks passed.');
            } catch (error) {
                throw errorManager.createError(
                    'Production security check failed',
                    ErrorType.SECURITY,
                    'SECURITY_CHECK_FAILED',
                    { error: error.message }
                );
            }
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
        // console.log(`[Kernel] Registered modules: ${kernel.moduleRegistry?.getRegisteredIds?.()?.join(', ') || 'N/A'}`);
        // console.log(`[Kernel] HundunOS v4.1 ready in ${elapsed}ms (Mixin composition)`);
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
        // console.log(`[Kernel] Platform: ${k.env.platform}`);
        // console.log(`[Kernel] Python: ${k.env.python?.available ? k.env.python.version : 'NOT FOUND'}`);
        // console.log(`[Kernel] Ollama: ${k.env.ollama?.available ? 'running' : 'NOT FOUND'}`);

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
            const { ModelRouter } = await import(_r('kernel/model-router/index.js'));
            k.modelRouter = new ModelRouter(k);
            await k.modelRouter.initialize();
            // console.log(`[Kernel] ModelRouter: initialized`);
        } catch (e) {
            console.warn('[Kernel] ModelRouter init failed:', e.message);
        }

        // HealthMonitor
        try {
            const { HealthMonitor } = await import(_r('kernel/health-monitor/index.js'));
            k.healthMonitor = new HealthMonitor(k);
            await k.healthMonitor.checkAll();
            // console.log(`[Kernel] HealthMonitor: score=${k.healthMonitor.history?.[0]?.overall?.score}`);
        } catch (e) {
            console.warn('[Kernel] HealthMonitor init failed:', e.message);
        }

        // ClientAdapter
        try {
            const { ClientAdapterModule } = await import(_r('stable-modules/client-adapter-module/index.js'));
            k.clientAdapter = new ClientAdapterModule(k);
            await k.clientAdapter.initialize();
            // console.log(`[Kernel] ClientAdapter: ${k.clientAdapter.getActiveAdapter()?.name || 'none'}`);
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
                // console.log(`[Kernel] RustModules: ✓ ${rustHealth.transport || 'daemon'} — all modules healthy`);
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

        // Supermemory 集成
        if (k.config.system.supermemory?.enabled) {
            try {
                const { SupermemoryMixin } = await import(_r('kernel/supermemory/supermemory-mixin.js'));
                const supermemoryMixin = new SupermemoryMixin();
                await supermemoryMixin.init_supermemory(k);
                k._modules.supermemory = supermemoryMixin;
            } catch (e) {
                console.warn('[Kernel] Supermemory integration failed:', e.message);
            }
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
            // console.log(`[Kernel] TaskScientist: ${status.engine} — ${status.activeTasks} active — memory: ${memStats.recentCount} recent`);
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
            // console.log(`[Kernel] Skills: ${stats.totalSkills} local — market: ${k.skills.market.list().length} official`);
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
        await this._initContextModules(k);
        await this._initTeamModules(k);
        await this._initProviderModules(k);
        await this._initCompressionModules(k);
    }

    /**
     * 初始化上下文相关模块
     * @param {CoreKernel} k - 内核实例
     */
    async _initContextModules(k) {
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
        } catch (e) {
            console.warn('[Kernel] ToolScheduler init failed:', e.message);
        }

        // Proactive
        try {
            const { ProactiveManager } = await import(_r('proactive/proactive.js'));
            k.proactive = new ProactiveManager(k);
            k.proactive.start(30_000);
        } catch (e) {
            console.warn('[Kernel] ProactiveManager init failed:', e.message);
        }
    }

    /**
     * 初始化团队相关模块
     * @param {CoreKernel} k - 内核实例
     */
    async _initTeamModules(k) {
        // AgentTeams
        try {
            const { AgentTeamManager } = await import(_r('agent-teams/manager.js'));
            k.agentTeams = new AgentTeamManager(k);
            await k.agentTeams.initialize();
        } catch (e) {
            const { AgentTeams } = await import(_r('agent-teams/index.js')).catch(() => ({ AgentTeams: null }));
            if (AgentTeams) {
                k.agentTeams = new AgentTeams({ kernel: k });
            } else {
                console.warn('[Kernel] AgentTeams init failed:', e.message);
            }
        }

        // DebateTeamManager (P0-3: 辩论团队架构)
        try {
            const { _initDebateTeamManager } = await import(_r('kernel/integrations.js'));
            await _initDebateTeamManager.call(k);
        } catch (e) {
            console.warn('[Kernel] DebateTeamManager init failed:', e.message);
        }

        // MCP Manager
        try {
            const { McpClientManager } = await import(_r('mcp/index.js'));
            k.mcpManager = new McpClientManager(k);
            await k.mcpManager.initialize();
        } catch (e) {
            console.warn('[Kernel] McpManager init failed:', e.message);
        }
    }

    /**
     * 初始化提供者相关模块
     * @param {CoreKernel} k - 内核实例
     */
    async _initProviderModules(k) {
        // Provider Compat
        try {
            const { UnifiedProvider } = await import(_r('providers/provider-compat.js'));
            k.unifiedProvider = new UnifiedProvider(k);
        } catch (e) {
            console.warn('[Kernel] UnifiedProvider init failed:', e.message);
        }

        // ComputerUse
        try {
            const { ComputerUse } = await import(_r('computer-use/computer-use.js'));
            k.computerUse = new ComputerUse(k);
        } catch (e) {
            console.warn('[Kernel] ComputerUse init failed:', e.message);
        }
    }

    /**
     * 初始化压缩相关模块
     * @param {CoreKernel} k - 内核实例
     */
    async _initCompressionModules(k) {
        // SessionCompactor
        try {
            const { SessionCompactor } = await import(_r('compact/compactor.js'));
            k.compactor = new SessionCompactor(k);
        } catch (e) {
            console.warn('[Kernel] SessionCompactor init failed:', e.message);
        }

        // IntelligentConversationCompressor (P1-3: 智能对话压缩)
        try {
            const { IntelligentConversationCompressor } = await import(_r('kernel/intelligent-conversation-compressor.js'));
            k.conversationCompressor = new IntelligentConversationCompressor(k, {
                strategy: 'adaptive', // adaptive, aggressive, balanced, conservative
                compressionThreshold: 0.7,
                keepRecentMessages: 10,
                keepImportantMessages: true,
                minImportantScore: 0.8,
                semanticClustering: true,
                clusterThreshold: 0.75,
                maxClusterSize: 10,
                enableSummarization: true,
                summaryLength: 150,
                preserveContext: true,
                maxMessages: 1000,
                batchSize: 50,
                useTurboQuant: true,
                turboQuantConfig: {
                    maxTokens: 8192,
                    keepRecent: 6,
                    importanceThreshold: 0.65,
                    fallbackToLLM: false,
                    clusterThreshold: 0.80,
                    embeddingDim: 384,
                    bitsPerChannel: 3.5,
                    useOutlierSplit: false,
                    useTwoStage: false,
                },
            });
            // console.log('[Kernel] IntelligentConversationCompressor initialized');
        } catch (e) {
            console.warn('[Kernel] IntelligentConversationCompressor init failed:', e.message);
        }

        // AgentTeam Tools
        try {
            const { registerAgentTeamTools } = await import(_r('kernel/agent-teams/agent-tools.js'));
            if (registerAgentTeamTools && k.toolBridge) {
                const count = registerAgentTeamTools(k.toolBridge);
                // console.log(`[Kernel] Registered ${count} AgentTeam tools`);
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

        // v4.3: TodoManager
        try {
            const { TodoManager } = await import(_r('kernel/planning/todo-manager.js'));
            k.todoManager = new TodoManager(k);
        } catch (e) {
            console.warn('[Kernel] TodoManager init failed:', e.message);
        }

        // v4.3: ConditionalTaskGraph (P1-2: 有向图条件边支持)
        try {
            const { ConditionalTaskGraph } = await import(_r('kernel/conditional-task-graph.js'));
            k.taskGraph = new ConditionalTaskGraph(k, {
                maxHistorySize: 1000,
                enableStatistics: true,
            });
            // console.log('[Kernel] ConditionalTaskGraph initialized');
        } catch (e) {
            console.warn('[Kernel] ConditionalTaskGraph init failed:', e.message);
            // 回退到旧的 TaskGraph
            try {
                const { TaskGraph } = await import(_r('kernel/task-graph.js'));
                k.taskGraph = new TaskGraph(k);
                // console.log('[Kernel] Fallback to legacy TaskGraph');
            } catch (fallbackError) {
                console.warn('[Kernel] Legacy TaskGraph also failed:', fallbackError.message);
            }
        }

        // v4.3: AutonomousAgentManager
        try {
            const { AutonomousAgentManager } = await import(_r('kernel/autonomous/autonomous-agent-manager.js'));
            k.autonomousAgentManager = new AutonomousAgentManager(k);
            await k.autonomousAgentManager.initialize();
        } catch (e) {
            console.warn('[Kernel] AutonomousAgentManager init failed:', e.message);
        }



        // v4.3: Error Handler
        try {
            const { ErrorHandler, FallbackManager, RetryManager } = await import(_r('kernel/error-handler.js'));
            k.errorHandler = new ErrorHandler(k);
            k.fallbackManager = new FallbackManager(k);
            k.retryManager = new RetryManager(k);
        } catch (e) {
            console.warn('[Kernel] ErrorHandler init failed:', e.message);
        }

        // P1-5 重构：使用并行初始化器
        try {
            const { Phase8Initializer } = await import(_r('kernel/mixins/Phase8Parallel.js'));
            const initializer = new Phase8Initializer(k);
            await initializer.initialize();
        } catch (e) {
            console.error('[Kernel] Phase 8 parallel init failed:', e.message);
            // 回退到串行初始化
            await this._initPhase8_enhanced_legacy(k);
        }
    }

    // P1-5 遗留：串行初始化（作为回退）
    async _initPhase8_enhanced_legacy(k) {
        // v4.3: Monitoring
        try {
            const { MetricsCollector, HealthChecker, Tracer, createMetricsServer } = await import(_r('kernel/monitoring.js'));
            k.metrics = new MetricsCollector();
            k.healthChecker = new HealthChecker(k);
            k.tracer = new Tracer();
            if (k.config.system?.monitoring?.enabled) {
                const metricsPort = k.config.system.monitoring.port || 9090;
                k.metricsServer = createMetricsServer(metricsPort, k.metrics);
            }
        } catch (e) { console.warn('[Kernel] Monitoring init failed:', e.message); }

        // v4.3: I18n
        try {
            const I18nManager = await import(_r('kernel/i18n.js'));
            k.i18n = new I18nManager.default();
            k.i18n.setLocale(k.config.system?.locale || 'zh');
        } catch (e) { console.warn('[Kernel] I18n init failed:', e.message); }

        // v4.3: Security
        try {
            const { ApiKeyManager, AccessControlManager, AuditLogger } = await import(_r('kernel/security.js'));
            k.apiKeyManager = new ApiKeyManager(k);
            k.accessControl = new AccessControlManager(k);
            if (!k.auditLogger) k.auditLogger = new AuditLogger(k);
        } catch (e) { console.warn('[Kernel] Security init failed:', e.message); }

        // v4.3: Multi-Level Cache
        try {
            const { MultiLevelCache } = await import(_r('kernel/multi-level-cache.js'));
            k.cacheManager = new MultiLevelCache({
                l1: { maxSize: 1000, maxMemoryMB: 100, ttl: 300000, enabled: true },
                l2: { baseDir: join(k.config.storageDir, 'cache'), maxSizeMB: 1024, ttl: 86400000, enabled: true, compression: true },
                l3: { enabled: false, provider: 'redis', config: { host: 'localhost', port: 6379 } },
                prefetchEnabled: true, writeThrough: true, readThrough: true,
            });
            await k.cacheManager.initialize();
        } catch (e) {
            try {
                const { CacheManager } = await import(_r('kernel/cache.js'));
                k.cacheManager = new CacheManager({ maxSize: 1000, ttl: 3600000 });
            } catch (fallbackError) { console.warn('[Kernel] Legacy CacheManager also failed:', fallbackError.message); }
        }

        // v4.3: Redis Pool
        try {
            const { RedisPoolManager } = await import(_r('kernel/pool.js'));
            k.redisPool = new RedisPoolManager({
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
                password: process.env.REDIS_PASSWORD || undefined,
            });
            await k.redisPool.initialize();
        } catch (e) { console.warn('[Kernel] RedisPool init failed:', e.message); }

        // v4.3: Postgres Pool
        try {
            const { PostgresPoolManager } = await import(_r('kernel/pool.js'));
            k.postgresPool = new PostgresPoolManager({
                host: process.env.POSTGRES_HOST || 'localhost',
                port: parseInt(process.env.POSTGRES_PORT || '5432'),
                database: process.env.POSTGRES_DB || 'hundunos',
                user: process.env.POSTGRES_USER || 'hundunos',
                password: process.env.POSTGRES_PASSWORD || '',
            });
            await k.postgresPool.initialize();
        } catch (e) { console.warn('[Kernel] PostgresPool init failed:', e.message); }

        // v4.3: Rate Limit Manager
        try {
            const { RateLimitManager } = await import(_r('kernel/rate-limit.js'));
            k.rateLimitManager = new RateLimitManager(k, { enabled: true });
        } catch (e) { console.warn('[Kernel] RateLimitManager init failed:', e.message); }

        // v4.3: WAF Manager
        try {
            const { WAFManager } = await import(_r('kernel/waf.js'));
            k.wafManager = new WAFManager(k, { enabled: true, whitelist: ['/api/health', '/api/status', '/metrics'] });
        } catch (e) { console.warn('[Kernel] WAFManager init failed:', e.message); }

        // v4.3: Jaeger Tracer
        try {
            const { JaegerTracer } = await import(_r('kernel/jaeger-tracer.js'));
            k.jaegerTracer = new JaegerTracer({ endpoint: 'http://localhost:14268/api/traces', serviceName: 'hundunos' });
            await k.jaegerTracer.initialize();
        } catch (e) { console.warn('[Kernel] JaegerTracer init failed:', e.message); }

        // v4.3: ELK Stack
        try {
            const { ELKStackManager } = await import(_r('kernel/elk-stack.js'));
            k.elkStack = new ELKStackManager(k, { node: 'http://localhost:9200', username: 'elastic', password: '' });
            await k.elkStack.initialize();
            await k.elkStack.createIndex('logs');
            await k.elkStack.createIndex('errors');
            await k.elkStack.createIndex('audit');
        } catch (e) { console.warn('[Kernel] ELKStack init failed:', e.message); }

        // v4.3: Plugin Market
        try {
            const { PluginMarketManager } = await import(_r('kernel/plugin-market.js'));
            k.pluginMarket = new PluginMarketManager(k, { registryUrl: 'https://plugins.hundunos.ai' });
        } catch (e) { console.warn('[Kernel] PluginMarket init failed:', e.message); }

        // v4.3: Plugin Sandbox
        try {
            const { PluginSandbox } = await import(_r('kernel/plugin-sandbox.js'));
            k.pluginSandbox = new PluginSandbox({ timeout: 30000, memoryLimit: 128 * 1024 * 1024, cpuLimit: 1, blockedModules: ['fs', 'child_process', 'net', 'http', 'https'] });
        } catch (e) { console.warn('[Kernel] PluginSandbox init failed:', e.message); }

        // v4.3: Tenant Manager
        try {
            const { TenantManager } = await import(_r('kernel/multi-tenant.js'));
            k.tenantManager = new TenantManager(k, { storageDir: '.hundunos/tenants' });
        } catch (e) { console.warn('[Kernel] TenantManager init failed:', e.message); }

        // v4.3: Billing Manager
        try {
            const { BillingManager } = await import(_r('kernel/multi-tenant.js'));
            k.billingManager = new BillingManager(k, { storageDir: '.hundunos/billing' });
        } catch (e) { console.warn('[Kernel] BillingManager init failed:', e.message); }

        // v4.3: Mobile API
        try {
            const { MobileAPIManager } = await import(_r('kernel/mobile-api.js'));
            k.mobileAPI = new MobileAPIManager(k);
            k.mobileAPI.initializeRoutes();
        } catch (e) { console.warn('[Kernel] MobileAPI init failed:', e.message); }

        // v4.3: RAG Manager
        try {
            const { RAGManager } = await import(_r('kernel/rag.js'));
            k.ragManager = new RAGManager(k, { embeddingModel: 'text-embedding-3-small', retrievalTopK: 5, similarityThreshold: 0.7 });
        } catch (e) { console.warn('[Kernel] RAGManager init failed:', e.message); }

        // v4.3: Agent Chain of Thought
        try {
            const { AgentChainOfThought } = await import(_r('kernel/agent-cot.js'));
            k.agentChainOfThought = new AgentChainOfThought(k, { maxSteps: 10, temperature: 0.7 });
        } catch (e) { console.warn('[Kernel] AgentChainOfThought init failed:', e.message); }

        // v4.3: Agent Tree of Thoughts
        try {
            const { AgentTreeOfThoughts } = await import(_r('kernel/agent-cot.js'));
            k.agentTreeOfThoughts = new AgentTreeOfThoughts(k, { maxDepth: 3, branchingFactor: 3, temperature: 0.7 });
        } catch (e) { console.warn('[Kernel] AgentTreeOfThoughts init failed:', e.message); }
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
            {
                id: 'todoManager',
                name: 'Todo Manager',
                type: 'kernel',
                instance: {
                    execute: async () => ({ success: true, stats: this.todoManager?.getStats?.() || {} }),
                },
            },
            {
                id: 'taskGraph',
                name: 'Conditional Task Graph',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        // 向后兼容的 API
                        if (intent?.action === 'create') {
                            if (intent.options) {
                                // 新的条件任务图 API
                                return this.taskGraph?.create?.(intent.subject, intent.description, intent.options);
                            } else {
                                // 旧的 API
                                return this.taskGraph?.create?.(intent.subject, intent.description);
                            }
                        }
                        if (intent?.action === 'update') {
                            if (intent.updates) {
                                // 新的条件任务图 API
                                return this.taskGraph?.update?.(intent.taskId, intent.updates);
                            } else {
                                // 旧的 API
                                return this.taskGraph?.update?.(intent.taskId, intent.status, intent.owner, intent.addBlockedBy, intent.addBlocks);
                            }
                        }
                        if (intent?.action === 'get') return this.taskGraph?.get?.(intent.taskId);
                        if (intent?.action === 'listAll') return this.taskGraph?.listAll?.();
                        if (intent?.action === 'delete') return this.taskGraph?.delete?.(intent.taskId);
                        if (intent?.action === 'getStats') return this.taskGraph?.getStats?.();
                        if (intent?.action === 'getDependencyGraph') return this.taskGraph?.getDependencyGraph?.();
                        
                        // 新的条件任务图 API
                        if (intent?.action === 'execute') return this.taskGraph?.execute?.(intent.taskId, intent.context || {});
                        if (intent?.action === 'executeGraph') return this.taskGraph?.executeGraph?.(intent.context || {}, intent.onTaskExecuted);
                        if (intent?.action === 'getExecutableTasks') return this.taskGraph?.getExecutableTasks?.(intent.context || {});
                        if (intent?.action === 'getExecutionPlan') return this.taskGraph?.getExecutionPlan?.(intent.context || {});
                        if (intent?.action === 'getDependencyPath') return this.taskGraph?.getDependencyPath?.(intent.startTaskId, intent.endTaskId, intent.context || {});
                        if (intent?.action === 'clear') return this.taskGraph?.clear?.();
                        if (intent?.action === 'export') return this.taskGraph?.export?.();
                        if (intent?.action === 'import') return this.taskGraph?.import?.(intent.data);
                        
                        // 默认返回统计信息
                        const stats = this.taskGraph?.getStats?.();
                        return { success: true, stats: stats || {}, message: 'Conditional Task Graph is running' };
                    },
                },
            },
            {
                id: 'autonomousAgentManager',
                name: 'Autonomous Agent Manager',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'registerAgent') return this.autonomousAgentManager?.registerAgent?.(intent.config);
                        if (intent?.action === 'submitTask') return this.autonomousAgentManager?.submitTask?.(intent.task);
                        if (intent?.action === 'getStats') return this.autonomousAgentManager?.getStats?.();
                        return { success: true, stats: this.autonomousAgentManager?.getStats?.() || {} };
                    },
                    shutdown: async () => this.autonomousAgentManager?.shutdown?.(),
                },
            },
            {
                id: 'mcpManager',
                name: 'MCP Manager',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'callTool') return this.mcpManager?.callTool?.(intent.toolName, intent.args);
                        if (intent?.action === 'listTools') return this.mcpManager?.listTools?.();
                        return { success: true, tools: this.mcpManager?.listTools?.() || [] };
                    },
                    shutdown: async () => {
                        for (const client of this.mcpManager?.clients?.values() || []) {
                            await client.close?.();
                        }
                    },
                },
            },
            {
                id: 'errorHandler',
                name: 'Error Handler',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'getErrorStats') return this.errorHandler?.getErrorStats?.();
                        return { success: true, stats: this.errorHandler?.getErrorStats?.() || {} };
                    },
                },
            },
            {
                id: 'fallbackManager',
                name: 'Fallback Manager',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'listStrategies') return this.fallbackManager?.listStrategies?.();
                        if (intent?.action === 'execute') return this.fallbackManager?.execute?.(intent.name, intent.context);
                        return { success: true, strategies: this.fallbackManager?.listStrategies?.() || [] };
                    },
                },
            },
            {
                id: 'retryManager',
                name: 'Retry Manager',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'configure') this.retryManager?.configure?.(intent.options);
                        return { success: true, message: 'Retry manager configured' };
                    },
                },
            },
            {
                id: 'healthChecker',
                name: 'Health Checker',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'checkAll') return this.healthChecker?.checkAll?.();
                        if (intent?.action === 'check') return this.healthChecker?.check?.(intent.name);
                        return { success: true, status: 'healthy' };
                    },
                },
            },
            {
                id: 'metrics',
                name: 'Metrics Collector',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'getMetrics') return this.metrics?.getMetrics?.();
                        return { success: true, message: 'Use /metrics endpoint' };
                    },
                },
            },
            {
                id: 'tracer',
                name: 'Tracer',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'startSpan') return this.tracer?.startSpan?.(intent.name, intent.parentSpanId);
                        if (intent?.action === 'endSpan') this.tracer?.endSpan?.(intent.spanId, intent.status, intent.metadata);
                        if (intent?.action === 'getSpan') return this.tracer?.getSpan?.(intent.spanId);
                        if (intent?.action === 'getSpanTree') return this.tracer?.getSpanTree?.(intent.spanId);
                        return { success: true, currentSpan: this.tracer?.getCurrentSpan?.() };
                    },
                },
            },
            {
                id: 'i18n',
                name: 'I18n Manager',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'setLocale') this.i18n?.setLocale?.(intent.locale);
                        if (intent?.action === 'getLocale') return { locale: this.i18n?.getLocale?.() };
                        if (intent?.action === 't') return { translation: this.i18n?.t?.(intent.key, intent.params) };
                        return { success: true, locale: this.i18n?.getLocale?.() };
                    },
                },
            },
            {
                id: 'apiKeyManager',
                name: 'API Key Manager',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'addKey') return this.apiKeyManager?.addKey?.(intent.name, intent.key, intent.provider);
                        if (intent?.action === 'getKey') return this.apiKeyManager?.getKey?.(intent.name);
                        if (intent?.action === 'removeKey') return this.apiKeyManager?.removeKey?.(intent.name);
                        if (intent?.action === 'listKeys') return this.apiKeyManager?.listKeys?.();
                        return { success: true, keys: this.apiKeyManager?.listKeys?.() || [] };
                    },
                },
            },
            {
                id: 'accessControl',
                name: 'Access Control Manager',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'check') return this.accessControl?.check?.(intent.resource, intent.action, intent.roles);
                        if (intent?.action === 'checkPath') return this.accessControl?.checkPath?.(intent.path, intent.whitelist);
                        if (intent?.action === 'listPolicies') return this.accessControl?.listPolicies?.();
                        return { success: true, policies: this.accessControl?.listPolicies?.() || {} };
                    },
                },
            },
            {
                id: 'auditLogger',
                name: 'Audit Logger',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'log') return this.auditLogger?.log?.(intent.action, intent.data, intent.context);
                        if (intent?.action === 'query') return this.auditLogger?.query?.(intent.filters);
                        if (intent?.action === 'getStats') return this.auditLogger?.getStats?.();
                        return { success: true, stats: this.auditLogger?.getStats?.() || {} };
                    },
                    shutdown: async () => this.auditLogger?.shutdown?.(),
                },
            },
            {
                id: 'cacheManager',
                name: 'Multi-Level Cache Manager',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'get') {
                            const value = await this.cacheManager?.get?.(intent.key, intent.options);
                            return { success: true, value, found: value !== null };
                        }
                        if (intent?.action === 'set') {
                            const success = await this.cacheManager?.set?.(intent.key, intent.value, intent.options);
                            return { success: success !== false, message: success ? 'Cache set successfully' : 'Cache set failed' };
                        }
                        if (intent?.action === 'delete' || intent?.action === 'del') {
                            const success = await this.cacheManager?.delete?.(intent.key, intent.options);
                            return { success: success !== false, message: success ? 'Cache deleted successfully' : 'Cache delete failed' };
                        }
                        if (intent?.action === 'clear') {
                            await this.cacheManager?.clear?.();
                            return { success: true, message: 'Cache cleared' };
                        }
                        if (intent?.action === 'has') {
                            const exists = await this.cacheManager?.has?.(intent.key);
                            return { success: true, exists };
                        }
                        if (intent?.action === 'stats') {
                            const stats = this.cacheManager?.getStats?.();
                            return { success: true, stats: stats || {} };
                        }
                        if (intent?.action === 'warmup') {
                            await this.cacheManager?.warmup?.(intent.keys || []);
                            return { success: true, message: 'Cache warmup completed' };
                        }
                        if (intent?.action === 'mget') {
                            const { results, missingKeys } = await this.cacheManager?.mget?.(intent.keys || [], intent.options || {});
                            return { success: true, results, missingKeys };
                        }
                        if (intent?.action === 'mset') {
                            const results = await this.cacheManager?.mset?.(intent.items || {}, intent.options || {});
                            return { success: true, results };
                        }
                        // 默认返回统计信息
                        const stats = this.cacheManager?.getStats?.();
                        return { success: true, stats: stats || {}, message: 'Multi-Level Cache Manager is running' };
                    },
                },
            },
            {
                id: 'redisPool',
                name: 'Redis Pool Manager',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'healthCheck') return this.redisPool?.healthCheck?.();
                        return { success: true };
                    },
                    shutdown: async () => this.redisPool?.close?.(),
                },
            },
            {
                id: 'postgresPool',
                name: 'Postgres Pool Manager',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'healthCheck') return this.postgresPool?.healthCheck?.();
                        if (intent?.action === 'query') return this.postgresPool?.query?.(intent.text, intent.params);
                        if (intent?.action === 'getStats') return this.postgresPool?.getStats?.();
                        return { success: true };
                    },
                    shutdown: async () => this.postgresPool?.close?.(),
                },
            },
            {
                id: 'rateLimitManager',
                name: 'Rate Limit Manager',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'check') return this.rateLimitManager?.check?.(intent.key, intent.options);
                        if (intent?.action === 'getStats') return this.rateLimitManager?.getStats?.();
                        return { success: true };
                    },
                },
            },
            {
                id: 'wafManager',
                name: 'WAF Manager',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'filterInput') return this.wafManager?.filterInput?.(intent.input);
                        if (intent?.action === 'detectSQLInjection') return this.wafManager?.detectSQLInjection?.(intent.input);
                        if (intent?.action === 'checkPathWhitelist') return this.wafManager?.checkPathWhitelist?.(intent.path);
                        if (intent?.action === 'addPathWhitelist') this.wafManager?.addPathWhitelist?.(intent.pattern);
                        return { success: true };
                    },
                },
            },
            {
                id: 'jaegerTracer',
                name: 'Jaeger Tracer',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'getTracer') return this.jaegerTracer?.getTracer?.(intent.name);
                        return { success: true };
                    },
                    shutdown: async () => this.jaegerTracer?.shutdown?.(),
                },
            },
            {
                id: 'elkStack',
                name: 'ELK Stack Manager',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'log') this.elkStack?.log?.(intent.index, intent.level, intent.message, intent.metadata);
                        if (intent?.action === 'query') return this.elkStack?.query?.(intent.index, intent.query);
                        if (intent?.action === 'aggregate') return this.elkStack?.aggregate?.(intent.index, intent.aggregations);
                        if (intent?.action === 'deleteIndex') this.elkStack?.deleteIndex?.(intent.index);
                        return { success: true };
                    },
                    shutdown: async () => this.elkStack?.close?.(),
                },
            },
            {
                id: 'pluginMarket',
                name: 'Plugin Market Manager',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'search') return this.pluginMarket?.search?.(intent.query);
                        if (intent?.action === 'getPluginInfo') return this.pluginMarket?.getPluginInfo?.(intent.pluginId);
                        if (intent?.action === 'installPlugin') return this.pluginMarket?.installPlugin?.(intent.pluginId, intent.version);
                        if (intent?.action === 'uninstallPlugin') return this.pluginMarket?.uninstallPlugin?.(intent.pluginId);
                        if (intent?.action === 'updatePlugin') return this.pluginMarket?.updatePlugin?.(intent.pluginId);
                        if (intent?.action === 'getInstalledVersion') return this.pluginMarket?.getInstalledVersion?.(intent.pluginId);
                        if (intent?.action === 'listInstalledPlugins') return this.pluginMarket?.listInstalledPlugins?.();
                        return { success: true };
                    },
                },
            },
            {
                id: 'pluginSandbox',
                name: 'Plugin Sandbox',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'execute') return this.pluginSandbox?.execute?.(intent.code, intent.input);
                        return { success: true };
                    },
                },
            },
            {
                id: 'tenantManager',
                name: 'Tenant Manager',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'createTenant') return this.tenantManager?.createTenant?.(intent.name, intent.plan);
                        if (intent?.action === 'getTenant') return this.tenantManager?.getTenant?.(intent.tenantId);
                        if (intent?.action === 'updateTenant') return this.tenantManager?.updateTenant?.(intent.tenantId, intent.updates);
                        if (intent?.action === 'deleteTenant') return this.tenantManager?.deleteTenant?.(intent.tenantId);
                        if (intent?.action === 'checkQuota') return this.tenantManager?.checkQuota?.(intent.tenantId, intent.resource, intent.amount);
                        if (intent?.action === 'useQuota') return this.tenantManager?.useQuota?.(intent.tenantId, intent.resource, intent.amount);
                        if (intent?.action === 'listTenants') return this.tenantManager?.listTenants?.();
                        return { success: true };
                    },
                },
            },
            {
                id: 'billingManager',
                name: 'Billing Manager',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'createInvoice') return this.billingManager?.createInvoice?.(intent.tenantId, intent.month);
                        if (intent?.action === 'getInvoice') return this.billingManager?.getInvoice?.(intent.invoiceId);
                        if (intent?.action === 'addInvoiceItem') return this.billingManager?.addInvoiceItem?.(intent.invoiceId, intent.item);
                        if (intent?.action === 'calculateInvoice') return this.billingManager?.calculateInvoice?.(intent.tenantId, intent.month);
                        if (intent?.action === 'payInvoice') return this.billingManager?.payInvoice?.(intent.invoiceId, intent.paymentMethod);
                        if (intent?.action === 'listInvoices') return this.billingManager?.listInvoices?.(intent.tenantId);
                        return { success: true };
                    },
                },
            },
            {
                id: 'mobileAPI',
                name: 'Mobile API Manager',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        return this.mobileAPI?.handleRequest?.(intent.method, intent.path, intent.body, intent.headers);
                    },
                },
            },
            {
                id: 'ragManager',
                name: 'RAG Manager',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'addDocument') return this.ragManager?.addDocument?.(intent.id, intent.text, intent.metadata);
                        if (intent?.action === 'getDocument') return this.ragManager?.getDocument?.(intent.id);
                        if (intent?.action === 'deleteDocument') return this.ragManager?.deleteDocument?.(intent.id);
                        if (intent?.action === 'retrieve') return this.ragManager?.retrieve?.(intent.query);
                        if (intent?.action === 'generateAugmentedPrompt') return this.ragManager?.generateAugmentedPrompt?.(intent.query, intent.contextWindow);
                        if (intent?.action === 'listDocuments') return this.ragManager?.listDocuments?.();
                        return { success: true };
                    },
                },
            },
            {
                id: 'agentChainOfThought',
                name: 'Agent Chain of Thought',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'execute') return this.agentChainOfThought?.execute?.(intent.task, intent.context);
                        return { success: true };
                    },
                },
            },
            {
                id: 'agentTreeOfThoughts',
                name: 'Agent Tree of Thoughts',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'execute') return this.agentTreeOfThoughts?.execute?.(intent.task);
                        return { success: true };
                    },
                },
            },
            {
                id: 'conversationCompressor',
                name: 'Intelligent Conversation Compressor',
                type: 'kernel',
                instance: {
                    execute: async (intent) => {
                        if (intent?.action === 'compress') {
                            const result = await this.conversationCompressor?.compress?.(intent.messages || [], intent.options || {});
                            return { success: true, ...result };
                        }
                        if (intent?.action === 'getStats') {
                            const stats = this.conversationCompressor?.getStats?.();
                            return { success: true, stats: stats || {} };
                        }
                        if (intent?.action === 'getConfig') {
                            const config = this.conversationCompressor?.getConfig?.();
                            return { success: true, config: config || {} };
                        }
                        if (intent?.action === 'updateConfig') {
                            this.conversationCompressor?.updateConfig?.(intent.config || {});
                            return { success: true, message: 'Configuration updated' };
                        }
                        if (intent?.action === 'resetStats') {
                            this.conversationCompressor?.resetStats?.();
                            return { success: true, message: 'Statistics reset' };
                        }
                        if (intent?.action === 'analyze') {
                            const analyzer = this.conversationCompressor?.analyzer;
                            if (analyzer) {
                                const conversationType = analyzer.analyzeConversationType?.(intent.messages || []);
                                const structure = analyzer.analyzeConversationStructure?.(intent.messages || []);
                                return { 
                                    success: true, 
                                    analysis: { conversationType, structure } 
                                };
                            }
                            return { success: false, error: 'Analyzer not available' };
                        }
                        // 默认返回统计信息
                        const stats = this.conversationCompressor?.getStats?.();
                        return { 
                            success: true, 
                            stats: stats || {}, 
                            message: 'Intelligent Conversation Compressor is running' 
                        };
                    },
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
