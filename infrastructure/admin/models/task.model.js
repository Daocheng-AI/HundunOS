/**
 * 任务数据模型
 * @module infrastructure/admin/models/task.model
 */

import { createModel, ModelMixin, UserMixin } from '../core/base-model.js';

/**
 * 任务模型定义
 */
export const TaskModel = createModel('Task', {
  // 任务名称
  name: {
    type: 'string',
    required: true,
    min: 2,
    max: 64,
    description: 'Task name',
  },

  // 任务描述
  description: {
    type: 'string',
    max: 500,
    description: 'Task description',
  },

  // 执行命令
  command: {
    type: 'string',
    required: true,
    description: 'Command to execute',
  },

  // 触发类型
  triggerType: {
    type: 'string',
    enum: ['cron', 'interval', 'date', 'manual'],
    required: true,
    description: 'Trigger type',
  },

  // 触发配置
  triggerConfig: {
    type: 'object',
    required: true,
    description: 'Trigger configuration (cron expression, interval seconds, etc.)',
  },

  // 状态
  status: {
    type: 'string',
    enum: ['enabled', 'disabled', 'running', 'paused'],
    default: 'enabled',
    description: 'Task status',
  },

  // 上次执行时间
  lastExecuteTime: {
    type: 'datetime',
    description: 'Last execution timestamp',
  },

  // 下次执行时间
  nextExecuteTime: {
    type: 'datetime',
    description: 'Next execution timestamp',
  },

  // 上次执行结果
  lastExecuteResult: {
    type: 'string',
    enum: ['success', 'failure', 'timeout', 'cancelled'],
    description: 'Last execution result',
  },

  // 上次执行输出
  lastExecuteOutput: {
    type: 'string',
    description: 'Last execution output',
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

  // 超时时间（毫秒）
  timeout: {
    type: 'number',
    default: 300000, // 5分钟
    min: 1000,
    description: 'Timeout in milliseconds',
  },

  // 重试次数
  retryCount: {
    type: 'number',
    default: 0,
    min: 0,
    max: 10,
    description: 'Retry count on failure',
  },

  // 重试间隔（毫秒）
  retryInterval: {
    type: 'number',
    default: 60000, // 1分钟
    min: 1000,
    description: 'Retry interval in milliseconds',
  },

  // 并发策略
  concurrency: {
    type: 'string',
    enum: ['allow', 'skip', 'queue'],
    default: 'skip',
    description: 'Concurrency strategy: allow, skip, or queue',
  },

  // 最大并发数
  maxConcurrent: {
    type: 'number',
    default: 1,
    min: 1,
    description: 'Maximum concurrent executions',
  },

  // 标签
  tags: {
    type: 'array',
    items: 'string',
    default: [],
    description: 'Tags',
  },

  // 通知配置
  notify: {
    type: 'object',
    description: 'Notification configuration',
  },
}, ModelMixin, UserMixin);

/**
 * 任务状态枚举
 */
export const TaskStatus = {
  ENABLED: 'enabled',
  DISABLED: 'disabled',
  RUNNING: 'running',
  PAUSED: 'paused',
};

/**
 * 触发类型枚举
 */
export const TriggerType = {
  CRON: 'cron',       // Cron表达式
  INTERVAL: 'interval', // 间隔执行
  DATE: 'date',       // 指定时间执行一次
  MANUAL: 'manual',   // 手动触发
};

/**
 * 执行结果枚举
 */
export const ExecuteResult = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  TIMEOUT: 'timeout',
  CANCELLED: 'cancelled',
};

/**
 * 并发策略枚举
 */
export const ConcurrencyStrategy = {
  ALLOW: 'allow',   // 允许并发
  SKIP: 'skip',     // 跳过新执行
  QUEUE: 'queue',   // 排队等待
};

/**
 * 任务字段常量
 */
export const TaskFields = {
  ID: 'id',
  NAME: 'name',
  COMMAND: 'command',
  TRIGGER_TYPE: 'triggerType',
  TRIGGER_CONFIG: 'triggerConfig',
  STATUS: 'status',
  LAST_EXECUTE_TIME: 'lastExecuteTime',
  NEXT_EXECUTE_TIME: 'nextExecuteTime',
};

export default TaskModel;
