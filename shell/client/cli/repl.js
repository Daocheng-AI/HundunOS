/**
 * hundunos-client/cli/repl.js
 * 交互式 REPL — 命令行界面
 */

import readline from 'readline';
import { IpcClient } from '../lib/ipc-client.js';
import { logger } from '../lib/logger.js';
import { getConfig } from '../lib/config.js';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

const PROMPT = `${COLORS.cyan}hundunos${COLORS.reset}> `;
const CONT_MULTILINE = `${COLORS.gray}...${COLORS.reset}  `;

export class Repl {
  constructor(client) {
    this.client = client;
    this.rl = null;
    this.multilineBuffer = [];
    this.inMultiline = false;
    this.history = [];
    this.historyIndex = -1;
    this.sessionId = 'cli-' + Date.now();
    this.ready = false;
  }

  async start() {
    // 等待连接
    await this._waitForConnection();

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: PROMPT,
      historySize: 100,
      completer: (line) => this._complete(line),
    });

    this._setupReadlineHandlers();

    // 监听守护进程事件
    this.client.on('event', (event, data) => {
      this._printSystem(`[${COLORS.magenta}${event}${COLORS.reset}] ${JSON.stringify(data)}`);
    });

    this.client.on('connected', () => {
      this._printSystem(`${COLORS.green}Connected to HundunOS daemon${COLORS.reset}`);
    });

    this.client.on('disconnected', () => {
      this._printSystem(`${COLORS.red}Disconnected from daemon${COLORS.reset}`);
    });

    await this._showBanner();
    this.ready = true;
    this.rl.prompt();
  }

  async _waitForConnection() {
    process.stdout.write(`${COLORS.gray}Connecting to daemon...${COLORS.reset}\n`);
    let attempts = 0;
    while (!this.client.connected) {
      attempts++;
      if (attempts > 30) {
        console.error(`${COLORS.red}Failed to connect to daemon. Is it running?\n  Run: node bin/hundunos-daemon.js${COLORS.reset}`);
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, 500));
    }
  }

  _setupReadlineHandlers() {
    this.rl.on('line', (line) => this._handleLine(line));
    this.rl.on('close', () => {
      this.client.disconnect();
      process.exit(0);
    });
    this.rl.on('SIGINT', () => {
      if (this.inMultiline) {
        this.inMultiline = false;
        this.multilineBuffer = [];
        this.rl.setPrompt(PROMPT);
        this.rl.prompt();
      } else {
        console.log('\nUse /exit to quit');
        this.rl.prompt();
      }
    });
  }

  _handleLine(line) {
    // 命令行历史
    if (line.trim()) {
      this.history.unshift(line.trim());
      this.historyIndex = -1;
    }

    if (!line.trim()) {
      this.rl.prompt();
      return;
    }

    // 多行模式
    if (this.inMultiline) {
      if (line.trim() === '---') {
        // 结束多行输入
        this.inMultiline = false;
        this.rl.setPrompt(PROMPT);
        const fullInput = this.multilineBuffer.join('\n');
        this.multilineBuffer = [];
        this._execute(fullInput);
      } else {
        this.multilineBuffer.push(line);
        this.rl.setPrompt(CONT_MULTILINE);
        this.rl.prompt();
      }
      return;
    }

    // 元命令
    if (line.startsWith('/')) {
      this._handleMetaCommand(line.slice(1));
      this.rl.prompt();
      return;
    }

    // 多行模式开始
    if (line.startsWith('---')) {
      this.inMultiline = true;
      this.multilineBuffer = [];
      this.rl.setPrompt(CONT_MULTILINE);
      this.rl.prompt();
      return;
    }

    this._execute(line);
    this.rl.prompt();
  }

  async _execute(input) {
    const trimmed = input.trim();
    if (!trimmed) return;

    try {
      const result = await this.client.process(
        { content: trimmed, sessionId: this.sessionId },
        {}
      );
      this._printResult(result);
    } catch (e) {
      console.error(`${COLORS.red}Error: ${e.message}${COLORS.reset}`);
    }
  }

  _printResult(result) {
    if (!result) {
      console.log(`${COLORS.gray}(no response)${COLORS.reset}`);
      return;
    }

    // 格式化输出
    if (result.success !== false) {
      const data = result.data || result;
      if (data?.content) {
        console.log(`\n${COLORS.green}${data.content}${COLORS.reset}`);
      } else if (typeof data === 'object') {
        console.log(`\n${JSON.stringify(data, null, 2)}`);
      } else {
        console.log(`\n${data}`);
      }
    } else {
      console.error(`\n${COLORS.red}[${result.type || 'error'}] ${result.error?.message || result.reason || 'Unknown error'}${COLORS.reset}`);
    }

    // latency
    if (result.latency !== undefined) {
      const ms = result.latency < 1000 ? `${result.latency}ms` : `${(result.latency / 1000).toFixed(2)}s`;
      console.log(`${COLORS.dim}  Latency: ${ms}${COLORS.reset}`);
    }

    // aware summary
    if (result.aware && Object.keys(result.aware).length > 0) {
      console.log(`${COLORS.dim}  Aware: ${JSON.stringify(result.aware)}${COLORS.reset}`);
    }
  }

  _handleMetaCommand(cmd) {
    const [command, ...args] = cmd.split(' ');

    switch (command) {
      case 'exit':
      case 'quit':
      case 'q':
        console.log('Goodbye!');
        this.rl.close();
        break;

      case 'status':
      case 's':
        this._cmdStatus();
        break;

      case 'health':
      case 'h':
        this._cmdHealth();
        break;

      case 'modules':
      case 'm':
        this._cmdModules();
        break;

      case 'audit':
      case 'a':
        this._cmdAudit(args[0]);
        break;

      case 'model':
      case 'models':
      case 'modelRouter':
        this._cmdModelRouter();
        break;

      case 'clear':
      case 'cls':
        console.clear();
        break;

      case 'help':
      case '?':
        this._printHelp();
        break;

      case 'history':
        this.history.forEach((h, i) => console.log(`  ${i + 1}  ${h}`));
        break;

      case 'session':
        console.log(`Session: ${this.sessionId}`);
        break;

      case 'restart':
        this._cmdRestart();
        break;

      case 'daemon':
      case 'd':
        this._cmdDaemonStatus();
        break;

      case 'rate':
        this._cmdRateLimit();
        break;

      case 'config':
        this._cmdConfig();
        break;

      default:
        console.error(`${COLORS.red}Unknown command: /${command}. Try /help${COLORS.reset}`);
    }
  }

  async _cmdStatus() {
    try {
      const status = await this.client.getStatus();
      console.log(`\n${COLORS.bold}HundunOS 状态${COLORS.reset}`);
      console.log(`${'─'.repeat(40)}`);
      console.log(`  Version:    ${status.version || 'unknown'}`);
      console.log(`  Running:     ${status.running ? COLORS.green + 'Yes' + COLORS.reset : COLORS.red + 'No' + COLORS.reset}`);
      console.log(`  Uptime:      ${status.uptime ? (status.uptime / 60).toFixed(1) + 'm' : 'N/A'}`);
      console.log(`  Platform:   ${status.platform || 'unknown'}`);
      console.log(`  Sessions:   ${status.sessions?.active || 0}`);
      console.log(`  ModelRouter:${status.modelRouter ? COLORS.green + 'Active' : COLORS.red + 'Inactive'}`);
    } catch (e) {
      console.error(`${COLORS.red}Error: ${e.message}${COLORS.reset}`);
    }
  }

  async _cmdHealth() {
    try {
      const health = await this.client.getHealth();
      console.log(`\n${COLORS.bold}健康检查${COLORS.reset}`);
      console.log(`${'─'.repeat(40)}`);
      const overall = health.overall?.score || (health.healthy ? 100 : 0);
      const color = overall >= 80 ? COLORS.green : overall >= 60 ? COLORS.yellow : COLORS.red;
      console.log(`  Overall:     ${color}${overall}${COLORS.reset}/100`);
      if (health.dimensions) {
        for (const [dim, info] of Object.entries(health.dimensions)) {
          const score = info.score || 0;
          const c = score >= 80 ? COLORS.green : score >= 60 ? COLORS.yellow : COLORS.red;
          console.log(`  ${dim.padEnd(12)} ${c}${score}${COLORS.reset}`);
        }
      }
    } catch (e) {
      console.error(`${COLORS.red}Error: ${e.message}${COLORS.reset}`);
    }
  }

  async _cmdModules() {
    try {
      const mods = await this.client.getModules();
      console.log(`\n${COLORS.bold}模块列表${COLORS.reset}`);
      console.log(`${'─'.repeat(40)}`);
      const list = mods.modules || mods.list || [];
      for (const mod of list) {
        const status = mod.status === 'active' ? `${COLORS.green}active${COLORS.reset}` : `${COLORS.gray}inactive${COLORS.reset}`;
        console.log(`  ${COLORS.cyan}${mod.id.padEnd(20)}${COLORS.reset} ${status}  ${mod.name || ''}`);
      }
    } catch (e) {
      console.error(`${COLORS.red}Error: ${e.message}${COLORS.reset}`);
    }
  }

  async _cmdAudit(limitStr) {
    try {
      const limit = parseInt(limitStr) || 20;
      const audit = await this.client.getAuditLogs(limit);
      console.log(`\n${COLORS.bold}最近审计日志${COLORS.reset}`);
      console.log(`${'─'.repeat(40)}`);
      const logs = audit.logs || [];
      for (const log of logs.slice(-limit)) {
        const ts = new Date(log.timestamp).toLocaleTimeString();
        console.log(`  ${COLORS.dim}${ts}${COLORS.reset}  ${log.action || log.type}  ${log.intent?.action || ''}`);
      }
    } catch (e) {
      console.error(`${COLORS.red}Error: ${e.message}${COLORS.reset}`);
    }
  }

  async _cmdModelRouter() {
    try {
      const mr = await this.client.getModelRouter();
      console.log(`\n${COLORS.bold}模型路由${COLORS.reset}`);
      console.log(`${'─'.repeat(40)}`);
      console.log(`  Strategy:    ${mr.strategy}`);
      console.log(`  Local First: ${mr.localFirst}`);
      console.log(`  Providers:`);
      for (const p of mr.providers || []) {
        console.log(`    ${COLORS.cyan}${p.name.padEnd(15)}${COLORS.reset} ${p.model}  (${p.type})`);
      }
    } catch (e) {
      console.error(`${COLORS.red}Error: ${e.message}${COLORS.reset}`);
    }
  }

  async _cmdDaemonStatus() {
    try {
      const status = await this.client.getDaemonStatus();
      console.log(`\n${COLORS.bold}守护进程状态${COLORS.reset}`);
      console.log(`${'─'.repeat(40)}`);
      console.log(`  Connected:  ${status.connected ? COLORS.green + 'Yes' : COLORS.red + 'No'}${COLORS.reset}`);
      console.log(`  Host:       ${status.host}:${status.port}`);
    } catch (e) {
      console.error(`${COLORS.red}Error: ${e.message}${COLORS.reset}`);
    }
  }

  async _cmdRateLimit() {
    try {
      const stats = await this.client.getRateLimitStats();
      console.log(`\n${COLORS.bold}限流统计${COLORS.reset}`);
      console.log(`${'─'.repeat(40)}`);
      console.log(JSON.stringify(stats, null, 2));
    } catch (e) {
      console.error(`${COLORS.red}Error: ${e.message}${COLORS.reset}`);
    }
  }

  async _cmdConfig() {
    const config = getConfig();
    console.log(`\n${COLORS.bold}客户端配置${COLORS.reset}`);
    console.log(`${'─'.repeat(40)}`);
    console.log(JSON.stringify(config, null, 2));
  }

  async _cmdRestart() {
    try {
      await this.client.restartKernel();
      console.log(`${COLORS.green}Kernel restart requested${COLORS.reset}`);
    } catch (e) {
      console.error(`${COLORS.red}Error: ${e.message}${COLORS.reset}`);
    }
  }

  _printHelp() {
    console.log(`
${COLORS.bold}HundunOS v3.0 CLI${COLORS.reset}
${'─'.repeat(40)}

${COLORS.bold}消息输入:${COLORS.reset}
  直接输入消息与 HundunOS 对话
  ---     开始多行输入模式 (发送: ---)

${COLORS.bold}元命令:${COLORS.reset}
  /status     /s      系统状态
  /health     /h      健康检查
  /modules    /m      模块列表
  /model              模型路由信息
  /audit [n]  /a [n] 审计日志 (最近n条)
  /daemon     /d     守护进程状态
  /rate               限流统计
  /config             查看客户端配置
  /restart            重启内核
  /clear              清屏
  /history            历史记录
  /help       /?      本帮助
  /exit       /q      退出
`);
  }

  async _showBanner() {
    try {
      const status = await this.client.getStatus();
      console.log();
      console.log(`  ${COLORS.green}╔══════════════════════════════════════╗${COLORS.reset}`);
      console.log(`  ${COLORS.green}║    HundunOS v${status.version || '3.0.0'}${' '.repeat(16)}║${COLORS.reset}`);
      console.log(`  ${COLORS.green}╠══════════════════════════════════════╣${COLORS.reset}`);
      console.log(`  ${COLORS.green}║  ${COLORS.reset}Kernel:    ${status.running ? COLORS.green + 'running' : COLORS.red + 'stopped'}${COLORS.reset}${' '.repeat(12)}║${COLORS.reset}`);
      console.log(`  ${COLORS.green}║  ${COLORS.reset}Uptime:    ${(status.uptime / 60).toFixed(1) + 'm'}${' '.repeat(Math.max(0, 17 - ((status.uptime / 60).toFixed(1) + 'm').length))}║${COLORS.reset}`);
      console.log(`  ${COLORS.green}║  ${COLORS.reset}Platform:  ${status.platform || 'unknown'}${' '.repeat(Math.max(0, 17 - (status.platform || 'unknown').length))}║${COLORS.reset}`);
      console.log(`  ${COLORS.green}╚══════════════════════════════════════╝${COLORS.reset}`);
      console.log();
      console.log(`${COLORS.gray}  Type /help for commands, or just say something!${COLORS.reset}`);
      console.log();
    } catch {
      console.log(`\n  ${COLORS.yellow}HundunOS v3.0.0${COLORS.reset} — connecting...\n`);
    }
  }

  _printSystem(msg) {
    console.log(`\n${msg}\n`);
    if (this.ready) this.rl.prompt();
  }

  _complete(line) {
    const commands = [
      '/status', '/health', '/modules', '/model', '/audit', '/daemon',
      '/rate', '/config', '/restart', '/clear', '/history', '/help', '/exit',
      '/quit',
    ];
    const hits = commands.filter(c => c.startsWith(line.toLowerCase()));
    return [hits.length === 1 && hits[0] === line ? [] : hits, line];
  }
}
