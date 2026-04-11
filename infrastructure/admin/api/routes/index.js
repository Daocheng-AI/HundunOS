/**
 * 路由配置
 * @module infrastructure/admin/api/routes
 */

import * as authController from '../controllers/auth.controller.js';
import * as userController from '../controllers/user.controller.js';
import * as roleController from '../controllers/role.controller.js';
import * as taskController from '../controllers/task.controller.js';
import * as skillController from '../controllers/skill.controller.js';
import * as logController from '../controllers/log.controller.js';
import * as monitorController from '../controllers/monitor.controller.js';

import { createAuthMiddleware, requirePermission, dataScopeFilter, auditLogMiddleware, rateLimitMiddleware } from '../middlewares/index.js';
import { exceptionHandler } from '../../core/exceptions.js';

/**
 * 创建路由配置
 * @param {Object} app - Express/Fastify应用实例
 * @param {Object} options - 配置选项
 */
export function setupRoutes(app, options = {}) {
  const { auth = {}, prefix = '/api/admin' } = options;

  // 中间件
  const authMiddleware = createAuthMiddleware(auth);
  const optionalAuth = createAuthMiddleware({ ...auth, optional: true });

  // ============================================
  // 认证路由 (无需认证)
  // ============================================
  app.post(`${prefix}/auth/login`, authController.login);
  app.post(`${prefix}/auth/logout`, authMiddleware, authController.logout);
  app.post(`${prefix}/auth/refresh`, authController.refreshToken);
  app.get(`${prefix}/auth/profile`, authMiddleware, authController.getProfile);
  app.put(`${prefix}/auth/password`, authMiddleware, authController.changePassword);
  app.post(`${prefix}/auth/api-key`, authMiddleware, authController.generateUserApiKey);

  // ============================================
  // 用户管理路由
  // ============================================
  app.get(`${prefix}/users`, 
    authMiddleware, 
    requirePermission('admin:user:list'),
    dataScopeFilter('user'),
    userController.list
  );
  app.get(`${prefix}/users/:id`, 
    authMiddleware, 
    requirePermission('admin:user:read'),
    userController.getById
  );
  app.post(`${prefix}/users`, 
    authMiddleware, 
    requirePermission('admin:user:create'),
    userController.create
  );
  app.put(`${prefix}/users/:id`, 
    authMiddleware, 
    requirePermission('admin:user:update'),
    userController.update
  );
  app.delete(`${prefix}/users/:id`, 
    authMiddleware, 
    requirePermission('admin:user:delete'),
    userController.remove
  );
  app.delete(`${prefix}/users/batch`, 
    authMiddleware, 
    requirePermission('admin:user:delete'),
    userController.batchRemove
  );
  app.put(`${prefix}/users/:id/password`, 
    authMiddleware, 
    requirePermission('admin:user:reset-password'),
    userController.resetPassword
  );
  app.put(`${prefix}/users/:id/status`, 
    authMiddleware, 
    requirePermission('admin:user:update'),
    userController.updateStatus
  );
  app.put(`${prefix}/users/:id/roles`, 
    authMiddleware, 
    requirePermission('admin:user:update'),
    userController.assignRoles
  );
  app.get(`${prefix}/users/:id/permissions`, 
    authMiddleware, 
    requirePermission('admin:user:read'),
    userController.getPermissions
  );

  // ============================================
  // 角色管理路由
  // ============================================
  app.get(`${prefix}/roles`, 
    authMiddleware, 
    requirePermission('admin:role:list'),
    roleController.list
  );
  app.get(`${prefix}/roles/all`, 
    authMiddleware, 
    roleController.listAll
  );
  app.get(`${prefix}/roles/permissions/tree`, 
    authMiddleware, 
    roleController.getPermissionTree
  );
  app.get(`${prefix}/roles/:id`, 
    authMiddleware, 
    requirePermission('admin:role:read'),
    roleController.getById
  );
  app.post(`${prefix}/roles`, 
    authMiddleware, 
    requirePermission('admin:role:create'),
    roleController.create
  );
  app.put(`${prefix}/roles/:id`, 
    authMiddleware, 
    requirePermission('admin:role:update'),
    roleController.update
  );
  app.delete(`${prefix}/roles/:id`, 
    authMiddleware, 
    requirePermission('admin:role:delete'),
    roleController.remove
  );
  app.get(`${prefix}/roles/:id/users`, 
    authMiddleware, 
    requirePermission('admin:role:read'),
    roleController.getUsers
  );
  app.put(`${prefix}/roles/:id/permissions`, 
    authMiddleware, 
    requirePermission('admin:role:update-permissions'),
    roleController.updatePermissions
  );
  app.put(`${prefix}/roles/:id/data-scope`, 
    authMiddleware, 
    requirePermission('admin:role:update'),
    roleController.updateDataScope
  );

  // ============================================
  // 任务管理路由
  // ============================================
  app.get(`${prefix}/tasks`, 
    authMiddleware, 
    requirePermission('admin:task:list'),
    taskController.list
  );
  app.get(`${prefix}/tasks/stats`, 
    authMiddleware, 
    requirePermission('admin:task:read'),
    taskController.getStats
  );
  app.get(`${prefix}/tasks/:id`, 
    authMiddleware, 
    requirePermission('admin:task:read'),
    taskController.getById
  );
  app.post(`${prefix}/tasks`, 
    authMiddleware, 
    requirePermission('admin:task:create'),
    taskController.create
  );
  app.put(`${prefix}/tasks/:id`, 
    authMiddleware, 
    requirePermission('admin:task:update'),
    taskController.update
  );
  app.delete(`${prefix}/tasks/:id`, 
    authMiddleware, 
    requirePermission('admin:task:delete'),
    taskController.remove
  );
  app.put(`${prefix}/tasks/:id/enable`, 
    authMiddleware, 
    requirePermission('admin:task:update'),
    taskController.enable
  );
  app.put(`${prefix}/tasks/:id/disable`, 
    authMiddleware, 
    requirePermission('admin:task:update'),
    taskController.disable
  );
  app.post(`${prefix}/tasks/:id/execute`, 
    authMiddleware, 
    requirePermission('admin:task:execute'),
    taskController.execute
  );
  app.get(`${prefix}/tasks/:id/logs`, 
    authMiddleware, 
    requirePermission('admin:task:read'),
    taskController.getLogs
  );

  // ============================================
  // Skill管理路由
  // ============================================
  app.get(`${prefix}/skills`, 
    authMiddleware, 
    requirePermission('admin:skill:list'),
    skillController.list
  );
  app.get(`${prefix}/skills/stats`, 
    authMiddleware, 
    requirePermission('admin:skill:read'),
    skillController.getStats
  );
  app.get(`${prefix}/skills/market`, 
    authMiddleware, 
    requirePermission('admin:skill:market'),
    skillController.getMarket
  );
  app.get(`${prefix}/skills/:id`, 
    authMiddleware, 
    requirePermission('admin:skill:read'),
    skillController.getById
  );
  app.put(`${prefix}/skills/:id`, 
    authMiddleware, 
    requirePermission('admin:skill:update'),
    skillController.update
  );
  app.put(`${prefix}/skills/:id/enable`, 
    authMiddleware, 
    requirePermission('admin:skill:update'),
    skillController.enable
  );
  app.put(`${prefix}/skills/:id/disable`, 
    authMiddleware, 
    requirePermission('admin:skill:update'),
    skillController.disable
  );
  app.post(`${prefix}/skills/install`, 
    authMiddleware, 
    requirePermission('admin:skill:install'),
    skillController.install
  );
  app.delete(`${prefix}/skills/:id`, 
    authMiddleware, 
    requirePermission('admin:skill:uninstall'),
    skillController.uninstall
  );

  // ============================================
  // 日志管理路由
  // ============================================
  app.get(`${prefix}/logs/operation`, 
    authMiddleware, 
    requirePermission('admin:log:read'),
    logController.listOperationLogs
  );
  app.get(`${prefix}/logs/operation/:id`, 
    authMiddleware, 
    requirePermission('admin:log:read'),
    logController.getOperationLogById
  );
  app.get(`${prefix}/logs/system`, 
    authMiddleware, 
    requirePermission('admin:log:system'),
    logController.listSystemLogs
  );
  app.get(`${prefix}/logs/export`, 
    authMiddleware, 
    requirePermission('admin:log:export'),
    logController.exportLogs
  );
  app.get(`${prefix}/logs/stats`, 
    authMiddleware, 
    requirePermission('admin:log:read'),
    logController.getStats
  );
  app.get(`${prefix}/logs/modules`, 
    authMiddleware, 
    logController.getModules
  );
  app.post(`${prefix}/logs/clean`, 
    authMiddleware, 
    requirePermission('admin:log:clean'),
    logController.cleanOldLogs
  );

  // ============================================
  // 监控路由
  // ============================================
  app.get(`${prefix}/monitor/system`, 
    authMiddleware, 
    requirePermission('admin:monitor:read'),
    monitorController.getSystemStatus
  );
  app.get(`${prefix}/monitor/kernel`, 
    authMiddleware, 
    requirePermission('admin:monitor:read'),
    monitorController.getKernelStatus
  );
  app.get(`${prefix}/monitor/metrics`, 
    authMiddleware, 
    requirePermission('admin:monitor:read'),
    monitorController.getMetrics
  );
  app.get(`${prefix}/monitor/realtime`, 
    authMiddleware, 
    requirePermission('admin:monitor:read'),
    monitorController.getRealtimeData
  );
  app.get(`${prefix}/monitor/health`, 
    monitorController.healthCheck
  );

  // 全局异常处理
  app.use(exceptionHandler);
}

export default { setupRoutes };
