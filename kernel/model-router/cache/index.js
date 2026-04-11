// hundunos/kernel/model-router/cache/index.js — Response Cache Module
// 功能: 智能响应缓存，提升Token节省率
// 状态: 新增

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class ResponseCache {
    constructor(kernel) {
        this.kernel = kernel;
        this.cache = new Map();
        
        // 配置
        this.config = {
            cacheDir: join(__dirname, '..', 'cache'),
            maxSize: 1000,
            maxAge: 3600000,  // 1小时
            similarityThreshold: 0.9  // 相似度阈值
        };
        
        this.stats = {
            hits: 0,
            misses: 0,
            saved: 0
        };
        
        // 初始化
        this._init();
    }

    _init() {
        mkdirSync(this.config.cacheDir, { recursive: true });
        this._loadCache();
    }

    /**
     * 生成缓存键
     */
    _generateKey(messages) {
        // 取最后一条用户消息作为缓存键
        const lastUserMsg = messages.filter(m => m.role === 'user').pop();
        if (!lastUserMsg) return null;
        
        const content = lastUserMsg.content || '';
        // 标准化: 小写 + 去除多余空格
        const normalized = content.toLowerCase().replace(/\s+/g, ' ').trim();
        
        return createHash('sha256').update(normalized.slice(0, 200)).digest('hex').slice(0, 16);
    }

    /**
     * 查找缓存
     */
    get(messages) {
        const key = this._generateKey(messages);
        if (!key) return null;
        
        const entry = this.cache.get(key);
        if (!entry) {
            this.stats.misses++;
            return null;
        }
        
        // 检查过期
        if (Date.now() - entry.timestamp > this.config.maxAge) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }
        
        this.stats.hits++;
        this.stats.saved += entry.tokens || 0;
        
        return entry.response;
    }

    /**
     * 存储缓存
     */
    put(messages, response, tokens = 0) {
        const key = this._generateKey(messages);
        if (!key) return;
        
        // 限制缓存大小
        if (this.cache.size >= this.config.maxSize) {
            this._evictLRU();
        }
        
        const entry = {
            key,
            timestamp: Date.now(),
            tokens,
            response: {
                content: response.content,
                usage: response.usage
            }
        };
        
        this.cache.set(key, entry);
        this._persistCache();
    }

    /**
     * 清除缓存
     */
    clear() {
        this.cache.clear();
        this._persistCache();
        console.log('[ResponseCache] Cleared');
    }

    /**
     * 获取统计
     */
    getStats() {
        const hitRate = this.stats.hits + this.stats.misses > 0 
            ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(1) 
            : 0;
            
        return {
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRate: hitRate + '%',
            savedTokens: this.stats.saved,
            entries: this.cache.size
        };
    }

    /**
     * LRU 淘汰
     */
    _evictLRU() {
        let oldestKey = null;
        let oldestTime = Date.now();
        
        for (const [key, entry] of this.cache) {
            if (entry.timestamp < oldestTime) {
                oldestTime = entry.timestamp;
                oldestKey = key;
            }
        }
        
        if (oldestKey) {
            this.cache.delete(oldestKey);
        }
    }

    /**
     * 持久化
     */
    _persistCache() {
        const cacheFile = join(this.config.cacheDir, 'responses.json');
        const data = Array.from(this.cache.entries()).map(([key, entry]) => ({
            key,
            ...entry
        }));
        
        try {
            writeFileSync(cacheFile, JSON.stringify(data.slice(-500), null, 2), 'utf8');
        } catch (e) {
            console.warn('[ResponseCache] Persist failed:', e.message);
        }
    }

    /**
     * 加载缓存
     */
    _loadCache() {
        const cacheFile = join(this.config.cacheDir, 'responses.json');
        if (!existsSync(cacheFile)) return;
        
        try {
            const data = JSON.parse(readFileSync(cacheFile, 'utf8'));
            for (const entry of data) {
                this.cache.set(entry.key, entry);
            }
            console.log('[ResponseCache] Loaded', this.cache.size, 'entries');
        } catch (e) {
            console.warn('[ResponseCache] Load failed:', e.message);
        }
    }
}

export function getResponseCache(kernel) {
    return new ResponseCache(kernel);
}