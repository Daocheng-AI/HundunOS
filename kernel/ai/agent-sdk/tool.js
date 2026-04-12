/**
 * HundunOS Agent SDK - 工具运行时
 * 基于 n8n Agents SDK 设计，提供工具管理和执行能力
 */

import { z } from 'zod';

/**
 * 工具执行状态
 * @typedef {'idle' | 'running' | 'completed' | 'error' | 'suspended'} ToolExecutionState
 */

// 导出常量供外部使用
export const ToolStates = {
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  ERROR: 'error',
  SUSPENDED: 'suspended'
};

/**
 * 工具上下文
 */
export class ToolContext {
  constructor(options = {}) {
    this.agentId = options.agentId || null;
    this.executionId = options.executionId || null;
    this.metadata = options.metadata || {};
    this.parentTelemetry = options.parentTelemetry || null;
  }

  /**
   * 创建子上下文
   */
  createChildContext(options = {}) {
    return new ToolContext({
      agentId: this.agentId,
      executionId: this.executionId,
      metadata: { ...this.metadata, ...options.metadata },
      parentTelemetry: this
    });
  }

  /**
   * 记录事件
   */
  recordEvent(event, data = {}) {
    if (this.parentTelemetry) {
      this.parentTelemetry.recordEvent(event, data);
    }
  }

  /**
   * 获取元数据
   */
  getMetadata(key) {
    return this.metadata[key];
  }

  /**
   * 设置元数据
   */
  setMetadata(key, value) {
    this.metadata[key] = value;
  }
}

/**
 * 工具执行结果
 */
export class ToolExecutionResult {
  constructor(success, output, error = null, metadata = {}) {
    this.success = success;
    this.output = output;
    this.error = error;
    this.metadata = {
      duration: metadata.duration || 0,
      startTime: metadata.startTime || Date.now(),
      endTime: metadata.endTime || Date.now(),
      retries: metadata.retries || 0,
      ...metadata
    };
    this.state = success ? ToolStates.COMPLETED : ToolStates.ERROR;
  }

  /**
   * 获取执行时长
   */
  getDuration() {
    return this.metadata.endTime - this.metadata.startTime;
  }

  /**
   * 转换为 JSON
   */
  toJSON() {
    return {
      success: this.success,
      output: this.output,
      error: this.error,
      state: this.state,
      metadata: this.metadata
    };
  }
}

/**
 * 工具类
 */
export class Tool {
  constructor(name) {
    this.name = name;
    this._description = '';
    this._inputSchema = undefined;
    this._outputSchema = undefined;
    this._handler = null;
    this.type = 'function';
    this.required = false;
    this.timeout = 30000; // 默认 30 秒超时
    this.retryCount = 0;
    this.metadata = {};
  }

  /**
   * 设置描述
   */
  setDescription(desc) {
    this._description = desc;
    return this;
  }

  /**
   * 设置输入 Schema
   */
  setInputSchema(schema) {
    this._inputSchema = schema;
    return this;
  }

  /**
   * 设置输出 Schema
   */
  setOutputSchema(schema) {
    this._outputSchema = schema;
    return this;
  }

  /**
   * 设置处理器
   */
  setHandler(handlerFn) {
    this._handler = handlerFn;
    return this;
  }

  /**
   * 设置类型
   */
  setType(toolType) {
    this.type = toolType;
    return this;
  }

  /**
   * 设置是否必需
   */
  setRequired(isRequired) {
    this.required = isRequired;
    return this;
  }

  /**
   * 设置超时
   */
  setTimeout(timeoutMs) {
    this.timeout = timeoutMs;
    return this;
  }

  /**
   * 设置重试次数
   */
  setRetry(count) {
    this.retryCount = count;
    return this;
  }

  /**
   * 设置元数据
   */
  setMetadata(data) {
    this.metadata = { ...this.metadata, ...data };
    return this;
  }

  /**
   * 获取描述
   */
  get description() {
    return this._description;
  }

  /**
   * 获取输入 Schema
   */
  get inputSchema() {
    return this._inputSchema;
  }

  /**
   * 获取输出 Schema
   */
  get outputSchema() {
    return this._outputSchema;
  }

  /**
   * 获取处理器
   */
  get handler() {
    return this._handler;
  }

  /**
   * 构建工具
   */
  build() {
    if (!this._description) {
      throw new Error(`Tool "${this.name}" must have a description`);
    }

    if (!this._handler) {
      throw new Error(`Tool "${this.name}" must have a handler`);
    }

    return this;
  }

  /**
   * 验证输入
   */
  validateInput(input) {
    if (!this._inputSchema) {
      return { valid: true, validated: input };
    }

    try {
      const validated = this._inputSchema.parse(input);
      return { valid: true, validated };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 验证输出
   */
  validateOutput(output) {
    if (!this._outputSchema) {
      return { valid: true, validated: output };
    }

    try {
      const validated = this._outputSchema.parse(output);
      return { valid: true, validated };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 执行工具
   */
  async execute(input, context = new ToolContext()) {
    const startTime = Date.now();
    const metadata = {
      startTime,
      toolName: this.name,
      toolType: this.type,
      retries: 0
    };

    try {
      // 验证输入
      const inputValidation = this.validateInput(input);
      if (!inputValidation.valid) {
        throw new Error(`Invalid input: ${inputValidation.error}`);
      }

      const validatedInput = inputValidation.validated;

      // 执行处理器（带超时和重试）
      const output = await this._executeWithRetry(
        this._handler,
        validatedInput,
        context,
        metadata
      );

      // 验证输出
      const outputValidation = this.validateOutput(output);
      if (!outputValidation.valid) {
        throw new Error(`Invalid output: ${outputValidation.error}`);
      }

      metadata.endTime = Date.now();

      return new ToolExecutionResult(true, outputValidation.validated, null, metadata);

    } catch (error) {
      metadata.endTime = Date.now();
      metadata.error = error instanceof Error ? error.message : String(error);

      return new ToolExecutionResult(
        false,
        null,
        error instanceof Error ? error.message : String(error),
        metadata
      );
    }
  }

  /**
   * 带重试的执行
   */
  async _executeWithRetry(handlerFn, input, context, metadata) {
    let lastError = null;

    for (let attempt = 0; attempt <= this.retryCount; attempt++) {
      try {
        // 执行处理器（带超时）
        const output = await this._executeWithTimeout(handlerFn, input, context);
        
        // 更新重试次数
        metadata.retries = attempt;
        
        // 记录成功事件
        context.recordEvent('tool_execution_success', {
          toolName: this.name,
          attempt: attempt + 1
        });

        return output;

      } catch (error) {
        lastError = error;
        metadata.retries = attempt + 1;

        // 记录失败事件
        context.recordEvent('tool_execution_attempt', {
          toolName: this.name,
          attempt: attempt + 1,
          error: error instanceof Error ? error.message : String(error)
        });

        // 如果是最后一次尝试，抛出错误
        if (attempt === this.retryCount) {
          throw error;
        }

        // 等待一段时间后重试
        await this._waitBeforeRetry(attempt);
      }
    }

    throw lastError;
  }

  /**
   * 带超时的执行
   */
  async _executeWithTimeout(handlerFn, input, context) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Tool "${this.name}" execution timeout after ${this.timeout}ms`));
      }, this.timeout);

      try {
        const result = await handlerFn(input, context);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * 重试前的等待
   */
  async _waitBeforeRetry(attempt) {
    // 指数退避策略
    const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * 转换为 JSON
   */
  toJSON() {
    return {
      name: this.name,
      description: this._description,
      type: this.type,
      required: this.required,
      timeout: this.timeout,
      retryCount: this.retryCount,
      metadata: this.metadata,
      inputSchema: this._inputSchema ? this._inputSchema.toString() : undefined,
      outputSchema: this._outputSchema ? this._outputSchema.toString() : undefined
    };
  }
}

/**
 * 工具注册表
 */
export class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.categories = new Map();
  }

  /**
   * 注册工具
   */
  register(tool) {
    const builtTool = tool.build();
    this.tools.set(builtTool.name, builtTool);

    // 按类别分类
    const category = builtTool.metadata.category || 'default';
    if (!this.categories.has(category)) {
      this.categories.set(category, []);
    }
    this.categories.get(category).push(builtTool.name);

    return this;
  }

  /**
   * 批量注册工具
   */
  registerAll(tools) {
    tools.forEach(tool => this.register(tool));
    return this;
  }

  /**
   * 获取工具
   */
  get(name) {
    return this.tools.get(name);
  }

  /**
   * 检查工具是否存在
   */
  has(name) {
    return this.tools.has(name);
  }

  /**
   * 获取所有工具名称
   */
  getToolNames() {
    return Array.from(this.tools.keys());
  }

  /**
   * 按类别获取工具
   */
  getToolsByCategory(category) {
    const toolNames = this.categories.get(category) || [];
    return toolNames.map(name => this.tools.get(name)).filter(Boolean);
  }

  /**
   * 获取所有类别
   */
  getCategories() {
    return Array.from(this.categories.keys());
  }

  /**
   * 移除工具
   */
  unregister(name) {
    const tool = this.tools.get(name);
    if (tool) {
      // 从类别中移除
      const category = tool.metadata.category || 'default';
      const categoryTools = this.categories.get(category) || [];
      const index = categoryTools.indexOf(name);
      if (index !== -1) {
        categoryTools.splice(index, 1);
      }
    }
    return this.tools.delete(name);
  }

  /**
   * 清空所有工具
   */
  clear() {
    this.tools.clear();
    this.categories.clear();
  }

  /**
   * 获取工具数量
   */
  size() {
    return this.tools.size;
  }

  /**
   * 搜索工具
   */
  search(query) {
    const queryLower = query.toLowerCase();
    return Array.from(this.tools.values()).filter(tool => 
      tool.name.toLowerCase().includes(queryLower) ||
      tool.description.toLowerCase().includes(queryLower)
    );
  }

  /**
   * 转换为 JSON
   */
  toJSON() {
    return {
      tools: Array.from(this.tools.values()).map(tool => tool.toJSON()),
      categories: Object.fromEntries(this.categories)
    };
  }
}

/**
 * 创建工具的便捷函数
 */
export function createTool(name) {
  return new Tool(name);
}

/**
 * 创建工具注册表的便捷函数
 */
export function createToolRegistry() {
  return new ToolRegistry();
}
