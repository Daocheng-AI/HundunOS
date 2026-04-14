import { BasePlugin } from '../../core/BasePlugin.js';
import { createServer } from 'http';
import { parse as parseUrl } from 'url';

export class ApiPlugin extends BasePlugin {
  #server = null;
  #routes = new Map();
  #middlewares = [];
  #config = null;
  #isRunning = false;

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

    this.kernel.services.register('api', () => ({
      get: this.get.bind(this),
      post: this.post.bind(this),
      put: this.put.bind(this),
      delete: this.delete.bind(this),
      use: this.use.bind(this),
      start: this.start.bind(this),
      stop: this.stop.bind(this),
      router: this.createRouter.bind(this)
    }), { singleton: true });

    this.logger.info(`API Plugin initialized on ${host}:${port}`);
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
    this.logger.error('API Error:', err.message);

    if (!res.headersSent) {
      res.statusCode = err.statusCode || 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: err.message || 'Internal Server Error',
        code: err.code || 'INTERNAL_ERROR'
      }));
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
