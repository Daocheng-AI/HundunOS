import { BasePlugin } from '../../core/BasePlugin.js';
import { createServer } from 'http';
import { parse as parseUrl } from 'url';

export class ApiPlugin extends BasePlugin {
  #server = null;
  #routes = new Map();
  #middlewares = [];
  #config = null;
  #isRunning = false;
  #apiKeys = new Map(); // In-memory API key store

  get name() {
    return 'api';
  }

  get version() {
    return '2.0.0';
  }

  get dependencies() {
    return ['logger', 'config', 'security', 'events'];
  }

  async onInit() {
    this.#config = this.kernel.get('config');
    this.security = this.kernel.get('security');
    this.events = this.kernel.get('events');

    const port = this.#config.get('api.port', 3000);
    const host = this.#config.get('api.host', '0.0.0.0');

    this.#server = createServer(this.#handleRequest.bind(this));

    // Register default security middleware
    this.#setupDefaultMiddlewares();

    this.kernel.services.register('api', () => ({
      get: this.get.bind(this),
      post: this.post.bind(this),
      put: this.put.bind(this),
      delete: this.delete.bind(this),
      use: this.use.bind(this),
      start: this.start.bind(this),
      stop: this.stop.bind(this),
      router: this.createRouter.bind(this),
      authenticate: this.authenticate.bind(this),
      registerApiKey: this.registerApiKey.bind(this),
      revokeApiKey: this.revokeApiKey.bind(this)
    }), { singleton: true });

    this.logger.info(`API Plugin initialized on ${host}:${port}`);
  }

  /**
   * Setup default security middlewares
   */
  #setupDefaultMiddlewares() {
    const authEnabled = this.#config.get('api.auth.enabled', true);
    
    if (authEnabled) {
      // Add authentication middleware
      this.use(this.#authMiddleware.bind(this));
    }
  }

  /**
   * Authentication middleware
   */
  async #authMiddleware(context) {
    const { req, res } = context;
    
    // Skip authentication for public paths
    const publicPaths = this.#config.get('api.auth.publicPaths', ['/health', '/status']);
    const url = req.url || '';
    
    if (publicPaths.some(path => url.startsWith(path))) {
      return;
    }

    // Extract API key from header or query
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    
    if (!apiKey) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ 
        error: 'Unauthorized', 
        code: 'MISSING_API_KEY',
        message: 'API key is required. Provide it via X-API-Key header or Authorization: Bearer <key>'
      }));
      throw new Error('Authentication required');
    }

    // Validate API key
    const isValid = await this.#validateApiKey(apiKey);
    
    if (!isValid) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ 
        error: 'Unauthorized', 
        code: 'INVALID_API_KEY',
        message: 'Invalid or revoked API key'
      }));
      throw new Error('Invalid API key');
    }

    // Attach auth info to context
    context.auth = { apiKey };
  }

  /**
   * Validate API key
   */
  async #validateApiKey(key) {
    // Check in-memory store
    if (this.#apiKeys.has(key)) {
      const keyData = this.#apiKeys.get(key);
      
      // Check expiration
      if (keyData.expiresAt && keyData.expiresAt < Date.now()) {
        this.#apiKeys.delete(key);
        return false;
      }
      
      return true;
    }

    // Check config-based keys (for development/simple deployments)
    const configKeys = this.#config.get('api.auth.keys', []);
    if (configKeys.includes(key)) {
      return true;
    }

    return false;
  }

  /**
   * Register a new API key
   * @param {string} key - The API key to register
   * @param {Object} metadata - Key metadata (name, expiresAt, permissions)
   */
  registerApiKey(key, metadata = {}) {
    this.#apiKeys.set(key, {
      name: metadata.name || 'unnamed',
      permissions: metadata.permissions || ['read'],
      createdAt: Date.now(),
      expiresAt: metadata.expiresAt || null,
      lastUsed: null,
      useCount: 0
    });
    this.logger.info(`API key registered: ${metadata.name || 'unnamed'}`);
    return true;
  }

  /**
   * Revoke an API key
   * @param {string} key - The API key to revoke
   */
  revokeApiKey(key) {
    const deleted = this.#apiKeys.delete(key);
    if (deleted) {
      this.logger.info('API key revoked');
    }
    return deleted;
  }

  /**
   * Middleware factory for route-specific authentication
   * @param {string[]} requiredPermissions - Required permissions for the route
   */
  authenticate(requiredPermissions = []) {
    return async (context) => {
      if (!context.auth) {
        context.res.statusCode = 401;
        context.res.end(JSON.stringify({ error: 'Unauthorized' }));
        throw new Error('Authentication required');
      }

      if (requiredPermissions.length > 0) {
        const apiKey = context.auth.apiKey;
        const keyData = this.#apiKeys.get(apiKey);
        
        if (!keyData || !requiredPermissions.every(p => keyData.permissions.includes(p))) {
          context.res.statusCode = 403;
          context.res.end(JSON.stringify({ error: 'Forbidden', code: 'INSUFFICIENT_PERMISSIONS' }));
          throw new Error('Insufficient permissions');
        }
      }
    };
  }

  #handleRequest(req, res) {
    const startTime = Date.now();
    const url = parseUrl(req.url, true);

    const context = {
      req,
      res,
      method: req.method,
      path: url.pathname,
      query: url.query,
      params: {},
      body: null,
      headers: req.headers,
      kernel: this.kernel
    };

    this.#parseBody(req)
      .then(body => {
        context.body = body;
        return this.#runMiddlewares(context);
      })
      .then(() => this.#handleRoute(context))
      .then(() => {
        const duration = Date.now() - startTime;
        this.logger.debug(`${req.method} ${url.pathname} - ${res.statusCode} (${duration}ms)`);
      })
      .catch(err => {
        this.#handleError(err, context);
      });
  }

  #parseBody(req) {
    return new Promise((resolve, reject) => {
      if (req.method === 'GET' || req.method === 'HEAD') {
        return resolve(null);
      }

      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const contentType = req.headers['content-type'] || '';
          if (contentType.includes('application/json')) {
            resolve(body ? JSON.parse(body) : {});
          } else {
            resolve(body);
          }
        } catch (err) {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  async #runMiddlewares(context) {
    for (const middleware of this.#middlewares) {
      await middleware(context);
    }
  }

  async #handleRoute(context) {
    const { req, res, method, path } = context;

    const routeKey = `${method}:${path}`;
    const route = this.#routes.get(routeKey);

    if (!route) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Not Found' }));
      return;
    }

    try {
      const result = await route.handler(context);
      if (!res.headersSent) {
        res.statusCode = route.statusCode || 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));
      }
    } catch (err) {
      throw err;
    }
  }

  #handleError(err, context) {
    const { res } = context;
    const env = this.#config.get('environment', 'development');
    
    // Log full error details internally
    this.logger.error('API Error:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
      statusCode: err.statusCode,
      path: context.req?.url
    });

    if (!res.headersSent) {
      // Determine status code
      let statusCode = 500;
      let errorMessage = 'Internal Server Error';
      let errorCode = 'INTERNAL_ERROR';
      let errorDetails = null;

      // Client errors (4xx)
      if (err.statusCode >= 400 && err.statusCode < 500) {
        statusCode = err.statusCode;
        errorMessage = err.message || 'Bad Request';
        errorCode = err.code || 'CLIENT_ERROR';
      } 
      // Client errors without statusCode but with specific codes
      else if (err.code === 'MISSING_API_KEY' || err.code === 'INVALID_API_KEY') {
        statusCode = 401;
        errorMessage = 'Unauthorized';
        errorCode = err.code;
      }
      // Authentication middleware error
      else if (err.message === 'Authentication required' || err.message === 'Invalid API key') {
        // Already handled by auth middleware
        return;
      }

      // Development mode: include stack trace and details
      if (env === 'development') {
        errorDetails = {
          stack: err.stack,
          originalMessage: err.message
        };
      }

      res.statusCode = statusCode;
      res.setHeader('Content-Type', 'application/json');
      
      const response = {
        success: false,
        error: errorMessage,
        code: errorCode,
        timestamp: new Date().toISOString(),
        ...(errorDetails && { details: errorDetails })
      };
      
      res.end(JSON.stringify(response));
    }

    this.events.emit('api:error', { error: err, context });
  }

  get(path, handler) {
    this.#registerRoute('GET', path, handler);
    return this;
  }

  post(path, handler) {
    this.#registerRoute('POST', path, handler);
    return this;
  }

  put(path, handler) {
    this.#registerRoute('PUT', path, handler);
    return this;
  }

  delete(path, handler) {
    this.#registerRoute('DELETE', path, handler);
    return this;
  }

  #registerRoute(method, path, handler) {
    const routeKey = `${method}:${path}`;
    this.#routes.set(routeKey, { handler, statusCode: 200 });
  }

  use(middleware) {
    this.#middlewares.push(middleware);
    return this;
  }

  createRouter(basePath) {
    const router = {
      get: (path, handler) => {
        this.get(`${basePath}${path}`, handler);
        return router;
      },
      post: (path, handler) => {
        this.post(`${basePath}${path}`, handler);
        return router;
      },
      put: (path, handler) => {
        this.put(`${basePath}${path}`, handler);
        return router;
      },
      delete: (path, handler) => {
        this.delete(`${basePath}${path}`, handler);
        return router;
      }
    };
    return router;
  }

  async start() {
    if (this.#isRunning) {
      this.logger.warn('API server is already running');
      return;
    }

    const port = this.#config.get('api.port', 3000);
    const host = this.#config.get('api.host', '0.0.0.0');

    return new Promise((resolve, reject) => {
      this.#server.listen(port, host, () => {
        this.#isRunning = true;
        this.logger.info(`API server started on ${host}:${port}`);
        this.events.emit('api:started', { host, port });
        resolve();
      });

      this.#server.on('error', reject);
    });
  }

  async stop() {
    if (!this.#isRunning) {
      return;
    }

    return new Promise((resolve) => {
      this.#server.close(() => {
        this.#isRunning = false;
        this.logger.info('API server stopped');
        this.events.emit('api:stopped');
        resolve();
      });
    });
  }

  async onDestroy() {
    await this.stop();
  }
}
