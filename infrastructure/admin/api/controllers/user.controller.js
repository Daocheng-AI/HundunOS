/**
 * 用户控制器
 * @module infrastructure/admin/api/controllers/user.controller
 */

import { ResponseSchema } from '../../core/response.js';
import { ValidationException, NotFoundException } from '../../core/exceptions.js';
import { userService } from '../../services/user.service.js';

/**
 * 获取用户列表
 * GET /api/admin/users
 */
export async function list(req, res) {
  const { page, pageSize, orderBy, ...filters } = req.query;

  // 应用数据权限过滤
  if (req.dataScope) {
    Object.assign(filters, req.dataScope);
  }

  const result = await userService.page(filters, {
    page: parseInt(page) || 1,
    pageSize: Math.min(parseInt(pageSize) || 20, 100),
    orderBy,
  });

  res.json(ResponseSchema.paginated(result.list, result.total, result.page, result.pageSize));
}

/**
 * 获取用户详情
 * GET /api/admin/users/:id
 */
export async function getById(req, res) {
  const { id } = req.params;
  const user = await userService.getById(id);

  // 移除敏感字段
  delete user.password;

  res.json(ResponseSchema.success(user));
}

/**
 * 创建用户
 * POST /api/admin/users
 */
export async function create(req, res) {
  const data = req.body;
  const user = await userService.create(data, { userId: req.user?.id });

  // 移除敏感字段
  delete user.password;

  res.status(201).json(ResponseSchema.success(user, 'User created successfully'));
}

/**
 * 更新用户
 * PUT /api/admin/users/:id
 */
export async function update(req, res) {
  const { id } = req.params;
  const data = req.body;

  const user = await userService.update(id, data, {
    userId: req.user?.id,
    allowModifySuperAdmin: req.user?.isSuperAdmin,
  });

  delete user.password;

  res.json(ResponseSchema.success(user, 'User updated successfully'));
}

/**
 * 删除用户
 * DELETE /api/admin/users/:id
 */
export async function remove(req, res) {
  const { id } = req.params;

  await userService.delete(id, {
    userId: req.user?.id,
    allowModifySuperAdmin: req.user?.isSuperAdmin,
  });

  res.json(ResponseSchema.success(null, 'User deleted successfully'));
}

/**
 * 批量删除用户
 * DELETE /api/admin/users/batch
 */
export async function batchRemove(req, res) {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ValidationException([{ message: 'IDs array is required' }]);
  }

  const count = await userService.deleteMany(ids, { userId: req.user?.id });

  res.json(ResponseSchema.success({ count }, 'Users deleted successfully'));
}

/**
 * 重置密码
 * PUT /api/admin/users/:id/password
 */
export async function resetPassword(req, res) {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword) {
    throw new ValidationException([{ message: 'New password is required' }]);
  }

  await userService.resetPassword(id, newPassword, {
    userId: req.user?.id,
    allowModifySuperAdmin: req.user?.isSuperAdmin,
  });

  res.json(ResponseSchema.success(null, 'Password reset successfully'));
}

/**
 * 更新用户状态
 * PUT /api/admin/users/:id/status
 */
export async function updateStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;

  const user = await userService.updateStatus(id, status, {
    userId: req.user?.id,
    allowModifySuperAdmin: req.user?.isSuperAdmin,
  });

  res.json(ResponseSchema.success(user, 'Status updated successfully'));
}

/**
 * 分配角色
 * PUT /api/admin/users/:id/roles
 */
export async function assignRoles(req, res) {
  const { id } = req.params;
  const { roleIds } = req.body;

  const user = await userService.assignRoles(id, roleIds, { userId: req.user?.id });

  res.json(ResponseSchema.success(user, 'Roles assigned successfully'));
}

/**
 * 获取用户权限列表
 * GET /api/admin/users/:id/permissions
 */
export async function getPermissions(req, res) {
  const { id } = req.params;
  const permissions = await userService.getUserPermissions(id);

  res.json(ResponseSchema.success({ permissions }));
}

export default {
  list,
  getById,
  create,
  update,
  remove,
  batchRemove,
  resetPassword,
  updateStatus,
  assignRoles,
  getPermissions,
};
