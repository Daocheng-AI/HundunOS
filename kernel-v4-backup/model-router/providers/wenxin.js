/**
 * kernel/model-router/providers/wenxin.js
 * 百度文心 Provider - 支持百度文心大模型
 * 
 * 支持模型：
 * - ERNIE-Bot-4: 百度最新大模型
 * - ERNIE-Bot-turbo: 快速响应模型
 * - ERNIE-Bot: 标准模型
 * - BLOOMZ-7B: 开源模型
 */

import { createLogger } from '../../logger.js';

const logger = createLogger('WenxinProvider');

// 百度文心模型配置
export const WenxinModels = {
    'ernie-bot-4': {
        id: 'ernie-bot-4',
        name: 'ERNIE-Bot-4',
        description: '百度最新大模型，能力最强',
        contextWindow: 8000,
        maxTokens: 2000,
        supports: ['chat', 'completion', 'function_call'],
        pricing: { input: 0.12, output: 0.12 } // 每千tokens
    },
    'ernie-bot-turbo': {
        id: 'ernie-bot-turbo',
        name: 'ERNIE-Bot-turbo',
        description: '快速响应模型，适合高频调用',
        contextWindow: 4000,
        maxTokens: 1500,
        supports: ['chat', 'completion'],
        pricing: { input: 0.004, output: 0.008 }
    },
    'ernie-bot': {
        id: 'ernie-bot',
        name: 'ERNIE-Bot',
        description: '标准模型，平衡性能和成本',
        contextWindow: 4000,
        maxTokens: 1500,
        supports: ['chat', 'completion', 'function_call'],
        pricing: { input: 0.004, output: 0.008 }
    },
    'bloomz-7b': {
        id: 'bloomz-7b',
        name: 'BLOOMZ-7B',
        description: '开源模型，免费使用',
        contextWindow: 2048,
        maxTokens: 1024,
        supports: ['chat', 'completion'],
        pricing: { input: 0, output: 0 }
    }
};

/**
 * 百度文心 Provider
 */
export class WenxinProvider {
    constructor(kernel, config = {}) {
        this.kernel = kernel;
        this.config = {
            apiKey: config.apiKey || process.env.WENXIN_API_KEY,
            secretKey: config.secretKey || process.env.WENXIN_SECRET_KEY,
            baseUrl: config.baseUrl || 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop',
            model: config.model || 'ernie-bot-turbo',
            temperature: config.temperature ?? 0.7,
            topP: config.topP ?? 0.9,
            maxTokens: config.maxTokens ?? 1500,
            timeout: config.timeout ?? 30000,
            ...config
        };

        this.accessToken = null;
        this.tokenExpiry = null;
        
        // 验证配置
        if (!this.config.apiKey || !this.config.secretKey) {
            logger.warn('百度文心 API Key 或 Secret Key 未配置');
        }
    }

    /**
     * 获取访问令牌
     */
    async getAccessToken() {
        // 检查令牌是否有效
        if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }

        try {
            const response = await fetch(
                `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${this.config.apiKey}&client_secret=${this.config.secretKey}`,
                { method: 'POST' }
            );

            if (!response.ok) {
                throw new Error(`获取访问令牌失败: ${response.status}`);
            }

            const data = await response.json();
            this.accessToken = data.access_token;
            // 令牌有效期30天，提前1小时刷新
            this.tokenExpiry = Date.now() + (data.expires_in - 3600) * 1000;

            return this.accessToken;
        } catch (error) {
            logger.error('获取百度文心访问令牌失败:', error);
            throw error;
        }
    }

    /**
     * 调用模型
     */
    async call({ messages, model, temperature, topP, maxTokens, ...options }) {
        const selectedModel = model || this.config.model;
        const modelConfig = WenxinModels[selectedModel];

        if (!modelConfig) {
            throw new Error(`不支持的模型: ${selectedModel}`);
        }

        // 获取访问令牌
        const accessToken = await this.getAccessToken();

        // 构建请求
        const requestBody = {
            messages: this._formatMessages(messages),
            temperature: temperature ?? this.config.temperature,
            top_p: topP ?? this.config.topP,
            max_output_tokens: maxTokens ?? this.config.maxTokens,
        };

        // 添加额外参数
        if (options.functions) {
            requestBody.functions = options.functions;
        }
        if (options.system) {
            requestBody.system = options.system;
        }

        try {
            // 根据模型选择不同的端点
            const endpoint = this._getEndpoint(selectedModel);
            const url = `${this.config.baseUrl}/${endpoint}?access_token=${accessToken}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
                signal: AbortSignal.timeout(this.config.timeout)
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`百度文心 API 错误: ${response.status} - ${error}`);
            }

            const data = await response.json();

            // 解析响应
            return this._parseResponse(data, selectedModel);

        } catch (error) {
            logger.error('百度文心调用失败:', error);
            throw error;
        }
    }

    /**
     * 获取模型端点
     */
    _getEndpoint(model) {
        const endpoints = {
            'ernie-bot-4': 'completions_pro',
            'ernie-bot-turbo': 'completions',
            'ernie-bot': 'completions',
            'bloomz-7b': 'bloomz_7b1'
        };
        return endpoints[model] || 'completions';
    }

    /**
     * 格式化消息
     */
    _formatMessages(messages) {
        return messages.map(msg => ({
            role: msg.role,
            content: msg.content
        }));
    }

    /**
     * 解析响应
     */
    _parseResponse(data, model) {
        return {
            id: data.id || `wenxin-${Date.now()}`,
            model: model,
            content: data.result,
            role: 'assistant',
            usage: {
                prompt_tokens: data.usage?.prompt_tokens || 0,
                completion_tokens: data.usage?.completion_tokens || 0,
                total_tokens: data.usage?.total_tokens || 0
            },
            finish_reason: data.finish_reason || 'stop',
            metadata: {
                provider: 'wenxin',
                model: model,
                timestamp: Date.now()
            }
        };
    }

    /**
     * 流式调用
     */
    async *stream({ messages, model, temperature, topP, maxTokens, ...options }) {
        const selectedModel = model || this.config.model;
        const accessToken = await this.getAccessToken();

        const requestBody = {
            messages: this._formatMessages(messages),
            temperature: temperature ?? this.config.temperature,
            top_p: topP ?? this.config.topP,
            max_output_tokens: maxTokens ?? this.config.maxTokens,
            stream: true
        };

        const endpoint = this._getEndpoint(selectedModel);
        const url = `${this.config.baseUrl}/${endpoint}?access_token=${accessToken}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
                signal: AbortSignal.timeout(this.config.timeout)
            });

            if (!response.ok) {
                throw new Error(`百度文心流式调用失败: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.trim());

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            return;
                        }
                        try {
                            const parsed = JSON.parse(data);
                            yield {
                                content: parsed.result || '',
                                finish_reason: parsed.finish_reason || null
                            };
                        } catch (e) {
                            // 忽略解析错误
                        }
                    }
                }
            }
        } catch (error) {
            logger.error('百度文心流式调用失败:', error);
            throw error;
        }
    }

    /**
     * 获取可用模型列表
     */
    getModels() {
        return Object.entries(WenxinModels).map(([id, config]) => ({
            id,
            ...config
        }));
    }

    /**
     * 健康检查
     */
    async healthCheck() {
        try {
            await this.getAccessToken();
            return { healthy: true, provider: 'wenxin' };
        } catch (error) {
            return { healthy: false, provider: 'wenxin', error: error.message };
        }
    }
}

export default WenxinProvider;