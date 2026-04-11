/**
 * HundunOS v3.0 - Auto Recovery 自动恢复模块
 * S2.B.3 任务
 * 监听崩溃、自动回滚、异常后自动修复
 */

// 统一常量（来自 kernel/constants.js，消除重复定义）
export { RecoveryAction, RecoveryStatus } from '../constants.js';

/**
 * 异常事件记录
 */
class ErrorEvent {
    constructor(module, error, context = {}) {
        this.module    = module;
        this.error     = error.message || String(error);
        this.stack     = error.stack || '';
        this.context   = context;
        this.timestamp = new Date().toISOString();
        this.count     = 1;
    }

    toJSON() {
        return { module: this.module, error: this.error, stack: this.stack, context: this.context, timestamp: this.timestamp, count: this.count };
    }
}

/**
 * RecoveryPolicy - 单个恢复策略
 */
class RecoveryPolicy {
    constructor(options = {}) {
        this.module         = options.module || '*';           // 模块名，* 表示全局
        this.errorPattern   = options.errorPattern || null;    // 匹配错误信息的正则
        this.maxRetries     = options.maxRetries ?? 3;         // 最大重试次数
        this.retryInterval  = options.retryInterval ?? 5000;   // 重试间隔 ms
        this.action         = options.action || RecoveryAction.RESTART;
        this.fallbackAction = options.fallbackAction || RecoveryAction.ESCALATE;
        this.cooldown       = options.cooldown ?? 60000;       // 冷却时间 ms
        this.lastTriggered  = null;
        this.retryCount     = 0;
    }

    matches(module, error) {
        if (this.module !== '*' && this.module !== module) return false;
        if (this.errorPattern && !this.errorPattern.test(error)) return false;
        return true;
    }

    canTrigger() {
        if (!this.lastTriggered) return true;
        return Date.now() - this.lastTriggered > this.cooldown;
    }

    trigger() {
        this.lastTriggered = Date.now();
        this.retryCount++;
        return this.retryCount <= this.maxRetries;
    }

    reset() {
        this.retryCount    = 0;
        this.lastTriggered = null;
    }
}

/**
 * AutoRecovery - 自动恢复引擎
 */
export class AutoRecovery {
    constructor(kernel) {
        this.kernel          = kernel;
        this.policies        = [];           // RecoveryPolicy[]
        this.errorLog        = [];           // ErrorEvent[]
        this.maxErrorLog     = 50;
        this.status          = RecoveryStatus.IDLE;
        this.currentAction   = null;
        this.snapshotManager = null;          // RecoverableMemory reference
        this.stats = {
            detected: 0, recovered: 0, failed: 0, ignored: 0
        };

        // 默认策略
        this._initDefaultPolicies();

        // 监听 kernel 事件
        if (this.kernel?.on) {
            this.kernel.on('module:error', (data) => this.onModuleError(data));
            this.kernel.on('module:crash', (data) => this.onModuleCrash(data));
            this.kernel.on('system:unstable', (data) => this.onSystemUnstable(data));
        }
    }

    _initDefaultPolicies() {
        // 模块加载失败 → 重试 + 回滚
        this.addPolicy({
            module: '*',
            errorPattern: /module.*load|import.*failed|cannot find module/i,
            maxRetries: 3,
            retryInterval: 3000,
            action: RecoveryAction.RELOAD,
            fallbackAction: RecoveryAction.ROLLBACK,
            cooldown: 30000
        });

        // 网络错误 → 重试
        this.addPolicy({
            module: '*',
            errorPattern: /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|socket hang up/i,
            maxRetries: 5,
            retryInterval: 5000,
            action: RecoveryAction.RESTART,
            cooldown: 60000
        });

        // 内存溢出 → 重启
        this.addPolicy({
            module: '*',
            errorPattern: /heap|memory|out of memory|fatal|i41.*12/i,
            maxRetries: 2,
            retryInterval: 10000,
            action: RecoveryAction.RESTART,
            cooldown: 120000
        });

        // 未知错误 → 升级
        this.addPolicy({
            module: '*',
            maxRetries: 1,
            action: RecoveryAction.ESCALATE,
            cooldown: 30000
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 策略管理
    // ─────────────────────────────────────────────────────────────────────────

    addPolicy(options) {
        this.policies.push(new RecoveryPolicy(options));
    }

    removePolicies(module) {
        const before = this.policies.length;
        this.policies = this.policies.filter(p => p.module !== module);
        return before - this.policies.length;
    }

    /** 设置快照管理器（用于回滚） */
    setSnapshotManager(snapshotManager) {
        this.snapshotManager = snapshotManager;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 异常处理入口
    // ─────────────────────────────────────────────────────────────────────────

    async onModuleError(data) {
        this.status = RecoveryStatus.DETECTING;
        const event = new ErrorEvent(data.module || 'unknown', data.error || new Error('unknown'), data.context || {});
        this._addError(event);
        this.stats.detected++;

        const policy = this._findPolicy(event.module, event.error);
        if (!policy) {
            this.stats.ignored++;
            this.status = RecoveryStatus.IDLE;
            return { action: RecoveryAction.IGNORE, reason: 'no matching policy' };
        }

        if (!policy.canTrigger()) {
            this.stats.ignored++;
            return { action: RecoveryAction.IGNORE, reason: 'policy in cooldown' };
        }

        const canRecover = policy.trigger();
        if (!canRecover) {
            // 超过最大重试，执行 fallback
            return await this._executeAction(policy.fallbackAction, event);
        }

        return await this._executeAction(policy.action, event);
    }

    onModuleCrash(data) {
        return this.onModuleError({ ...data, error: new Error(data.reason || 'crash') });
    }

    onSystemUnstable(data) {
        // 系统级不稳定，触发全面检查
        console.warn('[AutoRecovery] 系统不稳定:', data);
        this.status = RecoveryStatus.DETECTING;

        // 执行健康检查
        const hm = this.kernel?.healthMonitor;
        if (hm?.checkAll) {
            hm.checkAll().then(report => {
                if (report.overall.score < 50) {
                    console.error('[AutoRecovery] 健康评分过低，建议人工介入');
                    this._escalate(report);
                }
            });
        }

        return { action: RecoveryAction.IGNORE, reason: 'system level event, monitoring only' };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 恢复执行
    // ─────────────────────────────────────────────────────────────────────────

    async _executeAction(action, event) {
        this.status       = RecoveryStatus.RECOVERING;
        this.currentAction = action;

        try {
            let result;
            switch (action) {
                case RecoveryAction.RESTART:
                    result = await this._actionRestart(event);
                    break;
                case RecoveryAction.RELOAD:
                    result = await this._actionReload(event);
                    break;
                case RecoveryAction.ROLLBACK:
                    result = await this._actionRollback(event);
                    break;
                case RecoveryAction.ESCALATE:
                    result = await this._actionEscalate(event);
                    break;
                default:
                    result = { ok: false, error: `unknown action: ${action}` };
            }

            if (result.ok) {
                this.status = RecoveryStatus.SUCCESS;
                this.stats.recovered++;
                event.context.recovered = true;
            } else {
                this.status = RecoveryStatus.FAILED;
                this.stats.failed++;
                event.context.recovered = false;
                event.context.failureReason = result.error;
            }

            return { action, ...result, event: event.toJSON() };

        } catch (e) {
            this.status  = RecoveryStatus.FAILED;
            this.stats.failed++;
            return { action, ok: false, error: e.message };
        } finally {
            this.currentAction = null;
        }
    }

    async _actionRestart(event) {
        const moduleName = event.module;
        const registry = this.kernel?.moduleRegistry;
        if (!registry) return { ok: false, error: 'no module registry' };

        try {
            // 禁用模块
            if (registry.disable) registry.disable(moduleName);
            // 等待
            await new Promise(r => setTimeout(r, 1000));
            // 重新启用
            if (registry.enable) registry.enable(moduleName);

            return { ok: true, message: `模块 ${moduleName} 已重启` };
        } catch (e) {
            return { ok: false, error: `重启失败: ${e.message}` };
        }
    }

    async _actionReload(event) {
        try {
            const modulePath = event.context?.modulePath || event.module;
            // 动态 import 重新加载
            const mod = await import(/* @dynamic */ modulePath);
            return { ok: true, message: `模块已重新加载: ${modulePath}` };
        } catch (e) {
            return { ok: false, error: `重新加载失败: ${e.message}` };
        }
    }

    async _actionRollback(event) {
        if (!this.snapshotManager) {
            // 尝试使用 RecoverableMemory
            try {
                const { RecoverableMemory } = await import('../stable-modules/recoverable-memory/index.js');
                const rm = new RecoverableMemory(this.kernel);
                await rm.restoreLatest();
                return { ok: true, message: '已回滚到最新快照' };
            } catch (e) {
                return { ok: false, error: `无可用快照: ${e.message}` };
            }
        }

        try {
            await this.snapshotManager.restoreLatest();
            return { ok: true, message: '已回滚' };
        } catch (e) {
            return { ok: false, error: `回滚失败: ${e.message}` };
        }
    }

    async _actionEscalate(event) {
        this._escalate({ event: event.toJSON(), stats: this.getStats() });
        return { ok: true, message: '已升级处理' };
    }

    _escalate(data) {
        console.error('[AutoRecovery] 升级处理 - 需要人工介入:', JSON.stringify(data, null, 2));
        // 可以在这里添加通知逻辑（webhook, email, push）
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 辅助
    // ─────────────────────────────────────────────────────────────────────────

    _findPolicy(module, error) {
        // 精确匹配优先
        for (const p of this.policies) {
            if (p.matches(module, error)) return p;
        }
        return null;
    }

    _addError(event) {
        this.errorLog.unshift(event);
        if (this.errorLog.length > this.maxErrorLog) this.errorLog.pop();
    }

    getStats() {
        return {
            ...this.stats,
            status: this.status,
            currentAction: this.currentAction,
            errorCount: this.errorLog.length,
            policyCount: this.policies.length
        };
    }

    getErrors(limit = 20) {
        return this.errorLog.slice(0, limit).map(e => e.toJSON());
    }

    getPolicies() {
        return this.policies.map(p => ({
            module: p.module,
            action: p.action,
            maxRetries: p.maxRetries,
            retryCount: p.retryCount,
            lastTriggered: p.lastTriggered
        }));
    }
}

export default AutoRecovery;
