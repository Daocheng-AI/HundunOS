/**
 * HundunOS v3.0 - Google Gemini Provider
 * Support: Gemini 1.5 / 2.0 / 2.5 Flash/Pro
 */

// Built-in model registry
export const MODELS = {
    // Gemini 2.5 Series
    'gemini-2.5-pro-preview-06-05': {
        name: 'Gemini 2.5 Pro (Jun 05)',
        context: 2000000,
        costPer1M: 1.25,
        capabilities: ['chat', 'vision', 'function_call', 'reasoning']
    },
    'gemini-2.5-flash-preview-05-20': {
        name: 'Gemini 2.5 Flash (May 20)',
        context: 1000000,
        costPer1M: 0.075,
        capabilities: ['chat', 'vision', 'function_call']
    },
    // Gemini 2.0
    'gemini-2.0-flash': {
        name: 'Gemini 2.0 Flash',
        context: 1000000,
        costPer1M: 0.00,
        capabilities: ['chat', 'vision', 'function_call']
    },
    'gemini-2.0-flash-exp': {
        name: 'Gemini 2.0 Flash Exp',
        context: 1000000,
        costPer1M: 0.00,
        capabilities: ['chat', 'vision', 'function_call']
    },
    // Gemini 1.5 Series
    'gemini-1.5-pro': {
        name: 'Gemini 1.5 Pro',
        context: 2000000,
        costPer1M: 1.25,
        capabilities: ['chat', 'vision', 'function_call']
    },
    'gemini-1.5-pro-002': {
        name: 'Gemini 1.5 Pro (002)',
        context: 2000000,
        costPer1M: 7.35,
        capabilities: ['chat', 'vision', 'function_call']
    },
    'gemini-1.5-flash': {
        name: 'Gemini 1.5 Flash',
        context: 1000000,
        costPer1M: 0.075,
        capabilities: ['chat', 'vision', 'function_call']
    },
    'gemini-1.5-flash-002': {
        name: 'Gemini 1.5 Flash (002)',
        context: 1000000,
        costPer1M: 0.15,
        capabilities: ['chat', 'vision', 'function_call']
    },
    'gemini-1.5-flash-8b': {
        name: 'Gemini 1.5 Flash-8B',
        context: 1000000,
        costPer1M: 0.0375,
        capabilities: ['chat', 'vision']
    },
    // Gemini Exp (Experimental)
    'gemini-exp-1206': {
        name: 'Gemini Exp 1206',
        context: 1000000,
        costPer1M: 0.00,
        capabilities: ['chat', 'vision', 'function_call', 'reasoning']
    },
};

export class GeminiProvider {
    constructor(kernel, config = {}) {
        this.kernel = kernel;
        this.config = {
            apiKey: config.apiKey || process.env.GEMINI_API_KEY || '',
            baseUrl: config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta',
            model: config.model || 'gemini-1.5-flash',
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
            return { success: false, error: 'GEMINI_API_KEY not configured' };
        }

        try {
            const resp = await this._generate(messages, opts);
            this.stats.latency += Date.now() - start;
            return {
                success: true,
                content: resp.content || '',
                usage: resp.usageMetadata || {},
                latency: Date.now() - start,
                model: this.config.model
            };
        } catch (e) {
            this.stats.errors++;
            return { success: false, error: e.message };
        }
    }

    async _generate(messages, opts) {
        const model = this.config.model.startsWith('models/')
            ? this.config.model
            : `models/${this.config.model}`;
        const url = `${this.config.baseUrl}/${model}:generateContent?key=${this.config.apiKey}`;

        const systemMsg = messages.find(m => m.role === 'system');
        const filtered = messages.filter(m => m.role !== 'system');

        const parts = filtered.map(m => ({ text: m.content }));

        const body = {
            contents: [{ role: 'user', parts }],
            generationConfig: {
                temperature: opts.temperature ?? 0.9,
                topP: opts.top_p ?? 0.95,
                maxOutputTokens: opts.max_tokens ?? 2048,
            },
            systemInstruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeout);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`Gemini error ${response.status}: ${err}`);
            }

            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            return {
                content: text,
                usageMetadata: data.usageMetadata || {}
            };
        } catch (e) {
            clearTimeout(timeout);
            throw e;
        }
    }

    getStats() { return { ...this.stats }; }
    getInfo() { return { type: 'CLOUD', model: this.config.model, endpoint: this.config.baseUrl }; }
}
