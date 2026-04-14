/**
 * HundunOS v4 to v5 Compatibility Adapter
 * 提供v4 API的兼容层，使现有代码可以平滑迁移到v5架构
 */

import { Kernel } from '../core/Kernel.js';
import { BasePlugin } from '../core/BasePlugin.js';
import { LoggerPlugin } from '../plugins/core/LoggerPlugin.js';
import { SecurityPlugin } from '../plugins/core/SecurityPlugin.js';
import { ConfigPlugin } from '../plugins/core/ConfigPlugin.js';
import { EventsPlugin } from '../plugins/core/EventsPlugin.js';
import { CachePlugin } from '../plugins/features/CachePlugin.js';
import { DatabasePlugin } from '../plugins/features/DatabasePlugin.js';

/**
 * v4兼容适配器类
 * 模拟v4的Phase和Mixin API，底层使用v5实现
 */
export class V4Adapter {
  #kernel = null;
  #phaseHooks = new Map();
  #mixins = new Map();
  #initialized = false;

  constructor(config = {}) {
    this.#kernel = new Kernel(config);
    this.#setupPhaseCompatibility();
  }

  /**
   * 设置Phase兼容性层
   */
  #setupPhaseCompatibility() {
    const phases = ['init', 'config', 'services', 'plugins', 'routes', 'start'];
    
    phases.forEach(phase => {
      this.#phaseHooks.set(phase, []);
      
      // 将v5事件映射到v4 phase
      const eventName = `phase:${phase}`;
      this.#kernel.events.on(eventName, async (data) => {
        const hooks = this.#phaseHooks.get(phase) || [];
        for (const hook of hooks.sort((a, b) => a.priority - b.priority)) {
          try {
            await hook.handler(data);
          } catch (err) {
            console.error(`Phase ${phase} hook failed:`, err);
            throw err;
          }
        }
      });
    });
  }

  /**
   * 注册Phase钩子（v4 API）
   */
  onPhase(phase, handler, priority = 10) {
    if (!this.#phaseHooks.has(phase)) {
      throw new Error(`Unknown phase: ${phase}`);
    }
    this.#phaseHooks.get(phase).push({ handler, priority });
    return this;
  }

  /**
   * 注册Mixin（v4 API）
   */
  useMixin(name, mixinFactory) {
    if (this.#mixins.has(name)) {
      console.warn(`Mixin ${name} already registered, overwriting`);
    }
    
    // 将v4 Mixin转换为v5 Plugin
    const plugin = this.#createMixinPlugin(name, mixinFactory);
    this.#mixins.set(name, { factory: mixinFactory, plugin });
    
    return this;
  }

  /**
   * 创建Mixin插件类
   */
  #createMixinPlugin(name, mixinFactory) {
    const adapter = this;
    
    return class extends BasePlugin {
      get name() { return `mixin:${name}`; }
      get version() { return '1.0.0'; }
      
      async onInit() {
        // 创建v4风格的上下文
        const context = {
          kernel: this.kernel,
          config: this.kernel.get('config'),
          logger: this.logger,
          events: this.kernel.get('events'),
          services: this.kernel.services,
          
          // v4兼容方法
          registerService: (svcName, factory, options) => {
            return this.kernel.services.register(svcName, factory, options);
          },
          
          getService: (svcName) => {
            return this.kernel.get(svcName);
          },
          
          emit: (event, data) => {
            return this.kernel.events.emit(event, data);
          },
          
          on: (event, handler) => {
            return this.kernel.events.on(event, handler);
          }
        };
        
        // 执行v4 Mixin工厂函数
        const mixin = mixinFactory(context);
        
        // 将mixin方法暴露为服务
        if (mixin) {
          Object.entries(mixin).forEach(([key, value]) => {
            if (typeof value === 'function') {
              this[key] = value.bind(context);
            }
          });
          
          // 注册为服务
          this.kernel.services.register(`mixin.${name}`, () => mixin, {
            singleton: true
          });
        }
        
        this.logger.info(`Mixin ${name} initialized`);
      }
    };
  }

  /**
   * 获取Mixin实例（v4 API）
   */
  getMixin(name) {
    return this.#kernel.get(`mixin.${name}`);
  }

  /**
   * 初始化系统（v4 API）
   */
  async initialize() {
    if (this.#initialized) {
      return this;
    }

    // 加载核心插件
    await this.#kernel.plugins.register(LoggerPlugin);
    await this.#kernel.plugins.register(ConfigPlugin);
    await this.#kernel.plugins.register(EventsPlugin);
    await this.#kernel.plugins.register(SecurityPlugin);
    
    // 加载特性插件
    await this.#kernel.plugins.register(CachePlugin);
    await this.#kernel.plugins.register(DatabasePlugin);

    // 注册所有Mixin插件
    for (const [name, { plugin }] of this.#mixins.entries()) {
      await this.#kernel.plugins.register(plugin);
    }

    // 初始化内核
    await this.#kernel.initialize();

    // 执行v4 phase hooks
    await this.#executePhase('init');
    await this.#executePhase('config');
    await this.#executePhase('services');
    await this.#executePhase('plugins');
    await this.#executePhase('routes');
    await this.#executePhase('start');

    this.#initialized = true;
    return this;
  }

  async #executePhase(phase) {
    await this.#kernel.events.emit(`phase:${phase}`, { phase, adapter: this });
  }

  /**
   * 获取服务（v4 API）
   */
  get(serviceName) {
    return this.#kernel.get(serviceName);
  }

  /**
   * 注册服务（v4 API）
   */
  register(name, factory, options = {}) {
    this.#kernel.services.register(name, factory, options);
    return this;
  }

  /**
   * 获取配置（v4 API）
   */
  config(key, defaultValue) {
    const config = this.#kernel.get('config');
    return config ? config.get(key, defaultValue) : defaultValue;
  }

  /**
   * 获取日志器（v4 API）
   */
  getLogger(name) {
    const logger = this.#kernel.get('logger');
    return logger ? logger.child(name) : console;
  }

  /**
   * 监听事件（v4 API）
   */
  on(event, handler) {
    return this.#kernel.events.on(event, handler);
  }

  /**
   * 触发事件（v4 API）
   */
  emit(event, data) {
    return this.#kernel.events.emit(event, data);
  }

  /**
   * 关闭系统（v4 API）
   */
  async shutdown() {
    await this.#kernel.shutdown();
    this.#initialized = false;
  }

  /**
   * 获取底层v5内核（高级用法）
   */
  get kernel() {
    return this.#kernel;
  }
}

/**
 * 创建v4兼容实例（便捷函数）
 */
export function createV4Adapter(config = {}) {
  return new V4Adapter(config);
}

/**
 * Mixin基类（v4兼容）
 * 提供v4风格的Mixin定义方式
 */
export class V4Mixin {
  constructor(name) {
    this.name = name;
    this.dependencies = [];
  }

  /**
   * 定义依赖的其他Mixin
   */
  dependsOn(...mixins) {
    this.dependencies.push(...mixins);
    return this;
  }

  /**
   * 创建Mixin工厂函数
   * 子类应重写此方法
   */
  createFactory() {
    throw new Error('Subclass must implement createFactory()');
  }
}

/**
 * 全局适配器实例（单例模式）
 */
let globalAdapter = null;

export function getGlobalAdapter() {
  if (!globalAdapter) {
    globalAdapter = new V4Adapter();
  }
  return globalAdapter;
}

export function setGlobalAdapter(adapter) {
  globalAdapter = adapter;
}

export default {
  V4Adapter,
  V4Mixin,
  createV4Adapter,
  getGlobalAdapter,
  setGlobalAdapter
};
