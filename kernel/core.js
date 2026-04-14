// hundunos/kernel/core.js
// HundunOS v5.0 — CoreKernel via Microkernel + Plugin Architecture
//
// 本文件已迁移到v5微内核架构：
// - 导出名称保持 CoreKernel（向后兼容）
// - 实际使用v5微内核实现
// - 如需使用v4 Mixin架构，导入 CoreKernelV4：
//   import { CoreKernelV4 } from './core.v4.js';
//
// v5架构：Kernel + EventBus + ServiceRegistry + PluginManager

import { createKernel } from './v5/index.js';

// 导出v4兼容版本
export { CoreKernelV4 } from './core.v4.js';

/**
 * CoreKernel — HundunOS v5 微内核
 * 
 * 与v4 API保持兼容，但底层使用v5架构
 * 
 * 使用方式：
 * ```js
 * import { CoreKernel } from './kernel/core.js';
 * const kernel = new CoreKernel({ 
 *   api: { port: 3000 },
 *   database: { type: 'sqlite' }
 * });
 * await kernel.initialize();
 * ```
 */
export class CoreKernel {
  constructor(config = {}) {
    // 创建v5内核
    this._kernel = createKernel(config);
    this.config = config;
    this.state = {
      initialized: false,
      running: false,
      version: '5.0.0'
    };
  }

  /**
   * 初始化内核
   */
  async initialize() {
    if (this.state.initialized) return this;

    // 注册核心插件
    const { 
      LoggerPlugin, 
      SecurityPlugin, 
      ConfigPlugin, 
      EventsPlugin,
      CachePlugin,
      DatabasePlugin,
      ApiPlugin 
    } = await import('./v5/index.js');

    await this._kernel.plugins.register(LoggerPlugin);
    await this._kernel.plugins.register(ConfigPlugin);
    await this._kernel.plugins.register(EventsPlugin);
    await this._kernel.plugins.register(SecurityPlugin);
    await this._kernel.plugins.register(CachePlugin);
    await this._kernel.plugins.register(DatabasePlugin);
    await this._kernel.plugins.register(ApiPlugin);

    // 初始化
    await this._kernel.initialize();
    
    this.state.initialized = true;
    
    return this;
  }

  /**
   * 启动处理（兼容v4 API）
   */
  async process() {
    if (!this.state.initialized) {
      await this.initialize();
    }

    const api = this._kernel.get('api');
    if (api && api.start) {
      await api.start();
    }

    this.state.running = true;
    return this;
  }

  /**
   * 获取服务（兼容v4 API）
   */
  get(name) {
    return this._kernel.get(name);
  }

  /**
   * 注册服务（兼容v4 API）
   */
  register(name, factory, options = {}) {
    this._kernel.services.register(name, factory, options);
    return this;
  }

  /**
   * 获取日志器（兼容v4 API）
   */
  getLogger(name) {
    const logger = this._kernel.get('logger');
    return logger ? logger.child(name) : console;
  }

  /**
   * 获取配置（兼容v4 API）
   */
  getConfig(key, defaultValue) {
    const config = this._kernel.get('config');
    return config ? config.get(key, defaultValue) : defaultValue;
  }

  /**
   * 监听事件（兼容v4 API）
   */
  on(event, handler) {
    return this._kernel.events.on(event, handler);
  }

  /**
   * 触发事件（兼容v4 API）
   */
  emit(event, data) {
    return this._kernel.events.emit(event, data);
  }

  /**
   * 注册Mixin（兼容v4 API）
   */
  async useMixin(name, factory) {
    // 将Mixin转换为Plugin
    const { BasePlugin } = await import('./v5/index.js');
    
    const kernel = this._kernel;
    
    class MixinPlugin extends BasePlugin {
      get name() { return name; }
      
      async onInit() {
        const context = {
          kernel: this.kernel,
          logger: this.logger,
          config: this.kernel.get('config'),
          events: this.kernel.get('events'),
          getService: (n) => this.kernel.get(n),
          registerService: (n, f, o) => this.kernel.services.register(n, f, o),
          emit: (e, d) => this.kernel.events.emit(e, d),
          on: (e, h) => this.kernel.events.on(e, h)
        };
        
        const mixin = factory(context);
        if (mixin) {
          Object.assign(this, mixin);
        }
      }
    }
    
    await this._kernel.plugins.register(MixinPlugin);
    return this;
  }

  /**
   * 获取Mixin（兼容v4 API）
   */
  getMixin(name) {
    return this._kernel.plugins.get(name);
  }

  /**
   * 注册Phase钩子（兼容v4 API）
   */
  onPhase(phase, handler, priority = 10) {
    // 映射到v5事件系统
    const eventName = `phase:${phase}`;
    return this._kernel.events.on(eventName, handler, { priority });
  }

  /**
   * 关闭内核
   */
  async shutdown() {
    await this._kernel.shutdown();
    this.state.running = false;
    this.state.initialized = false;
  }

  /**
   * 获取底层v5内核
   */
  get v5() {
    return this._kernel;
  }
}

// 默认导出
export default CoreKernel;
