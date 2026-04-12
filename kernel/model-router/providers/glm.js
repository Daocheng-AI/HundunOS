/**
 * HundunOS v3.0 - GLM Provider
 * 智谱 AI GLM 模型适配器
 * 
 * 支持: GLM-4, GLM-4-Air, GLM-4-Flash, GLM-3-Turbo
 */

import { BaseProvider } from './base.js';

// ============================================================================
// GLM 模型配置
// ============================================================================

export const GLMModels = {
    // GLM-4 Series (Latest)
    GLM_4_PLUS: {
        id: 'glm-4-plus', name: 'GLM-4-Plus',
        maxTokens: 128000, costPer1M: 50, type: 'cloud',
        capabilities: ['chat', 'function_call', 'vision']
    },
    GLM_4: {
        id: 'glm-4', name: 'GLM-4',
        maxTokens: 128000, costPer1M: 100, type: 'cloud',
        capabilities: ['chat', 'function_call', 'vision']
    },
    GLM_4_AIR: {
        id: 'glm-4-air', name: 'GLM-4-Air',
        maxTokens: 128000, costPer1M: 1, type: 'cloud',
        capabilities: ['chat', 'function_call']
    },
    GLM_4_AIR_X: {
        id: 'glm-4-airx', name: 'GLM-4-AirX',
        maxTokens: 8192, costPer1M: 10, type: 'cloud',
        capabilities: ['chat', 'function_call']
    },
    GLM_4_FLASH: {
        id: 'glm-4-flash', name: 'GLM-4-Flash',
        maxTokens: 128000, costPer1M: 0.1, type: 'cloud',
        capabilities: ['chat']
    },
    GLM_4_FLASH_X: {
        id: 'glm-4-flashx', name: 'GLM-4-FlashX',
        maxTokens: 128000, costPer1M: 0.1, type: 'cloud',
        capabilities: ['chat']
    },
    GLM_4_LONG: {
        id: 'glm-4-long', name: 'GLM-4-Long',
        maxTokens: 1000000, costPer1M: 1, type: 'cloud',
        capabilities: ['chat']
    },
    // GLM-Z Series (Reasoning)
    GLM_Z1: {
        id: 'glm-z1', name: 'GLM-Z1 Reasoning',
        maxTokens: 32768, costPer1M: 100, type: 'cloud',
        capabilities: ['chat', 'reasoning']
    },
    GLM_Z1_AIR: {
        id: 'glm-z1-air', name: 'GLM-Z1-Air Reasoning',
        maxTokens: 32768, costPer1M: 2, type: 'cloud',
        capabilities: ['chat', 'reasoning']
    },
    GLM_Z1_FLASH: {
        id: 'glm-z1-flash', name: 'GLM-Z1-Flash Reasoning',
        maxTokens: 32768, costPer1M: 0.1, type: 'cloud',
        capabilities: ['chat', 'reasoning']
    },
    // GLM-3 Series
    GLM_3_TURBO: {
        id: 'glm-3-turbo', name: 'GLM-3-Turbo',
        maxTokens: 32000, costPer1M: 0.5, type: 'cloud',
        capabilities: ['chat']
    },
    // Vision Models
    GLM_4V: {
        id: 'glm-4v', name: 'GLM-4V',
        maxTokens: 2048, costPer1M: 50, type: 'cloud',
        capabilities: ['chat', 'vision']
    },
    GLM_4V_PLUS: {
        id: 'glm-4v-plus', name: 'GLM-4V-Plus',
        maxTokens: 8192, costPer1M: 10, type: 'cloud',
        capabilities: ['chat', 'vision']
    },
    // Embedding
    EMBEDDING_3: {
        id: 'embedding-3', name: 'Embedding-3',
        maxTokens: 8192, costPer1M: 0.5, type: 'cloud',
        capabilities: ['embedding']
    },
};

// ============================================================================
// GLM Provider
// ============================================================================

export class GLMProvider extends BaseProvider {
    constructor(kernel, config = {}) {
        super(config);
        this.kernel = kernel;
        
        this.name = 'glm';
        this.type = 'cloud';
        this.models = GLMModels;
        
        this.config = {
            ...this.config,
            apiKey: config.apiKey || process.env.ZHIPU_API_KEY || '',
            baseUrl: config.baseUrl || 'https://open.bigmodel.cn/api/paas/v4',
            model: config.model || 'glm-4-flash',
            timeout: config.timeout || 60000,
        };

        this.circuitBreaker = {
            state: 'closed',
            failures: 0,
            threshold: 5,
            resetTimeout: 60000,
            lastFailure: null
        };

        // review: removed // review: removed console.log('[GLMProvider] Initialized');
    }

    // ========================================================================
    // 核心方法
    // ========================================================================

    /**
     * 聊天补全 - ModelRouter 兼容接口
     */
    async call(messages, opts = {}) {
        const start = Date.now();
        this.stats.requests++;

        if (!this.config.apiKey) {
            this.stats.errors++;
            return { success: false, error: 'ZHIPU_API_KEY not configured' };
        }

        this._checkCircuitBreaker();

        const model = opts.model || this.config.model;

        const requestBody = {
            model,
            messages: this._formatMessages(messages),
            temperature: opts.temperature ?? 0.7,
            max_tokens: opts.max_tokens ?? 2048,
            top_p: opts.top_p ?? 0.9,
            stream: false
        };

        // 函数调用支持
        if (opts.tools) {
            requestBody.tools = opts.tools;
            requestBody.tool_choice = opts.tool_choice || 'auto';
        }

        try {
            const response = await this._request('/chat/completions', requestBody);
            
            this.stats.tokens += response.usage?.total_tokens || 0;
            this.stats.latency += Date.now() - start;
            
            this._recordSuccess();
            
            return {
                success: true,
                content: response.choices?.[0]?.message?.content || '',
                usage: response.usage,
                latency: Date.now() - start,
                model
            };
        } catch (e) {
            this._recordFailure(e);
            return { success: false, error: e.message };
        }
    }

    /**
     * 聊天补全 - 兼容旧接口
     */
    async chat(messages, options = {}) {
        return this.call(messages, options);
    }





    // ========================================================================
    // 状态与统计
    // ========================================================================

    /**
     * 获取统计信息
     */
    getStats() {
        return {
            ...this.stats,
            circuitBreaker: this.circuitBreaker.state,
            available: this.config.apiKey ? true : false
        };
    }

    /**
     * 健康检查
     */
    async healthCheck() {
        try {
            await this.chat([{ role: 'user', content: 'ping' }], { max_tokens: 10 });
            return { healthy: true };
        } catch (error) {
            return { healthy: false, error: error.message };
        }
    }

    // ========================================================================
    // 内部方法
    // ========================================================================



    async _chat(messages, opts) {
        const url = `${this.config.baseUrl}/chat/completions`;
        const body = {
            model: opts.model || this.config.model,
            messages: messages.map(m => ({ 
                role: m.role, 
                content: m.content 
            })),
            temperature: opts.temperature ?? 0.7,
            max_tokens: opts.max_tokens ?? 2048,
            top_p: opts.top_p ?? 0.9,
            stream: false
        };

        // 函数调用支持
        if (opts.tools) {
            body.tools = opts.tools;
            body.tool_choice = opts.tool_choice || 'auto';
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeout);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                body: JSON.stringify(body),
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`GLM error ${response.status}: ${err}`);
            }

            return await response.json();
        } catch (e) {
            clearTimeout(timeout);
            throw e;
        }
    }



    /**
     * 获取 Provider 信息
     */
    getInfo() {
        return { 
            type: 'CLOUD', 
            model: this.config.model, 
            endpoint: this.config.baseUrl 
        };
    }

    /**
     * 获取统计信息
     */
    getStats() {
        return {
            ...this.stats,
            circuitBreaker: this.circuitBreaker.state,
            available: this.config.apiKey ? true : false
        };
    }

    /**
     * 健康检查
     */
    async healthCheck() {
        try {
            await this.call([{ role: 'user', content: 'ping' }], { max_tokens: 10 });
            return { healthy: true };
        } catch (error) {
            return { healthy: false, error: error.message };
        }
    }

    _checkCircuitBreaker() {
        if (this.circuitBreaker.state === 'open') {
            const elapsed = Date.now() - this.circuitBreaker.lastFailure;
            if (elapsed > this.circuitBreaker.resetTimeout) {
                this.circuitBreaker.state = 'half-open';
            } else {
                throw new Error('GLM Provider circuit breaker is open');
            }
        }
    }

    _recordSuccess() {
        this.circuitBreaker.failures = 0;
        this.circuitBreaker.state = 'closed';
    }

    _recordFailure(error) {
        this.stats.errors++;
        this.circuitBreaker.failures++;
        this.circuitBreaker.lastFailure = Date.now();

        if (this.circuitBreaker.failures >= this.circuitBreaker.threshold) {
            this.circuitBreaker.state = 'open';
        }

        console.error('[GLMProvider] Request failed:', error.message);
    }
}

// ============================================================================
// 导出
// ============================================================================

export default {
    GLMProvider,
    GLMModels
};
