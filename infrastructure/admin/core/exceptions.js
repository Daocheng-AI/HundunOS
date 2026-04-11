/**
 * 全局异常处理模块
 * 借鉴 FastapiAdmin 的异常处理模式
 * @module infrastructure/admin/core/exceptions
 */

import { ErrorCodes, ResponseSchema } from './response.js';

/**
 * 应用基础异常类
 * 所有业务异常都应继承此类
 */
export class AppException extends Error {
  /**
   * @param {number} code - 错误码
   * @param {string} message - 错误消息
   * @param {*} [details=null] - 错误详情
   */
  constructor(code, message, details = null) {
    super(message);
    this.name = 'AppException';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();

    // 保持正确的堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * 转换为响应对象
   * @returns {ResponseSchema}
   */
  toResponse() {
    return ResponseSchema.error(this.code, this.message, this.details);
  }

  /**
   * 转换为JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

/**
 * 验证异常
 * 用于请求数据验证失败
 */
export class ValidationException extends AppException {
  /**
   * @param {Array|Object|string} errors - 验证错误
   * @param {string} [message='Validation failed'] - 错误消息
   */
  constructor(errors, message = 'Validation failed') {
    super(ErrorCodes.VALIDATION_ERROR, message, errors);
    this.name = 'ValidationException';
  }
}

/**
 * 权限异常
 * 用于权限验证失败
 */
export class PermissionException extends AppException {
  /**
   * @param {string} [message='Permission denied'] - 错误消息
   * @param {string} [permission] - 所需权限
   */
  constructor(message = 'Permission denied', permission) {
    super(ErrorCodes.PERMISSION_DENIED, message, permission ? { permission } : null);
    this.name = 'PermissionException';
  }
}

/**
 * 认证异常
 * 用于认证失败
 */
export class AuthenticationException extends AppException {
  /**
   * @param {string} [message='Authentication failed'] - 错误消息
   * @param {number} [code=ErrorCodes.AUTH_ERROR] - 错误码
   */
  constructor(message = 'Authentication failed', code = ErrorCodes.AUTH_ERROR) {
    super(code, message);
    this.name = 'AuthenticationException';
  }
}

/**
 * 资源不存在异常
 */
export class NotFoundException extends AppException {
  /**
   * @param {string} [resource='Resource'] - 资源名称
   * @param {string} [id] - 资源ID
   */
  constructor(resource = 'Resource', id) {
    const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
    super(ErrorCodes.NOT_FOUND, message, { resource, id });
    this.name = 'NotFoundException';
  }
}

/**
 * 资源已存在异常
 */
export class ConflictException extends AppException {
  /**
   * @param {string} [message='Resource already exists'] - 错误消息
   * @param {*} [details] - 详情
   */
  constructor(message = 'Resource already exists', details) {
    super(ErrorCodes.CONFLICT, message, details);
    this.name = 'ConflictException';
  }
}

/**
 * 业务异常基类
 * 用于业务逻辑错误
 */
export class BusinessException extends AppException {
  /**
   * @param {number} code - 错误码
   * @param {string} message - 错误消息
   * @param {*} [details] - 详情
   */
  constructor(code, message, details) {
    super(code, message, details);
    this.name = 'BusinessException';
  }
}

/**
 * 用户异常
 */
export class UserException extends BusinessException {
  /**
   * @param {number} code - 错误码
   * @param {string} [message] - 错误消息
   */
  constructor(code, message) {
    super(code, message || `User error: ${code}`);
    this.name = 'UserException';
  }
}

/**
 * 角色异常
 */
export class RoleException extends BusinessException {
  /**
   * @param {number} code - 错误码
   * @param {string} [message] - 错误消息
   */
  constructor(code, message) {
    super(code, message || `Role error: ${code}`);
    this.name = 'RoleException';
  }
}

/**
 * 任务异常
 */
export class TaskException extends BusinessException {
  /**
   * @param {number} code - 错误码
   * @param {string} [message] - 错误消息
   */
  constructor(code, message) {
    super(code, message || `Task error: ${code}`);
    this.name = 'TaskException';
  }
}

/**
 * Skill异常
 */
export class SkillException extends BusinessException {
  /**
   * @param {number} code - 错误码
   * @param {string} [message] - 错误消息
   */
  constructor(code, message) {
    super(code, message || `Skill error: ${code}`);
    this.name = 'SkillException';
  }
}

/**
 * 全局异常处理器工厂
 * @param {Object} [options] - 配置选项
 * @param {boolean} [options.includeStack=false] - 是否包含堆栈信息
 * @param {Function} [options.logger] - 日志函数
 * @returns {Function} Express/Fastify 中间件
 */
export function createExceptionHandler(options = {}) {
  const { includeStack = false, logger = console.error } = options;

  return function exceptionHandler(err, req, res, next) {
    // 如果响应已发送，则跳过
    if (res.headersSent) {
      return next(err);
    }

    // 记录错误日志
    logger('Exception caught:', {
      url: req.originalUrl || req.url,
      method: req.method,
      error: err.toJSON ? err.toJSON() : {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
    });

    // 处理 AppException
    if (err instanceof AppException) {
      const response = err.toResponse();
      if (includeStack) {
        response.data = { ...response.data, stack: err.stack };
      }
      return res.status(getHttpStatus(err.code)).json(response);
    }

    // 处理验证错误 (如 Joi, Yup 等)
    if (err.name === 'ValidationError') {
      return res.status(400).json(
        ResponseSchema.validationError(err.details || err.errors || err.message)
      );
    }

    // 处理 JSON 解析错误
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json(
        ResponseSchema.error(ErrorCodes.INVALID_JSON, 'Invalid JSON in request body')
      );
    }

    // 处理其他已知错误
    if (err.name === 'UnauthorizedError') {
      return res.status(401).json(
        ResponseSchema.unauthorized(err.message)
      );
    }

    if (err.name === 'ForbiddenError') {
      return res.status(403).json(
        ResponseSchema.forbidden(err.message)
      );
    }

    // 未知错误
    const response = ResponseSchema.error(
      ErrorCodes.INTERNAL_ERROR,
      'Internal server error'
    );

    if (includeStack) {
      response.data = { stack: err.stack };
    }

    return res.status(500).json(response);
  };
}

/**
 * 根据业务错误码获取HTTP状态码
 * @param {number} code - 业务错误码
 * @returns {number} HTTP状态码
 */
function getHttpStatus(code) {
  if (code === 0) return 200;

  // 认证错误 -> 401
  if (code >= 200 && code < 300) return 401;

  // 权限错误 -> 403
  if (code >= 300 && code < 400) return 403;

  // 资源不存在 -> 404
  if (code === ErrorCodes.NOT_FOUND || code === ErrorCodes.RESOURCE_NOT_FOUND) return 404;

  // 验证错误 -> 400
  if (code >= 100 && code < 200) return 400;

  // 冲突 -> 409
  if (code === ErrorCodes.CONFLICT || code === ErrorCodes.RESOURCE_EXISTS) return 409;

  // 其他 -> 500
  return 500;
}

/**
 * 异常处理中间件（默认配置）
 */
export const exceptionHandler = createExceptionHandler();

export default {
  AppException,
  ValidationException,
  PermissionException,
  AuthenticationException,
  NotFoundException,
  ConflictException,
  BusinessException,
  UserException,
  RoleException,
  TaskException,
  SkillException,
  createExceptionHandler,
  exceptionHandler,
};
