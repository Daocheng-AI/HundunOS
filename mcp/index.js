/**
 * HundunOS v4.3 - MCP 插件系统
 * 参考 learn-claude-code s19 MCP Plugins
 * 实现 MCP 服务器连接器和工具加载
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * MCP 客户端管理器
 */
export class McpClientManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.clients = new Map(); // serverName -> McpClient
    this.tools = new Map(); // toolName -> { serverName, tool }
    this.configDir = join(kernel?.config?.storageDir || '.hundunos', 'mcp');
  }

  async initialize() {
    // 加载 MCP 配置
    await this.loadConfig();
  }

  async loadConfig() {
    const fs = require('fs');
    const configPath = join(this.configDir, 'config.json');
    
    if (!existsSync(configPath)) {
      return;
    }

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      for (const [serverName, serverConfig] of Object.entries(config.mcpServers || {})) {
        await this.connectServer(serverName, serverConfig);
      }
    } catch (e) {
      console.warn('[McpClientManager] Failed to load config:', e.message);
    }
  }

  async connectServer(serverName, config) {
    const client = new McpClient(serverName, config);
    await client.connect();
    
    this.clients.set(serverName, client);
    
    // 注册工具
    const tools = await client.listTools();
    for (const tool of tools) {
      const toolName = `${serverName}/${tool.name}`;
      this.tools.set(toolName, {
        serverName,
        tool,
      });
    }
  }

  async callTool(toolName, args) {
    const toolInfo = this.tools.get(toolName);
    if (!toolInfo) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    const client = this.clients.get(toolInfo.serverName);
    if (!client) {
      throw new Error(`Server not connected: ${toolInfo.serverName}`);
    }

    return await client.callTool(toolInfo.tool.name, args);
  }

  listTools() {
    return Array.from(this.tools.values()).map(t => ({
      name: `${t.serverName}/${t.tool.name}`,
      description: t.tool.description,
      inputSchema: t.tool.inputSchema,
    }));
  }
}

/**
 * MCP 客户端
 */
class McpClient {
  constructor(serverName, config) {
    this.serverName = serverName;
    this.config = config;
    this.process = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
  }

  async connect() {
    const command = this.config.command || 'npx';
    const args = this.config.args || [];

    this.process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout.on('data', (data) => {
      this.handleResponse(JSON.parse(data.toString()));
    });

    this.process.stderr.on('data', (data) => {
      console.error(`[MCP:${this.serverName}]`, data.toString());
    });

    // 初始化
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'hundunos',
        version: '4.3.0',
      },
    });

    await this.sendNotification('notifications/initialized');
  }

  async sendRequest(method, params) {
    const requestId = ++this.requestId;
    const request = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
      this.process.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  sendNotification(method, params) {
    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    };
    this.process.stdin.write(JSON.stringify(notification) + '\n');
  }

  handleResponse(response) {
    const { id, result, error } = response;
    const pending = this.pendingRequests.get(id);
    
    if (pending) {
      this.pendingRequests.delete(id);
      if (error) {
        pending.reject(error);
      } else {
        pending.resolve(result);
      }
    }
  }

  async listTools() {
    const result = await this.sendRequest('tools/list', {});
    return result.tools || [];
  }

  async callTool(toolName, args) {
    const result = await this.sendRequest('tools/call', {
      name: toolName,
      arguments: args,
    });
    
    if (result.isError) {
      throw new Error(result.content[0]?.text || 'Tool call failed');
    }

    return result.content[0]?.text || '';
  }

  async close() {
    if (this.process) {
      this.process.kill();
    }
  }
}

export default McpClientManager;
