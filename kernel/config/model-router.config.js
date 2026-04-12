// hundunos/kernel/config/model-router.config.js
// 模型路由器配置类

import { Config, Env, Nested } from './decorators.js';

/**
 * 路由策略枚举
 */
const strategySchema = z.enum(['COST_FIRST', 'SPEED_FIRST', 'QUALITY_FIRST', 'MOCK']);

/**
 * 熔断器配置
 */
@Config
export class CircuitBreakerConfig {
  /** 是否启用熔断器 */
  @Env('CIRCUIT_BREAKER_ENABLED')
  enabled = true;

  /** 失败阈值 */
  @Env('CIRCUIT_BREAKER_THRESHOLD')
  threshold = 5;

  /** 超时时间（毫秒） */
  @Env('CIRCUIT_BREAKER_TIMEOUT')
  timeout = 60000;
}

/**
 * OpenAI 配置
 */
@Config
export class OpenAIConfig {
  /** API 密钥 */
  @Env('OPENAI_API_KEY')
  apiKey = '';

  /** API 端点 */
  @Env('OPENAI_ENDPOINT')
  endpoint = 'https://api.openai.com/v1';

  /** 模型名称 */
  @Env('OPENAI_MODEL')
  model = 'gpt-4o-mini';
}

/**
 * Anthropic 配置
 */
@Config
export class AnthropicConfig {
  /** API 密钥 */
  @Env('ANTHROPIC_API_KEY')
  apiKey = '';

  /** API 端点 */
  @Env('ANTHROPIC_ENDPOINT')
  endpoint = 'https://api.anthropic.com';

  /** 模型名称 */
  @Env('ANTHROPIC_MODEL')
  model = 'claude-sonnet-4-20250514';
}

/**
 * GLM 配置
 */
@Config
export class GLMConfig {
  /** API 密钥 */
  @Env('GLM_API_KEY')
  apiKey = '';

  /** 基础 URL */
  @Env('GLM_BASE_URL')
  baseUrl = 'https://open.bigmodel.cn/api/paas/v4';

  /** 默认模型 */
  @Env('GLM_DEFAULT_MODEL')
  defaultModel = 'glm-4-flash';
}

/**
 * 模型路由器配置类
 */
@Config
export class ModelRouterConfig {
  /** 默认路由策略 */
  @Env('MODEL_ROUTER_STRATEGY', strategySchema)
  defaultStrategy = 'COST_FIRST';

  /** 是否优先使用本地模型 */
  @Env('MODEL_ROUTER_LOCAL_FIRST')
  localFirst = true;

  /** 本地模型端点 */
  @Env('OLLAMA_ENDPOINT')
  endpoint = 'http://127.0.0.1:11434';

  /** 本地模型名称 */
  @Env('OLLAMA_MODEL')
  localModel = 'qwen2.5:1.5b';

  /** 本地模型最大 token 数 */
  @Env('OLLAMA_MAX_TOKENS')
  localMaxTokens = 8192;

  /** 请求超时时间（毫秒） */
  @Env('MODEL_REQUEST_TIMEOUT')
  requestTimeout = 30000;

  /** 熔断器配置 */
  @Nested
  circuitBreaker = new CircuitBreakerConfig();

  /** OpenAI 配置 */
  @Nested
  openai = new OpenAIConfig();

  /** Anthropic 配置 */
  @Nested
  anthropic = new AnthropicConfig();

  /** GLM 配置 */
  @Nested
  glm = new GLMConfig();
}
