/**
 * HundunOS v4.3 - WAF (Web Application Firewall)
 * 实现输入验证、XSS 防护、SQL 注入防护
 */

import xss from 'xss';

/**
 * XSS 过滤器
 */
export class XSSFilter {
  constructor(options = {}) {
    this.options = {
      whiteList: options.whiteList || {
        a: ['href', 'title', 'target'],
        b: [],
        br: [],
        i: [],
        em: [],
        strong: [],
        p: [],
        div: [],
        span: [],
        pre: [],
        code: [],
      },
      stripIgnoreTag: options.stripIgnoreTag !== false,
      stripIgnoreTagBody: options.stripIgnoreTagBody === true ? '*' : false,
    };
    this.xss = new xss.FilterXSS(this.options);
  }

  /**
   * 过滤 HTML
   */
  filter(html) {
    return this.xss.process(html);
  }

  /**
   * 过滤对象
   */
  filterObject(obj) {
    const result = {};
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        result[key] = this.filter(obj[key]);
      } else if (typeof obj[key] === 'object') {
        result[key] = this.filterObject(obj[key]);
      } else {
        result[key] = obj[key];
      }
    }
    return result;
  }
}

/**
 * SQL 注入检测器
 */
export class SQLInjectionDetector {
  constructor() {
    this.patterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|EXEC|ALTER|CREATE|TRUNCATE)\b)/i,
      /(--|;|\/\*|\*\/)/,
      /(\bOR\b|\bAND\b)\s+\d+\s*=\s*\d+/i,
      /(\bOR\b|\bAND\b)\s+['"].*['"]\s*=\s*['"].*['"]/i,
    ];
  }

  /**
   * 检测 SQL 注入
   */
  detect(input) {
    const str = String(input);
    for (const pattern of this.patterns) {
      if (pattern.test(str)) {
        return { detected: true, pattern: pattern.toString() };
      }
    }
    return { detected: false };
  }

  /**
   * 检测对象
   */
  detectObject(obj) {
    const results = [];
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        const result = this.detect(obj[key]);
        if (result.detected) {
          results.push({ key, ...result });
        }
      } else if (typeof obj[key] === 'object') {
        results.push(...this.detectObject(obj[key]));
      }
    }
    return results;
  }
}

/**
 * 路径白名单检查器
 */
export class PathWhitelistChecker {
  constructor(whitelist = []) {
    this.whitelist = whitelist.map(pattern => {
      const regex = pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      return new RegExp(`^${regex}$`);
    });
  }

  /**
   * 检查路径是否在白名单中
   */
  check(path) {
    for (const pattern of this.whitelist) {
      if (pattern.test(path)) {
        return { allowed: true, pattern: pattern.toString() };
      }
    }
    return { allowed: false };
  }

  /**
   * 添加白名单
   */
  addWhitelist(pattern) {
    const regex = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    this.whitelist.push(new RegExp(`^${regex}$`));
  }
}

/**
 * WAF 管理器
 */
export class WAFManager {
  constructor(kernel, options = {}) {
    this.kernel = kernel;
    this.enabled = options.enabled !== false;
    this.xssFilter = new XSSFilter(options.xss);
    this.sqlDetector = new SQLInjectionDetector();
    this.pathChecker = new PathWhitelistChecker(options.whitelist || []);
  }

  /**
   * 过滤输入
   */
  filterInput(input) {
    if (!this.enabled) return input;
    if (typeof input === 'string') {
      return this.xssFilter.filter(input);
    }
    if (typeof input === 'object') {
      return this.xssFilter.filterObject(input);
    }
    return input;
  }

  /**
   * 检测 SQL 注入
   */
  detectSQLInjection(input) {
    if (!this.enabled) return { detected: false };
    if (typeof input === 'string') {
      return this.sqlDetector.detect(input);
    }
    if (typeof input === 'object') {
      return this.sqlDetector.detectObject(input);
    }
    return { detected: false };
  }

  /**
   * 检查路径白名单
   */
  checkPathWhitelist(path) {
    if (!this.enabled) return { allowed: true };
    return this.pathChecker.check(path);
  }

  /**
   * 添加路径白名单
   */
  addPathWhitelist(pattern) {
    this.pathChecker.addWhitelist(pattern);
  }
}

export default { XSSFilter, SQLInjectionDetector, PathWhitelistChecker, WAFManager };
