#!/usr/bin/env node
/**
 * hundunos/scripts/ts-cli.js
 * HundunOS v3.8 — TaskScientist CLI
 * 用法：
 *   node scripts/ts-cli.js analyze "重构我的认证系统"
 *   node scripts/ts-cli.js create "实现支付流程" --stages="验证,支付,回调"
 *   node scripts/ts-cli.js run <taskId>
 *   node scripts/ts-cli.js list
 *   node scripts/ts-cli.js tree <taskId>
 *   node scripts/ts-cli.js stats <taskId>
 *   node scripts/ts-cli.js delete <taskId>
 *   node scripts/ts-cli.js status
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// 轻量 HTTP 客户端（直接调 REST API，无额外依赖）
async function api(method, path, body = null) {
    const http = await import('node:http');
    const port = process.env.HUNDUNOS_PORT || 38080;
    const hostname = process.env.HUNDUNOS_HOST || 'localhost';

    return new Promise((resolve, reject) => {
        const opts = { hostname, port, path, method, headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }};
        const req = http.request(opts, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// ── 命令路由 ───────────────────────────────────────────────────────────────

const [,, cmd, ...args] = process.argv;
const argv = Object.fromEntries(
    args.filter(a => a.startsWith('--')).map(a => [a.slice(2).split('=')[0], a.split('=')[1] ?? true])
);
const positional = args.filter(a => !a.startsWith('--'));

async function main() {
    if (!cmd) return usage();

    switch (cmd) {

        case 'status': {
            // review: removed // review: removed console.log('\n🧪 HundunOS v3.8 — TaskScientist Status\n');
            const { status, body } = await api('GET', '/api/task-scientist');
            if (status !== 200) { console.error('❌ 请求失败:', body); process.exit(1); }
            const s = body;
            // review: removed // review: removed console.log(`  启用状态 : ${s.enabled ? '✅ 启用' : '⚪ 禁用'}`);
            // review: removed // review: removed console.log(`  引擎     : ${s.engine || 'N/A'}`);
            // review: removed // review: removed console.log(`  Rust 可用: ${s.rustAvailable ? '✅ 是' : '❌ 否（使用 JS Fallback）'}`);
            // review: removed // review: removed console.log(`  活跃任务 : ${s.activeTasks ?? 0}`);
            if (s.recentHistory?.length) {
                // review: removed // review: removed console.log('\n  最近任务:');
                s.recentHistory.forEach(t => {
                    // review: removed // review: removed console.log(`    • ${t.taskId}  [${t.stage}]  ${t.engine} engine`);
                });
            }
            // review: removed // review: removed console.log();
            break;
        }

        case 'analyze': {
            const task = positional.join(' ');
            if (!task) { console.error('❌ 请提供任务描述'); process.exit(1); }
            // review: removed // review: removed console.log(`\n🔍 分析任务: "${task}"\n`);
            const { status, body } = await api('POST', '/api/task-scientist/analyze', { task });
            if (status !== 200) { console.error('❌ 分析失败:', body); process.exit(1); }
            const a = body;
            const badge = a.suitable
                ? (a.confidence >= 0.7 ? '🟢 非常适合' : '🟡 适合')
                : '🔴 不太适合';
            // review: removed // review: removed console.log(`  ${badge}  BFTS`);
            // review: removed // review: removed console.log(`  置信度  : ${(a.confidence * 100).toFixed(0)}%`);
            // review: removed // review: removed console.log(`  推荐阈值: ≥ ${(a.threshold * 100).toFixed(0)}%`);
            if (a.reasons?.length) {
                // review: removed // review: removed console.log('\n  原因:');
                a.reasons.forEach(r => // review: removed // review: removed console.log(`    • ${r}`));
            }
            // review: removed // review: removed console.log();
            break;
        }

        case 'create': {
            const task = positional.join(' ');
            if (!task) { console.error('❌ 请提供任务描述'); process.exit(1); }
            const stages = argv.stages ? argv.stages.split(',').map(s => s.trim()) : [];
            // review: removed // review: removed console.log(`\n📋 创建任务: "${task}"\n`);
            const { status, body } = await api('POST', '/api/task-scientist/tasks', {
                task,
                context: { stages }
            });
            if (status !== 201) { console.error('❌ 创建失败:', body); process.exit(1); }
            // review: removed // review: removed console.log(`  ✅ 任务已创建`);
            // review: removed // review: removed console.log(`  Task ID : ${body.taskId}`);
            // review: removed // review: removed console.log(`  初始阶段: ${body.stage || 'idle'}`);
            // review: removed // review: removed console.log(`  引擎    : ${body.engine || 'N/A'}`);
            // review: removed // review: removed console.log();
            break;
        }

        case 'run': {
            const taskId = positional[0];
            if (!taskId) { console.error('❌ 请提供 taskId'); process.exit(1); }
            // review: removed // review: removed console.log(`\n🚀 运行 BFTS: ${taskId}\n`);
            process.stdout.write('  ');
            const dots = setInterval(() => process.stdout.write('.'), 300);
            const start = Date.now();
            const { status, body } = await api('POST', `/api/task-scientist/tasks/${taskId}/run`);
            clearInterval(dots);
            process.stdout.write('\n');
            if (status !== 200) { console.error('❌ 运行失败:', body); process.exit(1); }
            const elapsed = Date.now() - start;
            // review: removed // review: removed console.log(`  ✅ BFTS 完成`);
            // review: removed // review: removed console.log(`  迭代次数: ${body.iterations}`);
            // review: removed // review: removed console.log(`  引擎    : ${body.engine}`);
            // review: removed // review: removed console.log(`  耗时    : ${elapsed}ms`);
            if (body.journal) {
                // review: removed // review: removed console.log(`  节点总数: ${body.journal.nodes?.length ?? 'N/A'}`);
            }
            if (body.bestNode) {
                // review: removed // review: removed console.log(`  最佳节点: ${body.bestNode}`);
            }
            // review: removed // review: removed console.log();
            break;
        }

        case 'list': {
            const { status, body } = await api('GET', '/api/task-scientist');
            if (status !== 200) { console.error('❌ 请求失败:', body); process.exit(1); }
            const tasks = body.recentHistory || [];
            if (!tasks.length) { // review: removed // review: removed console.log('\n  暂无任务记录\n'); break; }
            // review: removed // review: removed console.log('\n📋 任务列表\n');
            // review: removed // review: removed console.log(`  ${'Task ID'.padEnd(32)}  阶段      引擎`);
            // review: removed // review: removed console.log(`  ${'─'.repeat(60)}`);
            tasks.forEach(t => {
                const id = (t.taskId || '').slice(0, 30).padEnd(32);
                // review: removed // review: removed console.log(`  ${id}  ${(t.stage || 'N/A').padEnd(10)}  ${t.engine || 'N/A'}`);
            });
            // review: removed // review: removed console.log();
            break;
        }

        case 'get': {
            const taskId = positional[0];
            if (!taskId) { console.error('❌ 请提供 taskId'); process.exit(1); }
            const { status, body } = await api('GET', `/api/task-scientist/tasks/${taskId}`);
            if (status !== 200) { console.error('❌ 获取失败:', body); process.exit(1); }
            // review: removed // review: removed console.log(`\n📊 任务详情: ${taskId}\n`);
            // review: removed // review: removed console.log(`  阶段: ${body.stats?.stage || body.journal?.stage || 'N/A'}`);
            // review: removed // review: removed console.log(`  节点: ${body.stats?.total_nodes ?? body.journal?.nodes?.length ?? 'N/A'}`);
            if (body.stats) {
                // review: removed // review: removed console.log(`  树深度: ${body.stats.max_depth ?? 'N/A'}`);
                // review: removed // review: removed console.log(`  根节点: ${body.stats.root_nodes ?? 'N/A'}`);
                // review: removed // review: removed console.log(`  叶节点: ${body.stats.leaf_nodes ?? 'N/A'}`);
            }
            if (body.journal?.nodes?.length) {
                // review: removed // review: removed console.log('\n  节点树:');
                body.journal.nodes.slice(0, 20).forEach(n => {
                    const indent = '  '.repeat((n.depth || 0));
                    const star = n.id === body.stats?.best_node ? ' ⭐' : '';
                    // review: removed // review: removed console.log(`  ${indent}• ${n.action || n.id}${star}`);
                });
            }
            // review: removed // review: removed console.log();
            break;
        }

        case 'stats': {
            const taskId = positional[0];
            if (!taskId) { console.error('❌ 请提供 taskId'); process.exit(1); }
            const { status, body } = await api('GET', `/api/task-scientist/tasks/${taskId}`);
            if (status !== 200) { console.error('❌ 获取失败:', body); process.exit(1); }
            const s = body.stats;
            // review: removed // review: removed console.log(`\n📈 统计: ${taskId}\n`);
            if (!s) { // review: removed // review: removed console.log('  无统计信息（任务可能未运行）\n'); break; }
            Object.entries(s).forEach(([k, v]) => {
                if (v !== null && v !== undefined) {
                    // review: removed // review: removed console.log(`  ${k.padEnd(16)}: ${JSON.stringify(v)}`);
                }
            });
            // review: removed // review: removed console.log();
            break;
        }

        case 'delete': {
            const taskId = positional[0];
            if (!taskId) { console.error('❌ 请提供 taskId'); process.exit(1); }
            const { status, body } = await api('DELETE', `/api/task-scientist/tasks/${taskId}`);
            // review: removed // review: removed console.log(`\n${status === 200 ? '✅' : '⚠️'} ${body.deleted ? '已删除' : '操作完成'}: ${taskId}\n`);
            break;
        }

        case 'help': usage(); break;

        default:
            if (!cmd.startsWith('-')) {
                console.error(`❌ 未知命令: ${cmd}`);
            }
            usage();
    }
}

function usage() {
    // review: removed // review: removed console.log(`
🧪 HundunOS v3.8 — TaskScientist CLI

用法:
  node scripts/ts-cli.js <command> [args...]

命令:
  status                    显示 TaskScientist 状态总览
  analyze <任务描述>         分析任务是否适合 BFTS
  create <任务描述> [--stages=阶段1,阶段2]   创建 BFTS 任务
  run <taskId>              运行 BFTS（带进度动画）
  get <taskId>              获取任务 Journal + 节点树
  list                      列出最近任务
  stats <taskId>            显示任务统计
  delete <taskId>           删除任务
  help                      显示此帮助

示例:
  node scripts/ts-cli.js analyze "实现 REST API"
  node scripts/ts-cli.js create "重构认证模块" --stages=分析,设计,实现
  node scripts/ts-cli.js run <taskId>
  node scripts/ts-cli.js get <taskId>

环境变量:
  HUNDUNOS_PORT  REST API 端口（默认 38080）
  HUNDUNOS_HOST  REST API 主机（默认 localhost）
`);
}

main().catch(e => {
    console.error('\n❌ CLI 错误:', e.message);
    process.exit(1);
});
