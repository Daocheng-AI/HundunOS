#!/usr/bin/env node
/**
 * hundunos/scripts/hundunos.js
 * HundunOS v3.8 Phase 7 — 统一 CLI 入口
 *
 * 用法：
 *   node scripts/hundunos.js status
 *   node scripts/hundunos.js task analyze "重构认证系统"
 *   node scripts/hundunos.js task create "实现支付" --stages=验证,支付
 *   node scripts/hundunos.js task run <taskId>
 *   node scripts/hundunos.js task list
 *   node scripts/hundunos.js task stats
 *   node scripts/hundunos.js skill list
 *   node scripts/hundunos.js skill installOfficial slack
 *   node scripts/hundunos.js skill install https://raw.githubusercontent.com/.../skill.yaml
 *   node scripts/hundunos.js hook list
 *   node scripts/hundunos.js hook trigger PreToolUse '{"tool":"Write"}'
 *   node scripts/hundunos.js memory search "上次任务"
 *   node scripts/hundunos.js feature list
 *   node scripts/hundunos.js feature enable HOOK_SYSTEM
 *   node scripts/hundunos.js repl
 *
 * 别名（兼容 Phase 6）：
 *   node scripts/ts-cli.js analyze "..."  →  hundunos task analyze "..."
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import readline from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── HTTP 客户端 ──────────────────────────────────────────────────────────────

const PORT = process.env.HUNDUNOS_PORT || 38080;
const HOST = process.env.HUNDUNOS_HOST || 'localhost';

async function api(method, path, body = null) {
    const http = await import('node:http');
    return new Promise((resolve, reject) => {
        const opts = { hostname: HOST, port: PORT, path, method, headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }};
        const req = http.request(opts, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function apiOrFail(method, path, body = null) {
    const result = await api(method, path, body);
    if (result.status >= 400) {
        console.error(`[ERROR] HTTP ${result.status}: ${JSON.stringify(result.body)}`);
        process.exit(1);
    }
    return result.body;
}

// ── CLI 框架 ─────────────────────────────────────────────────────────────────

const [,, cmd, subcmd, ...restArgs] = process.argv;

function parseArgs(args) {
    const positional = [];
    const named = {};
    for (const arg of args) {
        const m = arg.match(/^--([a-zA-Z_-]+)(?:=(.+))?$/);
        if (m) {
            named[m[1].replace(/-/g, '_')] = m[2] !== undefined ? m[2] : true;
        } else {
            positional.push(arg);
        }
    }
    return { positional, named };
}

function logJson(obj) {
    console.log(JSON.stringify(obj, null, 2));
}

function logTable(rows, columns) {
    if (!rows || rows.length === 0) { console.log('(empty)'); return; }
    const cols = columns || Object.keys(rows[0]);
    const widths = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
    const header = cols.map((c, i) => c.padEnd(widths[i])).join('  ');
    console.log(header);
    console.log(cols.map((_, i) => '─'.repeat(widths[i])).join('  '));
    for (const row of rows) {
        console.log(cols.map((c, i) => String(row[c] ?? '').padEnd(widths[i])).join('  '));
    }
}

// ── 命令实现 ─────────────────────────────────────────────────────────────────

async function cmdStatus() {
    const result = await apiOrFail('GET', '/api/status');
    logJson(result);
}

async function cmdTask(subcmd, args) {
    switch (subcmd) {
        case 'analyze': {
            const query = args.positional.join(' ') || args.named.query || args.named.q || '';
            if (!query) { console.error('Usage: hundunos task analyze "任务描述"'); return; }
            const result = await apiOrFail('POST', '/api/tasks/analyze', { task: query });
            console.log(`\n 适合 BFTS: ${result.suitable ? '✅ YES' : '❌ NO'}  (confidence: ${((result.confidence || 0) * 100).toFixed(0)}%)`);
            console.log(` 推荐引擎: ${result.engine || 'unknown'}  |  ${result.recommendation || ''}`);
            if (result.reasons?.length) console.log(` 匹配信号: ${result.reasons.join(', ')}`);
            break;
        }
        case 'create': {
            const task = args.positional.join(' ') || args.named.task || args.named.t || '';
            if (!task) { console.error('Usage: hundunos task create "任务描述" [--stages=验证,实现]'); return; }
            const context = { initialCode: args.named.code || '' };
            if (args.named.stages) context.stages = args.named.stages.split(',');
            const result = await apiOrFail('POST', '/api/tasks', { task, context });
            console.log(`✅ Task created: ${result.taskId} (engine: ${result.engine}, stage: ${result.stage})`);
            break;
        }
        case 'run': {
            const taskId = args.positional[0] || args.named.task_id;
            if (!taskId) { console.error('Usage: hundunos task run <taskId>'); return; }
            console.log(`Running BFTS for task ${taskId}...`);
            const result = await apiOrFail('POST', `/api/tasks/run/${taskId}`);
            console.log(`✅ BFTS complete: ${result.iterations} iterations, best score: ${result.bestNode?.metric?.value?.toFixed(3) || '?'}`);
            break;
        }
        case 'list': {
            const result = await apiOrFail('GET', '/api/tasks');
            const tasks = result.tasks || [];
            if (!tasks.length) { console.log('No active tasks'); return; }
            logTable(tasks, ['taskId', 'engine', 'created', 'status']);
            break;
        }
        case 'get': {
            const taskId = args.positional[0];
            if (!taskId) { console.error('Usage: hundunos task get <taskId>'); return; }
            const stats = await apiOrFail('GET', `/api/tasks/${taskId}`);
            logJson(stats);
            break;
        }
        case 'journal': {
            const taskId = args.positional[0];
            if (!taskId) { console.error('Usage: hundunos task journal <taskId>'); return; }
            const journal = await apiOrFail('GET', `/api/tasks/${taskId}/journal`);
            console.log(`Journal for ${taskId}:`);
            console.log(`  Nodes: ${Object.keys(journal.nodes || {}).length} | Stage: ${journal.current_stage} | Best: ${journal.best_node}`);
            break;
        }
        case 'stats': {
            const result = await apiOrFail('GET', '/api/tasks/stats');
            logJson(result);
            break;
        }
        case 'delete': {
            const taskId = args.positional[0];
            if (!taskId) { console.error('Usage: hundunos task delete <taskId>'); return; }
            await apiOrFail('DELETE', `/api/tasks/${taskId}`);
            console.log(`Deleted: ${taskId}`);
            break;
        }
        default: {
            console.log(`Usage: hundunos task <analyze|create|run|list|get|journal|stats|delete>`);
            console.log('Examples:');
            console.log('  hundunos task analyze "实现 REST API"');
            console.log('  hundunos task create "重构认证" --stages=分析,实现,测试');
            console.log('  hundunos task list');
            console.log('  hundunos task run <taskId>');
        }
    }
}

async function cmdSkill(subcmd, args) {
    switch (subcmd) {
        case 'list': {
            const result = await apiOrFail('GET', '/api/skills');
            const skills = Array.isArray(result) ? result : result.skills || [];
            if (!skills.length) { console.log('No skills loaded'); return; }
            logTable(skills, ['name', 'version', 'description']);
            break;
        }
        case 'info': {
            const name = args.positional[0];
            if (!name) { console.error('Usage: hundunos skill info <name>'); return; }
            const result = await apiOrFail('GET', `/api/skills/${name}`);
            logJson(result);
            break;
        }
        case 'match': {
            const query = args.positional.join(' ') || args.named.query || args.named.q || '';
            if (!query) { console.error('Usage: hundunos skill match "query"'); return; }
            const result = await apiOrFail('POST', '/api/skills/match', { query });
            const matches = result.matches || [];
            if (!matches.length) { console.log('No matching skills'); return; }
            console.log(`\nMatched skills for "${query}":`);
            for (const m of matches) {
                console.log(`  [${(m.score * 100).toFixed(0)}%] ${m.name} (${m.version}) — ${m.description || ''}`);
            }
            break;
        }
        case 'installOfficial': {
            const name = args.positional[0] || args.named.name;
            if (!name) { console.error('Usage: hundunos skill installOfficial <name>'); return; }
            // 使用 market endpoint
            const result = await apiOrFail('POST', '/api/skills/market/install', { name });
            logJson(result);
            break;
        }
        case 'install': {
            const url = args.positional[0] || args.named.url;
            if (!url) { console.error('Usage: hundunos skill install <url>'); return; }
            const result = await apiOrFail('POST', '/api/skills/market/install', { url });
            logJson(result);
            break;
        }
        case 'market': {
            const result = await apiOrFail('GET', '/api/skills/market');
            const official = result.official || result || [];
            console.log(`\nOfficial Skills (${official.length}):`);
            for (const s of official) {
                console.log(`  [${s.installed ? '✅' : '○'}] ${s.name} ${s.version} — ${s.description || ''}`);
            }
            break;
        }
        case 'run': {
            const name = args.positional[0] || args.named.name;
            const params = args.named.params ? JSON.parse(args.named.params) : {};
            if (!name) { console.error('Usage: hundunos skill run <name> [--params=\'{"key":"val"}\']'); return; }
            const result = await apiOrFail('POST', '/api/skills/run', { name, params });
            logJson(result);
            break;
        }
        default: {
            console.log(`Usage: hundunos skill <list|info|match|installOfficial|install|market|run>`);
            console.log('Examples:');
            console.log('  hundunos skill list');
            console.log('  hundunos skill match "发送 GitHub issue"');
            console.log('  hundunos skill installOfficial slack');
            console.log('  hundunos skill install https://raw.githubusercontent.com/.../my-skill.yaml');
            console.log('  hundunos skill market');
        }
    }
}

async function cmdHook(subcmd, args) {
    switch (subcmd) {
        case 'list': {
            const result = await apiOrFail('GET', '/api/hooks');
            const events = result.events || [];
            console.log(`\nRegistered Hook events (${events.length}):`);
            for (const event of events) {
                const hooks = result.registered?.[event] || [];
                console.log(`  ${event} (${hooks.length} hook group(s))`);
            }
            break;
        }
        case 'trigger': {
            const event = args.positional[0];
            let input = {};
            try { input = JSON.parse(args.positional.slice(1).join(' ') || '{}'); } catch (_) {}
            if (!event) { console.error('Usage: hundunos hook trigger <eventName> [json-input]'); return; }
            const result = await apiOrFail('POST', `/api/hooks/trigger/${event}`, input);
            logJson(result);
            break;
        }
        case 'register': {
            // 从文件加载 hook 配置
            const file = args.named.file || args.positional[0];
            if (!file) { console.error('Usage: hundunos hook register --file=<path.yaml>'); return; }
            try {
                const content = readFileSync(file, 'utf-8');
                const { parse } = await import('yaml').catch(() => ({ parse: () => null }));
                const config = parse ? parse(content) : JSON.parse(content);
                // 简单处理：注册第一个事件的第一个 hookGroup
                const eventName = Object.keys(config.hooks || {})[0];
                const hookGroup = config.hooks?.[eventName]?.[0];
                if (!eventName || !hookGroup) { console.error('Invalid hook config'); return; }
                const result = await apiOrFail('POST', '/api/hooks/register', { event: eventName, hookGroup });
                logJson(result);
            } catch (e) {
                console.error(`Failed to load hook config: ${e.message}`);
            }
            break;
        }
        default: {
            console.log(`Usage: hundunos hook <list|trigger|register>`);
            console.log('Examples:');
            console.log('  hundunos hook list');
            console.log('  hundunos hook trigger PreToolUse \'{"tool":"Write"}\'');
            console.log('  hundunos hook register --file=config/hooks/my-hook.yaml');
        }
    }
}

async function cmdMemory(subcmd, args) {
    switch (subcmd) {
        case 'stats':
        case 'list': {
            const result = await apiOrFail('GET', '/api/memory');
            logJson(result);
            break;
        }
        case 'search': {
            const query = args.positional.join(' ') || args.named.query || args.named.q || '';
            if (!query) { console.error('Usage: hundunos memory search "查询内容"'); return; }
            const result = await apiOrFail('POST', '/api/memory/search', { query });
            const recent = result.recent || [];
            const semantic = result.semantic || [];
            if (!recent.length && !semantic.length) { console.log('No results found'); return; }
            console.log(`\nMemory results for "${query}":`);
            if (recent.length) {
                console.log('  Recent:');
                for (const r of recent.slice(0, 5)) {
                    console.log(`    - ${r.message?.slice(0, 80) || '(no message)'}`);
                }
            }
            if (semantic.length) {
                console.log('  Semantic:');
                for (const s of semantic.slice(0, 3)) {
                    console.log(`    - ${s.key}: ${s.description || ''}`);
                }
            }
            break;
        }
        default: {
            console.log(`Usage: hundunos memory <stats|search>`);
            console.log('Examples:');
            console.log('  hundunos memory stats');
            console.log('  hundunos memory search "上次重构"');
        }
    }
}

async function cmdFeature(subcmd, args) {
    switch (subcmd) {
        case 'list': {
            const result = await apiOrFail('GET', '/api/features');
            const features = result.features || [];
            logTable(features, ['name', 'enabled', 'env', 'description']);
            break;
        }
        case 'get': {
            const name = args.positional[0];
            if (!name) { console.error('Usage: hundunos feature get <name>'); return; }
            const result = await apiOrFail('GET', `/api/features/${name}`);
            logJson(result);
            break;
        }
        default: {
            console.log(`Usage: hundunos feature <list|get>`);
        }
    }
}

// ── REPL 模式 ────────────────────────────────────────────────────────────────

async function cmdRepl() {
    console.log(`\n  ██╗  ██╗ █████╗ ██╗   ██╗██╗  ████████╗`);
    console.log(`  ██║ ██╔╝██╔══██╗██║   ██║██║  ╚══██╔══╝`);
    console.log(`  █████╔╝ ███████║██║   ██║██║     ██║`);
    console.log(`  ██╔═██╗ ██╔══██║██║   ██║██║     ██║`);
    console.log(`  ██║  ██╗██║  ██║╚██████╔╝███████╗██║`);
    console.log(`  ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝`);
    console.log(`\n  HundunOS v3.8 Phase 7 REPL`);
    console.log(`  REST API: http://${HOST}:${PORT}`);
    console.log(`  Type 'help' for commands, 'exit' to quit\n`);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'hundunos> ',
    });

    const shortcuts = {
        '?': 'help', h: 'help', help: 'help',
        'q': 'exit', quit: 'exit', exit: 'exit',
        'status': 'status', st: 'status',
        'skills': 'skill list', 'skill list': 'skill list',
        'tasks': 'task list', 'task list': 'task list',
        'hooks': 'hook list', 'hook list': 'hook list',
        'mem': 'memory stats', 'memory stats': 'memory stats',
        'feat': 'feature list', 'feature list': 'feature list',
    };

    function printHelp() {
        console.log(`
  Commands:
    status               System status
    task analyze "..."   Analyze if task is BFTS-suitable
    task list            List active tasks
    task stats           Global task statistics
    skill list           List loaded skills
    skill market         Show official skill marketplace
    skill match "..."    Find matching skills
    hook list            List registered hook events
    memory stats         Memory graph statistics
    memory search "..."  Search memory
    feature list         List all feature flags
    help                 Show this help
    exit / quit          Exit REPL
        `);
    }

    rl.prompt();

    rl.on('line', async (line) => {
        const input = line.trim();
        if (!input) { rl.prompt(); return; }

        // 快捷命令解析
        let resolved = shortcuts[input] || input;
        // 自动补全 task/skill/hook/memory 前缀
        if (!resolved.includes(' ') && !['status', 'exit', 'quit', 'help', '?'].includes(resolved)) {
            if (/^(analyze|list|stats|create|run|get|delete|match|install|market|trigger|search|get|enable|disable)$/.test(resolved)) {
                // 尝试猜测是哪个子系统
                resolved = 'task ' + resolved;
            }
        }

        const parts = resolved.split(/\s+/);
        const [c, sc, ...rArgs] = parts;

        try {
            if (c === 'exit' || c === 'quit') {
                rl.close();
                return;
            }
            if (c === 'help' || c === '?') { printHelp(); }
            else if (c === 'status') { await cmdStatus(); }
            else if (c === 'task') { await cmdTask(sc, { positional: rArgs, named: {} }); }
            else if (c === 'skill') { await cmdSkill(sc, { positional: rArgs, named: {} }); }
            else if (c === 'hook') { await cmdHook(sc, { positional: rArgs, named: {} }); }
            else if (c === 'memory') { await cmdMemory(sc, { positional: rArgs, named: {} }); }
            else if (c === 'feature') { await cmdFeature(sc, { positional: rArgs, named: {} }); }
            else { console.log(`Unknown command: ${c}. Type 'help' for available commands.`); }
        } catch (e) {
            console.error(`[ERROR] ${e.message}`);
        }

        rl.prompt();
    });

    rl.on('close', () => {
        console.log('\nGoodbye!');
        process.exit(0);
    });
}

// ── 主路由 ───────────────────────────────────────────────────────────────────

async function main() {
    // 无参数：显示帮助
    if (!cmd) {
        console.log(`
  HundunOS v3.8 Phase 7 — Unified CLI

  Usage: hundunos <command> [subcommand] [options]

  Commands:
    status         Show system status
    task           TaskScientist commands (analyze/create/run/list/...)
    skill          Skill system commands (list/match/install/...)
    hook           Hook system commands (list/trigger/register)
    memory         Memory graph commands (stats/search)
    feature        Feature flag commands (list/get)
    repl           Start interactive REPL

  Examples:
    hundunos status
    hundunos task analyze "实现 REST API"
    hundunos task create "重构认证" --stages=分析,实现
    hundunos task list
    hundunos skill list
    hundunos skill market
    hundunos skill installOfficial slack
    hundunos hook list
    hundunos memory search "上次重构"
    hundunos repl
        `);
        return;
    }

    try {
        if (cmd === 'repl') { await cmdRepl(); return; }

        const args = parseArgs([subcmd, ...restArgs].filter(Boolean));

        switch (cmd) {
            case 'status': await cmdStatus(); break;
            case 'task': await cmdTask(subcmd, args); break;
            case 'skill': await cmdSkill(subcmd, args); break;
            case 'hook': await cmdHook(subcmd, args); break;
            case 'memory': await cmdMemory(subcmd, args); break;
            case 'feature': await cmdFeature(subcmd, args); break;
            default:
                console.error(`Unknown command: ${cmd}`);
                console.error('Run "hundunos" without arguments for usage.');
        }
    } catch (e) {
        if (e.code === 'ECONNREFUSED') {
            console.error(`[ERROR] Cannot connect to HundunOS REST API at http://${HOST}:${PORT}`);
            console.error('Make sure HundunOS is running: node kernel/core.js');
        } else {
            console.error(`[ERROR] ${e.message}`);
        }
        process.exit(1);
    }
}

main();
