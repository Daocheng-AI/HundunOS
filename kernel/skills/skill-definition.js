/**
 * 声明式 Skill 定义系统
 * 提供基于 Schema 的 Skill 定义能力
 */

import { z } from 'zod';
import { validateSkillName } from './skill-validator.js';

/**
 * Skill 类型枚举
 */
export const SkillType = {
  EXECUTE: 'execute',
  POLL: 'poll',
  TRIGGER: 'trigger',
  WEBHOOK: 'webhook',
  MANUAL: 'manual'
};

/**
 * Skill 执行模式枚举
 */
export const SkillExecutionMode = {
  MANUAL: 'manual',
  TRIGGER: 'trigger',
  WEBHOOK: 'webhook',
  RETRY: 'retry',
  CLI: 'cli',
  EVALUATION: 'evaluation'
};

/**
 * Skill 连接类型枚举
 */
export const SkillConnectionType = {
  MAIN: 'main',
  AI: 'ai',
  AI_DOCUMENT: 'ai_document',
  AI_IMAGE: 'ai_image',
  AI_TEXT: 'ai_text',
  AI_EMBEDDING: 'ai_embedding',
  AI_VECTOR: 'ai_vector',
  AI_LANGUAGE_MODEL: 'ai_languageModel',
  AI_TOOL: 'ai_tool',
  AI_AGENT: 'ai_agent',
  AI_HYBRID: 'ai_hybrid',
  AI_CHAIN: 'ai_chain',
  AI_MEMORY: 'ai_memory'
};

/**
 * Skill 描述 Schema
 */
export const SkillDescriptionSchema = z.object({
  // 基本信息
  name: z.string().min(1).max(64).refine(validateSkillName, {
    message: 'Invalid skill name format'
  }),
  displayName: z.string().min(1).max(128),
  description: z.string().min(1).max(2048),
  version: z.number().int().positive().default(1),
  defaultVersion: z.number().int().positive().optional(),
  
  // 分类信息
  category: z.string().optional(),
  subcategory: z.string().optional(),
  tags: z.array(z.string()).default([]),
  icon: z.string().optional(),
  iconColor: z.string().optional(),
  
  // 作者信息
  author: z.string().optional(),
  authorUrl: z.string().url().optional(),
  license: z.string().optional(),
  documentationUrl: z.string().url().optional(),
  
  // Skill 类型
  type: z.enum(Object.values(SkillType)).default(SkillType.EXECUTE),
  executionMode: z.enum(Object.values(SkillExecutionMode)).default(SkillExecutionMode.MANUAL),
  
  // 功能标志
  features: z.object({
    asyncExecution: z.boolean().default(false),
    retrySupport: z.boolean().default(false),
    continueOnFail: z.boolean().default(false),
    caching: z.boolean().default(false),
    streaming: z.boolean().default(false),
    binaryData: z.boolean().default(false),
    aiIntegration: z.boolean().default(false),
    webhooks: z.boolean().default(false)
  }).default({}),
  
  // 权限要求
  permissions: z.array(z.string()).default([]),
  
  // 依赖
  dependencies: z.array(z.string()).default([]),
  
  // 配置
  config: z.object({
    timeout: z.number().int().positive().default(60000),
    maxExecutionTime: z.number().int().positive().optional(),
    isolation: z.enum(['process', 'thread', 'sandbox']).default('process'),
    retryCount: z.number().int().min(0).default(0),
    retryDelay: z.number().int().min(0).default(1000),
    memoryLimit: z.number().int().positive().optional()
  }).default({}),
  
  // 自定义元数据（用于存储额外信息）
  metadata: z.record(z.any()).optional()
});

/**
 * Skill 参数 Schema
 */
export const SkillParameterSchema = z.object({
  // 基本信息
  displayName: z.string().min(1).max(128),
  name: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_]+$/),
  description: z.string().max(1024).optional(),
  type: z.enum([
    'string',
    'number',
    'boolean',
    'array',
    'object',
    'json',
    'date',
    'time',
    'dateTime',
    'color',
    'file',
    'credential',
    'options',
    'multiOptions',
    'fixedCollection',
    'collection',
    'icon',
    'resourceLocator',
    'workflow',
    'code'
  ]),
  
  // 验证规则
  required: z.boolean().default(false),
  default: z.any().optional(),
  options: z.array(z.object({
    name: z.string(),
    value: z.any(),
    description: z.string().optional()
  })).optional(),
  
  // 显示配置
  displayOptions: z.any().optional(),
  
  // 类型特定配置
  typeOptions: z.any().optional(),
  
  // 条件显示
  displayCondition: z.string().optional(),
  
  // 提示和文档
  hint: z.string().max(512).optional(),
  placeholder: z.string().max(256).optional(),
  example: z.any().optional(),
  documentationUrl: z.string().url().optional()
});

/**
 * Skill 输出 Schema
 */
export const SkillOutputSchema = z.object({
  displayName: z.string().min(1).max(128),
  name: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_]+$/),
  description: z.string().max(1024).optional(),
  type: z.enum([
    'string',
    'number',
    'boolean',
    'array',
    'object',
    'json',
    'file',
    'binary',
    'stream'
  ]),
  
  // 数组类型配置
  array: z.any().optional(),
  
  // 显示配置
  displayOptions: z.any().optional(),
  
  // 类型特定配置
  typeOptions: z.any().optional()
});

/**
 * Skill 凭证 Schema
 */
export const SkillCredentialSchema = z.object({
  name: z.string().min(1).max(64),
  displayName: z.string().min(1).max(128),
  description: z.string().max(1024).optional(),
  required: z.boolean().default(false),
  
  // 认证类型
  authentication: z.any(),
  
  // 测试连接
  testUrl: z.string().url().optional(),
  
  // 显示配置
  displayOptions: z.any().optional()
});

/**
 * Skill 输入 Schema
 */
export const SkillInputSchema = z.object({
  main: z.array(z.string()).default([]),
  ai: z.array(z.string()).default([]),
  ai_document: z.array(z.string()).default([]),
  ai_image: z.array(z.string()).default([]),
  ai_text: z.array(z.string()).default([]),
  ai_embedding: z.array(z.string()).default([]),
  ai_vector: z.array(z.string()).default([]),
  ai_languageModel: z.array(z.string()).default([]),
  ai_tool: z.array(z.string()).default([]),
  ai_agent: z.array(z.string()).default([]),
  ai_hybrid: z.array(z.string()).default([]),
  ai_chain: z.array(z.string()).default([]),
  ai_memory: z.array(z.string()).default([])
});

/**
 * Skill 输出 Schema
 */
export const SkillOutputConnectionSchema = z.object({
  main: z.array(z.object({
    type: z.enum(['string', 'number', 'boolean', 'array', 'object', 'json', 'file', 'binary', 'stream']),
    displayName: z.string().optional(),
    description: z.string().optional()
  })).default([]),
  ai: z.array(z.object({
    type: z.enum(['string', 'number', 'boolean', 'array', 'object', 'json', 'file', 'binary', 'stream']),
    displayName: z.string().optional(),
    description: z.string().optional()
  })).default([])
});

/**
 * 完整 Skill 定义 Schema
 */
export const SkillDefinitionSchema = z.object({
  // 描述
  description: SkillDescriptionSchema,
  
  // 输入
  inputs: SkillInputSchema.default({}),
  
  // 输出
  outputs: SkillOutputConnectionSchema.default({}),
  
  // 参数
  parameters: z.array(SkillParameterSchema).default([]),
  
  // 返回值
  returns: z.array(SkillOutputSchema).default([]),
  
  // 凭证
  credentials: z.array(SkillCredentialSchema).default([]),
  
  // 工具
  tools: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    type: z.enum(['http', 'function', 'ai', 'database', 'file', 'custom']),
    config: z.any().optional()
  })).default([])
});

/**
 * Skill 定义类
 */
export class SkillDefinition {
  /**
   * @param {Object} definition - 技能定义对象
   */
  constructor(definition) {
    // 验证定义
    const validated = SkillDefinitionSchema.parse(definition);
    
    this.description = validated.description;
    this.inputs = validated.inputs;
    this.outputs = validated.outputs;
    this.parameters = validated.parameters;
    this.returns = validated.returns;
    this.credentials = validated.credentials;
    this.tools = validated.tools;
  }

  /**
   * 获取 Skill 名称
   * @returns {string}
   */
  getName() {
    return this.description.name;
  }

  /**
   * 获取 Skill 显示名称
   * @returns {string}
   */
  getDisplayName() {
    return this.description.displayName;
  }

  /**
   * 获取 Skill 版本
   * @returns {number}
   */
  getVersion() {
    return this.description.version;
  }

  /**
   * 获取 Skill 类型
   * @returns {string}
   */
  getType() {
    return this.description.type;
  }

  /**
   * 获取参数定义
   * @param {string} parameterName - 参数名称
   * @returns {Object|undefined}
   */
  getParameter(parameterName) {
    return this.parameters.find(p => p.name === parameterName);
  }

  /**
   * 获取返回值定义
   * @param {string} returnName - 返回值名称
   * @returns {Object|undefined}
   */
  getReturn(returnName) {
    return this.returns.find(r => r.name === returnName);
  }

  /**
   * 获取凭证定义
   * @param {string} credentialName - 凭证名称
   * @returns {Object|undefined}
   */
  getCredential(credentialName) {
    return this.credentials.find(c => c.name === credentialName);
  }

  /**
   * 检查参数是否必需
   * @param {string} parameterName - 参数名称
   * @returns {boolean}
   */
  isParameterRequired(parameterName) {
    const param = this.getParameter(parameterName);
    return param?.required ?? false;
  }

  /**
   * 获取必需参数列表
   * @returns {Array<string>}
   */
  getRequiredParameters() {
    return this.parameters
      .filter(p => p.required)
      .map(p => p.name);
  }

  /**
   * 获取所有支持的连接类型
   * @returns {Array<string>}
   */
  getSupportedConnectionTypes() {
    return [
      ...Object.keys(this.inputs),
      ...Object.keys(this.outputs)
    ];
  }

  /**
   * 检查是否支持特定连接类型
   * @param {string} connectionType - 连接类型
   * @param {string} direction - 'input' or 'output'
   * @returns {boolean}
   */
  supportsConnectionType(connectionType, direction = 'input') {
    const connections = direction === 'input' ? this.inputs : this.outputs;
    return Array.isArray(connections[connectionType]) && connections[connectionType].length > 0;
  }

  /**
   * 序列化为 JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      description: this.description,
      inputs: this.inputs,
      outputs: this.outputs,
      parameters: this.parameters,
      returns: this.returns,
      credentials: this.credentials,
      tools: this.tools
    };
  }

  /**
   * 从 JSON 创建 Skill 定义
   * @param {Object} json - JSON 对象
   * @returns {SkillDefinition}
   */
  static fromJSON(json) {
    return new SkillDefinition(json);
  }

  /**
   * 创建 Skill 定义构建器
   * @returns {SkillDefinitionBuilder}
   */
  static builder() {
    return new SkillDefinitionBuilder();
  }
}

/**
 * Skill 定义构建器
 */
export class SkillDefinitionBuilder {
  constructor() {
    this._definition = {
      description: {
        name: '',
        displayName: '',
        description: '',
        version: 1,
        type: SkillType.EXECUTE,
        executionMode: SkillExecutionMode.MANUAL,
        category: '',
        tags: [],
        features: {},
        config: {},
        permissions: [],
        dependencies: []
      },
      inputs: {},
      outputs: {},
      parameters: [],
      returns: [],
      credentials: [],
      tools: []
    };
  }

  /**
   * 设置名称
   * @param {string} name - Skill 名称
   * @returns {SkillDefinitionBuilder}
   */
  withName(name) {
    this._definition.description.name = name;
    return this;
  }

  /**
   * 设置显示名称
   * @param {string} displayName - 显示名称
   * @returns {SkillDefinitionBuilder}
   */
  withDisplayName(displayName) {
    this._definition.description.displayName = displayName;
    return this;
  }

  /**
   * 设置描述
   * @param {string} description - 描述
   * @returns {SkillDefinitionBuilder}
   */
  withDescription(description) {
    this._definition.description.description = description;
    return this;
  }

  /**
   * 设置版本
   * @param {number} version - 版本号
   * @returns {SkillDefinitionBuilder}
   */
  withVersion(version) {
    this._definition.description.version = version;
    return this;
  }

  /**
   * 设置类型
   * @param {string} type - Skill 类型
   * @returns {SkillDefinitionBuilder}
   */
  withType(type) {
    this._definition.description.type = type;
    return this;
  }

  /**
   * 设置执行模式
   * @param {string} executionMode - 执行模式
   * @returns {SkillDefinitionBuilder}
   */
  withExecutionMode(executionMode) {
    this._definition.description.executionMode = executionMode;
    return this;
  }

  /**
   * 设置分类
   * @param {string} category - 分类
   * @returns {SkillDefinitionBuilder}
   */
  withCategory(category) {
    this._definition.description.category = category;
    return this;
  }

  /**
   * 添加标签
   * @param {string} tag - 标签
   * @returns {SkillDefinitionBuilder}
   */
  withTag(tag) {
    this._definition.description.tags.push(tag);
    return this;
  }

  /**
   * 添加参数
   * @param {Object} parameter - 参数定义
   * @returns {SkillDefinitionBuilder}
   */
  withParameter(parameter) {
    this._definition.parameters.push(parameter);
    return this;
  }

  /**
   * 添加返回值
   * @param {Object} returnDef - 返回值定义
   * @returns {SkillDefinitionBuilder}
   */
  withReturn(returnDef) {
    this._definition.returns.push(returnDef);
    return this;
  }

  /**
   * 添加凭证
   * @param {Object} credential - 凭证定义
   * @returns {SkillDefinitionBuilder}
   */
  withCredential(credential) {
    this._definition.credentials.push(credential);
    return this;
  }

  /**
   * 添加工具
   * @param {Object} tool - 工具定义
   * @returns {SkillDefinitionBuilder}
   */
  withTool(tool) {
    this._definition.tools.push(tool);
    return this;
  }

  /**
   * 设置输入连接
   * @param {Object} inputs - 输入连接定义
   * @returns {SkillDefinitionBuilder}
   */
  withInputs(inputs) {
    this._definition.inputs = inputs;
    return this;
  }

  /**
   * 设置输出连接
   * @param {Object} outputs - 输出连接定义
   * @returns {SkillDefinitionBuilder}
   */
  withOutputs(outputs) {
    this._definition.outputs = outputs;
    return this;
  }

  /**
   * 构建 Skill 定义
   * @returns {SkillDefinition}
   */
  build() {
    return new SkillDefinition(this._definition);
  }
}

// 导出常量在文件开头已经定义，不需要重复导出
