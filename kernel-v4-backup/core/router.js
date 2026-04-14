/**
 * HundunOS v4.3 - 高性能路由系统
 * O(1) 静态路由查找，O(m) 动态路由匹配（m为动态路由数量）
 */

import { parse } from 'url';

/**
 * 路由匹配结果
 */
export class RouteMatch {
  constructor(handler, params = {}, middleware = []) {
    this.handler = handler;
    this.params = params;
    this.middleware = middleware;
  }
}

/**
 * 动态路由模式
 */
class RoutePattern {
  constructor(path) {
    this.path = path;
    this.keys = [];
    this.regex = this._compile(path);
  }

  _compile(path) {
    // 转换 :param 为命名捕获组
    const pattern = path
      .replace(/:([^/]+)/g, (match, key) => {
        this.keys.push(key);
        return '(?<${key}>[^/]+)';
      })
      .replace(/\*/g, '.*');
    
    return new RegExp(`^${pattern}$`);
  }

  match(path) {
    const match = path.match(this.regex);
    if (!match) return null;
    
    const params = {};
    this.keys.forEach((key, index) => {
      params[key] = match.groups?.[key] || match[index + 1];
    });
    
    return params;
  }
}

/**
 * 高性能路由器
 */
export class Router {
  constructor(options = {}) {
    this.staticRoutes = new Map();      // 静态路由 O(1)
    this.dynamicRoutes = [];            // 动态路由 O(m)
    this.middleware = [];               // 全局中间件
    this.prefix = options.prefix || '';
    this.caseSensitive = options.caseSensitive !== false;
  }

  /**
   * 注册路由
   * @param {string} method - HTTP方法
   * @param {string} path - 路由路径
   * @param {Function} handler - 处理器
   * @param {Object} options - 配置选项
   */
  register(method, path, handler, options = {}) {
    const fullPath = this._normalizePath(this.prefix + path);
    const key = `${method.toUpperCase()}:${fullPath}`;

    // 检查是否为动态路由
    if (path.includes(':') || path.includes('*')) {
      const pattern = new RoutePattern(fullPath);
      this.dynamicRoutes.push({
        method: method.toUpperCase(),
        pattern,
        handler,
        middleware: options.middleware || [],
      });
    } else {
      // 静态路由
      this.staticRoutes.set(key, {
        handler,
        middleware: options.middleware || [],
      });
    }

    return this;
  }

  /**
   * GET 路由
   */
  get(path, handler, options) {
    return this.register('GET', path, handler, options);
  }

  /**
   * POST 路由
   */
  post(path, handler, options) {
    return this.register('POST', path, handler, options);
  }

  /**
   * PUT 路由
   */
  put(path, handler, options) {
    return this.register('PUT', path, handler, options);
  }

  /**
   * DELETE 路由
   */
  delete(path, handler, options) {
    return this.register('DELETE', path, handler, options);
  }

  /**
   * PATCH 路由
   */
  patch(path, handler, options) {
    return this.register('PATCH', path, handler, options);
  }

  /**
   * 使用中间件
   */
  use(middleware) {
    this.middleware.push(middleware);
    return this;
  }

  /**
   * 路由分组
   */
  group(prefix, callback) {
    const subRouter = new Router({ prefix: this.prefix + prefix });
    callback(subRouter);
    
    // 合并子路由
    for (const [key, route] of subRouter.staticRoutes) {
      this.staticRoutes.set(key, route);
    }
    this.dynamicRoutes.push(...subRouter.dynamicRoutes);
    
    return this;
  }

  /**
   * 解析路由
   * @param {string} method - HTTP方法
   * @param {string} path - 请求路径
   * @returns {RouteMatch|null}
   */
  resolve(method, path) {
    const normalizedPath = this._normalizePath(path);
    const key = `${method.toUpperCase()}:${normalizedPath}`;

    // O(1) 静态路由查找
    if (this.staticRoutes.has(key)) {
      const route = this.staticRoutes.get(key);
      return new RouteMatch(
        route.handler,
        {},
        [...this.middleware, ...route.middleware]
      );
    }

    // O(m) 动态路由匹配
    for (const route of this.dynamicRoutes) {
      if (route.method !== method.toUpperCase()) continue;
      
      const params = route.pattern.match(normalizedPath);
      if (params) {
        return new RouteMatch(
          route.handler,
          params,
          [...this.middleware, ...route.middleware]
        );
      }
    }

    return null;
  }

  /**
   * 创建处理器函数（用于HTTP服务器）
   */
  handler() {
    return async (req, res) => {
      const { pathname } = parse(req.url, true);
      const match = this.resolve(req.method, pathname);

      if (!match) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
        return;
      }

      // 附加路由参数到请求对象
      req.params = match.params;

      try {
        // 执行中间件链
        let index = 0;
        const next = async () => {
          if (index < match.middleware.length) {
            const middleware = match.middleware[index++];
            await middleware(req, res, next);
          } else {
            await match.handler(req, res);
          }
        };

        await next();
      } catch (error) {
        console.error('[Router] Handler error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      }
    };
  }

  /**
   * 获取路由统计
   */
  getStats() {
    return {
      staticRoutes: this.staticRoutes.size,
      dynamicRoutes: this.dynamicRoutes.length,
      totalRoutes: this.staticRoutes.size + this.dynamicRoutes.length,
    };
  }

  /**
   * 标准化路径
   * @private
   */
  _normalizePath(path) {
    // 确保以 / 开头，去除末尾 /
    let normalized = path.startsWith('/') ? path : '/' + path;
    normalized = normalized.endsWith('/') && normalized !== '/' 
      ? normalized.slice(0, -1) 
      : normalized;
    
    if (!this.caseSensitive) {
      normalized = normalized.toLowerCase();
    }
    
    return normalized;
  }
}

// 导出默认路由器实例
export const router = new Router();
export default router;
