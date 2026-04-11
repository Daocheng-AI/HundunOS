/**
 * Admin核心模块入口
 * @module infrastructure/admin/core
 */

// 响应封装
export { ResponseSchema, ErrorCodes, getErrorMessage } from './response.js';

// 异常处理
export {
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
} from './exceptions.js';

// 模型混入
export {
  ModelMixin,
  UserMixin,
  TenantMixin,
  SoftDeleteMixin,
  VersionMixin,
  SortMixin,
  TagsMixin,
  createModel,
  FieldTypes,
  Field,
  field,
  generateId,
  getCurrentTime,
  addAuditFields,
  validateModel,
} from './base-model.js';

// 依赖注入
export {
  DependencyContainer,
  container,
  getKernel,
  getStorage,
  getCache,
  getConfig,
  getLogger,
  getCurrentUser,
  getRequestId,
  inject,
  Injectable,
  initializeDependencies,
} from './dependencies.js';

// 泛型CRUD
export { CRUDBase, QueryOperators } from './base-crud.js';

// 默认导出
export default {
  ResponseSchema,
  ErrorCodes,
  AppException,
  ValidationException,
  PermissionException,
  NotFoundException,
  CRUDBase,
  createModel,
  container,
};
