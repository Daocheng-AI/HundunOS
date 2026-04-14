/**
 * HundunOS v5.0 - 微内核
 * 极简核心，仅包含配置、事件总线、服务注册表
 */

import { EventBus } from './EventBus.js';
import { ServiceRegistry } from './ServiceRegistry.js';
import { PluginManager } from './PluginManager.js';
import { ConfigManager } from './ConfigManager.js';
import { KernelState } from './KernelState.js';

/**
 * 微内核 - HundunOS v5.0 核心
 */
export class Kernel {
  constructor(config = {}) {
    // 核心组件
    this.config = new ConfigManager(config);
    this.events = new EventBus();
    this.services = new ServiceRegistry();
    this.plugins = new PluginManager(this);
    this.state = new KernelState();
    
    // 内部状态
    this._initialized = false;
    this._shutdown = false;
    
    // 注册核心服务
    this._registerCoreServices();
  }

  /**
   * 初始化内核
   */
  async initialize() {
    if (this._initialized) {
      throw new Error('Kernel already initialized');
    }
    
    this.state.set('initializing');
    
    try {
      // 1. 初始化配置
      await this.config.initialize();
      
      // 2. 加载启用的插件
      await this.plugins.loadEnabled();
      
      // 3. 标记初始化完成
      this._initialized = true;
      this.state.set('initialized');
      
      // 4. 触发初始化完成事件
      await this.events.emit('kernel:initialized', { kernel: this });
      
      return this;
    } catch (error) {
      this.state.set('error', error);
      throw error;
    }
  }

  /**
   * 关闭内核
   */
  async shutdown() {
    if (this._shutdown) return;
    
    this.state.set('shutting_down');
    
    try {
      // 1. 触发关闭前事件
      await this.events.emit('kernel:shutdown:before', { kernel: this });
      
      // 2. 卸载所有插件
      await this.plugins.unloadAll();
      
      // 3. 清理服务
      await this.services.cleanup();
      
      // 4. 标记关闭完成
      this._shutdown = true;
      this.state.set('shutdown');
      
      // 5. 触发关闭完成事件
      await this.events.emit('kernel:shutdown:after', { kernel: this });
    } catch (error) {
      this.state.set('error', error);
      throw error;
    }
  }

  /**
   * 获取服务
   */
  get(serviceName) {
    return this.services.get(serviceName);
  }

  /**
   * 注册服务
   */
  register(serviceName, factory, options = {}) {
    return this.services.register(serviceName, factory, options);
  }

  /**
   * 订阅事件
   */
  on(event, handler, options = {}) {
    return this.events.on(event, handler, options);
  }

  /**
   * 触发事件
   */
  async emit(event, data) {
    return this.events.emit(event, data);
  }

  /**
   * 获取内核状态
   */
  getStatus() {
    return {
      state: this.state.get(),
      initialized: this._initialized,
      shutdown: this._shutdown,
      plugins: this.plugins.getStatus(),
      services: this.services.getStatus(),
    };
  }

  /**
   * 注册核心服务
   * @private
   */
  _registerCoreServices() {
    // 注册配置服务
    this.services.register('config', () => this.config, { singleton: true });
    
    // 注册事件总线服务
    this.services.register('events', () => this.events, { singleton: true });
    
    // 注册日志服务（占位，将被logger插件覆盖）
    this.services.register('logger', () => ({
      info: (...args) => console.log('[INFO]', ...args),
      warn: (...args) => console.warn('[WARN]', ...args),
      error: (...args) => console.error('[ERROR]', ...args),
      debug: (...args) => console.debug('[DEBUG]', ...args),
    }), { singleton: true });
  }
}

export default Kernel;
