/**
 * HundunOS Kernel - Main Entry Point
 * v5.0.0 - 统一入口，兼容v4 API
 */

// ============================================
// v5 Microkernel Architecture (Recommended)
// ============================================
export {
  // Core
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
  
  // Factory
  createKernel
} from './v5/index.js';

// ============================================
// v4 Compatibility Layer (Legacy)
// ============================================
export { CoreKernel } from './core.js';
export { CoreKernelV4 } from './core.v4.js';

// ============================================
// Unified Factory
// ============================================
import { createKernel as createV5Kernel } from './v5/index.js';
import { CoreKernelV4 } from './core.v4.js';

/**
 * Create kernel instance
 * @param {Object} config - Configuration
 * @param {string} config.version - 'v5' (default) or 'v4'
 * @returns {Kernel|CoreKernelV4} Kernel instance
 */
export function createKernel(config = {}) {
  const version = config.version || 'v5';
  
  if (version === 'v4') {
    console.warn('[Deprecation] v4 is deprecated. Please migrate to v5.');
    return new CoreKernelV4(config);
  }
  
  return createV5Kernel(config);
}

/**
 * Create v5 kernel with all plugins
 * @param {Object} config - Configuration
 * @returns {Promise<Kernel>} Initialized kernel
 */
export async function createFullKernel(config = {}) {
  const {
    Kernel,
    LoggerPlugin,
    SecurityPlugin,
    ConfigPlugin,
    EventsPlugin,
    CachePlugin,
    DatabasePlugin,
    ApiPlugin,
    ModelRouterPlugin,
    AgentPlugin,
    RagPlugin,
    TenantPlugin,
    BillingPlugin
  } = await import('./v5/index.js');
  
  const kernel = new Kernel(config);
  
  // Register core plugins
  await kernel.plugins.register(LoggerPlugin);
  await kernel.plugins.register(ConfigPlugin);
  await kernel.plugins.register(EventsPlugin);
  await kernel.plugins.register(SecurityPlugin);
  
  // Register feature plugins
  await kernel.plugins.register(CachePlugin);
  await kernel.plugins.register(DatabasePlugin);
  await kernel.plugins.register(ApiPlugin);
  await kernel.plugins.register(ModelRouterPlugin);
  await kernel.plugins.register(AgentPlugin);
  await kernel.plugins.register(RagPlugin);
  await kernel.plugins.register(TenantPlugin);
  await kernel.plugins.register(BillingPlugin);
  
  // Initialize
  await kernel.initialize();
  
  return kernel;
}

// ============================================
// Default Export
// ============================================
export default {
  createKernel,
  createFullKernel
};
