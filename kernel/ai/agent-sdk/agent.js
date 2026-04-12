/**
 * HundunOS Agent SDK - Agent 构建器
 * 基于 n8n Agents SDK 设计，提供 Fluent API 构建 AI Agent
 */

import { z } from 'zod';

// 导出常量供外部使用
export const AgentTypes = {
  ASSISTANT: 'assistant',
  TOOL: 'tool',
  WORKFLOW: 'workflow',
  CUSTOM: 'custom'
};

export const AgentStates = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ERROR: 'error'
};

/**
 * Agent 构建器类
 */
export class AgentBuilder {
  constructor(name, type = 'assistant') {
    this.config = {
      name,
      type,
      description: `Agent: ${name}`,
      version: '1.0.0'
    };
    this.modelConfig = undefined;
    this.instructions = [];
    this.tools = [];
    this.memoryConfig = undefined;
    this.inputGuardrails = [];
    this.outputGuardrails = [];
    this.outputSchema = undefined;
    this.state = 'idle';
  }

  /**
   * 设置描述
   */
  withDescription(description) {
    this.config.description = description;
    return this;
  }

  /**
   * 设置版本
   */
  withVersion(version) {
    this.config.version = version;
    return this;
  }

  /**
   * 设置作者
   */
  withAuthor(author) {
    this.config.author = author;
    return this;
  }

  /**
   * 配置模型
   */
  withModel(provider, model, options = {}) {
    this.modelConfig = {
      provider,
      model,
      temperature: 0.7,
      maxTokens: 2000,
      topP: 1.0,
      frequencyPenalty: 0,
      presencePenalty: 0,
      ...options
    };
    return this;
  }

  /**
   * 添加指令
   */
  withInstruction(text, context) {
    this.instructions.push({ text, context });
    return this;
  }

  /**
   * 添加指令（带示例）
   */
  withInstructionObject(instruction) {
    this.instructions.push(instruction);
    return this;
  }

  /**
   * 添加工具
   */
  withTool(tool) {
    this.tools.push(tool);
    return this;
  }

  /**
   * 批量添加工具
   */
  withTools(tools) {
    this.tools.push(...tools);
    return this;
  }

  /**
   * 配置记忆
   */
  withMemory(config) {
    this.memoryConfig = config;
    return this;
  }

  /**
   * 添加输入护栏
   */
  withInputGuardrail(guardrail) {
    this.inputGuardrails.push(guardrail);
    return this;
  }

  /**
   * 添加输出护栏
   */
  withOutputGuardrail(guardrail) {
    this.outputGuardrails.push(guardrail);
    return this;
  }

  /**
   * 设置输出 Schema
   */
  withOutputSchema(schema) {
    this.outputSchema = schema;
    return this;
  }

  /**
   * 构建 Agent
   */
  build() {
    if (!this.modelConfig) {
      throw new Error('Model configuration is required. Use .withModel() to configure the model.');
    }

    return new Agent(this);
  }

  /**
   * 获取当前配置（用于调试）
   */
  getConfig() {
    return {
      ...this.config,
      modelConfig: this.modelConfig,
      instructions: this.instructions,
      tools: this.tools,
      memoryConfig: this.memoryConfig,
      inputGuardrails: this.inputGuardrails,
      outputGuardrails: this.outputGuardrails,
      outputSchema: this.outputSchema,
      state: this.state
    };
  }
}

/**
 * Agent 类
 */
export class Agent {
  constructor(builder) {
    this.builder = builder;
    this.executionHistory = [];
  }

  /**
   * 获取 Agent 配置
   */
  getConfig() {
    return this.builder.config;
  }

  /**
   * 获取模型配置
   */
  getModelConfig() {
    return this.builder.modelConfig;
  }

  /**
   * 获取指令列表
   */
  getInstructions() {
    return this.builder.instructions;
  }

  /**
   * 获取工具列表
   */
  getTools() {
    return this.builder.tools;
  }

  /**
   * 获取记忆配置
   */
  getMemoryConfig() {
    return this.builder.memoryConfig;
  }

  /**
   * 获取输入护栏
   */
  getInputGuardrails() {
    return this.builder.inputGuardrails;
  }

  /**
   * 获取输出护栏
   */
  getOutputGuardrails() {
    return this.builder.outputGuardrails;
  }

  /**
   * 获取输出 Schema
   */
  getOutputSchema() {
    return this.builder.outputSchema;
  }

  /**
   * 获取执行历史
   */
  getExecutionHistory() {
    return this.executionHistory;
  }

  /**
   * 检查输入护栏
   */
  async checkInputGuardrails(input) {
    for (const guardrail of this.getInputGuardrails()) {
      const result = await guardrail.check(input);
      if (!result.allowed) {
        return result;
      }
    }
    return { allowed: true };
  }

  /**
   * 检查输出护栏
   */
  async checkOutputGuardrails(output) {
    for (const guardrail of this.getOutputGuardrails()) {
      const result = await guardrail.check(output);
      if (!result.allowed) {
        return result;
      }
    }
    return { allowed: true };
  }

  /**
   * 运行 Agent
   */
  async run(options) {
    const startTime = Date.now();
    this.builder.state = 'running';

    try {
      // 检查输入护栏
      const inputCheck = await this.checkInputGuardrails(options.input);
      if (!inputCheck.allowed) {
        this.builder.state = 'error';
        return {
          success: false,
          output: '',
          error: `Input blocked by guardrail: ${inputCheck.reason}`,
          metadata: {
            duration: Date.now() - startTime,
            iterations: 0,
            model: this.getModelConfig().model
          }
        };
      }

      // 这里应该调用实际的 AI 模型
      // 暂时返回模拟结果
      const output = await this.generateResponse(options);

      // 检查输出护栏
      const outputCheck = await this.checkOutputGuardrails(output);
      if (!outputCheck.allowed) {
        this.builder.state = 'error';
        return {
          success: false,
          output: '',
          error: `Output blocked by guardrail: ${outputCheck.reason}`,
          metadata: {
            duration: Date.now() - startTime,
            iterations: 1,
            model: this.getModelConfig().model
          }
        };
      }

      // 验证输出 Schema
      if (this.getOutputSchema()) {
        try {
          const validated = this.getOutputSchema().parse(JSON.parse(output));
          this.builder.state = 'completed';
          const result = {
            success: true,
            output: JSON.stringify(validated),
            metadata: {
              duration: Date.now() - startTime,
              iterations: 1,
              model: this.getModelConfig().model
            }
          };
          this.executionHistory.push(result);
          return result;
        } catch (error) {
          this.builder.state = 'error';
          return {
            success: false,
            output: '',
            error: `Output validation failed: ${error instanceof Error ? error.message : String(error)}`,
            metadata: {
              duration: Date.now() - startTime,
              iterations: 1,
              model: this.getModelConfig().model
            }
          };
        }
      }

      this.builder.state = 'completed';
      const result = {
        success: true,
        output,
        metadata: {
          duration: Date.now() - startTime,
          iterations: 1,
          model: this.getModelConfig().model
        }
      };
      this.executionHistory.push(result);
      return result;

    } catch (error) {
      this.builder.state = 'error';
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          duration: Date.now() - startTime,
          iterations: 0,
          model: this.getModelConfig().model
        }
      };
    }
  }

  /**
   * 生成响应（模拟实现）
   */
  async generateResponse(options) {
    // 这里应该调用实际的 AI 模型 API
    // 暂时返回模拟响应
    const instructions = this.getInstructions()
      .map(inst => inst.text)
      .join('\n');
    
    const tools = this.getTools()
      .map(tool => `- ${tool.name}: ${tool.description}`)
      .join('\n');

    return `Based on the instructions:\n${instructions}\n\n` +
           `With available tools:\n${tools}\n\n` +
           `Responding to: ${options.input}\n\n` +
           `[This is a simulated response. Actual AI model integration pending.]`;
  }

  /**
   * 序列化为 JSON
   */
  toJSON() {
    return {
      config: this.getConfig(),
      modelConfig: this.getModelConfig(),
      instructions: this.getInstructions(),
      tools: this.getTools().map(tool => ({
        name: tool.name,
        description: tool.description,
        type: tool.type,
        required: tool.required
      })),
      memoryConfig: this.getMemoryConfig(),
      inputGuardrails: this.getInputGuardrails().map(g => ({
        name: g.name,
        type: g.type
      })),
      outputGuardrails: this.getOutputGuardrails().map(g => ({
        name: g.name,
        type: g.type
      })),
      executionHistory: this.executionHistory
    };
  }
}

/**
 * 创建 Agent 构建器的便捷函数
 */
export function createAgent(name, type = 'assistant') {
  return new AgentBuilder(name, type);
}
