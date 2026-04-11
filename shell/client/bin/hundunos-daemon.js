#!/usr/bin/env node
/**
 * hundunos-daemon — 守护进程入口
 * 用法: node bin/hundunos-daemon.js
 *        npm start
 *        hundunos-daemon
 */

import { HundunOSDaemon } from '../daemon/daemon.js';
import { logger } from '../lib/logger.js';
import { getConfig } from '../lib/config.js';

async function main() {
  const config = getConfig();

  logger.divider('HundunOS v3.0 守护进程');
  logger.system(`配置目录: ${config._configPath || 'default'}`);
  logger.system(`日志级别: ${config.daemon.logLevel}`);
  logger.system(`IPC 端口: ${config.daemon.ipcPort}`);
  logger.system(`API 端口: ${config.api.enabled ? config.api.port : 'disabled'}`);
  logger.system(`内核端口: ${config.kernel.port}`);
  console.log();

  const daemon = new HundunOSDaemon();

  // 致命错误处理
  daemon.on('error', (err) => {
    logger.error('[Daemon] Fatal error:', err.message);
  });

  try {
    await daemon.start();
  } catch (e) {
    logger.error(`[Daemon] Failed to start: ${e.message}`);
    process.exit(1);
  }
}

main();
