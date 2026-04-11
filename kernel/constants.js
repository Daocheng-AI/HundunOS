// hundunos/kernel/constants.js — 全局常量统一管理
// 消除分散定义的常量，避免概念混乱

// ============================================================================
// 恢复策略（统一 RecoveryStrategy）
// ============================================================================

/**
 * 故障恢复策略枚举
 * 曾在 kernel/recovery/index.js 和 stable-modules/recovery/index.js 重复定义
 */
export const RecoveryStrategy = {
    RESTART:    'restart',     // 重启模块
    ROLLBACK:   'rollback',    // 回滚状态
    RETRY:      'retry',       // 重试操作
    FALLBACK:   'fallback',    // 降级处理
    SKIP:       'skip',        // 跳过
    ALERT:      'alert'        // 仅告警
};

// ============================================================================
// 恢复状态
// ============================================================================

export const RecoveryStatus = {
    IDLE:       'idle',
    DETECTING:  'detecting',
    RECOVERING: 'recovering',
    SUCCESS:    'success',
    FAILED:     'failed'
};

// ============================================================================
// 恢复动作
// ============================================================================

export const RecoveryAction = {
    RESTART:    'restart',     // 重启模块
    ROLLBACK:   'rollback',    // 回滚快照
    RELOAD:     'reload',      // 重新加载
    ESCALATE:   'escalate',    // 升级处理
    IGNORE:     'ignore'       // 忽略
};

// ============================================================================
// 故障类型
// ============================================================================

export const FailureType = {
    CRASH:      'crash',        // 崩溃
    TIMEOUT:    'timeout',      // 超时
    ERROR:      'error',        // 错误
    HANG:       'hang'          // 卡死
};

// ============================================================================
// 模块生命周期状态
// ============================================================================

export const ModuleLifecycle = {
    CREATED:    'created',
    INITIALIZING: 'initializing',
    READY:      'ready',
    RUNNING:    'running',
    PAUSED:     'paused',
    STOPPING:   'stopping',
    STOPPED:    'stopped',
    ERROR:      'error'
};

// ============================================================================
// HTTP 状态码（常用）
// ============================================================================

export const HttpStatus = {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    TIMEOUT: 408,
    INTERNAL_SERVER_ERROR: 500,
    BAD_GATEWAY: 502,
    SERVICE_UNAVAILABLE: 503
};

// ============================================================================
// 全局默认值
// ============================================================================

export const Defaults = {
    SEARCH_TIMEOUT:    10000,   // 搜索超时 10s
    RPC_TIMEOUT:      5000,    // RPC 超时 5s
    MAX_RETRIES:      3,       // 最大重试次数
    RETRY_DELAY_MS:   1000,    // 重试间隔 1s
    CONTEXT_TOKEN_LIMIT: 12000 // 对话压缩阈值
};

export default {
    RecoveryStrategy,
    RecoveryStatus,
    RecoveryAction,
    FailureType,
    ModuleLifecycle,
    HttpStatus,
    Defaults
};
