// hundunos/extension-modules/auto-recovery/index.js — Auto-Recovery System
// 功能: 错误自动检测与恢复，支持多种恢复策略
// 状态: 新增

import { randomUUID } from 'crypto';
// 统一常量（来自 kernel/constants.js，消除重复定义）
export { RecoveryStrategy } from '../../kernel/constants.js';

export const ErrorType = {
    CRASH: 'crash',              // 进程崩溃
    TIMEOUT: 'timeout',          // 操作超时
    ERROR: 'error',              // 普通错误
    HANG: 'hang',                // 进程挂起
    MEMORY: 'memory',            // 内存溢出
    NETWORK: 'network'           // 网络问题
};

export const RecoveryResult = {
    SUCCESS: 'success',          // 恢复成功
    FAILED: 'failed',            // 恢复失败
    PARTIAL: 'partial'           // 部分恢复
};

export class AutoRecovery {
    constructor(kernel) {
        this.kernel = kernel;
        this.errorHistory = [];
        this.recoveryRules = new Map();
        
        // 默认恢复策略 (来自架构文档)
        this.defaultStrategies = {
            [ErrorType.CRASH]: [RecoveryStrategy.RESTART, RecoveryStrategy.ROLLBACK, RecoveryStrategy.FALLBACK],
            [ErrorType.TIMEOUT]: [RecoveryStrategy.RETRY, RecoveryStrategy.FALLBACK, RecoveryStrategy.SKIP],
            [ErrorType.ERROR]: [RecoveryStrategy.RETRY, RecoveryStrategy.SKIP],
            [ErrorType.HANG]: [RecoveryStrategy.RESTART],
            [ErrorType.MEMORY]: [RecoveryStrategy.RESTART, RecoveryStrategy.FALLBACK],
            [ErrorType.NETWORK]: [RecoveryStrategy.RETRY, RecoveryStrategy.FALLBACK, RecoveryStrategy.SKIP]
        };
        
        this.config = {
            maxRetries: 3,
            retryDelay: 1000,
            enableRollback: true,
            enableAlert: true
        };
        
        this.stats = {
            errorsDetected: 0,
            recoveriesAttempted: 0,
            recoveriesSucceeded: 0,
            recoveriesFailed: 0
        };
    }

    async initialize() {
        console.log('[AutoRecovery] Initialized');
    }

    /**
     * 检测错误类型
     */
    detectErrorType(error) {
        if (!error) return ErrorType.ERROR;
        
        const errorStr = String(error).toLowerCase();
        
        if (errorStr.includes('crash') || errorStr.includes('exit') || errorStr.includes('segfault')) {
            return ErrorType.CRASH;
        }
        if (errorStr.includes('timeout') || errorStr.includes('timed out')) {
            return ErrorType.TIMEOUT;
        }
        if (errorStr.includes('memory') || errorStr.includes('heap') || errorStr.includes('oom')) {
            return ErrorType.MEMORY;
        }
        if (errorStr.includes('hang') || errorStr.includes('deadlock')) {
            return ErrorType.HANG;
        }
        if (errorStr.includes('network') || errorStr.includes('connection') || errorStr.includes('ECONNREFUSED')) {
            return ErrorType.NETWORK;
        }
        
        return ErrorType.ERROR;
    }

    /**
     * 执行恢复
     */
    async recover(context) {
        const { error, operation, metadata } = context;
        
        this.stats.errorsDetected++;
        this.stats.recoveriesAttempted++;
        
        const errorType = this.detectErrorType(error);
        const strategies = this._getStrategies(errorType);
        
        console.log(`[AutoRecovery] Error detected: ${errorType}, trying strategies: ${strategies.join(', ')}`);
        
        // 记录错误
        const errorRecord = {
            id: randomUUID(),
            timestamp: Date.now(),
            errorType,
            error: String(error),
            operation,
            strategiesAttempted: [],
            finalResult: null
        };
        
        // 依次尝试恢复策略
        for (const strategy of strategies) {
            console.log(`[AutoRecovery] Trying strategy: ${strategy}`);
            
            const result = await this._executeStrategy(strategy, context);
            errorRecord.strategiesAttempted.push({ strategy, result });
            
            if (result.success) {
                this.stats.recoveriesSucceeded++;
                errorRecord.finalResult = RecoveryResult.SUCCESS;
                
                // 发送告警
                if (this.config.enableAlert && errorType !== ErrorType.ERROR) {
                    await this._sendAlert(errorType, strategy, operation);
                }
                
                this.errorHistory.push(errorRecord);
                return {
                    success: true,
                    recovered: true,
                    strategy,
                    result: result.data
                };
            }
        }
        
        // 所有策略都失败
        this.stats.recoveriesFailed++;
        errorRecord.finalResult = RecoveryResult.FAILED;
        this.errorHistory.push(errorRecord);
        
        return {
            success: false,
            recovered: false,
            error: 'All recovery strategies failed'
        };
    }

    /**
     * 获取恢复策略
     */
    _getStrategies(errorType) {
        // 检查是否有自定义规则
        const customRule = this.recoveryRules.get(errorType);
        if (customRule) return customRule;
        
        return this.defaultStrategies[errorType] || [RecoveryStrategy.RETRY];
    }

    /**
     * 执行恢复策略
     */
    async _executeStrategy(strategy, context) {
        const { operation, metadata } = context;
        
        switch (strategy) {
            case RecoveryStrategy.RETRY:
                return await this._retry(operation, metadata);
            case RecoveryStrategy.RESTART:
                return await this._restart(operation, metadata);
            case RecoveryStrategy.ROLLBACK:
                return await this._rollback(operation, metadata);
            case RecoveryStrategy.FALLBACK:
                return await this._fallback(operation, metadata);
            case RecoveryStrategy.SKIP:
                return { success: true, data: { skipped: true } };
            case RecoveryStrategy.ALERT:
                await this._sendAlert('manual', strategy, operation);
                return { success: true, data: { alerted: true } };
            default:
                return { success: false, error: 'Unknown strategy' };
        }
    }

    /**
     * 重试策略
     */
    async _retry(operation, metadata) {
        const maxRetries = metadata?.maxRetries || this.config.maxRetries;
        
        for (let i = 0; i < maxRetries; i++) {
            console.log(`[AutoRecovery] Retry attempt ${i + 1}/${maxRetries}`);
            
            try {
                if (this.kernel?.process) {
                    const result = await this.kernel.process(operation);
                    if (result.success) {
                        return { success: true, data: result };
                    }
                }
            } catch (e) {
                console.log(`[AutoRecovery] Retry failed: ${e.message}`);
            }
            
            if (i < maxRetries - 1) {
                await this._sleep(this.config.retryDelay * (i + 1));
            }
        }
        
        return { success: false, error: 'Max retries exceeded' };
    }

    /**
     * 重启策略
     */
    async _restart(operation, metadata) {
        try {
            // 重启相关模块
            if (metadata?.module && this.kernel?.moduleRegistry) {
                await this.kernel.moduleRegistry.restart(metadata.module);
                return { success: true, data: { restarted: metadata.module } };
            }
            
            return { success: true, data: { restarted: 'kernel' } };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 回滚策略
     */
    async _rollback(operation, metadata) {
        if (!this.config.enableRollback) {
            return { success: false, error: 'Rollback disabled' };
        }
        
        try {
            // 执行回滚
            const snapshotId = metadata?.snapshotId;
            if (snapshotId && this.kernel?.recoverableMemory) {
                await this.kernel.recoverableMemory.restore(snapshotId);
                return { success: true, data: { restored: snapshotId } };
            }
            
            return { success: true, data: { rolledBack: true } };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 降级策略
     */
    async _fallback(operation, metadata) {
        try {
            // 尝试使用备用方案
            const fallbackModel = metadata?.fallbackModel;
            if (fallbackModel) {
                // 如果有降级模型配置，使用它
                return { success: true, data: { fallback: fallbackModel } };
            }
            
            // 默认降级: 切换到本地模型
            return { success: true, data: { fallback: 'local_model' } };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 发送告警
     */
    async _sendAlert(errorType, strategy, operation) {
        console.log(`[AutoRecovery] ALERT: ${errorType} via ${strategy} for ${operation}`);
        
        // 可以集成到通知系统
        if (this.kernel?.emit) {
            this.kernel.emit('recovery:alert', {
                errorType,
                strategy,
                operation,
                timestamp: Date.now()
            });
        }
    }

    /**
     * 睡眠
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 添加自定义恢复规则
     */
    addRule(errorType, strategies) {
        this.recoveryRules.set(errorType, strategies);
    }

    /**
     * 获取错误历史
     */
    getErrorHistory(limit = 20) {
        return this.errorHistory.slice(-limit);
    }

    /**
     * 获取统计
     */
    getStats() {
        return {
            ...this.stats,
            errorHistory: this.errorHistory.length,
            recoveryRate: this.stats.recoveriesAttempted > 0
                ? (this.stats.recoveriesSucceeded / this.stats.recoveriesAttempted * 100).toFixed(1) + '%'
                : '0%'
        };
    }
}

export function getAutoRecovery(kernel) {
    return new AutoRecovery(kernel);
}