/**
 * HundunOS v5.0 - Main Entry
 * 新微内核架构入口
 */

// Core
export { Kernel } from './core/Kernel.js';
export { EventBus } from './core/EventBus.js';
export { ServiceRegistry } from './core/ServiceRegistry.js';
export { PluginManager } from './core/PluginManager.js';
export { ConfigManager } from './core/ConfigManager.js';
export { BasePlugin } from './core/BasePlugin.js';

// Core Plugins
export { LoggerPlugin } from './plugins/core/LoggerPlugin.js';
export { SecurityPlugin } from './plugins/core/SecurityPlugin.js';
export { ConfigPlugin } from './plugins/core/ConfigPlugin.js';
export { EventsPlugin } from './plugins/core/EventsPlugin.js';

// Feature Plugins
export { CachePlugin } from './plugins/features/CachePlugin.js';
export { DatabasePlugin } from './plugins/features/DatabasePlugin.js';
export { ApiPlugin } from './plugins/features/ApiPlugin.js';
export { ModelRouterPlugin } from './plugins/features/ModelRouterPlugin.js';
export { AgentPlugin } from './plugins/features/AgentPlugin.js';
export { RagPlugin } from './plugins/features/RagPlugin.js';
export { TenantPlugin } from './plugins/features/TenantPlugin.js';
export { BillingPlugin } from './plugins/features/BillingPlugin.js';

// Compatibility
export { V4Adapter, createV4Adapter } from './compat/v4-adapter.js';

// Import Kernel for createKernel function
import { Kernel } from './core/Kernel.js';

/**
 * 创建内核实例（便捷函数）
 */
export function createKernel(config = {}) {
  return new Kernel(config);
}

export default { createKernel };
