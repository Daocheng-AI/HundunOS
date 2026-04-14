/**
 * HundunOS v3.0 - OpenClaw Audit Adapter
 * OpenClaw 审计日志适配器
 * 
 * 功能:
 * - 操作日志记录
 * - 安全审计
 * - 合规检查
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// 审计级别
// ============================================================================

export const AuditLevel = {
    INFO:     'info',
    WARNING:  'warning',
    ERROR:    'error',
    CRITICAL: 'critical',
    SECURITY: 'security'
};

/**
 * 审计类别
 */
export const AuditCategory = {
    AUTH:       'authentication',
    ACCESS:     'access_control',
    DATA:       'data_operation',
    SYSTEM:     'system_operation',
    SECURITY:   'security_event',
    COMPLIANCE: 'compliance_check'
};

// ============================================================================
// OpenClaw Audit Adapter
// ============================================================================

export class OpenClawAuditAdapter extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            logDir: config.logDir || path.join(__dirname, '../logs/audit'),
            maxLogSize: config.maxLogSize || 10 * 1024 * 1024, // 10MB
            retentionDays: config.retentionDays || 90,
            enableConsole: config.enableConsole !== false,
            enableFile: config.enableFile !== false,
            ...config
        };

        this.buffer = [];
        this.flushInterval = null;

        this._ensureLogDir();
        this._startFlushTimer();

        // console.log('[OpenClawAudit] Adapter initialized');
    }

    // ========================================================================
    // 日志记录
    // ========================================================================

    /**
     * 记录审计日志
     */
    log(level, category, action, details = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            category,
            action,
            userId: details.userId || 'system',
            sessionId: details.sessionId || null,
            resourceId: details.resourceId || null,
            ip: details.ip || null,
            userAgent: details.userAgent || null,
            details: details.details || {},
            result: details.result || 'success',
            duration: details.duration || null
        };

        this.buffer.push(entry);

        if (this.config.enableConsole) {
            this._logToConsole(entry);
        }

        this.emit('audit', entry);

        return entry;
    }

    /**
     * 快捷方法
     */
    info(category, action, details) {
        return this.log(AuditLevel.INFO, category, action, details);
    }

    warning(category, action, details) {
        return this.log(AuditLevel.WARNING, category, action, details);
    }

    error(category, action, details) {
        return this.log(AuditLevel.ERROR, category, action, details);
    }

    critical(category, action, details) {
        return this.log(AuditLevel.CRITICAL, category, action, details);
    }

    security(category, action, details) {
        return this.log(AuditLevel.SECURITY, category, action, details);
    }

    // ========================================================================
    // 查询接口
    // ========================================================================

    /**
     * 查询日志
     */
    async query(options = {}) {
        const {
            level,
            category,
            userId,
            startTime,
            endTime,
            limit = 100
        } = options;

        const logFile = this._getLogFile(new Date());
        if (!fs.existsSync(logFile)) {
            return [];
        }

        const content = fs.readFileSync(logFile, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);

        let results = lines.map(line => {
            try {
                return JSON.parse(line);
            } catch {
                return null;
            }
        }).filter(Boolean);

        // 过滤
        if (level) results = results.filter(r => r.level === level);
        if (category) results = results.filter(r => r.category === category);
        if (userId) results = results.filter(r => r.userId === userId);
        if (startTime) results = results.filter(r => new Date(r.timestamp) >= new Date(startTime));
        if (endTime) results = results.filter(r => new Date(r.timestamp) <= new Date(endTime));

        return results.slice(-limit);
    }

    /**
     * 获取统计
     */
    async getStats(timeRange = '24h') {
        const logs = await this.query({ limit: 10000 });

        const stats = {
            total: logs.length,
            byLevel: {},
            byCategory: {},
            errors: 0,
            securityEvents: 0
        };

        for (const log of logs) {
            stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
            stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
            if (log.level === 'error' || log.level === 'critical') stats.errors++;
            if (log.level === 'security') stats.securityEvents++;
        }

        return stats;
    }

    // ========================================================================
    // 合规检查
    // ========================================================================

    /**
     * 检查合规性
     */
    async checkCompliance() {
        const stats = await this.getStats('7d');

        return {
            compliant: stats.errors < 100 && stats.securityEvents < 10,
            checks: [
                {
                    name: 'error_rate',
                    passed: stats.errors < 100,
                    value: stats.errors,
                    threshold: 100
                },
                {
                    name: 'security_events',
                    passed: stats.securityEvents < 10,
                    value: stats.securityEvents,
                    threshold: 10
                },
                {
                    name: 'audit_logging',
                    passed: stats.total > 0,
                    value: stats.total,
                    threshold: 1
                }
            ],
            stats
        };
    }

    // ========================================================================
    // 内部方法
    // ========================================================================

    _ensureLogDir() {
        if (!fs.existsSync(this.config.logDir)) {
            fs.mkdirSync(this.config.logDir, { recursive: true });
        }
    }

    _getLogFile(date = new Date()) {
        const dateStr = date.toISOString().split('T')[0];
        return path.join(this.config.logDir, `audit_${dateStr}.jsonl`);
    }

    _logToConsole(entry) {
        const prefix = `[${entry.level.toUpperCase()}]`;
        const msg = `${prefix} [${entry.category}] ${entry.action}`;
        
        switch (entry.level) {
            case AuditLevel.ERROR:
            case AuditLevel.CRITICAL:
                console.error(msg, entry.details);
                break;
            case AuditLevel.WARNING:
                console.warn(msg, entry.details);
                break;
            default:
                // console.log(msg);
        }
    }

    _startFlushTimer() {
        this.flushInterval = setInterval(() => {
            this._flush();
        }, 5000);
    }

    _flush() {
        if (this.buffer.length === 0) return;

        const entries = [...this.buffer];
        this.buffer = [];

        if (this.config.enableFile) {
            const logFile = this._getLogFile();
            const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
            fs.appendFileSync(logFile, lines);
        }
    }

    destroy() {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
        }
        this._flush();
    }
}

// ============================================================================
// 单例
// ============================================================================

let instance = null;

export function getOpenClawAuditAdapter() {
    if (!instance) {
        instance = new OpenClawAuditAdapter();
    }
    return instance;
}

export default {
    OpenClawAuditAdapter,
    getOpenClawAuditAdapter,
    AuditLevel,
    AuditCategory
};
