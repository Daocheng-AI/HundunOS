// hundunos/kernel/config/rest-api.config.js
// REST API 配置类

/**
 * CORS 配置
 */
export class CorsConfig {
  allowedOrigins = ['http://localhost:38080', 'http://127.0.0.1:38080'];
  allowCredentials = false;
  maxAge = 86400;
  allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
  allowedHeaders = ['Content-Type', 'Authorization', 'X-API-Key'];
  constructor() {
    if (process.env.CORS_ALLOWED_ORIGINS) {
      this.allowedOrigins = process.env.CORS_ALLOWED_ORIGINS.split(',').map(s => s.trim());
    }
    if (process.env.CORS_ALLOW_CREDENTIALS === 'true') this.allowCredentials = true;
    const ma = parseInt(process.env.CORS_MAX_AGE, 10);
    if (!isNaN(ma)) this.maxAge = ma;
    if (process.env.CORS_ALLOWED_METHODS) {
      this.allowedMethods = process.env.CORS_ALLOWED_METHODS.split(',').map(s => s.trim());
    }
    if (process.env.CORS_ALLOWED_HEADERS) {
      this.allowedHeaders = process.env.CORS_ALLOWED_HEADERS.split(',').map(s => s.trim());
    }
  }
}

/**
 * REST API 配置类
 */
export class RestApiConfig {
  port = 38080;
  apiKeys = [];
  cors = new CorsConfig();
  rateLimitEnabled = true;
  rateLimitWindow = 60000;
  rateLimitMax = 60;
  rateLimitBurstMax = 10;
  constructor() {
    const p = parseInt(process.env.REST_API_PORT, 10);
    if (!isNaN(p)) this.port = p;
    if (process.env.REST_API_KEYS) {
      this.apiKeys = process.env.REST_API_KEYS.split(',').map(s => s.trim());
    }
    if (process.env.REST_API_RATE_LIMIT_ENABLED === 'false') this.rateLimitEnabled = false;
    const rw = parseInt(process.env.REST_API_RATE_LIMIT_WINDOW, 10);
    if (!isNaN(rw)) this.rateLimitWindow = rw;
    const rm = parseInt(process.env.REST_API_RATE_LIMIT_MAX, 10);
    if (!isNaN(rm)) this.rateLimitMax = rm;
    const rb = parseInt(process.env.REST_API_RATE_LIMIT_BURST_MAX, 10);
    if (!isNaN(rb)) this.rateLimitBurstMax = rb;
  }
}
