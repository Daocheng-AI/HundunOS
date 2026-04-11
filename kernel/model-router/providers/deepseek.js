/**
 * HundunOS v3.0 - DeepSeek Provider
 * Support: deepseek-chat, deepseek-coder
 */

// Built-in model registry
export const MODELS = {
    // DeepSeek V3 Series
    'deepseek-chat-v3-20250626': {
        name: 'DeepSeek V3',
        context: 64000,
        costPer1M: 0.27,
        capabilities: ['chat', 'function_call']
    },
    // DeepSeek Coder V2
    'deepseek-coder-v2-20250614': {
        name: 'DeepSeek Coder V2',
        context: 64000,
        costPer1M: 0.55,
        capabilities: ['chat', 'code']
    },
    'deepseek-coder-v2-20250514': {
        name: 'DeepSeek Coder V2 (May)',
        context: 64000,
        costPer1M: 0.55,
        capabilities: ['chat', 'code']
    },
    // DeepSeek V2.5
    'deepseek-chat-v2.5-20250514': {
        name: 'DeepSeek V2.5',
        context: 128000,
        costPer1M: 0.14,
        capabilities: ['chat', 'function_call']
    },
    // DeepSeek V2
    'deepseek-chat-v2-20250514': {
        name: 'DeepSeek V2',
        context: 128000,
        costPer1M: 0.28,
        capabilities: ['chat', 'function_call']
    },
    'deepseek-chat-v2-20240301': {
        name: 'DeepSeek V2 (Mar)',
        context: 128000,
        costPer1M: 0.28,
        capabilities: ['chat', 'function_call']
    },
};

export class DeepSeekProvider {
    constructor(kernel, config = {}) {
        this.kernel = kernel;
        this.config = {
            apiKey: config.apiKey || process.env.DEEPSEEK_API_KEY || '',
            baseUrl: config.baseUrl || 'https://api.deepseek.com',
            model: config.model || 'deepseek-chat',
            timeout: config.timeout || 60000,
            ...config
        };
        this.stats = { requests: 0, tokens: 0, errors: 0, latency: 0 };
    }

    async call(messages, opts = {}) {
        const start = Date.now();
        this.stats.requests++;

        if (!this.config.apiKey) {
            this.stats.errors++;
            return { success: false, error: 'DEEPSEEK_API_KEY not configured' };
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
        const url = `${this.config.baseUrl}/chat/completions`;
        const body = {
            model: this.config.model,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            temperature: opts.temperature ?? 0.7,
            max_tokens: opts.max_tokens ?? 2048,
            top_p: opts.top_p ?? 0.9,
            stream: false
        };

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
                throw new Error(`DeepSeek error ${response.status}: ${err}`);
            }

            return await response.json();
        } catch (e) {
            clearTimeout(timeout);
            throw e;
        }
    }

    getStats() { return { ...this.stats }; }
    getInfo() { return { type: 'CLOUD', model: this.config.model, endpoint: this.config.baseUrl }; }
}
