/**
 * HundunOS v3.0 - Auto Recovery 自动恢复
 * 故障检测与自动恢复机制
 * 
 * 功能:
 * - 模块崩溃自动重启
 * - 任务中断恢复
 * - 状态回滚
 * - 降级策略
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// 恢复策略（统一来源：kernel/constants.js，消除重复定义）
// ============================================================================

export { RecoveryStrategy } from '../../kernel/constants.js';

/**
 * 故障类型
 */
export const FailureType = {
    CRASH:      'crash',       // 崩溃
    TIMEOUT:    'timeout',     // 超时
    ERROR:      'error',       // 错误
    HANG:       'hang',        // 卡死
    MEMORY:     'memory',      // 内存溢出
    NETWORK:    'network',     // 网络故障
    RESOURCE:   'resource'     // 资源不足
};

/**
 * 恢复记录状态（与 kernel/constants.js 的 RecoveryStatus 语义不同：
 *   constants.js 描述恢复引擎状态机 IDLE→DETECTING→RECOVERING→SUCCESS/FAILED，
 *   此处描述单条恢复记录的生命周期 PENDING→IN_PROGRESS→SUCCESS/FAILED/SKIPPED）
 */
export const RecoveryRecordStatus = {
    PENDING:    'pending',
    IN_PROGRESS: 'in_progress',
    SUCCESS:    'success',
    FAILED:     'failed',
    SKIPPED:    'skipped'
};

// 向后兼容别名（已废弃，新代码请使用 RecoveryRecordStatus）
export const RecoveryStatus = RecoveryRecordStatus;

// ============================================================================
// 恢复记录
// ============================================================================

class RecoveryRecord {
    constructor(failure, strategy) {
        this.id = `rec_${Date.now()}`;
        this.failure = failure;
        this.strategy = strategy;
        this.status = RecoveryRecordStatus.PENDING;
        this.attempts = 0;
        this.maxAttempts = 3;
        this.createdAt = new Date().toISOString();
        this.completedAt = null;
        this.result = null;
        this.error = null;
    }
}

// ============================================================================
// Auto Recovery Manager
// ============================================================================

export class AutoRecoveryManager extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            maxAttempts: config.maxAttempts || 3,
            retryDelay: config.retryDelay || 5000,
            recoveryDir: config.recoveryDir || path.join(__dirname, '../../../data/recovery'),
            snapshotDir: config.snapshotDir || path.join(__dirname, '../../../data/snapshots'),
            enableAutoRecovery: config.enableAutoRecovery !== false,
            ...config
        };

        this.records = new Map();       // id -> RecoveryRecord
        this.handlers = new Map();       // FailureType -> handler
        this.snapshots = new Map();      // moduleId -> latest snapshot
        this.moduleStatus = new Map();   // moduleId -> status

        // 确保目录存在
        this._ensureDirs();

        // 注册默认处理器
        this._registerDefaultHandlers();

        console.log('[AutoRecovery] Initialized');
    }

    // ========================================================================
    // 目录初始化
    // ========================================================================

    _ensureDirs() {
        [this.config.recoveryDir, this.config.snapshotDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    // ========================================================================
    // 处理器注册
    // ========================================================================

    /**
     * 注册故障处理器
     */
    registerHandler(failureType, handler) {
        this.handlers.set(failureType, handler);
        console.log(`[AutoRecovery] Registered handler for: ${failureType}`);
    }

    _registerDefaultHandlers() {
        // 崩溃处理 - 重启
        this.registerHandler(FailureType.CRASH, async (failure) => {
            return this._handleRestart(failure);
        });

        // 超时处理 - 重试
        this.registerHandler(FailureType.TIMEOUT, async (failure) => {
            return this._handleRetry(failure);
        });

        // 错误处理 - 根据情况
        this.registerHandler(FailureType.ERROR, async (failure) => {
            if (failure.retryable) {
                return this._handleRetry(failure);
            }
            return this._handleFallback(failure);
        });

        // 卡死处理 - 重启
        this.registerHandler(FailureType.HANG, async (failure) => {
            return this._handleRestart(failure);
        });

        // 内存溢出 - 降级
        this.registerHandler(FailureType.MEMORY, async (failure) => {
            return this._handleFallback(failure);
        });

        // 网络故障 - 重试
        this.registerHandler(FailureType.NETWORK, async (failure) => {
            return this._handleRetry(failure);
        });
    }

    // ========================================================================
    // 故障报告
    // ========================================================================

    /**
     * 报告故障
     */
    async reportFailure(failure) {
        const record = new RecoveryRecord(failure, this._selectStrategy(failure));
        this.records.set(record.id, record);

        console.log(`[AutoRecovery] Failure reported: ${failure.type} in ${failure.moduleId}`);
        this.emit('failure', { failure, record });

        if (this.config.enableAutoRecovery) {
            return this._executeRecovery(record);
        }

        return record;
    }

    /**
     * 批量报告故障
     */
    async reportFailures(failures) {
        const results = [];
        for (const failure of failures) {
            results.push(await this.reportFailure(failure));
        }
        return results;
    }

    // ========================================================================
    // 恢复执行
    // ========================================================================

    /**
     * 执行恢复
     */
    async _executeRecovery(record) {
        record.status = RecoveryRecordStatus.IN_PROGRESS;
        this.emit('recovery_start', { record });

        const handler = this.handlers.get(record.failure.type);

        if (!handler) {
            record.status = RecoveryRecordStatus.SKIPPED;
            record.error = 'No handler registered';
            this.emit('recovery_skip', { record });
            return record;
        }

        // 尝试恢复
        while (record.attempts < record.maxAttempts) {
            record.attempts++;

            try {
                const result = await handler(record.failure);
                record.status = RecoveryRecordStatus.SUCCESS;
                record.result = result;
                record.completedAt = new Date().toISOString();

                console.log(`[AutoRecovery] Recovery succeeded: ${record.id}`);
                this.emit('recovery_success', { record, result });

                return record;
            } catch (error) {
                record.error = error.message;
                console.error(`[AutoRecovery] Attempt ${record.attempts} failed:`, error.message);

                if (record.attempts < record.maxAttempts) {
                    await this._delay(this.config.retryDelay);
                }
            }
        }

        // 所有尝试失败
        record.status = RecoveryRecordStatus.FAILED;
        record.completedAt = new Date().toISOString();

        console.error(`[AutoRecovery] Recovery failed after ${record.attempts} attempts`);
        this.emit('recovery_failed', { record });

        return record;
    }

    // ========================================================================
    // 恢复策略实现
    // ========================================================================

    async _handleRestart(failure) {
        const { moduleId } = failure;

        // 保存当前状态
        await this._saveSnapshot(moduleId);

        // 模拟重启
        this.moduleStatus.set(moduleId, 'restarting');
        this.emit('module_restart', { moduleId });

        // 实际重启逻辑由外部实现
        // 这里只是标记状态
        this.moduleStatus.set(moduleId, 'running');

        return { restarted: true, moduleId };
    }

    async _handleRetry(failure) {
        const { operation, moduleId } = failure;

        if (!operation) {
            throw new Error('No operation to retry');
        }

        const result = await operation();
        return { retried: true, result };
    }

    async _handleRollback(failure) {
        const { moduleId } = failure;
        const snapshot = await this._loadSnapshot(moduleId);

        if (!snapshot) {
            throw new Error('No snapshot to rollback');
        }

        return { rolledBack: true, moduleId, snapshot };
    }

    async _handleFallback(failure) {
        const { moduleId } = failure;

        // 启用降级模式
        this.moduleStatus.set(moduleId, 'degraded');
        this.emit('module_degraded', { moduleId });

        return { fallback: true, moduleId };
    }

    // ========================================================================
    // 快照管理
    // ========================================================================

    /**
     * 保存快照
     */
    async saveSnapshot(moduleId, state) {
        const snapshot = {
            moduleId,
            state,
            timestamp: new Date().toISOString()
        };

        const filePath = path.join(this.config.snapshotDir, `${moduleId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));

        this.snapshots.set(moduleId, snapshot);
        console.log(`[AutoRecovery] Snapshot saved: ${moduleId}`);

        return snapshot;
    }

    /**
     * 加载快照
     */
    async loadSnapshot(moduleId) {
        const cached = this.snapshots.get(moduleId);
        if (cached) return cached;

        const filePath = path.join(this.config.snapshotDir, `${moduleId}.json`);
        if (fs.existsSync(filePath)) {
            const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            this.snapshots.set(moduleId, snapshot);
            return snapshot;
        }

        return null;
    }

    async _saveSnapshot(moduleId) {
        // 内部快照保存
        const status = this.moduleStatus.get(moduleId);
        return this.saveSnapshot(moduleId, { status, savedAt: new Date().toISOString() });
    }

    async _loadSnapshot(moduleId) {
        return this.loadSnapshot(moduleId);
    }

    // ========================================================================
    // 查询接口
    // ========================================================================

    /**
     * 获取恢复记录
     */
    getRecord(recordId) {
        return this.records.get(recordId);
    }

    /**
     * 获取所有恢复记录
     */
    getAllRecords(limit = 50) {
        return Array.from(this.records.values())
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, limit);
    }

    /**
     * 获取模块状态
     */
    getModuleStatus(moduleId) {
        return this.moduleStatus.get(moduleId) || 'unknown';
    }

    /**
     * 获取统计信息
     */
    getStats() {
        const stats = {
            totalRecoveries: this.records.size,
            byStatus: {},
            byType: {},
            successRate: 0
        };

        let successCount = 0;
        for (const record of this.records.values()) {
            stats.byStatus[record.status] = (stats.byStatus[record.status] || 0) + 1;
            stats.byType[record.failure.type] = (stats.byType[record.failure.type] || 0) + 1;
            if (record.status === RecoveryRecordStatus.SUCCESS) successCount++;
        }

        stats.successRate = stats.totalRecoveries > 0
            ? Math.round(successCount / stats.totalRecoveries * 100)
            : 0;

        return stats;
    }

    // ========================================================================
    // 工具方法
    // ========================================================================

    _selectStrategy(failure) {
        const strategyMap = {
            [FailureType.CRASH]: RecoveryStrategy.RESTART,
            [FailureType.TIMEOUT]: RecoveryStrategy.RETRY,
            [FailureType.ERROR]: RecoveryStrategy.RETRY,
            [FailureType.HANG]: RecoveryStrategy.RESTART,
            [FailureType.MEMORY]: RecoveryStrategy.FALLBACK,
            [FailureType.NETWORK]: RecoveryStrategy.RETRY,
            [FailureType.RESOURCE]: RecoveryStrategy.FALLBACK
        };

        return strategyMap[failure.type] || RecoveryStrategy.ALERT;
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ============================================================================
// 单例
// ============================================================================

let instance = null;

export function getAutoRecoveryManager() {
    if (!instance) {
        instance = new AutoRecoveryManager();
    }
    return instance;
}

export default {
    AutoRecoveryManager,
    getAutoRecoveryManager,
    RecoveryStrategy,
    FailureType,
    RecoveryRecordStatus,
    RecoveryStatus
};
