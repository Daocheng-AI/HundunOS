/**
 * 角色控制器
 * @module infrastructure/admin/api/controllers/role.controller
 */

import { ResponseSchema } from '../../core/response.js';
import { ValidationException } from '../../core/exceptions.js';
import { roleService } from '../../services/role.service.js';

/**
 * 获取角色列表
 * GET /api/admin/roles
 */
export async function list(req, res) {
  const { page, pageSize, orderBy, ...filters } = req.query;

  const result = await roleService.page(filters, {
    page: parseInt(page) || 1,
    pageSize: Math.min(parseInt(pageSize) || 20, 100),
    orderBy,
  });

  res.json(ResponseSchema.paginated(result.list, result.total, result.page, result.pageSize));
}

/**
 * 获取所有角色（下拉选择用）
 * GET /api/admin/roles/all
 */
export async function listAll(req, res) {
  const roles = await roleService.list({ status: 'active' }, {
    fields: ['id', 'name', 'code', 'level'],
    orderBy: 'level:desc',
  });

  res.json(ResponseSchema.success(roles));
}

/**
 * 获取角色详情
 * GET /api/admin/roles/:id
 */
export async function getById(req, res) {
  const { id } = req.params;
  const role = await roleService.getById(id);

  res.json(ResponseSchema.success(role));
}

/**
 * 创建角色
 * POST /api/admin/roles
 */
export async function create(req, res) {
  const data = req.body;
  const role = await roleService.create(data, { userId: req.user?.id });

  res.status(201).json(ResponseSchema.success(role, 'Role created successfully'));
}

/**
 * 更新角色
 * PUT /api/admin/roles/:id
 */
export async function update(req, res) {
  const { id } = req.params;
  const data = req.body;

  const role = await roleService.update(id, data, { userId: req.user?.id });

  res.json(ResponseSchema.success(role, 'Role updated successfully'));
}

/**
 * 删除角色
 * DELETE /api/admin/roles/:id
 */
export async function remove(req, res) {
  const { id } = req.params;

  await roleService.delete(id, { userId: req.user?.id });

  res.json(ResponseSchema.success(null, 'Role deleted successfully'));
}

/**
 * 获取角色关联的用户
 * GET /api/admin/roles/:id/users
 */
export async function getUsers(req, res) {
  const { id } = req.params;
  const { page, pageSize } = req.query;

  // 验证角色存在
  await roleService.getById(id);

  // 查询关联用户
  const { userService } = await import('../../services/user.service.js');
  const result = await userService.page({ roleIds: id }, {
    page: parseInt(page) || 1,
    pageSize: Math.min(parseInt(pageSize) || 20, 100),
  });

  // 移除敏感字段
  result.list = result.list.map(u => {
    delete u.password;
    return u;
  });

  res.json(ResponseSchema.paginated(result.list, result.total, result.page, result.pageSize));
}

/**
 * 更新角色权限
 * PUT /api/admin/roles/:id/permissions
 */
export async function updatePermissions(req, res) {
  const { id } = req.params;
  const { permissions } = req.body;

  const role = await roleService.updatePermissions(id, permissions, { userId: req.user?.id });

  res.json(ResponseSchema.success(role, 'Permissions updated successfully'));
}

/**
 * 更新数据权限范围
 * PUT /api/admin/roles/:id/data-scope
 */
export async function updateDataScope(req, res) {
  const { id } = req.params;
  const { dataScope, customDataScope } = req.body;

  const role = await roleService.updateDataScope(id, dataScope, customDataScope, {
    userId: req.user?.id,
  });

  res.json(ResponseSchema.success(role, 'Data scope updated successfully'));
}

/**
 * 获取权限树
 * GET /api/admin/roles/permissions/tree
 */
export async function getPermissionTree(req, res) {
  // 预定义权限树
  const permissionTree = [
    {
      module: 'admin',
      name: '管理后台',
      children: [
        {
          module: 'user',
          name: '用户管理',
          permissions: ['list', 'read', 'create', 'update', 'delete', 'reset-password'],
        },
        {
          module: 'role',
          name: '角色管理',
          permissions: ['list', 'read', 'create', 'update', 'delete', 'update-permissions'],
        },
        {
          module: 'task',
          name: '任务管理',
          permissions: ['list', 'read', 'create', 'update', 'delete', 'execute'],
        },
        {
          module: 'skill',
          name: 'Skill管理',
          permissions: ['list', 'read', 'update', 'install', 'uninstall'],
        },
        {
          module: 'log',
          name: '日志管理',
          permissions: ['read', 'export'],
        },
        {
          module: 'monitor',
          name: '系统监控',
          permissions: ['read'],
        },
      ],
    },
  ];

  // 展开权限列表
  const expandPermissions = (tree, prefix = '') => {
    const result = [];
    for (const node of tree) {
      const modulePrefix = prefix ? `${prefix}:${node.module}` : node.module;
      if (node.permissions) {
        for (const perm of node.permissions) {
          result.push({
            code: `${modulePrefix}:${perm}`,
            name: `${node.name} - ${perm}`,
          });
        }
      }
      if (node.children) {
        result.push(...expandPermissions(node.children, modulePrefix));
      }
    }
    return result;
  };

  const permissions = expandPermissions(permissionTree);

  res.json(ResponseSchema.success({ tree: permissionTree, permissions }));
}

export default {
  list,
  listAll,
  getById,
  create,
  update,
  remove,
  getUsers,
  updatePermissions,
  updateDataScope,
  getPermissionTree,
};
