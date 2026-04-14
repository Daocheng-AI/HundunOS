/**
 * HundunOS Agent SDK - 结构化输出
 * 基于 n8n Agents SDK 设计，提供类型安全的输出验证和转换
 */

import { z } from 'zod';

/**
 * 验证结果
 */
export class ValidationResult {
  constructor(success, data, errors = []) {
    this.success = success;
    this.data = data;
    this.errors = errors;
  }

  /**
   * 创建成功的验证结果
   */
  static success(data) {
    return new ValidationResult(true, data, []);
  }

  /**
   * 创建失败的验证结果
   */
  static failure(errors) {
    return new ValidationResult(false, null, errors);
  }

  /**
   * 获取第一个错误信息
   */
  getFirstError() {
    return this.errors.length > 0 ? this.errors[0] : null;
  }

  /**
   * 获取所有错误信息
   */
  getAllErrors() {
    return this.errors.join('; ');
  }

  /**
   * 转换为 JSON
   */
  toJSON() {
    return {
      success: this.success,
      data: this.data,
      errors: this.errors
    };
  }
}

/**
 * 结构化输出验证器
 */
export class StructuredOutputValidator {
  constructor(schema) {
    this.schema = schema;
    this.strict = false;
    this.coerce = true;
  }

  /**
   * 设置严格模式
   */
  setStrict(value = true) {
    this.strict = value;
    return this;
  }

  /**
   * 设置类型强制转换
   */
  setCoerce(value = true) {
    this.coerce = value;
    return this;
  }

  /**
   * 验证输出
   */
  validate(output) {
    try {
      // 如果是字符串，尝试解析为 JSON
      let data = output;
      if (typeof output === 'string') {
        try {
          data = JSON.parse(output);
        } catch (parseError) {
          return ValidationResult.failure([
            `Failed to parse output as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`
          ]);
        }
      }

      // 使用 Zod 验证
      const result = this.schema.safeParse(data, {
        strict: this.strict,
        coerce: this.coerce
      });

      if (result.success) {
        return ValidationResult.success(result.data);
      } else {
        const errors = result.error.errors.map(err => {
          const path = err.path.length > 0 ? err.path.join('.') : 'root';
          return `${path}: ${err.message}`;
        });
        return ValidationResult.failure(errors);
      }
    } catch (error) {
      return ValidationResult.failure([
        error instanceof Error ? error.message : String(error)
      ]);
    }
  }

  /**
   * 验证并转换输出
   */
  validateAndTransform(output) {
    const result = this.validate(output);
    
    if (!result.success) {
      return result;
    }

    try {
      // 转换为 JSON 字符串
      const jsonString = JSON.stringify(result.data, null, 2);
      return ValidationResult.success(jsonString);
    } catch (error) {
      return ValidationResult.failure([
        `Failed to transform output: ${error instanceof Error ? error.message : String(error)}`
      ]);
    }
  }

  /**
   * 获取 Schema 的 JSON 表示
   */
  getSchemaJSON() {
    return this.schema;
  }

  /**
   * 获取 Schema 的描述
   */
  getSchemaDescription() {
    try {
      return zodToJsonSchema(this.schema);
    } catch (error) {
      return null;
    }
  }
}

/**
 * 结构化输出生成器
 */
export class StructuredOutputGenerator {
  constructor(schema) {
    this.validator = new StructuredOutputValidator(schema);
    this.examples = [];
    this.instructions = '';
  }

  /**
   * 添加示例
   */
  addExample(input, output) {
    this.examples.push({ input, output });
    return this;
  }

  /**
   * 设置指令
   */
  setInstructions(instructions) {
    this.instructions = instructions;
    return this;
  }

  /**
   * 设置严格模式
   */
  setStrict(value = true) {
    this.validator.setStrict(value);
    return this;
  }

  /**
   * 设置类型强制转换
   */
  setCoerce(value = true) {
    this.validator.setCoerce(value);
    return this;
  }

  /**
   * 生成提示词
   */
  generatePrompt(userInput) {
    const schemaDescription = this.validator.getSchemaDescription();
    
    let prompt = '';
    
    // 添加指令
    if (this.instructions) {
      prompt += `Instructions:\n${this.instructions}\n\n`;
    }
    
    // 添加 Schema 描述
    if (schemaDescription) {
      prompt += `Output Schema:\n${JSON.stringify(schemaDescription, null, 2)}\n\n`;
    }
    
    // 添加示例
    if (this.examples.length > 0) {
      prompt += 'Examples:\n';
      this.examples.forEach((example, index) => {
        prompt += `\nExample ${index + 1}:\n`;
        prompt += `Input: ${JSON.stringify(example.input)}\n`;
        prompt += `Output: ${JSON.stringify(example.output)}\n`;
      });
      prompt += '\n';
    }
    
    // 添加用户输入
    prompt += `Input:\n${JSON.stringify(userInput)}\n\n`;
    prompt += 'Output (must match the schema):\n';
    
    return prompt;
  }

  /**
   * 验证输出
   */
  validate(output) {
    return this.validator.validate(output);
  }

  /**
   * 验证并转换输出
   */
  validateAndTransform(output) {
    return this.validator.validateAndTransform(output);
  }

  /**
   * 获取 Schema
   */
  getSchema() {
    return this.validator.getSchemaJSON();
  }
}

/**
 * 输出解析器
 */
export class OutputParser {
  /**
   * 解析 JSON 字符串
   */
  static parseJSON(str) {
    try {
      return { success: true, data: JSON.parse(str) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 提取 JSON 代码块
   */
  static extractJSONBlocks(text) {
    const jsonPattern = /```(?:json)?\s*([\s\S]*?)```/g;
    const matches = [];
    let match;
    
    while ((match = jsonPattern.exec(text)) !== null) {
      matches.push(match[1].trim());
    }
    
    return matches;
  }

  /**
   * 尝试从文本中提取并解析 JSON
   */
  static tryParseJSON(text) {
    // 首先尝试直接解析
    const directParse = OutputParser.parseJSON(text);
    if (directParse.success) {
      return directParse;
    }

    // 尝试提取 JSON 代码块
    const jsonBlocks = OutputParser.extractJSONBlocks(text);
    for (const block of jsonBlocks) {
      const blockParse = OutputParser.parseJSON(block);
      if (blockParse.success) {
        return blockParse;
      }
    }

    // 尝试提取花括号内的内容
    const bracePattern = /\{[\s\S]*\}/;
    const braceMatch = text.match(bracePattern);
    if (braceMatch) {
      const braceParse = OutputParser.parseJSON(braceMatch[0]);
      if (braceParse.success) {
        return braceParse;
      }
    }

    return {
      success: false,
      error: 'Could not extract valid JSON from the output'
    };
  }

  /**
   * 清理输出文本
   */
  static cleanOutput(text) {
    // 移除 markdown 代码块标记
    let cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1');
    
    // 移除多余的前后空格
    cleaned = cleaned.trim();
    
    // 移除引号包裹（如果有）
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1);
    }
    
    return cleaned;
  }
}

/**
 * Zod Schema 转 JSON Schema
 */
function zodToJsonSchema(zodSchema) {
  // 简化版的 Zod 到 JSON Schema 转换
  // 实际项目中可以使用 zod-to-json-schema 库
  
  const type = zodSchema._def.typeName;
  
  switch (type) {
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodArray':
      return {
        type: 'array',
        items: zodToJsonSchema(zodSchema._def.type)
      };
    case 'ZodObject':
      const properties = {};
      const shape = zodSchema._def.shape();
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(value);
      }
      return {
        type: 'object',
        properties
      };
    case 'ZodOptional':
      return zodToJsonSchema(zodSchema._def.innerType);
    case 'ZodDefault':
      return zodToJsonSchema(zodSchema._def.innerType);
    case 'ZodLiteral':
      return {
        type: typeof zodSchema._def.value,
        const: zodSchema._def.value
      };
    case 'ZodEnum':
      return {
        type: 'string',
        enum: zodSchema._def.values
      };
    case 'ZodUnion':
      return {
        anyOf: zodSchema._def.options.map(zodToJsonSchema)
      };
    case 'ZodNullable':
      return {
        type: ['null', 'string'],
        nullable: true
      };
    default:
      return { type: 'unknown' };
  }
}

/**
 * 创建结构化输出验证器的便捷函数
 */
export function createStructuredOutputValidator(schema) {
  return new StructuredOutputValidator(schema);
}

/**
 * 创建结构化输出生成器的便捷函数
 */
export function createStructuredOutputGenerator(schema) {
  return new StructuredOutputGenerator(schema);
}
