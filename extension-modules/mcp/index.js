/**
 * HundunOS v3.0 - MCP Server Extension
 * MCP 协议服务扩展
 * 
 * 功能:
 * - MCP 协议实现
 * - 工具注册与调用
 * - 资源管理
 */

import { EventEmitter } from 'events';
import { createServer } from 'net';

// ============================================================================
// MCP 类型定义
// ============================================================================

export const MCPMethod = {
    INITIALIZE:    'initialize',
    TOOLS_LIST:    'tools/list',
    TOOLS_CALL:    'tools/call',
    RESOURCES_LIST: 'resources/list',
    RESOURCES_READ: 'resources/read',
    PROMPTS_LIST:  'prompts/list',
    PROMPTS_GET:   'prompts/get',
    SHUTDOWN:      'shutdown'
};

/**
 * MCP 状态
 */
export const MCPState = {
    STOPPED:   'stopped',
    STARTING:  'starting',
    RUNNING:   'running',
    ERROR:     'error'
};

// ============================================================================
// MCP Tool
// ============================================================================

export class MCPTool {
    constructor(config) {
        this.name = config.name;
        this.description = config.description || '';
        this.inputSchema = config.inputSchema || { type: 'object' };
        this.handler = config.handler;
        this.annotations = config.annotations || {};
    }

    async execute(args) {
        if (!this.handler) {
            throw new Error(`Tool ${this.name} has no handler`);
        }
        return this.handler(args);
    }

    toJSON() {
        return {
            name: this.name,
            description: this.description,
            inputSchema: this.inputSchema
        };
    }
}

// ============================================================================
// MCP Server Extension
// ============================================================================

export class MCPExtension extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            port: config.port || 28790,
            host: config.host || 'localhost',
            name: config.name || 'HundunOS-MCP',
            version: config.version || '3.0.0',
            ...config
        };

        this.state = MCPState.STOPPED;
        this.server = null;
        this.clients = new Set();
        this.tools = new Map();
        this.resources = new Map();
        this.prompts = new Map();

        this._registerDefaultTools();

        // review: removed // review: removed console.log('[MCP] Extension initialized');
    }

    // ========================================================================
    // 服务管理
    // ========================================================================

    /**
     * 启动 MCP 服务
     */
    async start() {
        if (this.state === MCPState.RUNNING) {
            return { alreadyRunning: true };
        }

        this.state = MCPState.STARTING;

        return new Promise((resolve, reject) => {
            this.server = createServer((socket) => {
                this._handleConnection(socket);
            });

            this.server.on('error', (err) => {
                this.state = MCPState.ERROR;
                this.emit('error', err);
                reject(err);
            });

            this.server.listen(this.config.port, this.config.host, () => {
                this.state = MCPState.RUNNING;
                // review: removed // review: removed console.log(`[MCP] Server listening on ${this.config.host}:${this.config.port}`);
                this.emit('started');
                resolve({ started: true, port: this.config.port });
            });
        });
    }

    /**
     * 停止 MCP 服务
     */
    async stop() {
        if (this.state === MCPState.STOPPED) {
            return { alreadyStopped: true };
        }

        return new Promise((resolve) => {
            // 关闭所有客户端
            for (const client of this.clients) {
                client.destroy();
            }
            this.clients.clear();

            if (this.server) {
                this.server.close(() => {
                    this.state = MCPState.STOPPED;
                    // review: removed // review: removed console.log('[MCP] Server stopped');
                    this.emit('stopped');
                    resolve({ stopped: true });
                });
            } else {
                this.state = MCPState.STOPPED;
                resolve({ stopped: true });
            }
        });
    }

    /**
     * 获取状态
     */
    getStatus() {
        return {
            state: this.state,
            port: this.config.port,
            clients: this.clients.size,
            tools: this.tools.size,
            resources: this.resources.size,
            prompts: this.prompts.size
        };
    }

    // ========================================================================
    // 工具管理
    // ========================================================================

    /**
     * 注册工具
     */
    registerTool(tool) {
        if (!(tool instanceof MCPTool)) {
            tool = new MCPTool(tool);
        }
        this.tools.set(tool.name, tool);
        // review: removed // review: removed console.log(`[MCP] Tool registered: ${tool.name}`);
        this.emit('tool_registered', { name: tool.name });
        return tool;
    }

    /**
     * 注销工具
     */
    unregisterTool(name) {
        const removed = this.tools.delete(name);
        if (removed) {
            this.emit('tool_unregistered', { name });
        }
        return removed;
    }

    /**
     * 获取工具列表
     */
    listTools() {
        return Array.from(this.tools.values()).map(t => t.toJSON());
    }

    /**
     * 调用工具
     */
    async callTool(name, args = {}) {
        const tool = this.tools.get(name);
        if (!tool) {
            throw new Error(`Tool not found: ${name}`);
        }
        return tool.execute(args);
    }

    // ========================================================================
    // 资源管理
    // ========================================================================

    /**
     * 注册资源
     */
    registerResource(uri, resource) {
        this.resources.set(uri, {
            uri,
            name: resource.name,
            description: resource.description,
            mimeType: resource.mimeType || 'text/plain',
            content: resource.content
        });
        // review: removed // review: removed console.log(`[MCP] Resource registered: ${uri}`);
        return resource;
    }

    /**
     * 获取资源列表
     */
    listResources() {
        return Array.from(this.resources.values()).map(r => ({
            uri: r.uri,
            name: r.name,
            description: r.description,
            mimeType: r.mimeType
        }));
    }

    /**
     * 读取资源
     */
    readResource(uri) {
        const resource = this.resources.get(uri);
        if (!resource) {
            throw new Error(`Resource not found: ${uri}`);
        }
        return {
            uri,
            mimeType: resource.mimeType,
            text: resource.content
        };
    }

    // ========================================================================
    // 内部方法
    // ========================================================================

    _registerDefaultTools() {
        // 系统工具
        this.registerTool({
            name: 'system_status',
            description: '获取系统状态',
            handler: async () => ({
                status: 'ok',
                uptime: process.uptime(),
                memory: process.memoryUsage()
            })
        });

        this.registerTool({
            name: 'health_check',
            description: '健康检查',
            handler: async () => ({
                healthy: true,
                timestamp: new Date().toISOString()
            })
        });

        this.registerTool({
            name: 'list_tools',
            description: '列出所有可用工具',
            handler: async () => this.listTools()
        });
    }

    _handleConnection(socket) {
        this.clients.add(socket);
        // review: removed // review: removed console.log(`[MCP] Client connected, total: ${this.clients.size}`);

        let buffer = '';

        socket.on('data', (data) => {
            buffer += data.toString();
            buffer = this._processBuffer(socket, buffer);
        });

        socket.on('close', () => {
            this.clients.delete(socket);
            // review: removed // review: removed console.log(`[MCP] Client disconnected, total: ${this.clients.size}`);
        });

        socket.on('error', (err) => {
            console.error('[MCP] Client error:', err.message);
            this.clients.delete(socket);
        });
    }

    _processBuffer(socket, buffer) {
        // 简化的 JSON-RPC 处理
        try {
            const lines = buffer.split('\n');
            let remaining = '';
            
            // 保留最后一行（可能不完整）
            for (let i = 0; i < lines.length - 1; i++) {
                const line = lines[i];
                if (!line.trim()) continue;
                try {
                    const request = JSON.parse(line);
                    this._handleRequest(socket, request);
                } catch (e) {
                    // 不完整的 JSON，跳过
                }
            }
            
            // 最后一行可能是残片，保留给下次
            const lastLine = lines[lines.length - 1];
            if (lastLine.trim()) {
                remaining = lastLine;
            }
            
            return remaining;
        } catch (err) {
            console.error('[MCP] Buffer processing error:', err.message);
            return '';
        }
    }

    async _handleRequest(socket, request) {
        const { id, method, params } = request;

        try {
            let result;

            switch (method) {
                case MCPMethod.INITIALIZE:
                    result = {
                        protocolVersion: '2024-11-05',
                        capabilities: {
                            tools: {},
                            resources: {}
                        },
                        serverInfo: {
                            name: this.config.name,
                            version: this.config.version
                        }
                    };
                    break;

                case MCPMethod.TOOLS_LIST:
                    result = { tools: this.listTools() };
                    break;

                case MCPMethod.TOOLS_CALL:
                    result = await this.callTool(params.name, params.arguments);
                    break;

                case MCPMethod.RESOURCES_LIST:
                    result = { resources: this.listResources() };
                    break;

                case MCPMethod.RESOURCES_READ:
                    result = { contents: [this.readResource(params.uri)] };
                    break;

                default:
                    throw new Error(`Unknown method: ${method}`);
            }

            socket.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
        } catch (error) {
            socket.write(JSON.stringify({
                jsonrpc: '2.0',
                id,
                error: { code: -32603, message: error.message }
            }) + '\n');
        }
    }
}

// ============================================================================
// 单例
// ============================================================================

let instance = null;

export function getMCPExtension() {
    if (!instance) {
        instance = new MCPExtension();
    }
    return instance;
}

export default {
    MCPExtension,
    getMCPExtension,
    MCPTool,
    MCPMethod,
    MCPState
};
