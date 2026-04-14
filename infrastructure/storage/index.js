// hundunos/infrastructure/storage/index.js — Storage Layer v3.0
// S-04: 添加数据加密支持

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join, dirname, normalize } from 'path';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { createLogger } from '../../kernel/logger.js';

const logger = createLogger('Storage');

// S-04: 加密工具类
class DataEncryptor {
    constructor(options = {}) {
        this.key = options.key || this._deriveKey();
        this.algorithm = 'aes-256-gcm';
    }

    // 从机器特征派生密钥（仅在未配置环境变量时降级使用）
    _deriveKey() {
        const envKey = process.env.HUNDUNOS_ENCRYPTION_KEY;
        if (envKey) {
            return createHash('sha256').update(envKey).digest();
        }
        // P0 修复：禁止 fallback 到可预测的机器名，改为强制要求
        logger.warn('SECURITY WARNING: HUNDUNOS_ENCRYPTION_KEY not set. ' +
            'Encryption is DISABLED for this session. Set the env var before production use.');
        return null; // 返回 null 表示不加密，由 encryptor 层处理
    }

    // P0 修复：密钥为 null 时明确拒绝加密操作，防止静默不加密导致数据泄露
    encrypt(plaintext) {
        if (!this.key) {
            throw new Error('[Storage] Encryption key not set. Set HUNDUNOS_ENCRYPTION_KEY env var to enable encryption.');
        }
        const iv = randomBytes(16);
        const cipher = createCipheriv(this.algorithm, this.key, iv);
        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    }

    decrypt(ciphertext) {
        if (!this.key) {
            throw new Error('[Storage] Encryption key not set. Set HUNDUNOS_ENCRYPTION_KEY env var to enable decryption.');
        }
        try {
            const parts = ciphertext.split(':');
            if (parts.length !== 3) throw new Error('Invalid format');
            const iv = Buffer.from(parts[0], 'hex');
            const authTag = Buffer.from(parts[1], 'hex');
            const encrypted = parts[2];
            const decipher = createDecipheriv(this.algorithm, this.key, iv);
            decipher.setAuthTag(authTag);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (e) {
            logger.warn('Decrypt failed:', e.message);
            return null;
        }
    }
}

export class Storage {
    constructor(options = {}) {
        this.dir = options.dir || join(process.cwd(), '.hundunos', 'storage');
        this.cache = new Map();
        this.maxCacheAge = options.maxCacheAge || 30000;
        this.stats = { puts: 0, gets: 0, appends: 0, errors: 0 };

        // S-04: 加密配置
        this.encryptor = new DataEncryptor(options);
        this.encryptedKeys = new Set(options.encryptedKeys || [
            'permission:permanent',
            'audit:log',
            'privacy:rules',
            'session:*'
        ]);
    }

    async initialize() {
        mkdirSync(this.dir, { recursive: true });
        // console.log('[Storage] Initialized at:', this.dir);
        // 清理过期缓存
        setInterval(() => this._cleanCache(), this.maxCacheAge * 2);
    }

    // ================================================================
    // put() — 保存 JSON（异步写入，保证一致性）
    // S-04: 支持敏感数据自动加密
    // ================================================================
    async put(key, value) {
        this.stats.puts++;
        // P1 修复：写入前检查数据大小，防止大对象 OOM
        const MAX_WRITE_BYTES = 10 * 1024 * 1024; // 10MB 上限
        const dataStr = JSON.stringify(value);
        if (Buffer.byteLength(dataStr, 'utf8') > MAX_WRITE_BYTES) {
            this.stats.errors++;
            throw new Error(`[Storage] Data too large to write (${Buffer.byteLength(dataStr, 'utf8')} bytes > ${MAX_WRITE_BYTES}): ${key}`);
        }

        const path = this._keyToPath(key);
        try {
            mkdirSync(dirname(path), { recursive: true });

            // S-04: 自动加密敏感数据
            let storedValue = value;
            
                // P0 安全：如果未配置加密密钥，拒绝写入敏感数据
                if (!this.encryptor.key) {
                    this.stats.errors++;
                    throw new Error("[Storage] Encryption required for key '" + key + "' but HUNDUNOS_ENCRYPTION_KEY is not set. Refusing to write unencrypted sensitive data.");
                }
if (this._shouldEncrypt(key)) {
                // P0 安全：如果未配置加密密钥，拒绝写入敏感数据（防止静默明文泄漏）
                if (!this.encryptor.key) {
                    this.stats.errors++;
                    throw new Error("[Storage] Encryption required for key \'" + key + "\' but HUNDUNOS_ENCRYPTION_KEY is not set. Refusing to write unencrypted sensitive data.");
                }
                storedValue = { __encrypted: true, __data: this.encryptor.encrypt(JSON.stringify(value)) };
            }

            // 使用 writeFileSync 保持同步（性能优先），但先更新缓存确保一致性
            this.cache.set(key, { value, mtime: Date.now() });
            writeFileSync(path, JSON.stringify(storedValue, null, 2), 'utf8');
        } catch (e) {
            this.stats.errors++;
            // 写入失败时移除缓存
            this.cache.delete(key);
            logger.warn('put error:', e.message);
            throw e;
        }
    }

    // ================================================================
    // get() — 读取 JSON
    // S-04: 支持自动解密
    // ================================================================
    async get(key, defaultValue = null) {
        this.stats.gets++;
        // 缓存命中
        const cached = this.cache.get(key);
        if (cached && (Date.now() - cached.mtime) < this.maxCacheAge) {
            return cached.value;
        }
        const path = this._keyToPath(key);
        if (!existsSync(path)) return defaultValue;
        try {
            // P1 修复：读取前检查文件大小，防止大文件 OOM
            const stat = statSync(path);
            const MAX_READ_BYTES = 10 * 1024 * 1024; // 10MB 上限
            if (stat.size > MAX_READ_BYTES) {
                this.stats.errors++;
                logger.warn(`File too large to read (${stat.size} bytes > ${MAX_READ_BYTES}): ${key}`);
                return defaultValue;
            }
            const storedData = JSON.parse(readFileSync(path, 'utf8'));

            // S-04: 自动解密
            let data = storedData;
            if (storedData.__encrypted && storedData.__data) {
                const decrypted = this.encryptor.decrypt(storedData.__data);
                if (decrypted) {
                    data = JSON.parse(decrypted);
                } else {
                    return defaultValue;
                }
            }

            this.cache.set(key, { value: data, mtime: Date.now() });
            return data;
        } catch (e) {
            this.stats.errors++;
            return defaultValue;
        }
    }

    // ================================================================
    // delete() — 删除
    // ================================================================
    async delete(key) {
        const path = this._keyToPath(key);
        if (existsSync(path)) {
            try { unlinkSync(path); } catch (e) { this.stats.errors++; logger.warn('delete error:', e.message); }
        }
        this.cache.delete(key);
    }

    // ================================================================
    // append() — 追加到 JSONL 文件
    // ================================================================
    async append(key, value) {
        this.stats.appends++;
        const path = this._keyToPath(key, '.jsonl');
        try {
            mkdirSync(dirname(path), { recursive: true });
            const line = JSON.stringify({ ...value, _ts: Date.now() });
            writeFileSync(path, line + '\n', { flag: 'a' }, 'utf8');
        } catch (e) {
            this.stats.errors++;
            throw e;
        }
    }

    // ================================================================
    // query() — 查询 JSONL 日志
    // ================================================================
    async query(key, filter = {}, limit = 100) {
        const path = this._keyToPath(key, '.jsonl');
        if (!existsSync(path)) return [];
        try {
            const lines = readFileSync(path, 'utf8').split('\n').filter(l => l.trim());
            let entries = lines.map(l => {
                try { return JSON.parse(l); } catch { return null; }
            }).filter(e => e);

            // 过滤器
            if (filter.event) entries = entries.filter(e => e.event === filter.event);
            if (filter.after) entries = entries.filter(e => e._ts >= filter.after);
            if (filter.before) entries = entries.filter(e => e._ts <= filter.before);

            return entries.slice(-limit);
        } catch { return []; }
    }

    // ================================================================
    // exists() — 检查存在
    // ================================================================
    async exists(key) {
        const cached = this.cache.get(key);
        if (cached) return true;
        return existsSync(this._keyToPath(key));
    }

    // ================================================================
    // keys() — 列出所有 key
    // ================================================================
    async keys(prefix = '') {
        return this._listKeys(this.dir, prefix).map(p => this._pathToKey(p));
    }

    _listKeys(dir, prefix, results = []) {
        if (!existsSync(dir)) return results;
        for (const entry of readdirSync(dir)) {
            const full = join(dir, entry);
            const stat = statSync(full);
            if (stat.isDirectory()) {
                this._listKeys(full, prefix, results);
            } else if (entry.endsWith('.json')) {
                const key = entry.replace(/\.json$/, '');
                if (!prefix || key.startsWith(prefix)) results.push(full);
            }
        }
        return results;
    }

    // ================================================================
    // 辅助方法
    // ================================================================

    // S-04: 判断是否应该加密
    _shouldEncrypt(key) {
        for (const pattern of this.encryptedKeys) {
            if (pattern.endsWith('*')) {
                if (key.startsWith(pattern.slice(0, -1))) return true;
            } else if (key === pattern) {
                return true;
            }
        }
        return false;
    }

    _keyToPath(key, ext = '.json') {
        // 去除危险字符（禁止冒号和斜杠，防止 key 携带路径成分）
        const safe = key.replace(/[:/\\]/g, '_');
        const rawPath = join(this.dir, safe + ext);
        // 规范化后验证始终在 this.dir 内（S-01/S-04 防护）
        const resolved = normalize(rawPath);
        const baseNormalized = normalize(this.dir);
        const sep = process.platform === 'win32' ? '\\' : '/';
        // resolved 必须以 baseNormalized 开头，且下一字符必须是路径分隔符（或完全相等）
        const isSafe = resolved === baseNormalized ||
            resolved.startsWith(baseNormalized + sep);
        if (!isSafe) {
            throw new Error(`[Storage] Path traversal blocked: resolved=${resolved}, base=${this.dir}`);
        }
        return resolved;
    }

    _pathToKey(path) {
        return path.replace(/\.json$/, '').replace(this.dir + '\\', '').replace(/\\/g, ':');
    }

    _cleanCache() {
        const now = Date.now();
        const keysToDelete = [];
        
        // 分离需要删除的 key，避免在遍历中修改
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.mtime > this.maxCacheAge * 2) {
                keysToDelete.push(key);
            }
        }
        
        // 批量删除
        for (const key of keysToDelete) {
            this.cache.delete(key);
        }
        
        if (keysToDelete.length > 0) {
            // console.log(`[Storage] Cleaned ${keysToDelete.length} expired cache entries`);
        }
    }

    async shutdown() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    getStats() {
        return { ...this.stats, cached: this.cache.size };
    }
}
