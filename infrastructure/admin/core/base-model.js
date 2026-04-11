/**
 * 模型混入基类模块
 * 借鉴 FastapiAdmin 的 ModelMixin 设计模式
 * @module infrastructure/admin/core/base-model
 */

import { randomUUID } from 'crypto';

/**
 * 基础模型混入
 * 为所有模型添加通用基础字段
 */
export const ModelMixin = {
  /**
   * 主键ID
   * UUID格式，自动生成
   */
  id: {
    type: 'string',
    format: 'uuid',
    auto: true,
    primary: true,
    description: 'Unique identifier',
  },

  /**
   * 状态字段
   * 用于软删除和状态管理
   */
  status: {
    type: 'string',
    enum: ['active', 'inactive', 'disabled', 'deleted'],
    default: 'active',
    description: 'Record status',
  },

  /**
   * 创建时间
   * 自动记录创建时间
   */
  createdTime: {
    type: 'datetime',
    auto: true,
    description: 'Creation timestamp',
  },

  /**
   * 更新时间
   * 自动记录更新时间
   */
  updatedTime: {
    type: 'datetime',
    auto: true,
    onUpdate: true,
    description: 'Last update timestamp',
  },
};

/**
 * 用户审计混入
 * 为模型添加用户审计字段
 */
export const UserMixin = {
  /**
   * 创建人ID
   */
  createdBy: {
    type: 'string',
    ref: 'User',
    description: 'Creator user ID',
  },

  /**
   * 更新人ID
   */
  updatedBy: {
    type: 'string',
    ref: 'User',
    description: 'Last updater user ID',
  },
};

/**
 * 多租户混入
 * 为模型添加多租户支持字段
 */
export const TenantMixin = {
  /**
   * 租户ID
   */
  tenantId: {
    type: 'string',
    ref: 'Tenant',
    index: true,
    description: 'Tenant ID for multi-tenancy',
  },
};

/**
 * 软删除混入
 * 为模型添加软删除支持字段
 */
export const SoftDeleteMixin = {
  /**
   * 是否已删除
   */
  isDeleted: {
    type: 'boolean',
    default: false,
    description: 'Soft delete flag',
  },

  /**
   * 删除时间
   */
  deletedTime: {
    type: 'datetime',
    description: 'Deletion timestamp',
  },

  /**
   * 删除人ID
   */
  deletedBy: {
    type: 'string',
    ref: 'User',
    description: 'Deleter user ID',
  },
};

/**
 * 版本控制混入
 * 为模型添加版本控制字段
 */
export const VersionMixin = {
  /**
   * 版本号
   */
  version: {
    type: 'number',
    default: 1,
    min: 1,
    description: 'Record version number',
  },

  /**
   * 版本历史
   */
  versionHistory: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        version: { type: 'number' },
        data: { type: 'object' },
        changedBy: { type: 'string' },
        changedTime: { type: 'datetime' },
      },
    },
    default: [],
    description: 'Version history',
  },
};

/**
 * 排序混入
 * 为模型添加排序字段
 */
export const SortMixin = {
  /**
   * 排序号
   */
  sortOrder: {
    type: 'number',
    default: 0,
    description: 'Sort order',
  },
};

/**
 * 标签混入
 * 为模型添加标签支持
 */
export const TagsMixin = {
  /**
   * 标签列表
   */
  tags: {
    type: 'array',
    items: 'string',
    default: [],
    description: 'Tags',
  },
};

/**
 * 创建模型
 * 将基础模型定义与混入组合
 * @param {string} name - 模型名称
 * @param {Object} schema - 基础模型定义
 * @param {...Object} mixins - 混入对象
 * @returns {Object} 完整的模型定义
 */
export function createModel(name, schema, ...mixins) {
  const model = {
    __name: name,
    __primaryKey: 'id',
    __timestamps: true,
    __softDelete: false,

    // 合并所有混入
    ...Object.assign({}, ...mixins),

    // 合并基础schema（优先级最高）
    ...schema,
  };

  // 检查是否启用软删除
  if (model.isDeleted !== undefined) {
    model.__softDelete = true;
  }

  return model;
}

/**
 * 定义字段类型
 */
export const FieldTypes = {
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  DATE: 'date',
  DATETIME: 'datetime',
  ARRAY: 'array',
  OBJECT: 'object',
  BUFFER: 'buffer',
};

/**
 * 创建字段定义
 * @param {string} type - 字段类型
 * @param {Object} [options={}] - 字段选项
 * @returns {Object} 字段定义
 */
export function field(type, options = {}) {
  return { type, ...options };
}

/**
 * 字段定义快捷方法
 */
export const Field = {
  string: (options = {}) => field(FieldTypes.STRING, options),
  number: (options = {}) => field(FieldTypes.NUMBER, options),
  boolean: (options = {}) => field(FieldTypes.BOOLEAN, options),
  date: (options = {}) => field(FieldTypes.DATE, options),
  datetime: (options = {}) => field(FieldTypes.DATETIME, options),
  array: (items, options = {}) => field(FieldTypes.ARRAY, { items, ...options }),
  object: (properties, options = {}) => field(FieldTypes.OBJECT, { properties, ...options }),
  buffer: (options = {}) => field(FieldTypes.BUFFER, options),

  // 常用字段快捷定义
  id: () => field(FieldTypes.STRING, { format: 'uuid', auto: true, primary: true }),
  foreignKey: (ref) => field(FieldTypes.STRING, { ref }),
  enum: (values, options = {}) => field(FieldTypes.STRING, { enum: values, ...options }),
  email: (options = {}) => field(FieldTypes.STRING, { format: 'email', ...options }),
  url: (options = {}) => field(FieldTypes.STRING, { format: 'url', ...options }),
  phone: (options = {}) => field(FieldTypes.STRING, { pattern: /^1\d{10}$/, ...options }),
  password: (options = {}) => field(FieldTypes.STRING, { min: 8, encrypted: true, ...options }),
};

/**
 * 生成UUID
 * @returns {string} UUID字符串
 */
export function generateId() {
  return randomUUID();
}

/**
 * 获取当前时间
 * @returns {string} ISO8601格式时间字符串
 */
export function getCurrentTime() {
  return new Date().toISOString();
}

/**
 * 为数据添加审计字段
 * @param {Object} data - 原始数据
 * @param {Object} model - 模型定义
 * @param {Object} [options={}] - 选项
 * @param {string} [options.userId] - 当前用户ID
 * @param {boolean} [options.isUpdate=false] - 是否为更新操作
 * @returns {Object} 添加审计字段后的数据
 */
export function addAuditFields(data, model, options = {}) {
  const { userId, isUpdate = false } = options;
  const result = { ...data };

  // 添加ID
  if (!isUpdate && model.id?.auto && !result.id) {
    result.id = generateId();
  }

  // 添加创建时间
  if (!isUpdate && model.createdTime?.auto && !result.createdTime) {
    result.createdTime = getCurrentTime();
  }

  // 添加更新时间
  if (model.updatedTime?.auto) {
    result.updatedTime = getCurrentTime();
  }

  // 添加创建人
  if (!isUpdate && model.createdBy && userId && !result.createdBy) {
    result.createdBy = userId;
  }

  // 添加更新人
  if (isUpdate && model.updatedBy && userId) {
    result.updatedBy = userId;
  }

  return result;
}

/**
 * 验证模型字段
 * @param {Object} data - 待验证数据
 * @param {Object} model - 模型定义
 * @param {Object} [options={}] - 验证选项
 * @param {boolean} [options.partial=false] - 是否部分验证
 * @returns {Object} 验证结果 { valid: boolean, errors: Array }
 */
export function validateModel(data, model, options = {}) {
  const { partial = false } = options;
  const errors = [];

  for (const [fieldName, fieldDef] of Object.entries(model)) {
    // 跳过内部字段
    if (fieldName.startsWith('__')) continue;

    const value = data[fieldName];
    const isMissing = value === undefined || value === null;

    // 检查必填
    if (!partial && fieldDef.required && isMissing) {
      errors.push({ field: fieldName, message: `${fieldName} is required` });
      continue;
    }

    // 如果值为空且非必填，跳过验证
    if (isMissing) continue;

    // 类型验证
    if (!validateType(value, fieldDef.type)) {
      errors.push({ field: fieldName, message: `${fieldName} must be ${fieldDef.type}` });
      continue;
    }

    // 枚举验证
    if (fieldDef.enum && !fieldDef.enum.includes(value)) {
      errors.push({
        field: fieldName,
        message: `${fieldName} must be one of: ${fieldDef.enum.join(', ')}`,
      });
    }

    // 最小值验证
    if (fieldDef.min !== undefined) {
      if (fieldDef.type === 'number' && value < fieldDef.min) {
        errors.push({ field: fieldName, message: `${fieldName} must be >= ${fieldDef.min}` });
      }
      if (fieldDef.type === 'string' && value.length < fieldDef.min) {
        errors.push({ field: fieldName, message: `${fieldName} length must be >= ${fieldDef.min}` });
      }
    }

    // 最大值验证
    if (fieldDef.max !== undefined) {
      if (fieldDef.type === 'number' && value > fieldDef.max) {
        errors.push({ field: fieldName, message: `${fieldName} must be <= ${fieldDef.max}` });
      }
      if (fieldDef.type === 'string' && value.length > fieldDef.max) {
        errors.push({ field: fieldName, message: `${fieldName} length must be <= ${fieldDef.max}` });
      }
    }

    // 正则验证
    if (fieldDef.pattern && !fieldDef.pattern.test(value)) {
      errors.push({ field: fieldName, message: `${fieldName} format is invalid` });
    }

    // 格式验证
    if (fieldDef.format && !validateFormat(value, fieldDef.format)) {
      errors.push({ field: fieldName, message: `${fieldName} format is invalid` });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 验证值类型
 * @param {*} value - 值
 * @param {string} type - 类型
 * @returns {boolean}
 */
function validateType(value, type) {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && !Array.isArray(value);
    case 'datetime':
    case 'date':
      return !isNaN(Date.parse(value));
    default:
      return true;
  }
}

/**
 * 验证格式
 * @param {string} value - 值
 * @param {string} format - 格式
 * @returns {boolean}
 */
function validateFormat(value, format) {
  switch (format) {
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    case 'url':
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    case 'uuid':
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    default:
      return true;
  }
}

export default {
  ModelMixin,
  UserMixin,
  TenantMixin,
  SoftDeleteMixin,
  VersionMixin,
  SortMixin,
  TagsMixin,
  createModel,
  FieldTypes,
  Field,
  field,
  generateId,
  getCurrentTime,
  addAuditFields,
  validateModel,
};
