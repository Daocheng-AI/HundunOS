/**
 * HundunOS v4.3 - 安全增强
 * API 密钥管理、访问控制、审计日志、数据加密
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * API 密钥管理器
 */
export class ApiKeyManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.keysFile = join(kernel?.config?.storageDir || '.hundunos', 'secrets', 'api-keys.json');
    this.encryptionKey = process.env.HUNDUNOS_ENCRYPTION_KEY;
    mkdirSync(join(kernel?.config?.storageDir || '.hundunos', 'secrets'), { recursive: true });
  }

  /**
   * 加密数据
   */
  encrypt(data) {
    if (!this.encryptionKey) {
      throw new Error('HUNDUNOS_ENCRYPTION_KEY not set');
    }

    const key = scryptSync(this.encryptionKey, 'salt', 32);
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      iv: iv.toString('hex'),
      data: encrypted,
    };
  }

  /**
   * 解密数据
   */
  decrypt(encrypted) {
    if (!this.encryptionKey) {
      throw new Error('HUNDUNOS_ENCRYPTION_KEY not set');
    }

    const key = scryptSync(this.encryptionKey, 'salt', 32);
    const decipher = createDecipheriv('aes-256-cbc', key, Buffer.from(encrypted.iv, 'hex'));

    let decrypted = decipher.update(encrypted.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  }

  /**
   * 添加 API 密钥
   */
  addKey(name, key, provider = 'custom') {
    const keys = this.loadKeys();
    const encrypted = this.encrypt({ key, provider });
    keys[name] = encrypted;
    this.saveKeys(keys);
    return { success: true, message: `API key '${name}' added` };
  }

  /**
   * 获取 API 密钥
   */
  getKey(name) {
    const keys = this.loadKeys();
    const encrypted = keys[name];
    if (!encrypted) {
      return null;
    }
    return this.decrypt(encrypted);
  }

  /**
   * 删除 API 密钥
   */
  removeKey(name) {
    const keys = this.loadKeys();
    delete keys[name];
    this.saveKeys(keys);
    return { success: true, message: `API key '${name}' removed` };
  }

  /**
   * 列出所有密钥名称
   */
  listKeys() {
    const keys = this.loadKeys();
    return Object.keys(keys);
  }

  /**
   * 加载密钥
   */
  loadKeys() {
    if (!existsSync(this.keysFile)) {
      return {};
    }
    try {
      return JSON.parse(readFileSync(this.keysFile, 'utf8'));
    } catch (e) {
      console.error('[ApiKeyManager] Failed to load keys:', e.message);
      return {};
    }
  }

  /**
   * 保存密钥
   */
  saveKeys(keys) {
    writeFileSync(this.keysFile, JSON.stringify(keys, null, 2), 'utf8');
  }
}

/**
 * 访问控制管理器
 */
export class AccessControlManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.policies = new Map();
    this.registerDefaultPolicies();
  }

  /**
   * 注册默认策略
   */
  registerDefaultPolicies() {
    // 工具访问控制
    this.register('tool:read', {
      allow: ['*'],
      deny: [],
    });

    this.register('tool:write', {
      allow: ['admin', 'developer'],
      deny: [],
    });

    this.register('tool:execute', {
      allow: ['admin'],
      deny: [],
    });

    // 路径访问控制
    this.register('path:read', {
      allow: ['*'],
      deny: [],
      whitelist: ['.'],
    });

    this.register('path:write', {
      allow: ['admin', 'developer'],
      deny: [],
      whitelist: ['.'],
    });

    // API 访问控制
    this.register('api:read', {
      allow: ['*'],
      deny: [],
    });

    this.register('api:write', {
      allow: ['admin', 'developer'],
      deny: [],
    });

    this.register('api:admin', {
      allow: ['admin'],
      deny: [],
    });
  }

  /**
   * 注册策略
   */
  register(name, policy) {
    this.policies.set(name, policy);
  }

  /**
   * 检查权限
   */
  check(resource, action, roles = []) {
    const policyName = `${resource}:${action}`;
    const policy = this.policies.get(policyName);

    if (!policy) {
      return { allowed: true, reason: 'No policy found' };
    }

    // 检查 deny 列表
    for (const deniedRole of policy.deny || []) {
      if (roles.includes(deniedRole)) {
        return { allowed: false, reason: `Role '${deniedRole}' is denied` };
      }
    }

    // 检查 allow 列表
    const allowed = policy.allow || [];
    if (allowed.includes('*')) {
      return { allowed: true };
    }

    for (const role of roles) {
      if (allowed.includes(role)) {
        return { allowed: true };
      }
    }

    return { allowed: false, reason: 'No matching role in allow list' };
  }

  /**
   * 检查路径白名单
   */
  checkPath(path, whitelist = ['.']) {
    const { resolve, relative } = require('path');
    const projectRoot = this.kernel?.config?.projectRoot || process.cwd();

    for (const allowed of whitelist) {
      const allowedPath = resolve(projectRoot, allowed);
      const resolvedPath = resolve(projectRoot, path);
      const rel = relative(allowedPath, resolvedPath);
      if (!rel.startsWith('..') && !rel.startsWith('..\\')) {
        return { allowed: true };
      }
    }

    return { allowed: false, reason: 'Path not in whitelist' };
  }

  /**
   * 列出所有策略
   */
  listPolicies() {
    const policies = {};
    for (const [name, policy] of this.policies) {
      policies[name] = {
        allow: policy.allow,
        deny: policy.deny,
      };
    }
    return policies;
  }
}

/**
 * 审计日志管理器
 */
export class AuditLogger {
  constructor(kernel) {
    this.kernel = kernel;
    this.logFile = join(kernel?.config?.storageDir || '.hundunos', 'audit', 'audit.log');
    mkdirSync(join(kernel?.config?.storageDir || '.hundunos', 'audit'), { recursive: true });
  }

  /**
   * 记录审计日志
   */
  log(action, data, context = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      data,
      context: {
        sessionId: context.sessionId,
        userId: context.userId,
        roles: context.roles,
        ip: context.ip,
        userAgent: context.userAgent,
      },
    };

    const logLine = JSON.stringify(entry) + '\n';
    require('fs').appendFileSync(this.logFile, logLine, 'utf8');

    return entry;
  }

  /**
   * 查询审计日志
   */
  query(filters = {}) {
    const fs = require('fs');
    if (!existsSync(this.logFile)) {
      return [];
    }

    const lines = fs.readFileSync(this.logFile, 'utf8').split('\n').filter(Boolean);
    const entries = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);

    // 过滤
    let filtered = entries;
    if (filters.action) {
      filtered = filtered.filter(e => e.action === filters.action);
    }
    if (filters.sessionId) {
      filtered = filtered.filter(e => e.context?.sessionId === filters.sessionId);
    }
    if (filters.userId) {
      filtered = filtered.filter(e => e.context?.userId === filters.userId);
    }
    if (filters.startTime) {
      filtered = filtered.filter(e => new Date(e.timestamp) >= new Date(filters.startTime));
    }
    if (filters.endTime) {
      filtered = filtered.filter(e => new Date(e.timestamp) <= new Date(filters.endTime));
    }

    // 限制返回数量
    const limit = filters.limit || 100;
    return filtered.slice(-limit);
  }

  /**
   * 获取统计
   */
  getStats() {
    const entries = this.query();
    const stats = {
      total: entries.length,
      byAction: {},
      byUser: {},
      bySession: {},
    };

    for (const entry of entries) {
      stats.byAction[entry.action] = (stats.byAction[entry.action] || 0) + 1;
      if (entry.context?.userId) {
        stats.byUser[entry.context.userId] = (stats.byUser[entry.context.userId] || 0) + 1;
      }
      if (entry.context?.sessionId) {
        stats.bySession[entry.context.sessionId] = (stats.bySession[entry.context.sessionId] || 0) + 1;
      }
    }

    return stats;
  }
}

export default { ApiKeyManager, AccessControlManager, AuditLogger };
