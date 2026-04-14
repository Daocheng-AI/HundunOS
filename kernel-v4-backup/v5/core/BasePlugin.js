/**
 * HundunOS v5.0 - 插件基类
 * 所有插件必须继承此类
 */

/**
 * 插件基类
 */
export class BasePlugin {
  constructor(kernel, config = {}) {
    this.kernel = kernel;
    this.config = config;
    this.logger = null;
    this._initialized = false;
  }

  /**
   * 插件名称（必须重写）
   */
  get name() {
    throw new Error('Plugin must define name getter');
  }

  /**
   * 插件版本（必须重写）
   */
  get version() {
    return '1.0.0';
  }

  /**
   * 依赖的插件列表
   */
  get dependencies() {
    return [];
  }

  /**
   * 初始化插件
   * @param {Kernel} kernel - 内核实例
   */
  async init(kernel) {
    if (this._initialized) {
      throw new Error(`Plugin ${this.name} already initialized`);
    }

    // 获取日志服务
    this.logger = kernel.get('logger').child(this.name);
    
    this.logger.info(`Initializing plugin ${this.name} v${this.version}`);

    try {
      await this.onInit();
      this._initialized = true;
      this.logger.info(`Plugin ${this.name} initialized successfully`);
    } catch (error) {
      this.logger.error(`Failed to initialize plugin ${this.name}:`, error);
      throw error;
    }
  }

  /**
   * 销毁插件
   */
  async destroy() {
    if (!this._initialized) return;

    this.logger.info(`Destroying plugin ${this.name}`);

    try {
      await this.onDestroy();
      this._initialized = false;
      this.logger.info(`Plugin ${this.name} destroyed`);
    } catch (error) {
      this.logger.error(`Error destroying plugin ${this.name}:`, error);
      throw error;
    }
  }

  /**
   * 获取健康状态
   */
  getHealth() {
    return {
      name: this.name,
      version: this.version,
      initialized: this._initialized,
      status: this._initialized ? 'healthy' : 'not_initialized',
    };
  }

  /**
   * 初始化钩子（子类重写）
   * @protected
   */
  async onInit() {
    // 子类实现
  }

  /**
   * 销毁钩子（子类重写）
   * @protected
   */
  async onDestroy() {
    // 子类实现
  }
}

export default BasePlugin;
