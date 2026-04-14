/**
 * HundunOS v4.3 - 安全增强
 * API 密钥管理、访问控制、审计日志、数据加密
 */

import { readFile, writeFile, appendFile, stat, rename } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { join, relative, resolve } from 'path';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { envManager } from './config/env-manager.js';
import { errorManager, ErrorType } from './error-manager.js';

/**
 * API 密钥管理器
 */
export class ApiKeyManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.keysFile = join(kernel?.config?.storageDir || '.hundunos', 'secrets', 'api-keys.json');
    const env = kernel?.config?.environment || process.env.NODE_ENV || 'development';
    const encryptionKey = envManager.get('HUNDUNOS_ENCRYPTION_KEY');
    if (!encryptionKey) {
      if (env === 'production') {
        throw errorManager.createError(
          'HUNDUNOS_ENCRYPTION_KEY is required in production',
          ErrorType.SECURITY,
          'ENCRYPTION_KEY_MISSING'
        );
      }
      console.warn('[ApiKeyManager] HUNDUNOS_ENCRYPTION_KEY not set — using auto-generated key (NOT for production!)');
      this.encryptionKey = randomBytes(32).toString('hex');
      this._autoKey = true;
    } else {
      this.encryptionKey = encryptionKey;
      this._autoKey = false;
    }
    mkdirSync(join(kernel?.config?.storageDir || '.hundunos', 'secrets'), { recursive: true });
  }

  /**
   * 加密数据 — 使用随机 salt（从 HUNDUNOS_ENCRYPTION_KEY 派生）
   */
  encrypt(data) {
    if (!this.encryptionKey) {
      throw errorManager.createError(
        'HUNDUNOS_ENCRYPTION_KEY not set',
        ErrorType.SECURITY,
        'ENCRYPTION_KEY_MISSING'
      );
    }

    try {
      const salt = randomBytes(16);
      const key = scryptSync(this.encryptionKey, salt, 32);
      const iv = randomBytes(16);
      const cipher = createCipheriv('aes-256-cbc', key, iv);

      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');

      return {
        salt: salt.toString('hex'),
        iv: iv.toString('hex'),
        data: encrypted,
      };
    } catch (error) {
      throw errorManager.createError(
        'Encryption failed',
        ErrorType.SECURITY,
        'ENCRYPTION_FAILED',
        { error: error.message }
      );
    }
  }

  /**
   * 解密数据 — 从加密对象读取 salt
   */
  decrypt(encrypted) {
    if (!this.encryptionKey) {
      throw errorManager.createError(
        'HUNDUNOS_ENCRYPTION_KEY not set',
        ErrorType.SECURITY,
        'ENCRYPTION_KEY_MISSING'
      );
    }
    if (!encrypted.salt || !encrypted.iv || !encrypted.data) {
      throw errorManager.createError(
        'Invalid encrypted object: missing salt, iv, or data',
        ErrorType.SECURITY,
        'INVALID_ENCRYPTED_OBJECT'
      );
    }

    try {
      const salt = Buffer.from(encrypted.salt, 'hex');
      const key = scryptSync(this.encryptionKey, salt, 32);
      const iv = Buffer.from(encrypted.iv, 'hex');
      const decipher = createDecipheriv('aes-256-cbc', key, iv);

      let decrypted = decipher.update(encrypted.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      throw errorManager.createError(
        'Decryption failed',
        ErrorType.SECURITY,
        'DECRYPTION_FAILED',
        { error: error.message }
      );
    }
  }

  /**
   * 添加 API 密钥
   */
  async addKey(name, key, provider = 'custom') {
    const keys = await this.loadKeys();
    const encrypted = this.encrypt({ key, provider });
    keys[name] = encrypted;
    await this.saveKeys(keys);
    return { success: true, message: `API key '${name}' added` };
  }

  /**
   * 获取 API 密钥
   */
  async getKey(name) {
    const keys = await this.loadKeys();
    const encrypted = keys[name];
    if (!encrypted) {
      return null;
    }
    return this.decrypt(encrypted);
  }

  /**
   * 删除 API 密钥
   */
  async removeKey(name) {
    const keys = await this.loadKeys();
    delete keys[name];
    await this.saveKeys(keys);
    return { success: true, message: `API key '${name}' removed` };
  }

  /**
   * 列出所有密钥名称
   */
  async listKeys() {
    const keys = await this.loadKeys();
    return Object.keys(keys);
  }

  /**
   * 加载密钥
   */
  async loadKeys() {
    if (!existsSync(this.keysFile)) {
      return {};
    }
    try {
      const content = await readFile(this.keysFile, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      console.error('[ApiKeyManager] Failed to load keys:', e.message);
      return {};
    }
  }

  /**
   * 保存密钥
   */
  async saveKeys(keys) {
    await writeFile(this.keysFile, JSON.stringify(keys, null, 2), 'utf8');
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
    // 工具访问控制 — 默认拒绝，显式注册 allow
    this.register('tool:read', {
      allow: ['admin', 'developer', 'user'],
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

    // 路径访问控制 — 默认拒绝，白名单收紧
    this.register('path:read', {
      allow: ['admin', 'developer', 'user'],
      deny: [],
      whitelist: [],
    });

    this.register('path:write', {
      allow: ['admin', 'developer'],
      deny: [],
      whitelist: [],
    });

    // API 访问控制 — 默认拒绝，显式注册 allow
    this.register('api:read', {
      allow: ['admin', 'developer', 'user'],
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
      return { allowed: false, reason: 'No policy found — implicit deny' };
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
    const projectRoot = this.kernel?.config?.projectRoot || process.cwd();

    for (const allowed of whitelist) {
      const allowedPath = resolve(projectRoot, allowed);
      const resolvedPath = resolve(projectRoot, path);
      const rel = relative(allowedPath, resolvedPath);
      if (!rel.startsWith('..') && !rel.startsWith('/')) {
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
 * P1-3 修复：增加基于文件大小的日志滚动（rotate），防止长期运行下审计文件无限增长。
 * P1-3 修复：query() 改为流式（逐行）读取，避免大文件场景下的内存溢出。
 */
export class AuditLogger {
  constructor(kernel) {
    this.kernel = kernel;
    this.auditDir = join(kernel?.config?.storageDir || '.hundunos', 'audit');
    this.logFile = join(this.auditDir, 'audit.log');
    // 默认单文件上限 10MB，超出时自动滚动
    this.maxSizeBytes = (kernel?.config?.auditLogMaxSizeMB ?? 10) * 1024 * 1024;
    this.maxRotateFiles = kernel?.config?.auditLogMaxRotateFiles ?? 5;
    mkdirSync(this.auditDir, { recursive: true });
  }

  /**
   * 日志滚动：audit.log → audit.log.1 → audit.log.2 … → audit.log.N（超出丢弃）
   */
  async _rotate() {
    // 删除最旧的滚动文件
    const oldest = `${this.logFile}.${this.maxRotateFiles}`;
    if (existsSync(oldest)) {
      await writeFile(oldest, '', 'utf8'); // 清空，等同删除但保持 inode
    }
    // 向后移位
    for (let i = this.maxRotateFiles - 1; i >= 1; i--) {
      const src = i === 1 ? this.logFile : `${this.logFile}.${i - 1}`;
      const dst = `${this.logFile}.${i}`;
      if (existsSync(src)) {
        await rename(src, dst).catch(() => {});
      }
    }
  }

  /**
   * 记录审计日志
   */
  async log(action, data, context = {}) {
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

    // 检查是否需要滚动
    try {
      if (existsSync(this.logFile)) {
        const fileStat = await stat(this.logFile);
        if (fileStat.size >= this.maxSizeBytes) {
          await this._rotate();
        }
      }
    } catch (_) { /* 滚动失败不阻塞写入 */ }

    await appendFile(this.logFile, logLine, 'utf8');

    return entry;
  }

  /**
   * 查询审计日志
   * P1-3 修复：改为分块流式读取，避免超大日志文件引发 OOM。
   * 当文件较大时仅读取尾部 maxReadBytes（默认 5MB）进行过滤。
   */
  async query(filters = {}) {
    if (!existsSync(this.logFile)) {
      return [];
    }

    const MAX_READ_BYTES = 5 * 1024 * 1024; // 5MB 尾部读取窗口
    let content;
    try {
      const fileStat = await stat(this.logFile);
      if (fileStat.size > MAX_READ_BYTES) {
        // 只读尾部 5MB，避免 OOM
        const { createReadStream } = await import('fs');
        const start = fileStat.size - MAX_READ_BYTES;
        const chunks = [];
        await new Promise((resolve, reject) => {
          const stream = createReadStream(this.logFile, { start, encoding: 'utf8' });
          stream.on('data', c => chunks.push(c));
          stream.on('end', resolve);
          stream.on('error', reject);
        });
        content = chunks.join('');
        // 丢弃首行（可能被截断）
        const firstNL = content.indexOf('\n');
        if (firstNL !== -1) content = content.slice(firstNL + 1);
      } else {
        content = await readFile(this.logFile, 'utf8');
      }
    } catch (e) {
      return [];
    }

    const lines = content.split('\n').filter(Boolean);
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
  async getStats() {
    const entries = await this.query();
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
