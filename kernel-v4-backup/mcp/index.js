// hundunos/kernel/mcp/index.js — MCP 模块导出
export { McpClient, McpClientManager, McpTool, McpConnectionState } from './mcp-client.js';
// 默认导出 McpClientManager
import { McpClientManager } from './mcp-client.js';
export default McpClientManager;
