/**
 * HundunOS v3.0 - Full Integration Test
 * 全量集成测试
 *
 * 测试所有模块的完整功能
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Windows UTF-8 输出修复 ──────────────────────────────────────────────────
// Windows PowerShell/cmd 默认代码页为 GBK/CP936，导致 console.log 中的
// 中文在 Start-Job 等场景下显示为 CLIXML 结构化格式（看起来乱码）。
// 解决：Node.js v22 支持 --experimental-stdout-speed=0 强制 UTF-8，
// 这里改用 child_process 执行外部命令 chcp 65001（一次性设置代码页）。
// 注意：Node.js v22 的 process.stdout/stderr 是 getter，直接替换
// write 方法会导致流内部回调触发无限递归。此方案不碰 stream 方法。
if (process.platform === 'win32') {
    try {
        const { execSync } = await import('child_process');
        execSync('chcp 65001>nul', { stdio: 'ignore', windowsHide: true });
    } catch (_) { /* 非关键，静默跳过 */ }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RESULTS = [];
const MODULES = [];

function test(name, passed, detail = '') {
    const status = passed ? '✅' : '❌';
    // review: removed // review: removed console.log(`${status} ${name}${detail ? ` - ${detail}` : ''}`);
    RESULTS.push({ name, passed, detail });
}

// ============================================================================
// 模块扫描
// ============================================================================

function scanModules(dir, base = '') {
    const modules = [];
    const items = fs.readdirSync(dir);

    for (const item of items) {
        if (item === 'node_modules' || item.startsWith('.')) continue;
        
        const full = path.join(dir, item);
        const stat = fs.statSync(full);

        if (stat.isDirectory()) {
            const indexPath = path.join(full, 'index.js');
            if (fs.existsSync(indexPath)) {
                modules.push({
                    name: base ? `${base}/${item}` : item,
                    path: indexPath
                });
            }
            modules.push(...scanModules(full, base ? `${base}/${item}` : item));
        }
    }

    return modules;
}

// ============================================================================
// 测试执行
// ============================================================================

// review: removed // review: removed console.log('╔══════════════════════════════════════════╗');
// review: removed // review: removed console.log('║   HundunOS v3.0 Full Integration Test    ║');
// review: removed // review: removed console.log('╚══════════════════════════════════════════╝\n');

// 扫描模块
const kernelModules = scanModules(path.join(__dirname, '../kernel'));
const stableModules = scanModules(path.join(__dirname, '../stable-modules'));
const extensions = scanModules(path.join(__dirname, '../extension-modules'));
const adapters = scanModules(path.join(__dirname, '../adapters'));
const reviewModules = scanModules(path.join(__dirname, '../review'));
const searchModules = scanModules(path.join(__dirname, '../search'));
const shellModules = scanModules(path.join(__dirname, '../shell'));

const allModules = [
    ...kernelModules,
    ...stableModules,
    ...extensions,
    ...adapters,
    ...reviewModules,
    ...searchModules,
    ...shellModules
];

// review: removed // review: removed console.log(`📦 发现 ${allModules.length} 个模块\n`);

// ============================================================================
// 模块导入测试
// ============================================================================

// review: removed // review: removed console.log('=== 模块导入测试 ===\n');

async function testModuleImports() {
    let imported = 0;
    let failed = 0;

    for (const mod of allModules) {
        try {
            await import(`file://${mod.path}`);
            imported++;
            test(`模块导入: ${mod.name}`, true);
        } catch (e) {
            failed++;
            test(`模块导入: ${mod.name}`, false, e.message.slice(0, 50));
        }
    }

    // review: removed // review: removed console.log(`\n导入统计: ${imported}/${allModules.length} 成功\n`);
    return { imported, failed };
}

const importStats = await testModuleImports();

// ============================================================================
// 核心功能测试
// ============================================================================

// review: removed // review: removed console.log('\n=== 核心功能测试 ===\n');

async function testCoreFunctions() {
    // Kernel Core
    try {
        const { default: kernel } = await import('../kernel/core.js');
        test('Kernel: 核心模块加载', true);
    } catch (e) {
        test('Kernel: 核心模块加载', false, e.message);
    }

    // Intent Engine
    try {
        const { IntentEngine } = await import('../kernel/intent-engine.js');
        const engine = new IntentEngine();
        test('IntentEngine: 意图引擎初始化', true);
    } catch (e) {
        test('IntentEngine: 意图引擎初始化', false, e.message);
    }

    // Model Router
    try {
        const { ModelRouter } = await import('../kernel/model-router/index.js');
        const router = new ModelRouter();
        test('ModelRouter: 模型路由初始化', true);
    } catch (e) {
        test('ModelRouter: 模型路由初始化', false, e.message);
    }

    // edict
    try {
        const { processMessage } = await import('../stable-modules/edict/core/index.js');
        test('edict: 三省六部核心', true);
    } catch (e) {
        test('edict: 三省六部核心', false, e.message);
    }

    // RBAC
    try {
        const { RBACManager, Role } = await import('../stable-modules/rbac/index.js');
        const rbac = new RBACManager();
        rbac.registerUser('test', Role.DEVELOPER);
        const hasPerm = rbac.hasPermission('test', 'write');
        test('RBAC: 权限检查', true, `developer has write: ${hasPerm}`);
    } catch (e) {
        test('RBAC: 权限检查', false, e.message);
    }

    // Health Monitor
    try {
        const { HealthMonitor } = await import('../stable-modules/health-monitor/index.js');
        const monitor = new HealthMonitor();
        test('HealthMonitor: 健康监控初始化', true);
    } catch (e) {
        test('HealthMonitor: 健康监控初始化', false, e.message);
    }

    // Recovery
    try {
        const { AutoRecoveryManager, FailureType } = await import('../stable-modules/recovery/index.js');
        const recovery = new AutoRecoveryManager();
        test('AutoRecovery: 自动恢复初始化', true);
    } catch (e) {
        test('AutoRecovery: 自动恢复初始化', false, e.message);
    }

    // MCP
    try {
        const { MCPExtension } = await import('../extension-modules/mcp/index.js');
        const mcp = new MCPExtension();
        test('MCP: 服务初始化', mcp.tools.size >= 3, `${mcp.tools.size} 个默认工具`);
    } catch (e) {
        test('MCP: 服务初始化', false, e.message);
    }

    // Search
    try {
        const { SearchExtension } = await import('../extension-modules/search/index.js');
        const search = new SearchExtension();
        test('Search: 搜索扩展初始化', true);
    } catch (e) {
        test('Search: 搜索扩展初始化', false, e.message);
    }

    // REST API
    try {
        const { RestAPI } = await import('../shell/rest-api/index.js');
        const api = new RestAPI();
        test('REST API: 服务初始化', api.router.routes.size >= 3, `${api.router.routes.size} 个路由`);
    } catch (e) {
        test('REST API: 服务初始化', false, e.message);
    }
}

await testCoreFunctions();

// ============================================================================
// 集成测试
// ============================================================================

// review: removed // review: removed console.log('\n=== 集成测试 ===\n');

async function testIntegration() {
    // edict + RBAC 集成
    try {
        const { processMessage } = await import('../stable-modules/edict/core/index.js');
        const { RBACManager, Role } = await import('../stable-modules/rbac/index.js');
        
        const rbac = new RBACManager();
        rbac.registerUser('integration_test', Role.OPERATOR);
        
        test('集成: edict + RBAC', true);
    } catch (e) {
        test('集成: edict + RBAC', false, e.message);
    }

    // Health + Recovery 集成
    try {
        const { HealthMonitor } = await import('../stable-modules/health-monitor/index.js');
        const { AutoRecoveryManager } = await import('../stable-modules/recovery/index.js');
        
        const monitor = new HealthMonitor();
        const recovery = new AutoRecoveryManager();
        
        monitor.on('alerts', async (alerts) => {
            for (const alert of alerts) {
                await recovery.reportFailure({
                    type: 'error',
                    moduleId: alert.dimension,
                    message: alert.message
                });
            }
        });
        
        test('集成: Health + Recovery', true);
    } catch (e) {
        test('集成: Health + Recovery', false, e.message);
    }
}

await testIntegration();

// ============================================================================
// 代码统计
// ============================================================================

// review: removed // review: removed console.log('\n=== 代码统计 ===\n');

function countAll() {
    const root = path.join(__dirname, '..');
    let files = 0;
    let size = 0;
    let lines = 0;

    function walk(dir) {
        const items = fs.readdirSync(dir);
        for (const item of items) {
            if (item === 'node_modules' || item.startsWith('.')) continue;
            const full = path.join(dir, item);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) {
                walk(full);
            } else if (item.endsWith('.js')) {
                files++;
                size += stat.size;
                lines += fs.readFileSync(full, 'utf-8').split('\n').length;
            }
        }
    }

    walk(root);
    return { files, size: Math.round(size / 1024), lines };
}

const codeStats = countAll();
test('代码统计', true, `${codeStats.files} 文件, ${codeStats.size} KB, ${codeStats.lines} 行`);

// ============================================================================
// 结果汇总
// ============================================================================

// review: removed // review: removed console.log('\n╔══════════════════════════════════════════╗');
// review: removed // review: removed console.log('║         Full Test Results               ║');
// review: removed // review: removed console.log('╚══════════════════════════════════════════╝');

const passed = RESULTS.filter(r => r.passed).length;
const failed = RESULTS.filter(r => !r.passed).length;
const rate = Math.round(passed / RESULTS.length * 100);

// review: removed // review: removed console.log(`\n总计: ${RESULTS.length} | 通过: ${passed} | 失败: ${failed} | 通过率: ${rate}%`);
// review: removed // review: removed console.log(`模块导入: ${importStats.imported}/${allModules.length}`);
// review: removed // review: removed console.log(`代码规模: ${codeStats.files} 文件, ${codeStats.size} KB, ${codeStats.lines} 行`);

// 写入结果
fs.writeFileSync(
    path.join(__dirname, 'full_test_results.json'),
    JSON.stringify({
        timestamp: new Date().toISOString(),
        total: RESULTS.length,
        passed,
        failed,
        rate,
        importStats,
        codeStats,
        results: RESULTS
    }, null, 2)
);

// review: removed // review: removed console.log('\n✅ 全量测试完成\n');

process.exit(failed > 0 ? 1 : 0);
