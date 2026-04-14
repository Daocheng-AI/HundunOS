// hundunos/kernel/model-router/providers/base.js — Provider 基类
// 统一所有 Provider 的接口和公共逻辑

/**
 * Provider 基类
 * 所有 LLM Provider 都应继承此类
 */
export class BaseProvider {
    constructor(config = {}) {
        this.config = {
            timeout: config.timeout || 30000,
            maxRetries: config.maxRetries || 2,
            retryDelay: config.retryDelay || 1000,
            ...config,
        };
        this.stats = {
            requests: 0,
            tokens: 0,
            errors: 0,
            latency: 0,
        };
    }

    /**
     * 调用 LLM（子类实现）
     * @param {Array} messages - 消息列表
     * @param {Object} opts - 选项
     * @returns {Promise<Object>} 响应结果
     */
    async call(messages, opts = {}) {
        throw new Error('BaseProvider.call() must be implemented by subclass');
    }

    /**
     * 带重试的调用
     * @param {Array} messages - 消息列表
     * @param {Object} opts - 选项
     * @returns {Promise<Object>} 响应结果
     */
    async callWithRetry(messages, opts = {}) {
        const { maxRetries = this.config.maxRetries, retryDelay = this.config.retryDelay } = opts;
        let lastError;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await this.call(messages, opts);
            } catch (error) {
                lastError = error;
                this.stats.errors++;
                if (attempt < maxRetries) {
                    await this._sleep(retryDelay * (attempt + 1));
                }
            }
        }

        return { success: false, error: lastError.message };
    }

    /**
     * 延迟
     * @param {number} ms - 毫秒
     * @returns {Promise<void>}
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 构建请求头
     * @param {string} apiKey - API Key
     * @returns {Object} 请求头
     */
    _buildHeaders(apiKey) {
        return {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        };
    }

    /**
     * 带超时的 fetch
     * @param {string} url - URL
     * @param {Object} options - 选项
     * @returns {Promise<Response>} 响应
     */
    async _fetchWithTimeout(url, options = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });
            clearTimeout(timeout);
            return response;
        } catch (e) {
            clearTimeout(timeout);
            throw e;
        }
    }

    /**
     * 更新统计
     * @param {number} tokens - token 数
     * @param {number} latency - 延迟（毫秒）
     */
    _updateStats(tokens, latency) {
        this.stats.requests++;
        this.stats.tokens += tokens;
        this.stats.latency += latency;
    }

    /**
     * 获取统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        return {
            ...this.stats,
            avgLatency: this.stats.requests > 0 ? this.stats.latency / this.stats.requests : 0,
        };
    }

    /**
     * 重置统计
     */
    resetStats() {
        this.stats = {
            requests: 0,
            tokens: 0,
            errors: 0,
            latency: 0,
        };
    }
}

export default BaseProvider;
