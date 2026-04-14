/**
 * hundunos-client/lib/logger.js
 * 彩色日志工具 — 同时输出到控制台和文件
 */

import { createWriteStream, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const COLORS = {
  debug: '\x1b[36m',   // cyan
  info: '\x1b[32m',    // green
  warn: '\x1b[33m',    // yellow
  error: '\x1b[31m',   // red
  system: '\x1b[35m',  // magenta
  success: '\x1b[92m', // bright green
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

class Logger {
  constructor(prefix = 'HundunOS') {
    this.prefix = prefix;
    this.level = process.env.LOG_LEVEL || 'info';
    this.logDir = join(__dirname, '..', 'logs');
    this.logFile = join(this.logDir, `hundunos-${new Date().toISOString().slice(0, 10)}.log`);
  }

  _ensureLogDir() {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }

  _formatTime() {
    return new Date().toISOString().slice(11, 23);
  }

  _write(level, color, tag, ...args) {
    if (LEVELS[level] < LEVELS[this.level]) return;

    const ts = this._formatTime();
    const prefix = `${COLORS[color]}[${ts}] ${tag}${COLORS.reset}`;
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');

    const colored = `${prefix} ${msg}`;
    const plain = `[${ts}] [${level.toUpperCase()}] [${this.prefix}] ${tag}: ${msg}`;

    // console.log(colored);

    // 写入文件
    try {
      this._ensureLogDir();
      appendFileSync(this.logFile, plain + '\n', 'utf8');
    } catch (e) {
      // 静默失败
    }
  }

  debug(...args) { this._write('debug', 'debug', 'DEBUG', ...args); }
  info(...args) { this._write('info', 'info', 'INFO', ...args); }
  warn(...args) { this._write('warn', 'warn', 'WARN', ...args); }
  error(...args) { this._write('error', 'error', 'ERROR', ...args); }
  system(...args) { this._write('info', 'system', 'SYSTEM', ...args); }
  success(...args) { this._write('info', 'success', 'OK', ...args); }

  // 分隔线
  divider(title = '') {
    const line = '─'.repeat(50);
    if (title) {
      // console.log(`\n${COLORS.bold}${line}\n  ${title}\n${line}${COLORS.reset}\n`);
    } else {
      // console.log(`\n${line}\n`);
    }
  }

  // 状态表格
  statusTable(rows) {
    for (const [key, val] of rows) {
      const color = val === 'running' || val === 'active' ? 'success'
        : val === 'stopped' || val === 'error' ? 'error'
        : 'info';
      // console.log(`  ${COLORS.bold}${key.padEnd(20)}${COLORS.reset} ${COLORS[color]}${val}${COLORS.reset}`);
    }
  }
}

export const logger = new Logger();
export { Logger };
