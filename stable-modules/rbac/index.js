/**
 * HundunOS v3.0 - RBAC 角色权限控制
 * 六角色权限系统
 * 
 * 角色: admin / developer / analyst / operator / viewer / guest
 * 权限: read / write / execute / admin / super
 */

import { EventEmitter } from 'events';

// ============================================================================
// 角色定义
// ============================================================================

export const Role = {
    SUPER_ADMIN: 'super_admin',  // 超级管理员
    ADMIN:       'admin',        // 管理员
    DEVELOPER:   'developer',    // 开发者
    ANALYST:     'analyst',      // 分析师
    OPERATOR:    'operator',     // 操作员
    VIEWER:      'viewer',       // 查看者
    GUEST:       'guest'         // 访客
};

/**
 * 角色权限映射
 */
const ROLE_PERMISSIONS = {
    [Role.SUPER_ADMIN]: ['super', 'admin', 'execute', 'write', 'read'],
    [Role.ADMIN]:       ['admin', 'execute', 'write', 'read'],
    [Role.DEVELOPER]:   ['execute', 'write', 'read'],
    [Role.ANALYST]:     ['read', 'execute:query', 'execute:report'],
    [Role.OPERATOR]:    ['execute', 'read'],
    [Role.VIEWER]:      ['read'],
    [Role.GUEST]:       ['read:public']
};

/**
 * 角色层级（数字越大权限越高）
 */
const ROLE_HIERARCHY = {
    [Role.SUPER_ADMIN]: 100,
    [Role.ADMIN]:       80,
    [Role.DEVELOPER]:   60,
    [Role.ANALYST]:     50,
    [Role.OPERATOR]:    40,
    [Role.VIEWER]:      20,
    [Role.GUEST]:       10
};

/**
 * 角色描述
 */
const ROLE_DESCRIPTIONS = {
    [Role.SUPER_ADMIN]: '超级管理员 - 完全控制权限',
    [Role.ADMIN]:       '管理员 - 系统管理权限',
    [Role.DEVELOPER]:   '开发者 - 代码开发权限',
    [Role.ANALYST]:     '分析师 - 数据分析权限',
    [Role.OPERATOR]:    '操作员 - 日常操作权限',
    [Role.VIEWER]:      '查看者 - 只读权限',
    [Role.GUEST]:       '访客 - 公共资源访问'
};

// ============================================================================
// 资源定义
// ============================================================================

export const ResourceType = {
    SYSTEM:    'system',     // 系统配置
    MODULE:    'module',     // 模块
    DATA:      'data',       // 数据
    FILE:      'file',       // 文件
    API:       'api',        // API 接口
    TASK:      'task',       // 任务
    LOG:       'log',        // 日志
    USER:      'user',       // 用户
    SKILL:     'skill',      // 技能
    WORKFLOW:  'workflow',   // 工作流
    EXTENSION: 'extension'   // 扩展
};

/**
 * 操作类型
 */
export const Action = {
    CREATE:    'create',
    READ:      'read',
    UPDATE:    'update',
    DELETE:    'delete',
    EXECUTE:   'execute',
    ADMIN:     'admin',
    EXPORT:    'export',
    IMPORT:    'import'
};

// ============================================================================
// 权限检查器
// ============================================================================

export class RBACManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this.users = new Map();        // userId -> { role, permissions }
        this.resources = new Map();    // resourceId -> { type, owner, acl }
        this.roleOverrides = new Map(); // roleId -> custom permissions
        
        this.defaultRole = config.defaultRole || Role.GUEST;
        this.superAdmins = config.superAdmins || [];
        
        // console.log('[RBAC] Initialized with 7 roles');
    }

    // ========================================================================
    // 用户管理
    // ========================================================================

    /**
     * 注册用户
     */
    registerUser(userId, role = this.defaultRole, metadata = {}) {
        if (!ROLE_PERMISSIONS[role]) {
            throw new Error(`Invalid role: ${role}`);
        }

        const user = {
            userId,
            role,
            permissions: this._getEffectivePermissions(role),
            metadata,
            createdAt: new Date().toISOString()
        };

        this.users.set(userId, user);
        this.emit('user_registered', { userId, role });
        // console.log(`[RBAC] User registered: ${userId} as ${role}`);
        
        return user;
    }

    /**
     * 获取用户角色
     */
    getUserRole(userId) {
        const user = this.users.get(userId);
        return user?.role || this.defaultRole;
    }

    /**
     * 设置用户角色
     */
    setUserRole(userId, newRole) {
        if (!ROLE_PERMISSIONS[newRole]) {
            throw new Error(`Invalid role: ${newRole}`);
        }

        const user = this.users.get(userId);
        if (!user) {
            return this.registerUser(userId, newRole);
        }

        const oldRole = user.role;
        user.role = newRole;
        user.permissions = this._getEffectivePermissions(newRole);
        user.updatedAt = new Date().toISOString();

        this.emit('role_changed', { userId, oldRole, newRole });
        // console.log(`[RBAC] Role changed: ${userId} ${oldRole} -> ${newRole}`);
        
        return user;
    }

    /**
     * 移除用户
     */
    removeUser(userId) {
        const removed = this.users.delete(userId);
        if (removed) {
            this.emit('user_removed', { userId });
        }
        return removed;
    }

    // ========================================================================
    // 权限检查
    // ========================================================================

    /**
     * 检查用户是否有权限
     */
    hasPermission(userId, permission, context = {}) {
        // 超级管理员检查
        if (this.superAdmins.includes(userId)) {
            return true;
        }

        const user = this.users.get(userId);
        if (!user) {
            return this._checkDefaultPermission(permission);
        }

        return this._checkPermission(user.permissions, permission, context);
    }

    /**
     * 检查用户是否可以执行操作
     */
    canPerform(userId, action, resourceType, context = {}) {
        const permission = `${action}:${resourceType}`;
        return this.hasPermission(userId, permission, context);
    }

    /**
     * 检查角色层级
     */
    isRoleAtLeast(userId, minRole) {
        const userRole = this.getUserRole(userId);
        const userLevel = ROLE_HIERARCHY[userRole] || 0;
        const minLevel = ROLE_HIERARCHY[minRole] || 0;
        return userLevel >= minLevel;
    }

    /**
     * 获取用户的可访问资源
     */
    getAccessibleResources(userId, resourceType) {
        const user = this.users.get(userId);
        if (!user) return [];

        const accessible = [];
        for (const [resourceId, resource] of this.resources) {
            if (resourceType && resource.type !== resourceType) continue;
            if (this.canAccess(userId, resourceId)) {
                accessible.push(resourceId);
            }
        }
        return accessible;
    }

    // ========================================================================
    // 资源管理
    // ========================================================================

    /**
     * 注册资源
     */
    registerResource(resourceId, type, owner = null, acl = {}) {
        const resource = {
            resourceId,
            type,
            owner,
            acl,
            createdAt: new Date().toISOString()
        };

        this.resources.set(resourceId, resource);
        return resource;
    }

    /**
     * 检查资源访问权限
     */
    canAccess(userId, resourceId, action = Action.READ) {
        const resource = this.resources.get(resourceId);
        if (!resource) return false;

        // 所有者有完全权限
        if (resource.owner === userId) return true;

        // 检查 ACL
        const aclEntry = resource.acl[userId];
        if (aclEntry) {
            return aclEntry.includes(action);
        }

        // 检查角色权限
        return this.canPerform(userId, action, resource.type);
    }

    /**
     * 授予资源权限
     */
    grantAccess(resourceId, userId, actions) {
        const resource = this.resources.get(resourceId);
        if (!resource) return false;

        if (!resource.acl[userId]) {
            resource.acl[userId] = [];
        }

        for (const action of actions) {
            if (!resource.acl[userId].includes(action)) {
                resource.acl[userId].push(action);
            }
        }

        this.emit('access_granted', { resourceId, userId, actions });
        return true;
    }

    /**
     * 撤销资源权限
     */
    revokeAccess(resourceId, userId, actions = null) {
        const resource = this.resources.get(resourceId);
        if (!resource) return false;

        if (actions) {
            resource.acl[userId] = (resource.acl[userId] || [])
                .filter(a => !actions.includes(a));
        } else {
            delete resource.acl[userId];
        }

        this.emit('access_revoked', { resourceId, userId, actions });
        return true;
    }

    // ========================================================================
    // 角色覆盖
    // ========================================================================

    /**
     * 为角色添加自定义权限
     */
    addRolePermission(role, permission) {
        if (!this.roleOverrides.has(role)) {
            this.roleOverrides.set(role, []);
        }
        this.roleOverrides.get(role).push(permission);

        // 更新所有该角色用户的权限
        for (const [userId, user] of this.users) {
            if (user.role === role) {
                user.permissions = this._getEffectivePermissions(role);
            }
        }
    }

    // ========================================================================
    // 查询接口
    // ========================================================================

    /**
     * 获取所有角色
     */
    getRoles() {
        return Object.entries(ROLE_DESCRIPTIONS).map(([role, desc]) => ({
            role,
            level: ROLE_HIERARCHY[role],
            description: desc,
            permissions: ROLE_PERMISSIONS[role]
        }));
    }

    /**
     * 获取用户详情
     */
    getUser(userId) {
        const user = this.users.get(userId);
        if (!user) return null;

        return {
            ...user,
            level: ROLE_HIERARCHY[user.role]
        };
    }

    /**
     * 获取统计信息
     */
    getStats() {
        const byRole = {};
        for (const user of this.users.values()) {
            byRole[user.role] = (byRole[user.role] || 0) + 1;
        }

        return {
            totalUsers: this.users.size,
            totalResources: this.resources.size,
            byRole,
            roles: this.getRoles()
        };
    }

    // ========================================================================
    // 内部方法
    // ========================================================================

    _getEffectivePermissions(role) {
        const base = ROLE_PERMISSIONS[role] || [];
        const overrides = this.roleOverrides.get(role) || [];
        return [...new Set([...base, ...overrides])];
    }

    _checkPermission(permissions, permission, context) {
        // 精确匹配
        if (permissions.includes(permission)) return true;
        if (permissions.includes('super')) return true;

        // 通配符匹配
        const [action, resource] = permission.split(':');
        if (permissions.includes(action)) return true;
        if (permissions.includes(`${action}:*`)) return true;

        // 上下文检查
        if (context.owner && context.owner === context.requester) {
            return true;
        }

        return false;
    }

    _checkDefaultPermission(permission) {
        const defaultPerms = ROLE_PERMISSIONS[this.defaultRole] || [];
        return defaultPerms.includes(permission);
    }
}

// ============================================================================
// 单例
// ============================================================================

let instance = null;

export function getRBACManager() {
    if (!instance) {
        instance = new RBACManager();
    }
    return instance;
}

export default {
    RBACManager,
    getRBACManager,
    Role,
    ResourceType,
    Action
};
