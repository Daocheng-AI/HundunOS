/**
 * kernel/model-router/providers/hunyuan.js
 * 腾讯混元 Provider - 支持腾讯混元大模型
 * 
 * 支持模型：
 * - hunyuan-lite: 轻量级模型，快速响应
 * - hunyuan-standard: 标准模型，平衡性能
 * - hunyuan-pro: 专业模型，能力最强
 * - hunyuan-large: 大规模模型，超长上下文
 */

import { createLogger } from '../../logger.js';
import crypto from 'crypto';

const logger = createLogger('HunyuanProvider');

// 腾讯混元模型配置
export const HunyuanModels = {
    'hunyuan-lite': {
        id: 'hunyuan-lite',
        name: '混元-Lite',
        description: '轻量级模型，快速响应，适合简单任务',
        contextWindow: 4000,
        maxTokens: 1000,
        supports: ['chat', 'completion'],
        pricing: { input: 0.008, output: 0.008 } // 每千tokens
    },
    'hunyuan-standard': {
        id: 'hunyuan-standard',
        name: '混元-Standard',
        description: '标准模型，平衡性能和成本',
        contextWindow: 8000,
        maxTokens: 2000,
        supports: ['chat', 'completion', 'function_call'],
        pricing: { input: 0.016, output: 0.016 }
    },
    'hunyuan-pro': {
        id: 'hunyuan-pro',
        name: '混元-Pro',
        description: '专业模型，能力最强，适合复杂任务',
        contextWindow: 32000,
        maxTokens: 4000,
        supports: ['chat', 'completion', 'function_call', 'vision'],
        pricing: { input: 0.12, output: 0.12 }
    },
    'hunyuan-large': {
        id: 'hunyuan-large',
        name: '混元-Large',
        description: '大规模模型，超长上下文，适合长文本处理',
        contextWindow: 128000,
        maxTokens: 8000,
        supports: ['chat', 'completion', 'function_call'],
        pricing: { input: 0.06, output: 0.06 }
    }
};

/**
 * 腾讯混元 Provider
 */
export class HunyuanProvider {
    constructor(kernel, config = {}) {
        this.kernel = kernel;
        this.config = {
            secretId: config.secretId || process.env.HUNYUAN_SECRET_ID,
            secretKey: config.secretKey || process.env.HUNYUAN_SECRET_KEY,
            baseUrl: config.baseUrl || 'https://hunyuan.tencentcloudapi.com',
            model: config.model || 'hunyuan-standard',
            temperature: config.temperature ?? 0.7,
            topP: config.topP ?? 0.9,
            maxTokens: config.maxTokens ?? 2000,
            timeout: config.timeout ?? 30000,
            region: config.region || 'ap-guangzhou',
            ...config
        };
        
        // 验证配置
        if (!this.config.secretId || !this.config.secretKey) {
            logger.warn('腾讯混元 Secret ID 或 Secret Key 未配置');
        }
    }

    /**
     * 生成签名
     */
    _generateSignature(payload, timestamp) {
        const service = 'hunyuan';
        const host = 'hunyuan.tencentcloudapi.com';
        const algorithm = 'TC3-HMAC-SHA256';
        const date = new Date(timestamp * 1000).toISOString().split('T')[0];
        
        // 步骤1：拼接规范请求串
        const httpRequestMethod = 'POST';
        const canonicalUri = '/';
        const canonicalQueryString = '';
        const canonicalHeaders = `content-type:application/json\nhost:${host}\n`;
        const signedHeaders = 'content-type;host';
        const hashedRequestPayload = crypto
            .createHash('sha256')
            .update(payload)
            .digest('hex');
        
        const canonicalRequest = [
            httpRequestMethod,
            canonicalUri,
            canonicalQueryString,
            canonicalHeaders,
            signedHeaders,
            hashedRequestPayload
        ].join('\n');
        
        // 步骤2：拼接待签名字符串
        const credentialScope = `${date}/${service}/tc3_request`;
        const hashedCanonicalRequest = crypto
            .createHash('sha256')
            .update(canonicalRequest)
            .digest('hex');
        
        const stringToSign = [
            algorithm,
            timestamp,
            credentialScope,
            hashedCanonicalRequest
        ].join('\n');
        
        // 步骤3：计算签名
        const secretDate = crypto
            .createHmac('sha256', Buffer.from(`TC3${this.config.secretKey}`, 'utf8'))
            .update(date)
            .digest();
        
        const secretService = crypto
            .createHmac('sha256', secretDate)
            .update(service)
            .digest();
        
        const secretSigning = crypto
            .createHmac('sha256', secretService)
            .update('tc3_request')
            .digest();
        
        const signature = crypto
            .createHmac('sha256', secretSigning)
            .update(stringToSign)
            .digest('hex');
        
        // 步骤4：拼接 Authorization
        const authorization = [
            `${algorithm} Credential=${this.config.secretId}/${credentialScope}`,
            `SignedHeaders=${signedHeaders}`,
            `Signature=${signature}`
        ].join(', ');
        
        return authorization;
    }

    /**
     * 调用模型
     */
    async call({ messages, model, temperature, topP, maxTokens, ...options }) {
        const selectedModel = model || this.config.model;
        const modelConfig = HunyuanModels[selectedModel];

        if (!modelConfig) {
            throw new Error(`不支持的模型: ${selectedModel}`);
        }

        // 构建请求
        const timestamp = Math.floor(Date.now() / 1000);
        const requestBody = {
            Model: selectedModel,
            Messages: this._formatMessages(messages),
            Temperature: temperature ?? this.config.temperature,
            TopP: topP ?? this.config.topP,
            MaxTokens: maxTokens ?? this.config.maxTokens,
        };

        // 添加额外参数
        if (options.functions) {
            requestBody.Tools = this._formatTools(options.functions);
        }
        if (options.system) {
            requestBody.System = options.system;
        }

        const payload = JSON.stringify(requestBody);
        const authorization = this._generateSignature(payload, timestamp);

        try {
            const response = await fetch(this.config.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authorization,
                    'X-TC-Action': 'ChatCompletions',
                    'X-TC-Version': '2023-09-01',
                    'X-TC-Timestamp': timestamp.toString(),
                    'X-TC-Region': this.config.region,
                },
                body: payload,
                signal: AbortSignal.timeout(this.config.timeout)
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`腾讯混元 API 错误: ${response.status} - ${error}`);
            }

            const data = await response.json();

            // 检查错误
            if (data.Response?.Error) {
                throw new Error(`腾讯混元 API 错误: ${data.Response.Error.Message}`);
            }

            // 解析响应
            return this._parseResponse(data, selectedModel);

        } catch (error) {
            logger.error('腾讯混元调用失败:', error);
            throw error;
        }
    }

    /**
     * 格式化消息
     */
    _formatMessages(messages) {
        return messages.map(msg => ({
            Role: msg.role,
            Content: msg.content
        }));
    }

    /**
     * 格式化工具
     */
    _formatTools(functions) {
        return functions.map(fn => ({
            Type: 'function',
            Function: {
                Name: fn.name,
                Description: fn.description,
                Parameters: fn.parameters
            }
        }));
    }

    /**
     * 解析响应
     */
    _parseResponse(data, model) {
        const response = data.Response;
        const choice = response.Choices?.[0];

        return {
            id: response.Id || `hunyuan-${Date.now()}`,
            model: model,
            content: choice?.Message?.Content || '',
            role: 'assistant',
            usage: {
                prompt_tokens: response.Usage?.PromptTokens || 0,
                completion_tokens: response.Usage?.CompletionTokens || 0,
                total_tokens: response.Usage?.TotalTokens || 0
            },
            finish_reason: choice?.FinishReason || 'stop',
            metadata: {
                provider: 'hunyuan',
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
        
        const requestBody = {
            Model: selectedModel,
            Messages: this._formatMessages(messages),
            Temperature: temperature ?? this.config.temperature,
            TopP: topP ?? this.config.topP,
            MaxTokens: maxTokens ?? this.config.maxTokens,
            Stream: true
        };

        const timestamp = Math.floor(Date.now() / 1000);
        const payload = JSON.stringify(requestBody);
        const authorization = this._generateSignature(payload, timestamp);

        try {
            const response = await fetch(this.config.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authorization,
                    'X-TC-Action': 'ChatCompletions',
                    'X-TC-Version': '2023-09-01',
                    'X-TC-Timestamp': timestamp.toString(),
                    'X-TC-Region': this.config.region,
                },
                body: payload,
                signal: AbortSignal.timeout(this.config.timeout)
            });

            if (!response.ok) {
                throw new Error(`腾讯混元流式调用失败: ${response.status}`);
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
                            const delta = parsed.Response?.Choices?.[0]?.Delta;
                            if (delta?.Content) {
                                yield {
                                    content: delta.Content,
                                    finish_reason: parsed.Response?.Choices?.[0]?.FinishReason || null
                                };
                            }
                        } catch (e) {
                            // 忽略解析错误
                        }
                    }
                }
            }
        } catch (error) {
            logger.error('腾讯混元流式调用失败:', error);
            throw error;
        }
    }

    /**
     * 获取可用模型列表
     */
    getModels() {
        return Object.entries(HunyuanModels).map(([id, config]) => ({
            id,
            ...config
        }));
    }

    /**
     * 健康检查
     */
    async healthCheck() {
        try {
            // 简单测试调用
            await this.call({
                messages: [{ role: 'user', content: 'test' }],
                maxTokens: 1
            });
            return { healthy: true, provider: 'hunyuan' };
        } catch (error) {
            return { healthy: false, provider: 'hunyuan', error: error.message };
        }
    }
}

export default HunyuanProvider;