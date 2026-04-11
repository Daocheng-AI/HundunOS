/**
 * 监控控制器
 * @module infrastructure/admin/api/controllers/monitor.controller
 */

import { ResponseSchema } from '../../core/response.js';
import { getKernel, getStorage } from '../../core/dependencies.js';
import os from 'os';

/**
 * 获取系统状态
 * GET /api/admin/monitor/system
 */
export async function getSystemStatus(req, res) {
  // 获取系统信息
  const cpuUsage = process.cpuUsage();
  const memoryUsage = process.memoryUsage();
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const uptime = process.uptime();

  const systemStatus = {
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system,
      cores: os.cpus().length,
      model: os.cpus()[0]?.model || 'unknown',
    },
    memory: {
      total: totalMemory,
      free: freeMemory,
      used: totalMemory - freeMemory,
      usagePercent: ((totalMemory - freeMemory) / totalMemory * 100).toFixed(2),
      process: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
      },
    },
    os: {
      platform: os.platform(),
      type: os.type(),
      release: os.release(),
      hostname: os.hostname(),
      arch: os.arch(),
    },
    process: {
      pid: process.pid,
      uptime,
      nodeVersion: process.version,
    },
    time: {
      now: new Date().toISOString(),
      uptime: formatUptime(uptime),
    },
  };

  res.json(ResponseSchema.success(systemStatus));
}

/**
 * 获取内核状态
 * GET /api/admin/monitor/kernel
 */
export async function getKernelStatus(req, res) {
  try {
    const kernel = await getKernel();
    
    const kernelStatus = await kernel.getStatus?.() || {
      status: 'unknown',
      version: 'unknown',
      uptime: 0,
    };

    res.json(ResponseSchema.success(kernelStatus));
  } catch (error) {
    res.json(ResponseSchema.success({
      status: 'offline',
      error: error.message,
    }));
  }
}

/**
 * 获取监控指标
 * GET /api/admin/monitor/metrics
 */
export async function getMetrics(req, res) {
  const storage = await getStorage();

  // 获取各模块统计
  const [userCount, roleCount, taskCount, skillCount, logCount] = await Promise.all([
    countRecords(storage, 'User'),
    countRecords(storage, 'Role'),
    countRecords(storage, 'Task'),
    countRecords(storage, 'Skill'),
    countRecords(storage, 'OperationLog'),
  ]);

  // 获取任务执行统计
  const tasks = await storage.loadModelData('Task');
  const taskStats = {
    total: tasks.length,
    enabled: tasks.filter(t => t.status === 'enabled').length,
    running: tasks.filter(t => t.status === 'running').length,
    totalExecutions: tasks.reduce((sum, t) => sum + (t.executeCount || 0), 0),
    successRate: calculateSuccessRate(tasks),
  };

  // 获取Skill执行统计
  const skills = await storage.loadModelData('Skill');
  const skillStats = {
    total: skills.length,
    enabled: skills.filter(s => s.status === 'enabled').length,
    totalExecutions: skills.reduce((sum, s) => sum + (s.executeCount || 0), 0),
  };

  const metrics = {
    users: { total: userCount },
    roles: { total: roleCount },
    tasks: taskStats,
    skills: skillStats,
    logs: { total: logCount },
    timestamp: Date.now(),
  };

  res.json(ResponseSchema.success(metrics));
}

/**
 * 健康检查
 * GET /api/admin/monitor/health
 */
export async function healthCheck(req, res) {
  const checks = {
    api: { status: 'ok', message: 'API is running' },
    storage: { status: 'unknown' },
    kernel: { status: 'unknown' },
  };

  // 检查存储
  try {
    const storage = await getStorage();
    await storage.loadModelData('User');
    checks.storage = { status: 'ok', message: 'Storage is accessible' };
  } catch (error) {
    checks.storage = { status: 'error', message: error.message };
  }

  // 检查内核
  try {
    const kernel = await getKernel();
    const status = await kernel.getStatus?.();
    checks.kernel = { status: status?.status === 'running' ? 'ok' : 'degraded', message: status?.status || 'unknown' };
  } catch (error) {
    checks.kernel = { status: 'error', message: error.message };
  }

  // 计算整体状态
  const allStatuses = Object.values(checks).map(c => c.status);
  const overallStatus = allStatuses.every(s => s === 'ok') ? 'ok' :
                         allStatuses.some(s => s === 'error') ? 'error' : 'degraded';

  const response = {
    status: overallStatus,
    checks,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  };

  res.status(overallStatus === 'ok' ? 200 : 503).json(ResponseSchema.success(response));
}

/**
 * 获取实时数据（用于Dashboard）
 * GET /api/admin/monitor/realtime
 */
export async function getRealtimeData(req, res) {
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  const realtimeData = {
    memory: {
      used: memoryUsage.heapUsed,
      total: memoryUsage.heapTotal,
      percent: (memoryUsage.heapUsed / memoryUsage.heapTotal * 100).toFixed(2),
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system,
    },
    timestamp: Date.now(),
  };

  res.json(ResponseSchema.success(realtimeData));
}

/**
 * 辅助函数：格式化运行时间
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
}

/**
 * 辅助函数：计算记录数
 */
async function countRecords(storage, modelName) {
  try {
    const data = await storage.loadModelData(modelName);
    return data.length;
  } catch {
    return 0;
  }
}

/**
 * 辅助函数：计算成功率
 */
function calculateSuccessRate(tasks) {
  const totalSuccess = tasks.reduce((sum, t) => sum + (t.successCount || 0), 0);
  const totalFailure = tasks.reduce((sum, t) => sum + (t.failureCount || 0), 0);
  const total = totalSuccess + totalFailure;
  return total > 0 ? (totalSuccess / total * 100).toFixed(2) : 0;
}

export default {
  getSystemStatus,
  getKernelStatus,
  getMetrics,
  healthCheck,
  getRealtimeData,
};
