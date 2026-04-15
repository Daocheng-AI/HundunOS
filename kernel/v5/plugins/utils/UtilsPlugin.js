import { BasePlugin } from '../../core/BasePlugin.js';
import { RateLimiter, rateLimitPresets } from '../../../rate-limiter.js';
import { XSSFilter, SQLInjectionDetector, PathWhitelistChecker, WAFManager } from '../../../waf.js';
import { validatePath, PROTECTED_PATHS, DANGEROUS_EXTENSIONS } from '../../../path-validation.js';
import { createHash, randomBytes } from 'crypto';

/**
 * UtilsPlugin - 统一工具模块插件
 * 将 waf.js、rate-limiter.js、path-validation.js 等工具模块纳入插件系统
 */
export class UtilsPlugin extends BasePlugin {
  #rateLimiters = new Map();
  #wafInstances = new Map();
  #config = null;

  get name() {
    return 'utils';
  }

  get version() {
    return '2.0.0';
  }

  get dependencies() {
    return ['logger', 'config'];
  }

  async onInit() {
    this.#config = this.kernel.get('config');
    
    this.#registerUtilityServices();
    
    this.logger.info('UtilsPlugin initialized with WAF, RateLimiter, PathValidation');
  }

  #registerUtilityServices() {
    // Rate Limiter Service
    this.kernel.services.register('utils.rateLimiter', () => ({
      create: this.createRateLimiter.bind(this),
      get: this.getRateLimiter.bind(this),
      presets: rateLimitPresets,
      middleware: (name) => {
        const limiter = this.getRateLimiter(name);
        return limiter ? limiter.middleware() : null;
      }
    }), { singleton: true });

    // WAF Service
    this.kernel.services.register('utils.waf', () => ({
      create: this.createWAF.bind(this),
      get: this.getWAF.bind(this),
      filter: (input, instanceName = 'default') => {
        const waf = this.getWAF(instanceName);
        return waf ? waf.filterInput(input) : input;
      },
      detectSQL: (input, instanceName = 'default') => {
        const waf = this.getWAF(instanceName);
        return waf ? waf.detectSQLInjection(input) : { detected: false };
      },
      checkPath: (path, instanceName = 'default') => {
        const waf = this.getWAF(instanceName);
        return waf ? waf.checkPathWhitelist(path) : { allowed: true };
      }
    }), { singleton: true });

    // Path Validation Service
    this.kernel.services.register('utils.pathValidator', () => ({
      validate: (filePath, workspaceRoot) => validatePath(filePath, workspaceRoot),
      isProtected: (path) => {
        const normalized = path.toLowerCase();
        return PROTECTED_PATHS.some(protected => normalized.includes(protected.toLowerCase()));
      },
      isDangerousExtension: (ext) => DANGEROUS_EXTENSIONS.includes(ext.toLowerCase()),
      protectedPaths: PROTECTED_PATHS,
      dangerousExtensions: DANGEROUS_EXTENSIONS
    }), { singleton: true });

    // Crypto Utilities
    this.kernel.services.register('utils.crypto', () => ({
      sha256: (data) => createHash('sha256').update(data).digest('hex'),
      sha512: (data) => createHash('sha512').update(data).digest('hex'),
      randomBytes: (size) => randomBytes(size).toString('hex'),
      randomString: (length = 32) => randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length)
    }), { singleton: true });

    // String Sanitization Service
    this.kernel.services.register('utils.sanitize', () => ({
      xss: (input) => {
        const filter = new XSSFilter();
        return filter.filter(input);
      },
      xssObject: (obj) => {
        const filter = new XSSFilter();
        return filter.filterObject(obj);
      },
      sqlDetect: (input) => {
        const detector = new SQLInjectionDetector();
        return detector.detect(input);
      },
      sqlDetectObject: (obj) => {
        const detector = new SQLInjectionDetector();
        return detector.detectObject(obj);
      }
    }), { singleton: true });
  }

  /**
   * Create a named rate limiter instance
   * @param {string} name - Limiter name
   * @param {Object} options - RateLimiter options
   * @returns {RateLimiter} - The created limiter
   */
  createRateLimiter(name, options = {}) {
    const limiter = new RateLimiter({
      ...rateLimitPresets.default,
      ...options
    });
    this.#rateLimiters.set(name, limiter);
    this.logger.debug(`Rate limiter created: ${name}`);
    return limiter;
  }

  /**
   * Get a rate limiter by name
   * @param {string} name - Limiter name
   * @returns {RateLimiter|null} - The limiter instance
   */
  getRateLimiter(name) {
    return this.#rateLimiters.get(name) || null;
  }

  /**
   * Create a named WAF instance
   * @param {string} name - WAF instance name
   * @param {Object} options - WAF options
   * @returns {WAFManager} - The created WAF
   */
  createWAF(name, options = {}) {
    const waf = new WAFManager(this.kernel, options);
    this.#wafInstances.set(name, waf);
    this.logger.debug(`WAF instance created: ${name}`);
    return waf;
  }

  /**
   * Get a WAF instance by name
   * @param {string} name - WAF instance name
   * @returns {WAFManager|null} - The WAF instance
   */
  getWAF(name) {
    if (!this.#wafInstances.has(name)) {
      // Auto-create default WAF if not exists
      this.createWAF(name, { enabled: true });
    }
    return this.#wafInstances.get(name);
  }

  async onDestroy() {
    // Cleanup rate limiters
    for (const [name, limiter] of this.#rateLimiters) {
      if (typeof limiter.shutdown === 'function') {
        limiter.shutdown();
      }
    }
    this.#rateLimiters.clear();
    this.#wafInstances.clear();
    this.logger.info('UtilsPlugin destroyed');
  }
}
