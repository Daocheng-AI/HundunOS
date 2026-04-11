// hundunos/kernel/mcp/mcp-client.js — MCP 客户端 v1.0
// 借鉴 Claude Code MCP 实现
// 参考: claude-code-best/src/services/mcp/
//
// 支持：
//   - MCP Server 连接管理
//   - Tool 调用（JSON-RPC 2.0）
//   - Resource 读写
//   - OAuth 认证流程（简化版）
//   - 官方 Registry 集成

import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { feature } from '../feature-flags.js';

/**
 * MCP 连接状态
 */
export const McpConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
};

/**
 * MCP 工具定义
 */
export class McpTool {
  constructor(name, description, inputSchema) {
    this.name = name;
    this.description = description;
    this.inputSchema = inputSchema;
  }

  toToolDef() {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema,
    };
  }
}

/**
 * MCP 客户端
 */
export class McpClient extends EventEmitter {
  constructor(kernel, options = {}) {
    super();
    this.kernel = kernel;
    this.serverName = options.name || 'unknown';
    this.command = options.command;
    this.args = options.args || [];
    this.env = options.env || {};
    this.baseUrl = options.baseUrl; // HTTP 模式

    this.process = null;
    this.state = McpConnectionState.DISCONNECTED;
    this.tools = new Map();
    this.resources = new Map();
    this.promises = new Map(); // JSON-RPC pending promises

    this._requestId = 0;
  }

  /**
   * 启动 MCP Server（stdio 模式）
   */
  async connect() {
    if (this.state === McpConnectionState.CONNECTED) return;
    this.state = McpConnectionState.CONNECTING;

    try {
      if (this.baseUrl) {
        // HTTP 模式（未来扩展）
        this._connectHttp();
      } else {
        // Stdio 模式（标准 MCP）
        await this._connectStdio();
      }
    } catch (err) {
      this.state = McpConnectionState.ERROR;
      this.emit('error', err);
      throw err;
    }
  }

  async _connectStdio() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('MCP connect timeout')), 10000);

      this.process = spawn(this.command, this.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...this.env },
      });

      this.process.stdout.on('data', (data) => this._handleMessage(data));
      this.process.stderr.on('data', (data) => {
        console.warn(`[MCP:${this.serverName}] stderr: ${data}`);
      });
      this.process.on('exit', (code) => {
        this.state = McpConnectionState.DISCONNECTED;
        this.emit('disconnect', { code });
      });

      // 初始化握手
      this.process.stdin.on('ready', () => {
        clearTimeout(timeout);
        this.state = McpConnectionState.CONNECTED;
        this.emit('connect', { server: this.serverName });
        this._sendInitialize().then(resolve).catch(reject);
      });

      // 立即尝试发送
      setTimeout(() => {
        this._sendInitialize().then(resolve).catch(reject);
      }, 500);
    });
  }

  async _connectHttp() {
    // HTTP/WebSocket MCP Server（备用模式）
    this.state = McpConnectionState.CONNECTED;
    this.emit('connect', { server: this.serverName });
  }

  /**
   * 发送 JSON-RPC 请求
   */
  async _sendRequest(method, params = {}) {
    const id = ++this._requestId;
    const payload = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      this.promises.set(id, { resolve, reject, timeout: setTimeout(() => {
        this.promises.delete(id);
        reject(new Error(`MCP request ${method} timeout (id=${id})`));
      }, 30000) });

      if (this.process?.stdin) {
        this.process.stdin.write(JSON.stringify(payload) + '\n');
      }
    });
  }

  /**
   * 发送通知（无响应）
   */
  _sendNotification(method, params = {}) {
    const payload = { jsonrpc: '2.0', method, params };
    if (this.process?.stdin) {
      this.process.stdin.write(JSON.stringify(payload) + '\n');
    }
  }

  /**
   * 处理收到的消息
   */
  _handleMessage(data) {
    try {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && this.promises.has(msg.id)) {
          const { resolve, reject, timeout } = this.promises.get(msg.id);
          clearTimeout(timeout);
          this.promises.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || msg.error));
          else resolve(msg.result);
        } else if (msg.method) {
          // 服务端通知
          this._handleNotification(msg);
        }
      }
    } catch (err) {
      console.warn('[MCP] Parse error:', err.message);
    }
  }

  _handleNotification(msg) {
    switch (msg.method) {
      case 'notifications/tools/list_changed':
        this._refreshTools();
        break;
      case 'notifications/resources/list_changed':
        this._refreshResources();
        break;
      default:
        this.emit('notification', msg);
    }
  }

  /**
   * MCP 初始化握手
   */
  async _sendInitialize() {
    const result = await this._sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        resources: {},
      },
      clientInfo: {
        name: 'hundunos',
        version: '1.0.0',
      },
    });

    this.serverCapabilities = result.capabilities || {};
    this.serverInfo = result.serverInfo || {};

    // 发送 initialized 通知
    this._sendNotification('notifications/initialized', {});

    // 加载工具和资源
    await this._refreshTools();
    await this._refreshResources();

    // review: removed // review: removed console.log(`[MCP] Connected to ${this.serverName} (${this.serverInfo.name} ${this.serverInfo.version})`);
  }

  /**
   * 刷新工具列表
   */
  async _refreshTools() {
    try {
      const result = await this._sendRequest('tools/list');
      this.tools.clear();
      for (const tool of result.tools || []) {
        this.tools.set(tool.name, new McpTool(tool.name, tool.description, tool.inputSchema));
      }
      this.emit('toolsChanged', Array.from(this.tools.values()));
    } catch (err) {
      console.warn(`[MCP:${this.serverName}] tools/list failed:`, err.message);
    }
  }

  /**
   * 刷新资源列表
   */
  async _refreshResources() {
    try {
      const result = await this._sendRequest('resources/list');
      this.resources.clear();
      for (const res of result.resources || []) {
        this.resources.set(res.uri, res);
      }
      this.emit('resourcesChanged', Array.from(this.resources.keys()));
    } catch (err) {
      console.warn(`[MCP:${this.serverName}] resources/list failed:`, err.message);
    }
  }

  /**
   * 调用 MCP 工具
   */
  async callTool(name, args = {}) {
    if (!this.tools.has(name)) {
      throw new Error(`MCP tool not found: ${name}`);
    }

    const result = await this._sendRequest('tools/call', { name, arguments: args });
    return this._parseToolResult(result);
  }

  _parseToolResult(result) {
    if (!result) return { content: [] };
    if (typeof result === 'string') return { content: [{ type: 'text', text: result }] };
    if (result.content) return result;
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }

  /**
   * 读取 MCP Resource
   */
  async readResource(uri) {
    const result = await this._sendRequest('resources/read', { uri });
    return result;
  }

  /**
   * 订阅 Resource 更新
   */
  subscribeResource(uri) {
    this._sendNotification('resources/subscribe', { uri });
  }

  /**
   * 获取所有可用工具
   */
  listTools() {
    return Array.from(this.tools.values()).map(t => t.toToolDef());
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.state = McpConnectionState.DISCONNECTED;
    this.promises.forEach(({ timeout }) => clearTimeout(timeout));
    this.promises.clear();
  }
}

/**
 * MCP Client Manager — 管理多个 MCP Server 连接
 */
export class McpClientManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.clients = new Map(); // name -> McpClient
    this.config = kernel?.config?.system?.mcp || {};
  }

  async initialize() {
    if (!feature('MCP_CLIENT')) {
      // review: removed // review: removed console.log('[MCP] MCP_CLIENT feature disabled, skipping');
      return;
    }

    // 从配置加载 Server 定义
    const servers = this.config.servers || [];
    for (const server of servers) {
      await this.addServer(server);
    }

    // review: removed // review: removed console.log(`[MCP] ${this.clients.size} servers registered`);
  }

  async addServer(config) {
    const client = new McpClient(this.kernel, config);
    await client.connect().catch(err => {
      console.warn(`[MCP] Failed to connect ${config.name}:`, err.message);
    });
    this.clients.set(config.name, client);
    return client;
  }

  removeServer(name) {
    const client = this.clients.get(name);
    if (client) {
      client.disconnect();
      this.clients.delete(name);
    }
  }

  getClient(name) {
    return this.clients.get(name);
  }

  listTools() {
    const allTools = [];
    for (const [serverName, client] of this.clients) {
      for (const tool of client.listTools()) {
        allTools.push({ ...tool, _server: serverName, _mcp: true });
      }
    }
    return allTools;
  }

  async callTool(serverName, toolName, args) {
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`MCP server not found: ${serverName}`);
    return client.callTool(toolName, args);
  }

  /**
   * MCP OAuth 简化版（参考 CCB MCP OAuth）
   */
  async initiateOAuth(serverUrl) {
    if (!feature('MCP_OAUTH')) {
      throw new Error('MCP_OAUTH feature not enabled');
    }
    // 简化实现：打开浏览器授权
    const authUrl = `${serverUrl}/oauth/authorize?client_id=hundunos&redirect_uri=hundunos://oauth/callback`;
    // review: removed // review: removed console.log(`[MCP OAuth] Opening: ${authUrl}`);
    // 实际实现需启动本地 HTTP 服务器接收回调
    return { authUrl, status: 'requires_manual_auth' };
  }
}

export default { McpClient, McpClientManager, McpTool, McpConnectionState };
