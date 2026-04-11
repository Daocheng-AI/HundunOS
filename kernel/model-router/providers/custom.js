/**
 * HundunOS v3.0 - Custom Provider
 * 自定义模型适配器 - 支持任何 OpenAI 兼容 API
 * 
 * 功能:
 * - 支持自定义 API 端点
 * - 支持自定义模型参数
 * - 兼容 OpenAI API 格式
 */

export class CustomProvider {
    constructor(kernel, config = {}) {
        this.kernel = kernel;
        this.config = {
            name: config.name || 'custom',
            displayName: config.displayName || 'Custom Model',
            apiKey: config.apiKey || '',
            endpoint: config.endpoint || '',
            model: config.model || '',
            contextWindow: config.contextWindow || 8192,
            costPer1M: config.costPer1M || 0,
            capabilities: config.capabilities || ['chat'],
            headers: config.headers || {},
            timeout: config.timeout || 60000,
            ...config
        };
        this.stats = { requests: 0, tokens: 0, errors: 0, latency: 0 };
    }

    async call(messages, opts = {}) {
        const start = Date.now();
        this.stats.requests++;
        
        if (!this.config.endpoint) {
            this.stats.errors++;
            return { success: false, error: 'Custom provider endpoint not configured' };
        }

        try {
            const resp = await this._chat(messages, opts);
            this.stats.tokens += resp.usage?.total_tokens || 0;
            this.stats.latency += Date.now() - start;
            return { 
                success: true, 
                content: resp.choices?.[0]?.message?.content || '', 
                usage: resp.usage,
                latency: Date.now() - start,
                model: this.config.model
            };
        } catch (e) {
            this.stats.errors++;
            return { success: false, error: e.message };
        }
    }

    async _chat(messages, opts) {
        const url = `${this.config.endpoint}/chat/completions`;
        const body = {
            model: this.config.model,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            temperature: opts.temperature ?? 0.7,
            max_tokens: opts.max_tokens ?? 2048,
            top_p: opts.top_p ?? 0.9
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeout);

        try {
            const headers = {
                'Content-Type': 'application/json',
                ...this.config.headers
            };
            
            if (this.config.apiKey) {
                headers['Authorization'] = `Bearer ${this.config.apiKey}`;
            }

            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: controller.signal
            });
            
            clearTimeout(timeout);
            
            if (!response.ok) {
                const err = await response.text();
                throw new Error(`Custom provider error ${response.status}: ${err}`);
            }
            
            return await response.json();
        } catch (e) {
            clearTimeout(timeout);
            throw e;
        }
    }

    getStats() { return { ...this.stats }; }
    getInfo() { 
        return { 
            type: 'CUSTOM', 
            name: this.config.displayName,
            model: this.config.model, 
            endpoint: this.config.endpoint,
            capabilities: this.config.capabilities
        }; 
    }
}

// 预设的自定义模型配置模板
export const CUSTOM_TEMPLATES = {
    // Azure OpenAI
    azure: {
        name: 'azure',
        displayName: 'Azure OpenAI',
        endpoint: 'https://{your-resource}.openai.azure.com/openai/deployments/{deployment-id}',
        headers: { 'api-key': '{your-api-key}' },
        contextWindow: 128000,
        capabilities: ['chat', 'function_call']
    },
    // Google Gemini (OpenAI compatible)
    gemini: {
        name: 'gemini',
        displayName: 'Google Gemini',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
        contextWindow: 1000000,
        capabilities: ['chat', 'vision']
    },
    // Groq
    groq: {
        name: 'groq',
        displayName: 'Groq',
        endpoint: 'https://api.groq.com/openai/v1',
        contextWindow: 8192,
        capabilities: ['chat']
    },
    // Together AI
    together: {
        name: 'together',
        displayName: 'Together AI',
        endpoint: 'https://api.together.xyz/v1',
        contextWindow: 32768,
        capabilities: ['chat']
    },
    // Fireworks AI
    fireworks: {
        name: 'fireworks',
        displayName: 'Fireworks AI',
        endpoint: 'https://api.fireworks.ai/inference/v1',
        contextWindow: 32768,
        capabilities: ['chat']
    },
    // Perplexity
    perplexity: {
        name: 'perplexity',
        displayName: 'Perplexity',
        endpoint: 'https://api.perplexity.ai',
        contextWindow: 128000,
        capabilities: ['chat', 'search']
    },
    // Cohere
    cohere: {
        name: 'cohere',
        displayName: 'Cohere',
        endpoint: 'https://api.cohere.com/v1',
        contextWindow: 128000,
        capabilities: ['chat', 'embedding']
    },
    // AI21
    ai21: {
        name: 'ai21',
        displayName: 'AI21 Labs',
        endpoint: 'https://api.ai21.com/studio/v1',
        contextWindow: 8192,
        capabilities: ['chat']
    },
    // Mistral AI
    mistral: {
        name: 'mistral',
        displayName: 'Mistral AI',
        endpoint: 'https://api.mistral.ai/v1',
        contextWindow: 32768,
        capabilities: ['chat', 'function_call']
    },
    // DeepSeek API
    deepseek_api: {
        name: 'deepseek_api',
        displayName: 'DeepSeek API',
        endpoint: 'https://api.deepseek.com/v1',
        contextWindow: 64000,
        capabilities: ['chat', 'code', 'reasoning']
    },
    // Moonshot (月之暗面)
    moonshot: {
        name: 'moonshot',
        displayName: 'Moonshot',
        endpoint: 'https://api.moonshot.cn/v1',
        contextWindow: 200000,
        capabilities: ['chat', 'function_call']
    },
    // MiniMax
    minimax: {
        name: 'minimax',
        displayName: 'MiniMax',
        endpoint: 'https://api.minimax.chat/v1',
        contextWindow: 8192,
        capabilities: ['chat']
    },
    // Baichuan (百川)
    baichuan: {
        name: 'baichuan',
        displayName: 'Baichuan',
        endpoint: 'https://api.baichuan-ai.com/v1',
        contextWindow: 32768,
        capabilities: ['chat']
    },
    // 01.AI (零一万物)
    zeroone: {
        name: 'zeroone',
        displayName: '01.AI',
        endpoint: 'https://api.01.ai/v1',
        contextWindow: 32768,
        capabilities: ['chat']
    }
};

export default {
    CustomProvider,
    CUSTOM_TEMPLATES
};
