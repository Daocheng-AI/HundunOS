// hundunos/kernel/model-router/index.js — ModelRouter v4.0
// 多模型统一调度
// v4.0 升级（借鉴 TaxHacker ai/providers/llmProvider.ts）：
//   - SUPPORTED_PROVIDERS 元数据标准化（OpenAI/Gemini/Mistral/OpenAI-Compatible）
//   - Multi-Provider Failover：provider 失败自动切换下一个（TaxHacker 风格）
//   - structuredOutput() 封装：type-safe LLM 输出提取
//   - Provider 熔断器：失败 → 自动跳过 → 恢复
// v3.7 Phase 4: 集成 adapters/rust-modules/model-router.js（hundunos-core daemon）
//   - kernel.rustRouter 用于路由决策加速（TCP:38082）
import { getCircuitBreakerManager } from './circuit-breaker.js';
import { TurboContextCompressor } from './turbo-context-compressor.js';
import { replaceTemplate, parseLLMResponse } from '../prompt-template.js';
import { createLogger } from '../logger.js';

const logger = createLogger('ModelRouter');

// ================================================================
// TaxHacker 风格：标准化 Provider 元数据
// 灵感来源：TaxHacker ai/schema.ts 的 PROVIDERS 数组
// ================================================================

/**
 * @typedef {Object} ProviderMeta
 * @property {string} key              - Provider 唯一标识
 * @property {string} label           - 人类可读名称
 * @property {string} configKey        - config.system.modelRouter 中的配置键
 * @property {string} apiKeyName      - API Key 环境变量名
 * @property {string} modelName       - 模型名配置键
 * @property {string} defaultModel    - 默认模型名
 * @property {string} [baseUrlName]   - Base URL 配置键（OpenAI-Compatible 专用）
 * @property {string} [defaultBaseUrl]- 默认 Base URL
 * @property {string} logo            - Logo 路径
 * @property {string} docsUrl         - 官方文档 URL
 */
export const SUPPORTED_PROVIDERS = [
    {
        key: 'openai',
        label: 'OpenAI',
        configKey: 'openai',
        apiKeyName: 'OPENAI_API_KEY',
        modelName: 'OPENAI_MODEL',
        defaultModel: 'gpt-4o-mini',
        logo: '/logo/openai.svg',
        docsUrl: 'https://platform.openai.com/settings/organization/api-keys',
    },
    {
        key: 'anthropic',
        label: 'Anthropic (Claude)',
        configKey: 'anthropic',
        apiKeyName: 'ANTHROPIC_API_KEY',
        modelName: 'ANTHROPIC_MODEL',
        defaultModel: 'claude-3-5-haiku',
        logo: '/logo/anthropic.svg',
        docsUrl: 'https://console.anthropic.com/settings/keys',
    },
    {
        key: 'google',
        label: 'Google Gemini',
        configKey: 'google',
        apiKeyName: 'GOOGLE_API_KEY',
        modelName: 'GOOGLE_MODEL',
        defaultModel: 'gemini-2.5-flash',
        logo: '/logo/google.svg',
        docsUrl: 'https://aistudio.google.com/apikey',
    },
    {
        key: 'mistral',
        label: 'Mistral',
        configKey: 'mistral',
        apiKeyName: 'MISTRAL_API_KEY',
        modelName: 'MISTRAL_MODEL',
        defaultModel: 'mistral-small-latest',
        logo: '/logo/mistral.svg',
        docsUrl: 'https://admin.mistral.ai/organization/api-keys',
    },
    {
        key: 'openai_compatible',
        label: 'Ollama / LM Studio / vLLM / LocalAI',
        configKey: 'ollama',
        apiKeyName: null, // 通常不需要 API Key
        modelName: 'OLLAMA_MODEL',
        defaultModel: 'qwen2.5:1.5b',
        baseUrlName: 'OLLAMA_BASE_URL',
        defaultBaseUrl: 'http://localhost:11434/v1',
        logo: '/logo/openai.svg',
        docsUrl: 'https://github.com/ollama/ollama/blob/main/docs/openai.md',
    },
    {
        key: 'glm',
        label: '智谱 AI (GLM)',
        configKey: 'glm',
        apiKeyName: 'ZHIPU_API_KEY',
        modelName: 'GLM_MODEL',
        defaultModel: 'glm-4-flash',
        baseUrlName: 'GLM_BASE_URL',
        defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        logo: '/logo/glm.svg',
        docsUrl: 'https://open.bigmodel.cn/dev/api',
    },
    {
        key: 'dashscope',
        label: '阿里百炼 (DashScope)',
        configKey: 'dashscope',
        apiKeyName: 'DASHSCOPE_API_KEY',
        modelName: 'DASHSCOPE_MODEL',
        defaultModel: 'qwen-max',
        baseUrlName: 'DASHSCOPE_BASE_URL',
        defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        logo: '/logo/dashscope.svg',
        docsUrl: 'https://help.aliyun.com/zh/model-studio/getting-started/models',
    },
    {
        key: 'wenxin',
        label: '百度文心 (ERNIE)',
        configKey: 'wenxin',
        apiKeyName: 'WENXIN_API_KEY',
        modelName: 'WENXIN_MODEL',
        defaultModel: 'ernie-bot-turbo',
        baseUrlName: 'WENXIN_BASE_URL',
        defaultBaseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop',
        logo: '/logo/wenxin.svg',
        docsUrl: 'https://cloud.baidu.com/doc/WENXINWORKSHOP/index.html',
    },
    {
        key: 'hunyuan',
        label: '腾讯混元 (Hunyuan)',
        configKey: 'hunyuan',
        apiKeyName: 'HUNYUAN_SECRET_ID',
        modelName: 'HUNYUAN_MODEL',
        defaultModel: 'hunyuan-standard',
        baseUrlName: 'HUNYUAN_BASE_URL',
        defaultBaseUrl: 'https://hunyuan.tencentcloudapi.com',
        logo: '/logo/hunyuan.svg',
        docsUrl: 'https://cloud.tencent.com/document/product/1729',
    },
];

class ModelRouter {
    constructor(kernel) {
        this.kernel = kernel;
        this.providers = new Map();              // id → { id, name, type, model, capabilities, maxTokens, costPer1M, meta }
        this.providerInstances = new Map();      // id → provider instance
        this.routerConfig = this._buildRouterConfig();
        this.strategy = this.routerConfig.defaultStrategy;
        this.localFirst = this.routerConfig.localFirst;
        this.usageStats = { totalTokens: 0, totalCost: 0, byModel: {}, failures: 0, successes: 0 };
        this.circuitBreakerManager = getCircuitBreakerManager();

        // v3.1: 上下文压缩配置
        this.compressionConfig = {
            enabled: this.routerConfig.enableCompression !== false,
            maxTokens: this.routerConfig.maxTokens || 8192,
            keepRecent: this.routerConfig.compressionKeepRecent || 6,
            summarizeModel: this.routerConfig.summarizeModel || 'ollama_local',
            useLLMSummary: this.routerConfig.useLLMSummary !== false,
        };

        // v4.0: TurboQuant 上下文压缩器
        this.turboCompressor = null;
        if (this.routerConfig.enableTurboCompression !== false) {
            try {
                this.turboCompressor = new TurboContextCompressor(this.kernel, {
                    enabled: true,
                    maxTokens: this.routerConfig.maxTokens || 8192,
                    keepRecent: this.routerConfig.compressionKeepRecent || 6,
                    importanceThreshold: 0.65,
                    fallbackToLLM: this.routerConfig.useLLMSummary === true,
                    clusterThreshold: 0.80,
                    embeddingDim: this.routerConfig.embeddingDim || 384,
                });
                // console.log('[ModelRouter] TurboQuant ContextCompressor enabled (v4.0)');
            } catch (e) {
                logger.warn('TurboQuant ContextCompressor init failed:', e.message);
            }
        }

        // v4.0: Provider 注册顺序（用于 failover）
        this._providerOrder = [];

        // Phase 4: Rust 模型路由后端（adapters/rust-modules/model-router.js）
        this.rustAdapter = kernel?.rustRouter || null;
    }

    _buildRouterConfig() {
        const config = this.kernel?.config?.system?.modelRouter || {};
        return {
            defaultStrategy: config.defaultStrategy || 'BALANCED',
            localFirst: config.localFirst !== false,
            endpoint: config.endpoint || 'http://127.0.0.1:11434',
            localModel: config.localModel || 'qwen2.5:1.5b',
            localMaxTokens: config.localMaxTokens || 8192,
            requestTimeout: config.requestTimeout || 30000,
            // Provider 启停开关
            providers: new Set(config.providers || ['ollama', 'openai', 'anthropic', 'google', 'mistral', 'glm', 'dashscope', 'custom']),
            openai: config.openai || {},
            anthropic: config.anthropic || {},
            google: config.google || {},
            mistral: config.mistral || {},
            glm: config.glm || {},
            dashscope: config.dashscope || {},
            custom: config.custom || {},
        };
    }

    _isProviderEnabled(providerId) {
        return this.routerConfig.providers.has(providerId);
    }

    // ================================================================
    // 初始化（v4.0: 规范化 Provider 注册顺序）
    // ================================================================

    async initialize() {
        this.routerConfig = this._buildRouterConfig();
        this.strategy = this.routerConfig.defaultStrategy;
        this.localFirst = this.routerConfig.localFirst;
        this.providers.clear();
        this.providerInstances.clear();
        this._providerOrder = [];

        // 按优先级注册 Provider（本地 → 云端）
        const registrationOrder = [
            'ollama',
            'openai',
            'anthropic',
            'google',
            'mistral',
            'glm',
            'dashscope',
            'custom',
        ];

        for (const id of registrationOrder) {
            if (!this._isProviderEnabled(id)) continue;
            await this._registerProvider(id);
        }

        // console.log('[ModelRouter] Initialized v4.0 with', this.providers.size, 'providers, order:', this._providerOrder);

        // Phase 4: Rust 后端状态
        if (this.rustAdapter) {
            // console.log('[ModelRouter] Rust backend: ✅ adapters/rust-modules/router (hundunos-core daemon)');
        } else {
            // console.log('[ModelRouter] Rust backend: ⚠️  using JS router only (daemon unavailable)');
        }
    }

    /**
     * v4.0: 规范化 Provider 注册
     * @param {string} id - Provider ID
     */
    async _registerProvider(id) {
        try {
            if (id === 'ollama') {
                const { OllamaProvider } = await import('./providers/ollama.js');
                const ollama = new OllamaProvider(this.kernel, {
                    endpoint: this.routerConfig.endpoint,
                    model: this.routerConfig.localModel,
                    timeout: this.routerConfig.requestTimeout,
                });
                this.providerInstances.set('ollama_local', ollama);
                this._registerProviderMeta('ollama_local', {
                    id: 'ollama_local',
                    name: 'Ollama 本地',
                    type: 'LOCAL',
                    model: ollama.config.model,
                    capabilities: ['text', 'chat'],
                    maxTokens: this.routerConfig.localMaxTokens,
                    costPer1M: 0,
                    meta: SUPPORTED_PROVIDERS.find(p => p.key === 'openai_compatible'),
                });
                return;
            }

            if (id === 'openai') {
                const { OpenAIProvider, MODELS } = await import('./providers/openai.js');
                const openai = new OpenAIProvider(this.kernel, this.routerConfig.openai);
                if (openai.config.apiKey) {
                    this.providerInstances.set('openai', openai);
                    for (const [modelId, modelMeta] of Object.entries(MODELS)) {
                        this._registerProviderMeta(`openai_${modelId}`, {
                            id: `openai_${modelId}`,
                            name: modelMeta.name,
                            type: 'CLOUD',
                            model: modelId,
                            capabilities: modelMeta.capabilities || ['chat'],
                            maxTokens: modelMeta.context,
                            costPer1M: modelMeta.costPer1M,
                            meta: SUPPORTED_PROVIDERS.find(p => p.key === 'openai'),
                        });
                    }
                }
                return;
            }

            if (id === 'anthropic') {
                const { AnthropicProvider, MODELS } = await import('./providers/anthropic.js');
                const anthropic = new AnthropicProvider(this.kernel, this.routerConfig.anthropic);
                if (anthropic.config.apiKey) {
                    this.providerInstances.set('anthropic', anthropic);
                    for (const [modelId, modelMeta] of Object.entries(MODELS)) {
                        this._registerProviderMeta(`anthropic_${modelId}`, {
                            id: `anthropic_${modelId}`,
                            name: modelMeta.name,
                            type: 'CLOUD',
                            model: modelId,
                            capabilities: modelMeta.capabilities || ['chat'],
                            maxTokens: modelMeta.context,
                            costPer1M: modelMeta.costPer1M,
                            meta: SUPPORTED_PROVIDERS.find(p => p.key === 'anthropic'),
                        });
                    }
                }
                return;
            }

            if (id === 'google') {
                const { GeminiProvider, MODELS } = await import('./providers/gemini.js');
                const gemini = new GeminiProvider(this.kernel, this.routerConfig.google);
                if (gemini.config.apiKey) {
                    this.providerInstances.set('google', gemini);
                    for (const [modelId, modelMeta] of Object.entries(MODELS)) {
                        this._registerProviderMeta(`google_${modelId}`, {
                            id: `google_${modelId}`,
                            name: modelMeta.name,
                            type: 'CLOUD',
                            model: modelId,
                            capabilities: modelMeta.capabilities || ['chat'],
                            maxTokens: modelMeta.maxTokens,
                            costPer1M: modelMeta.costPer1M,
                            meta: SUPPORTED_PROVIDERS.find(p => p.key === 'google'),
                        });
                    }
                }
                return;
            }

            if (id === 'mistral') {
                const { MistralProvider } = await import('./providers/custom.js'); // 复用 custom
                const mistral = new MistralProvider(this.kernel, this.routerConfig.mistral);
                if (mistral.config?.apiKey) {
                    this.providerInstances.set('mistral', mistral);
                    this._registerProviderMeta('mistral', {
                        id: 'mistral',
                        name: 'Mistral',
                        type: 'CLOUD',
                        model: mistral.config.model,
                        capabilities: ['chat'],
                        maxTokens: mistral.config.contextWindow,
                        costPer1M: mistral.config.costPer1M || 0,
                        meta: SUPPORTED_PROVIDERS.find(p => p.key === 'mistral'),
                    });
                }
                return;
            }

            if (id === 'glm') {
                const { GLMProvider, GLMModels } = await import('./providers/glm.js');
                const glm = new GLMProvider(this.kernel, this.routerConfig.glm);
                if (glm.config.apiKey) {
                    this.providerInstances.set('glm', glm);
                    for (const [modelId, modelMeta] of Object.entries(GLMModels)) {
                        this._registerProviderMeta(`glm_${modelMeta.id}`, {
                            id: `glm_${modelMeta.id}`,
                            name: modelMeta.name,
                            type: 'CLOUD',
                            model: modelMeta.id,
                            capabilities: modelMeta.capabilities || ['chat'],
                            maxTokens: modelMeta.maxTokens,
                            costPer1M: modelMeta.costPer1M,
                            meta: SUPPORTED_PROVIDERS.find(p => p.key === 'glm'),
                        });
                    }
                }
                return;
            }

            if (id === 'dashscope') {
                const { DashScopeProvider, MODELS } = await import('./providers/dashscope.js');
                const dashscope = new DashScopeProvider(this.kernel, this.routerConfig.dashscope);
                if (dashscope.config.apiKey) {
                    this.providerInstances.set('dashscope', dashscope);
                    for (const [modelId, modelMeta] of Object.entries(MODELS)) {
                        this._registerProviderMeta(`dashscope_${modelId}`, {
                            id: `dashscope_${modelId}`,
                            name: modelMeta.name,
                            type: 'CLOUD',
                            model: modelId,
                            capabilities: modelMeta.capabilities || ['chat'],
                            maxTokens: modelMeta.context,
                            costPer1M: modelMeta.costPer1M,
                            meta: SUPPORTED_PROVIDERS.find(p => p.key === 'dashscope'),
                        });
                    }
                }
                return;
            }

            if (id === 'custom') {
                const customConfigs = this.routerConfig.custom;
                if (customConfigs && typeof customConfigs === 'object') {
                    const { CustomProvider, CUSTOM_TEMPLATES } = await import('./providers/custom.js');
                    const configs = Array.isArray(customConfigs) ? customConfigs : [customConfigs];
                    for (const cfg of configs) {
                        if (!cfg || !cfg.endpoint || !cfg.model) continue;
                        const custom = new CustomProvider(this.kernel, {
                            ...CUSTOM_TEMPLATES[cfg.template] || {},
                            ...cfg,
                        });
                        const providerId = `custom_${cfg.name || cfg.model}`;
                        this.providerInstances.set(providerId, custom);
                        this._registerProviderMeta(providerId, {
                            id: providerId,
                            name: custom.config.displayName,
                            type: 'CUSTOM',
                            model: custom.config.model,
                            capabilities: custom.config.capabilities,
                            maxTokens: custom.config.contextWindow,
                            costPer1M: custom.config.costPer1M,
                            meta: SUPPORTED_PROVIDERS.find(p => p.key === 'openai_compatible'),
                        });
                        // console.log(`[ModelRouter] Custom provider loaded: ${providerId}`);
                    }
                }
            }
        } catch (e) {
            logger.warn(`Provider ${id} registration failed:`, e.message);
        }
    }

    /**
     * v4.0: 规范化 Provider 元数据注册
     */
    _registerProviderMeta(id, meta) {
        this.providers.set(id, meta);
        this._providerOrder.push(id);
    }

    // ================================================================
    // v4.0: Multi-Provider Failover（借鉴 TaxHacker requestLLM）
    // TaxHacker 策略：遍历 providers，失败则自动切换下一个
    // ================================================================

    /**
     * 多 Provider Failover 调用
     * @param {string[]} providerIds - 按优先级排序的 Provider ID 列表
     * @param {object} callParams - { messages, intent, session }
     * @returns {Promise<object>} 调用结果
     *
     * @example
     *   const candidates = this.getCandidates(taskType).map(p => p.id);
     *   return this._failoverCall(candidates, { messages, intent, session });
     */
    async _failoverCall(providerIds, { messages, intent, session }) {
        let lastError = null;

        for (const providerId of providerIds) {
            // 熔断器检查
            if (!this.circuitBreakerManager.canCall(providerId)) {
                // console.info(`[ModelRouter] Skipping ${providerId} (circuit breaker open)`);
                continue;
            }

            const provider = this.providerInstances.get(providerId);
            if (!provider || typeof provider.call !== 'function') continue;

            const start = Date.now();
            try {
                const result = await provider.call(messages, { intent, session });

                if (result?.success !== false && !result?.error) {
                    // 成功：记录熔断器恢复
                    this.circuitBreakerManager.recordSuccess(providerId);
                    this.usageStats.successes++;
                    this._trackUsage(providerId, result, Date.now() - start);
                    return {
                        ...result,
                        provider: providerId,
                        providerMeta: this.providers.get(providerId),
                        failoverAttempted: providerIds.indexOf(providerId) > 0,
                    };
                }

                lastError = result?.error || 'Unknown error';
                logger.warn(`Provider ${providerId} failed: ${lastError}`);
                this.circuitBreakerManager.recordFailure(providerId);
                this.usageStats.failures++;
            } catch (e) {
                lastError = e.message;
                logger.warn(`Provider ${providerId} exception: ${lastError}`);
                this.circuitBreakerManager.recordFailure(providerId);
                this.usageStats.failures++;
            }
        }

        // 所有 Provider 都失败
        return {
            success: false,
            error: lastError || 'All providers failed',
            provider: providerIds[0],
            providerMeta: this.providers.get(providerIds[0]),
            failoverAttempted: providerIds.length > 1,
        };
    }

    // ================================================================
    // v4.0: Structured Output（借鉴 TaxHacker withStructuredOutput）
    // ================================================================

    /**
     * 结构化输出调用（type-safe LLM 提取）
     * @param {string} providerId
     * @param {string} prompt
     * @param {object} schema - JSON Schema（参考 TaxHacker fieldsToJsonSchema）
     * @param {object} [options]
     * @param {string[]} [options.images] - Base64 编码图片（可选）
     * @returns {Promise<{ success, data?, error?, tokensUsed? }>}
     *
     * @example
     *   const schema = {
     *     type: 'object',
     *     properties: {
     *       name: { type: 'string', description: '文件名' },
     *       action: { type: 'string', description: '操作类型' }
     *     },
     *     required: ['name', 'action']
     *   }
     *   const { success, data } = await this.structuredOutput('openai', prompt, schema)
     */
    async structuredOutput(providerId, prompt, schema, options = {}) {
        const provider = this.providerInstances.get(providerId);
        if (!provider) {
            return { success: false, error: `Provider ${providerId} not found` };
        }

        // 构建带图片的消息
        let content = prompt;
        if (options.images && options.images.length > 0) {
            // OpenAI vision 格式
            content = [
                { type: 'text', text: prompt },
                ...options.images.map(img => ({
                    type: 'image_url',
                    image_url: { url: `data:${img.contentType};base64,${img.base64}` },
                })),
            ];
        }

        const messages = [{ role: 'user', content }];

        try {
            // 优先使用 Provider 原生 structured output
            if (typeof provider.callStructured === 'function') {
                const result = await provider.callStructured(messages, schema);
                return result;
            }

            // 降级：普通调用 + JSON 解析
            const result = await provider.call(messages, {});

            if (!result.success) {
                return { success: false, error: result.error };
            }

            // TaxHacker 风格：去除 markdown 包裹后 JSON 解析
            const parsed = parseLLMResponse(result.content || '');
            if (!parsed.success) {
                return { success: false, error: parsed.error };
            }

            return {
                success: true,
                data: parsed.data,
                tokensUsed: result.usage?.total || 0,
                provider: providerId,
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // ================================================================
    // 路由入口（v4.0: 集成 Multi-Provider Failover）
    // ================================================================

    async route(intent, session) {
        const taskType = this.classifyTask(intent);
        const candidates = this.getCandidates(taskType);

        if (candidates.length === 0) {
            return { success: false, error: 'No available providers' };
        }

        // 策略选择
        let selected = candidates[0];
        if (this.strategy === 'COST_FIRST') {
            selected = candidates.sort((a, b) => a.costPer1M - b.costPer1M)[0];
        } else if (this.strategy === 'BALANCED') {
            const local = candidates.find(c => c.type === 'LOCAL');
            selected = local || candidates[0];
        }

        // v4.0: 构建候选列表（含 failover 备选）
        const providerIds = candidates.map(c => c.id);

        // 构建消息（含上下文压缩）
        const messages = this._buildMessages(intent, session, { providerId: selected.id });
        let compression = { compressed: false };
        if (this.turboCompressor) {
            compression = await this.turboCompressor.compressForRoute(
                messages, Math.floor((this.routerConfig.maxTokens || 8192) * 0.9)
            );
        } else {
            compression = await this._maybeCompress(messages);
        }
        if (compression.compressed) {
            // console.log(`[ModelRouter] Compressed messages: ${compression.originalTokens} → ${compression.compressedTokens} tokens`);
        }

        // v4.0: Multi-Provider Failover
        const result = await this._failoverCall(providerIds, { messages: compression.compressed ? compression.messages : messages, intent, session });

        // v4.3: 检测 todo 工具调用（参考 learn-claude-code s03）
        this._detectTodoUpdate(result);

        return {
            ...result,
            latency: result.latency || 0,
            taskType: taskType.category,
            timestamp: Date.now(),
            compression: compression.compressed ? {
                originalTokens: compression.originalTokens,
                compressedTokens: compression.compressedTokens,
                savedTokens: compression.savedTokens,
                engine: this.turboCompressor ? 'turboquant_v1' : 'llm_summarization',
            } : null,
        };
    }

    // v4.3: 检测 todo 工具调用（参考 learn-claude-code s03）
    _detectTodoUpdate(result) {
        const content = result?.content?.[0]?.text || result?.choices?.[0]?.message?.content || '';
        const hasTodoTool = content.includes('tool_calls') && content.includes('"function": {"name": "todo"');
        if (hasTodoTool) {
            // todo: tracked
        } else {
            // 未更新，记录一轮
            this.kernel?.todoManager?.noteRoundWithoutUpdate?.();
        }
    }

    // ================================================================
    // Phase 4: Rust 路由加速（adapters/rust-modules/model-router.js）
    // ================================================================

    /**
     * v3.7 Phase 4: 通过 Rust 加速路由决策
     * @param {string} content - 输入内容
     * @param {string} taskType - 任务类型（可选）
     * @param {number} maxTokens - 最大 token 数（可选）
     */
    async rustRoute(content, taskType = null, maxTokens = null) {
        if (!this.rustAdapter) return null;
        try {
            return await this.rustAdapter.route(content, taskType, maxTokens);
        } catch (e) {
            logger.warn('Rust route failed:', e.message);
            return null;
        }
    }

    /**
     * v3.7 Phase 4: 记录路由成功（同步到 Rust）
     */
    async rustRecordSuccess(providerId) {
        if (!this.rustAdapter) return;
        try {
            await this.rustAdapter.recordSuccess(providerId);
        } catch {}
    }

    /**
     * v3.7 Phase 4: 记录路由失败（同步到 Rust）
     */
    async rustRecordFailure(providerId, error = '') {
        if (!this.rustAdapter) return;
        try {
            await this.rustAdapter.recordFailure(providerId, error);
        } catch {}
    }

    classifyTask(intent) {
        const content = intent.content || '';
        const patterns = [
            { category: 'LOCAL_FAST', keywords: ['总结', '翻译', '解释', '查询', 'search'] },
            { category: 'LOCAL_BALANCE', keywords: ['代码', '审查', 'review', 'script'] },
            { category: 'CLOUD_ANALYSIS', keywords: ['分析', '报告', '报表'] },
            { category: 'CLOUD_EXPERT', keywords: ['架构', '设计', '复杂'] },
        ];
        for (const p of patterns) {
            if (p.keywords.some(k => content.includes(k))) return { category: p.category };
        }
        return { category: 'BALANCED' };
    }

    getCandidates(taskType) {
        const all = Array.from(this.providers.values());
        const local = all.filter(p => p.type === 'LOCAL');
        const cloud = all.filter(p => p.type !== 'LOCAL');

        if (taskType.category?.startsWith('LOCAL')) {
            return [...local, ...cloud];
        }
        if (taskType.category?.startsWith('CLOUD')) {
            return [...cloud, ...local];
        }
        return this.localFirst ? [...local, ...cloud] : [...cloud, ...local];
    }

    // ================================================================
    // 消息构建（含孤立 Tool Response 清理）
    // ================================================================

    _buildMessages(intent, session, options = {}) {
        const history = session?.context?.working || [];
        const cleanedHistory = this._cleanOrphanedToolResponses(history);

        const providerId = options.providerId || Array.from(this.providerInstances.keys())[0];
        const provider = this.providers.get(providerId) || { maxTokens: 8192 };
        const maxTokens = provider.maxTokens || 8192;

        const systemPrompt = this._getSystemPrompt(session, intent);
        const reminderMsg = this._getReminderMessage(session);

        const systemTokens = this._estimateTokens([{ role: 'system', content: systemPrompt }]);
        const reminderTokens = this._estimateTokens([{ role: 'system', content: reminderMsg }]);

        let historyBudget = maxTokens - systemTokens - reminderTokens;
        const inputTokens = this._estimateTokens([{ role: 'user', content: intent.content || '' }]);
        historyBudget = Math.max(0, historyBudget - inputTokens);

        const MIN_HISTORY_TOKENS = 200;
        if (historyBudget < MIN_HISTORY_TOKENS) historyBudget = MIN_HISTORY_TOKENS;

        const messages = [{ role: 'system', content: systemPrompt }];
        if (reminderMsg) messages.push({ role: 'system', content: reminderMsg, _meta: { type: 'reminder' } });

        let usedTokens = 0;
        const includedHistory = [];

        for (let i = cleanedHistory.length - 1; i >= 0; i--) {
            const h = cleanedHistory[i];
            const msgTokens = this._estimateTokens([{ role: 'user', content: h.message || '' }]);
            if (usedTokens + msgTokens > historyBudget) break;
            usedTokens += msgTokens;
            includedHistory.unshift(h);
        }

        for (const h of includedHistory) {
            messages.push({ role: 'user', content: h.message || '', _meta: { fromHistory: true } });
        }
        messages.push({ role: 'user', content: intent.content || '' });

        if (options.debug) {
            // console.log(`[ModelRouter] Token budget: max=${maxTokens}, system=${systemTokens}, history=${usedTokens}/${historyBudget}`);
        }
        return messages;
    }

    _cleanOrphanedToolResponses(history) {
        if (!history || history.length < 2) return history;
        let lastAssistantIdx = -1;
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].role === 'assistant' || history[i]._meta?.type === 'assistant') {
                lastAssistantIdx = i;
                break;
            }
        }
        if (lastAssistantIdx === -1) return history;
        const lastAssistant = history[lastAssistantIdx];
        const hasToolCall = lastAssistant.tool_call
            || (Array.isArray(lastAssistant.tool_calls) && lastAssistant.tool_calls.length > 0)
            || (typeof lastAssistant._toolCall === 'object' && lastAssistant._toolCall !== null);
        if (hasToolCall) return history;
        const cleaned = history.slice(0, lastAssistantIdx + 1);
        return cleaned;
    }

    _getSystemPrompt(session, intent) {
        return session?.context?.systemPrompt || intent?.systemPrompt || '你是一个专业、高效的AI助手。请简洁准确地回答。';
    }

    _getReminderMessage(session) {
        const reminders = [];
        if (session?.context?.reminder) reminders.push(session.context.reminder);
        return reminders.join('\n') || null;
    }

    _trackUsage(providerId, result, latency) {
        const p = this.providers.get(providerId);
        if (!p) return;
        const tokens = result.usage?.total || 0;
        const cost = tokens * (p.costPer1M || 0) / 1e6;
        this.usageStats.totalTokens += tokens;
        this.usageStats.totalCost += cost;
        this.usageStats.byModel[providerId] = (this.usageStats.byModel[providerId] || 0) + cost;
    }

    async persistStats() {
        await this.kernel.storage.put('modelrouter:stats', this.usageStats);
    }

    // ================================================================
    // v4.0: 统计与目录
    // ================================================================

    getStats() {
        const byType = { LOCAL: [], CLOUD: [], CUSTOM: [] };
        for (const p of this.providers.values()) {
            byType[p.type] = byType[p.type] || [];
            byType[p.type].push({ id: p.id, name: p.name, model: p.model });
        }
        return {
            providerOrder: this._providerOrder,
            providers: Array.from(this.providers.values()).map(p => ({
                id: p.id,
                name: p.name,
                type: p.type,
                model: p.model,
                capabilities: p.capabilities,
                costPer1M: p.costPer1M,
                meta: p.meta,
            })),
            byType,
            usage: {
                ...this.usageStats,
                successRate: this.usageStats.successes + this.usageStats.failures > 0
                    ? `${Math.round(this.usageStats.successes / (this.usageStats.successes + this.usageStats.failures) * 100)}%`
                    : 'N/A',
            },
            strategy: this.strategy,
            totalModels: this.providers.size,
            turboCompressor: this.turboCompressor ? this.turboCompressor.getStats() : null,
            circuitBreaker: this.circuitBreakerManager.getStatus?.() || null,
        };
    }

    /**
     * v4.0: 完整模型目录（带 Provider 元数据）
     */
    getModelCatalog() {
        const catalog = { total: this.providers.size, byProvider: {} };
        for (const [id, p] of this.providers.entries()) {
            const key = p.meta?.key || p.type;
            if (!catalog.byProvider[key]) {
                catalog.byProvider[key] = {
                    label: p.meta?.label || p.name,
                    docsUrl: p.meta?.docsUrl || '',
                    models: [],
                };
            }
            catalog.byProvider[key].models.push({
                id,
                name: p.name,
                model: p.model,
                type: p.type,
                capabilities: p.capabilities,
                costPer1M: p.costPer1M,
                maxTokens: p.maxTokens,
            });
        }
        return catalog;
    }

    async callModel(modelId, messages, opts = {}) {
        const providerInstance = this.providerInstances.get(modelId);
        if (!providerInstance) return { success: false, error: `Model ${modelId} not found` };
        try {
            return await providerInstance.call(messages, opts);
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // ================================================================
    // 上下文压缩
    // ================================================================

    async compress(messages, maxTokens) {
        if (!this.compressionConfig.enabled) {
            return { messages, compressed: false, originalTokens: this._estimateTokens(messages), savedTokens: 0 };
        }
        const max = maxTokens || this.compressionConfig.maxTokens;
        const estimated = this._estimateTokens(messages);
        if (estimated <= max) {
            return { messages, compressed: false, originalTokens: estimated, savedTokens: 0 };
        }
        const systemMsg = messages.find(m => m.role === 'system');
        const nonSystem = messages.filter(m => m.role !== 'system');
        const recentMsgs = nonSystem.slice(-(this.compressionConfig.keepRecent));
        const olderMsgs = nonSystem.slice(0, -(this.compressionConfig.keepRecent));
        if (olderMsgs.length === 0) {
            return { messages, compressed: false, originalTokens: estimated, savedTokens: 0 };
        }
        let summary = this.compressionConfig.useLLMSummary && olderMsgs.length > 0
            ? await this._summarizeMessages(olderMsgs)
            : this._simpleCompress(olderMsgs);
        const compressed = [
            ...(systemMsg ? [systemMsg] : []),
            { role: 'system', content: `[会话历史摘要] 早期 ${olderMsgs.length} 条消息：${summary}`, _meta: { compressed: true } },
            ...recentMsgs,
        ];
        const savedTokens = estimated - this._estimateTokens(compressed);
        return { messages: compressed, compressed: true, originalTokens: estimated, savedTokens, originalCount: messages.length, compressedCount: compressed.length };
    }

    _estimateTokens(messages) {
        let total = 0;
        for (const msg of messages) {
            const text = msg.content || '';
            const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
            const english = text.split(/\s+/).filter(Boolean).join(' ').length - chinese;
            total += chinese * 0.5 + english * 0.25 + 10;
        }
        return Math.ceil(total);
    }

    async _summarizeMessages(msgs) {
        const summaryPrompt = `简洁概括以下对话的核心内容（不超过200字）：\n${msgs.map((m, i) => `[${i + 1}] ${m.role}: ${m.content}`).join('\n')}\n摘要：`;
        try {
            const provider = this.providerInstances.get(this.compressionConfig.summarizeModel);
            if (provider && typeof provider.call === 'function') {
                const result = await provider.call([{ role: 'user', content: summaryPrompt }], { maxTokens: 300 });
                if (result.success && result.content) return result.content.trim();
            }
        } catch (e) {
            logger.warn('LLM summarization failed:', e.message);
        }
        return this._simpleCompress(msgs);
    }

    _simpleCompress(msgs) {
        const keywords = [];
        for (const msg of msgs) {
            if (msg.content) {
                const snippet = msg.content.slice(0, 50).replace(/\n/g, ' ');
                if (!keywords.includes(snippet)) keywords.push(snippet);
            }
        }
        return keywords.slice(-3).join('; ');
    }

    async _maybeCompress(messages) {
        return this.compress(messages, Math.floor((this.routerConfig.maxTokens || 8192) * 0.9));
    }
}

export { ModelRouter };
