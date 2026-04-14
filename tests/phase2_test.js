/**
 * HundunOS v3.0 - Phase 2 测试
 * 阶段2验收测试: RBAC + HealthMonitor + Cron + Recovery
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RESULTS = [];

function test(name, passed, detail = '') {
    const status = passed ? '✅' : '❌';
    // console.log(`${status} ${name}${detail ? ` - ${detail}` : ''}`);
    RESULTS.push({ name, passed, detail });
}

// ============================================================================
// S2.A 安全模块验收
// ============================================================================

// console.log('\n=== S2.A 安全模块验收 ===\n');

// S2.A.1-S2.A.4 已在阶段1验收，这里只验证 S2.A.5

const rbacPath = path.join(__dirname, '../stable-modules/rbac/index.js');
test('S2.A.5 RBAC 文件存在', fs.existsSync(rbacPath));

if (fs.existsSync(rbacPath)) {
    const stat = fs.statSync(rbacPath);
    test('S2.A.5 RBAC 文件大小合理', stat.size > 5000, `${Math.round(stat.size/1024)}KB`);
}

// ============================================================================
// S2.B 健康监控验收
// ============================================================================

// console.log('\n=== S2.B 健康监控验收 ===\n');

const healthMonitorPath = path.join(__dirname, '../stable-modules/health-monitor/index.js');
test('S2.B.1 HealthMonitor 文件存在', fs.existsSync(healthMonitorPath));

if (fs.existsSync(healthMonitorPath)) {
    const stat = fs.statSync(healthMonitorPath);
    test('S2.B.1 HealthMonitor 文件大小合理', stat.size > 8000, `${Math.round(stat.size/1024)}KB`);
}

const cronPath = path.join(__dirname, '../kernel/aware-system/cron.js');
test('S2.B.2 Cron Trigger 文件存在', fs.existsSync(cronPath));

if (fs.existsSync(cronPath)) {
    const stat = fs.statSync(cronPath);
    test('S2.B.2 Cron Trigger 文件大小合理', stat.size > 5000, `${Math.round(stat.size/1024)}KB`);
}

const recoveryPath = path.join(__dirname, '../stable-modules/recovery/index.js');
test('S2.B.3 Auto Recovery 文件存在', fs.existsSync(recoveryPath));

if (fs.existsSync(recoveryPath)) {
    const stat = fs.statSync(recoveryPath);
    test('S2.B.3 Auto Recovery 文件大小合理', stat.size > 8000, `${Math.round(stat.size/1024)}KB`);
}

// ============================================================================
// 模块导入验证
// ============================================================================

// console.log('\n=== 模块导入验证 ===\n');

async function testImports() {
    try {
        const { RBACManager, Role } = await import('../stable-modules/rbac/index.js');
        test('S2.D.1 RBAC 模块可导入', true);
        
        // 验证角色定义
        test('S2.D.1 RBAC 角色定义完整', Object.keys(Role).length >= 6, `${Object.keys(Role).length} 角色`);
        
        // 创建实例测试
        const rbac = new RBACManager();
        test('S2.D.1 RBAC 实例化成功', true);
        
        // 注册用户测试
        rbac.registerUser('test_user', Role.DEVELOPER);
        test('S2.D.1 RBAC 用户注册成功', rbac.getUserRole('test_user') === Role.DEVELOPER);
    } catch (e) {
        test('S2.D.1 RBAC 模块可导入', false, e.message);
    }

    try {
        const { HealthMonitor, HealthDimension } = await import('../stable-modules/health-monitor/index.js');
        test('S2.D.2 HealthMonitor 模块可导入', true);
        
        test('S2.D.2 HealthDimension 定义完整', Object.keys(HealthDimension).length >= 10, `${Object.keys(HealthDimension).length} 维度`);
        
        const monitor = new HealthMonitor();
        test('S2.D.2 HealthMonitor 实例化成功', true);
    } catch (e) {
        test('S2.D.2 HealthMonitor 模块可导入', false, e.message);
    }

    try {
        const { CronScheduler, CronExpression } = await import('../kernel/aware-system/cron.js');
        test('S2.D.3 Cron 模块可导入', true);
        
        const expr = new CronExpression('0 * * * *');
        test('S2.D.3 CronExpression 解析成功', true);
        
        const scheduler = new CronScheduler();
        test('S2.D.3 CronScheduler 实例化成功', true);
    } catch (e) {
        test('S2.D.3 Cron 模块可导入', false, e.message);
    }

    try {
        const { AutoRecoveryManager, FailureType } = await import('../stable-modules/recovery/index.js');
        test('S2.D.4 Recovery 模块可导入', true);
        
        test('S2.D.4 FailureType 定义完整', Object.keys(FailureType).length >= 5, `${Object.keys(FailureType).length} 类型`);
        
        const recovery = new AutoRecoveryManager();
        test('S2.D.4 AutoRecoveryManager 实例化成功', true);
    } catch (e) {
        test('S2.D.4 Recovery 模块可导入', false, e.message);
    }
}

await testImports();

// ============================================================================
// 代码量统计
// ============================================================================

// console.log('\n=== 代码量统计 ===\n');

function countCode(dir, ext = '.js') {
    let count = 0;
    let size = 0;

    function walk(d) {
        if (!fs.existsSync(d)) return;
        const items = fs.readdirSync(d);
        for (const item of items) {
            const full = path.join(d, item);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) {
                walk(full);
            } else if (item.endsWith(ext)) {
                count++;
                size += stat.size;
            }
        }
    }

    walk(dir);
    return { count, size };
}

const stats = countCode(path.join(__dirname, '..'));
const sizeKB = Math.round(stats.size / 1024);
test('S2.D.5 代码量达标', stats.count >= 20 && sizeKB >= 100, `${stats.count} 文件, ${sizeKB} KB`);

// ============================================================================
// 结果汇总
// ============================================================================

// console.log('\n========================================');
// console.log('Phase 2 验收测试结果');
// console.log('========================================');

const passed = RESULTS.filter(r => r.passed).length;
const failed = RESULTS.filter(r => !r.passed).length;

// console.log(`总计: ${RESULTS.length} | 通过: ${passed} | 失败: ${failed}`);
// console.log('========================================\n');

// 写入结果
const resultPath = path.join(__dirname, 'phase2_results.json');
fs.writeFileSync(resultPath, JSON.stringify({
    phase: '2',
    timestamp: new Date().toISOString(),
    total: RESULTS.length,
    passed,
    failed,
    results: RESULTS
}, null, 2));

process.exit(failed > 0 ? 1 : 0);
