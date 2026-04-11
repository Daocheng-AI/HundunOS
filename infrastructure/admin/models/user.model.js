/**
 * 用户数据模型
 * @module infrastructure/admin/models/user.model
 */

import { createModel, ModelMixin, UserMixin, Field } from '../core/base-model.js';

/**
 * 用户模型定义
 */
export const UserModel = createModel('User', {
  // 用户名
  username: {
    type: 'string',
    required: true,
    unique: true,
    min: 4,
    max: 32,
    pattern: /^[a-zA-Z0-9_]+$/,
    description: 'Username (4-32 characters, alphanumeric and underscore)',
  },

  // 密码（加密存储）
  password: {
    type: 'string',
    required: true,
    min: 8,
    encrypted: true,
    description: 'Password (min 8 characters, encrypted)',
  },

  // 昵称
  nickname: {
    type: 'string',
    min: 2,
    max: 32,
    description: 'Display name',
  },

  // 邮箱
  email: {
    type: 'string',
    format: 'email',
    unique: true,
    sparse: true, // 允许为空时跳过唯一性检查
    description: 'Email address',
  },

  // 手机号
  phone: {
    type: 'string',
    pattern: /^1\d{10}$/,
    sparse: true,
    description: 'Phone number (Chinese format)',
  },

  // 头像URL
  avatar: {
    type: 'string',
    format: 'url',
    description: 'Avatar URL',
  },

  // 状态
  status: {
    type: 'string',
    enum: ['active', 'inactive', 'disabled', 'deleted'],
    default: 'active',
    description: 'User status',
  },

  // 关联角色ID列表
  roleIds: {
    type: 'array',
    items: { type: 'string', ref: 'Role' },
    required: true,
    min: 1,
    default: [],
    description: 'Associated role IDs',
  },

  // 所属部门ID
  deptId: {
    type: 'string',
    ref: 'Dept',
    description: 'Department ID',
  },

  // 是否超级管理员
  isSuperAdmin: {
    type: 'boolean',
    default: false,
    description: 'Is super administrator',
  },

  // 最后登录时间
  lastLoginTime: {
    type: 'datetime',
    description: 'Last login timestamp',
  },

  // 最后登录IP
  lastLoginIp: {
    type: 'string',
    description: 'Last login IP address',
  },

  // 登录次数
  loginCount: {
    type: 'number',
    default: 0,
    min: 0,
    description: 'Total login count',
  },

  // 密码修改时间
  passwordChangedTime: {
    type: 'datetime',
    description: 'Password last changed timestamp',
  },

  // 虚拟字段：角色列表
  roles: {
    virtual: true,
    ref: 'Role',
    localField: 'roleIds',
    foreignField: 'id',
    description: 'Associated roles (virtual)',
  },

  // 虚拟字段：部门
  dept: {
    virtual: true,
    ref: 'Dept',
    localField: 'deptId',
    foreignField: 'id',
    description: 'Department (virtual)',
  },
}, ModelMixin, UserMixin);

/**
 * 用户状态枚举
 */
export const UserStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  DISABLED: 'disabled',
  DELETED: 'deleted',
};

/**
 * 用户字段常量
 */
export const UserFields = {
  ID: 'id',
  USERNAME: 'username',
  PASSWORD: 'password',
  NICKNAME: 'nickname',
  EMAIL: 'email',
  PHONE: 'phone',
  AVATAR: 'avatar',
  STATUS: 'status',
  ROLE_IDS: 'roleIds',
  DEPT_ID: 'deptId',
  IS_SUPER_ADMIN: 'isSuperAdmin',
  CREATED_TIME: 'createdTime',
  UPDATED_TIME: 'updatedTime',
};

/**
 * 默认超级管理员配置
 */
export const DefaultSuperAdmin = {
  username: 'admin',
  password: process.env.HUNDUNOS_ADMIN_DEFAULT_PASSWORD || (() => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[SECURITY] 必须设置 HUNDUNOS_ADMIN_DEFAULT_PASSWORD 环境变量');
    }
    console.warn('[Auth] SECURITY: 使用默认测试密码，生产环境必须设置 HUNDUNOS_ADMIN_DEFAULT_PASSWORD');
    return 'Admin@123-TEST-ONLY';
  })(),
  nickname: '超级管理员',
  isSuperAdmin: true,
  status: UserStatus.ACTIVE,
  roleIds: [], // 超级管理员不需要角色
};

export default UserModel;
