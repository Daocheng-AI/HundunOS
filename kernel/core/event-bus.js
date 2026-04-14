/**
 * HundunOS v4.3 - 事件总线
 * 实现模块间解耦通信，支持异步事件处理
 */

/**
 * 事件监听器包装器
 */
class EventListener {
  constructor(handler, options = {}) {
    this.handler = handler;
    this.once = options.once || false;
    this.priority = options.priority || 0;
    this.async = options.async !== false; // 默认异步执行
  }
}

/**
 * 事件总线
 */
export class EventBus {
  constructor(options = {}) {
    this.listeners = new Map();
    this.middleware = [];
    this.maxListeners = options.maxListeners || 100;
    this.wildcard = options.wildcard !== false; // 支持通配符
  }

  /**
   * 订阅事件
   * @param {string} event - 事件名称，支持通配符如 'user.*'
   * @param {Function} handler - 事件处理器
   * @param {Object} options - 配置选项
   */
  on(event, handler, options = {}) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    const listeners = this.listeners.get(event);
    if (listeners.length >= this.maxListeners) {
      console.warn(`[EventBus] Max listeners (${this.maxListeners}) reached for event: ${event}`);
    }

    const listener = new EventListener(handler, options);
    listeners.push(listener);
    
    // 按优先级排序
    listeners.sort((a, b) => b.priority - a.priority);

    // 返回取消订阅函数
    return () => this.off(event, handler);
  }

  /**
   * 订阅一次性事件
   * @param {string} event - 事件名称
   * @param {Function} handler - 事件处理器
   * @param {Object} options - 配置选项
   */
  once(event, handler, options = {}) {
    return this.on(event, handler, { ...options, once: true });
  }

  /**
   * 取消订阅
   * @param {string} event - 事件名称
   * @param {Function} handler - 事件处理器
   */
  off(event, handler) {
    const listeners = this.listeners.get(event);
    if (!listeners) return;

    const index = listeners.findIndex(l => l.handler === handler);
    if (index !== -1) {
      listeners.splice(index, 1);
    }

    // 清理空监听器数组
    if (listeners.length === 0) {
      this.listeners.delete(event);
    }
  }

  /**
   * 取消所有订阅
   * @param {string} event - 事件名称，不提供则取消所有
   */
  offAll(event) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * 触发事件
   * @param {string} event - 事件名称
   * @param {*} data - 事件数据
   * @returns {Promise<Array>} 所有处理器结果
   */
  async emit(event, data) {
    // 执行中间件
    let context = { event, data, stop: false };
    for (const middleware of this.middleware) {
      await middleware(context);
      if (context.stop) return [];
    }

    const results = [];
    const listeners = this._getListeners(event);

    if (listeners.length === 0) {
      return results;
    }

    // 并行执行所有监听器
    const promises = listeners.map(async (listener) => {
      try {
        const result = await listener.handler(context.data);
        
        // 一次性监听器自动移除
        if (listener.once) {
          this.off(event, listener.handler);
        }
        
        return { success: true, result };
      } catch (error) {
        console.error(`[EventBus] Handler error for event ${event}:`, error);
        return { success: false, error };
      }
    });

    return Promise.all(promises);
  }

  /**
   * 同步触发事件（不等待结果）
   * @param {string} event - 事件名称
   * @param {*} data - 事件数据
   */
  emitSync(event, data) {
    this.emit(event, data).catch(error => {
      console.error(`[EventBus] Emit error for event ${event}:`, error);
    });
  }

  /**
   * 添加中间件
   * @param {Function} middleware - 中间件函数
   */
  use(middleware) {
    this.middleware.push(middleware);
  }

  /**
   * 获取监听器数量
   * @param {string} event - 事件名称
   * @returns {number}
   */
  listenerCount(event) {
    const listeners = this.listeners.get(event);
    return listeners ? listeners.length : 0;
  }

  /**
   * 获取所有事件名称
   * @returns {Array<string>}
   */
  eventNames() {
    return Array.from(this.listeners.keys());
  }

  /**
   * 获取匹配事件的监听器（包括通配符匹配）
   * @private
   */
  _getListeners(event) {
    const allListeners = [];

    // 精确匹配
    if (this.listeners.has(event)) {
      allListeners.push(...this.listeners.get(event));
    }

    // 通配符匹配
    if (this.wildcard) {
      for (const [pattern, listeners] of this.listeners) {
        if (pattern.includes('*') && this._matchWildcard(event, pattern)) {
          allListeners.push(...listeners);
        }
      }
    }

    // 全局监听器
    if (this.listeners.has('*')) {
      allListeners.push(...this.listeners.get('*'));
    }

    // 按优先级排序
    return allListeners.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 通配符匹配
   * @private
   */
  _matchWildcard(event, pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(event);
  }
}

// 导出全局事件总线实例
export const eventBus = new EventBus();
export default eventBus;
