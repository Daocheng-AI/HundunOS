/**
 * 数据模型入口
 * @module infrastructure/admin/models
 */

export { UserModel, UserStatus, UserFields, DefaultSuperAdmin } from './user.model.js';
export { RoleModel, DataScope, DataScopeLabels, PredefinedRoles, RoleFields } from './role.model.js';
export { TaskModel, TaskStatus, TriggerType, ExecuteResult, ConcurrencyStrategy, TaskFields } from './task.model.js';
export { OperationLogModel, LogResult, HttpMethod, LogModules, LogOperations, SensitiveFields, LogFields } from './log.model.js';
export { SkillModel, SkillStatus, InstallSource, SkillFields, SkillCategories } from './skill.model.js';

export default {
  UserModel,
  RoleModel,
  TaskModel,
  OperationLogModel,
  SkillModel,
};
