/**
 * Supermemory API 客户端
 *
 * 封装 Supermemory API 的 HTTP 调用，提供认证、超时控制、重试机制等功能。
 */

/**
 * Supermemory API 客户端类
 */
export class SupermemoryApiClient {
  /**
   * 创建 API 客户端实例
   * @param {Object} config - Supermemory 配置
   * @param {string} config.apiKey - API 密钥
   * @param {string} config.baseUrl - API 基础 URL
   * @param {Object} config.timeout - 超时配置
   * @param {number} config.timeout.connect - 连接超时（毫秒）
   * @param {number} config.timeout.read - 读取超时（毫秒）
   */
  constructor(config) {
    this.config = config;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.timeout = config.timeout;
  }

  /**
   * 发送 HTTP 请求
   * @param {string} endpoint - API 端点
   * @param {Object} options - 请求选项
   * @param {'GET'|'POST'|'DELETE'|'PATCH'} [options.method='GET'] - HTTP 方法
   * @param {Object} [options.body] - 请求体
   * @param {Object} [options.headers] - 请求头
   * @param {number} [options.timeout] - 超时时间（毫秒）
   * @returns {Promise<Object>} 响应数据
   */
  async request(endpoint, options = {}) {
    const {
      method = 'GET',
      body = null,
      headers = {},
      timeout = this.timeout.read
    } = options;

    const url = `${this.baseUrl}${endpoint}`;

    // 构建请求头
    const requestHeaders = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...headers
    };

    // 构建请求配置
    const fetchOptions = {
      method,
      headers: requestHeaders
    };

    // 添加请求体
    if (body) {
      fetchOptions.body = JSON.stringify(body);
    }

    // 添加超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    fetchOptions.signal = controller.signal;

    try {
      // 记录请求日志
      this.logRequest(method, url, body);

      // 发送请求
      const response = await fetch(url, fetchOptions);

      // 清除超时
      clearTimeout(timeoutId);

      // 记录响应日志
      this.logResponse(method, url, response.status);

      // 处理响应
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw this.createApiError(response.status, response.statusText, errorData);
      }

      // 解析响应体
      const data = await response.json();
      return data;
    } catch (error) {
      // 清除超时
      clearTimeout(timeoutId);

      // 记录错误日志
      this.logError(method, url, error);

      // 重新抛出错误
      throw error;
    }
  }

  /**
   * GET 请求
   * @param {string} endpoint - API 端点
   * @param {Object} [options] - 请求选项
   * @returns {Promise<Object>} 响应数据
   */
  async get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  /**
   * POST 请求
   * @param {string} endpoint - API 端点
   * @param {Object} body - 请求体
   * @param {Object} [options] - 请求选项
   * @returns {Promise<Object>} 响应数据
   */
  async post(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: 'POST', body });
  }

  /**
   * DELETE 请求
   * @param {string} endpoint - API 端点
   * @param {Object} [options] - 请求选项
   * @returns {Promise<Object>} 响应数据
   */
  async delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }

  /**
   * PATCH 请求
   * @param {string} endpoint - API 端点
   * @param {Object} body - 请求体
   * @param {Object} [options] - 请求选项
   * @returns {Promise<Object>} 响应数据
   */
  async patch(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: 'PATCH', body });
  }

  /**
   * 创建 API 错误
   * @param {number} status - HTTP 状态码
   * @param {string} statusText - HTTP 状态文本
   * @param {Object} [data] - 错误数据
   * @returns {Error} API 错误对象
   */
  createApiError(status, statusText, data = {}) {
    const error = new Error(`API error: ${status} ${statusText}`);
    error.status = status;
    error.statusText = statusText;
    error.data = data;

    // 根据状态码设置错误类型
    if (status >= 400 && status < 500) {
      error.code = 'CLIENT_ERROR';
    } else if (status >= 500) {
      error.code = 'SERVER_ERROR';
    }

    return error;
  }

  /**
   * 记录请求日志
   * @param {string} method - HTTP 方法
   * @param {string} url - 请求 URL
   * @param {Object} [body] - 请求体
   */
  logRequest(method, url, body) {
    // 脱敏处理
    const sanitizedUrl = this.sanitizeUrl(url);
    const sanitizedBody = body ? this.sanitizeBody(body) : undefined;

    // console.debug(`[Supermemory API] ${method} ${sanitizedUrl}`, {
      body: sanitizedBody,
      timestamp: Date.now()
    });
  }

  /**
   * 记录响应日志
   * @param {string} method - HTTP 方法
   * @param {string} url - 请求 URL
   * @param {number} status - HTTP 状态码
   */
  logResponse(method, url, status) {
    const sanitizedUrl = this.sanitizeUrl(url);
    // console.debug(`[Supermemory API] ${method} ${sanitizedUrl} - ${status}`, {
      timestamp: Date.now()
    });
  }

  /**
   * 记录错误日志
   * @param {string} method - HTTP 方法
   * @param {string} url - 请求 URL
   * @param {Error} error - 错误对象
   */
  logError(method, url, error) {
    const sanitizedUrl = this.sanitizeUrl(url);
    console.error(`[Supermemory API] ${method} ${sanitizedUrl} - ERROR`, {
      message: error.message,
      code: error.code,
      timestamp: Date.now()
    });
  }

  /**
   * 脱敏 URL（移除 API 密钥）
   * @param {string} url - URL 字符串
   * @returns {string} 脱敏后的 URL
   */
  sanitizeUrl(url) {
    return url.replace(/api_key=([^&]+)/, 'api_key=***');
  }

  /**
   * 脱敏请求体（移除敏感信息）
   * @param {Object} body - 请求体
   * @returns {Object} 脱敏后的请求体
   */
  sanitizeBody(body) {
    const sanitized = { ...body };

    // 脱敏 API 密钥
    if (sanitized.apiKey) {
      sanitized.apiKey = '***';
    }

    // 脱敏密码
    if (sanitized.password) {
      sanitized.password = '***';
    }

    return sanitized;
  }
}
