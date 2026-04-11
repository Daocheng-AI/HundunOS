// hundunos/stable-modules/env-health-checker/index.js — EnvHealthChecker v3.0
// 环境健康检查：7项核心检测

export class EnvHealthChecker {
    constructor(kernel) {
        this.kernel = kernel;
        this.checks = [];
        this.lastReport = null;
        this._registerChecks();
    }

    _registerChecks() {
        this.checks = [
            {
                id: 'python', name: 'Python 运行时', critical: true,
                check: async (env) => env.python?.available === true,
                fix: '请从 https://python.org 下载安装 Python 3.11+'
            },
            {
                id: 'ollama', name: 'Ollama 本地推理', critical: false,
                check: async (env) => env.ollama?.available === true,
                fix: '运行 "ollama serve" 启动 Ollama 服务'
            },
            {
                id: 'node', name: 'Node.js 运行时', critical: true,
                check: async (env) => !!env.node?.version,
                fix: '请安装 Node.js 18+'
            },
            {
                id: 'openclaw', name: 'OpenClaw CLI', critical: false,
                check: async (env) => env.openclaw?.available === true,
                fix: '请安装 OpenClaw'
            },
            {
                id: 'workspace', name: '工作区目录', critical: true,
                check: async () => {
                    try {
                        const { existsSync } = await import('fs');
                        return existsSync(this.kernel.config.workspace);
                    } catch { return false; }
                },
                fix: `工作区目录不存在: ${this.kernel.config.workspace}`
            },
            {
                id: 'storage', name: '存储层可用', critical: true,
                check: async () => {
                    try {
                        await this.kernel.storage.put('health_test', Date.now());
                        return true;
                    } catch { return false; }
                },
                fix: '存储层不可用，检查磁盘空间和权限'
            },
            {
                id: 'memory', name: '内存充足', critical: false,
                check: async () => {
                    const used = process.memoryUsage().heapUsed;
                    const total = process.memoryUsage().heapTotal;
                    return total > 0 && (used / total) < 0.9;
                },
                fix: '内存使用率 > 90%，建议清理'
            }
        ];
    }

    async checkAll() {
        const env = this.kernel.env || {};
        const results = [];

        for (const check of this.checks) {
            const start = Date.now();
            try {
                const passed = await check.check(env);
                results.push({
                    id: check.id, name: check.name,
                    status: passed ? 'pass' : 'fail',
                    critical: check.critical,
                    fix: passed ? null : check.fix,
                    duration: Date.now() - start
                });
            } catch (e) {
                results.push({
                    id: check.id, name: check.name,
                    status: 'error', critical: check.critical,
                    error: e.message, fix: check.fix,
                    duration: Date.now() - start
                });
            }
        }

        const criticalFails = results.filter(r => r.status !== 'pass' && r.critical);
        const report = {
            timestamp: Date.now(),
            overall: criticalFails.length > 0 ? 'unhealthy' :
                     results.some(r => r.status === 'fail') ? 'warning' : 'healthy',
            results,
            issues: results.filter(r => r.status !== 'pass').map(r => ({
                name: r.name, fix: r.fix, critical: r.critical
            }))
        };

        this.lastReport = report;
        return report;
    }

    async checkOne(checkId) {
        const check = this.checks.find(c => c.id === checkId);
        if (!check) throw new Error(`Unknown check: ${checkId}`);
        const passed = await check.check(this.kernel.env || {});
        return { id: checkId, status: passed ? 'pass' : 'fail', fix: passed ? null : check.fix };
    }

    getReport() { return this.lastReport || { status: 'unknown' }; }
}
