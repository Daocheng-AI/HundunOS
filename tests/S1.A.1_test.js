/**
 * HundunOS v3.0 - S1.A.1 edict 迁移验收测试
 */

import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EDICT_ROOT = path.join(__dirname, '../stable-modules/edict');

let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
    const start = Date.now();
    try {
        fn();
        passed++;
        results.push({ name, status: 'PASS', elapsed: Date.now() - start });
        // review: removed // review: removed console.log(`✅ ${name}`);
    } catch (e) {
        failed++;
        results.push({ name, status: 'FAIL', error: e.message, elapsed: Date.now() - start });
        // review: removed // review: removed console.log(`❌ ${name}: ${e.message}`);
    }
}

async function asyncTest(name, fn) {
    const start = Date.now();
    try {
        await fn();
        passed++;
        results.push({ name, status: 'PASS', elapsed: Date.now() - start });
        // review: removed // review: removed console.log(`✅ ${name}`);
    } catch (e) {
        failed++;
        results.push({ name, status: 'FAIL', error: e.message, elapsed: Date.now() - start });
        // review: removed // review: removed console.log(`❌ ${name}: ${e.message}`);
    }
}

// ========================================
// 文件结构测试
// ========================================
// review: removed // review: removed console.log('\n=== 文件结构测试 ===\n');

test('S1.A.1.1 edict目录存在', () => {
    assert.ok(fs.existsSync(EDICT_ROOT), 'edict目录应存在');
});

test('S1.A.1.2 core/index.js存在', () => {
    const corePath = path.join(EDICT_ROOT, 'core/index.js');
    assert.ok(fs.existsSync(corePath), 'core/index.js应存在');
});

test('S1.A.1.3 router.js存在', () => {
    const routerPath = path.join(EDICT_ROOT, 'router.js');
    assert.ok(fs.existsSync(routerPath), 'router.js应存在');
});

test('S1.A.1.4 config目录存在', () => {
    const configPath = path.join(EDICT_ROOT, 'config');
    assert.ok(fs.existsSync(configPath), 'config目录应存在');
});

test('S1.A.1.5 edict_config.json存在', () => {
    const configPath = path.join(EDICT_ROOT, 'config/edict_config.json');
    assert.ok(fs.existsSync(configPath), 'edict_config.json应存在');
});

test('S1.A.1.6 whitelist.json存在', () => {
    const whitelistPath = path.join(EDICT_ROOT, 'config/whitelist.json');
    assert.ok(fs.existsSync(whitelistPath), 'whitelist.json应存在');
});

// ========================================
// 配置内容测试
// ========================================
// review: removed // review: removed console.log('\n=== 配置内容测试 ===\n');

test('S1.A.1.7 edict_config包含必要字段', () => {
    const configPath = path.join(EDICT_ROOT, 'config/edict_config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    assert.ok(config.stages, '应有stages字段');
    assert.ok(config.ministeries, '应有ministeries字段');
    assert.ok(config.stages.taizi, '应有taizi阶段');
    assert.ok(config.ministeries.bingbu, '应有bingbu部门');
});

test('S1.A.1.8 whitelist格式正确', () => {
    const whitelistPath = path.join(EDICT_ROOT, 'config/whitelist.json');
    const whitelist = JSON.parse(fs.readFileSync(whitelistPath, 'utf-8'));
    assert.ok(Array.isArray(whitelist.items), 'items应为数组');
    assert.ok(whitelist.items.length > 0, '应至少有一条规则');
});

// ========================================
// 代码量测试
// ========================================
// review: removed // review: removed console.log('\n=== 代码量测试 ===\n');

test('S1.A.1.9 core/index.js文件大小', () => {
    const corePath = path.join(EDICT_ROOT, 'core/index.js');
    const stats = fs.statSync(corePath);
    assert.ok(stats.size > 5000, 'core/index.js应 > 5KB');
});

test('S1.A.1.10 router.js文件大小', () => {
    const routerPath = path.join(EDICT_ROOT, 'router.js');
    const stats = fs.statSync(routerPath);
    assert.ok(stats.size > 3000, 'router.js应 > 3KB');
});

// ========================================
// 模块加载测试
// ========================================
// review: removed // review: removed console.log('\n=== 模块加载测试 ===\n');

await asyncTest('S1.A.1.11 core模块可导入', async () => {
    const core = await import('../stable-modules/edict/core/index.js');
    assert.ok(core.default || core.createEdict, 'core应可导入');
});

await asyncTest('S1.A.1.12 router模块可导入', async () => {
    const router = await import('../stable-modules/edict/router.js');
    assert.ok(router.default || router.shouldUseEdict, 'router应可导入');
});

// ========================================
// 功能测试
// ========================================
// review: removed // review: removed console.log('\n=== 功能测试 ===\n');

await asyncTest('S1.A.1.13 shouldUseEdict正常工作', async () => {
    const { shouldUseEdict } = await import('../stable-modules/edict/router.js');
    const result = shouldUseEdict('帮我写一个Python脚本');
    assert.ok(result.use !== undefined, '应返回use字段');
});

await asyncTest('S1.A.1.14 shouldUseTaskHub正常工作', async () => {
    const { shouldUseTaskHub } = await import('../stable-modules/edict/router.js');
    const result = shouldUseTaskHub('帮我规划一个完整的项目，分三步执行');
    assert.ok(result.use !== undefined, '应返回use字段');
    assert.ok(result.stages !== undefined, '应返回stages字段');
});

await asyncTest('S1.A.1.15 createEdict正常工作', async () => {
    const { createEdict } = await import('../stable-modules/edict/core/index.js');
    const edict = createEdict('test_user', '测试消息');
    assert.ok(edict.id, '应生成id');
    assert.ok(edict.userId === 'test_user', 'userId应正确');
});

// ========================================
// 输出结果
// ========================================
// review: removed // review: removed console.log('\n========================================');
// review: removed // review: removed console.log('S1.A.1 edict 迁移验收测试结果');
// review: removed // review: removed console.log('========================================');
// review: removed // review: removed console.log(`总计: ${passed + failed} | 通过: ${passed} | 失败: ${failed}`);
// review: removed // review: removed console.log('========================================\n');

// 保存结果
const report = {
    task: 'S1.A.1',
    timestamp: new Date().toISOString(),
    total: passed + failed,
    passed,
    failed,
    results
};

fs.writeFileSync(
    path.join(__dirname, 'S1.A.1_results.json'),
    JSON.stringify(report, null, 2)
);

process.exit(failed > 0 ? 1 : 0);
