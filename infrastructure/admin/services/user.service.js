/**
 * 用户服务
 * @module infrastructure/admin/services/user.service
 */

import { CRUDBase } from '../core/base-crud.js';
import { UserModel, UserStatus, UserFields } from '../models/user.model.js';
import { UserException, ValidationException, ConflictException, NotFoundException } from '../core/exceptions.js';
import { ErrorCodes } from '../core/response.js';
import { getStorage } from '../core/dependencies.js';

/**
 * 用户服务类
 * 继承泛型CRUD基类，添加用户特有业务逻辑
 */
export class UserService extends CRUDBase {
  constructor() {
    super(UserModel);
  }

  /**
   * 初始化服务
   * @param {Object} storage - 存储适配器
   */
  async initialize(storage) {
    this.setStorage(storage || await getStorage());
  }

  /**
   * 创建用户
   * @param {Object} data - 用户数据
   * @param {Object} [options={}] - 选项
   * @returns {Promise<Object>}
   */
  async create(data, options = {}) {
    // 验证用户名唯一性
    const existing = await this.findOne({ username: data.username });
    if (existing) {
      throw new UserException(ErrorCodes.USER_EXISTS, 'Username already exists');
    }

    // 验证邮箱唯一性
    if (data.email) {
      const emailExists = await this.findOne({ email: data.email });
      if (emailExists) {
        throw new ValidationException([{ field: 'email', message: 'Email already exists' }]);
      }
    }

    // 验证密码强度
    this.validatePasswordStrength(data.password);

    // 加密密码
    data.password = await this.hashPassword(data.password);

    return super.create(data, options);
  }

  /**
   * 更新用户
   * @param {string} id - 用户ID
   * @param {Object} data - 更新数据
   * @param {Object} [options={}] - 选项
   * @returns {Promise<Object>}
   */
  async update(id, data, options = {}) {
    // 获取现有用户
    const existing = await this.getById(id);

    // 检查是否尝试修改超级管理员
    if (existing.isSuperAdmin && !options.allowModifySuperAdmin) {
      throw new UserException(ErrorCodes.PERMISSION_DENIED, 'Cannot modify super admin');
    }

    // 验证用户名唯一性
    if (data.username && data.username !== existing.username) {
      const usernameExists = await this.findOne({ username: data.username });
      if (usernameExists) {
        throw new UserException(ErrorCodes.USER_EXISTS, 'Username already exists');
      }
    }

    // 验证邮箱唯一性
    if (data.email && data.email !== existing.email) {
      const emailExists = await this.findOne({ email: data.email });
      if (emailExists) {
        throw new ValidationException([{ field: 'email', message: 'Email already exists' }]);
      }
    }

    // 处理密码更新
    if (data.password) {
      this.validatePasswordStrength(data.password);
      data.password = await this.hashPassword(data.password);
    } else {
      delete data.password; // 不更新密码
    }

    return super.update(id, data, options);
  }

  /**
   * 删除用户
   * @param {string} id - 用户ID
   * @param {Object} [options={}] - 选项
   * @returns {Promise<boolean>}
   */
  async delete(id, options = {}) {
    const user = await this.getById(id);

    // 禁止删除超级管理员
    if (user.isSuperAdmin) {
      throw new UserException(ErrorCodes.PERMISSION_DENIED, 'Cannot delete super admin');
    }

    return super.delete(id, options);
  }

  /**
   * 用户登录验证
   * @param {string} username - 用户名
   * @param {string} password - 密码
   * @returns {Promise<Object>} 用户对象
   */
  async authenticate(username, password) {
    const user = await this.findOne({ username });

    if (!user) {
      throw new UserException(ErrorCodes.LOGIN_FAILED, 'Invalid username or password');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UserException(ErrorCodes.ACCOUNT_DISABLED, 'Account is disabled');
    }

    // 验证密码
    const isValid = await this.verifyPassword(password, user.password);
    if (!isValid) {
      throw new UserException(ErrorCodes.LOGIN_FAILED, 'Invalid username or password');
    }

    return user;
  }

  /**
   * 更新登录信息
   * @param {string} id - 用户ID
   * @param {string} ip - 登录IP
   * @returns {Promise<void>}
   */
  async updateLoginInfo(id, ip) {
    const user = await this.getById(id);
    await this.update(id, {
      lastLoginTime: new Date().toISOString(),
      lastLoginIp: ip,
      loginCount: (user.loginCount || 0) + 1,
    });
  }

  /**
   * 修改密码
   * @param {string} id - 用户ID
   * @param {string} oldPassword - 旧密码
   * @param {string} newPassword - 新密码
   * @returns {Promise<void>}
   */
  async changePassword(id, oldPassword, newPassword) {
    const user = await this.getById(id);

    // 验证旧密码
    const isValid = await this.verifyPassword(oldPassword, user.password);
    if (!isValid) {
      throw new UserException(ErrorCodes.AUTH_ERROR, 'Invalid old password');
    }

    // 验证新密码强度
    this.validatePasswordStrength(newPassword);

    // 更新密码
    await this.update(id, {
      password: await this.hashPassword(newPassword),
      passwordChangedTime: new Date().toISOString(),
    });
  }

  /**
   * 重置密码（管理员操作）
   * @param {string} id - 用户ID
   * @param {string} newPassword - 新密码
   * @param {Object} [options={}] - 选项
   * @returns {Promise<void>}
   */
  async resetPassword(id, newPassword, options = {}) {
    const user = await this.getById(id);

    if (user.isSuperAdmin && !options.allowModifySuperAdmin) {
      throw new UserException(ErrorCodes.PERMISSION_DENIED, 'Cannot reset super admin password');
    }

    this.validatePasswordStrength(newPassword);

    await this.update(id, {
      password: await this.hashPassword(newPassword),
      passwordChangedTime: new Date().toISOString(),
    }, options);
  }

  /**
   * 更新用户状态
   * @param {string} id - 用户ID
   * @param {string} status - 新状态
   * @param {Object} [options={}] - 选项
   * @returns {Promise<Object>}
   */
  async updateStatus(id, status, options = {}) {
    const user = await this.getById(id);

    if (user.isSuperAdmin && !options.allowModifySuperAdmin) {
      throw new UserException(ErrorCodes.PERMISSION_DENIED, 'Cannot modify super admin status');
    }

    if (!Object.values(UserStatus).includes(status)) {
      throw new ValidationException([{ field: 'status', message: 'Invalid status' }]);
    }

    return this.update(id, { status }, options);
  }

  /**
   * 分配角色
   * @param {string} id - 用户ID
   * @param {Array<string>} roleIds - 角色ID列表
   * @param {Object} [options={}] - 选项
   * @returns {Promise<Object>}
   */
  async assignRoles(id, roleIds, options = {}) {
    if (!Array.isArray(roleIds) || roleIds.length === 0) {
      throw new ValidationException([{ field: 'roleIds', message: 'At least one role is required' }]);
    }

    return this.update(id, { roleIds }, options);
  }

  /**
   * 验证密码强度
   * @param {string} password - 密码
   * @throws {ValidationException}
   */
  validatePasswordStrength(password) {
    const errors = [];

    if (password.length < 8) {
      errors.push({ message: 'Password must be at least 8 characters' });
    }
    if (!/[A-Z]/.test(password)) {
      errors.push({ message: 'Password must contain uppercase letter' });
    }
    if (!/[a-z]/.test(password)) {
      errors.push({ message: 'Password must contain lowercase letter' });
    }
    if (!/[0-9]/.test(password)) {
      errors.push({ message: 'Password must contain number' });
    }

    if (errors.length > 0) {
      throw new UserException(ErrorCodes.WEAK_PASSWORD, 'Password is too weak', errors);
    }
  }

  /**
   * 加密密码
   * @param {string} password - 明文密码
   * @returns {Promise<string>} 加密后的密码
   */
  async hashPassword(password) {
    // 使用Node.js内置的crypto模块
    const crypto = await import('crypto');
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  }

  /**
   * 验证密码
   * @param {string} password - 明文密码
   * @param {string} hashedPassword - 加密后的密码
   * @returns {Promise<boolean>}
   */
  async verifyPassword(password, hashedPassword) {
    const crypto = await import('crypto');
    const [salt, hash] = hashedPassword.split(':');
    const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
  }

  /**
   * 查找单个用户（不抛出异常）
   * @param {Object} conditions - 查询条件
   * @param {Object} [options={}] - 选项
   * @returns {Promise<Object|null>}
   */
  async findOne(conditions, options = {}) {
    return this.get(conditions, options);
  }

  /**
   * 根据用户名查找用户
   * @param {string} username - 用户名
   * @returns {Promise<Object|null>}
   */
  async findByUsername(username) {
    return this.findOne({ username });
  }

  /**
   * 根据邮箱查找用户
   * @param {string} email - 邮箱
   * @returns {Promise<Object|null>}
   */
  async findByEmail(email) {
    return this.findOne({ email });
  }

  /**
   * 获取用户权限列表
   * @param {string} id - 用户ID
   * @returns {Promise<Array<string>>}
   */
  async getUserPermissions(id) {
    const user = await this.getById(id);

    // 超级管理员拥有所有权限
    if (user.isSuperAdmin) {
      return ['*'];
    }

    // 需要查询角色服务获取权限
    // 这里返回空数组，实际使用时需要注入RoleService
    return [];
  }
}

// 导出单例
export const userService = new UserService();

export default UserService;
