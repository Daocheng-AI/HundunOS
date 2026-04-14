/**
 * HundunOS v4.3 - 环境变量管理器
 * 统一管理环境变量，提供默认值和错误处理
 */

/**
 * 环境变量管理器
 */
export class EnvManager {
  constructor() {
    this._cache = new Map();
  }

  /**
   * 获取环境变量值
   * @param {string} key - 环境变量键名
   * @param {*} defaultValue - 默认值
   * @param {Function} [transformer] - 值转换器
   * @returns {*} 环境变量值或默认值
   */
  get(key, defaultValue = null, transformer = null) {
    // 检查缓存
    if (this._cache.has(key)) {
      return this._cache.get(key);
    }

    // 获取环境变量
    const value = process.env[key];

    // 如果环境变量不存在，返回默认值
    if (value === undefined) {
      this._cache.set(key, defaultValue);
      return defaultValue;
    }

    // 应用转换器
    let transformedValue = value;
    if (transformer) {
      try {
        transformedValue = transformer(value);
      } catch (error) {
        console.warn(`[EnvManager] Failed to transform value for ${key}:`, error.message);
        transformedValue = defaultValue;
      }
    }

    // 缓存结果
    this._cache.set(key, transformedValue);
    return transformedValue;
  }

  /**
   * 获取布尔类型的环境变量
   * @param {string} key - 环境变量键名
   * @param {boolean} defaultValue - 默认值
   * @returns {boolean} 环境变量值或默认值
   */
  getBoolean(key, defaultValue = false) {
    return this.get(key, defaultValue, (value) => {
      const lowerValue = value.toLowerCase();
      return lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes';
    });
  }

  /**
   * 获取数字类型的环境变量
   * @param {string} key - 环境变量键名
   * @param {number} defaultValue - 默认值
   * @returns {number} 环境变量值或默认值
   */
  getNumber(key, defaultValue = 0) {
    return this.get(key, defaultValue, (value) => {
      const num = parseInt(value, 10);
      return isNaN(num) ? defaultValue : num;
    });
  }

  /**
   * 获取数组类型的环境变量（以逗号分隔）
   * @param {string} key - 环境变量键名
   * @param {Array} defaultValue - 默认值
   * @returns {Array} 环境变量值或默认值
   */
  getArray(key, defaultValue = []) {
    return this.get(key, defaultValue, (value) => {
      return value.split(',').map(item => item.trim()).filter(Boolean);
    });
  }

  /**
   * 要求必须存在的环境变量
   * @param {string} key - 环境变量键名
   * @param {string} [errorMessage] - 错误消息
   * @returns {string} 环境变量值
   * @throws {Error} 如果环境变量不存在
   */
  require(key, errorMessage = null) {
    const value = process.env[key];
    if (value === undefined) {
      throw new Error(errorMessage || `Required environment variable ${key} is not set`);
    }
    return value;
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this._cache.clear();
  }

  /**
   * 获取所有环境变量
   * @returns {Object} 所有环境变量
   */
  getAll() {
    return { ...process.env };
  }
}

// 导出单例实例
export const envManager = new EnvManager();
export default envManager;