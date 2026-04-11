/**
 * 审计日志中间件
 * @module infrastructure/admin/api/middlewares/audit-log
 */

import { LogModules, LogOperations, SensitiveFields } from '../../models/log.model.js';
import { getStorage } from '../../core/dependencies.js';

/**
 * 模块路径映射
 */
const ModulePathMap = {
  '/api/admin/auth': LogModules.AUTH,
  '/api/admin/users': LogModules.USER,
  '/api/admin/roles': LogModules.ROLE,
  '/api/admin/tasks': LogModules.TASK,
  '/api/admin/skills': LogModules.SKILL,
  '/api/admin/logs': LogModules.LOG,
  '/api/admin/monitor': LogModules.MONITOR,
};

/**
 * 方法操作映射
 */
const MethodOperationMap = {
  GET: LogOperations.READ,
  POST: LogOperations.CREATE,
  PUT: LogOperations.UPDATE,
  PATCH: LogOperations.UPDATE,
  DELETE: LogOperations.DELETE,
};

/**
 * 从路径获取模块名
 * @param {string} path - 请求路径
 * @returns {string}
 */
function getModuleFromPath(path) {
  for (const [prefix, module] of Object.entries(ModulePathMap)) {
    if (path.startsWith(prefix)) {
      return module;
    }
  }
  return LogModules.SYSTEM;
}

/**
 * 从方法获取操作名
 * @param {string} method - HTTP方法
 * @param {string} path - 请求路径
 * @returns {string}
 */
function getOperationFromMethod(method, path) {
  const baseOperation = MethodOperationMap[method] || method;
  
  // 特殊路径处理
  if (path.includes('/login')) return LogOperations.LOGIN;
  if (path.includes('/logout')) return LogOperations.LOGOUT;
  if (path.includes('/export')) return LogOperations.EXPORT;
  if (path.includes('/import')) return LogOperations.IMPORT;
  if (path.includes('/execute')) return LogOperations.EXECUTE;
  if (path.includes('/enable')) return LogOperations.ENABLE;
  if (path.includes('/disable')) return LogOperations.DISABLE;

  return baseOperation;
}

/**
 * 敏感参数脱敏
 * @param {Object} params - 参数对象
 * @returns {Object}
 */
function sanitizeParams(params) {
  if (!params || typeof params !== 'object') return params;

  const sanitized = Array.isArray(params) ? [...params] : { ...params };

  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    if (SensitiveFields.some(s => lowerKey.includes(s.toLowerCase()))) {
      sanitized[key] = '******';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeParams(sanitized[key]);
    }
  }

  return sanitized;
}

/**
 * 获取客户端IP
 * @param {Object} req - 请求对象
 * @returns {string}
 */
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         'unknown';
}

/**
 * 审计日志中间件工厂
 * @param {Object} [options={}] - 配置选项
 * @param {Array<string>} [options.excludePaths=[]] - 排除路径
 * @param {Array<string>} [options.excludeMethods=[]] - 排除方法
 * @param {boolean} [options.logBody=true] - 是否记录请求体
 * @param {boolean} [options.logResponse=false] - 是否记录响应体
 * @returns {Function} 中间件函数
 */
export function createAuditLogMiddleware(options = {}) {
  const {
    excludePaths = ['/api/admin/monitor/health', '/api/admin/logs'],
    excludeMethods = [],
    logBody = true,
    logResponse = false,
  } = options;

  return async function auditLogMiddleware(req, res, next) {
    const startTime = Date.now();

    // 检查是否排除
    const shouldExclude = excludePaths.some(p => req.path?.startsWith(p)) ||
                          excludeMethods.includes(req.method);
    
    if (shouldExclude) {
      return next();
    }

    // 保存原始方法
    const originalEnd = res.end;
    const originalJson = res.json;

    // 响应数据
    let responseBody = null;

    // 拦截 res.json
    res.json = function (data) {
      responseBody = data;
      return originalJson.call(this, data);
    };

    // 拦截 res.end
    res.end = async function (data, encoding) {
      const duration = Date.now() - startTime;

      // 记录审计日志
      try {
        await recordAuditLog(req, res, duration, responseBody, options);
      } catch (error) {
        console.error('Failed to record audit log:', error);
      }

      return originalEnd.call(this, data, encoding);
    };

    next();
  };
}

/**
 * 记录审计日志
 */
async function recordAuditLog(req, res, duration, responseBody, options) {
  const user = req.user;
  const statusCode = res.statusCode;

  // 构建日志数据
  const logData = {
    module: getModuleFromPath(req.path || req.url),
    operation: getOperationFromMethod(req.method, req.path || req.url),
    method: req.method,
    url: req.originalUrl || req.url,
    params: options.logBody ? sanitizeParams(req.body) : undefined,
    headers: {
      'user-agent': req.headers['user-agent'],
      'content-type': req.headers['content-type'],
    },
    result: statusCode < 400 ? 'success' : 'failure',
    duration,
    operatorId: user?.id,
    operatorName: user?.username || 'anonymous',
    ip: getClientIp(req),
    userAgent: req.headers['user-agent'],
    requestId: req.headers['x-request-id'] || req.id,
  };

  // 添加错误信息
  if (statusCode >= 400 && responseBody) {
    logData.errorMsg = responseBody.msg || responseBody.message || 'Unknown error';
  }

  // 添加业务ID（从路径参数提取）
  const pathParts = (req.path || req.url).split('/');
  const lastPart = pathParts[pathParts.length - 1];
  if (lastPart && /^[a-f0-9-]{36}$/i.test(lastPart)) {
    logData.businessId = lastPart;
  }

  // 保存日志
  try {
    const storage = await getStorage();
    const logs = await storage.loadModelData('OperationLog');
    const log = {
      ...logData,
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdTime: new Date().toISOString(),
    };
    logs.push(log);
    await storage.saveModelData('OperationLog', logs);
  } catch (error) {
    console.error('Failed to save audit log:', error);
  }
}

/**
 * 手动记录审计日志
 * @param {Object} logData - 日志数据
 */
export async function manualAuditLog(logData) {
  try {
    const storage = await getStorage();
    const logs = await storage.loadModelData('OperationLog');
    const log = {
      ...logData,
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdTime: new Date().toISOString(),
    };
    logs.push(log);
    await storage.saveModelData('OperationLog', logs);
  } catch (error) {
    console.error('Failed to save manual audit log:', error);
  }
}

/**
 * 默认审计日志中间件
 */
export const auditLogMiddleware = createAuditLogMiddleware();

export default {
  createAuditLogMiddleware,
  auditLogMiddleware,
  manualAuditLog,
};
