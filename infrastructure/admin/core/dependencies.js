/**
 * 依赖注入容器模块
 * 借鉴 FastapiAdmin 的依赖注入模式
 * @module infrastructure/admin/core/dependencies
 */

/**
 * 依赖注入容器
 * 管理服务的依赖关系和生命周期
 */
export class DependencyContainer {
  constructor() {
    // 依赖定义 Map
    this.dependencies = new Map();
    // 单例实例缓存
    this.instances = new Map();
    // 解析中的依赖（用于检测循环依赖）
    this.resolving = new Set();
  }

  /**
   * 注册依赖
   * @param {string} name - 依赖名称
   * @param {Function} factory - 工厂函数，返回依赖实例
   * @param {Object} [options={}] - 配置选项
   * @param {boolean} [options.singleton=true] - 是否为单例
   * @param {Array<string>} [options.dependencies=[]] - 依赖列表
   * @returns {DependencyContainer} 返回容器实例，支持链式调用
   */
  register(name, factory, options = {}) {
    if (typeof factory !== 'function') {
      throw new Error(`Factory for '${name}' must be a function`);
    }

    // 支持 register(name, factory, ['dep1', 'dep2']) 这种简写形式
    let deps = [];
    let singleton = true;
    if (Array.isArray(options)) {
      deps = options;
    } else {
      deps = options.dependencies || [];
      singleton = options.singleton !== false;
    }

    this.dependencies.set(name, {
      factory,
      singleton,
      dependencies: deps,
    });

    return this;
  }

  /**
   * 注册单例依赖
   * @param {string} name - 依赖名称
   * @param {Function} factory - 工厂函数
   * @param {Array<string>} [dependencies=[]] - 依赖列表
   * @returns {DependencyContainer}
   */
  singleton(name, factory, dependencies = []) {
    return this.register(name, factory, { singleton: true, dependencies });
  }

  /**
   * 注册瞬态依赖（每次解析都创建新实例）
   * @param {string} name - 依赖名称
   * @param {Function} factory - 工厂函数
   * @param {Array<string>} [dependencies=[]] - 依赖列表
   * @returns {DependencyContainer}
   */
  transient(name, factory, dependencies = []) {
    return this.register(name, factory, { singleton: false, dependencies });
  }

  /**
   * 注册值依赖（直接注册一个值）
   * @param {string} name - 依赖名称
   * @param {*} value - 值
   * @returns {DependencyContainer}
   */
  value(name, value) {
    this.instances.set(name, value);
    return this.register(name, () => value, { singleton: true });
  }

  /**
   * 解析依赖
   * @param {string} name - 依赖名称
   * @returns {Promise<*>} 依赖实例
   */
  async resolve(name) {
    // 检测循环依赖（必须在添加到 resolving 之前检查，否则移除后无法检测）
    if (this.resolving.has(name)) {
      throw new Error(`Circular dependency detected: ${name}`);
    }

    // 检查是否已解析（单例）
    if (this.instances.has(name)) {
      return this.instances.get(name);
    }

    // 检查依赖是否已注册
    const dep = this.dependencies.get(name);
    if (!dep) {
      throw new Error(`Dependency '${name}' not found`);
    }

    // 标记正在解析
    this.resolving.add(name);

    try {
      // 解析依赖项
      const resolvedDeps = {};
      for (const depName of dep.dependencies) {
        resolvedDeps[depName] = await this.resolve(depName);
      }

      // 调用工厂函数创建实例
      const instance = await dep.factory(resolvedDeps, this);

      // 如果是单例，缓存实例
      if (dep.singleton) {
        this.instances.set(name, instance);
      }

      return instance;
    } finally {
      // 移除解析标记
      this.resolving.delete(name);
    }
  }

  /**
   * 同步解析依赖（仅适用于同步工厂函数）
   * @param {string} name - 依赖名称
   * @returns {*} 依赖实例
   */
  resolveSync(name) {
    // 检查是否已解析（单例）
    if (this.instances.has(name)) {
      return this.instances.get(name);
    }

    // 检查依赖是否已注册
    const dep = this.dependencies.get(name);
    if (!dep) {
      throw new Error(`Dependency '${name}' not found`);
    }

    // 检测循环依赖
    if (this.resolving.has(name)) {
      throw new Error(`Circular dependency detected: ${name}`);
    }

    // 标记正在解析
    this.resolving.add(name);

    try {
      // 解析依赖项
      const resolvedDeps = {};
      for (const depName of dep.dependencies) {
        resolvedDeps[depName] = this.resolveSync(depName);
      }

      // 调用工厂函数创建实例
      const instance = dep.factory(resolvedDeps, this);

      // 如果是单例，缓存实例
      if (dep.singleton) {
        this.instances.set(name, instance);
      }

      return instance;
    } finally {
      // 移除解析标记
      this.resolving.delete(name);
    }
  }

  /**
   * 检查依赖是否已注册
   * @param {string} name - 依赖名称
   * @returns {boolean}
   */
  has(name) {
    return this.dependencies.has(name) || this.instances.has(name);
  }

  /**
   * 获取所有已注册的依赖名称
   * @returns {Array<string>}
   */
  getRegisteredNames() {
    return Array.from(this.dependencies.keys());
  }

  /**
   * 清除所有缓存的实例
   */
  clearInstances() {
    this.instances.clear();
  }

  /**
   * 清除所有注册和实例
   */
  clear() {
    this.dependencies.clear();
    this.instances.clear();
    this.resolving.clear();
  }

  /**
   * 创建子容器
   * 子容器继承父容器的依赖，但可以覆盖
   * @returns {DependencyContainer}
   */
  createChild() {
    const child = new DependencyContainer();

    // 复制父容器的依赖定义
    for (const [name, dep] of this.dependencies) {
      child.dependencies.set(name, dep);
    }

    return child;
  }
}

// ============================================
// 全局容器实例
// ============================================

/**
 * 全局依赖容器实例
 */
export const container = new DependencyContainer();

// ============================================
// 预定义依赖获取器
// ============================================

/**
 * 获取内核实例
 * @returns {Promise<Object>}
 */
export async function getKernel() {
  return container.resolve('kernel');
}

/**
 * 获取存储适配器
 * @returns {Promise<Object>}
 */
export async function getStorage() {
  return container.resolve('storage');
}

/**
 * 获取缓存适配器
 * @returns {Promise<Object>}
 */
export async function getCache() {
  return container.resolve('cache');
}

/**
 * 获取配置
 * @returns {Promise<Object>}
 */
export async function getConfig() {
  return container.resolve('config');
}

/**
 * 获取日志器
 * @returns {Promise<Object>}
 */
export async function getLogger() {
  return container.resolve('logger');
}

/**
 * 从请求中获取当前用户
 * @param {Object} request - 请求对象
 * @returns {Object|null} 用户对象
 */
export function getCurrentUser(request) {
  return request.user || null;
}

/**
 * 获取请求ID（用于链路追踪）
 * @param {Object} request - 请求对象
 * @returns {string}
 */
export function getRequestId(request) {
  return request.id || request.headers['x-request-id'] || generateRequestId();
}

/**
 * 生成请求ID
 * @returns {string}
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================
// 依赖注入装饰器（用于类）
// ============================================

/**
 * 注入依赖装饰器
 * @param {string} name - 依赖名称
 * @returns {Function} 装饰器函数
 */
export function inject(name) {
  return function (target, propertyKey) {
    Object.defineProperty(target, propertyKey, {
      get() {
        return container.resolveSync(name);
      },
      enumerable: true,
      configurable: true,
    });
  };
}

/**
 * 可注入基类
 * 提供依赖注入能力
 */
export class Injectable {
  /**
   * 获取依赖
   * @param {string} name - 依赖名称
   * @returns {Promise<*>}
   */
  async getDependency(name) {
    return container.resolve(name);
  }

  /**
   * 同步获取依赖
   * @param {string} name - 依赖名称
   * @returns {*}
   */
  getDependencySync(name) {
    return container.resolveSync(name);
  }
}

// ============================================
// 初始化函数
// ============================================

/**
 * 初始化Admin模块依赖
 * @param {Object} kernel - HundunOS内核实例
 * @param {Object} config - 配置对象
 * @returns {Promise<void>}
 */
export async function initializeDependencies(kernel, config) {
  // 注册内核
  container.value('kernel', kernel);

  // 注册配置
  container.value('config', config);

  // 注册存储适配器
  container.singleton('storage', async () => {
    const { createStorageAdapter } = await import('../storage/json-adapter.js');
    return createStorageAdapter(config.storage || {});
  });

  // 注册缓存适配器
  container.singleton('cache', async () => {
    // 如果配置了Redis，使用Redis缓存
    if (config.cache?.type === 'redis') {
      const { createRedisCache } = await import('../utils/cache.js');
      return createRedisCache(config.cache);
    }
    // 否则使用内存缓存
    const { createMemoryCache } = await import('../utils/cache.js');
    return createMemoryCache(config.cache);
  });

  // 注册日志器
  container.singleton('logger', () => {
    return kernel.getLogger?.('admin') || console;
  });
}

export default {
  DependencyContainer,
  container,
  getKernel,
  getStorage,
  getCache,
  getConfig,
  getLogger,
  getCurrentUser,
  getRequestId,
  inject,
  Injectable,
  initializeDependencies,
};
