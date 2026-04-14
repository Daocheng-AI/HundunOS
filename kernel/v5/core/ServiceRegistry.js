/**
 * HundunOS v5.0 - 服务注册表
 * 依赖注入容器，支持懒加载和生命周期管理
 */

/**
 * 服务定义
 */
class ServiceDefinition {
  constructor(factory, options = {}) {
    this.factory = factory;
    this.singleton = options.singleton !== false; // 默认单例
    this.lazy = options.lazy !== false; // 默认懒加载
    this.dependencies = options.dependencies || [];
  }
}

/**
 * 服务注册表
 */
export class ServiceRegistry {
  constructor() {
    this.definitions = new Map();
    this.instances = new Map();
    this.resolving = new Set();
    this.creating = new Map(); // 用于缓存正在创建的Promise
  }

  /**
   * 注册服务
   */
  register(name, factory, options = {}) {
    this.definitions.set(name, new ServiceDefinition(factory, options));
    return this;
  }
  
  /**
   * 初始化非懒加载的服务
   */
  async initializeEagerServices() {
    for (const [name, definition] of this.definitions) {
      if (definition.singleton && !definition.lazy) {
        await this._createInstance(name);
      }
    }
  }

  /**
   * 获取服务
   */
  async get(name) {
    // 参数验证
    if (typeof name !== 'string') {
      throw new Error(`Service name must be a string, got ${typeof name}`);
    }

    const definition = this.definitions.get(name);
    if (!definition) {
      throw new Error(`Service not registered: ${name}`);
    }

    // 单例直接返回缓存
    if (definition.singleton && this.instances.has(name)) {
      return this.instances.get(name);
    }

    // 如果正在创建中，返回现有的Promise
    if (definition.singleton && this.creating.has(name)) {
      return this.creating.get(name);
    }

    // 检查循环依赖
    if (this.resolving.has(name)) {
      throw new Error(`Circular dependency: ${Array.from(this.resolving).join(' -> ')} -> ${name}`);
    }

    // 创建实例并缓存Promise
    const createPromise = this._doCreate(name);
    
    if (definition.singleton) {
      this.creating.set(name, createPromise);
    }
    
    return createPromise;
  }
  
  /**
   * 实际创建实例
   * @private
   */
  async _doCreate(name) {
    this.resolving.add(name);
    try {
      const instance = await this._createInstance(name);
      return instance;
    } finally {
      this.resolving.delete(name);
      this.creating.delete(name);
    }
  }

  /**
   * 同步获取（仅适用于已创建的单例）
   */
  getSync(name) {
    const definition = this.definitions.get(name);
    if (!definition) {
      throw new Error(`Service not registered: ${name}`);
    }

    if (!definition.singleton) {
      throw new Error(`Cannot get non-singleton service synchronously: ${name}`);
    }

    if (!this.instances.has(name)) {
      throw new Error(`Service not initialized: ${name}`);
    }

    return this.instances.get(name);
  }

  /**
   * 检查服务是否已注册
   */
  has(name) {
    return this.definitions.has(name);
  }

  /**
   * 注销服务
   */
  unregister(name) {
    this.definitions.delete(name);
    this.instances.delete(name);
  }

  /**
   * 清理所有服务
   */
  async cleanup() {
    // 调用所有服务的destroy方法
    for (const [name, instance] of this.instances) {
      if (instance && typeof instance.destroy === 'function') {
        try {
          await instance.destroy();
        } catch (error) {
          console.error(`[ServiceRegistry] Failed to destroy ${name}:`, error);
        }
      }
    }
    
    this.instances.clear();
  }

  /**
   * 获取状态
   */
  getStatus() {
    return {
      registered: this.definitions.size,
      instantiated: this.instances.size,
      services: Array.from(this.definitions.keys()),
    };
  }

  /**
   * 创建实例
   * @private
   */
  async _createInstance(name) {
    const definition = this.definitions.get(name);
    
    // 解析依赖
    const deps = [];
    for (const depName of definition.dependencies) {
      const dep = await this.get(depName);
      deps.push(dep);
    }

    // 创建实例
    const instance = await definition.factory(...deps);

    // 缓存单例
    if (definition.singleton) {
      this.instances.set(name, instance);
    }

    return instance;
  }
}

export default ServiceRegistry;
