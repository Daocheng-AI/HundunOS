// hundunos/kernel/scheduler.js — HundunOS Scheduler v3.1
// 内置轻量级调度器（参考 Hermes cron/scheduler.py）
// v3.1 升级（从 scripts/cron_monitor.py 升级为内置模块）：
//   - 自然语言任务配置
//   - Windows Toast 通知交付
//   - 会话持久化 + 自动恢复
//   - 多触发器支持（once/interval/cron）

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

// 简易 cron 解析（不引入外部依赖）
const CRON_FIELDS = ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'];

class Scheduler extends EventEmitter {
    constructor(kernel) {
        super();
        this.kernel = kernel;
        this.jobs = new Map();        // id -> ScheduledJob
        this.timers = new Map();      // id -> timer handle
        this.history = [];            // 执行历史
        this.maxHistory = 200;
        this.stats = { scheduled: 0, executed: 0, failed: 0 };
    }

    async initialize() {
        await this._loadJobs();
        // 恢复所有 persistent jobs
        for (const job of this.jobs.values()) {
            if (job.status === 'active') {
                this._scheduleJob(job);
            }
        }
        console.log(`[Scheduler] Initialized ${this.jobs.size} jobs (${this.stats.scheduled} active)`);
    }

    // ================================================================
    // Job 管理 API
    // ================================================================

    /**
     * 创建定时任务（Hermes 风格：支持自然语言配置）
     * @param {Object} config
     * @param {string} config.name - 任务名称
     * @param {string} config.type - 'once' | 'interval' | 'cron'
     * @param {string|number} config.schedule - 自然语言或数值（ms/标准）
     * @param {Function|string} config.task - 任务内容（函数或工具ID）
     * @param {Object} opts - { persist: true, notify: true, ... }
     */
    async schedule(config, opts = {}) {
        const job = {
            id: config.id || `job_${randomUUID().slice(0, 8)}`,
            name: config.name || 'Unnamed Task',
            type: config.type || 'interval',
            schedule: this._normalizeSchedule(config.schedule),
            task: config.task,
            status: 'active',
            opts: {
                persist: opts.persist !== false,  // 默认持久化
                notify: opts.notify !== false,    // 默认通知
                maxRetries: opts.maxRetries || 2,
                ...opts,
            },
            created: Date.now(),
            lastRun: null,
            nextRun: null,
            runCount: 0,
            failCount: 0,
            lastError: null,
            history: [],
        };

        // 计算下次执行时间
        job.nextRun = this._calcNextRun(job);
        this.jobs.set(job.id, job);

        if (job.status === 'active') {
            this._scheduleJob(job);
        }

        if (job.opts.persist) {
            await this._persistJob(job);
        }

        this.stats.scheduled++;
        this.emit('job:created', job);
        console.log(`[Scheduler] Job "${job.name}" (${job.id}) scheduled: next run in ${this._msToHuman(job.nextRun - Date.now())}`);
        return job;
    }

    /**
     * 取消任务
     */
    cancel(id) {
        const job = this.jobs.get(id);
        if (!job) return false;

        // 清除定时器
        const timer = this.timers.get(id);
        if (timer) {
            clearTimeout(timer);
            clearInterval(timer);
            this.timers.delete(id);
        }

        job.status = 'cancelled';
        this._persistJob(job);
        this.emit('job:cancelled', job);
        console.log(`[Scheduler] Job "${job.name}" cancelled`);
        return true;
    }

    /**
     * 立即执行任务
     */
    async runNow(id) {
        const job = this.jobs.get(id);
        if (!job) throw new Error(`Job not found: ${id}`);
        await this._executeJob(job, true);
    }

    /**
     * 列出所有任务
     */
    list(filter = {}) {
        let jobs = Array.from(this.jobs.values());
        if (filter.status) jobs = jobs.filter(j => j.status === filter.status);
        if (filter.type) jobs = jobs.filter(j => j.type === filter.type);
        return jobs.map(j => ({
            id: j.id, name: j.name, type: j.type,
            status: j.status, nextRun: j.nextRun,
            lastRun: j.lastRun, runCount: j.runCount,
        }));
    }

    // ================================================================
    // 内部执行逻辑
    // ================================================================

    _scheduleJob(job) {
        if (job.status !== 'active') return;
        const delay = job.nextRun - Date.now();
        if (delay <= 0) {
            // 立即执行（不阻塞）
            setImmediate(() => this._executeJob(job));
        } else {
            const timer = setTimeout(() => this._executeJob(job), delay);
            this.timers.set(job.id, timer);
        }
    }

    async _executeJob(job, isManual = false) {
        const start = Date.now();
        let success = true;
        let result = null;
        let error = null;

        try {
            if (typeof job.task === 'function') {
                result = await job.task();
            } else if (typeof job.task === 'string') {
                // 工具ID模式（集成 ToolBridge）
                const toolBridge = this.kernel?.modules?.toolBridge;
                if (toolBridge) {
                    result = await toolBridge.execute(job.task, job.opts.args || '');
                } else {
                    result = { executed: job.task, note: 'ToolBridge not available' };
                }
            } else {
                result = { executed: 'no-op' };
            }
        } catch (e) {
            success = false;
            error = e.message;
            job.failCount++;
            job.lastError = error;
            this.stats.failed++;
            console.error(`[Scheduler] Job "${job.name}" failed:`, error);
        }

        job.lastRun = Date.now();
        job.runCount++;

        // 记录历史
        const entry = { timestamp: job.lastRun, duration: Date.now() - start, success, result, error };
        job.history.push(entry);
        if (job.history.length > 50) job.history.shift();
        this.history.push(entry);
        if (this.history.length > this.maxHistory) this.history.shift();

        this.stats.executed++;
        this.emit('job:executed', { job: { id: job.id, name: job.name }, success, duration: entry.duration });

        // 通知（Windows Toast）
        if (job.opts.notify && !isManual) {
            this._notify(job, success, entry);
        }

        // 更新下次执行时间
        if (job.type !== 'once') {
            job.nextRun = this._calcNextRun(job);
            if (job.status === 'active') {
                this._scheduleJob(job);
            }
        } else {
            job.status = 'completed';
        }

        if (job.opts.persist) {
            await this._persistJob(job);
        }
    }

    // ================================================================
    // Windows Toast 通知（Hermes Delivery 模式）
    // ================================================================

    _notify(job, success, entry) {
        if (process.platform !== 'win32') return;

        const title = success ? `✅ ${job.name}` : `❌ ${job.name}`;
        const body = success
            ? `执行成功 (${entry.duration}ms)`
            : `执行失败: ${entry.error?.slice(0, 100)}`;

        try {
            // 使用 Windows PowerShell toast
            // 安全修复：使用 XML 模板参数化赋值，避免命令注入
            const { execSync } = require('child_process');
            
            // 转义 XML 特殊字符
            const escapeXml = (str) => {
                if (!str) return '';
                return String(str)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&apos;');
            };
            
            const safeTitle = escapeXml(title);
            const safeBody = escapeXml(body);
            
            // 使用变量赋值而非字符串插值
            const psScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
$t = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('HundunOS')
$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$xml.SelectNodes('//text')[0].InnerText = [char[]]@(${safeTitle.split('').map(c => c.charCodeAt(0)).join(',')})
$xml.SelectNodes('//text')[1].InnerText = [char[]]@(${safeBody.split('').map(c => c.charCodeAt(0)).join(',')})
$t.Show([Windows.UI.Notifications.ToastNotification]::new($xml))
`.trim();
            
            execSync('powershell -EncodedCommand ' + Buffer.from(psScript, 'utf16le').toString('base64'), { 
                stdio: 'ignore', 
                timeout: 3000 
            });
        } catch {
            // Toast 通知失败，静默降级（不影响主流程）
        }
    }

    // ================================================================
    // 计划解析
    // ================================================================

    /**
     * 解析 schedule（支持自然语言 + 数值 + cron）
     * Hermes 模式：接受 "every 5 minutes", "daily at 9am", cron 格式等
     */
    _normalizeSchedule(schedule) {
        if (typeof schedule === 'number') {
            return { type: 'interval', ms: schedule };
        }
        if (typeof schedule !== 'string') {
            return { type: 'interval', ms: 60000 };
        }

        const s = schedule.trim().toLowerCase();

        // 标准 cron 格式：* * * * *
        if (/^[\d*,/-]+\s+[\d*,/-]+\s+[\d*,/-]+\s+[\d*,/-]+\s+[\d*,/-]+$/.test(s)) {
            const parts = s.split(/\s+/);
            return { type: 'cron', fields: { minute: parts[0], hour: parts[1], dayOfMonth: parts[2], month: parts[3], dayOfWeek: parts[4] } };
        }

        // 自然语言解析
        if (s.startsWith('every')) {
            const m = s.match(/every\s+(\d+)?\s*(second|minute|hour|day|week)s?/);
            if (m) {
                const n = parseInt(m[1] || '1');
                const unit = m[2];
                const ms = { second: 1000, minute: 60000, hour: 3600000, day: 86400000, week: 604800000 }[unit] * n;
                return { type: 'interval', ms };
            }
        }

        // "daily at 9:00" / "at 9am"
        const atMatch = s.match(/daily\s+at\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?|at\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?/);
        if (atMatch) {
            let hour = parseInt(atMatch[1] || atMatch[4] || '9');
            const min = parseInt(atMatch[2] || atMatch[5] || '0');
            const ampm = atMatch[3] || atMatch[6] || '';
            if (ampm === 'pm' && hour < 12) hour += 12;
            if (ampm === 'am' && hour === 12) hour = 0;
            return { type: 'daily', hour, minute: min };
        }

        // 默认：1分钟
        return { type: 'interval', ms: 60000 };
    }

    /**
     * 计算下次执行时间
     */
    _calcNextRun(job) {
        const now = Date.now();
        if (job.type === 'once') {
            return typeof job.schedule === 'number' ? now + job.schedule : now + 5000;
        }
        if (job.type === 'interval') {
            const ms = job.schedule.ms || 60000;
            if (job.lastRun) return job.lastRun + ms;
            return now + ms;
        }
        if (job.type === 'cron' || job.schedule?.type === 'cron') {
            return this._nextCronRun(job.schedule || job.schedule, now);
        }
        if (job.schedule?.type === 'daily') {
            const { hour, minute } = job.schedule;
            const next = new Date();
            next.setHours(hour, minute, 0, 0);
            if (next.getTime() <= now) next.setDate(next.getDate() + 1);
            return next.getTime();
        }
        return now + 60000;
    }

    _nextCronRun(schedule, now) {
        // 简化 cron：只处理分钟级
        const min = schedule.fields?.minute || '*';
        const hour = schedule.fields?.hour || '*';
        const d = new Date(now);
        d.setSeconds(0, 0);
        d.setMinutes(d.getMinutes() + 1);

        // 最多扫描到 +7 天
        for (let i = 0; i < 7 * 24 * 60; i++) {
            const matchMin = min === '*' || min.split(',').includes(String(d.getMinutes()));
            const matchHour = hour === '*' || hour.split(',').includes(String(d.getHours()));
            if (matchMin && matchHour) return d.getTime();
            d.setMinutes(d.getMinutes() + 1);
        }
        return now + 60000;
    }

    // ================================================================
    // 持久化（存储到 kernel.storage）
    // ================================================================

    async _persistJob(job) {
        try {
            const jobs = [];
            for (const [id, j] of this.jobs) {
                jobs.push({ ...j, task: typeof j.task === 'function' ? null : j.task });
            }
            await this.kernel?.storage?.put('scheduler:jobs', jobs);
        } catch {}
    }

    async _loadJobs() {
        try {
            const data = await this.kernel?.storage?.get('scheduler:jobs');
            if (Array.isArray(data)) {
                for (const j of data) {
                    if (!this.jobs.has(j.id)) {
                        this.jobs.set(j.id, j);
                    }
                }
            }
        } catch {}
    }

    // ================================================================
    // 工具方法
    // ================================================================

    _msToHuman(ms) {
        if (ms < 60000) return `${Math.round(ms / 1000)}s`;
        if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
        if (ms < 86400000) return `${Math.round(ms / 3600000)}h`;
        return `${Math.round(ms / 86400000)}d`;
    }

    getStats() {
        return {
            ...this.stats,
            active: Array.from(this.jobs.values()).filter(j => j.status === 'active').length,
            paused: Array.from(this.jobs.values()).filter(j => j.status === 'paused').length,
        };
    }

    async shutdown() {
        for (const [id, timer] of this.timers) {
            clearTimeout(timer);
            clearInterval(timer);
        }
        this.timers.clear();
        await this._persistAll();
        console.log('[Scheduler] Shutdown — all timers cleared');
    }

    async _persistAll() {
        await this._persistJob(null);
    }
}

export { Scheduler };
