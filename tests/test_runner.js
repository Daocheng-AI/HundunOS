// hundunos/tests/test_runner.js — HundunOS 测试运行器
// 运行所有核心模块测试

// ── Windows UTF-8 输出修复 ──────────────────────────────────────────────────
// chcp 65001 设置 Windows 代码页为 UTF-8（解决 PowerShell CLIXML 乱码问题）
if (process.platform === 'win32') {
    try {
        const { execSync } = await import('child_process');
        execSync('chcp 65001>nul', { stdio: 'ignore', windowsHide: true });
    } catch (_) { /* 非关键，静默跳过 */ }
}

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const results = { total: 0, passed: 0, failed: 0, tests: [] };

// 导出 assert 函数供测试文件使用
export function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

// 跨平台路径转换
function toFileUrl(p) {
    return new URL('file:///' + p.replace(/\\/g, '/')).href;
}

async function runTestFile(file) {
    if (!file.endsWith('_test.js')) return;
    // review: removed // review: removed console.log(`\n=== Running: ${file} ===`);
    
    // 使用 pathToFileURL 确保跨平台兼容
    const filePath = join(__dirname, file);
    const testModule = await import(toFileUrl(filePath)).catch(e => {
        // review: removed // review: removed console.log(`  [ERROR] Cannot import: ${e.message}`);
        return null;
    });
    
    if (!testModule) return;
    
    const testNames = Object.keys(testModule).filter(k => k.startsWith('test_'));
    
    for (const name of testNames) {
        results.total++;
        const testFn = testModule[name];
        const start = Date.now();
        
        try {
            if (testFn.constructor.name === 'AsyncFunction') {
                await testFn();
            } else {
                testFn();
            }
            const elapsed = Date.now() - start;
            results.passed++;
            results.tests.push({ name, status: 'PASS', elapsed });
            // review: removed // review: removed console.log(`  [PASS] ${name} (${elapsed}ms)`);
        } catch (e) {
            const elapsed = Date.now() - start;
            results.failed++;
            results.tests.push({ name, status: 'FAIL', error: e.message, elapsed });
            // review: removed // review: removed console.log(`  [FAIL] ${name} (${elapsed}ms): ${e.message}`);
        }
    }
}

async function main() {
    // review: removed // review: removed console.log('╔══════════════════════════════════════════╗');
    // review: removed // review: removed console.log('║   HundunOS v3.0 Test Suite            ║');
    // review: removed // review: removed console.log('╚══════════════════════════════════════════╝');
    // review: removed // review: removed console.log(`Time: ${new Date().toISOString()}`);
    
    const testFiles = readdirSync(__dirname).filter(f => f.endsWith('_test.js'));
    
    for (const file of testFiles) {
        await runTestFile(file);
    }
    
    // review: removed // review: removed console.log('\n╔══════════════════════════════════════════╗');
    // review: removed // review: removed console.log('║   Test Results                          ║');
    // review: removed // review: removed console.log('╚══════════════════════════════════════════╝');
    // review: removed // review: removed console.log(`Total:  ${results.total}`);
    // review: removed // review: removed console.log(`Passed: ${results.passed} ✓`);
    // review: removed // review: removed console.log(`Failed: ${results.failed} ✗`);
    
    // Write results.json
    const { writeFileSync } = await import('fs');
    writeFileSync(
        join(__dirname, 'results.json'),
        JSON.stringify(results, null, 2)
    );
    // review: removed // review: removed console.log(`\nResults written to: results.json`);
    
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(e => {
    console.error('Runner error:', e.message);
    process.exit(1);
});
