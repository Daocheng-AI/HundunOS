/**
 * HundunOS v3.0 - S2 阶段2集成测试
 */

import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HUNDUNOS_ROOT = path.join(__dirname, '..');

let passed = 0, failed = 0;
const results = [];

function test(name, fn) {
    const start = Date.now();
    try { fn(); passed++; results.push({ name, status: 'PASS', elapsed: Date.now() - start }); // review: removed // review: removed console.log(`✅ ${name}`); }
    catch (e) { failed++; results.push({ name, status: 'FAIL', error: e.message, elapsed: Date.now() - start }); // review: removed // review: removed console.log(`❌ ${name}: ${e.message}`); }
}

async function asyncTest(name, fn) {
    const start = Date.now();
    try { await fn(); passed++; results.push({ name, status: 'PASS', elapsed: Date.now() - start }); // review: removed // review: removed console.log(`✅ ${name}`); }
    catch (e) { failed++; results.push({ name, status: 'FAIL', error: e.message, elapsed: Date.now() - start }); // review: removed // review: removed console.log(`❌ ${name}: ${e.message}`); }
}

// review: removed // review: removed console.log('\n=== S2.B HealthMonitor 测试 ===\n');

await asyncTest('S2.B.1.1 health-monitor 目录存在', async () => {
    assert.ok(fs.existsSync(path.join(HUNDUNOS_ROOT, 'kernel/health-monitor/index.js')));
});

await asyncTest('S2.B.1.2 HealthMonitor 模块可导入', async () => {
    const mod = await import('../kernel/health-monitor/index.js');
    assert.ok(mod.HealthMonitor, '应有 HealthMonitor');
    assert.ok(mod.HealthDimension, '应有 HealthDimension');
    assert.ok(mod.HealthStatus, '应有 HealthStatus');
});

await asyncTest('S2.B.1.3 HealthMonitor 初始化', async () => {
    const { HealthMonitor } = await import('../kernel/health-monitor/index.js');
    const hm = new HealthMonitor({});
    await hm.initialize();
    assert.ok(hm.weights, '应有权重配置');
    assert.equal(Object.keys(hm.weights).length, 10, '应有10个维度');
});

await asyncTest('S2.B.1.4 HealthDimension 枚举正确', async () => {
    const { HealthDimension } = await import('../kernel/health-monitor/index.js');
    assert.ok(HealthDimension.KERNEL, '应有 KERNEL');
    assert.ok(HealthDimension.MEMORY, '应有 MEMORY');
    assert.ok(HealthDimension.MCP, '应有 MCP');
    assert.ok(HealthDimension.WORKBUDDY, '应有 WORKBUDDY');
});

await asyncTest('S2.B.1.5 checkAll 返回正确结构', async () => {
    const { HealthMonitor } = await import('../kernel/health-monitor/index.js');
    const hm = new HealthMonitor({});
    const report = await hm.checkAll();
    assert.ok(report.timestamp, '应有 timestamp');
    assert.ok(report.overall, '应有 overall');
    assert.ok(report.dimensions, '应有 dimensions');
    assert.equal(Object.keys(report.dimensions).length, 10, '应有10个维度');
});

// review: removed // review: removed console.log('\n=== S2.B.2 CronTrigger 测试 ===\n');

await asyncTest('S2.B.2.1 cron-trigger.js 存在', async () => {
    assert.ok(fs.existsSync(path.join(HUNDUNOS_ROOT, 'kernel/aware-system/cron-trigger.js')));
});

await asyncTest('S2.B.2.2 CronTrigger 模块可导入', async () => {
    const mod = await import('../kernel/aware-system/cron-trigger.js');
    assert.ok(mod.CronTrigger, '应有 CronTrigger');
    assert.ok(mod.CronSchedule, '应有 CronSchedule');
    assert.ok(mod.CronTaskStatus, '应有 CronTaskStatus');
});

await asyncTest('S2.B.2.3 CronTrigger 初始化', async () => {
    const { CronTrigger } = await import('../kernel/aware-system/cron-trigger.js');
    const ct = new CronTrigger({});
    assert.ok(ct.tasks instanceof Map, '应有 tasks Map');
    assert.ok(ct.running === false, '初始状态应为停止');
});

await asyncTest('S2.B.2.4 register 注册任务', async () => {
    const { CronTrigger, CronSchedule } = await import('../kernel/aware-system/cron-trigger.js');
    const ct = new CronTrigger({});
    ct.register('test_task', '测试任务', CronSchedule.EVERY_MINUTE, async () => {});
    assert.equal(ct.tasks.size, 1, '应有1个任务');
    const task = ct.tasks.get('test_task');
    assert.equal(task.name, '测试任务', '任务名称正确');
});

await asyncTest('S2.B.2.5 enable/disable 任务', async () => {
    const { CronTrigger, CronSchedule } = await import('../kernel/aware-system/cron-trigger.js');
    const ct = new CronTrigger({});
    ct.register('test', 'test', '* * * * *', async () => {});
    assert.ok(ct.enable('test'), 'enable 应返回 true');
    ct.disable('test');
    const task = ct.tasks.get('test');
    assert.equal(task.enabled, false, '任务应被禁用');
});

await asyncTest('S2.B.2.6 getStats 返回统计', async () => {
    const { CronTrigger } = await import('../kernel/aware-system/cron-trigger.js');
    const ct = new CronTrigger({});
    const stats = ct.getStats();
    assert.ok(stats.total !== undefined, '应有 total');
    assert.ok(stats.enabled !== undefined, '应有 enabled');
});

// review: removed // review: removed console.log('\n=== S2.B.3 AutoRecovery 测试 ===\n');

await asyncTest('S2.B.3.1 recovery/index.js 存在', async () => {
    assert.ok(fs.existsSync(path.join(HUNDUNOS_ROOT, 'kernel/recovery/index.js')));
});

await asyncTest('S2.B.3.2 AutoRecovery 模块可导入', async () => {
    const mod = await import('../kernel/recovery/index.js');
    assert.ok(mod.AutoRecovery, '应有 AutoRecovery');
    assert.ok(mod.RecoveryAction, '应有 RecoveryAction');
    assert.ok(mod.RecoveryStatus, '应有 RecoveryStatus');
});

await asyncTest('S2.B.3.3 AutoRecovery 初始化', async () => {
    const { AutoRecovery, RecoveryStatus } = await import('../kernel/recovery/index.js');
    const ar = new AutoRecovery({});
    assert.ok(ar.policies.length > 0, '应有默认策略');
    assert.equal(ar.status, RecoveryStatus.IDLE, '初始状态应为 IDLE');
});

await asyncTest('S2.B.3.4 RecoveryAction 枚举正确', async () => {
    const { RecoveryAction } = await import('../kernel/recovery/index.js');
    assert.ok(RecoveryAction.RESTART, '应有 RESTART');
    assert.ok(RecoveryAction.ROLLBACK, '应有 ROLLBACK');
    assert.ok(RecoveryAction.ESCALATE, '应有 ESCALATE');
});

await asyncTest('S2.B.3.5 addPolicy 添加策略', async () => {
    const { AutoRecovery, RecoveryAction } = await import('../kernel/recovery/index.js');
    const ar = new AutoRecovery({});
    const before = ar.policies.length;
    ar.addPolicy({ module: 'test', action: RecoveryAction.IGNORE, maxRetries: 1 });
    assert.equal(ar.policies.length, before + 1, '策略数应+1');
});

await asyncTest('S2.B.3.6 getStats 返回统计', async () => {
    const { AutoRecovery } = await import('../kernel/recovery/index.js');
    const ar = new AutoRecovery({});
    const stats = ar.getStats();
    assert.ok(stats.detected !== undefined, '应有 detected');
    assert.ok(stats.recovered !== undefined, '应有 recovered');
});

// review: removed // review: removed console.log('\n========================================');
// review: removed // review: removed console.log('S2.B HealthMonitor/CronTrigger/AutoRecovery 测试结果');
// review: removed // review: removed console.log('========================================');
// review: removed // review: removed console.log(`总计: ${passed + failed} | 通过: ${passed} | 失败: ${failed}`);
// review: removed // review: removed console.log('========================================\n');

fs.writeFileSync(path.join(__dirname, 'S2.B_results.json'), JSON.stringify({ task: 'S2.B', timestamp: new Date().toISOString(), total: passed + failed, passed, failed, results }, null, 2));
process.exit(failed > 0 ? 1 : 0);
