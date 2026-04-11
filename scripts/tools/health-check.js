// HundunOS Tool: System Health Check
// Performs comprehensive system health diagnostics

export default {
    name: 'health-check',
    description: '检查系统健康状态',
    category: 'system',
    timeout: 5000,
    
    async execute(params, context) {
        const results = {
            timestamp: new Date().toISOString(),
            checks: {}
        };

        // Check memory
        const mem = process.memoryUsage();
        results.checks.memory = {
            status: mem.heapUsed / mem.heapTotal < 0.9 ? 'ok' : 'warning',
            heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB',
            heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + 'MB'
        };

        // Check uptime
        results.checks.uptime = {
            status: 'ok',
            seconds: Math.round(process.uptime())
        };

        // Check Node version
        results.checks.node = {
            status: 'ok',
            version: process.version
        };

        // Overall status
        const hasIssue = Object.values(results.checks).some(c => c.status !== 'ok');
        results.overall = hasIssue ? 'degraded' : 'healthy';

        return results;
    }
};
