// hundunos/kernel/config/model-router.config.js
// 模型路由器配置类

/**
 * 熔断器配置
 */
export class CircuitBreakerConfig {
  enabled = true;
  threshold = 5;
  timeout = 60000;
  constructor() {
    if (process.env.CIRCUIT_BREAKER_ENABLED === 'false') this.enabled = false;
    const t = parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD, 10);
    if (!isNaN(t)) this.threshold = t;
    const to = parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT, 10);
    if (!isNaN(to)) this.timeout = to;
  }
}

/**
 * OpenAI 配置
 */
export class OpenAIConfig {
  apiKey = '';
  endpoint = 'https://api.openai.com/v1';
  model = 'gpt-4o-mini';
  constructor() {
    if (process.env.OPENAI_API_KEY) this.apiKey = process.env.OPENAI_API_KEY;
    if (process.env.OPENAI_ENDPOINT) this.endpoint = process.env.OPENAI_ENDPOINT;
    if (process.env.OPENAI_MODEL) this.model = process.env.OPENAI_MODEL;
  }
}

/**
 * Anthropic 配置
 */
export class AnthropicConfig {
  apiKey = '';
  endpoint = 'https://api.anthropic.com';
  model = 'claude-sonnet-4-20250514';
  constructor() {
    if (process.env.ANTHROPIC_API_KEY) this.apiKey = process.env.ANTHROPIC_API_KEY;
    if (process.env.ANTHROPIC_ENDPOINT) this.endpoint = process.env.ANTHROPIC_ENDPOINT;
    if (process.env.ANTHROPIC_MODEL) this.model = process.env.ANTHROPIC_MODEL;
  }
}

/**
 * GLM 配置
 */
export class GLMConfig {
  apiKey = '';
  baseUrl = 'https://open.bigmodel.cn/api/paas/v4';
  defaultModel = 'glm-4-flash';
  constructor() {
    if (process.env.GLM_API_KEY) this.apiKey = process.env.GLM_API_KEY;
    if (process.env.GLM_BASE_URL) this.baseUrl = process.env.GLM_BASE_URL;
    if (process.env.GLM_DEFAULT_MODEL) this.defaultModel = process.env.GLM_DEFAULT_MODEL;
  }
}

/**
 * 模型路由器配置类
 */
export class ModelRouterConfig {
  defaultStrategy = 'COST_FIRST';
  localFirst = true;
  endpoint = 'http://127.0.0.1:11434';
  localModel = 'qwen2.5:1.5b';
  localMaxTokens = 8192;
  requestTimeout = 30000;
  circuitBreaker = new CircuitBreakerConfig();
  openai = new OpenAIConfig();
  anthropic = new AnthropicConfig();
  glm = new GLMConfig();

  constructor() {
    const validStrategies = ['COST_FIRST', 'SPEED_FIRST', 'QUALITY_FIRST', 'MOCK'];
    if (validStrategies.includes(process.env.MODEL_ROUTER_STRATEGY)) {
      this.defaultStrategy = process.env.MODEL_ROUTER_STRATEGY;
    }
    if (process.env.MODEL_ROUTER_LOCAL_FIRST === 'false') this.localFirst = false;
    if (process.env.OLLAMA_ENDPOINT) this.endpoint = process.env.OLLAMA_ENDPOINT;
    if (process.env.OLLAMA_MODEL) this.localModel = process.env.OLLAMA_MODEL;
    const lmt = parseInt(process.env.OLLAMA_MAX_TOKENS, 10);
    if (!isNaN(lmt)) this.localMaxTokens = lmt;
    const rt = parseInt(process.env.MODEL_REQUEST_TIMEOUT, 10);
    if (!isNaN(rt)) this.requestTimeout = rt;
  }
}
