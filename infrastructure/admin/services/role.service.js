/**
 * 角色服务
 * @module infrastructure/admin/services/role.service
 */

import { CRUDBase } from '../core/base-crud.js';
import { RoleModel, DataScope } from '../models/role.model.js';
import { RoleException, ValidationException, ConflictException } from '../core/exceptions.js';
import { ErrorCodes } from '../core/response.js';
import { getStorage } from '../core/dependencies.js';

/**
 * 角色服务类
 */
export class RoleService extends CRUDBase {
  constructor() {
    super(RoleModel);
  }

  async initialize(storage) {
    this.setStorage(storage || await getStorage());
  }

  /**
   * 创建角色
   */
  async create(data, options = {}) {
    // 验证名称唯一性
    const existing = await this.findOne({ name: data.name });
    if (existing) {
      throw new RoleException(ErrorCodes.ROLE_EXISTS, 'Role name already exists');
    }

    // 验证编码唯一性
    const codeExists = await this.findOne({ code: data.code });
    if (codeExists) {
      throw new ValidationException([{ field: 'code', message: 'Role code already exists' }]);
    }

    return super.create(data, options);
  }

  /**
   * 更新角色
   */
  async update(id, data, options = {}) {
    const existing = await this.getById(id);

    // 验证名称唯一性
    if (data.name && data.name !== existing.name) {
      const nameExists = await this.findOne({ name: data.name });
      if (nameExists) {
        throw new RoleException(ErrorCodes.ROLE_EXISTS, 'Role name already exists');
      }
    }

    // 验证编码唯一性
    if (data.code && data.code !== existing.code) {
      const codeExists = await this.findOne({ code: data.code });
      if (codeExists) {
        throw new ValidationException([{ field: 'code', message: 'Role code already exists' }]);
      }
    }

    return super.update(id, data, options);
  }

  /**
   * 删除角色（检查是否有关联用户）
   */
  async delete(id, options = {}) {
    // 检查是否有关联用户
    const { userService } = await import('./user.service.js');
    const users = await userService.list({ roleIds: id });
    if (users.length > 0) {
      throw new RoleException(ErrorCodes.ROLE_IN_USE, 'Role is in use by users');
    }

    return super.delete(id, options);
  }

  /**
   * 更新角色权限
   */
  async updatePermissions(id, permissions, options = {}) {
    if (!Array.isArray(permissions)) {
      throw new ValidationException([{ field: 'permissions', message: 'Permissions must be an array' }]);
    }

    return this.update(id, { permissions }, options);
  }

  /**
   * 更新数据权限范围
   */
  async updateDataScope(id, dataScope, customDataScope, options = {}) {
    if (!Object.values(DataScope).includes(dataScope)) {
      throw new ValidationException([{ field: 'dataScope', message: 'Invalid data scope' }]);
    }

    const updateData = { dataScope };
    if (dataScope === DataScope.CUSTOM && customDataScope) {
      updateData.customDataScope = customDataScope;
    }

    return this.update(id, updateData, options);
  }

  /**
   * 查找单个角色
   */
  async findOne(conditions, options = {}) {
    return this.get(conditions, options);
  }

  /**
   * 根据编码查找角色
   */
  async findByCode(code) {
    return this.findOne({ code });
  }

  /**
   * 获取角色的所有权限（包括继承）
   */
  async getRolePermissions(id) {
    const role = await this.getById(id);
    return role.permissions || [];
  }

  /**
   * 检查角色是否有指定权限
   */
  async hasPermission(id, permission) {
    const permissions = await this.getRolePermissions(id);
    return permissions.includes('*') || permissions.includes(permission);
  }
}

export const roleService = new RoleService();
export default RoleService;
