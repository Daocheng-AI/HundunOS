// hundunos/kernel/model-router/providers/openai.js — OpenAI Provider
// 云端 GPT 模型支持

import { BaseProvider } from './base.js';

export class OpenAIProvider extends BaseProvider {
    constructor(kernel, config = {}) {
        super(config);
        this.kernel = kernel;
        this.config = {
            ...this.config,
            apiKey: config.apiKey || process.env.OPENAI_API_KEY || '',
            endpoint: config.endpoint || 'https://api.openai.com/v1',
            model: config.model || 'gpt-4o-mini',
        };
    }

    async call(messages, opts = {}) {
        const start = Date.now();
        this.stats.requests++;

        if (!this.config.apiKey) {
            this.stats.errors++;
            return { success: false, error: 'OPENAI_API_KEY not configured' };
        }

        try {
            const resp = await this._chat(messages, opts);
            const tokens = resp.usage?.total_tokens || 0;
            const latency = Date.now() - start;
            this._updateStats(tokens, latency);

            return {
                success: true,
                content: resp.choices?.[0]?.message?.content || '',
                usage: resp.usage,
                latency,
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

        const response = await this._fetchWithTimeout(url, {
            method: 'POST',
            headers: this._buildHeaders(this.config.apiKey),
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`OpenAI error ${response.status}: ${err}`);
        }

        return await response.json();
    }

    getInfo() { return { type: 'CLOUD', model: this.config.model, endpoint: this.config.endpoint }; }
}

// 注册为可用模型
export const // Built-in model registry
export const MODELS = {
    // GPT-4o Series
    'gpt-4o':                  { name: 'GPT-4o',                  context: 128000, costPer1M: 2.50,  capabilities: ['chat', 'vision', 'function_call'] },
    'gpt-4o-mini':             { name: 'GPT-4o Mini',             context: 128000, costPer1M: 0.15,  capabilities: ['chat', 'vision', 'function_call'] },
    'gpt-4o-mini-high':        { name: 'GPT-4o Mini High',        context: 128000, costPer1M: 0.15,  capabilities: ['chat', 'vision'] },
    // GPT-4.5
    'gpt-4.5-turbo':           { name: 'GPT-4.5 Turbo',           context: 128000, costPer1M: 3.00,  capabilities: ['chat', 'vision', 'function_call'] },
    // GPT-4 Turbo Series
    'gpt-4-turbo':             { name: 'GPT-4 Turbo',             context: 128000, costPer1M: 10.00, capabilities: ['chat', 'vision', 'function_call'] },
    'gpt-4-turbo-2024-04-09':  { name: 'GPT-4 Turbo 2024-04-09', context: 128000, costPer1M: 10.00, capabilities: ['chat', 'vision', 'function_call'] },
    // GPT-4 Series
    'gpt-4':                   { name: 'GPT-4',                   context: 8192,   costPer1M: 30.00, capabilities: ['chat', 'function_call'] },
    'gpt-4-32k':               { name: 'GPT-4 32K',               context: 32768,  costPer1M: 60.00, capabilities: ['chat', 'function_call'] },
    // GPT-3.5 Turbo Series
    'gpt-3.5-turbo':           { name: 'GPT-3.5 Turbo',           context: 16385,  costPer1M: 0.50,  capabilities: ['chat', 'function_call'] },
    'gpt-3.5-turbo-16k':       { name: 'GPT-3.5 Turbo 16K',       context: 16385,  costPer1M: 1.00,  capabilities: ['chat', 'function_call'] },
    // o1 Series (Reasoning)
    'o1':                      { name: 'o1 Reasoning',            context: 65536,  costPer1M: 15.00, capabilities: ['chat', 'reasoning'] },
    'o1-mini':                 { name: 'o1 Mini Reasoning',       context: 65536,  costPer1M: 3.00,  capabilities: ['chat', 'reasoning'] },
    'o1-preview':              { name: 'o1 Preview Reasoning',    context: 32768,  costPer1M: 15.00, capabilities: ['chat', 'reasoning'] },
    // Embedding Models
    'text-embedding-3-small':  { name: 'Embedding-3 Small',       context: 8191,   costPer1M: 0.02,  capabilities: ['embedding'] },
    'text-embedding-3-large':  { name: 'Embedding-3 Large',       context: 8191,   costPer1M: 0.13,  capabilities: ['embedding'] },
    'text-embedding-ada-002':  { name: 'Embedding Ada v2',        context: 8191,   costPer1M: 0.10,  capabilities: ['embedding'] },
    // TTS Models
    'tts-1':                   { name: 'TTS-1',                   context: 4096,   costPer1M: 15.00, capabilities: ['tts'] },
    'tts-1-hd':                { name: 'TTS-1 HD',                context: 4096,   costPer1M: 30.00, capabilities: ['tts'] },
    // Whisper
    'whisper-1':               { name: 'Whisper-1',               context: 0,      costPer1M: 0.006, capabilities: ['audio'] },
};