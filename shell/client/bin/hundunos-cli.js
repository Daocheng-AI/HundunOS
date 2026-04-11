#!/usr/bin/env node
/**
 * hundunos-cli — CLI 入口
 * 用法:
 *   hundunos-cli                    # 交互模式
 *   hundunos-cli "你好"             # 单次命令模式
 *   hundunos-cli --status           # 查看状态
 *   hundunos-cli --kill             # 停止守护进程
 */

import { IpcClient } from '../lib/ipc-client.js';
import { Repl } from '../cli/repl.js';
import { logger } from '../lib/logger.js';

const args = process.argv.slice(2);

async function main() {
  const client = new IpcClient();

  // ── 单次命令模式 ────────────────────────────────────────────────────────
  if (args.length > 0 && !args[0].startsWith('-')) {
    await runOnce(client, args.join(' '));
    client.disconnect();
    return;
  }

  // ── 命令行选项 ───────────────────────────────────────────────────────────
  for (const arg of args) {
    switch (arg) {
      case '--status':
      case '-s':
        await cmdStatus(client);
        client.disconnect();
        return;

      case '--health':
      case '-h':
        await cmdHealth(client);
        client.disconnect();
        return;

      case '--modules':
      case '-m':
        await cmdModules(client);
        client.disconnect();
        return;

      case '--kill':
      case '--stop':
        await cmdKill(client);
        client.disconnect();
        return;

      case '--daemon':
        await cmdDaemon(client);
        client.disconnect();
        return;

      case '--help':
      case '-?':
        printHelp();
        client.disconnect();
        return;

      default:
        console.error(`Unknown option: ${arg}`);
        printHelp();
        client.disconnect();
        process.exit(1);
    }
  }

  // ── 交互模式 ───────────────────────────────────────────────────────────
  const repl = new Repl(client);
  await repl.start();
}

async function runOnce(client, message) {
  process.stdout.write(`[HundunOS] Processing: "${message}"\n`);

  try {
    const result = await client.process({ content: message, sessionId: 'cli-one-shot' });

    if (result?.data?.content) {
      console.log('\n' + result.data.content);
    } else if (result?.data) {
      console.log('\n' + JSON.stringify(result.data, null, 2));
    } else {
      console.log('\n' + JSON.stringify(result, null, 2));
    }

    if (result?.latency !== undefined) {
      const ms = result.latency < 1000 ? `${result.latency}ms` : `${(result.latency / 1000).toFixed(2)}s`;
      console.log(`\n[Latency: ${ms}]`);
    }

    if (!result?.success && result?.type) {
      console.error(`[${result.type}] ${result.reason || result.error?.message || ''}`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

async function cmdStatus(client) {
  const status = await client.getStatus();
  console.log('\n HundunOS Status');
  console.log('─'.repeat(40));
  console.log(`  Version:   ${status.version}`);
  console.log(`  Running:   ${status.running ? 'Yes' : 'No'}`);
  console.log(`  Uptime:    ${status.uptime ? (status.uptime / 60).toFixed(1) + 'm' : 'N/A'}`);
  console.log(`  Platform:  ${status.platform}`);
  console.log(`  Sessions: ${status.sessions?.active || 0}`);
}

async function cmdHealth(client) {
  const health = await client.getHealth();
  const score = health.overall?.score || (health.healthy ? 100 : 0);
  console.log(`\n Health Score: ${score}/100`);
  if (health.dimensions) {
    console.log('─'.repeat(40));
    for (const [dim, info] of Object.entries(health.dimensions)) {
      console.log(`  ${dim.padEnd(15)} ${info.score || 0}`);
    }
  }
}

async function cmdModules(client) {
  const mods = await client.getModules();
  console.log('\n Modules');
  console.log('─'.repeat(40));
  const list = mods.modules || [];
  for (const mod of list) {
    const s = mod.status === 'active' ? '●' : '○';
    console.log(`  ${s} ${mod.id.padEnd(20)} ${mod.name || ''}`);
  }
}

async function cmdKill(client) {
  try {
    await client.shutdown();
    console.log('Daemon shutdown requested');
  } catch (e) {
    console.error(`Error: ${e.message}`);
  }
}

async function cmdDaemon(client) {
  const status = await client.getDaemonStatus();
  console.log('\n Daemon Status');
  console.log('─'.repeat(40));
  console.log(`  Connected: ${status.connected}`);
  console.log(`  Endpoint: ${status.host}:${status.port}`);
}

function printHelp() {
  console.log(`
HundunOS v3.0 CLI

Usage:
  hundunos-cli                    # Interactive REPL mode
  hundunos-cli "message"          # One-shot command
  hundunos-cli --status           # Show system status
  hundunos-cli --health           # Show health check
  hundunos-cli --modules          # List modules
  hundunos-cli --daemon           # Daemon status
  hundunos-cli --kill             # Stop daemon
  hundunos-cli --help             # Show this help

REPL commands:
  /status   /s   System status
  /health   /h   Health check
  /modules  /m   Module list
  /model          Model router info
  /audit [n]      Audit logs
  /clear          Clear screen
  /history        Command history
  /help    /?     This help
  /exit    /q     Exit
`);
}

main().catch((e) => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
