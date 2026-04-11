/**
 * 任务控制器
 * @module infrastructure/admin/api/controllers/task.controller
 */

import { ResponseSchema } from '../../core/response.js';
import { ValidationException } from '../../core/exceptions.js';
import { taskService } from '../../services/task.service.js';

/**
 * 获取任务列表
 * GET /api/admin/tasks
 */
export async function list(req, res) {
  const { page, pageSize, orderBy, ...filters } = req.query;

  const result = await taskService.page(filters, {
    page: parseInt(page) || 1,
    pageSize: Math.min(parseInt(pageSize) || 20, 100),
    orderBy: orderBy || 'createdTime:desc',
  });

  res.json(ResponseSchema.paginated(result.list, result.total, result.page, result.pageSize));
}

/**
 * 获取任务详情
 * GET /api/admin/tasks/:id
 */
export async function getById(req, res) {
  const { id } = req.params;
  const task = await taskService.getById(id);

  res.json(ResponseSchema.success(task));
}

/**
 * 创建任务
 * POST /api/admin/tasks
 */
export async function create(req, res) {
  const data = req.body;
  const task = await taskService.create(data, { userId: req.user?.id });

  res.status(201).json(ResponseSchema.success(task, 'Task created successfully'));
}

/**
 * 更新任务
 * PUT /api/admin/tasks/:id
 */
export async function update(req, res) {
  const { id } = req.params;
  const data = req.body;

  const task = await taskService.update(id, data, { userId: req.user?.id });

  res.json(ResponseSchema.success(task, 'Task updated successfully'));
}

/**
 * 删除任务
 * DELETE /api/admin/tasks/:id
 */
export async function remove(req, res) {
  const { id } = req.params;

  await taskService.delete(id, { userId: req.user?.id });

  res.json(ResponseSchema.success(null, 'Task deleted successfully'));
}

/**
 * 启用任务
 * PUT /api/admin/tasks/:id/enable
 */
export async function enable(req, res) {
  const { id } = req.params;

  const task = await taskService.enable(id, { userId: req.user?.id });

  res.json(ResponseSchema.success(task, 'Task enabled successfully'));
}

/**
 * 禁用任务
 * PUT /api/admin/tasks/:id/disable
 */
export async function disable(req, res) {
  const { id } = req.params;

  const task = await taskService.disable(id, { userId: req.user?.id });

  res.json(ResponseSchema.success(task, 'Task disabled successfully'));
}

/**
 * 手动执行任务
 * POST /api/admin/tasks/:id/execute
 */
export async function execute(req, res) {
  const { id } = req.params;

  const result = await taskService.execute(id, { userId: req.user?.id });

  res.json(ResponseSchema.success(result, 'Task executed successfully'));
}

/**
 * 获取任务执行日志
 * GET /api/admin/tasks/:id/logs
 */
export async function getLogs(req, res) {
  const { id } = req.params;
  const { page, pageSize } = req.query;

  // 验证任务存在
  await taskService.getById(id);

  // 查询执行日志
  const { logService } = await import('../../services/log.service.js');
  const result = await logService.page({
    module: '任务管理',
    businessId: id,
  }, {
    page: parseInt(page) || 1,
    pageSize: Math.min(parseInt(pageSize) || 20, 100),
    orderBy: 'createdTime:desc',
  });

  res.json(ResponseSchema.paginated(result.list, result.total, result.page, result.pageSize));
}

/**
 * 获取任务统计
 * GET /api/admin/tasks/stats
 */
export async function getStats(req, res) {
  const [total, enabled, disabled, running] = await Promise.all([
    taskService.count(),
    taskService.count({ status: 'enabled' }),
    taskService.count({ status: 'disabled' }),
    taskService.count({ status: 'running' }),
  ]);

  res.json(ResponseSchema.success({
    total,
    enabled,
    disabled,
    running,
  }));
}

export default {
  list,
  getById,
  create,
  update,
  remove,
  enable,
  disable,
  execute,
  getLogs,
  getStats,
};
