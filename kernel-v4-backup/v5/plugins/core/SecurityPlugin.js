import { BasePlugin } from '../../core/BasePlugin.js';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export class SecurityPlugin extends BasePlugin {
  #config = null;
  #rateLimiters = new Map();
  #sanitizers = new Map();

  get name() {
    return 'security';
  }

  get version() {
    return '2.0.0';
  }

  get dependencies() {
    return ['logger', 'config'];
  }

  async onInit() {
    this.#config = this.kernel.get('config');
    this.#setupDefaultSanitizers();
    this.#registerSecurityServices();
  }

  #setupDefaultSanitizers() {
    this.#sanitizers.set('string', (input) => {
      if (typeof input !== 'string') return '';
      return input
        .replace(/[<>]/g, '')
        .trim()
        .slice(0, 10000);
    });

    this.#sanitizers.set('command', (input) => {
      if (typeof input !== 'string') return '';
      return input
        .replace(/[;&|`$(){}[\]\\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    });

    this.#sanitizers.set('path', (input) => {
      if (typeof input !== 'string') return '';
      const normalized = input
        .replace(/\.\./g, '')
        .replace(/^[\/]+/, '')
        .replace(/\/+/g, '/');
      return normalized;
    });

    this.#sanitizers.set('html', (input) => {
      if (typeof input !== 'string') return '';
      const escapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;'
      };
      return input.replace(/[&<>"'\/]/g, (char) => escapeMap[char]);
    });

    this.#sanitizers.set('json', (input) => {
      try {
        if (typeof input === 'string') {
          return JSON.parse(input);
        }
        return JSON.parse(JSON.stringify(input));
      } catch {
        return null;
      }
    });
  }

  #registerSecurityServices() {
    this.kernel.services.register('security.hash', () => ({
      sha256: (data) => createHash('sha256').update(data).digest('hex'),
      sha512: (data) => createHash('sha512').update(data).digest('hex'),
      randomBytes: (size) => randomBytes(size).toString('hex')
    }), { singleton: true });

    this.kernel.services.register('security.rateLimit', () => ({
      check: this.#checkRateLimit.bind(this),
      reset: this.#resetRateLimit.bind(this)
    }), { singleton: true });

    this.kernel.services.register('security.sanitize', () => ({
      sanitize: this.sanitize.bind(this),
      register: this.registerSanitizer.bind(this)
    }), { singleton: true });

    this.kernel.services.register('security.cors', () => ({
      validateOrigin: this.#validateCorsOrigin.bind(this),
      getHeaders: this.#getCorsHeaders.bind(this)
    }), { singleton: true });
  }

  sanitize(input, type = 'string') {
    const sanitizer = this.#sanitizers.get(type);
    if (!sanitizer) {
      this.logger.warn(`Unknown sanitizer type: ${type}`);
      return input;
    }
    return sanitizer(input);
  }

  registerSanitizer(name, sanitizerFn) {
    if (typeof sanitizerFn !== 'function') {
      throw new Error('Sanitizer must be a function');
    }
    this.#sanitizers.set(name, sanitizerFn);
    this.logger.debug(`Registered sanitizer: ${name}`);
  }

  #checkRateLimit(key, options = {}) {
    const maxRequests = options.maxRequests || 100;
    const windowMs = options.windowMs || 60000;
    const now = Date.now();

    let limiter = this.#rateLimiters.get(key);
    if (!limiter || now > limiter.resetTime) {
      limiter = {
        count: 0,
        resetTime: now + windowMs
      };
      this.#rateLimiters.set(key, limiter);
    }

    if (limiter.count >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: limiter.resetTime
      };
    }

    limiter.count++;

    return {
      allowed: true,
      remaining: maxRequests - limiter.count,
      resetTime: limiter.resetTime
    };
  }

  #resetRateLimit(key) {
    this.#rateLimiters.delete(key);
  }

  #validateCorsOrigin(origin) {
    const allowedOrigins = this.#config.get('security.cors.origins', []);
    
    if (allowedOrigins.includes('*')) {
      this.logger.warn('CORS wildcard detected - not recommended for production');
      return true;
    }

    if (!origin) return false;

    return allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        const regex = new RegExp(allowed.replace(/\*/g, '.*'));
        return regex.test(origin);
      }
      return allowed === origin;
    });
  }

  #getCorsHeaders(origin) {
    const isAllowed = this.#validateCorsOrigin(origin);
    
    if (!isAllowed) {
      return {};
    }

    return {
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400'
    };
  }

  generateToken(length = 32) {
    return randomBytes(length).toString('hex');
  }

  hashPassword(password, salt) {
    if (!salt) {
      salt = randomBytes(16).toString('hex');
    }
    const hash = createHash('sha256')
      .update(password + salt)
      .digest('hex');
    return { hash, salt };
  }

  verifyPassword(password, hash, salt) {
    const computed = createHash('sha256')
      .update(password + salt)
      .digest('hex');
    
    const hashBuf = Buffer.from(hash, 'hex');
    const computedBuf = Buffer.from(computed, 'hex');
    
    if (hashBuf.length !== computedBuf.length) {
      return false;
    }
    
    return timingSafeEqual(hashBuf, computedBuf);
  }

  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  validateInput(input, schema) {
    const errors = [];
    
    for (const [field, rules] of Object.entries(schema)) {
      const value = input[field];
      
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }

      if (value === undefined || value === null) continue;

      if (rules.type && typeof value !== rules.type) {
        errors.push(`${field} must be of type ${rules.type}`);
      }

      if (rules.minLength && value.length < rules.minLength) {
        errors.push(`${field} must be at least ${rules.minLength} characters`);
      }

      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push(`${field} must be at most ${rules.maxLength} characters`);
      }

      if (rules.pattern && !rules.pattern.test(value)) {
        errors.push(`${field} format is invalid`);
      }

      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
      }

      if (rules.custom && typeof rules.custom === 'function') {
        const result = rules.custom(value);
        if (result !== true) {
          errors.push(result || `${field} is invalid`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async onDestroy() {
    this.#rateLimiters.clear();
    this.#sanitizers.clear();
  }
}
