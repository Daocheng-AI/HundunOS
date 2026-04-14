/**
 * HundunOS Agent SDK - 安全护栏
 * 基于 n8n Agents SDK 设计，提供输入/输出内容过滤和安全检查
 */

import { z } from 'zod';

/**
 * 护栏检查结果
 */
export class GuardrailCheckResult {
  constructor(allowed, reason = null, metadata = {}) {
    this.allowed = allowed;
    this.reason = reason;
    this.metadata = metadata;
  }

  /**
   * 创建允许的结果
   */
  static allowed() {
    return new GuardrailCheckResult(true);
  }

  /**
   * 创建拒绝的结果
   */
  static blocked(reason, metadata = {}) {
    return new GuardrailCheckResult(false, reason, metadata);
  }

  /**
   * 转换为 JSON
   */
  toJSON() {
    return {
      allowed: this.allowed,
      reason: this.reason,
      metadata: this.metadata
    };
  }
}

/**
 * 护栏类型
 */
export const GuardrailType = {
  INPUT: 'input',
  OUTPUT: 'output',
  BOTH: 'both'
};

/**
 * 关键词护栏
 */
export class KeywordGuardrail {
  constructor(config = {}) {
    this.type = config.type || GuardrailType.BOTH;
    this.blockedKeywords = config.blockedKeywords || [];
    this.caseSensitive = config.caseSensitive || false;
    this.matchWholeWord = config.matchWholeWord || false;
    this.blockedPatterns = config.blockedPatterns || [];
  }

  /**
   * 检查内容
   */
  check(content) {
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    const checkText = this.caseSensitive ? text : text.toLowerCase();

    // 检查关键词
    for (const keyword of this.blockedKeywords) {
      const checkKeyword = this.caseSensitive ? keyword : keyword.toLowerCase();
      
      if (this.matchWholeWord) {
        const pattern = new RegExp(`\\b${this.escapeRegex(checkKeyword)}\\b`, this.caseSensitive ? '' : 'i');
        if (pattern.test(checkText)) {
          return GuardrailCheckResult.blocked(
            `Blocked keyword detected: ${keyword}`,
            { keyword, type: 'keyword' }
          );
        }
      } else {
        if (checkText.includes(checkKeyword)) {
          return GuardrailCheckResult.blocked(
            `Blocked keyword detected: ${keyword}`,
            { keyword, type: 'keyword' }
          );
        }
      }
    }

    // 检查正则表达式模式
    for (const pattern of this.blockedPatterns) {
      try {
        const regex = new RegExp(pattern, this.caseSensitive ? '' : 'i');
        if (regex.test(text)) {
          return GuardrailCheckResult.blocked(
            `Blocked pattern detected`,
            { pattern, type: 'pattern' }
          );
        }
      } catch (error) {
        // 忽略无效的正则表达式
      }
    }

    return GuardrailCheckResult.allowed();
  }

  /**
   * 转义正则表达式特殊字符
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 添加阻塞关键词
   */
  addBlockedKeyword(keyword) {
    this.blockedKeywords.push(keyword);
    return this;
  }

  /**
   * 添加阻塞模式
   */
  addBlockedPattern(pattern) {
    this.blockedPatterns.push(pattern);
    return this;
  }

  /**
   * 设置大小写敏感
   */
  setCaseSensitive(value = true) {
    this.caseSensitive = value;
    return this;
  }

  /**
   * 设置全词匹配
   */
  setMatchWholeWord(value = true) {
    this.matchWholeWord = value;
    return this;
  }
}

/**
 * 长度护栏
 */
export class LengthGuardrail {
  constructor(config = {}) {
    this.type = config.type || GuardrailType.BOTH;
    this.minLength = config.minLength || 0;
    this.maxLength = config.maxLength || Infinity;
  }

  /**
   * 检查内容长度
   */
  check(content) {
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    const length = text.length;

    if (length < this.minLength) {
      return GuardrailCheckResult.blocked(
        `Content too short: ${length} characters (minimum: ${this.minLength})`,
        { length, minLength: this.minLength, type: 'min_length' }
      );
    }

    if (length > this.maxLength) {
      return GuardrailCheckResult.blocked(
        `Content too long: ${length} characters (maximum: ${this.maxLength})`,
        { length, maxLength: this.maxLength, type: 'max_length' }
      );
    }

    return GuardrailCheckResult.allowed();
  }

  /**
   * 设置最小长度
   */
  setMinLength(length) {
    this.minLength = length;
    return this;
  }

  /**
   * 设置最大长度
   */
  setMaxLength(length) {
    this.maxLength = length;
    return this;
  }
}

/**
 * Schema 护栏
 */
export class SchemaGuardrail {
  constructor(schema, config = {}) {
    this.type = config.type || GuardrailType.BOTH;
    this.schema = schema;
    this.strict = config.strict || false;
  }

  /**
   * 检查内容是否符合 Schema
   */
  check(content) {
    try {
      const result = this.schema.safeParse(content, {
        strict: this.strict
      });

      if (result.success) {
        return GuardrailCheckResult.allowed();
      } else {
        if (result.error && result.error.errors) {
          const errors = result.error.errors.map(err => {
            const path = err.path.length > 0 ? err.path.join('.') : 'root';
            return `${path}: ${err.message}`;
          });
          return GuardrailCheckResult.blocked(
            `Schema validation failed: ${errors.join('; ')}`,
            { errors, type: 'schema' }
          );
        } else {
          return GuardrailCheckResult.blocked(
            'Schema validation failed',
            { type: 'schema' }
          );
        }
      }
    } catch (error) {
      return GuardrailCheckResult.blocked(
        `Schema validation error: ${error instanceof Error ? error.message : String(error)}`,
        { type: 'schema_error' }
      );
    }
  }

  /**
   * 设置严格模式
   */
  setStrict(value = true) {
    this.strict = value;
    return this;
  }
}

/**
 * 自定义护栏
 */
export class CustomGuardrail {
  constructor(checkFn, config = {}) {
    this.type = config.type || GuardrailType.BOTH;
    this.checkFn = checkFn;
    this.name = config.name || 'custom';
  }

  /**
   * 执行自定义检查
   */
  async check(content, context = {}) {
    try {
      const result = await this.checkFn(content, context);
      
      if (typeof result === 'boolean') {
        return result ? GuardrailCheckResult.allowed() : GuardrailCheckResult.blocked('Blocked by custom guardrail');
      } else if (result instanceof GuardrailCheckResult) {
        return result;
      } else {
        return GuardrailCheckResult.blocked('Invalid custom guardrail result');
      }
    } catch (error) {
      return GuardrailCheckResult.blocked(
        `Custom guardrail error: ${error instanceof Error ? error.message : String(error)}`,
        { name: this.name }
      );
    }
  }
}

/**
 * 护栏管理器
 */
export class GuardrailManager {
  constructor(config = {}) {
    this.inputGuardrails = [];
    this.outputGuardrails = [];
    this.stopOnFirstBlock = config.stopOnFirstBlock !== undefined ? config.stopOnFirstBlock : true;
  }

  /**
   * 添加输入护栏
   */
  addInputGuardrail(guardrail) {
    this.inputGuardrails.push(guardrail);
    return this;
  }

  /**
   * 添加输出护栏
   */
  addOutputGuardrail(guardrail) {
    this.outputGuardrails.push(guardrail);
    return this;
  }

  /**
   * 添加护栏（根据类型）
   */
  addGuardrail(guardrail) {
    if (guardrail.type === GuardrailType.INPUT || guardrail.type === GuardrailType.BOTH) {
      this.inputGuardrails.push(guardrail);
    }
    if (guardrail.type === GuardrailType.OUTPUT || guardrail.type === GuardrailType.BOTH) {
      this.outputGuardrails.push(guardrail);
    }
    return this;
  }

  /**
   * 检查输入
   */
  async checkInput(content, context = {}) {
    return this._checkGuardrails(this.inputGuardrails, content, context, 'input');
  }

  /**
   * 检查输出
   */
  async checkOutput(content, context = {}) {
    return this._checkGuardrails(this.outputGuardrails, content, context, 'output');
  }

  /**
   * 执行护栏检查
   */
  async _checkGuardrails(guardrails, content, context, type) {
    const results = [];

    for (const guardrail of guardrails) {
      const result = await guardrail.check(content, context);
      results.push(result);

      if (!result.allowed && this.stopOnFirstBlock) {
        return {
          allowed: false,
          results,
          blockedBy: guardrail.constructor.name,
          reason: result.reason
        };
      }
    }

    const allAllowed = results.every(r => r.allowed);
    
    return {
      allowed: allAllowed,
      results,
      blockedBy: allAllowed ? null : results.find(r => !r.allowed)?.metadata?.type || 'unknown',
      reason: allAllowed ? null : results.find(r => !r.allowed)?.reason
    };
  }

  /**
   * 设置是否在第一次阻塞时停止
   */
  setStopOnFirstBlock(value = true) {
    this.stopOnFirstBlock = value;
    return this;
  }

  /**
   * 获取输入护栏数量
   */
  getInputGuardrailCount() {
    return this.inputGuardrails.length;
  }

  /**
   * 获取输出护栏数量
   */
  getOutputGuardrailCount() {
    return this.outputGuardrails.length;
  }

  /**
   * 清空所有护栏
   */
  clear() {
    this.inputGuardrails = [];
    this.outputGuardrails = [];
    return this;
  }
}

/**
 * 预定义的安全护栏
 */
export const SecurityGuardrails = {
  /**
   * 创建内容安全护栏
   */
  createContentSafetyGuardrail() {
    return new KeywordGuardrail({
      type: GuardrailType.BOTH,
      blockedKeywords: [
        'malware',
        'virus',
        'trojan',
        'ransomware',
        'phishing',
        'exploit',
        'backdoor',
        'rootkit',
        'keylogger',
        'spyware'
      ],
      matchWholeWord: true,
      caseSensitive: false
    });
  },

  /**
   * 创建个人数据护栏
   */
  createPersonalDataGuardrail() {
    return new KeywordGuardrail({
      type: GuardrailType.OUTPUT,
      blockedPatterns: [
        '\\b\\d{3}-\\d{2}-\\d{4}\\b', // SSN pattern
        '\\b\\d{16}\\b', // Credit card pattern
        '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b' // Email pattern
      ],
      caseSensitive: false
    });
  },

  /**
   * 创建输入长度护栏
   */
  createInputLengthGuardrail(maxLength = 10000) {
    return new LengthGuardrail({
      type: GuardrailType.INPUT,
      maxLength
    });
  },

  /**
   * 创建输出长度护栏
   */
  createOutputLengthGuardrail(maxLength = 50000) {
    return new LengthGuardrail({
      type: GuardrailType.OUTPUT,
      maxLength
    });
  }
};

/**
 * 创建护栏管理器的便捷函数
 */
export function createGuardrailManager(config = {}) {
  return new GuardrailManager(config);
}

/**
 * 创建关键词护栏的便捷函数
 */
export function createKeywordGuardrail(config = {}) {
  return new KeywordGuardrail(config);
}

/**
 * 创建长度护栏的便捷函数
 */
export function createLengthGuardrail(config = {}) {
  return new LengthGuardrail(config);
}

/**
 * 创建 Schema 护栏的便捷函数
 */
export function createSchemaGuardrail(schema, config = {}) {
  return new SchemaGuardrail(schema, config);
}

/**
 * 创建自定义护栏的便捷函数
 */
export function createCustomGuardrail(checkFn, config = {}) {
  return new CustomGuardrail(checkFn, config);
}
