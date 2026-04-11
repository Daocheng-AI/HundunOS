/**
 * HundunOS v3.0 - 六部执行器基础模块
 * 提供统一的部门执行接口
 * 
 * 升级特性：
 * - 支持多 Provider（Ollama / OpenAI / Anthropic / 自定义）
 * - 任务类型匹配权重系统
 * - 并行执行能力
 * - 超时和重试机制
 * - 安全审核前置检查
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// 配置
// ============================================================================

const DEFAULT_CONFIG = {
    timeout: 120000,        // 2分钟超时
    maxRetries: 2,          // 最多重试2次
    retryDelay: 1000,        // 重试延迟1秒
    parallelLimit: 3,        // 并行任务数限制
    safetyCheck: true,      // 启用安全审核
};

// ============================================================================
// Provider 接口与实现
// ============================================================================

/**
 * LLM Provider 基类
 */
class LLMProvider {
    constructor(config) {
        this.config = config;
    }

    async complete(prompt, options) {
        throw new Error('Not implemented');
    }

    async completeWithRetry(prompt, options = {}) {
        const { maxRetries = DEFAULT_CONFIG.maxRetries, retryDelay = DEFAULT_CONFIG.retryDelay } = options;
        let lastError;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await this.complete(prompt, options);
            } catch (error) {
                lastError = error;
                if (attempt < maxRetries) {
                    await this._sleep(retryDelay * (attempt + 1));
                }
            }
        }

        throw lastError;
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Ollama Provider
 */
class OllamaProvider extends LLMProvider {
    constructor(config = {}) {
        super(config);
        this.baseURL = config.baseURL || 'http://localhost:11434';
        this.model = config.model || 'qwen2.5:1.5b';
    }

    async complete(prompt, options = {}) {
        const { temperature = 0.3, maxTokens = 800 } = options;

        const response = await fetch(`${this.baseURL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.model,
                prompt,
                stream: false,
                options: {
                    temperature,
                    num_predict: maxTokens
                }
            }),
            signal: AbortSignal.timeout(DEFAULT_CONFIG.timeout)
        });

        if (!response.ok) {
            throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return {
            success: true,
            output: data.response || '',
            model: this.model,
            provider: 'ollama'
        };
    }
}

/**
 * OpenAI Provider
 */
class OpenAIProvider extends LLMProvider {
    constructor(config = {}) {
        super(config);
        this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
        this.baseURL = config.baseURL || 'https://api.openai.com/v1';
        this.model = config.model || 'gpt-3.5-turbo';
    }

    async complete(prompt, options = {}) {
        const { temperature = 0.3, maxTokens = 800 } = options;

        const response = await fetch(`${this.baseURL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: this.model,
                messages: [{ role: 'user', content: prompt }],
                temperature,
                max_tokens: maxTokens
            }),
            signal: AbortSignal.timeout(DEFAULT_CONFIG.timeout)
        });

        if (!response.ok) {
            throw new Error(`OpenAI error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return {
            success: true,
            output: data.choices?.[0]?.message?.content || '',
            model: this.model,
            provider: 'openai'
        };
    }
}

/**
 * Anthropic Provider
 */
class AnthropicProvider extends LLMProvider {
    constructor(config = {}) {
        super(config);
        this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
        this.baseURL = config.baseURL || 'https://api.anthropic.com/v1';
        this.model = config.model || 'claude-3-haiku-20240307';
    }

    async complete(prompt, options = {}) {
        const { temperature = 0.3, maxTokens = 800 } = options;

        const response = await fetch(`${this.baseURL}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: this.model,
                messages: [{ role: 'user', content: prompt }],
                temperature,
                max_tokens: maxTokens
            }),
            signal: AbortSignal.timeout(DEFAULT_CONFIG.timeout)
        });

        if (!response.ok) {
            throw new Error(`Anthropic error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return {
            success: true,
            output: data.content?.[0]?.text || '',
            model: this.model,
            provider: 'anthropic'
        };
    }
}

/**
 * 自定义 Provider（可扩展）
 */
class CustomProvider extends LLMProvider {
    constructor(config = {}) {
        super(config);
        this.endpoint = config.endpoint;
        this.transformRequest = config.transformRequest || ((prompt) => ({ prompt }));
        this.transformResponse = config.transformResponse || ((data) => ({ output: data.result || '', success: true }));
    }

    async complete(prompt, options = {}) {
        if (!this.endpoint) {
            throw new Error('Custom provider requires endpoint');
        }

        const requestBody = this.transformRequest(prompt, options);

        const response = await fetch(this.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(DEFAULT_CONFIG.timeout)
        });

        if (!response.ok) {
            throw new Error(`Custom provider error: ${response.status}`);
        }

        const data = await response.json();
        return this.transformResponse(data);
    }
}

// ============================================================================
// Provider 工厂
// ============================================================================

const PROVIDER_CLASSES = {
    ollama: OllamaProvider,
    openai: OpenAIProvider,
    anthropic: AnthropicProvider,
    custom: CustomProvider
};

export function createProvider(type, config) {
    const ProviderClass = PROVIDER_CLASSES[type];
    if (!ProviderClass) {
        throw new Error(`Unknown provider type: ${type}`);
    }
    return new ProviderClass(config);
}

// ============================================================================
// 安全审核
// ============================================================================

const SAFETY_PATTERNS = [
    { pattern: /删除.*系统|格式化.*磁盘/i, action: 'block', reason: '危险系统操作' },
    { pattern: /rm\s+-rf[\/\s]/i, action: 'block', reason: '危险删除命令' },
    { pattern: /drop\s+(database|table)/i, action: 'block', reason: '危险数据库操作' },
    { pattern: /kill\s+-?9/i, action: 'warn', reason: '强制终止进程' },
    { pattern: /exec|eval|spawn/i, action: 'warn', reason: '代码执行可能' },
];

export function safetyCheck(content) {
    for (const rule of SAFETY_PATTERNS) {
        if (rule.pattern.test(content)) {
            return {
                passed: rule.action !== 'block',
                action: rule.action,
                reason: rule.reason,
                pattern: rule.pattern.source
            };
        }
    }
    return { passed: true, action: 'allow', reason: '通过安全检查' };
}

// ============================================================================
// 任务类型权重系统
// ============================================================================

export const TASK_TYPE_WEIGHTS = {
    // 精确匹配
    exact: 10,
    // 关键字匹配
    keyword: 5,
    // 模糊匹配
    fuzzy: 2,
    // 默认权重
    default: 1
};

/**
 * 计算任务与部门的匹配分数
 */
export function calculateMatchScore(message, ministry) {
    const lowerMsg = message.toLowerCase();
    let score = 0;
    const matchedKeywords = [];

    for (const kw of ministry.keywords || []) {
        const lowerKw = kw.toLowerCase();
        
        // 精确匹配
        if (lowerMsg === lowerKw) {
            score += TASK_TYPE_WEIGHTS.exact;
            matchedKeywords.push({ keyword: kw, weight: 'exact' });
        }
        // 包含匹配
        else if (lowerMsg.includes(lowerKw)) {
            score += TASK_TYPE_WEIGHTS.keyword;
            matchedKeywords.push({ keyword: kw, weight: 'keyword' });
        }
        // 模糊匹配（简单实现：首字母匹配）
        else if (lowerMsg.split(' ').some(word => word.startsWith(lowerKw.slice(0, 2)))) {
            score += TASK_TYPE_WEIGHTS.fuzzy;
            matchedKeywords.push({ keyword: kw, weight: 'fuzzy' });
        }
    }

    return { score, matchedKeywords };
}

// ============================================================================
// 部门基类
// ============================================================================

export class Ministry {
    constructor(config) {
        this.id = config.id;
        this.name = config.name;
        this.description = config.description;
        this.keywords = config.keywords || [];
        this.tags = config.tags || [];
        
        // Provider 配置
        this.providerType = config.providerType || 'ollama';
        this.providerConfig = config.providerConfig || {};
        
        // 执行配置
        this.maxTokens = config.maxTokens || 800;
        this.temperature = config.temperature || 0.3;
        
        // 系统提示词
        this.systemPrompt = config.systemPrompt || '';
        
        // 安全配置
        this.safetyEnabled = config.safetyEnabled !== false;
        
        // 并行配置
        this.parallelLimit = config.parallelLimit || DEFAULT_CONFIG.parallelLimit;
        
        // 创建 Provider
        this._initProvider();
        
        // 并行任务队列
        this._runningTasks = new Map();
    }

    _initProvider() {
        try {
            this.provider = createProvider(this.providerType, this.providerConfig);
        } catch (error) {
            console.warn(`[Ministry:${this.id}] Provider init failed: ${error.message}, using fallback`);
            this.provider = new OllamaProvider({ model: 'qwen2.5:1.5b' });
        }
    }

    /**
     * 检查是否匹配部门关键词
     */
    matches(message) {
        const { score } = calculateMatchScore(message, this);
        return score > 0;
    }

    /**
     * 获取匹配分数
     */
    getMatchScore(message) {
        return calculateMatchScore(message, this);
    }

    /**
     * 执行安全检查
     */
    checkSafety(content) {
        if (!this.safetyEnabled) {
            return { passed: true, action: 'allow', reason: '安全检查已禁用' };
        }
        return safetyCheck(content);
    }

    /**
     * 构建完整提示词
     */
    buildPrompt(message, tasks = []) {
        const taskList = tasks.length > 0
            ? tasks.map(t => `- ${t.name}: ${t.description || ''}`).join('\n')
            : '无子任务';

        let prompt = this.systemPrompt
            ? `${this.systemPrompt}\n\n`
            : '';

        prompt += `用户需求：${message}\n\n子任务：\n${taskList}\n\n请执行任务，输出结果。`;

        return prompt;
    }

    /**
     * 执行部门任务
     */
    async execute(message, tasks = [], options = {}) {
        // 安全检查
        if (this.safetyEnabled) {
            const safetyResult = this.checkSafety(message);
            if (!safetyResult.passed) {
                return {
                    success: false,
                    error: safetyResult.reason,
                    safetyAction: safetyResult.action,
                    blocked: true
                };
            }
            if (safetyResult.action === 'warn') {
                console.warn(`[Ministry:${this.id}] Safety warning: ${safetyResult.reason}`);
            }
        }

        // 构建提示词
        const prompt = this.buildPrompt(message, tasks);

        // 执行选项
        const execOptions = {
            temperature: options.temperature || this.temperature,
            maxTokens: options.maxTokens || this.maxTokens
        };

        try {
            const result = await this.provider.completeWithRetry(prompt, execOptions);
            return {
                success: true,
                output: result.output,
                model: result.model,
                provider: result.provider,
                ministry: this.id
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                ministry: this.id
            };
        }
    }

    /**
     * 并行执行多个任务
     */
    async executeParallel(tasks, options = {}) {
        const results = [];
        const queue = [...tasks];
        const running = [];

        while (queue.length > 0 || running.length > 0) {
            // 启动新任务
            while (queue.length > 0 && running.length < this.parallelLimit) {
                const task = queue.shift();
                const promise = this.execute(task.message, task.tasks, options)
                    .then(result => ({ task, result }));
                running.push(promise);
            }

            // 等待完成
            if (running.length > 0) {
                const completed = await Promise.race(running);
                results.push(completed);
                running.splice(running.indexOf(completed), 1);
            }
        }

        return results;
    }

    /**
     * 简化执行（不调用模型）
     */
    async executeSimple(message) {
        return {
            success: true,
            output: `[${this.name}] 收到任务: ${message.slice(0, 50)}...`,
            ministry: this.id
        };
    }

    /**
     * 获取部门信息
     */
    getInfo() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            keywords: this.keywords,
            tags: this.tags,
            providerType: this.providerType,
            maxTokens: this.maxTokens,
            temperature: this.temperature,
            safetyEnabled: this.safetyEnabled
        };
    }

    /**
     * 更新配置
     */
    updateConfig(config) {
        if (config.providerType && config.providerType !== this.providerType) {
            this.providerType = config.providerType;
            this.providerConfig = { ...this.providerConfig, ...config.providerConfig };
            this._initProvider();
        }
        if (config.maxTokens) this.maxTokens = config.maxTokens;
        if (config.temperature) this.temperature = config.temperature;
        if (config.systemPrompt) this.systemPrompt = config.systemPrompt;
        if (config.safetyEnabled !== undefined) this.safetyEnabled = config.safetyEnabled;
    }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createMinistry(config) {
    return new Ministry(config);
}

export default Ministry;
