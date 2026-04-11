/**
 * HundunOS v3.0 - Phase 3 测试
 * 阶段3验收测试: Extensions + REST API + Integration
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RESULTS = [];

function test(name, passed, detail = '') {
    const status = passed ? '✅' : '❌';
    // review: removed // review: removed console.log(`${status} ${name}${detail ? ` - ${detail}` : ''}`);
    RESULTS.push({ name, passed, detail });
}

// ============================================================================
// S3 Extensions 验收
// ============================================================================

// review: removed // review: removed console.log('\n=== S3 Extensions 验收 ===\n');

const extensions = [
    { name: 'WorkBuddy', path: '../extension-modules/workbuddy/index.js' },
    { name: 'MCP', path: '../extension-modules/mcp/index.js' },
    { name: 'Search', path: '../extension-modules/search/index.js' },
    { name: 'Evolution', path: '../extension-modules/evolution/index.js' },
    { name: 'Skills', path: '../extension-modules/skills/index.js' }
];

for (const ext of extensions) {
    const filePath = path.join(__dirname, ext.path);
    test(`S3.${ext.name} 文件存在`, fs.existsSync(filePath));

    if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        test(`S3.${ext.name} 文件大小合理`, stat.size > 3000, `${Math.round(stat.size/1024)}KB`);
    }
}

// ============================================================================
// S3.8 REST API 验收
// ============================================================================

// review: removed // review: removed console.log('\n=== S3.8 REST API 验收 ===\n');

const restPath = path.join(__dirname, '../shell/rest-api/index.js');
test('S3.8 REST API 文件存在', fs.existsSync(restPath));

if (fs.existsSync(restPath)) {
    const stat = fs.statSync(restPath);
    test('S3.8 REST API 文件大小合理', stat.size > 3000, `${Math.round(stat.size/1024)}KB`);
}

// ============================================================================
// 模块导入验证
// ============================================================================

// review: removed // review: removed console.log('\n=== 模块导入验证 ===\n');

async function testImports() {
    // WorkBuddy
    try {
        const { WorkBuddyExtension, WorkBuddyState } = await import('../extension-modules/workbuddy/index.js');
        test('S3.D.1 WorkBuddy 模块可导入', true);
        test('S3.D.1 WorkBuddyState 定义完整', Object.keys(WorkBuddyState).length >= 4);
        const wb = new WorkBuddyExtension();
        test('S3.D.1 WorkBuddy 实例化成功', true);
    } catch (e) {
        test('S3.D.1 WorkBuddy 模块可导入', false, e.message);
    }

    // MCP
    try {
        const { MCPExtension, MCPTool } = await import('../extension-modules/mcp/index.js');
        test('S3.D.2 MCP 模块可导入', true);
        const mcp = new MCPExtension();
        test('S3.D.2 MCP 实例化成功', true);
        test('S3.D.2 MCP 默认工具已注册', mcp.tools.size >= 3, `${mcp.tools.size} 个工具`);
    } catch (e) {
        test('S3.D.2 MCP 模块可导入', false, e.message);
    }

    // Search
    try {
        const { SearchExtension, SearchType } = await import('../extension-modules/search/index.js');
        test('S3.D.3 Search 模块可导入', true);
        test('S3.D.3 SearchType 定义完整', Object.keys(SearchType).length >= 4);
        const search = new SearchExtension();
        test('S3.D.3 Search 实例化成功', true);
    } catch (e) {
        test('S3.D.3 Search 模块可导入', false, e.message);
    }

    // Evolution
    try {
        const { EvolutionExtension, EvolutionType } = await import('../extension-modules/evolution/index.js');
        test('S3.D.4 Evolution 模块可导入', true);
        test('S3.D.4 EvolutionType 定义完整', Object.keys(EvolutionType).length >= 4);
        const evo = new EvolutionExtension();
        test('S3.D.4 Evolution 实例化成功', true);
        test('S3.D.4 Evolution 基因已注册', evo.genes.size >= 4, `${evo.genes.size} 个基因`);
    } catch (e) {
        test('S3.D.4 Evolution 模块可导入', false, e.message);
    }

    // Skills
    try {
        const { SkillsExtension, SkillState } = await import('../extension-modules/skills/index.js');
        test('S3.D.5 Skills 模块可导入', true);
        test('S3.D.5 SkillState 定义完整', Object.keys(SkillState).length >= 4);
        const skills = new SkillsExtension();
        test('S3.D.5 Skills 实例化成功', true);
    } catch (e) {
        test('S3.D.5 Skills 模块可导入', false, e.message);
    }

    // REST API
    try {
        const { RestAPI, Router } = await import('../shell/rest-api/index.js');
        test('S3.D.6 REST API 模块可导入', true);
        const api = new RestAPI();
        test('S3.D.6 REST API 实例化成功', true);
        test('S3.D.6 REST API 默认路由已注册', api.router.routes.size >= 3, `${api.router.routes.size} 个路由`);
    } catch (e) {
        test('S3.D.6 REST API 模块可导入', false, e.message);
    }
}

await testImports();

// ============================================================================
// 代码量统计
// ============================================================================

// review: removed // review: removed console.log('\n=== 代码量统计 ===\n');

function countCode(dir, ext = '.js') {
    let count = 0;
    let size = 0;

    function walk(d) {
        if (!fs.existsSync(d)) return;
        const items = fs.readdirSync(d);
        for (const item of items) {
            const full = path.join(d, item);
            const stat = fs.statSync(full);
            if (stat.isDirectory() && item !== 'node_modules') {
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
test('S3.D.7 代码量达标', stats.count >= 30 && sizeKB >= 200, `${stats.count} 文件, ${sizeKB} KB`);

// ============================================================================
// 结果汇总
// ============================================================================

// review: removed // review: removed console.log('\n========================================');
// review: removed // review: removed console.log('Phase 3 验收测试结果');
// review: removed // review: removed console.log('========================================');

const passed = RESULTS.filter(r => r.passed).length;
const failed = RESULTS.filter(r => !r.passed).length;

// review: removed // review: removed console.log(`总计: ${RESULTS.length} | 通过: ${passed} | 失败: ${failed}`);
// review: removed // review: removed console.log('========================================\n');

// 写入结果
const resultPath = path.join(__dirname, 'phase3_results.json');
fs.writeFileSync(resultPath, JSON.stringify({
    phase: '3',
    timestamp: new Date().toISOString(),
    total: RESULTS.length,
    passed,
    failed,
    results: RESULTS,
    codeStats: { files: stats.count, sizeKB }
}, null, 2));

process.exit(failed > 0 ? 1 : 0);
