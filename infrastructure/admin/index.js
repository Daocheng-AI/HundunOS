/**
 * HundunOS Admin Dashboard 模块入口
 * @module infrastructure/admin
 * 
 * 借鉴 FastapiAdmin 的设计模式，为 HundunOS 提供统一的管理后台系统
 * 
 * 核心特性：
 * - 泛型CRUD基类：统一数据操作接口
 * - 模型混入模式：自动添加审计字段
 * - 依赖注入容器：清晰的依赖管理
 * - 统一响应封装：标准化API响应
 * - 全局异常处理：统一错误处理
 */

// 核心模块
export * from './core/index.js';

// 数据模型
export * from './models/index.js';

// 服务层
export * from './services/index.js';

// 存储层
export { JSONStorageAdapter, createStorageAdapter } from './storage/json-adapter.js';

// 中间件
export * from './api/middlewares/index.js';

// 控制器
export * as controllers from './api/controllers/index.js';

// 路由
export { setupRoutes } from './api/routes/index.js';

/**
 * Admin模块版本
 */
export const VERSION = '1.0.0';

/**
 * 初始化Admin模块
 * @param {Object} kernel - HundunOS内核实例
 * @param {Object} config - 配置对象
 * @returns {Promise<Object>} 初始化后的服务实例
 */
export async function initializeAdmin(kernel, config = {}) {
  // 初始化依赖容器
  const { initializeDependencies } = await import('./core/dependencies.js');
  await initializeDependencies(kernel, config);

  // 初始化存储适配器
  const { createStorageAdapter } = await import('./storage/json-adapter.js');
  const storage = createStorageAdapter(config.storage);
  await storage.initialize();

  // 初始化服务
  const { initializeServices } = await import('./services/index.js');
  const services = await initializeServices(storage);

  return {
    storage,
    services,
    setupRoutes: (app) => {
      const { setupRoutes } = require('./api/routes/index.js');
      setupRoutes(app, config);
    },
    VERSION,
  };
}

export default {
  VERSION,
  initializeAdmin,
};
