/**
 * HundunOS v3.0 - DashScope Provider
 * 阿里百炼模型适配器
 * 
 * 支持: Qwen系列模型 (qwen-max, qwen-plus, qwen-turbo, qwen-long, qwen-vl-plus, qwen2.5-coder)
 */

import { BaseProvider } from './base.js';

// ============================================================================
// DashScope 模型配置
// ============================================================================

export const MODELS = {
    // Qwen 系列模型
    'qwen-max': {
        name: 'Qwen-Max',
        context: 128000,
        costPer1M: 0.8,
        capabilities: ['chat', 'function_call', 'vision']
    },
    'qwen-plus': {
        name: 'Qwen-Plus',
        context: 128000,
        costPer1M: 0.4,
        capabilities: ['chat', 'function_call']
    },
    'qwen-turbo': {
        name: 'Qwen-Turbo',
        context: 128000,
        costPer1M: 0.2,
        capabilities: ['chat']
    },
    'qwen-long': {
        name: 'Qwen-Long',
        context: 1000000,
        costPer1M: 0.1,
        capabilities: ['chat']
    },
    'qwen-vl-plus': {
        name: 'Qwen-VL-Plus',
        context: 128000,
        costPer1M: 0.8,
        capabilities: ['chat', 'vision']
    },
    'qwen2.5-coder': {
        name: 'Qwen2.5-Coder',
        context: 128000,
        costPer1M: 0.4,
        capabilities: ['chat', 'code']
    },
    'qwen2.5-32b-instruct': {
        name: 'Qwen2.5-32B-Instruct',
        context: 32768,
        costPer1M: 0.3,
        capabilities: ['chat', 'code']
    },
    'qwen2.5-14b-instruct': {
        name: 'Qwen2.5-14B-Instruct',
        context: 32768,
        costPer1M: 0.15,
        capabilities: ['chat', 'code']
    },
    'qwen2.5-7b-instruct': {
        name: 'Qwen2.5-7B-Instruct',
        context: 32768,
        costPer1M: 0.08,
        capabilities: ['chat', 'code']
    },
    // 通义千问系列
    'qwen-vl-max': {
        name: 'Qwen-VL-Max',
        context: 128000,
        costPer1M: 1.0,
        capabilities: ['chat', 'vision']
    },
    'qwen-audio-turbo': {
        name: 'Qwen-Audio-Turbo',
        context: 128000,
        costPer1M: 0.3,
        capabilities: ['chat', 'audio']
    }
};

// ============================================================================
// DashScope Provider
// ============================================================================

export class DashScopeProvider extends BaseProvider {
    constructor(kernel, config = {}) {
        super(config);
        this.kernel = kernel;
        
        this.name = 'dashscope';
        this.type = 'cloud';
        
        this.config = {
            ...this.config,
            apiKey: config.apiKey || process.env.DASHSCOPE_API_KEY || '',
            baseUrl: config.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            model: config.model || 'qwen-max',
            timeout: config.timeout || 60000,
        };

        this.circuitBreaker = {
            state: 'closed',
            failures: 0,
            threshold: 5,
            resetTimeout: 60000,
            lastFailure: null
        };

        // review: removed // review: removed console.log('[DashScopeProvider] Initialized');
    }

    // ========================================================================
    // 核心方法
    // ========================================================================

    /**
     * 聊天补全
     */
    async call(messages, opts = {}) {
        const start = Date.now();
        this.stats.requests++;

        if (!this.config.apiKey) {
            this.stats.errors++;
            return { success: false, error: 'DASHSCOPE_API_KEY not configured' };
        }

        this._checkCircuitBreaker();

        try {
            const resp = await this._chat(messages, opts);
            this.stats.tokens += resp.usage?.total_tokens || 0;
            this.stats.latency += Date.now() - start;
            
            this._recordSuccess();
            
            return {
                success: true,
                content: resp.choices?.[0]?.message?.content || '',
                usage: resp.usage,
                latency: Date.now() - start,
                model: this.config.model
            };
        } catch (e) {
            this._recordFailure(e);
            return { success: false, error: e.message };
        }
    }

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
                throw new Error(`DashScope error ${response.status}: ${err}`);
            }

            return await response.json();
        } catch (e) {
            clearTimeout(timeout);
            throw e;
        }
    }

    /**
     * 流式聊天
     */
    async *chatStream(messages, opts = {}) {
        if (!this.config.apiKey) {
            throw new Error('DashScope API key not configured');
        }

        const model = opts.model || this.config.model;
        const url = `${this.config.baseUrl}/chat/completions`;

        const requestBody = {
            model,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            temperature: opts.temperature ?? 0.7,
            stream: true
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') return;
                    
                    try {
                        const parsed = JSON.parse(data);
                        yield parsed;
                    } catch {
                        // 忽略解析错误
                    }
                }
            }
        }
    }

    /**
     * 结构化输出调用
     */
    async callStructured(messages, schema) {
        const model = this.config.model;
        
        // DashScope 支持 JSON Schema 格式
        const systemMessage = {
            role: 'system',
            content: `请严格按照以下 JSON Schema 格式返回数据：\n${JSON.stringify(schema, null, 2)}`
        };
        
        const enhancedMessages = [systemMessage, ...messages];
        
        const result = await this.call(enhancedMessages, {
            temperature: 0.1, // 降低温度以提高结构化输出准确性
            max_tokens: 2048
        });

        if (!result.success) {
            return result;
        }

        try {
            // 尝试解析 JSON
            const content = result.content;
            const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || 
                            content.match(/```\n([\s\S]*?)\n```/) || 
                            content.match(/(\{[\s\S]*\})/);
            
            if (jsonMatch) {
                const jsonStr = jsonMatch[1] || jsonMatch[0];
                const data = JSON.parse(jsonStr);
                return {
                    success: true,
                    data,
                    tokensUsed: result.usage?.total_tokens || 0,
                    provider: 'dashscope'
                };
            } else {
                // 尝试直接解析
                const data = JSON.parse(content);
                return {
                    success: true,
                    data,
                    tokensUsed: result.usage?.total_tokens || 0,
                    provider: 'dashscope'
                };
            }
        } catch (e) {
            return {
                success: false,
                error: `Failed to parse structured output: ${e.message}`,
                rawContent: result.content
            };
        }
    }

    // ========================================================================
    // 模型信息
    // ========================================================================

    /**
     * 获取可用模型列表
     */
    listModels() {
        return Object.entries(MODELS).map(([id, meta]) => ({
            id,
            name: meta.name,
            maxTokens: meta.context,
            costPer1M: meta.costPer1M,
            capabilities: meta.capabilities
        }));
    }

    /**
     * 获取模型配置
     */
    getModel(modelId) {
        return MODELS[modelId];
    }

    /**
     * 估算成本
     */
    estimateCost(inputTokens, outputTokens, model = 'qwen-max') {
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
            await this.call([{ role: 'user', content: 'ping' }], { max_tokens: 10 });
            return { healthy: true };
        } catch (error) {
            return { healthy: false, error: error.message };
        }
    }

    // ========================================================================
    // 内部方法
    // ========================================================================

    _checkCircuitBreaker() {
        if (this.circuitBreaker.state === 'open') {
            const elapsed = Date.now() - this.circuitBreaker.lastFailure;
            if (elapsed > this.circuitBreaker.resetTimeout) {
                this.circuitBreaker.state = 'half-open';
            } else {
                throw new Error('DashScope Provider circuit breaker is open');
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

        console.error('[DashScopeProvider] Request failed:', error.message);
    }

    _updateStats(tokens, latency) {
        this.stats.tokens += tokens;
        this.stats.latency += latency;
    }
}

// ============================================================================
// 导出
// ============================================================================

export default {
    DashScopeProvider,
    MODELS
};