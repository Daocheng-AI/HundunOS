/**
 * Skill数据模型
 * @module infrastructure/admin/models/skill.model
 */

import { createModel, ModelMixin } from '../core/base-model.js';

/**
 * Skill模型定义
 */
export const SkillModel = createModel('Skill', {
  // Skill名称
  name: {
    type: 'string',
    required: true,
    unique: true,
    min: 2,
    max: 64,
    description: 'Skill name',
  },

  // 版本号
  version: {
    type: 'string',
    required: true,
    pattern: /^\d+\.\d+\.\d+$/,
    description: 'Version (semantic versioning)',
  },

  // 描述
  description: {
    type: 'string',
    max: 500,
    description: 'Skill description',
  },

  // 分类
  category: {
    type: 'string',
    description: 'Category (e.g., "工具", "分析")',
  },

  // 标签
  tags: {
    type: 'array',
    items: 'string',
    default: [],
    description: 'Tags',
  },

  // 工具列表
  tools: {
    type: 'array',
    items: 'string',
    required: true,
    default: [],
    description: 'Required tools',
  },

  // 配置
  config: {
    type: 'object',
    description: 'Skill configuration',
  },

  // 状态
  status: {
    type: 'string',
    enum: ['enabled', 'disabled', 'error'],
    default: 'enabled',
    description: 'Skill status',
  },

  // 签名（用于验证来源）
  signature: {
    type: 'string',
    description: 'Signature for verification',
  },

  // 安装来源
  installedFrom: {
    type: 'string',
    enum: ['market', 'local', 'git', 'url'],
    required: true,
    description: 'Installation source',
  },

  // 来源URL
  sourceUrl: {
    type: 'string',
    description: 'Source URL',
  },

  // 作者
  author: {
    type: 'string',
    description: 'Author name',
  },

  // 许可证
  license: {
    type: 'string',
    description: 'License type',
  },

  // 主页
  homepage: {
    type: 'string',
    format: 'url',
    description: 'Homepage URL',
  },

  // 依赖
  dependencies: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        version: { type: 'string' },
      },
    },
    default: [],
    description: 'Dependencies',
  },

  // 执行次数
  executeCount: {
    type: 'number',
    default: 0,
    min: 0,
    description: 'Total execution count',
  },

  // 成功次数
  successCount: {
    type: 'number',
    default: 0,
    min: 0,
    description: 'Success count',
  },

  // 失败次数
  failureCount: {
    type: 'number',
    default: 0,
    min: 0,
    description: 'Failure count',
  },

  // 最后执行时间
  lastExecuteTime: {
    type: 'datetime',
    description: 'Last execution timestamp',
  },

  // 最后执行结果
  lastExecuteResult: {
    type: 'string',
    enum: ['success', 'failure', 'error'],
    description: 'Last execution result',
  },

  // 平均执行时间（毫秒）
  avgExecuteTime: {
    type: 'number',
    default: 0,
    min: 0,
    description: 'Average execution time in milliseconds',
  },

  // 优先级
  priority: {
    type: 'number',
    default: 0,
    description: 'Priority (higher = more important)',
  },

  // 是否官方
  isOfficial: {
    type: 'boolean',
    default: false,
    description: 'Is official skill',
  },

  // 是否推荐
  isRecommended: {
    type: 'boolean',
    default: false,
    description: 'Is recommended',
  },

  // 评分
  rating: {
    type: 'number',
    default: 0,
    min: 0,
    max: 5,
    description: 'Rating (0-5)',
  },

  // 下载次数
  downloadCount: {
    type: 'number',
    default: 0,
    min: 0,
    description: 'Download count',
  },
}, ModelMixin);

/**
 * Skill状态枚举
 */
export const SkillStatus = {
  ENABLED: 'enabled',
  DISABLED: 'disabled',
  ERROR: 'error',
};

/**
 * 安装来源枚举
 */
export const InstallSource = {
  MARKET: 'market',  // Skill市场
  LOCAL: 'local',    // 本地安装
  GIT: 'git',        // Git仓库
  URL: 'url',        // 直接URL
};

/**
 * Skill字段常量
 */
export const SkillFields = {
  ID: 'id',
  NAME: 'name',
  VERSION: 'version',
  CATEGORY: 'category',
  TOOLS: 'tools',
  STATUS: 'status',
  INSTALLED_FROM: 'installedFrom',
  EXECUTE_COUNT: 'executeCount',
};

/**
 * Skill分类
 */
export const SkillCategories = {
  TOOL: '工具',
  ANALYSIS: '分析',
  COMMUNICATION: '沟通',
  AUTOMATION: '自动化',
  INTEGRATION: '集成',
  MONITORING: '监控',
  SECURITY: '安全',
  DATA: '数据处理',
  AI: 'AI增强',
  OTHER: '其他',
};

export default SkillModel;
