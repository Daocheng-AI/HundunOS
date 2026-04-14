/**
 * HundunOS v5.0 - 内核状态管理
 * 跟踪内核生命周期状态
 */

/**
 * 内核状态
 */
export class KernelState {
  constructor() {
    this.state = 'created';
    this.history = [];
    this.error = null;
  }

  /**
   * 设置状态
   */
  set(newState, error = null) {
    this.history.push({
      from: this.state,
      to: newState,
      timestamp: Date.now(),
    });
    
    this.state = newState;
    if (error) {
      this.error = error;
    }
  }

  /**
   * 获取当前状态
   */
  get() {
    return this.state;
  }

  /**
   * 检查状态
   */
  is(state) {
    return this.state === state;
  }

  /**
   * 获取状态历史
   */
  getHistory() {
    return [...this.history];
  }

  /**
   * 获取错误信息
   */
  getError() {
    return this.error;
  }
}

export default KernelState;
