/**
 * HundunOS v3.0 - HealthMonitor 10维度健康监控
 * S2.B.1 任务
 */

export const HealthDimension = {
    KERNEL:      'kernel',
    MEMORY:      'memory',
    MODEL_ROUTER:'model_router',
    EDICT:       'edict',
    SECURITY:    'security',
    STORAGE:     'storage',
    CRON:        'cron',
    MCP:         'mcp',
    WORKBUDDY:   'workbuddy',
    NETWORK:     'network'
};

export const HealthStatus = {
    OK:      'ok',
    WARN:    'warn',
    ERROR:   'error',
    UNKNOWN: 'unknown'
};

/**
 * 单维度健康检查结果
 */
class DimensionResult {
    constructor(dimension, status, score, message, details = {}) {
        this.dimension = dimension;
        this.status    = status;
        this.score     = score;       // 0-100
        this.message   = message;
        this.details   = details;
        this.checkedAt = new Date().toISOString();
    }
}

/**
 * HealthMonitor - 10维度健康监控
 */
export class HealthMonitor {
    constructor(kernel) {
        this.kernel  = kernel;
        this.history = [];          // 历史检查记录
        this.maxHistory = 50;
        this.alertThreshold = 60;   // 低于此分数触发告警
        this.alertHandlers = [];

        // 维度权重（含加载时校验：浮点容差 0.001，不等于 1.0 则抛出）
        const DEFAULT_WEIGHTS = {
            [HealthDimension.KERNEL]:       0.15,
            [HealthDimension.MEMORY]:       0.12,
            [HealthDimension.MODEL_ROUTER]: 0.12,
            [HealthDimension.EDICT]:        0.12,
            [HealthDimension.SECURITY]:     0.10,
            [HealthDimension.STORAGE]:      0.10,
            [HealthDimension.CRON]:         0.08,
            [HealthDimension.MCP]:          0.08,
            [HealthDimension.WORKBUDDY]:    0.08,
            [HealthDimension.NETWORK]:      0.05
        };

        // 支持从 kernel.config.system.healthMonitor.weights 覆盖
        const configuredWeights = kernel?.config?.system?.healthMonitor?.weights || {};
        this.weights = { ...DEFAULT_WEIGHTS, ...configuredWeights };

        // 浮点容差校验：|sum - 1.0| <= 0.001
        const totalWeight = Object.values(this.weights).reduce((a, b) => a + Number(b), 0);
        if (Math.abs(totalWeight - 1.0) > 0.001) {
            throw new Error(
                `[HealthMonitor] 权重总和不等于 1.0: sum=${totalWeight.toFixed(4)} — ` +
                `使用默认值。请检查 config/system.json 中 healthMonitor.weights 的配置。`
            );
        }
    }

    async initialize() {
        // 注册到 kernel 事件
        if (this.kernel?.on) {
            this.kernel.on('module:error', (data) => this._onModuleError(data));
        }
        return this;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 全量检查
    // ─────────────────────────────────────────────────────────────────────────

    async checkAll() {
        const results = {};
        const checks = [
            this._checkKernel(),
            this._checkMemory(),
            this._checkModelRouter(),
            this._checkEdict(),
            this._checkSecurity(),
            this._checkStorage(),
            this._checkCron(),
            this._checkMcp(),
            this._checkWorkbuddy(),
            this._checkNetwork()
        ];

        const settled = await Promise.allSettled(checks);
        const dims = Object.values(HealthDimension);

        settled.forEach((s, i) => {
            if (s.status === 'fulfilled') {
                results[dims[i]] = s.value;
            } else {
                results[dims[i]] = new DimensionResult(
                    dims[i], HealthStatus.ERROR, 0,
                    `检查失败: ${s.reason?.message || s.reason}`
                );
            }
        });

        const overall = this._computeOverall(results);
        const report  = { timestamp: new Date().toISOString(), overall, dimensions: results };

        // 存历史
        this.history.unshift(report);
        if (this.history.length > this.maxHistory) this.history.pop();

        // 告警
        if (overall.score < this.alertThreshold) {
            this._triggerAlerts(report);
        }

        return report;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 各维度检查
    // ─────────────────────────────────────────────────────────────────────────

    async _checkKernel() {
        try {
            const k = this.kernel;
            if (!k) return new DimensionResult(HealthDimension.KERNEL, HealthStatus.WARN, 50, 'Kernel 未注入');

            const hasRegistry = !!k.moduleRegistry;
            const hasState    = !!k.state;
            const score = (hasRegistry ? 50 : 0) + (hasState ? 50 : 0);
            const status = score === 100 ? HealthStatus.OK : score >= 50 ? HealthStatus.WARN : HealthStatus.ERROR;

            return new DimensionResult(HealthDimension.KERNEL, status, score, `Kernel 状态: ${status}`, {
                hasRegistry, hasState
            });
        } catch (e) {
            return new DimensionResult(HealthDimension.KERNEL, HealthStatus.ERROR, 0, e.message);
        }
    }

    async _checkMemory() {
        try {
            const mg = this.kernel?.memoryGraph;
            if (!mg) return new DimensionResult(HealthDimension.MEMORY, HealthStatus.WARN, 60, 'MemoryGraph 未挂载');

            const stats = mg.getStats ? mg.getStats() : {};
            const score = 80 + (stats.reads > 0 ? 10 : 0) + (stats.writes > 0 ? 10 : 0);

            return new DimensionResult(HealthDimension.MEMORY, HealthStatus.OK, Math.min(score, 100), 'MemoryGraph 正常', stats);
        } catch (e) {
            return new DimensionResult(HealthDimension.MEMORY, HealthStatus.ERROR, 0, e.message);
        }
    }

    async _checkModelRouter() {
        try {
            const mr = this.kernel?.modelRouter;
            if (!mr) return new DimensionResult(HealthDimension.MODEL_ROUTER, HealthStatus.WARN, 60, 'ModelRouter 未挂载');

            const providers = mr.providers?.size ?? 0;
            const score = providers > 0 ? 90 : 60;

            return new DimensionResult(HealthDimension.MODEL_ROUTER, HealthStatus.OK, score, `ModelRouter 正常，${providers} 个 Provider`, { providers });
        } catch (e) {
            return new DimensionResult(HealthDimension.MODEL_ROUTER, HealthStatus.ERROR, 0, e.message);
        }
    }

    async _checkEdict() {
        try {
            // 检查 edict 模块是否可加载
            const { createEdict } = await import('../stable-modules/edict/core/index.js');
            const score = createEdict ? 95 : 60;
            return new DimensionResult(HealthDimension.EDICT, HealthStatus.OK, score, 'edict 模块正常');
        } catch (e) {
            return new DimensionResult(HealthDimension.EDICT, HealthStatus.ERROR, 20, `edict 加载失败: ${e.message}`);
        }
    }

    async _checkSecurity() {
        try {
            const { PermissionGating } = await import('../stable-modules/permission-gating/index.js');
            const score = PermissionGating ? 90 : 50;
            return new DimensionResult(HealthDimension.SECURITY, HealthStatus.OK, score, '安全模块正常');
        } catch (e) {
            return new DimensionResult(HealthDimension.SECURITY, HealthStatus.WARN, 50, `安全模块加载失败: ${e.message}`);
        }
    }

    async _checkStorage() {
        try {
            const storage = this.kernel?.storage;
            if (!storage) return new DimensionResult(HealthDimension.STORAGE, HealthStatus.WARN, 60, 'Storage 未挂载');

            // 简单读写测试
            const testKey = '__health_check__';
            await storage.put(testKey, { ts: Date.now() });
            const val = await storage.get(testKey);
            const score = val ? 100 : 50;

            return new DimensionResult(HealthDimension.STORAGE, HealthStatus.OK, score, 'Storage 读写正常');
        } catch (e) {
            return new DimensionResult(HealthDimension.STORAGE, HealthStatus.ERROR, 0, e.message);
        }
    }

    async _checkCron() {
        // 检查 cron 任务健康文件
        try {
            const { readFileSync, existsSync } = await import('fs');
            const { join } = await import('path');
            const { fileURLToPath } = await import('url');
            const __dirname = fileURLToPath(new URL('.', import.meta.url));
            const cronFile = join(__dirname, '../../.learnings/cron_tasks_health.json');

            if (!existsSync(cronFile)) {
                return new DimensionResult(HealthDimension.CRON, HealthStatus.WARN, 60, 'Cron 健康文件不存在');
            }

            const data = JSON.parse(readFileSync(cronFile, 'utf-8'));
            const tasks = data.tasks || [];
            const healthy = tasks.filter(t => t.status === 'ok' || t.last_result === 'success').length;
            const score = tasks.length > 0 ? Math.round((healthy / tasks.length) * 100) : 80;

            return new DimensionResult(HealthDimension.CRON, HealthStatus.OK, score,
                `Cron: ${healthy}/${tasks.length} 任务健康`, { healthy, total: tasks.length });
        } catch (e) {
            return new DimensionResult(HealthDimension.CRON, HealthStatus.WARN, 70, `Cron 检查异常: ${e.message}`);
        }
    }

    async _checkMcp() {
        // 检查 MCP 端口
        try {
            const { createConnection } = await import('net');
            const alive = await new Promise((resolve) => {
                const sock = createConnection({ host: '127.0.0.1', port: 28790 });
                sock.on('connect', () => { sock.destroy(); resolve(true); });
                sock.on('error', () => resolve(false));
                setTimeout(() => { sock.destroy(); resolve(false); }, 2000);
            });

            const score = alive ? 100 : 30;
            const status = alive ? HealthStatus.OK : HealthStatus.ERROR;
            return new DimensionResult(HealthDimension.MCP, status, score,
                alive ? 'MCP Server 运行中 (28790)' : 'MCP Server 未响应');
        } catch (e) {
            return new DimensionResult(HealthDimension.MCP, HealthStatus.WARN, 50, e.message);
        }
    }

    async _checkWorkbuddy() {
        // 检查 WorkBuddy 进程（通过 PID 文件）
        try {
            const { readFileSync, existsSync } = await import('fs');
            const { join } = await import('path');
            const pidFile = join(process.env.USERPROFILE || '.', '.tool-handover', 'poller.pid');

            if (!existsSync(pidFile)) {
                return new DimensionResult(HealthDimension.WORKBUDDY, HealthStatus.WARN, 50, 'WorkBuddy PID 文件不存在');
            }

            const pid = parseInt(readFileSync(pidFile, 'utf-8').trim());
            // 检查 handover 目录
            const handoverDir = join(process.env.USERPROFILE || '.', '.tool-handover', 'requests');
            const exists = existsSync(handoverDir);

            const score = exists ? 90 : 60;
            return new DimensionResult(HealthDimension.WORKBUDDY, HealthStatus.OK, score,
                `WorkBuddy 就绪 (PID: ${pid})`, { pid, handoverDir: exists });
        } catch (e) {
            return new DimensionResult(HealthDimension.WORKBUDDY, HealthStatus.WARN, 50, e.message);
        }
    }

    async _checkNetwork() {
        // 检查 Ollama 本地服务
        try {
            const { createConnection } = await import('net');
            const ollamaAlive = await new Promise((resolve) => {
                const sock = createConnection({ host: '127.0.0.1', port: 11434 });
                sock.on('connect', () => { sock.destroy(); resolve(true); });
                sock.on('error', () => resolve(false));
                setTimeout(() => { sock.destroy(); resolve(false); }, 2000);
            });

            const score = ollamaAlive ? 90 : 60;
            return new DimensionResult(HealthDimension.NETWORK, HealthStatus.OK, score,
                ollamaAlive ? 'Ollama 服务正常 (11434)' : 'Ollama 未响应', { ollama: ollamaAlive });
        } catch (e) {
            return new DimensionResult(HealthDimension.NETWORK, HealthStatus.WARN, 60, e.message);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 综合评分
    // ─────────────────────────────────────────────────────────────────────────

    _computeOverall(results) {
        let weightedScore = 0;
        let totalWeight   = 0;
        const issues = [];

        for (const [dim, result] of Object.entries(results)) {
            const w = this.weights[dim] || 0.1;
            weightedScore += result.score * w;
            totalWeight   += w;

            if (result.status === HealthStatus.ERROR) {
                issues.push({ dimension: dim, message: result.message, severity: 'error' });
            } else if (result.status === HealthStatus.WARN) {
                issues.push({ dimension: dim, message: result.message, severity: 'warn' });
            }
        }

        const score  = Math.round(weightedScore / totalWeight);
        const status = score >= 80 ? HealthStatus.OK
                     : score >= 60 ? HealthStatus.WARN
                     : HealthStatus.ERROR;

        return { score, status, issues };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 告警
    // ─────────────────────────────────────────────────────────────────────────

    onAlert(handler) {
        this.alertHandlers.push(handler);
        return this;
    }

    _triggerAlerts(report) {
        for (const handler of this.alertHandlers) {
            try { handler(report); } catch (_) {}
        }
    }

    /**
     * REST API 专用：同步返回最新健康报告（不重新检查，性能友好）
     */
    getStatus() {
        if (!this.history || this.history.length === 0) {
            return {
                healthy: false,
                overall: { score: 0, status: 'ERROR', issues: [] },
                dimensions: {},
                timestamp: new Date().toISOString()
            };
        }
        const latest = this.history[0];
        return {
            healthy: latest.overall.score >= 60,
            overall: latest.overall,
            dimensions: latest.dimensions,
            timestamp: latest.timestamp
        };
    }

    _onModuleError(data) {
        // 模块错误时触发快速检查
        const dim = data?.module ? HealthDimension.KERNEL : null;
        if (dim) {
            this._checkKernel().then(r => {
                if (r.score < this.alertThreshold) this._triggerAlerts({ quick: true, dimension: r });
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 统计
    // ─────────────────────────────────────────────────────────────────────────

    getStats() {
        if (this.history.length === 0) return { checks: 0 };
        const latest = this.history[0];
        const avgScore = this.history.reduce((s, r) => s + r.overall.score, 0) / this.history.length;

        return {
            checks:    this.history.length,
            latest:    latest.overall,
            avgScore:  Math.round(avgScore),
            timestamp: latest.timestamp
        };
    }

    getTrend() {
        return this.history.slice(0, 10).map(r => ({
            timestamp: r.timestamp,
            score:     r.overall.score,
            status:    r.overall.status
        }));
    }
}

export default HealthMonitor;
