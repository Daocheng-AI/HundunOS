/**
 * hundunos-client/daemon/daemon.js
 * 守护进程核心 — HundunOS 后台服务
 *
 * 职责:
 * 1. 启动/管理 HundunOS 内核进程
 * 2. 提供 IPC 服务器 (TCP Socket, port 38081)
 * 3. 心跳健康检测 + 自动重启
 * 4. 日志聚合
 * 5. 事件推送 (SSE / WebSocket)
 */

import { spawn, execSync } from 'child_process';
import { createServer } from 'net';
import { createServer as createHttpServer } from 'http';
import { EventEmitter } from 'events';
import { existsSync, mkdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from '../lib/config.js';
import { logger } from '../lib/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Daemon 类 ───────────────────────────────────────────────────────────────

export class HundunOSDaemon extends EventEmitter {
  constructor() {
    super();
    this.config = getConfig();
    this.kernelProcess = null;
    this.kernelStatus = 'stopped';   // stopped | starting | running | error | restarting
    this.kernelPid = null;
    this.restarts = 0;
    this.lastError = null;
    this.lastHealth = null;
    this.startTime = null;
    this.ipcServer = null;
    this.httpApiServer = null;
    this.sseClients = new Set();
    this.healthCheckTimer = null;
    this.running = false;
  }

  // ─── 生命周期 ────────────────────────────────────────────────────────────

  async start() {
    if (this.running) {
      logger.warn('[Daemon] Already running');
      return;
    }

    this.running = true;
    logger.divider('HundunOS v3.0 Daemon');

    // 1. IPC 服务器
    await this._startIpcServer();

    // 2. HTTP API 服务器 (可选)
    if (this.config.api.enabled) {
      await this._startHttpApi();
    }

    // 3. 启动内核
    await this._startKernel();

    // 4. 心跳监控
    this._startHealthCheck();

    // 5. 信号处理
    this._setupSignalHandlers();

    logger.success('[Daemon] All systems online');
    this._broadcast('daemon_ready', { pid: process.pid, startTime: this.startTime });
  }

  async stop() {
    if (!this.running) return;
    this.running = false;

    logger.system('[Daemon] Shutting down...');

    // 停止心跳
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // 停止内核
    await this._stopKernel();

    // 关闭 IPC
    if (this.ipcServer) {
      await new Promise(res => this.ipcServer.close(res));
    }

    // 关闭 HTTP API
    if (this.httpApiServer) {
      await new Promise(res => this.httpApiServer.close(res));
    }

    logger.success('[Daemon] Shutdown complete');
  }

  // ─── 内核管理 ────────────────────────────────────────────────────────────

  async _startKernel() {
    this.kernelStatus = 'starting';
    const kernelPath = resolve(this.config.kernel.projectRoot, 'kernel', 'core.js');

    if (!existsSync(kernelPath)) {
      throw new Error(`Kernel not found: ${kernelPath}`);
    }

    logger.info(`[Daemon] Starting kernel from: ${kernelPath}`);

    // 设置环境变量
    const env = {
      ...process.env,
      HUNDUNOS_PROJECT_ROOT: resolve(this.config.kernel.projectRoot),
      NODE_ENV: process.env.NODE_ENV || 'development',
      PORT: String(this.config.kernel.port),
    };

    this.kernelProcess = spawn(process.execPath, [kernelPath], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      windowsHide: true,
    });

    this.kernelPid = this.kernelProcess.pid;
    this.startTime = Date.now();

    // 捕获 stdout
    this.kernelProcess.stdout?.on('data', (chunk) => {
      const line = chunk.toString().trim();
      if (line) logger.info(`[Kernel] ${line}`);
    });

    // 捕获 stderr
    this.kernelProcess.stderr?.on('data', (chunk) => {
      const line = chunk.toString().trim();
      if (line) logger.warn(`[Kernel] ${line}`);
    });

    this.kernelProcess.on('exit', (code, signal) => {
      this.kernelStatus = code === 0 ? 'stopped' : 'error';
      this.lastError = `Kernel exited with code ${code}, signal ${signal}`;
      logger.error(`[Daemon] Kernel exited: ${this.lastError}`);
      this._broadcast('kernel_exit', { code, signal, pid: this.kernelPid });
      this.kernelProcess = null;
      this.kernelPid = null;

      // 自动重启逻辑
      if (this.running && this.config.daemon.restartOnCrash) {
        this._handleCrash();
      }
    });

    this.kernelProcess.on('error', (err) => {
      this.kernelStatus = 'error';
      this.lastError = err.message;
      logger.error(`[Daemon] Kernel process error: ${err.message}`);
      this._broadcast('kernel_error', { error: err.message });
    });

    // 等待内核就绪
    await this._waitForKernelReady();

    this.kernelStatus = 'running';
    this.restarts = 0;
    logger.success(`[Daemon] Kernel running (PID: ${this.kernelPid})`);
    this._broadcast('kernel_ready', { pid: this.kernelPid });
  }

  async _waitForKernelReady(timeout = 30000) {
    const start = Date.now();
    const kernelUrl = `http://127.0.0.1:${this.config.kernel.port}/health`;

    while (Date.now() - start < timeout) {
      try {
        const res = await fetch(kernelUrl);
        if (res.ok) return;
      } catch {
        // 还没启动
      }
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('Kernel failed to become ready within timeout');
  }

  async _stopKernel() {
    if (!this.kernelProcess) return;

    const pid = this.kernelPid;
    logger.info(`[Daemon] Stopping kernel (PID: ${pid})...`);

    try {
      // 先尝试优雅关闭
      try {
        await fetch(`http://127.0.0.1:${this.config.kernel.port}/api/shutdown`, {
          method: 'POST',
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        // 忽略关闭请求失败
      }

      // 强制杀死
      this.kernelProcess.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 2000));

      if (!this.kernelProcess.killed) {
        this.kernelProcess.kill('SIGKILL');
      }
    } catch (e) {
      logger.warn(`[Daemon] Error stopping kernel: ${e.message}`);
    }

    this.kernelProcess = null;
    this.kernelPid = null;
    this.kernelStatus = 'stopped';
  }

  async _handleCrash() {
    this.restarts++;
    const maxRetries = this.config.daemon.maxRetries;

    if (this.restarts > maxRetries) {
      logger.error(`[Daemon] Max restarts (${maxRetries}) reached. Giving up.`);
      this.kernelStatus = 'error';
      this._broadcast('kernel_giveup', { restarts: this.restarts, lastError: this.lastError });
      return;
    }

    const backoff = Math.min(1000 * Math.pow(2, this.restarts - 1), 30000);
    logger.warn(`[Daemon] Restarting kernel in ${backoff}ms (attempt ${this.restarts}/${maxRetries})...`);

    this.kernelStatus = 'restarting';
    this._broadcast('kernel_restarting', { attempt: this.restarts, backoff });

    await new Promise(r => setTimeout(r, backoff));
    await this._startKernel();
  }

  // ─── IPC 服务器 ─────────────────────────────────────────────────────────

  async _startIpcServer() {
    const port = this.config.daemon.ipcPort;

    this.ipcServer = createServer((socket) => {
      logger.debug(`[IPC] Client connected: ${socket.remoteAddress}`);

      let buffer = '';
      socket.setKeepAlive(true, 5000);

      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            this._handleIpcRequest(socket, msg);
          } catch (e) {
            this._send(socket, { id: null, error: 'Invalid JSON' });
          }
        }
      });

      socket.on('error', (err) => {
        logger.debug(`[IPC] Client error: ${err.message}`);
      });

      socket.on('close', () => {
        logger.debug('[IPC] Client disconnected');
      });
    });

    this.ipcServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`[IPC] Port ${port} already in use. Is another daemon running?`);
      } else {
        logger.error(`[IPC] Server error: ${err.message}`);
      }
    });

    await new Promise((res, rej) => {
      this.ipcServer.listen(port, '127.0.0.1', () => {
        logger.success(`[IPC] Listening on 127.0.0.1:${port}`);
        res();
      });
      this.ipcServer.on('error', rej);
    });
  }

  async _handleIpcRequest(socket, msg) {
    const { id, method, params = {} } = msg;

    const send = (data) => this._send(socket, { id, ...data });

    try {
      switch (method) {
        case 'ping':
          send({ ok: true, data: { pong: true, uptime: process.uptime() } });
          break;

        case 'status':
          send({ ok: true, data: this._getDaemonStatus() });
          break;

        case 'kernel:status':
          await this._kernelApiRequest('/api/status', send);
          break;

        case 'process':
          await this._kernelApiRequest('/api/process', send, 'POST', params);
          break;

        case 'modules':
          await this._kernelApiRequest('/api/modules', send);
          break;

        case 'health':
          await this._kernelApiRequest('/api/health', send);
          break;

        case 'modelRouter':
          await this._kernelApiRequest('/api/model-router', send);
          break;

        case 'audit':
          await this._kernelApiRequest('/api/audit', send);
          break;

        case 'rateLimit':
          await this._kernelApiRequest('/api/rate-limit/stats', send);
          break;

        case 'intents':
          await this._kernelApiRequest('/api/intents', send);
          break;

        case 'intents:reload':
          await this._kernelApiRequest('/api/intents/reload', send, 'POST');
          break;

        case 'clientAdapters':
          await this._kernelApiRequest('/api/client-adapters', send);
          break;

        case 'shutdown':
          send({ ok: true, data: { message: 'Daemon shutting down' } });
          this._broadcast('daemon_shutdown', {});
          setTimeout(() => this.stop(), 500);
          break;

        case 'restartKernel':
          await this._stopKernel();
          await this._startKernel();
          send({ ok: true, data: { message: 'Kernel restarted' } });
          break;

        case 'daemon:subscribe':
          // SSE-style: 将 socket 加入广播列表
          this.sseClients.add(socket);
          send({ ok: true, data: { subscribed: true } });
          break;

        default:
          send({ ok: false, error: `Unknown method: ${method}` });
      }
    } catch (e) {
      send({ ok: false, error: e.message });
    }
  }

  _send(socket, msg) {
    try {
      socket.write(JSON.stringify(msg) + '\n');
    } catch (e) {
      // socket 可能已关闭
    }
  }

  _broadcast(event, data) {
    const msg = JSON.stringify({ event, data, broadcast: true }) + '\n';
    for (const client of this.sseClients) {
      try {
        client.write(msg);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  // ─── HTTP API 服务器 (对外暴露) ─────────────────────────────────────────

  async _startHttpApi() {
    const port = this.config.api.port;

    this.httpApiServer = createHttpServer(async (req, res) => {
      // CORS
      if (this.config.api.cors) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      }

      // API Key 认证
      if (this.config.api.apiKeys?.length > 0) {
        const key = req.headers['x-api-key'];
        if (!key || !this.config.api.apiKeys.includes(key)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
      }

      const url = new URL(req.url, `http://localhost`);
      const path = url.pathname;

      // 健康检查
      if (path === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this._getDaemonStatus()));
        return;
      }

      // SSE 事件流
      if (path === '/v1/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        res.write(`event: ping\ndata: ${JSON.stringify({ time: Date.now() })}\n\n`);
        this.sseClients.add(res);
        req.on('close', () => this.sseClients.delete(res));
        return;
      }

      // 代理到内核
      const kernelPath = path.replace('/v1', '/api');
      await this._proxyToKernel(req, res, kernelPath);
    });

    await new Promise((res, rej) => {
      this.httpApiServer.listen(port, () => {
        logger.success(`[HTTP API] Listening on http://127.0.0.1:${port}`);
        res();
      });
      this.httpApiServer.on('error', rej);
    });
  }

  async _proxyToKernel(req, res, kernelPath) {
    const kernelPort = this.config.kernel.port;
    const kernelUrl = `http://127.0.0.1:${kernelPort}${kernelPath}`;

    try {
      const body = req.method !== 'GET' ? await this._readBody(req) : null;

      const opts = {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.config.kernel.apiKey || '',
        },
      };
      if (body) opts.body = body;

      const response = await fetch(kernelUrl, opts);
      const data = await response.json();

      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Kernel unreachable', message: e.message }));
    }
  }

  _readBody(req, maxBytes = 2 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
      let size = 0, data = '';
      req.on('data', chunk => {
        size += chunk.length;
        if (size > maxBytes) return reject(new Error('Body too large'));
        data += chunk;
      });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }

  async _kernelApiRequest(path, send, method = 'GET', params = null) {
    const kernelPort = this.config.kernel.port;
    const url = `http://127.0.0.1:${kernelPort}${path}`;

    try {
      const opts = {
        method,
        headers: { 'Content-Type': 'application/json', 'X-API-Key': this.config.kernel.apiKey || '' },
      };
      if (params) opts.body = JSON.stringify(params);

      const res = await fetch(url, opts);
      const data = await res.json();
      send({ ok: true, data });
    } catch (e) {
      send({ ok: false, error: `Kernel unreachable: ${e.message}` });
    }
  }

  // ─── 健康检查 ────────────────────────────────────────────────────────────

  _startHealthCheck() {
    const interval = this.config.daemon.heartbeatInterval;

    this.healthCheckTimer = setInterval(async () => {
      if (this.kernelStatus !== 'running') return;

      try {
        const res = await fetch(`http://127.0.0.1:${this.config.kernel.port}/health`);
        const health = await res.json();
        this.lastHealth = health;

        if (!health.healthy && health.healthy !== undefined) {
          logger.warn('[Daemon] Kernel health check failed');
          this._broadcast('health_degraded', health);
        }
      } catch (e) {
        // 内核无响应
        logger.error(`[Daemon] Kernel unreachable: ${e.message}`);
        if (this.kernelProcess && this.kernelProcess.exitCode !== null) {
          // 内核已崩溃
          this._handleCrash();
        }
      }
    }, interval);

    logger.info(`[Daemon] Health check started (every ${interval}ms)`);
  }

  // ─── 信号处理 ────────────────────────────────────────────────────────────

  _setupSignalHandlers() {
    process.on('SIGINT', async () => {
      logger.system('[Daemon] SIGINT received');
      await this.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.system('[Daemon] SIGTERM received');
      await this.stop();
      process.exit(0);
    });

    process.on('uncaughtException', async (err) => {
      logger.error(`[Daemon] Uncaught exception: ${err.message}`);
      await this.stop();
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      logger.error(`[Daemon] Unhandled rejection: ${reason}`);
    });
  }

  // ─── 状态 ────────────────────────────────────────────────────────────────

  _getDaemonStatus() {
    return {
      version: '3.0.0',
      running: this.running,
      uptime: this.startTime ? (Date.now() - this.startTime) / 1000 : 0,
      kernel: {
        status: this.kernelStatus,
        pid: this.kernelPid,
        port: this.config.kernel.port,
        restarts: this.restarts,
        lastError: this.lastError,
      },
      health: this.lastHealth,
      ipc: {
        port: this.config.daemon.ipcPort,
        clients: this.sseClients.size,
      },
      api: {
        port: this.config.api.enabled ? this.config.api.port : null,
      },
    };
  }
}
