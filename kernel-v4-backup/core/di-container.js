/**
 * HundunOS v4.3 - 依赖注入容器
 * 统一管理服务注册和解析，降低模块间耦合
 */

/**
 * 服务生命周期类型
 */
export const ServiceLifetime = {
  TRANSIENT: 'transient',  // 每次解析创建新实例
  SCOPED: 'scoped',        // 同一作用域内共享实例
  SINGLETON: 'singleton',  // 全局单例
};

/**
 * 依赖注入容器
 */
export class DIContainer {
  constructor() {
    this.services = new Map();
    this.singletons = new Map();
    this.scopes = new Map();
    this.resolving = new Set();
  }

  /**
   * 注册服务
   * @param {string} name - 服务名称
   * @param {Function} factory - 工厂函数
   * @param {Object} options - 配置选项
   * @param {string} options.lifetime - 生命周期类型
   * @param {Array} options.dependencies - 依赖项列表
   */
  register(name, factory, options = {}) {
    const config = {
      factory,
      lifetime: options.lifetime || ServiceLifetime.TRANSIENT,
      dependencies: options.dependencies || [],
    };
    
    this.services.set(name, config);
    
    // 如果是单例，立即创建实例
    if (config.lifetime === ServiceLifetime.SINGLETON) {
      this._createSingleton(name, config);
    }
  }

  /**
   * 注册实例（直接提供实例而非工厂）
   * @param {string} name - 服务名称
   * @param {*} instance - 实例对象
   */
  registerInstance(name, instance) {
    this.singletons.set(name, instance);
    this.services.set(name, {
      factory: () => instance,
      lifetime: ServiceLifetime.SINGLETON,
      dependencies: [],
    });
  }

  /**
   * 解析服务
   * @param {string} name - 服务名称
   * @returns {*} 服务实例
   */
  async resolve(name) {
    // 检查循环依赖
    if (this.resolving.has(name)) {
      throw new Error(`Circular dependency detected: ${Array.from(this.resolving).join(' -> ')} -> ${name}`);
    }

    const config = this.services.get(name);
    if (!config) {
      throw new Error(`Service not registered: ${name}`);
    }

    // 单例直接返回
    if (config.lifetime === ServiceLifetime.SINGLETON) {
      if (this.singletons.has(name)) {
        return this.singletons.get(name);
      }
      return this._createSingleton(name, config);
    }

    // 解析依赖
    this.resolving.add(name);
    try {
      const dependencies = await this.resolveMany(config.dependencies);
      const instance = await config.factory(...dependencies);
      return instance;
    } finally {
      this.resolving.delete(name);
    }
  }

  /**
   * 批量解析服务
   * @param {Array<string>} names - 服务名称列表
   * @returns {Array} 服务实例列表
   */
  async resolveMany(names) {
    return Promise.all(names.map(name => this.resolve(name)));
  }

  /**
   * 检查服务是否已注册
   * @param {string} name - 服务名称
   * @returns {boolean}
   */
  has(name) {
    return this.services.has(name);
  }

  /**
   * 获取所有已注册服务名称
   * @returns {Array<string>}
   */
  getRegisteredServices() {
    return Array.from(this.services.keys());
  }

  /**
   * 创建单例实例
   * @private
   */
  async _createSingleton(name, config) {
    const dependencies = await this.resolveMany(config.dependencies);
    const instance = await config.factory(...dependencies);
    this.singletons.set(name, instance);
    return instance;
  }

  /**
   * 创建子容器（作用域）
   * @returns {DIContainer}
   */
  createScope() {
    const scope = new DIContainer();
    scope.parent = this;
    return scope;
  }

  /**
   * 清空容器
   */
  clear() {
    this.services.clear();
    this.singletons.clear();
    this.scopes.clear();
    this.resolving.clear();
  }
}

// 导出全局容器实例
export const container = new DIContainer();
export default container;
