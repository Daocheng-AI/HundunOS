// hundunos/kernel/error-codes.js — 标准错误码体系 v1.0
// 参考 Onyx onyx.utils.exception 设计的分级错误码
// 目标：让错误可定位、可分类、可恢复

// ================================================================
// 错误码分类
// ================================================================

/**
 * 错误码命名空间：
 *   HN_0xx = 系统级错误（内核、配置、环境）
 *   HN_1xx = 模型/Provider 错误
 *   HN_2xx = 工具执行错误
 *   HN_3xx = 上下文/会话错误
 *   HN_4xx = 外部依赖错误
 *   HN_5xx = Deep Research 错误
 */
export const HundunErrorCode = Object.freeze({
    // === 系统级 (0xx) ===
    HN_000: { http: 500, severity: 'critical', message: '未知系统错误', recoverable: false },
    HN_001: { http: 500, severity: 'critical', message: '内核初始化失败', recoverable: true },
    HN_002: { http: 503, severity: 'high', message: '存储服务不可用', recoverable: true },
    HN_003: { http: 500, severity: 'high', message: '配置解析失败', recoverable: true },
    HN_004: { http: 400, severity: 'medium', message: '无效的请求参数', recoverable: true },
    HN_005: { http: 500, severity: 'high', message: '模块加载失败', recoverable: true },

    // === 模型/Provider (1xx) ===
    HN_100: { http: 503, severity: 'high', message: '无可用的 LLM Provider', recoverable: true },
    HN_101: { http: 504, severity: 'high', message: 'LLM 调用超时', recoverable: true },
    HN_102: { http: 502, severity: 'high', message: 'LLM Provider 返回错误响应', recoverable: true },
    HN_103: { http: 401, severity: 'high', message: 'LLM Provider 认证失败', recoverable: true },
    HN_104: { http: 400, severity: 'medium', message: 'LLM 响应格式解析失败', recoverable: false },
    HN_105: { http: 429, severity: 'medium', message: 'LLM 请求频率超限（熔断器触发）', recoverable: true },
    HN_106: { http: 413, severity: 'medium', message: '输入超出模型上下文窗口', recoverable: true },
    HN_107: { http: 400, severity: 'low', message: '空 LLM 响应（无内容）', recoverable: true },

    // === 工具执行 (2xx) ===
    HN_200: { http: 500, severity: 'high', message: '工具执行失败', recoverable: true },
    HN_201: { http: 404, severity: 'medium', message: '工具未找到', recoverable: false },
    HN_202: { http: 404, severity: 'medium', message: '工具不可用（文件缺失）', recoverable: true },
    HN_203: { http: 408, severity: 'medium', message: '工具执行超时', recoverable: true },
    HN_204: { http: 500, severity: 'medium', message: '工具脚本错误（非零退出码）', recoverable: true },
    HN_205: { http: 500, severity: 'medium', message: '工具并发超限', recoverable: true },
    HN_206: { http: 403, severity: 'medium', message: '工具执行被权限策略拒绝', recoverable: false },

    // === 上下文/会话 (3xx) ===
    HN_300: { http: 500, severity: 'high', message: '会话上下文初始化失败', recoverable: true },
    HN_301: { http: 500, severity: 'medium', message: '上下文压缩失败', recoverable: true },
    HN_302: { http: 400, severity: 'medium', message: '孤立的 Tool Response（无对应 Tool Call）', recoverable: true },
    HN_303: { http: 500, severity: 'low', message: '消息历史序列化失败', recoverable: true },
    HN_304: { http: 413, severity: 'medium', message: 'Token 预算超出模型限制', recoverable: true },

    // === 外部依赖 (4xx) ===
    HN_400: { http: 502, severity: 'high', message: '外部 API 不可达', recoverable: true },
    HN_401: { http: 401, severity: 'high', message: '外部 API 认证失败', recoverable: true },
    HN_402: { http: 429, severity: 'medium', message: '外部 API 速率限制', recoverable: true },
    HN_403: { http: 404, severity: 'medium', message: '外部 API 资源不存在', recoverable: false },
    HN_404: { http: 502, severity: 'medium', message: '外部 API 响应格式错误', recoverable: false },

    // === Deep Research (5xx) ===
    HN_500: { http: 500, severity: 'medium', message: 'Deep Research 初始化失败', recoverable: true },
    HN_501: { http: 500, severity: 'medium', message: '研究计划生成失败', recoverable: true },
    HN_502: { http: 504, severity: 'medium', message: '研究循环超时（超过最大时长）', recoverable: true },
    HN_503: { http: 500, severity: 'low', message: '最终报告生成失败（部分知识可用）', recoverable: true },
    HN_504: { http: 500, severity: 'low', message: 'Citation 处理失败', recoverable: true },
    HN_505: { http: 400, severity: 'low', message: 'Clarification 解析失败', recoverable: false },
});

// ================================================================
// HundunError 类
// ================================================================

export class HundunError extends Error {
    /**
     * @param {string} code - 错误码，如 'HN_102'
     * @param {string} message - 可选的人类可读补充信息
     * @param {Object} context - 可选：{provider, toolId, sessionId, ...}
     */
    constructor(code, message, context = {}) {
        const meta = HundunErrorCode[code] || HundunErrorCode.HN_000;
        const fullMessage = message ? `${meta.message}: ${message}` : meta.message;
        super(fullMessage);

        this.name = 'HundunError';
        this.code = code;
        this.httpStatus = meta.http;
        this.severity = meta.severity;
        this.recoverable = meta.recoverable;
        this.context = context;
        this.timestamp = Date.now();

        Error.captureStackTrace?.(this, this.constructor);
    }

    toJSON() {
        return {
            error: {
                code: this.code,
                message: this.message,
                severity: this.severity,
                recoverable: this.recoverable,
                context: this.context,
                timestamp: this.timestamp,
            }
        };
    }

    toString() {
        return `[${this.code}] ${this.message}`;
    }
}

// ================================================================
// 便捷构造器
// ================================================================

export const errors = {
    noProvider: (context = {}) =>
        new HundunError('HN_100', null, { provider: context.provider, ...context }),

    llmTimeout: (context = {}) =>
        new HundunError('HN_101', null, { provider: context.provider, timeout: context.timeout, ...context }),

    llmError: (msg, context = {}) =>
        new HundunError('HN_102', msg, { provider: context.provider, ...context }),

    authFailed: (context = {}) =>
        new HundunError('HN_103', null, { provider: context.provider, ...context }),

    circuitBreaker: (context = {}) =>
        new HundunError('HN_105', 'Provider temporarily unavailable', { provider: context.provider, ...context }),

    contextOverflow: (context = {}) =>
        new HundunError('HN_106', `Input exceeds ${context.maxTokens} tokens`, { maxTokens: context.maxTokens, ...context }),

    toolNotFound: (toolId) =>
        new HundunError('HN_201', `Tool '${toolId}' not found`, { toolId }),

    toolTimeout: (toolId, timeout) =>
        new HundunError('HN_203', `Tool '${toolId}' timed out after ${timeout}ms`, { toolId, timeout }),

    toolFailed: (toolId, msg) =>
        new HundunError('HN_200', `Tool '${toolId}': ${msg}`, { toolId }),

    orphanedToolResponse: (context = {}) =>
        new HundunError('HN_302', 'Found tool_response without preceding tool_call', context),

    researchTimeout: (maxMs) =>
        new HundunError('HN_502', `Research exceeded ${maxMs}ms limit`, { maxMs }),

    apiRateLimit: (context = {}) =>
        new HundunError('HN_402', null, { api: context.api, ...context }),
};

// ================================================================
// 错误处理中间件
// ================================================================

/** 统一错误处理：将任何错误转换为 HundunError */
export function normalizeError(err, defaultCode = 'HN_000') {
    if (err instanceof HundunError) return err;
    const code = err?.code || defaultCode;
    const message = err?.message || String(err);
    const context = err?.context || {};
    return new HundunError(code, message, context);
}

/** 判断错误是否可恢复 */
export function isRecoverable(err) {
    return normalizeError(err).recoverable;
}

/** 按严重级别过滤错误 */
export function filterBySeverity(errors, minSeverity = 'low') {
    const levels = { low: 0, medium: 1, high: 2, critical: 3 };
    const minLevel = levels[minSeverity] ?? 0;
    return errors.filter(e => (levels[normalizeError(e).severity] ?? 0) >= minLevel);
}
