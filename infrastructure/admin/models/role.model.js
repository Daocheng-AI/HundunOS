/**
 * 角色数据模型
 * @module infrastructure/admin/models/role.model
 */

import { createModel, ModelMixin, Field } from '../core/base-model.js';

/**
 * 角色模型定义
 */
export const RoleModel = createModel('Role', {
  // 角色名称
  name: {
    type: 'string',
    required: true,
    unique: true,
    min: 2,
    max: 32,
    description: 'Role name',
  },

  // 角色编码（用于程序判断）
  code: {
    type: 'string',
    required: true,
    unique: true,
    pattern: /^[a-z_]+$/,
    description: 'Role code (lowercase and underscore only)',
  },

  // 角色描述
  description: {
    type: 'string',
    max: 200,
    description: 'Role description',
  },

  // 角色层级（用于权限比较）
  level: {
    type: 'number',
    required: true,
    min: 0,
    max: 100,
    description: 'Role level (0-100, higher = more privileges)',
  },

  // 权限列表
  permissions: {
    type: 'array',
    items: 'string',
    required: true,
    default: [],
    description: 'Permission codes',
  },

  // 数据权限范围
  dataScope: {
    type: 'number',
    enum: [1, 2, 3, 4, 5],
    default: 1,
    description: 'Data scope: 1=self, 2=dept, 3=dept+children, 4=all, 5=custom',
  },

  // 自定义数据范围（当dataScope=5时使用）
  customDataScope: {
    type: 'array',
    items: 'string',
    default: [],
    description: 'Custom data scope (dept IDs)',
  },

  // 状态
  status: {
    type: 'string',
    enum: ['active', 'inactive'],
    default: 'active',
    description: 'Role status',
  },

  // 排序号
  sortOrder: {
    type: 'number',
    default: 0,
    description: 'Sort order',
  },

  // 虚拟字段：关联用户
  users: {
    virtual: true,
    ref: 'User',
    through: 'roleIds',
    description: 'Users with this role (virtual)',
  },
}, ModelMixin);

/**
 * 数据权限范围枚举
 */
export const DataScope = {
  SELF: 1,           // 仅本人数据
  DEPT: 2,           // 本部门数据
  DEPT_CHILDREN: 3,  // 本部门及子级数据
  ALL: 4,            // 全部数据
  CUSTOM: 5,         // 自定义数据范围
};

/**
 * 数据权限范围描述
 */
export const DataScopeLabels = {
  [DataScope.SELF]: '仅本人数据',
  [DataScope.DEPT]: '本部门数据',
  [DataScope.DEPT_CHILDREN]: '本部门及子级数据',
  [DataScope.ALL]: '全部数据',
  [DataScope.CUSTOM]: '自定义数据范围',
};

/**
 * 预定义角色
 */
export const PredefinedRoles = {
  SUPER_ADMIN: {
    name: '超级管理员',
    code: 'super_admin',
    level: 100,
    permissions: ['*'], // 所有权限
    dataScope: DataScope.ALL,
    status: 'active',
  },
  ADMIN: {
    name: '系统管理员',
    code: 'admin',
    level: 80,
    permissions: [
      'admin:user:*',
      'admin:role:read',
      'admin:log:read',
      'admin:monitor:read',
    ],
    dataScope: DataScope.ALL,
    status: 'active',
  },
  DEVELOPER: {
    name: '开发者',
    code: 'developer',
    level: 60,
    permissions: [
      'admin:skill:*',
      'admin:task:*',
      'admin:log:read',
      'admin:monitor:read',
    ],
    dataScope: DataScope.DEPT_CHILDREN,
    status: 'active',
  },
  OPERATOR: {
    name: '运维人员',
    code: 'operator',
    level: 40,
    permissions: [
      'admin:task:read',
      'admin:task:execute',
      'admin:monitor:read',
      'admin:log:read',
    ],
    dataScope: DataScope.DEPT,
    status: 'active',
  },
  VIEWER: {
    name: '只读用户',
    code: 'viewer',
    level: 20,
    permissions: [
      'admin:monitor:read',
      'admin:log:read',
    ],
    dataScope: DataScope.SELF,
    status: 'active',
  },
};

/**
 * 角色字段常量
 */
export const RoleFields = {
  ID: 'id',
  NAME: 'name',
  CODE: 'code',
  LEVEL: 'level',
  PERMISSIONS: 'permissions',
  DATA_SCOPE: 'dataScope',
  STATUS: 'status',
};

export default RoleModel;
