// adapters/rust-modules/index.js
// HundunOS Rust Modules — Unified Adapter Entry Point v4.0
// Phase 3: hundunos-core Unix Socket / TCP:38082 长连接 + JSON-RPC 2.0
// 统一入口：所有 JS → Rust 调用经过此入口，支持三种传输模式自动降级

import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { RustTransport } from './transport.js';
import { ToolBridgeAdapter } from './tool-bridge.js';
import { MemoryGraphAdapter } from './memory-graph.js';
import { ModelRouterAdapter } from './model-router.js';
import { PolicyEngineAdapter } from './policy-engine.js';
import { TaskScientistAdapter } from './task-scientist.js';
import { checkRustHealth } from './health.js';

const __ADAPTER_DIR = dirname(fileURLToPath(import.meta.url));
const __ROOT = resolve(__ADAPTER_DIR, '..', '..');

/**
 * 统一的 Rust 模块管理器
 * Phase 3: 三层传输自动降级
 *   1. TCP:38082 (hundunos-core 守护进程，最优 ~0ms)
 *   2. Unix Socket (Linux/macOS)
 *   3. Child Process (各模块独立 binary，回退方案)
 */
export class RustModules {
  /**
   * @param {Object} config
   * @param {boolean} config.enabled       - 是否启用 Rust 模块（feature flag 控制）
   * @param {string}  config.mode          - 'auto' | 'always' | 'never'（默认 'auto'）
   * @param {number}  config.tcpPort        - TCP 端口（默认 38082，Windows 主要连接方式）
   * @param {string}  config.socketPath     - Unix Socket 路径（Linux/macOS）
   * @param {string}  config.binaryRoot     - Rust 二进制目录（默认自动检测）
   * @param {boolean} config.fallbackToJS  - Rust 失败时是否回退到 JS 实现
   */
  constructor(config = {}) {
    this.config = {
      enabled:        config.enabled       ?? true,
      mode:           config.mode          ?? 'auto',    // Phase 3: 优先 daemon
      tcpPort:        config.tcpPort       ?? 38082,      // hundunos-core 默认端口
      socketPath:     config.socketPath    ?? this._defaultSocketPath(),
      binaryRoot:     config.binaryRoot    ?? this._defaultBinaryRoot(),
      fallbackToJS:   config.fallbackToJS ?? true,
      daemonMode:     config.daemonMode    ?? config.mode, // 透传给 transport
    };

    this.transport = new RustTransport(this.config);
    this._initialized = false;
    this._available = false;
    this._transportMode = null;

    // 各模块适配器
    this.tool      = new ToolBridgeAdapter(this.transport);
    this.memory    = new MemoryGraphAdapter(this.transport);
    this.router    = new ModelRouterAdapter(this.transport);
    this.policy    = new PolicyEngineAdapter(this.transport);
    this.scientist = new TaskScientistAdapter(this.transport);
  }

  _defaultSocketPath() {
    return process.platform === 'win32'
      ? '\\\\.\\pipe\\hundunos'
      : '/tmp/hundunos.sock';
  }

  _defaultBinaryRoot() {
    // Phase 8: 优先使用 vendor 内的预编译二进制（self-contained）
    // 二进制位置: vendor/hundunos-rust/target/release/（已从 hundunos-rust/target/release 复制）
    const vendorRoot = resolve(__ROOT, 'vendor', 'hundunos-rust', 'target', 'release');
    return vendorRoot; // vendor 中已包含所有 7 个 .exe，自包含
  }

  /**
   * 初始化 Rust 传输层（Phase 3: 自动检测最佳传输方式）
   * @returns {Promise<{allHealthy: boolean, transport: string, modules: object, initialized: boolean}>}
   */
  async initialize() {
    if (this._initialized) return this._lastHealth;

    try {
      const { mode, connected } = await this.transport.connect();
      this._transportMode = mode;

      // Try JSON-RPC ping first (daemon mode)
      let health;
      if (mode === 'tcp' || mode === 'socket') {
        try {
          const ping = await this.transport.ping();
          health = await checkRustHealth(this.transport);
          health.transport = `${mode}:${this.config.tcpPort}`;
          health.daemonVersion = ping?.version;
        } catch {
          health = { allHealthy: false, transport: mode, error: 'Ping failed' };
        }
      } else {
        health = await checkRustHealth(this.transport);
        health.transport = 'process';
      }

      this._available  = health.allHealthy;
      this._lastHealth = { ...health, initialized: true };
      this._initialized = true;

      if (this._available) {
        // review: removed // review: removed console.info(`[RustModules] ✅ Initialized (${mode}) — ${Object.keys(health.modules || {}).length} modules healthy`);
      } else {
        console.warn(`[RustModules] ⚠️  Initialized (${mode}) — Rust unavailable, using JS fallback`);
      }

      return this._lastHealth;
    } catch (e) {
      console.warn('[RustModules] Failed to initialize:', e.message);
      this._available  = false;
      this._transportMode = 'unavailable';
      this._lastHealth = { allHealthy: false, initialized: true, transport: 'none', error: e.message };
      this._initialized = true;
      return this._lastHealth;
    }
  }

  /**
   * 检查指定模块是否可用
   * @param {string} moduleName - 'tool' | 'memory' | 'router' | 'policy' | 'scientist'
   */
  isModuleAvailable(moduleName) {
    if (!this._initialized || !this._available) return false;
    const health = this._lastHealth?.modules?.[moduleName];
    return health?.status === 'healthy';
  }

  /**
   * 获取所有模块的健康状态
   */
  getHealth() {
    return this._lastHealth ?? { allHealthy: false, initialized: false, transport: 'uninitialized' };
  }

  /**
   * 获取传输层信息（Phase 3 新增）
   */
  getTransportInfo() {
    return {
      mode:         this._transportMode,
      tcpPort:      this.config.tcpPort,
      socketPath:   this.config.socketPath,
      binaryRoot:   this.config.binaryRoot,
      daemonMode:   this.config.daemonMode,
      daemonVersion: this._lastHealth?.daemonVersion,
    };
  }

  /**
   * 关闭 Rust 传输层
   */
  async close() {
    await this.transport.close();
    this._initialized = false;
    this._available = false;
  }

  /**
   * 获取适配器（向后兼容：暴露各模块实例）
   */
  getAdapter(name) {
    return this[name] ?? null;
  }

  /**
   * 获取所有可用模块的元信息
   */
  getAvailableModules() {
    const modules = ['tool', 'memory', 'router', 'policy', 'scientist'];
    return modules
      .filter(m => this.isModuleAvailable(m))
      .map(m => ({ name: m, status: 'healthy' }));
  }
}

/**
 * 便捷工厂函数
 * @param {Object} config
 */
export function getRustModules(config = {}) {
  return new RustModules(config);
}

export default RustModules;
