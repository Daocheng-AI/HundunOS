/**
 * HundunOS v3.0 - S1.B.3-5 ModelRouter 扩展模块验收测试
 */

import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROUTER_ROOT = path.join(__dirname, '../kernel/model-router');

let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
    const start = Date.now();
    try {
        fn();
        passed++;
        results.push({ name, status: 'PASS', elapsed: Date.now() - start });
        console.log(`✅ ${name}`);
    } catch (e) {
        failed++;
        results.push({ name, status: 'FAIL', error: e.message, elapsed: Date.now() - start });
        console.log(`❌ ${name}: ${e.message}`);
    }
}

async function asyncTest(name, fn) {
    const start = Date.now();
    try {
        await fn();
        passed++;
        results.push({ name, status: 'PASS', elapsed: Date.now() - start });
        console.log(`✅ ${name}`);
    } catch (e) {
        failed++;
        results.push({ name, status: 'FAIL', error: e.message, elapsed: Date.now() - start });
        console.log(`❌ ${name}: ${e.message}`);
    }
}

// ========================================
// 文件结构测试
// ========================================
console.log('\n=== 文件结构测试 ===\n');

test('S1.B.3.1 strategies/index.js 存在', () => {
    const p = path.join(ROUTER_ROOT, 'strategies/index.js');
    assert.ok(fs.existsSync(p), 'strategies/index.js 应存在');
});

test('S1.B.4.1 usage-stats.js 存在', () => {
    const p = path.join(ROUTER_ROOT, 'usage-stats.js');
    assert.ok(fs.existsSync(p), 'usage-stats.js 应存在');
});

test('S1.B.5.1 circuit-breaker.js 存在', () => {
    const p = path.join(ROUTER_ROOT, 'circuit-breaker.js');
    assert.ok(fs.existsSync(p), 'circuit-breaker.js 应存在');
});

test('S1.B.3.2 main.js 统一导出存在', () => {
    const p = path.join(ROUTER_ROOT, 'main.js');
    assert.ok(fs.existsSync(p), 'main.js 应存在');
});

// ========================================
// 代码量测试
// ========================================
console.log('\n=== 代码量测试 ===\n');

test('S1.B.3.3 strategies 文件大小', () => {
    const p = path.join(ROUTER_ROOT, 'strategies/index.js');
    const stats = fs.statSync(p);
    assert.ok(stats.size > 3000, 'strategies/index.js 应 > 3KB');
});

test('S1.B.4.2 usage-stats 文件大小', () => {
    const p = path.join(ROUTER_ROOT, 'usage-stats.js');
    const stats = fs.statSync(p);
    assert.ok(stats.size > 3000, 'usage-stats.js 应 > 3KB');
});

test('S1.B.5.2 circuit-breaker 文件大小', () => {
    const p = path.join(ROUTER_ROOT, 'circuit-breaker.js');
    const stats = fs.statSync(p);
    assert.ok(stats.size > 3000, 'circuit-breaker.js 应 > 3KB');
});

// ========================================
// 模块加载测试
// ========================================
console.log('\n=== 模块加载测试 ===\n');

await asyncTest('S1.B.3.4 strategies 模块可导入', async () => {
    const mod = await import('../kernel/model-router/strategies/index.js');
    assert.ok(mod.StrategyType, '应有 StrategyType');
    assert.ok(mod.createStrategy, '应有 createStrategy');
});

await asyncTest('S1.B.4.3 usage-stats 模块可导入', async () => {
    const mod = await import('../kernel/model-router/usage-stats.js');
    assert.ok(mod.UsageStats || mod.getUsageStats, '应有 UsageStats 或 getUsageStats');
});

await asyncTest('S1.B.5.3 circuit-breaker 模块可导入', async () => {
    const mod = await import('../kernel/model-router/circuit-breaker.js');
    assert.ok(mod.CircuitBreaker || mod.CircuitState, '应有 CircuitBreaker 或 CircuitState');
});

// ========================================
// 功能测试
// ========================================
console.log('\n=== 功能测试 ===\n');

await asyncTest('S1.B.3.5 createStrategy 正常工作', async () => {
    const { createStrategy, StrategyType } = await import('../kernel/model-router/strategies/index.js');
    
    const costFirst = createStrategy(StrategyType.COST_FIRST);
    assert.ok(costFirst, 'COST_FIRST 策略应创建成功');
    
    const balanced = createStrategy(StrategyType.BALANCED);
    assert.ok(balanced, 'BALANCED 策略应创建成功');
});

await asyncTest('S1.B.3.6 策略选择正常', async () => {
    const { createStrategy, StrategyType, TaskComplexity } = await import('../kernel/model-router/strategies/index.js');
    
    const strategy = createStrategy(StrategyType.COST_FIRST);
    const candidates = [
        { id: 'cloud', type: 'CLOUD', costPer1M: 3.0 },
        { id: 'local', type: 'LOCAL', costPer1M: 0 }
    ];
    
    const selected = strategy.select(candidates, { complexity: TaskComplexity.SIMPLE });
    assert.ok(selected, '应选择一个 provider');
    assert.ok(selected.id === 'local', 'COST_FIRST 应选择本地');
});

await asyncTest('S1.B.3.7 任务复杂度评估', async () => {
    const { assessComplexity, TaskComplexity } = await import('../kernel/model-router/strategies/index.js');
    
    const simple = assessComplexity('帮我总结这段文字');
    assert.ok(simple === TaskComplexity.SIMPLE, '简单任务应识别为 SIMPLE');
    
    const complex = assessComplexity('帮我设计一个完整的系统架构方案');
    assert.ok(complex === TaskComplexity.COMPLEX, '复杂任务应识别为 COMPLEX');
});

await asyncTest('S1.B.4.4 UsageStats 记录正常', async () => {
    const { UsageStats } = await import('../kernel/model-router/usage-stats.js');
    
    const stats = new UsageStats();
    stats.record('test_provider', { usage: { total: 100 }, costPer1M: 1.0 }, 'test');
    
    const summary = stats.getSummary();
    assert.ok(summary.totalTokens === 100, '应记录 token 数');
});

await asyncTest('S1.B.5.4 CircuitBreaker 状态正常', async () => {
    const { CircuitBreaker, CircuitState } = await import('../kernel/model-router/circuit-breaker.js');
    
    const breaker = new CircuitBreaker({ failureThreshold: 2 });
    assert.ok(breaker.canCall(), '初始状态应允许调用');
    assert.ok(breaker.state === CircuitState.CLOSED, '初始状态应为 CLOSED');
    
    // 连续失败触发熔断
    breaker.recordFailure();
    breaker.recordFailure();
    assert.ok(!breaker.canCall(), '达到阈值后应拒绝调用');
    assert.ok(breaker.state === CircuitState.OPEN, '状态应为 OPEN');
});

await asyncTest('S1.B.5.5 CircuitBreaker 恢复正常', async () => {
    const { CircuitBreaker, CircuitState } = await import('../kernel/model-router/circuit-breaker.js');
    
    const breaker = new CircuitBreaker({ 
        failureThreshold: 1,
        successThreshold: 1,
        timeout: 100  // 100ms 超时
    });
    
    breaker.recordFailure();
    assert.ok(breaker.state === CircuitState.OPEN);
    
    // 等待超时
    await new Promise(r => setTimeout(r, 150));
    assert.ok(breaker.canCall(), '超时后应允许调用');
    
    breaker.recordSuccess();
    assert.ok(breaker.state === CircuitState.CLOSED, '成功后应恢复 CLOSED');
});

// ========================================
// 输出结果
// ========================================
console.log('\n========================================');
console.log('S1.B.3-5 ModelRouter 扩展验收测试结果');
console.log('========================================');
console.log(`总计: ${passed + failed} | 通过: ${passed} | 失败: ${failed}`);
console.log('========================================\n');

// 保存结果
const report = {
    task: 'S1.B.3-5',
    timestamp: new Date().toISOString(),
    total: passed + failed,
    passed,
    failed,
    results
};

fs.writeFileSync(
    path.join(__dirname, 'S1.B_results.json'),
    JSON.stringify(report, null, 2)
);

process.exit(failed > 0 ? 1 : 0);
