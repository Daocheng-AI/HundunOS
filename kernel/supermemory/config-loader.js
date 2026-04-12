/**
 * Supermemory 配置加载器
 *
 * 负责从 HundunOS 系统配置和环境变量中加载 Supermemory 配置，
 * 并进行验证和默认值处理。
 */

const fs = require('fs');
const path = require('path');

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
  apiKey: '',
  baseUrl: 'https://api.supermemory.ai/v3',
  apiVersion: 'v3',
  containerTagStrategy: 'user',
  customContainerTag: '',
  cache: {
    enabled: true,
    ttl: 600000, // 10 分钟
    maxSize: 1000,
    persistent: false
  },
  retry: {
    maxAttempts: 3,
    delay: 1000,
    backoffMultiplier: 2
  },
  timeout: {
    connect: 5000,
    read: 5000
  },
  batch: {
    enabled: true,
    maxBatchSize: 100,
    maxConcurrentBatches: 5
  },
  sync: {
    enabled: false,
    interval: 3600000, // 1 小时
    autoResolveConflicts: false
  },
  autoSave: {
    enabled: true,
    mode: 'smart'
  },
  offline: {
    enabled: true,
    autoReconnect: true,
    reconnectInterval: 30000
  },
  monitoring: {
    enabled: true,
    logLevel: 'info',
    alertThreshold: {
      errorRate: 0.1, // 10%
      responseTime: 5000
    }
  }
};

/**
 * 加载 Supermemory 配置
 * @param {Object} kernelConfig - HundunOS 内核配置
 * @returns {Object} Supermemory 配置对象
 */
function loadSupermemoryConfig(kernelConfig) {
  // 从系统配置中获取 Supermemory 配置
  const systemConfig = kernelConfig?.supermemory || {};

  // 构建完整配置
  const config = {
    ...DEFAULT_CONFIG,
    ...systemConfig
  };

  // 从环境变量加载 API 密钥
  if (process.env.SUPERMEMORY_API_KEY) {
    config.apiKey = process.env.SUPERMEMORY_API_KEY;
  }

  // 从环境变量加载基础 URL
  if (process.env.SUPERMEMORY_BASE_URL) {
    config.baseUrl = process.env.SUPERMEMORY_BASE_URL;
  }

  // 合并嵌套配置
  if (systemConfig.cache) {
    config.cache = { ...DEFAULT_CONFIG.cache, ...systemConfig.cache };
  }

  if (systemConfig.retry) {
    config.retry = { ...DEFAULT_CONFIG.retry, ...systemConfig.retry };
  }

  if (systemConfig.timeout) {
    config.timeout = { ...DEFAULT_CONFIG.timeout, ...systemConfig.timeout };
  }

  if (systemConfig.batch) {
    config.batch = { ...DEFAULT_CONFIG.batch, ...systemConfig.batch };
  }

  if (systemConfig.sync) {
    config.sync = { ...DEFAULT_CONFIG.sync, ...systemConfig.sync };
  }

  if (systemConfig.autoSave) {
    config.autoSave = { ...DEFAULT_CONFIG.autoSave, ...systemConfig.autoSave };
  }

  if (systemConfig.offline) {
    config.offline = { ...DEFAULT_CONFIG.offline, ...systemConfig.offline };
  }

  if (systemConfig.monitoring) {
    config.monitoring = { ...DEFAULT_CONFIG.monitoring, ...systemConfig.monitoring };
    if (systemConfig.monitoring.alertThreshold) {
      config.monitoring.alertThreshold = {
        ...DEFAULT_CONFIG.monitoring.alertThreshold,
        ...systemConfig.monitoring.alertThreshold
      };
    }
  }

  return config;
}

/**
 * 验证 Supermemory 配置
 * @param {Object} config - Supermemory 配置对象
 * @returns {Object} 验证结果
 */
function validateSupermemoryConfig(config) {
  const errors = [];
  const warnings = [];

  // 验证必需字段
  if (!config.apiKey) {
    errors.push('Supermemory API 密钥未配置。请设置 SUPERMEMORY_API_KEY 环境变量或在 system.json 中配置 supermemory.apiKey');
  } else if (typeof config.apiKey !== 'string' || config.apiKey.trim() === '') {
    errors.push('Supermemory API 密钥格式无效');
  }

  // 验证 URL
  if (config.baseUrl && !isValidUrl(config.baseUrl)) {
    errors.push(`Supermemory 基础 URL 无效: ${config.baseUrl}`);
  }

  // 验证容器标签策略
  if (!['user', 'project', 'custom'].includes(config.containerTagStrategy)) {
    errors.push(`容器标签策略无效: ${config.containerTagStrategy}，必须是 'user'、'project' 或 'custom'`);
  }

  // 如果策略是 custom，必须提供自定义标签
  if (config.containerTagStrategy === 'custom' && !config.customContainerTag) {
    errors.push('容器标签策略为 custom 时，必须提供 customContainerTag');
  }

  // 验证缓存配置
  if (config.cache.enabled) {
    if (config.cache.ttl <= 0) {
      errors.push('缓存 TTL 必须大于 0');
    }
    if (config.cache.maxSize <= 0) {
      errors.push('缓存最大大小必须大于 0');
    }
  }

  // 验证重试配置
  if (config.retry.maxAttempts < 0) {
    errors.push('最大重试次数不能为负数');
  }
  if (config.retry.delay < 0) {
    errors.push('重试延迟不能为负数');
  }
  if (config.retry.backoffMultiplier < 1) {
    errors.push('退避倍数必须大于等于 1');
  }

  // 验证超时配置
  if (config.timeout.connect <= 0) {
    errors.push('连接超时必须大于 0');
  }
  if (config.timeout.read <= 0) {
    errors.push('读取超时必须大于 0');
  }

  // 验证批量操作配置
  if (config.batch.enabled) {
    if (config.batch.maxBatchSize <= 0) {
      errors.push('批量大小必须大于 0');
    }
    if (config.batch.maxConcurrentBatches <= 0) {
      errors.push('最大并发批数必须大于 0');
    }
  }

  // 验证同步配置
  if (config.sync.enabled) {
    if (config.sync.interval <= 0) {
      errors.push('同步间隔必须大于 0');
    }
  }

  // 验证自动保存配置
  if (!['always', 'smart'].includes(config.autoSave.mode)) {
    errors.push(`自动保存模式无效: ${config.autoSave.mode}，必须是 'always' 或 'smart'`);
  }

  // 验证离线模式配置
  if (config.offline.reconnectInterval <= 0) {
    errors.push('重连间隔必须大于 0');
  }

  // 验证监控配置
  if (!['debug', 'info', 'warn', 'error'].includes(config.monitoring.logLevel)) {
    errors.push(`日志级别无效: ${config.monitoring.logLevel}，必须是 'debug'、'info'、'warn' 或 'error'`);
  }

  // 警告
  if (!config.apiKey) {
    warnings.push('未配置 Supermemory API 密钥，Supermemory 功能将不可用');
  }

  if (config.cache.enabled && config.cache.persistent) {
    warnings.push('持久化缓存已启用，需要确保数据库可用');
  }

  if (config.sync.enabled) {
    warnings.push('同步功能已启用，请注意网络连接和同步性能影响');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * 检查 URL 是否有效
 * @param {string} url - URL 字符串
 * @returns {boolean} 是否有效
 */
function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 获取 Supermemory 配置
 * @param {Object} kernel - HundunOS 内核实例
 * @returns {Object} Supermemory 配置对象
 * @throws {Error} 配置验证失败时抛出错误
 */
function getSupermemoryConfig(kernel) {
  // 加载配置
  const config = loadSupermemoryConfig(kernel?.config || {});

  // 验证配置
  const validation = validateSupermemoryConfig(config);

  // 输出警告
  if (validation.warnings.length > 0) {
    console.warn('[Supermemory] 配置警告:');
    validation.warnings.forEach(warning => {
      console.warn(`  - ${warning}`);
    });
  }

  // 如果配置无效，抛出错误
  if (!validation.valid) {
    const errorMessages = validation.errors.map(err => `  - ${err}`).join('\n');
    throw new Error(`Supermemory 配置验证失败:\n${errorMessages}`);
  }

  return config;
}

/**
 * 检查 Supermemory 是否启用
 * @param {Object} kernel - HundunOS 内核实例
 * @returns {boolean} 是否启用
 */
function isSupermemoryEnabled(kernel) {
  const config = kernel?.config?.supermemory;
  return config && config.enabled !== false;
}

module.exports = {
  loadSupermemoryConfig,
  validateSupermemoryConfig,
  getSupermemoryConfig,
  isSupermemoryEnabled,
  DEFAULT_CONFIG
};
