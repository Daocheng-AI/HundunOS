/**
 * 日志控制器
 * @module infrastructure/admin/api/controllers/log.controller
 */

import { ResponseSchema } from '../../core/response.js';
import { ValidationException } from '../../core/exceptions.js';
import { logService } from '../../services/log.service.js';

/**
 * 获取操作日志列表
 * GET /api/admin/logs/operation
 */
export async function listOperationLogs(req, res) {
  const { page, pageSize, orderBy, startTime, endTime, module, operatorId, result, ...rest } = req.query;

  // 构建查询条件
  const conditions = { ...rest };
  if (module) conditions.module = module;
  if (operatorId) conditions.operatorId = operatorId;
  if (result) conditions.result = result;

  // 时间范围验证
  if (startTime && endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const daysDiff = (end - start) / (1000 * 60 * 60 * 24);
    if (daysDiff > 30) {
      throw new ValidationException([{ message: 'Query range cannot exceed 30 days' }]);
    }
  }

  const resultData = await logService.queryLogs(conditions, {
    page: parseInt(page) || 1,
    pageSize: Math.min(parseInt(pageSize) || 20, 100),
    orderBy: orderBy || 'createdTime:desc',
    startTime,
    endTime,
  });

  res.json(ResponseSchema.paginated(
    resultData.list,
    resultData.total,
    resultData.page,
    resultData.pageSize
  ));
}

/**
 * 获取操作日志详情
 * GET /api/admin/logs/operation/:id
 */
export async function getOperationLogById(req, res) {
  const { id } = req.params;
  const log = await logService.getById(id);

  res.json(ResponseSchema.success(log));
}

/**
 * 获取系统日志列表
 * GET /api/admin/logs/system
 */
export async function listSystemLogs(req, res) {
  const { page, pageSize, level, startTime, endTime } = req.query;

  // 调用内核获取系统日志
  try {
    const { getKernel } = await import('../../core/dependencies.js');
    const kernel = await getKernel();
    
    const logs = await kernel.getSystemLogs?.({
      level,
      startTime,
      endTime,
      page: parseInt(page) || 1,
      pageSize: Math.min(parseInt(pageSize) || 20, 100),
    }) || { list: [], total: 0 };

    res.json(ResponseSchema.paginated(logs.list, logs.total, parseInt(page) || 1, parseInt(pageSize) || 20));
  } catch (error) {
    res.json(ResponseSchema.success({ list: [], total: 0 }));
  }
}

/**
 * 导出日志
 * GET /api/admin/logs/export
 */
export async function exportLogs(req, res) {
  const { format = 'json', startTime, endTime, module, operatorId } = req.query;

  // 构建查询条件
  const conditions = {};
  if (module) conditions.module = module;
  if (operatorId) conditions.operatorId = operatorId;

  // 导出日志
  const data = await logService.exportLogs(conditions, format);

  // 设置响应头
  const filename = `logs_${new Date().toISOString().split('T')[0]}.${format}`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');

  res.send(data);
}

/**
 * 获取日志统计
 * GET /api/admin/logs/stats
 */
export async function getStats(req, res) {
  const { startTime, endTime } = req.query;

  const conditions = {};
  if (startTime || endTime) {
    conditions.startTime = startTime;
    conditions.endTime = endTime;
  }

  const stats = await logService.getOperationStats(conditions);

  res.json(ResponseSchema.success(stats));
}

/**
 * 获取模块列表
 * GET /api/admin/logs/modules
 */
export async function getModules(req, res) {
  const { LogModules } = await import('../../models/log.model.js');
  
  res.json(ResponseSchema.success(Object.values(LogModules)));
}

/**
 * 清理过期日志
 * POST /api/admin/logs/clean
 */
export async function cleanOldLogs(req, res) {
  const { daysToKeep = 90 } = req.body;

  const count = await logService.cleanOldLogs(daysToKeep);

  res.json(ResponseSchema.success({ deletedCount: count }, 'Old logs cleaned successfully'));
}

export default {
  listOperationLogs,
  getOperationLogById,
  listSystemLogs,
  exportLogs,
  getStats,
  getModules,
  cleanOldLogs,
};
