/**
 * HundunOS v3.0 - Cron Trigger
 * 定时任务触发器，与 AwareSystem 集成
 * 
 * 功能:
 * - 定时触发健康检查
 * - 定时触发数据备份
 * - 定时触发清理任务
 */

import { EventEmitter } from 'events';

// ============================================================================
// Cron 表达式解析
// ============================================================================

/**
 * 简化版 Cron 解析器
 * 支持: second minute hour day month weekday
 */
export class CronExpression {
    constructor(expression) {
        this.expression = expression;
        this.fields = this._parse(expression);
    }

    _parse(expr) {
        const parts = expr.trim().split(/\s+/);
        if (parts.length < 5 || parts.length > 6) {
            throw new Error(`Invalid cron expression: ${expr}`);
        }

        const fields = ['second', 'minute', 'hour', 'day', 'month', 'weekday'];
        const result = {};

        // 如果是5段式，添加默认秒
        const values = parts.length === 5 ? ['0', ...parts] : parts;

        for (let i = 0; i < fields.length; i++) {
            result[fields[i]] = this._parseField(values[i]);
        }

        return result;
    }

    _parseField(field) {
        if (field === '*') return null; // 匹配所有
        if (field.includes('/')) {
            const [base, step] = field.split('/');
            return { type: 'step', base: base === '*' ? null : parseInt(base), step: parseInt(step) };
        }
        if (field.includes('-')) {
            const [start, end] = field.split('-').map(Number);
            return { type: 'range', start, end };
        }
        if (field.includes(',')) {
            return { type: 'list', values: field.split(',').map(Number) };
        }
        return { type: 'exact', value: parseInt(field) };
    }

    /**
     * 检查指定时间是否匹配
     */
    matches(date = new Date()) {
        const checks = [
            { field: 'second', value: date.getSeconds() },
            { field: 'minute', value: date.getMinutes() },
            { field: 'hour', value: date.getHours() },
            { field: 'day', value: date.getDate() },
            { field: 'month', value: date.getMonth() + 1 },
            { field: 'weekday', value: date.getDay() }
        ];

        for (const { field, value } of checks) {
            if (!this._matchField(this.fields[field], value)) {
                return false;
            }
        }

        return true;
    }

    _matchField(field, value) {
        if (!field) return true; // * 匹配所有

        switch (field.type) {
            case 'exact':
                return value === field.value;
            case 'range':
                return value >= field.start && value <= field.end;
            case 'list':
                return field.values.includes(value);
            case 'step':
                if (!field.base) return value % field.step === 0;
                return value >= field.base && (value - field.base) % field.step === 0;
            default:
                return true;
        }
    }

    /**
     * 计算下次触发时间
     */
    getNextRun(after = new Date()) {
        const next = new Date(after);
        next.setMilliseconds(0);
        next.setSeconds(next.getSeconds() + 1);

        // 最多尝试 366 天
        for (let i = 0; i < 366 * 24 * 60 * 60; i++) {
            if (this.matches(next)) {
                return next;
            }
            next.setSeconds(next.getSeconds() + 1);
        }

        return null;
    }
}

// ============================================================================
// Cron Job
// ============================================================================

export class CronJob {
    constructor(name, expression, handler, options = {}) {
        this.name = name;
        this.expression = new CronExpression(expression);
        this.handler = handler;
        this.options = {
            enabled: true,
            runImmediately: false,
            timezone: options.timezone || 'Asia/Shanghai',
            ...options
        };

        this.lastRun = null;
        this.nextRun = null;
        this.runCount = 0;
        this.errorCount = 0;
        this.lastError = null;
        this.status = 'idle';

        this._updateNextRun();
    }

    /**
     * 检查是否应该执行
     */
    shouldRun(date = new Date()) {
        if (!this.options.enabled) return false;
        return this.expression.matches(date);
    }

    /**
     * 执行任务
     */
    async run() {
        if (this.status === 'running') {
            // review: removed // review: removed console.log(`[CronJob] ${this.name} already running, skip`);
            return { skipped: true };
        }

        this.status = 'running';
        const startTime = Date.now();

        try {
            const result = await this.handler();
            this.lastRun = new Date().toISOString();
            this.runCount++;
            this.status = 'success';

            // review: removed // review: removed console.log(`[CronJob] ${this.name} completed in ${Date.now() - startTime}ms`);

            return { success: true, result, duration: Date.now() - startTime };
        } catch (error) {
            this.errorCount++;
            this.lastError = error.message;
            this.status = 'error';

            console.error(`[CronJob] ${this.name} failed:`, error.message);

            return { success: false, error: error.message };
        } finally {
            this._updateNextRun();
        }
    }

    /**
     * 启用/禁用
     */
    enable(enabled = true) {
        this.options.enabled = enabled;
        if (enabled) {
            this._updateNextRun();
        } else {
            this.nextRun = null;
        }
    }

    _updateNextRun() {
        this.nextRun = this.expression.getNextRun();
    }
}

// ============================================================================
// Cron Scheduler
// ============================================================================

export class CronScheduler extends EventEmitter {
    constructor() {
        super();
        this.jobs = new Map();
        this._timeout = null;          // 优化：单次 setTimeout，唤醒时重新调度
        this._running = false;
        this.checkInterval = 1000;     // 兜底精度（到期前后各查 1 秒窗口）
        this._nextTickAt = null;       // 当前 setTimeout 的到期时间

        // review: removed // review: removed console.log('[CronScheduler] Initialized');
    }

    /**
     * 添加任务
     */
    addJob(name, expression, handler, options = {}) {
        if (this.jobs.has(name)) {
            console.warn(`[CronScheduler] Job ${name} already exists, replacing`);
        }

        const job = new CronJob(name, expression, handler, options);
        this.jobs.set(name, job);

        // review: removed // review: removed console.log(`[CronScheduler] Added job: ${name} (${expression})`);

        // 立即执行
        if (options.runImmediately) {
            job.run().catch(err => console.error(`[CronScheduler] Immediate run failed:`, err));
        }

        return job;
    }

    /**
     * 移除任务
     */
    removeJob(name) {
        const removed = this.jobs.delete(name);
        if (removed) {
            // review: removed // review: removed console.log(`[CronScheduler] Removed job: ${name}`);
        }
        return removed;
    }

    /**
     * 获取任务
     */
    getJob(name) {
        return this.jobs.get(name);
    }

    /**
     * 获取所有任务状态
     */
    getAllJobs() {
        const result = [];
        for (const [name, job] of this.jobs) {
            result.push({
                name,
                enabled: job.options.enabled,
                status: job.status,
                lastRun: job.lastRun,
                nextRun: job.nextRun?.toISOString(),
                runCount: job.runCount,
                errorCount: job.errorCount
            });
        }
        return result;
    }

    /**
     * 启动调度器（next-run 驱动，不再每秒轮询所有任务）
     */
    start() {
        if (this._running) return;

        this._running = true;
        this._scheduleNext();  // 优化：直接跳到最近一次到期时间

        // review: removed // review: removed console.log(`[CronScheduler] Started (next-run driven), watching ${this.jobs.size} jobs`);
        this.emit('started');
    }

    /**
     * 停止调度器
     */
    stop() {
        if (!this._running) return;

        this._running = false;
        if (this._timeout) {
            clearTimeout(this._timeout);
            this._timeout = null;
            this._nextTickAt = null;
        }

        // review: removed // review: removed console.log('[CronScheduler] Stopped');
        this.emit('stopped');
    }

    /**
     * 手动触发任务
     */
    async runJob(name) {
        const job = this.jobs.get(name);
        if (!job) {
            throw new Error(`Job not found: ${name}`);
        }
        return job.run();
    }

    /**
     * 优化：找到距今最近的到期时间，setTimeout 直跳目标时刻
     * 不再每秒遍历所有任务——只跳到最近一个到期的时间点
     */
    _scheduleNext() {
        if (!this._running) return;

        const now = Date.now();
        let nearestMs = Infinity;

        for (const [, job] of this.jobs) {
            if (!job.nextRun) continue;
            const ms = job.nextRun.getTime();
            if (ms - now <= this.checkInterval + 100 && ms >= now - 1000) {
                // 到期窗口内（含过去 1 秒容差），触发
                // review: removed // review: removed console.log(`[CronScheduler] Triggering (due): ${job.name}`);
                job.run().catch(err => {
                    console.error(`[CronScheduler] Job ${job.name} error:`, err);
                });
                // run() 结束后 CronJob._updateNextRun() 会刷新 nextRun
            }
            const delta = ms - now;
            if (delta > 0 && delta < nearestMs) {
                nearestMs = delta;
            }
        }

        if (nearestMs === Infinity || nearestMs <= 0) {
            // 无未来任务，1 分钟后重试（有新任务可能在此期间加入）
            nearestMs = 60_000;
        }

        // 最多等 nearestMs 毫秒后再次调度
        this._nextTickAt = now + nearestMs;
        this._timeout = setTimeout(() => this._scheduleNext(), nearestMs);
    }
}


// ============================================================================
// 预定义任务
// ============================================================================

/**
 * 创建默认健康检查任务
 */
export function createHealthCheckJob(healthMonitor) {
    return {
        name: 'health-check',
        expression: '0 * * * *', // 每小时
        handler: async () => {
            const result = await healthMonitor.checkAll();
            return result;
        },
        options: { runImmediately: false }
    };
}

/**
 * 创建数据备份任务
 */
export function createBackupJob(backupPath, retention = 7) {
    return {
        name: 'data-backup',
        expression: '0 2 * * *', // 每天凌晨2点
        handler: async () => {
            const fs = await import('fs');
            const date = new Date().toISOString().split('T')[0];
            // 备份逻辑...
            return { backed: true, date };
        },
        options: {}
    };
}

/**
 * 创建日志清理任务
 */
export function createLogCleanupJob(logPath, maxAge = 7) {
    return {
        name: 'log-cleanup',
        expression: '0 3 * * 0', // 每周日凌晨3点
        handler: async () => {
            // 清理逻辑...
            return { cleaned: true };
        },
        options: {}
    };
}

// ============================================================================
// 单例
// ============================================================================

let schedulerInstance = null;

export function getCronScheduler() {
    if (!schedulerInstance) {
        schedulerInstance = new CronScheduler();
    }
    return schedulerInstance;
}

export default {
    CronExpression,
    CronJob,
    CronScheduler,
    getCronScheduler,
    createHealthCheckJob,
    createBackupJob,
    createLogCleanupJob
};
