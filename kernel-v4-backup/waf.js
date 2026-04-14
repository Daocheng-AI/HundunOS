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
 * SQL 注入检测器（上下文感知版）
 * SEC-05 修复：避免对合法 SQL 关键词（教程、文档）产生误报
 * 策略：仅在"动态拼接 SQL" 上下文（模板字符串、字符串拼接）中触发
 */
export class SQLInjectionDetector {
  constructor() {
    // 高风险：直接拼接用户输入到 SQL 字符串
    // 触发条件：用户输入包含 SQL 关键词 + 出现在拼接上下文
    this.dangerousPatterns = [
      // 模板字符串/字符串拼接中的 SQL 关键词（高风险）
      /`[^`]*\$\{[^}]*(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|EXEC|ALTER|CREATE|TRUNCATE)[^}]*\}/i,
      /'[^']*\$\{[^}]*(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|EXEC|ALTER|CREATE|TRUNCATE)[^}]*\}/i,
      // 字符串拼接操作符（+ 或 template literal）包含危险 SQL
      /(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|EXEC|ALTER|CREATE|TRUNCATE)\s*\+/i,
      /\+\s*(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|EXEC|ALTER|CREATE|TRUNCATE)/i,
      // ORM/Query Builder 误用模式：用户输入直接作为列/表名
      /\$\{(?:req|params|body|query|input)[^}]*\}/i,
      // 明显的拼接：`SELECT * FROM ${userTable}` 类危险模式
      /\$\{[^}]*(?:table|column|from|where|order|group)[^}]*\}/i,
    ];

    // 中风险：SQL 注释 + 危险关键词（可能是注入尝试）
    this.suspiciousPatterns = [
      /(--|;|\/\*|\*\/)/,
      /(\bOR\b|\bAND\b)\s+['"].*['"]\s*[=<>]\s*['"].*['"]/i,
    ];
  }

  /**
   * 检测 SQL 注入（上下文感知，仅高风险拼接场景触发）
   * SEC-05 修复：不再对普通文本中的 SQL 关键词误报
   */
  detect(input) {
    const str = String(input);

    // 第一阶段：高风险模式（动态拼接上下文）
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(str)) {
        return { detected: true, level: 'high', pattern: pattern.toString(), reason: 'SQL in dynamic context' };
      }
    }

    // 第二阶段：可疑模式（需要人工审查）
    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(str)) {
        return { detected: true, level: 'medium', pattern: pattern.toString(), reason: 'Suspicious SQL fragment' };
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
