// adapters/rust-modules/tool-bridge.js
// HundunOS Tool Bridge Adapter v1.0
// 统一适配层：从 kernel/tool-bridge-rust.js 迁移而来

export class ToolBridgeAdapter {
  constructor(transport) {
    this.transport = transport;
    this.fallbackCount = 0;
    this.maxFallback = 3;
  }

  /**
   * 执行命令（三层命令体系）
   * @param {string} command
   * @param {Object} options
   */
  async execute(command, options = {}) {
    const req = {
      action: 'Execute',
      request: {
        command,
        cwd: options.cwd,
        timeout_ms: options.timeout || options.timeout_ms || 30000,
        env: options.env,
        pipe_commands: options.pipe_commands,
        max_output_size: options.max_output_size,
        max_memory_mb: options.max_memory_mb,
        capture_stderr: options.capture_stderr ?? true,
        dry_run: options.dry_run ?? false,
      }
    };

    try {
      const result = await this.transport.send('tool', req);
      if (!result.success) this.fallbackCount++;
      else this.fallbackCount = 0;
      if (this.fallbackCount >= this.maxFallback) {
        console.warn('[ToolBridgeAdapter] Too many failures, consider disabling');
      }
      return result;
    } catch (e) {
      this.fallbackCount++;
      throw e;
    }
  }

  async dryRun(command, options = {}) {
    return await this.execute(command, { ...options, dry_run: true });
  }

  async schema(query = {}) {
    return await this.transport.send('tool', { action: 'Schema', query });
  }

  async listShortcuts(category = null) {
    return await this.transport.send('tool', { action: 'Shortcuts', category });
  }

  async resolve(command) {
    return await this.transport.send('tool', { action: 'Resolve', command });
  }

  async getStats() {
    return await this.transport.send('tool', { action: 'GetStats' });
  }

  async terminate(commandId) {
    return await this.transport.send('tool', { action: 'Terminate', command_id: commandId });
  }

  getStatsSync() {
    return {
      transportStats: this.transport.getStats(),
      fallbackCount: this.fallbackCount,
    };
  }
}

export default ToolBridgeAdapter;
