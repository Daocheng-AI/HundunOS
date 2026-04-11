/**
 * 日志服务
 * @module infrastructure/admin/services/log.service
 */

import { CRUDBase } from '../core/base-crud.js';
import { OperationLogModel, LogResult, SensitiveFields } from '../models/log.model.js';
import { ValidationException } from '../core/exceptions.js';
import { ErrorCodes } from '../core/response.js';
import { getStorage } from '../core/dependencies.js';

/**
 * 日志服务类
 */
export class LogService extends CRUDBase {
  constructor() {
    super(OperationLogModel);
  }

  async initialize(storage) {
    this.setStorage(storage || await getStorage());
  }

  /**
   * 记录操作日志
   */
  async log(logData) {
    // 脱敏处理
    if (logData.params) {
      logData.params = this.sanitizeParams(logData.params);
    }

    return this.create({
      ...logData,
      result: logData.result || LogResult.SUCCESS,
    });
  }

  /**
   * 记录成功日志
   */
  async logSuccess(logData) {
    return this.log({ ...logData, result: LogResult.SUCCESS });
  }

  /**
   * 记录失败日志
   */
  async logFailure(logData, error) {
    return this.log({
      ...logData,
      result: LogResult.FAILURE,
      errorMsg: error?.message || 'Unknown error',
      errorStack: error?.stack,
    });
  }

  /**
   * 查询日志列表
   */
  async queryLogs(conditions = {}, options = {}) {
    const { startTime, endTime, ...restConditions } = conditions;

    // 构建时间范围条件
    if (startTime || endTime) {
      restConditions.createdTime = {};
      if (startTime) restConditions.createdTime.$gte = startTime;
      if (endTime) restConditions.createdTime.$lte = endTime;
    }

    return this.page(restConditions, options);
  }

  /**
   * 导出日志
   */
  async exportLogs(conditions = {}, format = 'json') {
    // 检查导出数量限制
    const total = await this.count(conditions);
    if (total > 10000) {
      throw new ValidationException([{
        message: 'Export limit exceeded (max 10000). Please narrow your query.',
      }]);
    }

    const logs = await this.list(conditions, { limit: 10000 });

    switch (format) {
      case 'csv':
        return this.toCSV(logs);
      case 'json':
      default:
        return JSON.stringify(logs, null, 2);
    }
  }

  /**
   * 转换为CSV格式
   */
  toCSV(logs) {
    if (logs.length === 0) return '';

    const headers = ['id', 'module', 'operation', 'method', 'url', 'result', 'duration', 'operatorName', 'ip', 'createdTime'];
    const rows = logs.map(log => headers.map(h => {
      const value = log[h];
      // CSV转义
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value ?? '';
    }));

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  /**
   * 脱敏处理参数
   */
  sanitizeParams(params) {
    if (!params || typeof params !== 'object') return params;

    const sanitized = Array.isArray(params) ? [...params] : { ...params };

    for (const key of Object.keys(sanitized)) {
      if (SensitiveFields.includes(key.toLowerCase())) {
        sanitized[key] = '******';
      } else if (typeof sanitized[key] === 'object') {
        sanitized[key] = this.sanitizeParams(sanitized[key]);
      }
    }

    return sanitized;
  }

  /**
   * 获取用户操作日志
   */
  async getUserLogs(userId, options = {}) {
    return this.queryLogs({ operatorId: userId }, options);
  }

  /**
   * 获取模块操作日志
   */
  async getModuleLogs(module, options = {}) {
    return this.queryLogs({ module }, options);
  }

  /**
   * 获取失败日志
   */
  async getFailureLogs(conditions = {}, options = {}) {
    return this.queryLogs({ ...conditions, result: LogResult.FAILURE }, options);
  }

  /**
   * 清理过期日志
   */
  async cleanOldLogs(daysToKeep = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const oldLogs = await this.list({
      createdTime: { $lt: cutoffDate.toISOString() },
    }, { fields: ['id'] });

    if (oldLogs.length > 0) {
      await this.deleteMany(oldLogs.map(l => l.id));
    }

    return oldLogs.length;
  }

  /**
   * 获取操作统计
   */
  async getOperationStats(conditions = {}) {
    const logs = await this.list(conditions);

    const stats = {
      total: logs.length,
      success: logs.filter(l => l.result === LogResult.SUCCESS).length,
      failure: logs.filter(l => l.result === LogResult.FAILURE).length,
      byModule: {},
      byOperator: {},
      avgDuration: 0,
    };

    // 按模块统计
    for (const log of logs) {
      stats.byModule[log.module] = (stats.byModule[log.module] || 0) + 1;
    }

    // 按操作人统计
    for (const log of logs) {
      stats.byOperator[log.operatorName] = (stats.byOperator[log.operatorName] || 0) + 1;
    }

    // 平均耗时
    if (logs.length > 0) {
      stats.avgDuration = logs.reduce((sum, l) => sum + (l.duration || 0), 0) / logs.length;
    }

    return stats;
  }
}

export const logService = new LogService();
export default LogService;
