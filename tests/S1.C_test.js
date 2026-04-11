/**
 * HundunOS v3.0 - S1.C.2 & S1.C.4 记忆系统验收测试
 */

import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

test('S1.C.2.1 recoverable-memory/index.js 存在', () => {
    const p = path.join(__dirname, '../stable-modules/recoverable-memory/index.js');
    assert.ok(fs.existsSync(p), 'recoverable-memory/index.js 应存在');
});

test('S1.C.4.1 self-adaptation.js 存在', () => {
    const p = path.join(__dirname, '../kernel/self-adaptation.js');
    assert.ok(fs.existsSync(p), 'self-adaptation.js 应存在');
});

// ========================================
// 代码量测试
// ========================================
console.log('\n=== 代码量测试 ===\n');

test('S1.C.2.2 recoverable-memory 文件大小', () => {
    const p = path.join(__dirname, '../stable-modules/recoverable-memory/index.js');
    const stats = fs.statSync(p);
    assert.ok(stats.size > 10000, 'recoverable-memory 应 > 10KB');
});

test('S1.C.4.2 self-adaptation 文件大小', () => {
    const p = path.join(__dirname, '../kernel/self-adaptation.js');
    const stats = fs.statSync(p);
    assert.ok(stats.size > 7000, 'self-adaptation 应 > 7KB');
});

// ========================================
// 模块加载测试
// ========================================
console.log('\n=== 模块加载测试 ===\n');

await asyncTest('S1.C.2.3 RecoverableMemory 模块可导入', async () => {
    const mod = await import('../stable-modules/recoverable-memory/index.js');
    assert.ok(mod.RecoverableMemory, '应有 RecoverableMemory 类');
    assert.ok(mod.SnapshotType, '应有 SnapshotType');
    assert.ok(mod.RecoveryMode, '应有 RecoveryMode');
});

await asyncTest('S1.C.4.3 SelfAdaptation 模块可导入', async () => {
    const mod = await import('../kernel/self-adaptation.js');
    assert.ok(mod.SelfAdaptation, '应有 SelfAdaptation 类');
    assert.ok(mod.BehaviorPattern, '应有 BehaviorPattern');
});

// ========================================
// 功能测试 - RecoverableMemory
// ========================================
console.log('\n=== RecoverableMemory 功能测试 ===\n');

await asyncTest('S1.C.2.4 RecoverableMemory 初始化', async () => {
    const { RecoverableMemory } = await import('../stable-modules/recoverable-memory/index.js');
    
    const mockKernel = {
        moduleRegistry: { modules: new Map() },
        state: { sessions: new Map() },
        aware: { focusItems: new Map(), triggers: new Map() },
        storage: {
            put: async () => {},
            get: async () => null,
            keys: async () => []
        }
    };
    
    const rm = new RecoverableMemory(mockKernel);
    assert.ok(rm.snapshots, '应有 snapshots');
    assert.ok(rm.config, '应有 config');
});

await asyncTest('S1.C.2.5 SnapshotType 枚举正确', async () => {
    const { SnapshotType } = await import('../stable-modules/recoverable-memory/index.js');
    
    assert.ok(SnapshotType.FULL, '应有 FULL 类型');
    assert.ok(SnapshotType.INCREMENTAL, '应有 INCREMENTAL 类型');
    assert.ok(SnapshotType.CHECKPOINT, '应有 CHECKPOINT 类型');
});

await asyncTest('S1.C.2.6 RecoveryMode 枚举正确', async () => {
    const { RecoveryMode } = await import('../stable-modules/recoverable-memory/index.js');
    
    assert.ok(RecoveryMode.FULL, '应有 FULL 模式');
    assert.ok(RecoveryMode.PARTIAL, '应有 PARTIAL 模式');
    assert.ok(RecoveryMode.ROLLBACK, '应有 ROLLBACK 模式');
});

await asyncTest('S1.C.2.7 _computeChecksum 正常工作', async () => {
    const { RecoverableMemory } = await import('../stable-modules/recoverable-memory/index.js');
    
    const rm = new RecoverableMemory({});
    const checksum = rm._computeChecksum({ test: 'data' });
    
    assert.ok(checksum, '应返回校验和');
    assert.ok(checksum.length === 16, '校验和应为16字符');
});

await asyncTest('S1.C.2.8 getStats 返回统计信息', async () => {
    const { RecoverableMemory } = await import('../stable-modules/recoverable-memory/index.js');
    
    const rm = new RecoverableMemory({});
    const stats = rm.getStats();
    
    assert.ok(stats.total !== undefined, '应有 total');
    assert.ok(stats.byType !== undefined, '应有 byType');
});

// ========================================
// 功能测试 - SelfAdaptation
// ========================================
console.log('\n=== SelfAdaptation 功能测试 ===\n');

await asyncTest('S1.C.4.4 BehaviorPattern 枚举正确', async () => {
    const { BehaviorPattern } = await import('../kernel/self-adaptation.js');
    
    assert.ok(BehaviorPattern.HEAVY_CODING, '应有 HEAVY_CODING');
    assert.ok(BehaviorPattern.LIGHT_USAGE, '应有 LIGHT_USAGE');
    assert.ok(BehaviorPattern.BURST_ACTIVITY, '应有 BURST_ACTIVITY');
});

await asyncTest('S1.C.4.5 SelfAdaptation 初始化', async () => {
    const { SelfAdaptation } = await import('../kernel/self-adaptation.js');
    
    const mockKernel = {};
    const sa = new SelfAdaptation(mockKernel);
    
    assert.ok(sa.observationBuffer, '应有 observationBuffer');
    assert.ok(sa.currentPattern, '应有 currentPattern');
});

await asyncTest('S1.C.4.6 recordTask 正常工作', async () => {
    const { SelfAdaptation, BehaviorPattern } = await import('../kernel/self-adaptation.js');
    
    const sa = new SelfAdaptation({});
    sa.recordTask({ type: 'coding', duration: 1000, success: true });
    
    assert.ok(sa.observationBuffer.length === 1, '应记录1个任务');
});

await asyncTest('S1.C.4.7 detectPattern 返回模式', async () => {
    const { SelfAdaptation } = await import('../kernel/self-adaptation.js');
    
    const sa = new SelfAdaptation({ minSamples: 1 });
    
    // 添加足够任务
    for (let i = 0; i < 20; i++) {
        sa.recordTask({ type: 'coding', duration: 1000, success: true });
    }
    
    const pattern = sa.detectPattern();
    assert.ok(pattern, '应返回模式');
});

await asyncTest('S1.C.4.8 getStats 返回统计信息', async () => {
    const { SelfAdaptation } = await import('../kernel/self-adaptation.js');
    
    const sa = new SelfAdaptation({});
    const stats = sa.getStats();
    
    assert.ok(stats.currentPattern, '应有 currentPattern');
    assert.ok(stats.currentRules, '应有 currentRules');
    assert.ok(stats.observationCount !== undefined, '应有 observationCount');
});

// ========================================
// 输出结果
// ========================================
console.log('\n========================================');
console.log('S1.C.2 & S1.C.4 记忆系统验收测试结果');
console.log('========================================');
console.log(`总计: ${passed + failed} | 通过: ${passed} | 失败: ${failed}`);
console.log('========================================\n');

// 保存结果
const report = {
    task: 'S1.C.2-4',
    timestamp: new Date().toISOString(),
    total: passed + failed,
    passed,
    failed,
    results
};

fs.writeFileSync(
    path.join(__dirname, 'S1.C_results.json'),
    JSON.stringify(report, null, 2)
);

process.exit(failed > 0 ? 1 : 0);
