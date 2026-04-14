// hundunos/kernel/di/services/config.service.js
// 配置服务

/**
 * 配置服务类
 */
export class ConfigService {
  /**
   * 构造函数
   */
  constructor() {
    this.config = {};
  }

  /**
   * 设置配置
   * @param {Object} config - 配置对象
   */
  setConfig(config) {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取配置
   * @param {string} key - 配置键（支持点号分隔的路径）
   * @param {*} [defaultValue] - 默认值
   * @returns {*} 配置值
   */
  get(key, defaultValue) {
    const keys = key.split('.');
    let value = this.config;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }

    return value;
  }

  /**
   * 设置单个配置值
   * @param {string} key - 配置键
   * @param {*} value - 配置值
   */
  set(key, value) {
    const keys = key.split('.');
    let obj = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in obj) || typeof obj[k] !== 'object') {
        obj[k] = {};
      }
      obj = obj[k];
    }

    obj[keys[keys.length - 1]] = value;
  }

  /**
   * 检查配置是否存在
   * @param {string} key - 配置键
   * @returns {boolean} 是否存在
   */
  has(key) {
    return this.get(key) !== undefined;
  }

  /**
   * 获取所有配置
   * @returns {Object} 配置对象
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * 清空配置
   */
  clear() {
    this.config = {};
  }
}
