/**
 * HundunOS v5.0 - 插件管理器
 * 支持懒加载、依赖解析、热插拔
 */

import { EventEmitter } from 'events';

/**
 * 插件管理器
 */
export class PluginManager extends EventEmitter {
  constructor(kernel) {
    super();
    this.kernel = kernel;
    this.plugins = new Map();
    this.loaded = new Map();
    this.hooks = new Map();
  }

  /**
   * 注册插件
   */
  register(name, pluginClass, options = {}) {
    this.plugins.set(name, {
      class: pluginClass,
      options,
      instance: null,
    });
    return this;
  }

  /**
   * 加载单个插件
   */
  async load(name) {
    if (this.loaded.has(name)) {
      return this.loaded.get(name);
    }

    const pluginDef = this.plugins.get(name);
    if (!pluginDef) {
      throw new Error(`Plugin not registered: ${name}`);
    }

    const { class: PluginClass, options } = pluginDef;

    // 检查依赖
    if (options.dependencies) {
      for (const dep of options.dependencies) {
        if (!this.loaded.has(dep)) {
          await this.load(dep);
        }
      }
    }

    // 创建实例
    const instance = new PluginClass(this.kernel, options.config || {});
    
    // 初始化
    this.emit('plugin:loading', { name, instance });
    await instance.init(this.kernel);
    this.emit('plugin:loaded', { name, instance });

    // 缓存
    pluginDef.instance = instance;
    this.loaded.set(name, instance);

    return instance;
  }

  /**
   * 加载所有启用的插件
   */
  async loadEnabled() {
    const config = this.kernel.config.get('plugins', []);
    const enabled = config.filter(p => p.enabled !== false);
    
    // 按优先级排序
    enabled.sort((a, b) => (a.priority || 0) - (b.priority || 0));

    // 分离立即加载和懒加载
    const immediate = enabled.filter(p => !p.lazy);
    const lazy = enabled.filter(p => p.lazy);

    // 并行加载立即加载的插件
    await Promise.all(immediate.map(p => this.load(p.name).catch(error => {
      console.error(`[PluginManager] Failed to load ${p.name}:`, error);
    })));

    // 注册懒加载插件（不立即加载）
    for (const p of lazy) {
      this._setupLazyLoading(p.name);
    }
  }

  /**
   * 卸载插件
   */
  async unload(name) {
    const instance = this.loaded.get(name);
    if (!instance) return;

    this.emit('plugin:unloading', { name, instance });
    
    if (typeof instance.destroy === 'function') {
      await instance.destroy();
    }

    this.loaded.delete(name);
    this.emit('plugin:unloaded', { name });
  }

  /**
   * 卸载所有插件
   */
  async unloadAll() {
    // 按依赖反向顺序卸载
    const names = Array.from(this.loaded.keys()).reverse();
    for (const name of names) {
      await this.unload(name);
    }
  }

  /**
   * 获取插件实例
   */
  get(name) {
    return this.loaded.get(name);
  }

  /**
   * 检查插件是否已加载
   */
  isLoaded(name) {
    return this.loaded.has(name);
  }

  /**
   * 获取状态
   */
  getStatus() {
    return {
      registered: this.plugins.size,
      loaded: this.loaded.size,
      plugins: Array.from(this.loaded.keys()),
    };
  }

  /**
   * 注册钩子
   */
  registerHook(name, handler) {
    if (!this.hooks.has(name)) {
      this.hooks.set(name, []);
    }
    this.hooks.get(name).push(handler);
  }

  /**
   * 执行钩子
   */
  async executeHook(name, context) {
    const handlers = this.hooks.get(name) || [];
    for (const handler of handlers) {
      await handler(context);
    }
  }

  /**
   * 设置懒加载
   * @private
   */
  _setupLazyLoading(name) {
    // 当第一次访问时自动加载
    Object.defineProperty(this.kernel, name, {
      get: () => {
        if (!this.loaded.has(name)) {
          this.load(name).catch(console.error);
        }
        return this.loaded.get(name);
      },
      configurable: true,
    });
  }
}

export default PluginManager;
