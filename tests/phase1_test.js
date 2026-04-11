/**
 * HundunOS v3.0 Phase 1 验收测试
 * 测试范围: 三省六部 + ModelRouter + 记忆系统
 */

import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 测试计数
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

// ========================================
// S1.B ModelRouter 验收
// ========================================
console.log('\n=== S1.B ModelRouter 验收 ===\n');

test('S1.B.1 ModelRouter 框架文件存在', () => {
    const routerPath = path.join(__dirname, '../kernel/model-router/index.js');
    assert.ok(fs.existsSync(routerPath), 'ModelRouter 文件应存在');
});

test('S1.B.2 Ollama Provider 文件存在', () => {
    const ollamaPath = path.join(__dirname, '../kernel/model-router/providers/ollama.js');
    assert.ok(fs.existsSync(ollamaPath), 'ollama.js 应存在');
});

test('S1.B.2 Anthropic Provider 文件存在', () => {
    const anthropicPath = path.join(__dirname, '../kernel/model-router/providers/anthropic.js');
    assert.ok(fs.existsSync(anthropicPath), 'anthropic.js 应存在');
});

test('S1.B.2 OpenAI Provider 文件存在', () => {
    const openaiPath = path.join(__dirname, '../kernel/model-router/providers/openai.js');
    assert.ok(fs.existsSync(openaiPath), 'openai.js 应存在');
});

// ========================================
// S1.C 记忆系统验收
// ========================================
console.log('\n=== S1.C 记忆系统验收 ===\n');

test('S1.C.1 MemoryGraph 文件存在', () => {
    const mgPath = path.join(__dirname, '../kernel/memory-graph.js');
    assert.ok(fs.existsSync(mgPath), 'memory-graph.js 应存在');
});

test('S1.C.1 MemoryGraph 文件大小', () => {
    const mgPath = path.join(__dirname, '../kernel/memory-graph.js');
    const stats = fs.statSync(mgPath);
    assert.ok(stats.size > 5000, 'memory-graph.js 应 > 5KB');
});

test('S1.C.3 AwareSystem 文件存在', () => {
    const awarePath = path.join(__dirname, '../kernel/aware-system.js');
    assert.ok(fs.existsSync(awarePath), 'aware-system.js 应存在');
});

// ========================================
// S2.A 安全模块验收
// ========================================
console.log('\n=== S2.A 安全模块验收 ===\n');

test('S2.A.1 PermissionGating 文件存在', () => {
    const pgPath = path.join(__dirname, '../stable-modules/permission-gating/index.js');
    assert.ok(fs.existsSync(pgPath), 'permission-gating 应存在');
});

test('S2.A.2 CoworkMonitor 文件存在', () => {
    const cmPath = path.join(__dirname, '../stable-modules/cowork-monitor/index.js');
    assert.ok(fs.existsSync(cmPath), 'cowork-monitor 应存在');
});

test('S2.A.3 AuditLogger 文件存在', () => {
    const alPath = path.join(__dirname, '../stable-modules/audit-logger/index.js');
    assert.ok(fs.existsSync(alPath), 'audit-logger 应存在');
});

test('S2.A.4 PrivacyShield 文件存在', () => {
    const psPath = path.join(__dirname, '../stable-modules/privacy-shield/index.js');
    assert.ok(fs.existsSync(psPath), 'privacy-shield 应存在');
});

// ========================================
// 配置验收
// ========================================
console.log('\n=== 配置验收 ===\n');

test('Config system.json 存在', () => {
    const configPath = path.join(__dirname, '../config/system.json');
    assert.ok(fs.existsSync(configPath), 'config/system.json 应存在');
});

test('Config 包含必要字段', () => {
    const configPath = path.join(__dirname, '../config/system.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    assert.ok(config.version, '应有 version 字段');
    assert.ok(config.kernel, '应有 kernel 字段');
    assert.ok(config.modules, '应有 modules 字段');
});

// ========================================
// 输出结果
// ========================================
console.log('\n========================================');
console.log('Phase 1 验收测试结果');
console.log('========================================');
console.log(`总计: ${passed + failed} | 通过: ${passed} | 失败: ${failed}`);
console.log('========================================\n');

// 保存结果
const report = {
    phase: '1',
    timestamp: new Date().toISOString(),
    total: passed + failed,
    passed,
    failed,
    results
};

fs.writeFileSync(
    path.join(__dirname, 'phase1_results.json'),
    JSON.stringify(report, null, 2)
);

process.exit(failed > 0 ? 1 : 0);
