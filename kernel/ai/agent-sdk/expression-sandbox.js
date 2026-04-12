/**
 * HundunOS Agent SDK - 表达式沙箱化
 * 基于 n8n 表达式沙箱设计，提供安全的表达式执行环境
 */

/**
 * 表达式执行结果
 */
export class ExpressionResult {
  constructor(success, value, error = null, metadata = {}) {
    this.success = success;
    this.value = value;
    this.error = error;
    this.metadata = metadata;
  }

  /**
   * 创建成功结果
   */
  static success(value, metadata = {}) {
    return new ExpressionResult(true, value, null, metadata);
  }

  /**
   * 创建失败结果
   */
  static failure(error, metadata = {}) {
    return new ExpressionResult(false, null, error, metadata);
  }

  /**
   * 转换为 JSON
   */
  toJSON() {
    return {
      success: this.success,
      value: this.value,
      error: this.error,
      metadata: this.metadata
    };
  }
}

/**
 * 沙箱配置
 */
export class SandboxConfig {
  constructor() {
    this.timeout = 5000; // 默认 5 秒超时
    this.memoryLimit = 64 * 1024 * 1024; // 默认 64MB 内存限制
    this.allowConsole = false;
    this.allowRequire = false;
    this.allowedGlobals = [];
    this.customContext = {};
  }

  /**
   * 设置超时
   */
  setTimeout(timeout) {
    this.timeout = timeout;
    return this;
  }

  /**
   * 设置内存限制
   */
  setMemoryLimit(limit) {
    this.memoryLimit = limit;
    return this;
  }

  /**
   * 允许控制台输出
   */
  allowConsoleLog(allow = true) {
    this.allowConsole = allow;
    return this;
  }

  /**
   * 允许 require
   */
  allowRequireModule(allow = true) {
    this.allowRequire = allow;
    return this;
  }

  /**
   * 添加允许的全局变量
   */
  addAllowedGlobal(name) {
    this.allowedGlobals.push(name);
    return this;
  }

  /**
   * 添加自定义上下文
   */
  addContext(key, value) {
    this.customContext[key] = value;
    return this;
  }

  /**
   * 设置自定义上下文
   */
  setContext(context) {
    this.customContext = { ...this.customContext, ...context };
    return this;
  }
}

/**
 * 表达式解析器
 */
export class ExpressionParser {
  constructor() {
    this.variablePattern = /\{\{([^}]+)\}\}/g;
    this.functionPattern = /([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/g;
  }

  /**
   * 解析表达式中的变量
   */
  parseVariables(expression) {
    const variables = [];
    let match;

    while ((match = this.variablePattern.exec(expression)) !== null) {
      variables.push(match[1].trim());
    }

    return [...new Set(variables)]; // 去重
  }

  /**
   * 解析表达式中的函数调用
   */
  parseFunctions(expression) {
    const functions = [];
    let match;

    while ((match = this.functionPattern.exec(expression)) !== null) {
      functions.push({
        name: match[1],
        args: match[2].split(',').map(arg => arg.trim())
      });
    }

    return [...new Set(functions.map(f => f.name))]; // 去重返回函数名
  }

  /**
   * 检查表达式是否安全
   */
  isSafe(expression) {
    const dangerousPatterns = [
      /\beval\s*\(/,
      /\bFunction\s*\(/,
      /\brequire\s*\(/,
      /\bimport\s*\(/,
      /\bprocess\s*\./,
      /\b__dirname\b/,
      /\b__filename\b/,
      /\bglobal\b/,
      /\bwindow\b/,
      /\bdocument\b/,
      /\bXMLHttpRequest\b/,
      /\bfetch\s*\(/,
      /\.prototype\b/,
      /\[.*\]\s*=/ // 属性访问赋值
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(expression)) {
        return {
          safe: false,
          reason: `Potentially dangerous pattern detected: ${pattern.source}`
        };
      }
    }

    return { safe: true };
  }

  /**
   * 预处理表达式
   */
  preprocess(expression) {
    // 移除注释
    let processed = expression.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

    // 标准化空白字符
    processed = processed.replace(/\s+/g, ' ').trim();

    return processed;
  }

  /**
   * 提取表达式类型
   */
  getExpressionType(expression) {
    if (this.variablePattern.test(expression)) {
      return 'template';
    } else if (this.functionPattern.test(expression)) {
      return 'function';
    } else if (/^\s*\{[\s\S]*\}\s*$/.test(expression)) {
      return 'object';
    } else if (/^\s*\[[\s\S]*\]\s*$/.test(expression)) {
      return 'array';
    } else if (/^\s*\d+\.?\d*\s*$/.test(expression)) {
      return 'number';
    } else if (/^\s*['"].*['"]\s*$/.test(expression)) {
      return 'string';
    } else if (/^\s*(true|false)\s*$/i.test(expression)) {
      return 'boolean';
    } else {
      return 'expression';
    }
  }
}

/**
 * 表达式沙箱
 */
export class ExpressionSandbox {
  constructor(config = new SandboxConfig()) {
    this.config = config;
    this.parser = new ExpressionParser();
    this.executionCount = 0;
    this.errorCount = 0;
  }

  /**
   * 执行表达式
   */
  async execute(expression, context = {}) {
    const startTime = Date.now();
    this.executionCount++;

    try {
      // 预处理表达式
      const processedExpression = this.parser.preprocess(expression);

      // 安全检查
      const safetyCheck = this.parser.isSafe(processedExpression);
      if (!safetyCheck.safe) {
        this.errorCount++;
        return ExpressionResult.failure(
          `Security violation: ${safetyCheck.reason}`,
          { type: 'security_violation' }
        );
      }

      // 合并上下文
      const mergedContext = {
        ...this.config.customContext,
        ...context
      };

      // 执行表达式
      const result = await this._executeInSandbox(
        processedExpression,
        mergedContext
      );

      const duration = Date.now() - startTime;

      return ExpressionResult.success(result, {
        duration,
        type: this.parser.getExpressionType(processedExpression)
      });

    } catch (error) {
      this.errorCount++;
      const duration = Date.now() - startTime;

      return ExpressionResult.failure(
        error instanceof Error ? error.message : String(error),
        {
          duration,
          type: 'execution_error'
        }
      );
    }
  }

  /**
   * 在沙箱中执行表达式
   */
  async _executeInSandbox(expression, context) {
    return new Promise((resolve, reject) => {
      // 设置超时
      const timeoutId = setTimeout(() => {
        reject(new Error(`Expression execution timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);

      try {
        // 创建安全的执行上下文
        const sandbox = this._createSandbox(context);

        // 使用 Function 构造器创建隔离的执行环境
        // 注意：这不是真正的沙箱，生产环境应该使用 vm2 或类似的沙箱库
        const keys = Object.keys(sandbox);
        const values = Object.values(sandbox);

        // 创建函数并执行
        const func = new Function(...keys, `return ${expression}`);
        const result = func(...values);

        // 处理 Promise 结果
        if (result instanceof Promise) {
          result
            .then(res => {
              clearTimeout(timeoutId);
              resolve(res);
            })
            .catch(err => {
              clearTimeout(timeoutId);
              reject(err);
            });
        } else {
          clearTimeout(timeoutId);
          resolve(result);
        }

      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * 创建沙箱上下文
   */
  _createSandbox(context) {
    const sandbox = {
      // 基础数学函数
      Math: {
        abs: Math.abs,
        ceil: Math.ceil,
        floor: Math.floor,
        round: Math.round,
        max: Math.max,
        min: Math.min,
        random: Math.random,
        pow: Math.pow,
        sqrt: Math.sqrt
      },

      // 字符串工具
      String: {
        length: (str) => String(str).length,
        toUpperCase: (str) => String(str).toUpperCase(),
        toLowerCase: (str) => String(str).toLowerCase(),
        trim: (str) => String(str).trim(),
        split: (str, sep) => String(str).split(sep),
        replace: (str, pattern, replacement) => String(str).replace(pattern, replacement),
        substring: (str, start, end) => String(str).substring(start, end)
      },

      // 数组工具
      Array: {
        length: (arr) => Array.isArray(arr) ? arr.length : 0,
        join: (arr, sep) => Array.isArray(arr) ? arr.join(sep) : '',
        slice: (arr, start, end) => Array.isArray(arr) ? arr.slice(start, end) : [],
        push: (arr, item) => Array.isArray(arr) ? arr.push(item) : 0,
        pop: (arr) => Array.isArray(arr) ? arr.pop() : undefined
      },

      // 日期工具
      Date: {
        now: Date.now,
        parse: Date.parse,
        format: (date, format) => {
          // 简化的日期格式化
          const d = new Date(date);
          return d.toISOString();
        }
      },

      // JSON 工具
      JSON: {
        stringify: JSON.stringify,
        parse: JSON.parse
      },

      // 逻辑工具
      Logic: {
        if: (condition, thenValue, elseValue) => condition ? thenValue : elseValue,
        and: (...args) => args.every(arg => Boolean(arg)),
        or: (...args) => args.some(arg => Boolean(arg)),
        not: (value) => !Boolean(value)
      },

      // 类型检查
      Type: {
        isString: (value) => typeof value === 'string',
        isNumber: (value) => typeof value === 'number',
        isBoolean: (value) => typeof value === 'boolean',
        isArray: (value) => Array.isArray(value),
        isObject: (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
        isNull: (value) => value === null,
        isUndefined: (value) => value === undefined
      },

      // 控制台（如果允许）
      ...(this.config.allowConsole ? {
        console: {
          log: (...args) => console.log('[Sandbox]', ...args),
          error: (...args) => console.error('[Sandbox]', ...args),
          warn: (...args) => console.warn('[Sandbox]', ...args)
        }
      } : {}),

      // 添加允许的全局变量
      ...this.config.allowedGlobals.reduce((acc, name) => {
        if (typeof globalThis[name] !== 'undefined') {
          acc[name] = globalThis[name];
        }
        return acc;
      }, {}),

      // 添加自定义上下文
      ...context
    };

    return sandbox;
  }

  /**
   * 批量执行表达式
   */
  async executeBatch(expressions, context = {}) {
    const results = [];

    for (const expr of expressions) {
      const result = await this.execute(expr, context);
      results.push(result);
    }

    return results;
  }

  /**
   * 获取执行统计
   */
  getStats() {
    return {
      totalExecutions: this.executionCount,
      totalErrors: this.errorCount,
      successRate: this.executionCount > 0
        ? ((this.executionCount - this.errorCount) / this.executionCount * 100).toFixed(2)
        : '0.00'
    };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.executionCount = 0;
    this.errorCount = 0;
  }
}

/**
 * 类型验证器
 */
export class TypeValidator {
  /**
   * 验证值是否为指定类型
   */
  validate(value, expectedType) {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      case 'null':
        return value === null;
      case 'undefined':
        return value === undefined;
      case 'any':
        return true;
      default:
        return false;
    }
  }

  /**
   * 强制类型转换
   */
  coerce(value, targetType) {
    switch (targetType) {
      case 'string':
        return String(value);
      case 'number':
        return Number(value);
      case 'boolean':
        return Boolean(value);
      case 'object':
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch {
            return null;
          }
        }
        return value;
      default:
        return value;
    }
  }

  /**
   * 获取值的类型
   */
  getType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }
}

/**
 * 创建沙箱配置的便捷函数
 */
export function createSandboxConfig() {
  return new SandboxConfig();
}

/**
 * 创建表达式沙箱的便捷函数
 */
export function createExpressionSandbox(config) {
  return new ExpressionSandbox(config);
}