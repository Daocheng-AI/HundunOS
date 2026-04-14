/**
 * HundunOS v3.0 - Simple Benchmarks
 * 简化版性能基准测试
 */

import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RESULTS = [];

async function benchmark(name, fn, runs = 100) {
    // 预热
    for (let i = 0; i < 5; i++) await fn();

    // 测量
    const times = [];
    for (let i = 0; i < runs; i++) {
        const start = performance.now();
        await fn();
        const elapsed = performance.now() - start;
        times.push(elapsed);
    }

    // 统计
    times.sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / runs;
    const median = times[Math.floor(runs / 2)];
    const p95 = times[Math.floor(runs * 0.95)];
    const p99 = times[Math.floor(runs * 0.99)];

    const result = { name, runs, mean, median, p95, p99 };
    RESULTS.push(result);

    // console.log(`✅ ${name}`);
    // console.log(`   Mean: ${mean.toFixed(3)}ms | Median: ${median.toFixed(3)}ms | P95: ${p95.toFixed(3)}ms`);
    
    return result;
}

async function main() {
    // console.log('\n╔══════════════════════════════════════════════════════╗');
    // console.log('║        HundunOS v3.0 Performance Benchmarks          ║');
    // console.log('╚══════════════════════════════════════════════════════╝\n');

    // Intent Engine
    try {
        const { IntentEngine } = await import('../kernel/intent-engine.js');
        const engine = new IntentEngine();
        await benchmark('IntentEngine: Init', async () => {
            const e = new IntentEngine();
            e._initIntentPatterns();
        }, 50);
    } catch (e) {
        // console.log('⚠️ IntentEngine: Init - Skipped:', e.message.slice(0, 50));
    }

    // Circuit Breaker
    try {
        const { CircuitBreaker } = await import('../kernel/model-router/circuit-breaker.js');
        await benchmark('CircuitBreaker: Check', async () => {
            const cb = new CircuitBreaker();
            cb.canCall();
            cb.recordSuccess();
        }, 100);
    } catch (e) {
        // console.log('⚠️ CircuitBreaker: Check - Skipped:', e.message.slice(0, 50));
    }

    // Strategy
    try {
        const { assessComplexity, createStrategy } = await import('../kernel/model-router/strategies/index.js');
        await benchmark('Strategy: Assess', async () => {
            assessComplexity('帮我分析这个复杂的系统架构设计');
        }, 100);
    } catch (e) {
        // console.log('⚠️ Strategy: Assess - Skipped:', e.message.slice(0, 50));
    }

    // RBAC
    try {
        const { RBACManager, Role } = await import('../stable-modules/rbac/index.js');
        await benchmark('RBAC: Permission Check', async () => {
            const rbac = new RBACManager();
            rbac.registerUser('bench', Role.DEVELOPER);
            rbac.hasPermission('bench', 'write');
        }, 50);
    } catch (e) {
        // console.log('⚠️ RBAC: Permission Check - Skipped:', e.message.slice(0, 50));
    }

    // Health Monitor
    try {
        const { HealthMonitor } = await import('../stable-modules/health-monitor/index.js');
        await benchmark('HealthMonitor: Check', async () => {
            const monitor = new HealthMonitor();
            await monitor.checkAll();
        }, 20);
    } catch (e) {
        // console.log('⚠️ HealthMonitor: Check - Skipped:', e.message.slice(0, 50));
    }

    // edict
    try {
        const { createEdict, getEdict } = await import('../stable-modules/edict/core/index.js');
        await benchmark('edict: Create/Get', async () => {
            const edict = createEdict('bench', 'test message');
            getEdict(edict.id);
        }, 50);
    } catch (e) {
        // console.log('⚠️ edict: Create/Get - Skipped:', e.message.slice(0, 50));
    }

    // Recovery
    try {
        const { AutoRecoveryManager } = await import('../stable-modules/recovery/index.js');
        await benchmark('Recovery: Manager Init', async () => {
            const recovery = new AutoRecoveryManager();
            recovery.getStats();
        }, 50);
    } catch (e) {
        // console.log('⚠️ Recovery: Manager Init - Skipped:', e.message.slice(0, 50));
    }

    // Message Bus
    try {
        const { MessageBus } = await import('../infrastructure/message-bus/index.js');
        await benchmark('MessageBus: Pub/Sub', async () => {
            const bus = new MessageBus();
            const ch = bus.createChannel('bench');
            ch.subscribe('test', () => {});
            ch.publish('test', { data: 'test' });
        }, 50);
    } catch (e) {
        // console.log('⚠️ MessageBus: Pub/Sub - Skipped:', e.message.slice(0, 50));
    }

    // 保存结果
    const benchDir = path.join(__dirname, '../.benchmarks');
    if (!fs.existsSync(benchDir)) {
        fs.mkdirSync(benchDir, { recursive: true });
    }

    const report = {
        timestamp: new Date().toISOString(),
        results: RESULTS,
        summary: {
            total: RESULTS.length,
            avgMean: RESULTS.reduce((a, r) => a + r.mean, 0) / RESULTS.length
        }
    };

    fs.writeFileSync(path.join(benchDir, 'results.json'), JSON.stringify(report, null, 2));

    // 生成报告
    const lines = [
        '# HundunOS v3.0 Benchmark Report',
        '',
        `Generated: ${report.timestamp}`,
        '',
        '## Results',
        '',
        '| Benchmark | Runs | Mean (ms) | Median (ms) | P95 (ms) |',
        '|-----------|------|-----------|-------------|----------|'
    ];

    for (const r of RESULTS) {
        lines.push(`| ${r.name} | ${r.runs} | ${r.mean.toFixed(3)} | ${r.median.toFixed(3)} | ${r.p95.toFixed(3)} |`);
    }

    lines.push('', `**Average Mean**: ${report.summary.avgMean.toFixed(3)}ms`);

    fs.writeFileSync(path.join(benchDir, 'report.md'), lines.join('\n'));

    // console.log('\n══════════════════════════════════════════════════════');
    // console.log(`  ✅ ${RESULTS.length} benchmarks completed`);
    // console.log(`  📊 Average Mean: ${report.summary.avgMean.toFixed(3)}ms`);
    // console.log(`  📄 Report: ${benchDir}/report.md`);
    // console.log('══════════════════════════════════════════════════════\n');
}

main().catch(console.error);
