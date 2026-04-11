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

export const export const GLMModels = {
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
    constructor(config = {}) {
        super(config);
        
        this.name = 'glm';
        this.type = 'cloud';
        this.models = GLMModels;
        
        this.config = {
            ...this.config,
            apiKey: config.apiKey || process.env.ZHIPU_API_KEY,
            baseUrl: config.baseUrl || 'https://open.bigmodel.cn/api/paas/v4',
            defaultModel: config.defaultModel || 'glm-4-flash',
        };

        this.circuitBreaker = {
            state: 'closed',
            failures: 0,
            threshold: 5,
            resetTimeout: 60000,
            lastFailure: null
        };

        console.log('[GLMProvider] Initialized');
    }

    // ========================================================================
    // 核心方法
    // ========================================================================

    /**
     * 聊天补全
     */
    async chat(messages, options = {}) {
        if (!this.config.apiKey) {
            throw new Error('GLM API key not configured');
        }

        this._checkCircuitBreaker();

        const model = options.model || this.config.defaultModel;
        const modelConfig = this.models[model.toUpperCase().replace('-', '_')];

        const requestBody = {
            model,
            messages: this._formatMessages(messages),
            temperature: options.temperature ?? 0.7,
            top_p: options.top_p ?? 0.9,
            max_tokens: options.max_tokens ?? 4096,
            stream: false
        };

        // 函数调用支持
        if (options.tools) {
            requestBody.tools = options.tools;
            requestBody.tool_choice = options.tool_choice || 'auto';
        }

        const startTime = Date.now();

        try {
            const response = await this._request('/chat/completions', requestBody);
            
            this.stats.requests++;
            this.stats.tokens.input += response.usage?.prompt_tokens || 0;
            this.stats.tokens.output += response.usage?.completion_tokens || 0;
            this.stats.lastRequest = new Date().toISOString();

            this._recordSuccess();

            return {
                success: true,
                model,
                content: response.choices[0]?.message?.content,
                toolCalls: response.choices[0]?.message?.tool_calls,
                usage: response.usage,
                latency: Date.now() - startTime
            };
        } catch (error) {
            this._recordFailure(error);
            throw error;
        }
    }

    /**
     * 流式聊天
     */
    async *chatStream(messages, options = {}) {
        if (!this.config.apiKey) {
            throw new Error('GLM API key not configured');
        }

        const model = options.model || this.config.defaultModel;

        const requestBody = {
            model,
            messages: this._formatMessages(messages),
            temperature: options.temperature ?? 0.7,
            stream: true
        };

        const response = await this._requestStream('/chat/completions', requestBody);

        for await (const chunk of response) {
            const data = this._parseStreamChunk(chunk);
            if (data) {
                yield data;
            }
        }
    }

    /**
     * Embedding 向量
     */
    async embed(texts, options = {}) {
        const requestBody = {
            model: options.model || 'embedding-2',
            input: Array.isArray(texts) ? texts : [texts]
        };

        const response = await this._request('/embeddings', requestBody);

        return {
            embeddings: response.data.map(d => d.embedding),
            model: requestBody.model,
            usage: response.usage
        };
    }

    // ========================================================================
    // 模型信息
    // ========================================================================

    /**
     * 获取可用模型列表
     */
    listModels() {
        return Object.values(this.models).map(m => ({
            id: m.id,
            name: m.name,
            maxTokens: m.maxTokens,
            costPer1M: m.costPer1M,
            capabilities: m.capabilities
        }));
    }

    /**
     * 获取模型配置
     */
    getModel(modelId) {
        const key = modelId.toUpperCase().replace('-', '_');
        return this.models[key];
    }

    /**
     * 估算成本
     */
    estimateCost(inputTokens, outputTokens, model = 'glm-4-flash') {
        const config = this.getModel(model);
        if (!config) return 0;

        const inputCost = (inputTokens / 1000000) * config.costPer1M;
        const outputCost = (outputTokens / 2000000) * config.costPer1M; // 输出通常 2x

        return inputCost + outputCost;
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

    _formatMessages(messages) {
        return messages.map(msg => {
            if (typeof msg === 'string') {
                return { role: 'user', content: msg };
            }
            return msg;
        });
    }

    async _request(endpoint, body) {
        const url = `${this.config.baseUrl}${endpoint}`;
        
        const response = await this._fetchWithTimeout(url, {
            method: 'POST',
            headers: this._buildHeaders(this.config.apiKey),
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `GLM API error: ${response.status}`);
        }

        return response.json();
    }

    async *_requestStream(endpoint, body) {
        const url = `${this.config.baseUrl}${endpoint}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify({ ...body, stream: true })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            yield decoder.decode(value);
        }
    }

    _parseStreamChunk(chunk) {
        const lines = chunk.split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') return null;
                try {
                    return JSON.parse(data);
                } catch {
                    return null;
                }
            }
        }
        return null;
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
