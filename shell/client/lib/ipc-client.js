/**
 * hundunos-client/lib/ipc-client.js
 * IPC 客户端 — 通过 TCP Socket 与守护进程通信
 * 同时支持 HTTP 兼容模式 (当守护进程提供 HTTP 代理时)
 */

import net from 'net';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger.js';
import { getConfig } from './config.js';

export class IpcClient extends EventEmitter {
  constructor() {
    super();
    this.config = getConfig();
    this.host = '127.0.0.1';
    this.port = this.config.daemon.ipcPort;
    this.socket = null;
    this.connected = false;
    this.pendingRequests = new Map();
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.reconnectTimer = null;
    this._connect();
  }

  _connect() {
    this.socket = net.createConnection({ host: this.host, port: this.port }, () => {
      this.connected = true;
      this.reconnectDelay = 1000;
      logger.success(`[IPC] Connected to daemon at ${this.host}:${this.port}`);
      this.emit('connected');
    });

    // 设置 keep-alive
    this.socket.setKeepAlive(true, 5000);

    let buffer = '';
    this.socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留不完整的行

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          this._handleMessage(msg);
        } catch (e) {
          // 可能是不完整的 JSON，忽略
        }
      }
    });

    this.socket.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        logger.warn(`[IPC] Daemon not running at ${this.host}:${this.port} — retrying in ${this.reconnectDelay}ms`);
      } else {
        logger.error(`[IPC] Socket error: ${err.message}`);
      }
      this._scheduleReconnect();
    });

    this.socket.on('close', () => {
      this.connected = false;
      this.emit('disconnected');
      this._scheduleReconnect();
    });

    this.socket.on('timeout', () => {
      logger.warn('[IPC] Connection timeout, reconnecting...');
      this.socket.destroy();
    });
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
      this._connect();
    }, this.reconnectDelay);
  }

  _handleMessage(msg) {
    // 事件推送 (server → client)
    if (msg.event) {
      this.emit('event', msg.event, msg.data);
      this.emit(`event:${msg.event}`, msg.data);
      return;
    }

    // 响应 (reply to a request)
    if (msg.id && this.pendingRequests.has(msg.id)) {
      const { resolve, reject, timer } = this.pendingRequests.get(msg.id);
      clearTimeout(timer);
      this.pendingRequests.delete(msg.id);
      if (msg.error) {
        reject(new Error(msg.error));
      } else {
        resolve(msg);
      }
    }

    // 广播
    if (msg.broadcast) {
      this.emit('broadcast', msg);
    }
  }

  _send(obj) {
    if (!this.connected || !this.socket) {
      throw new Error('Not connected to daemon');
    }
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const payload = { ...obj, id };

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${obj.method}`));
      }, 30000);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.socket.write(JSON.stringify(payload) + '\n');
    });
  }

  // ─── Public API ────────────────────────────────────────────────

  async call(method, params = {}) {
    if (!this.connected) {
      throw new Error('Not connected to daemon');
    }
    try {
      const result = await this._send({ method, params });
      return result.data;
    } catch (e) {
      logger.error(`[IPC] call(${method}) failed: ${e.message}`);
      throw e;
    }
  }

  // 发送消息给内核处理
  async process(message, options = {}) {
    return this.call('process', { message, ...options });
  }

  // 获取内核状态
  async getStatus() {
    return this.call('status');
  }

  // 获取模块信息
  async getModules() {
    return this.call('modules');
  }

  // 获取健康状态
  async getHealth() {
    return this.call('health');
  }

  // 获取模型路由信息
  async getModelRouter() {
    return this.call('modelRouter');
  }

  // 获取审计日志
  async getAuditLogs(limit = 50) {
    return this.call('audit', { limit });
  }

  // 获取限流统计
  async getRateLimitStats() {
    return this.call('rateLimit');
  }

  // 关闭守护进程
  async shutdown() {
    return this.call('shutdown');
  }

  // 重启内核
  async restartKernel() {
    return this.call('restartKernel');
  }

  // 激活/停用模块
  async toggleModule(moduleId, active) {
    return this.call('toggleModule', { moduleId, active });
  }

  // 获取守护进程自身状态
  async getDaemonStatus() {
    return {
      connected: this.connected,
      host: this.host,
      port: this.port,
      pendingRequests: this.pendingRequests.size,
    };
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
  }
}

// 便捷的 HTTP 模式客户端 (备选，当 IPC 不可用时直连内核)
export class HttpClient {
  constructor(port = 38080, apiKey = '') {
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.apiKey = apiKey;
  }

  async _fetch(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {}),
      ...options.headers,
    };

    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${body}`);
    }
    return res.json();
  }

  async process(input) {
    return this._fetch('/api/process', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async getStatus() {
    return this._fetch('/api/status');
  }

  async getModules() {
    return this._fetch('/api/modules');
  }

  async getHealth() {
    return this._fetch('/api/health');
  }

  async getModelRouter() {
    return this._fetch('/api/model-router');
  }

  async getAuditLogs() {
    return this._fetch('/api/audit');
  }

  async getRateLimitStats() {
    return this._fetch('/api/rate-limit/stats');
  }
}
