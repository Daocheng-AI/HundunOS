/**
 * HundunOS v4.3 - 模块注册系统
 * 支持并行初始化、依赖管理和错误隔离
 */

import { errorManager, ErrorType } from '../error-manager.js';

/**
 * 模块初始化结果
 */
export class ModuleInitResult {
  constructor(name, success, instance = null, error = null, duration = 0) {
    this.name = name;
    this.success = success;
    this.instance = instance;
    this.error = error;
    this.duration = duration;
  }
}

/**
 * 模块注册基类
 */
export class ModuleRegistry {
  constructor(kernel, options = {}) {
    this.kernel = kernel;
    this.modules = new Map();
    this.initialized = new Map();
    this.dependencies = new Map();
    this.options = {
      parallel: true,
      continueOnError: true,
      timeout: 30000,
      ...options,
    };
  }

  /**
   * 注册模块
   * @param {string} name - 模块名称
   * @param {Function} factory - 工厂函数
   * @param {Object} options - 配置选项
   */
  register(name, factory, options = {}) {
    this.modules.set(name, {
      factory,
      dependencies: options.dependencies || [],
      priority: options.priority || 0,
      lazy: options.lazy || false,
    });

    // 记录依赖关系
    if (options.dependencies) {
      this.dependencies.set(name, options.dependencies);
    }

    return this;
  }

  /**
   * 批量注册模块
   * @param {Object} modules - 模块定义对象
   */
  registerBatch(modules) {
    for (const [name, config] of Object.entries(modules)) {
      this.register(name, config.factory, config.options);
    }
    return this;
  }

  /**
   * 获取模块依赖拓扑排序
   * @returns {Array<Array<string>>} 按依赖层级分组的模块名称
   */
  getDependencyGroups() {
    const visited = new Set();
    const visiting = new Set();
    const groups = [];

    const visit = (name, level = 0) => {
      if (visiting.has(name)) {
        throw new Error(`Circular dependency detected: ${name}`);
      }
      if (visited.has(name)) return;

      visiting.add(name);
      const module = this.modules.get(name);

      if (module && module.dependencies) {
        for (const dep of module.dependencies) {
          visit(dep, level + 1);
        }
      }

      visiting.delete(name);
      visited.add(name);

      // 添加到对应层级
      if (!groups[level]) groups[level] = [];
      groups[level].push(name);
    };

    for (const name of this.modules.keys()) {
      visit(name);
    }

    return groups.filter(g => g.length > 0);
  }

  /**
   * 初始化单个模块
   * @private
   */
  async _initModule(name) {
    const startTime = Date.now();
    const config = this.modules.get(name);

    if (!config) {
      return new ModuleInitResult(
        name,
        false,
        null,
        new Error(`Module not registered: ${name}`),
        0
      );
    }

    // 检查是否已初始化
    if (this.initialized.has(name)) {
      return this.initialized.get(name);
    }

    try {
      // 解析依赖
      const deps = {};
      if (config.dependencies) {
        for (const depName of config.dependencies) {
          const depResult = await this._initModule(depName);
          if (!depResult.success) {
            throw new Error(`Dependency ${depName} failed to initialize`);
          }
          deps[depName] = depResult.instance;
        }
      }

      // 创建实例
      const instance = await config.factory(this.kernel, deps);
      
      // 附加到kernel
      if (instance) {
        this.kernel[name] = instance;
      }

      const duration = Date.now() - startTime;
      const result = new ModuleInitResult(name, true, instance, null, duration);
      this.initialized.set(name, result);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result = new ModuleInitResult(
        name,
        false,
        null,
        error,
        duration
      );
      this.initialized.set(name, result);

      if (!this.options.continueOnError) {
        throw error;
      }

      console.error(`[ModuleRegistry] Failed to initialize ${name}:`, error.message);
      return result;
    }
  }

  /**
   * 并行初始化所有模块
   */
  async initializeAll() {
    const groups = this.getDependencyGroups();
    const results = [];

    for (const group of groups) {
      if (this.options.parallel) {
        // 同组模块并行初始化
        const groupResults = await Promise.all(
          group.map(name => this._initModule(name))
        );
        results.push(...groupResults);
      } else {
        // 串行初始化
        for (const name of group) {
          const result = await this._initModule(name);
          results.push(result);
        }
      }
    }

    return this._createSummary(results);
  }

  /**
   * 延迟初始化模块
   */
  async initializeLazy(name) {
    const config = this.modules.get(name);
    if (!config || !config.lazy) {
      throw new Error(`Module ${name} is not registered for lazy initialization`);
    }
    return this._initModule(name);
  }

  /**
   * 获取初始化摘要
   * @private
   */
  _createSummary(results) {
    const success = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    return {
      total: results.length,
      success: success.length,
      failed: failed.length,
      duration: totalDuration,
      modules: results,
      failedModules: failed.map(r => ({ name: r.name, error: r.error?.message })),
    };
  }

  /**
   * 获取模块状态
   */
  getStatus(name) {
    return this.initialized.get(name);
  }

  /**
   * 获取所有模块状态
   */
  getAllStatus() {
    return Array.from(this.initialized.values());
  }

  /**
   * 检查模块是否已初始化
   */
  isInitialized(name) {
    const status = this.initialized.get(name);
    return status ? status.success : false;
  }

  /**
   * 销毁所有模块
   */
  async destroyAll() {
    const destroyPromises = [];

    for (const [name, result] of this.initialized) {
      if (result.instance && typeof result.instance.destroy === 'function') {
        destroyPromises.push(
          result.instance.destroy().catch(error => {
            console.error(`[ModuleRegistry] Failed to destroy ${name}:`, error);
          })
        );
      }
    }

    await Promise.all(destroyPromises);
    this.initialized.clear();
  }
}

/**
 * 领域特定的模块注册器
 */
export class DomainModuleRegistry extends ModuleRegistry {
  constructor(kernel, domain, options = {}) {
    super(kernel, options);
    this.domain = domain;
  }

  /**
   * 注册领域模块（自动添加领域前缀）
   */
  register(name, factory, options = {}) {
    const fullName = `${this.domain}.${name}`;
    return super.register(fullName, factory, options);
  }
}

// 导出默认注册器
export const createRegistry = (kernel, options) => new ModuleRegistry(kernel, options);
export default ModuleRegistry;
