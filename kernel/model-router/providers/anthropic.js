// hundunos/kernel/model-router/providers/anthropic.js — Anthropic Provider
// 云端 Claude 模型支持

import { BaseProvider } from './base.js';

export class AnthropicProvider extends BaseProvider {
    constructor(kernel, config = {}) {
        super(config);
        this.kernel = kernel;
        this.config = {
            ...this.config,
            apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY || '',
            endpoint: config.endpoint || 'https://api.anthropic.com',
            model: config.model || 'claude-sonnet-4-20250514',
        };
    }

    async call(messages, opts = {}) {
        const start = Date.now();
        this.stats.requests++;

        if (!this.config.apiKey) {
            this.stats.errors++;
            return { success: false, error: 'ANTHROPIC_API_KEY not configured' };
        }

        try {
            const resp = await this._messages(messages, opts);
            const tokens = (resp.usage?.input_tokens || 0) + (resp.usage?.output_tokens || 0);
            const latency = Date.now() - start;
            this._updateStats(tokens, latency);

            return {
                success: true,
                content: resp.content?.[0]?.text || '',
                usage: {
                    input_tokens: resp.usage?.input_tokens || 0,
                    output_tokens: resp.usage?.output_tokens || 0
                },
                latency,
                model: this.config.model
            };
        } catch (e) {
            this.stats.errors++;
            return { success: false, error: e.message };
        }
    }

    async _messages(messages, opts) {
        const url = `${this.config.endpoint}/v1/messages`;

        // Anthropic 需要特殊的消息格式
        const systemMsg = messages.find(m => m.role === 'system');
        const filtered = messages.filter(m => m.role !== 'system');

        const body = {
            model: this.config.model,
            messages: filtered.map(m => ({ role: m.role, content: m.content })),
            system: systemMsg?.content,
            max_tokens: opts.max_tokens ?? 1024,
            temperature: opts.temperature ?? 0.7
        };

        const response = await this._fetchWithTimeout(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.config.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Anthropic error ${response.status}: ${err}`);
        }

        return await response.json();
    }

    getInfo() { return { type: 'CLOUD', model: this.config.model, endpoint: this.config.endpoint }; }
}

// 注册为可用模型
export const // Built-in model registry
export const MODELS = {
    // Claude 4 Series (Latest)
    'claude-opus-4-20250514':          { name: 'Claude Opus 4',          context: 200000, costPer1M: 15.00, capabilities: ['chat', 'vision', 'function_call', 'reasoning'] },
    'claude-sonnet-4-20250514':        { name: 'Claude Sonnet 4',        context: 200000, costPer1M: 3.00,  capabilities: ['chat', 'vision', 'function_call'] },
    // Claude 3.7 Series
    'claude-3-7-sonnet-20250219':      { name: 'Claude 3.7 Sonnet',      context: 200000, costPer1M: 3.00,  capabilities: ['chat', 'vision', 'function_call', 'reasoning'] },
    // Claude 3.5 Series
    'claude-3-5-sonnet-20241022':      { name: 'Claude 3.5 Sonnet v2',   context: 200000, costPer1M: 3.00,  capabilities: ['chat', 'vision', 'function_call'] },
    'claude-3-5-sonnet-20240620':      { name: 'Claude 3.5 Sonnet',      context: 200000, costPer1M: 3.00,  capabilities: ['chat', 'vision', 'function_call'] },
    'claude-3-5-haiku-20241022':       { name: 'Claude 3.5 Haiku',       context: 200000, costPer1M: 0.80,  capabilities: ['chat', 'vision', 'function_call'] },
    // Claude 3 Series
    'claude-3-opus-20240229':          { name: 'Claude 3 Opus',          context: 200000, costPer1M: 15.00, capabilities: ['chat', 'vision', 'function_call'] },
    'claude-3-sonnet-20240229':        { name: 'Claude 3 Sonnet',        context: 200000, costPer1M: 3.00,  capabilities: ['chat', 'vision', 'function_call'] },
    'claude-3-haiku-20240307':         { name: 'Claude 3 Haiku',         context: 200000, costPer1M: 0.25,  capabilities: ['chat', 'vision', 'function_call'] },
    // Claude 2 Series
    'claude-2.1':                      { name: 'Claude 2.1',             context: 200000, costPer1M: 8.00,  capabilities: ['chat'] },
    'claude-2.0':                      { name: 'Claude 2.0',             context: 100000, costPer1M: 8.00,  capabilities: ['chat'] },
    // Claude Instant
    'claude-instant-1.2':              { name: 'Claude Instant 1.2',     context: 100000, costPer1M: 0.80,  capabilities: ['chat'] },
};