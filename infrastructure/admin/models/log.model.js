/**
 * 操作日志数据模型
 * @module infrastructure/admin/models/log.model
 */

import { createModel, ModelMixin } from '../core/base-model.js';

/**
 * 操作日志模型定义
 */
export const OperationLogModel = createModel('OperationLog', {
  // 操作模块
  module: {
    type: 'string',
    required: true,
    index: true,
    description: 'Operation module (e.g., "用户管理")',
  },

  // 操作类型
  operation: {
    type: 'string',
    required: true,
    description: 'Operation type (e.g., "创建用户")',
  },

  // 请求方法
  method: {
    type: 'string',
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    required: true,
    description: 'HTTP method',
  },

  // 请求URL
  url: {
    type: 'string',
    required: true,
    description: 'Request URL',
  },

  // 请求参数（敏感信息脱敏）
  params: {
    type: 'object',
    description: 'Request parameters (sensitive data masked)',
  },

  // 请求头
  headers: {
    type: 'object',
    description: 'Request headers',
  },

  // 操作结果
  result: {
    type: 'string',
    enum: ['success', 'failure'],
    required: true,
    description: 'Operation result',
  },

  // 错误消息
  errorMsg: {
    type: 'string',
    description: 'Error message (if failed)',
  },

  // 错误堆栈
  errorStack: {
    type: 'string',
    description: 'Error stack trace',
  },

  // 执行耗时（毫秒）
  duration: {
    type: 'number',
    required: true,
    min: 0,
    description: 'Execution duration in milliseconds',
  },

  // 操作人ID
  operatorId: {
    type: 'string',
    ref: 'User',
    index: true,
    description: 'Operator user ID',
  },

  // 操作人名称
  operatorName: {
    type: 'string',
    required: true,
    description: 'Operator username',
  },

  // 操作IP
  ip: {
    type: 'string',
    required: true,
    description: 'Operator IP address',
  },

  // 用户代理
  userAgent: {
    type: 'string',
    description: 'User agent string',
  },

  // 请求ID（用于链路追踪）
  requestId: {
    type: 'string',
    index: true,
    description: 'Request ID for tracing',
  },

  // 业务ID（如用户ID、任务ID等）
  businessId: {
    type: 'string',
    index: true,
    description: 'Business entity ID',
  },

  // 业务类型
  businessType: {
    type: 'string',
    description: 'Business entity type',
  },

  // 扩展数据
  extra: {
    type: 'object',
    description: 'Extra data',
  },
}, ModelMixin);

/**
 * 操作结果枚举
 */
export const LogResult = {
  SUCCESS: 'success',
  FAILURE: 'failure',
};

/**
 * HTTP方法枚举
 */
export const HttpMethod = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
  PATCH: 'PATCH',
};

/**
 * 预定义模块
 */
export const LogModules = {
  AUTH: '认证管理',
  USER: '用户管理',
  ROLE: '角色管理',
  TASK: '任务管理',
  SKILL: 'Skill管理',
  LOG: '日志管理',
  SYSTEM: '系统管理',
  MONITOR: '系统监控',
};

/**
 * 预定义操作
 */
export const LogOperations = {
  LOGIN: '登录',
  LOGOUT: '登出',
  CREATE: '创建',
  UPDATE: '更新',
  DELETE: '删除',
  READ: '查询',
  EXPORT: '导出',
  IMPORT: '导入',
  EXECUTE: '执行',
  ENABLE: '启用',
  DISABLE: '禁用',
};

/**
 * 敏感字段列表（需要脱敏）
 */
export const SensitiveFields = [
  'password',
  'newPassword',
  'oldPassword',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  'credential',
];

/**
 * 日志字段常量
 */
export const LogFields = {
  ID: 'id',
  MODULE: 'module',
  OPERATION: 'operation',
  METHOD: 'method',
  URL: 'url',
  RESULT: 'result',
  OPERATOR_ID: 'operatorId',
  OPERATOR_NAME: 'operatorName',
  IP: 'ip',
  CREATED_TIME: 'createdTime',
};

export default OperationLogModel;
