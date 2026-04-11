/**
 * 统一响应封装模块
 * 借鉴 FastapiAdmin 的 ResponseSchema 设计模式
 * @module infrastructure/admin/core/response
 */

/**
 * 错误码常量定义
 */
export const ErrorCodes = {
  // 成功
  SUCCESS: 0,

  // 通用错误 (1-99)
  UNKNOWN_ERROR: 1,
  BAD_REQUEST: 2,
  UNAUTHORIZED: 3,
  FORBIDDEN: 4,
  NOT_FOUND: 5,
  METHOD_NOT_ALLOWED: 6,
  CONFLICT: 7,
  INTERNAL_ERROR: 8,
  SERVICE_UNAVAILABLE: 9,

  // 验证错误 (100-199)
  VALIDATION_ERROR: 100,
  INVALID_PARAMS: 101,
  INVALID_JSON: 102,
  MISSING_FIELD: 103,
  INVALID_FORMAT: 104,

  // 认证错误 (200-299)
  AUTH_ERROR: 200,
  TOKEN_EXPIRED: 201,
  TOKEN_INVALID: 202,
  LOGIN_FAILED: 203,
  ACCOUNT_DISABLED: 204,
  ACCOUNT_LOCKED: 205,
  PASSWORD_EXPIRED: 206,

  // 权限错误 (300-399)
  PERMISSION_DENIED: 300,
  ROLE_NOT_FOUND: 301,
  INSUFFICIENT_PRIVILEGES: 302,
  DATA_SCOPE_DENIED: 303,

  // 资源错误 (400-499)
  RESOURCE_NOT_FOUND: 404,
  RESOURCE_EXISTS: 409,
  RESOURCE_LOCKED: 423,

  // 用户错误 (1000-1099)
  USER_EXISTS: 1001,
  USER_NOT_FOUND: 1002,
  WEAK_PASSWORD: 1003,
  INVALID_USERNAME: 1004,
  INVALID_EMAIL: 1005,
  INVALID_PHONE: 1006,
  USER_DISABLED: 1007,

  // 角色错误 (1100-1199)
  ROLE_EXISTS: 1101,
  ROLE_IN_USE: 1102,
  ROLE_NOT_FOUND: 1103,

  // 任务错误 (1200-1299)
  TASK_EXISTS: 1201,
  TASK_NOT_FOUND: 1202,
  TASK_RUNNING: 1203,
  TASK_DISABLED: 1204,
  INVALID_CRON: 1205,

  // Skill错误 (1300-1399)
  SKILL_EXISTS: 1301,
  SKILL_NOT_FOUND: 1302,
  SKILL_DISABLED: 1303,
  SKILL_DEPENDENCY_MISSING: 1304,
  SKILL_SIGNATURE_INVALID: 1305,

  // 日志错误 (1400-1499)
  LOG_EXPORT_LIMIT: 1401,
  LOG_QUERY_RANGE: 1402,
};

/**
 * 错误码消息映射
 */
const ErrorCodeMessages = {
  [ErrorCodes.SUCCESS]: 'Success',
  [ErrorCodes.UNKNOWN_ERROR]: 'Unknown error',
  [ErrorCodes.BAD_REQUEST]: 'Bad request',
  [ErrorCodes.UNAUTHORIZED]: 'Unauthorized',
  [ErrorCodes.FORBIDDEN]: 'Forbidden',
  [ErrorCodes.NOT_FOUND]: 'Not found',
  [ErrorCodes.METHOD_NOT_ALLOWED]: 'Method not allowed',
  [ErrorCodes.CONFLICT]: 'Conflict',
  [ErrorCodes.INTERNAL_ERROR]: 'Internal server error',
  [ErrorCodes.SERVICE_UNAVAILABLE]: 'Service unavailable',
  [ErrorCodes.VALIDATION_ERROR]: 'Validation failed',
  [ErrorCodes.INVALID_PARAMS]: 'Invalid parameters',
  [ErrorCodes.INVALID_JSON]: 'Invalid JSON format',
  [ErrorCodes.MISSING_FIELD]: 'Missing required field',
  [ErrorCodes.INVALID_FORMAT]: 'Invalid format',
  [ErrorCodes.AUTH_ERROR]: 'Authentication error',
  [ErrorCodes.TOKEN_EXPIRED]: 'Token expired',
  [ErrorCodes.TOKEN_INVALID]: 'Invalid token',
  [ErrorCodes.LOGIN_FAILED]: 'Login failed',
  [ErrorCodes.ACCOUNT_DISABLED]: 'Account disabled',
  [ErrorCodes.ACCOUNT_LOCKED]: 'Account locked',
  [ErrorCodes.PASSWORD_EXPIRED]: 'Password expired',
  [ErrorCodes.PERMISSION_DENIED]: 'Permission denied',
  [ErrorCodes.ROLE_NOT_FOUND]: 'Role not found',
  [ErrorCodes.INSUFFICIENT_PRIVILEGES]: 'Insufficient privileges',
  [ErrorCodes.DATA_SCOPE_DENIED]: 'Data scope denied',
  [ErrorCodes.RESOURCE_NOT_FOUND]: 'Resource not found',
  [ErrorCodes.RESOURCE_EXISTS]: 'Resource already exists',
  [ErrorCodes.RESOURCE_LOCKED]: 'Resource locked',
  [ErrorCodes.USER_EXISTS]: 'Username already exists',
  [ErrorCodes.USER_NOT_FOUND]: 'User not found',
  [ErrorCodes.WEAK_PASSWORD]: 'Password is too weak',
  [ErrorCodes.INVALID_USERNAME]: 'Invalid username format',
  [ErrorCodes.INVALID_EMAIL]: 'Invalid email format',
  [ErrorCodes.INVALID_PHONE]: 'Invalid phone number',
  [ErrorCodes.USER_DISABLED]: 'User is disabled',
  [ErrorCodes.ROLE_EXISTS]: 'Role name already exists',
  [ErrorCodes.ROLE_IN_USE]: 'Role is in use by users',
  [ErrorCodes.TASK_EXISTS]: 'Task already exists',
  [ErrorCodes.TASK_NOT_FOUND]: 'Task not found',
  [ErrorCodes.TASK_RUNNING]: 'Task is currently running',
  [ErrorCodes.TASK_DISABLED]: 'Task is disabled',
  [ErrorCodes.INVALID_CRON]: 'Invalid cron expression',
  [ErrorCodes.SKILL_EXISTS]: 'Skill already exists',
  [ErrorCodes.SKILL_NOT_FOUND]: 'Skill not found',
  [ErrorCodes.SKILL_DISABLED]: 'Skill is disabled',
  [ErrorCodes.SKILL_DEPENDENCY_MISSING]: 'Skill dependency missing',
  [ErrorCodes.SKILL_SIGNATURE_INVALID]: 'Skill signature invalid',
  [ErrorCodes.LOG_EXPORT_LIMIT]: 'Export limit exceeded (max 10000)',
  [ErrorCodes.LOG_QUERY_RANGE]: 'Query range too large (max 30 days)',
};

/**
 * 获取错误码对应的默认消息
 * @param {number} code - 错误码
 * @returns {string} 错误消息
 */
export function getErrorMessage(code) {
  return ErrorCodeMessages[code] || 'Unknown error';
}

/**
 * 统一响应封装类
 * 所有API响应都应使用此类进行封装
 */
export class ResponseSchema {
  /**
   * @param {Object} options - 响应选项
   * @param {number} [options.code=0] - 业务状态码
   * @param {string} [options.msg='success'] - 响应消息
   * @param {*} [options.data=null] - 响应数据
   * @param {boolean} [options.success=true] - 是否成功
   */
  constructor(options = {}) {
    this.code = options.code ?? ErrorCodes.SUCCESS;
    this.msg = options.msg ?? getErrorMessage(this.code);
    this.data = options.data ?? null;
    this.success = options.success ?? (this.code === ErrorCodes.SUCCESS);
    this.timestamp = Date.now();
  }

  /**
   * 创建成功响应
   * @param {*} data - 响应数据
   * @param {string} [msg='success'] - 响应消息
   * @returns {ResponseSchema}
   */
  static success(data, msg = 'success') {
    return new ResponseSchema({
      code: ErrorCodes.SUCCESS,
      msg,
      data,
      success: true,
    });
  }

  /**
   * 创建错误响应
   * @param {number} code - 错误码
   * @param {string} [msg] - 错误消息（可选，默认使用错误码对应的消息）
   * @param {*} [data=null] - 附加数据
   * @returns {ResponseSchema}
   */
  static error(code, msg, data = null) {
    return new ResponseSchema({
      code,
      msg: msg || getErrorMessage(code),
      data,
      success: false,
    });
  }

  /**
   * 创建分页响应
   * @param {Array} list - 数据列表
   * @param {number} total - 总记录数
   * @param {number} page - 当前页码
   * @param {number} pageSize - 每页条数
   * @param {string} [msg='success'] - 响应消息
   * @returns {ResponseSchema}
   */
  static paginated(list, total, page, pageSize, msg = 'success') {
    const totalPages = Math.ceil(total / pageSize);
    return new ResponseSchema({
      code: ErrorCodes.SUCCESS,
      msg,
      data: {
        list,
        total,
        page,
        pageSize,
        totalPages,
        hasMore: page < totalPages,
      },
      success: true,
    });
  }

  /**
   * 创建验证错误响应
   * @param {Array|Object} errors - 验证错误列表
   * @returns {ResponseSchema}
   */
  static validationError(errors) {
    return new ResponseSchema({
      code: ErrorCodes.VALIDATION_ERROR,
      msg: 'Validation failed',
      data: { errors },
      success: false,
    });
  }

  /**
   * 创建未授权响应
   * @param {string} [msg='Unauthorized'] - 错误消息
   * @returns {ResponseSchema}
   */
  static unauthorized(msg = 'Unauthorized') {
    return ResponseSchema.error(ErrorCodes.UNAUTHORIZED, msg);
  }

  /**
   * 创建禁止访问响应
   * @param {string} [msg='Permission denied'] - 错误消息
   * @returns {ResponseSchema}
   */
  static forbidden(msg = 'Permission denied') {
    return ResponseSchema.error(ErrorCodes.PERMISSION_DENIED, msg);
  }

  /**
   * 创建资源不存在响应
   * @param {string} [resource='Resource'] - 资源名称
   * @returns {ResponseSchema}
   */
  static notFound(resource = 'Resource') {
    return ResponseSchema.error(ErrorCodes.NOT_FOUND, `${resource} not found`);
  }

  /**
   * 转换为JSON对象
   * @returns {Object}
   */
  toJSON() {
    return {
      code: this.code,
      msg: this.msg,
      data: this.data,
      success: this.success,
      timestamp: this.timestamp,
    };
  }
}

export default ResponseSchema;
