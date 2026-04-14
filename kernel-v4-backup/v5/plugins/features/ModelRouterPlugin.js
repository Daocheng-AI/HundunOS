import { BasePlugin } from '../../core/BasePlugin.js';

export class ModelRouterPlugin extends BasePlugin {
  #providers = new Map();
  #models = new Map();
  #config = null;
  #cache = null;
  #defaultProvider = null;

  get name() {
    return 'modelRouter';
  }

  get version() {
    return '2.0.0';
  }

  get dependencies() {
    return ['logger', 'config', 'cache'];
  }

  async onInit() {
    this.#config = this.kernel.get('config');
    this.#cache = this.kernel.get('cache');

    this.#defaultProvider = this.#config.get('models.defaultProvider', 'openai');

    this.#registerBuiltInProviders();
    this.#loadConfiguredProviders();

    this.kernel.services.register('models', () => ({
      chat: this.chat.bind(this),
      complete: this.complete.bind(this),
      embed: this.embed.bind(this),
      registerProvider: this.registerProvider.bind(this),
      getProvider: this.getProvider.bind(this),
      listModels: this.listModels.bind(this),
      route: this.route.bind(this)
    }), { singleton: true, lazy: true });

    this.logger.info('ModelRouter Plugin initialized');
  }

  #registerBuiltInProviders() {
    this.registerProvider('openai', new OpenAIProvider());
    this.registerProvider('anthropic', new AnthropicProvider());
    this.registerProvider('local', new LocalProvider());
  }

  #loadConfiguredProviders() {
    const providers = this.#config.get('models.providers', {});
    for (const [name, config] of Object.entries(providers)) {
      if (this.#providers.has(name)) {
        this.#providers.get(name).configure(config);
      }
    }
  }

  registerProvider(name, provider) {
    if (this.#providers.has(name)) {
      this.logger.warn(`Provider ${name} already registered, overwriting`);
    }
    this.#providers.set(name, provider);
    this.logger.debug(`Registered model provider: ${name}`);
  }

  getProvider(name = null) {
    const providerName = name || this.#defaultProvider;
    const provider = this.#providers.get(providerName);
    if (!provider) {
      throw new Error(`Model provider not found: ${providerName}`);
    }
    return provider;
  }

  async chat(messages, options = {}) {
    const provider = this.getProvider(options.provider);
    const model = options.model || provider.defaultModel;

    const cacheKey = await this.#generateCacheKey('chat', messages, model, options);
    
    return this.#cache.remember(cacheKey, options.cacheTtl || 300, async () => {
      const startTime = Date.now();
      
      try {
        const result = await provider.chat(messages, { ...options, model });
        
        this.kernel.events.emit('model:chat:success', {
          provider: provider.name,
          model,
          latency: Date.now() - startTime,
          tokens: result.usage?.total_tokens || 0
        });
        
        return result;
      } catch (err) {
        this.kernel.events.emit('model:chat:error', {
          provider: provider.name,
          model,
          error: err.message
        });
        throw err;
      }
    });
  }

  async complete(prompt, options = {}) {
    const messages = [{ role: 'user', content: prompt }];
    return this.chat(messages, options);
  }

  async embed(texts, options = {}) {
    const provider = this.getProvider(options.provider);
    const model = options.model || provider.defaultEmbeddingModel;

    const cacheKey = await this.#generateCacheKey('embed', texts, model, options);

    return this.#cache.remember(cacheKey, options.cacheTtl || 3600, async () => {
      return await provider.embed(texts, { ...options, model });
    });
  }

  route(request) {
    const routingRules = this.#config.get('models.routing', []);
    
    for (const rule of routingRules) {
      if (this.#matchesRule(request, rule)) {
        return {
          provider: rule.provider,
          model: rule.model,
          priority: rule.priority || 0
        };
      }
    }

    return {
      provider: this.#defaultProvider,
      model: null,
      priority: 0
    };
  }

  #matchesRule(request, rule) {
    if (rule.modelPattern && !new RegExp(rule.modelPattern).test(request.model)) {
      return false;
    }
    if (rule.capabilities) {
      for (const cap of rule.capabilities) {
        if (!request.capabilities?.includes(cap)) {
          return false;
        }
      }
    }
    return true;
  }

  listModels() {
    const models = [];
    for (const [name, provider] of this.#providers.entries()) {
      for (const model of provider.listModels()) {
        models.push({
          id: model,
          provider: name,
          ...provider.getModelInfo(model)
        });
      }
    }
    return models;
  }

  async #generateCacheKey(type, data, model, options) {
    const { createHash } = await import('crypto');
    const hash = createHash('md5');
    hash.update(JSON.stringify({ type, data, model, options }));
    return `model:${type}:${hash.digest('hex')}`;
  }

  async onDestroy() {
    for (const provider of this.#providers.values()) {
      if (typeof provider.close === 'function') {
        await provider.close();
      }
    }
    this.#providers.clear();
  }
}

class BaseModelProvider {
  constructor(name) {
    this.name = name;
    this.config = {};
    this.defaultModel = 'gpt-3.5-turbo';
    this.defaultEmbeddingModel = 'text-embedding-ada-002';
  }

  configure(config) {
    this.config = { ...this.config, ...config };
    if (config.defaultModel) {
      this.defaultModel = config.defaultModel;
    }
  }

  async chat(messages, options) {
    throw new Error('Not implemented');
  }

  async embed(texts, options) {
    throw new Error('Not implemented');
  }

  listModels() {
    return [this.defaultModel];
  }

  getModelInfo(model) {
    return {
      contextWindow: 4096,
      supportsStreaming: true,
      supportsFunctions: false
    };
  }
}

class OpenAIProvider extends BaseModelProvider {
  constructor() {
    super('openai');
    this.defaultModel = 'gpt-3.5-turbo';
  }

  async chat(messages, options) {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: this.config.apiKey });

    const response = await client.chat.completions.create({
      model: options.model || this.defaultModel,
      messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens,
      stream: options.stream || false
    });

    return {
      content: response.choices[0].message.content,
      usage: response.usage,
      model: response.model
    };
  }

  async embed(texts, options) {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: this.config.apiKey });

    const response = await client.embeddings.create({
      model: options.model || this.defaultEmbeddingModel,
      input: Array.isArray(texts) ? texts : [texts]
    });

    return response.data.map(d => d.embedding);
  }

  listModels() {
    return [
      'gpt-4',
      'gpt-4-turbo',
      'gpt-3.5-turbo',
      'text-embedding-ada-002',
      'text-embedding-3-small',
      'text-embedding-3-large'
    ];
  }
}

class AnthropicProvider extends BaseModelProvider {
  constructor() {
    super('anthropic');
    this.defaultModel = 'claude-3-sonnet-20240229';
  }

  async chat(messages, options) {
    const Anthropic = await import('@anthropic-ai/sdk');
    const client = new Anthropic.default({ apiKey: this.config.apiKey });

    const response = await client.messages.create({
      model: options.model || this.defaultModel,
      messages: messages.map(m => ({
        role: m.role === 'system' ? 'assistant' : m.role,
        content: m.content
      })),
      max_tokens: options.maxTokens || 1024
    });

    return {
      content: response.content[0].text,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens
      },
      model: response.model
    };
  }

  listModels() {
    return [
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ];
  }
}

class LocalProvider extends BaseModelProvider {
  constructor() {
    super('local');
    this.defaultModel = 'local-model';
  }

  async chat(messages, options) {
    const response = await fetch(this.config.endpoint || 'http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model || this.defaultModel,
        messages,
        stream: false
      })
    });

    const data = await response.json();
    return {
      content: data.message?.content || data.response,
      usage: data.usage || {},
      model: options.model || this.defaultModel
    };
  }

  async embed(texts, options) {
    const response = await fetch(this.config.endpoint || 'http://localhost:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model || this.defaultEmbeddingModel,
        prompt: Array.isArray(texts) ? texts[0] : texts
      })
    });

    const data = await response.json();
    return [data.embedding];
  }
}
