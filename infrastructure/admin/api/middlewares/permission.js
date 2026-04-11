/**
 * 权限中间件
 * @module infrastructure/admin/api/middlewares/permission
 */

import { PermissionException } from '../../core/exceptions.js';
import { ErrorCodes, ResponseSchema } from '../../core/response.js';
import { getStorage } from '../../core/dependencies.js';

/**
 * 权限缓存
 */
const permissionCache = new Map();
const CACHE_TTL = 60000; // 1分钟

/**
 * 检查用户是否拥有指定权限
 * @param {Object} user - 用户对象
 * @param {string} permission - 权限标识
 * @returns {Promise<boolean>}
 */
async function checkPermission(user, permission) {
  // 超级管理员拥有所有权限
  if (user.isSuperAdmin) return true;

  // 检查缓存
  const cacheKey = `${user.id}:${permission}`;
  const cached = permissionCache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.result;
  }

  // 获取用户角色权限
  const permissions = await getUserPermissions(user.id);
  const hasPermission = permissions.includes('*') || permissions.includes(permission);

  // 更新缓存
  permissionCache.set(cacheKey, { result: hasPermission, time: Date.now() });

  return hasPermission;
}

/**
 * 获取用户所有权限
 * @param {string} userId - 用户ID
 * @returns {Promise<Array<string>>}
 */
async function getUserPermissions(userId) {
  const storage = await getStorage();
  
  // 获取用户
  const users = await storage.loadModelData('User');
  const user = users.find(u => u.id === userId);
  if (!user) return [];

  // 获取角色
  const roles = await storage.loadModelData('Role');
  const userRoles = roles.filter(r => user.roleIds.includes(r.id) && r.status === 'active');

  // 合并所有权限
  const permissions = new Set();
  for (const role of userRoles) {
    for (const perm of (role.permissions || [])) {
      permissions.add(perm);
    }
  }

  return Array.from(permissions);
}

/**
 * 权限验证中间件工厂
 * @param {string|Array<string>} permissions - 所需权限
 * @param {Object} [options={}] - 配置选项
 * @param {string} [options.mode='any'] - 验证模式: 'any' 或 'all'
 * @returns {Function} 中间件函数
 */
export function requirePermission(permissions, options = {}) {
  const { mode = 'any' } = options;
  const permissionList = Array.isArray(permissions) ? permissions : [permissions];

  return async function permissionMiddleware(req, res, next) {
    try {
      const user = req.user;

      if (!user) {
        throw new PermissionException('Authentication required');
      }

      // 超级管理员跳过权限检查
      if (user.isSuperAdmin) {
        return next();
      }

      // 检查权限
      const results = await Promise.all(
        permissionList.map(p => checkPermission(user, p))
      );

      const hasPermission = mode === 'all' 
        ? results.every(r => r) 
        : results.some(r => r);

      if (!hasPermission) {
        throw new PermissionException(
          `Permission denied: ${permissionList.join(', ')}`
        );
      }

      next();
    } catch (error) {
      if (error instanceof PermissionException) {
        return res.status(403).json(error.toResponse());
      }
      next(error);
    }
  };
}

/**
 * 角色验证中间件工厂
 * @param {string|Array<string>} roles - 所需角色编码
 * @param {Object} [options={}] - 配置选项
 * @param {string} [options.mode='any'] - 验证模式: 'any' 或 'all'
 * @returns {Function} 中间件函数
 */
export function requireRole(roles, options = {}) {
  const { mode = 'any' } = options;
  const roleList = Array.isArray(roles) ? roles : [roles];

  return async function roleMiddleware(req, res, next) {
    try {
      const user = req.user;

      if (!user) {
        throw new PermissionException('Authentication required');
      }

      // 超级管理员跳过角色检查
      if (user.isSuperAdmin) {
        return next();
      }

      // 获取用户角色
      const storage = await getStorage();
      const allRoles = await storage.loadModelData('Role');
      const userRoles = allRoles.filter(r => user.roleIds.includes(r.id));
      const userRoleCodes = userRoles.map(r => r.code);

      // 检查角色
      const hasRole = mode === 'all'
        ? roleList.every(r => userRoleCodes.includes(r))
        : roleList.some(r => userRoleCodes.includes(r));

      if (!hasRole) {
        throw new PermissionException(
          `Role required: ${roleList.join(', ')}`
        );
      }

      next();
    } catch (error) {
      if (error instanceof PermissionException) {
        return res.status(403).json(error.toResponse());
      }
      next(error);
    }
  };
}

/**
 * 超级管理员验证中间件
 */
export function requireSuperAdmin() {
  return async function superAdminMiddleware(req, res, next) {
    try {
      const user = req.user;

      if (!user) {
        throw new PermissionException('Authentication required');
      }

      if (!user.isSuperAdmin) {
        throw new PermissionException('Super admin required');
      }

      next();
    } catch (error) {
      if (error instanceof PermissionException) {
        return res.status(403).json(error.toResponse());
      }
      next(error);
    }
  };
}

/**
 * 数据权限过滤中间件
 * 根据用户的数据权限范围过滤查询条件
 */
export function dataScopeFilter(resourceType) {
  return async function dataScopeMiddleware(req, res, next) {
    try {
      const user = req.user;

      if (!user) {
        return next();
      }

      // 超级管理员不限制数据范围
      if (user.isSuperAdmin) {
        return next();
      }

      // 获取用户的数据权限范围
      const storage = await getStorage();
      const roles = await storage.loadModelData('Role');
      const userRoles = roles.filter(r => user.roleIds.includes(r.id) && r.status === 'active');

      // 取最大数据权限范围
      const maxDataScope = Math.max(...userRoles.map(r => r.dataScope || 1));

      // 根据数据权限范围添加过滤条件
      switch (maxDataScope) {
        case 1: // 仅本人数据
          req.dataScope = { createdBy: user.id };
          break;
        case 2: // 本部门数据
          req.dataScope = { deptId: user.deptId };
          break;
        case 3: // 本部门及子级数据
          // 需要查询子部门
          req.dataScope = { deptId: user.deptId }; // 简化实现
          break;
        case 4: // 全部数据
          req.dataScope = {};
          break;
        case 5: // 自定义数据范围
          const customScopes = userRoles.flatMap(r => r.customDataScope || []);
          req.dataScope = { deptId: { $in: customScopes } };
          break;
        default:
          req.dataScope = { createdBy: user.id };
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * 清除权限缓存
 */
export function clearPermissionCache(userId) {
  if (userId) {
    for (const key of permissionCache.keys()) {
      if (key.startsWith(userId)) {
        permissionCache.delete(key);
      }
    }
  } else {
    permissionCache.clear();
  }
}

export default {
  requirePermission,
  requireRole,
  requireSuperAdmin,
  dataScopeFilter,
  clearPermissionCache,
};
