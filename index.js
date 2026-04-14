/**
 * HundunOS v5.0 - Main Entry Point
 * 下一代AI操作系统 - 微内核架构
 * 
 * @example
 * // 基础使用
 * import { CoreKernel } from 'hundunos';
 * const kernel = new CoreKernel({ api: { port: 3000 } });
 * await kernel.initialize();
 * 
 * @example
 * // 完整功能
 * import { createFullKernel } from 'hundunos';
 * const kernel = await createFullKernel({
 *   database: { type: 'postgresql', host: 'localhost' },
 *   models: { defaultProvider: 'openai' }
 * });
 */

// ============================================
// v5 Microkernel Architecture
// ============================================
export {
  // Core Components
  Kernel,
  EventBus,
  ServiceRegistry,
  PluginManager,
  ConfigManager,
  BasePlugin,
  
  // Core Plugins
  LoggerPlugin,
  SecurityPlugin,
  ConfigPlugin,
  EventsPlugin,
  
  // Feature Plugins
  CachePlugin,
  DatabasePlugin,
  ApiPlugin,
  ModelRouterPlugin,
  AgentPlugin,
  RagPlugin,
  TenantPlugin,
  BillingPlugin,
  
  // Compatibility
  V4Adapter,
  createV4Adapter,
  
  // Factory Functions
  createKernel
} from './kernel/v5/index.js';

// Factory functions from kernel/index.js
export { 
  createFullKernel,
  createKernelWithVersion 
} from './kernel/index.js';

// ============================================
// CoreKernel (Unified API)
// ============================================
export { 
  CoreKernel,
  CoreKernelV4 
} from './kernel/core.js';

// ============================================
// Default Export
// ============================================
import { CoreKernel } from './kernel/core.js';
export default CoreKernel;
