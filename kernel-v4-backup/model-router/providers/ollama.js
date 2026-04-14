// hundunos/kernel/model-router/providers/ollama.js — Ollama Provider
// 本地模型驱动

import { BaseProvider } from './base.js';

export class OllamaProvider extends BaseProvider {
    constructor(kernel, config = {}) {
        super(config);
        this.kernel = kernel;
        this.config = {
            ...this.config,
            endpoint: config.endpoint || 'http://127.0.0.1:11434',
            model: config.model || 'qwen2.5:1.5b',
        };
    }

    async call(messages, opts = {}) {
        const start = Date.now();
        this.stats.requests++;

        try {
            const resp = await this._generate(messages, opts);
            const tokens = resp.usage?.total_tokens || 0;
            const latency = Date.now() - start;
            this._updateStats(tokens, latency);

            return {
                success: true,
                content: resp.content,
                usage: resp.usage,
                latency,
                model: this.config.model
            };
        } catch (e) {
            this.stats.errors++;
            return { success: false, error: e.message };
        }
    }

    async _generate(messages, opts) {
        const url = `${this.config.endpoint}/api/generate`;
        const body = {
            model: this.config.model,
            prompt: this._buildPrompt(messages),
            stream: false,
            options: {
                temperature: opts.temperature || 0.7,
                top_p: opts.top_p || 0.9,
                num_predict: opts.max_tokens || 2048
            }
        };

        const response = await this._fetchWithTimeout(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw new Error(`Ollama error: ${response.status}`);
        }

        const data = await response.json();
        return {
            content: data.response || '',
            usage: { total_tokens: (data.eval_count || 0) + (data.prompt_eval_count || 0) }
        };
    }

    _buildPrompt(messages) {
        if (!messages || messages.length === 0) return '';
        
        // 构建 Ollama 格式的 prompt
        let prompt = '';
        for (const msg of messages) {
            if (msg.role === 'system') prompt += `System: ${msg.content}\n`;
            else if (msg.role === 'user') prompt += `User: ${msg.content}\n`;
            else if (msg.role === 'assistant') prompt += `Assistant: ${msg.content}\n`;
        }
        return prompt;
    }

    getStats() { return { ...this.stats }; }
    getInfo() { return { type: 'LOCAL', model: this.config.model, endpoint: this.config.endpoint }; }

    /**
     * 获取支持的本地模型列表
     */
    async listLocalModels() {
        try {
            const response = await fetch(`${this.config.endpoint}/api/tags`);
            if (!response.ok) throw new Error('Failed to fetch models');
            const data = await response.json();
            return data.models || [];
        } catch (e) {
            console.warn('[OllamaProvider] Failed to list models:', e.message);
            return [];
        }
    }
}

// 内置推荐的 Ollama 模型配置
export const OLLAMA_MODELS = {
    // Qwen 系列
    'qwen2.5': { name: 'Qwen 2.5', context: 32768, capabilities: ['chat'] },
    'qwen2.5:1.5b': { name: 'Qwen 2.5 1.5B', context: 32768, capabilities: ['chat'] },
    'qwen2.5:7b': { name: 'Qwen 2.5 7B', context: 32768, capabilities: ['chat'] },
    'qwen2.5:14b': { name: 'Qwen 2.5 14B', context: 32768, capabilities: ['chat'] },
    'qwen2.5:32b': { name: 'Qwen 2.5 32B', context: 32768, capabilities: ['chat'] },
    'qwen2.5:72b': { name: 'Qwen 2.5 72B', context: 32768, capabilities: ['chat'] },
    'qwen2.5-coder': { name: 'Qwen 2.5 Coder', context: 32768, capabilities: ['chat', 'code'] },
    // Llama 系列
    'llama3.2': { name: 'Llama 3.2', context: 131072, capabilities: ['chat'] },
    'llama3.2:1b': { name: 'Llama 3.2 1B', context: 131072, capabilities: ['chat'] },
    'llama3.2:3b': { name: 'Llama 3.2 3B', context: 131072, capabilities: ['chat'] },
    'llama3.1': { name: 'Llama 3.1', context: 131072, capabilities: ['chat'] },
    'llama3.1:8b': { name: 'Llama 3.1 8B', context: 131072, capabilities: ['chat'] },
    'llama3.1:70b': { name: 'Llama 3.1 70B', context: 131072, capabilities: ['chat'] },
    'llama3.1:405b': { name: 'Llama 3.1 405B', context: 131072, capabilities: ['chat'] },
    // DeepSeek 系列
    'deepseek-coder-v2': { name: 'DeepSeek Coder V2', context: 128000, capabilities: ['chat', 'code'] },
    'deepseek-coder': { name: 'DeepSeek Coder', context: 16384, capabilities: ['chat', 'code'] },
    'deepseek-llm': { name: 'DeepSeek LLM', context: 4096, capabilities: ['chat'] },
    // Mistral 系列
    'mistral': { name: 'Mistral', context: 32768, capabilities: ['chat'] },
    'mistral-nemo': { name: 'Mistral Nemo', context: 128000, capabilities: ['chat'] },
    'mixtral': { name: 'Mixtral 8x7B', context: 32768, capabilities: ['chat'] },
    'mixtral:8x22b': { name: 'Mixtral 8x22B', context: 65536, capabilities: ['chat'] },
    // Code 专用
    'codellama': { name: 'Code Llama', context: 16384, capabilities: ['chat', 'code'] },
    'codellama:7b': { name: 'Code Llama 7B', context: 16384, capabilities: ['chat', 'code'] },
    'codellama:13b': { name: 'Code Llama 13B', context: 16384, capabilities: ['chat', 'code'] },
    'codellama:34b': { name: 'Code Llama 34B', context: 16384, capabilities: ['chat', 'code'] },
    'codegemma': { name: 'CodeGemma', context: 8192, capabilities: ['chat', 'code'] },
    'starcoder2': { name: 'StarCoder2', context: 16384, capabilities: ['chat', 'code'] },
    // Gemma 系列
    'gemma2': { name: 'Gemma 2', context: 8192, capabilities: ['chat'] },
    'gemma2:2b': { name: 'Gemma 2 2B', context: 8192, capabilities: ['chat'] },
    'gemma2:9b': { name: 'Gemma 2 9B', context: 8192, capabilities: ['chat'] },
    'gemma2:27b': { name: 'Gemma 2 27B', context: 8192, capabilities: ['chat'] },
    // Phi 系列
    'phi4': { name: 'Phi-4', context: 16384, capabilities: ['chat'] },
    'phi3.5': { name: 'Phi-3.5', context: 128000, capabilities: ['chat'] },
    'phi3': { name: 'Phi-3', context: 128000, capabilities: ['chat'] },
    // 其他
    'command-r': { name: 'Command R', context: 128000, capabilities: ['chat'] },
    'command-r-plus': { name: 'Command R+', context: 128000, capabilities: ['chat'] },
    'dolphin-mixtral': { name: 'Dolphin Mixtral', context: 32768, capabilities: ['chat'] },
    'nomic-embed-text': { name: 'Nomic Embed', context: 8192, capabilities: ['embedding'] },
    'mxbai-embed-large': { name: 'MXBAI Embed Large', context: 512, capabilities: ['embedding'] },
};