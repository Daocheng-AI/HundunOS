/**
 * 任务服务
 * @module infrastructure/admin/services/task.service
 */

import { CRUDBase } from '../core/base-crud.js';
import { TaskModel, TaskStatus, TriggerType } from '../models/task.model.js';
import { TaskException, ValidationException } from '../core/exceptions.js';
import { ErrorCodes } from '../core/response.js';
import { getStorage, getKernel } from '../core/dependencies.js';

/**
 * 任务服务类
 */
export class TaskService extends CRUDBase {
  constructor() {
    super(TaskModel);
  }

  async initialize(storage) {
    this.setStorage(storage || await getStorage());
  }

  /**
   * 创建任务
   */
  async create(data, options = {}) {
    // 验证触发配置
    this.validateTriggerConfig(data.triggerType, data.triggerConfig);

    return super.create(data, options);
  }

  /**
   * 更新任务
   */
  async update(id, data, options = {}) {
    const existing = await this.getById(id);

    // 检查任务是否正在执行
    if (existing.status === TaskStatus.RUNNING) {
      throw new TaskException(ErrorCodes.TASK_RUNNING, 'Task is currently running');
    }

    // 验证触发配置
    if (data.triggerType || data.triggerConfig) {
      this.validateTriggerConfig(
        data.triggerType || existing.triggerType,
        data.triggerConfig || existing.triggerConfig
      );
    }

    return super.update(id, data, options);
  }

  /**
   * 删除任务
   */
  async delete(id, options = {}) {
    const task = await this.getById(id);

    if (task.status === TaskStatus.RUNNING) {
      throw new TaskException(ErrorCodes.TASK_RUNNING, 'Cannot delete running task');
    }

    return super.delete(id, options);
  }

  /**
   * 启用任务
   */
  async enable(id, options = {}) {
    const task = await this.getById(id);

    if (task.status === TaskStatus.RUNNING) {
      throw new TaskException(ErrorCodes.TASK_RUNNING, 'Task is already running');
    }

    return this.update(id, { status: TaskStatus.ENABLED }, options);
  }

  /**
   * 禁用任务
   */
  async disable(id, options = {}) {
    const task = await this.getById(id);

    if (task.status === TaskStatus.RUNNING) {
      throw new TaskException(ErrorCodes.TASK_RUNNING, 'Cannot disable running task');
    }

    return this.update(id, { status: TaskStatus.DISABLED }, options);
  }

  /**
   * 手动执行任务
   */
  async execute(id, options = {}) {
    const task = await this.getById(id);

    if (task.status === TaskStatus.DISABLED) {
      throw new TaskException(ErrorCodes.TASK_DISABLED, 'Task is disabled');
    }

    // 更新状态为运行中
    await this.update(id, { status: TaskStatus.RUNNING });

    try {
      // 调用内核执行任务
      const kernel = await getKernel();
      const result = await kernel.executeTask?.(task) || { success: true };

      // 更新执行结果
      await this.update(id, {
        status: TaskStatus.ENABLED,
        lastExecuteTime: new Date().toISOString(),
        lastExecuteResult: result.success ? 'success' : 'failure',
        lastExecuteOutput: result.output || '',
        executeCount: task.executeCount + 1,
        successCount: result.success ? task.successCount + 1 : task.successCount,
        failureCount: result.success ? task.failureCount : task.failureCount + 1,
      });

      return result;
    } catch (error) {
      // 更新失败状态
      await this.update(id, {
        status: TaskStatus.ENABLED,
        lastExecuteTime: new Date().toISOString(),
        lastExecuteResult: 'failure',
        lastExecuteOutput: error.message,
        executeCount: task.executeCount + 1,
        failureCount: task.failureCount + 1,
      });

      throw error;
    }
  }

  /**
   * 验证触发配置
   */
  validateTriggerConfig(triggerType, triggerConfig) {
    switch (triggerType) {
      case TriggerType.CRON:
        if (!triggerConfig?.expression) {
          throw new ValidationException([{ field: 'triggerConfig.expression', message: 'Cron expression is required' }]);
        }
        // 可以添加cron表达式验证
        break;

      case TriggerType.INTERVAL:
        if (!triggerConfig?.seconds || triggerConfig.seconds < 1) {
          throw new ValidationException([{ field: 'triggerConfig.seconds', message: 'Interval seconds must be positive' }]);
        }
        break;

      case TriggerType.DATE:
        if (!triggerConfig?.datetime) {
          throw new ValidationException([{ field: 'triggerConfig.datetime', message: 'Execution datetime is required' }]);
        }
        break;

      case TriggerType.MANUAL:
        // 手动触发不需要配置
        break;

      default:
        throw new ValidationException([{ field: 'triggerType', message: 'Invalid trigger type' }]);
    }
  }

  /**
   * 查找单个任务
   */
  async findOne(conditions, options = {}) {
    return this.get(conditions, options);
  }

  /**
   * 获取待执行任务列表
   */
  async getPendingTasks() {
    const now = new Date();
    return this.list({
      status: TaskStatus.ENABLED,
      nextExecuteTime: { $lte: now.toISOString() },
    });
  }
}

export const taskService = new TaskService();
export default TaskService;
