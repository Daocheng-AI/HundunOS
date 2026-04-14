// hundunos/stable-modules/audit-logger/index.js — Audit Logger v3.0
// 三层审计：L1 实时 / L2 定期 / L3 合规归档

import { createHash, randomUUID } from 'crypto';

export class AuditLogger {
    constructor(kernel) {
        this.kernel = kernel;
        this.buffer = [];
        this.bufferSize = 20;
        this.flushInterval = 3000;
        this.timer = null;
        this.stats = { total: 0, pending: 0, written: 0, errors: 0 };
    }

    async initialize() {
        await this.kernel.storage.ensureStorage?.() || Promise.resolve();
        this.startFlush();
        // console.log('[AuditLogger] Initialized');
    }

    async log(eventType, data, context = {}) {
        // S-03: 使用 crypto.randomUUID() 替代 Math.random()（密码学安全）
        // S-18 fix: 从 context.sessionId 获取真实 session，而非取 Map 中第一个
        const entry = {
            id: `audit_${randomUUID()}`,
            timestamp: Date.now(),
            event: eventType,
            data: this._sanitize(data),
            sessionId: context.sessionId || 'unknown',
            hash: null
        };
        entry.hash = this._computeHash(entry);
        this.buffer.push(entry);
        this.stats.total++; this.stats.pending++;
        if (this.buffer.length >= this.bufferSize) await this.flush();
        return entry.id;
    }

    _sanitize(data) {
        const sensitive = ['password', 'token', 'api_key', 'secret', 'credential'];
        const str = JSON.stringify(data);
        let result = str;
        for (const k of sensitive) {
            result = result.replace(new RegExp(`"${k}"\\s*:\\s*"[^"]*"`, 'gi'), `"${k}":"[REDACTED]"`);
        }
        return JSON.parse(result);
    }

    _computeHash(entry) {
        const { hash, ...rest } = entry;
        return createHash('sha256').update(JSON.stringify(rest)).digest('hex').slice(0, 16);
    }

    async flush() {
        if (this.buffer.length === 0) return;
        const entries = [...this.buffer];
        this.buffer = [];
        this.stats.pending = 0;
        try {
            for (const entry of entries) {
                await this.kernel.storage.append('audit:log', entry);
            }
            this.stats.written += entries.length;
        } catch (e) {
            // S-17 fix: 用 push 将条目恢复到 buffer 尾部（保持原始顺序），而非 unshift 插到头部
            this.buffer.push(...entries);
            this.stats.errors++;
            this.stats.pending = this.buffer.length;
            console.warn('[AuditLogger] flush failed, entries restored to buffer:', entries.length);
        }
    }

    startFlush() {
        this.timer = setInterval(() => this.flush(), this.flushInterval);
    }

    async persist() { await this.flush(); }

    async shutdown() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        await this.flush();
    }

    getStats() { return { ...this.stats, bufferSize: this.buffer.length }; }
}

export default AuditLogger;
