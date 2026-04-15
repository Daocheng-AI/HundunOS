/**
 * HundunOS v3.0 - Cron Trigger 模块
 * S2.B.2 任务
 * 基于 OpenClaw Gateway Cron API 的触发器封装
 */

export const CronSchedule = {
    // 常用调度
    EVERY_MINUTE:      { expr: '* * * * *',  label: '每分钟' },
    EVERY_5_MINUTES:   { expr: '*/5 * * * *', label: '每5分钟' },
    EVERY_15_MINUTES:  { expr: '*/15 * * * *', label: '每15分钟' },
    EVERY_HOUR:        { expr: '0 * * * *',   label: '每小时' },
    EVERY_DAY_9AM:     { expr: '0 9 * * *',   label: '每天9点' },
    EVERY_DAY_MIDNIGHT:{ expr: '0 0 * * *',   label: '每天午夜' },
    EVERY_WEEK_MON:    { expr: '0 0 * * 1',   label: '每周一' }
};

export const CronTaskStatus = {
    PENDING:  'pending',
    RUNNING:  'running',
    SUCCESS:  'success',
    FAILED:   'failed',
    DISABLED: 'disabled'
};

/**
 * 单个 Cron 任务
 */
class CronTask {
    constructor(id, name, schedule, handler, options = {}) {
        this.id        = id;
        this.name      = name;
        this.schedule  = schedule;
        this.handler   = handler;           // async () => void
        this.status    = CronTaskStatus.PENDING;
        this.lastRun   = null;
        this.nextRun   = null;
        this.lastResult = null;
        this.runCount  = 0;
        this.failedCount = 0;
        this.enabled   = options.enabled !== false;
        this.timeoutMs = options.timeoutMs || 300000; // 5min default
        this.onSuccess = options.onSuccess || null;
        this.onFailure = options.onFailure || null;
        this.onComplete = options.onComplete || null;
    }

    async execute() {
        if (!this.enabled) return;
        if (this.status === CronTaskStatus.RUNNING) {
            // console.log(`[Cron] ${this.name} 正在运行，跳过`);
            return;
        }

        this.status   = CronTaskStatus.RUNNING;
        const startMs = Date.now();

        try {
            const result = await Promise.race([
                this.handler(),
                this.newTimeout(this.timeoutMs)
            ]);

            this.status     = CronTaskStatus.SUCCESS;
            this.lastResult = { ok: true, duration: Date.now() - startMs };
            this.runCount++;
            this.lastRun    = new Date().toISOString();
            if (this.onSuccess) this.onSuccess(this.lastResult);

        } catch (err) {
            this.status      = CronTaskStatus.FAILED;
            this.lastResult  = { ok: false, error: err.message, duration: Date.now() - startMs };
            this.failedCount++;
            this.lastRun     = new Date().toISOString();
            if (this.onFailure) this.onFailure(err, this.lastResult);
        } finally {
            if (this.onComplete) this.onComplete(this.status, this.lastResult);
        }
    }

    newTimeout(ms) {
        return new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`任务超时 (${ms}ms)`)), ms)
        );
    }

    toJSON() {
        return {
            id: this.id, name: this.name, status: this.status,
            lastRun: this.lastRun, nextRun: this.nextRun,
            runCount: this.runCount, failedCount: this.failedCount,
            lastResult: this.lastResult
        };
    }
}

/**
 * CronTrigger - 定时任务调度器
 * 负责注册、调度、执行定时任务
 */
export class CronTrigger {
    constructor(kernel) {
        this.kernel     = kernel;
        this.tasks      = new Map();     // id -> CronTask
        this.running    = false;
        this.intervalMs = 60000;         // 1min 轮询间隔
        this._timer      = null;
        this._log        = [];           // 最近执行日志
        this.maxLog      = 100;
    }

    async initialize() {
        // 从存储恢复任务状态
        try {
            const storage = this.kernel?.storage;
            if (storage) {
                const data = await storage.get('cron:tasks');
                if (data) {
                    for (const [id, task] of Object.entries(data)) {
                        if (this.tasks.has(id)) {
                            // 更新已注册任务的状态
                            const t = this.tasks.get(id);
                            t.lastRun    = task.lastRun;
                            t.runCount   = task.runCount || 0;
                            t.failedCount = task.failedCount || 0;
                            t.status     = task.status || CronTaskStatus.PENDING;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[CronTrigger] 恢复任务状态失败:', e.message);
        }
        return this;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 任务注册
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 注册定时任务
     * @param {string} id      - 唯一标识
     * @param {string} name    - 任务名称
     * @param {string|object} schedule - cron 表达式或 CronSchedule 项
     * @param {Function} handler - 任务函数 async () => void
     * @param {object} options  - 可选配置
     */
    register(id, name, schedule, handler, options = {}) {
        if (this.tasks.has(id)) {
            console.warn(`[CronTrigger] 任务 ${id} 已存在，将被替换`);
            this.unregister(id);
        }

        const sched = typeof schedule === 'string' ? schedule : schedule.expr;
        const task  = new CronTask(id, name, sched, handler, options);

        this.tasks.set(id, task);
        this._logEvent('registered', { id, name, schedule: sched });

        return task;
    }

    unregister(id) {
        const removed = this.tasks.delete(id);
        if (removed) this._logEvent('unregistered', { id });
        return removed;
    }

    enable(id) {
        const task = this.tasks.get(id);
        if (task) { task.enabled = true; this._logEvent('enabled', { id }); return true; }
        return false;
    }

    disable(id) {
        const task = this.tasks.get(id);
        if (task) { task.enabled = false; task.status = CronTaskStatus.DISABLED; this._logEvent('disabled', { id }); return true; }
        return false;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 调度控制
    // ─────────────────────────────────────────────────────────────────────────

    start() {
        if (this.running) return;
        this.running = true;
        this._scheduleAll();
        this._timer = setInterval(() => this._tick(), this.intervalMs);
        // kernel M-3 Fix: unref() so the timer does not prevent Node.js process exit
        if (this._timer.unref) this._timer.unref();
        // console.log(`[CronTrigger] 已启动，${this.tasks.size} 个任务`);
    }

    stop() {
        this.running = false;
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
        // console.log('[CronTrigger] 已停止');
    }

    /** 立即触发一次任务（不改变调度） */
    async triggerNow(id) {
        const task = this.tasks.get(id);
        if (!task) throw new Error(`任务 ${id} 不存在`);
        await task.execute();
        return task.lastResult;
    }

    /** 手动触发所有任务 */
    async triggerAll() {
        const results = {};
        for (const [id, task] of this.tasks) {
            if (task.enabled) {
                await task.execute();
                results[id] = task.lastResult;
            }
        }
        return results;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 内部调度
    // ─────────────────────────────────────────────────────────────────────────

    _scheduleAll() {
        for (const task of this.tasks.values()) {
            task.nextRun = this._getNextRun(task.schedule);
        }
    }

    _tick() {
        const now = new Date();
        for (const task of this.tasks.values()) {
            if (!task.enabled) continue;
            if (!task.nextRun) {
                task.nextRun = this._getNextRun(task.schedule);
            }
            if (now >= new Date(task.nextRun)) {
                task.nextRun = this._getNextRun(task.schedule); // 先更新下次时间
                task.execute().catch(e => console.error(`[CronTrigger] ${task.name} 执行异常:`, e.message));
            }
        }
    }

    // Simple cron parser - supports star/n, n, star patterns
    _getNextRun(expr) {
        // 极度简化版：仅支持 */n 分钟和固定分钟
        const parts = expr.trim().split(/\s+/);
        if (!parts[0]) return null;

        const now     = new Date();
        let   nextMin = null;

        if (parts[0].startsWith('*/')) {
            const interval = parseInt(parts[0].slice(2));
            const mod = Math.floor(now.getMinutes() / interval);
            nextMin = (mod + 1) * interval;
            if (nextMin >= 60) nextMin = interval;
        } else if (parts[0] === '*') {
            nextMin = now.getMinutes() + 1;
        } else {
            nextMin = parseInt(parts[0]);
        }

        const next = new Date(now);
        next.setMinutes(nextMin, 0, 0);
        if (next <= now) next.setHours(next.getHours() + 1);

        return next.toISOString();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 日志与状态
    // ─────────────────────────────────────────────────────────────────────────

    _logEvent(type, data) {
        this._log.unshift({ type, ...data, ts: new Date().toISOString() });
        if (this._log.length > this.maxLog) this._log.pop();
    }

    getTasks() {
        return Array.from(this.tasks.values()).map(t => t.toJSON());
    }

    getTask(id) {
        const t = this.tasks.get(id);
        return t ? t.toJSON() : null;
    }

    getStats() {
        const tasks = this.getTasks();
        return {
            total:    tasks.length,
            enabled:  tasks.filter(t => t.status !== CronTaskStatus.DISABLED).length,
            running:  tasks.filter(t => t.status === CronTaskStatus.RUNNING).length,
            success:  tasks.filter(t => t.lastResult?.ok).length,
            failed:   tasks.filter(t => t.status === CronTaskStatus.FAILED).length,
            recent:   this._log.slice(0, 10)
        };
    }

    /** 导出健康数据（供 HealthMonitor 使用） */
    exportHealth() {
        const tasks = this.getTasks();
        return {
            tasks: tasks.map(t => ({
                id: t.id, name: t.name,
                status: t.status === CronTaskStatus.DISABLED ? 'disabled'
                      : t.status === CronTaskStatus.FAILED ? 'error'
                      : t.status === CronTaskStatus.SUCCESS ? 'ok' : 'unknown',
                last_run: t.lastRun,
                last_result: t.lastResult?.ok ? 'success' : t.lastResult ? 'failed' : null
            }))
        };
    }
}

export default CronTrigger;
