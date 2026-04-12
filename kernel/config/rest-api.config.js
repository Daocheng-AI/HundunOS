// hundunos/kernel/config/rest-api.config.js
// REST API 配置类

import { Config, Env, Nested } from './decorators.js';

/**
 * CORS 配置
 */
@Config
export class CorsConfig {
  /** 允许的源 */
  @Env('CORS_ALLOWED_ORIGINS')
  allowedOrigins = ['http://localhost:38080', 'http://127.0.0.1:38080'];

  /** 是否允许凭证 */
  @Env('CORS_ALLOW_CREDENTIALS')
  allowCredentials = false;

  /** 预检请求缓存时间（秒） */
  @Env('CORS_MAX_AGE')
  maxAge = 86400;

  /** 允许的 HTTP 方法 */
  @Env('CORS_ALLOWED_METHODS')
  allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];

  /** 允许的请求头 */
  @Env('CORS_ALLOWED_HEADERS')
  allowedHeaders = ['Content-Type', 'Authorization', 'X-API-Key'];
}

/**
 * REST API 配置类
 */
@Config
export class RestApiConfig {
  /** API 端口 */
  @Env('REST_API_PORT')
  port = 38080;

  /** API 密钥列表 */
  @Env('REST_API_KEYS')
  apiKeys = [];

  /** CORS 配置 */
  @Nested
  cors = new CorsConfig();

  /** 是否启用速率限制 */
  @Env('REST_API_RATE_LIMIT_ENABLED')
  rateLimitEnabled = true;

  /** 速率限制窗口（毫秒） */
  @Env('REST_API_RATE_LIMIT_WINDOW')
  rateLimitWindow = 60000;

  /** 速率限制最大请求数 */
  @Env('REST_API_RATE_LIMIT_MAX')
  rateLimitMax = 60;

  /** 速率限制突发最大请求数 */
  @Env('REST_API_RATE_LIMIT_BURST_MAX')
  rateLimitBurstMax = 10;
}
