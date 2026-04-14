/**
 * HundunOS v5.0 - 事件总线
 * 高性能、支持中间件的事件系统
 */

/**
 * 事件监听器
 */
class EventListener {
  constructor(handler, options = {}) {
    this.handler = handler;
    this.once = options.once || false;
    this.priority = options.priority || 0;
    this.async = options.async !== false;
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
    this.wildcard = options.wildcard !== false;
  }

  /**
   * 订阅事件
   */
  on(event, handler, options = {}) {
    // 参数验证
    if (typeof event !== 'string') {
      throw new Error(`Event name must be a string, got ${typeof event}`);
    }
    if (typeof handler !== 'function') {
      throw new Error(`Event handler must be a function, got ${typeof handler}`);
    }
    
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    const listeners = this.listeners.get(event);
    if (listeners.length >= this.maxListeners) {
      console.warn(`[EventBus] Max listeners (${this.maxListeners}) reached for: ${event}`);
    }

    const listener = new EventListener(handler, options);
    listeners.push(listener);
    listeners.sort((a, b) => b.priority - a.priority);

    // 返回取消订阅函数
    return () => this.off(event, handler);
  }

  /**
   * 订阅一次性事件
   */
  once(event, handler, options = {}) {
    return this.on(event, handler, { ...options, once: true });
  }

  /**
   * 取消订阅
   */
  off(event, handler) {
    const listeners = this.listeners.get(event);
    if (!listeners) return;

    const index = listeners.findIndex(l => l.handler === handler);
    if (index !== -1) {
      listeners.splice(index, 1);
    }

    if (listeners.length === 0) {
      this.listeners.delete(event);
    }
  }

  /**
   * 触发事件
   */
  async emit(event, data) {
    // 执行中间件
    let context = { event, data, stop: false };
    for (const middleware of this.middleware) {
      await middleware(context);
      if (context.stop) return [];
    }

    const listeners = this._getListeners(event);
    if (listeners.length === 0) return [];

    // 并行执行监听器
    const promises = listeners.map(async (listener) => {
      try {
        const result = await listener.handler(context.data);
        if (listener.once) {
          this.off(event, listener.handler);
        }
        return { success: true, result };
      } catch (error) {
        console.error(`[EventBus] Handler error for ${event}:`, error);
        return { success: false, error };
      }
    });

    return Promise.all(promises);
  }

  /**
   * 同步触发（不等待结果）
   */
  emitSync(event, data) {
    this.emit(event, data).catch(console.error);
  }

  /**
   * 添加中间件
   */
  use(middleware) {
    this.middleware.push(middleware);
  }

  /**
   * 获取监听器数量
   */
  listenerCount(event) {
    const listeners = this.listeners.get(event);
    return listeners ? listeners.length : 0;
  }

  /**
   * 清空所有监听器
   */
  clear() {
    this.listeners.clear();
  }

  /**
   * 获取匹配的监听器
   * @private
   */
  _getListeners(event) {
    const all = [];

    // 精确匹配
    if (this.listeners.has(event)) {
      all.push(...this.listeners.get(event));
    }

    // 通配符匹配
    if (this.wildcard) {
      for (const [pattern, listeners] of this.listeners.entries()) {
        if (typeof pattern === 'string' && pattern.includes('*') && this._matchWildcard(event, pattern)) {
          all.push(...listeners);
        }
      }
    }

    // 全局监听器
    if (this.listeners.has('*')) {
      all.push(...this.listeners.get('*'));
    }

    return all.sort((a, b) => b.priority - a.priority);
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

export default EventBus;
