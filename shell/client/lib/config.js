/**
 * hundunos-client/lib/config.js
 * 配置管理 — 支持默认配置 + 用户覆盖 + 环境变量
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 默认配置
const DEFAULT_CONFIG = {
  daemon: {
    autoStart: true,
    restartOnCrash: true,
    maxRetries: 3,
    heartbeatInterval: 5000,
    logLevel: 'info',
    ipcPort: 38081,
    shutdownTimeout: 10000,
  },
  api: {
    enabled: true,
    port: 38082,
    apiKeys: [],
    cors: true,
    rateLimit: {
      windowMs: 60000,
      maxRequests: 120,
    },
  },
  gui: {
    theme: 'auto',
    fontSize: 14,
    startMinimized: false,
    closeToTray: true,
    windowWidth: 1100,
    windowHeight: 750,
  },
  kernel: {
    projectRoot: '..',
    port: 38080,
    apiKey: '',
  },
  logging: {
    maxFiles: 5,
    maxSize: '10m',
    dir: 'logs',
  },
};

// 加载配置文件
function loadConfig() {
  const configPath = getConfigPath();
  if (existsSync(configPath)) {
    try {
      const userConfig = JSON.parse(readFileSync(configPath, 'utf8'));
      return deepMerge(DEFAULT_CONFIG, userConfig);
    } catch (e) {
      console.warn('[Config] Failed to load config, using defaults:', e.message);
    }
  }
  return { ...DEFAULT_CONFIG };
}

// 保存配置
function saveConfig(config) {
  const configPath = getConfigPath();
  try {
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[Config] Failed to save config:', e.message);
    return false;
  }
}

// 获取配置路径 (用户目录优先)
function getConfigPath() {
  const envPath = process.env.HUNDUNOS_CLIENT_CONFIG;
  if (envPath) return envPath;

  const home = process.env.APPDATA || process.env.HOME || '';
  const platform = process.platform;

  if (platform === 'win32') {
    return join(home, 'hundunos-client', 'config.json');
  }
  return join(home, '.config', 'hundunos-client', 'config.json');
}

// 深度合并
function deepMerge(base = {}, override = {}) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      result[key] = deepMerge(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// 单例
let _config = null;

export function getConfig() {
  if (!_config) _config = loadConfig();
  return _config;
}

export function setConfig(updates) {
  _config = deepMerge(_config || loadConfig(), updates);
  return saveConfig(_config);
}

export function resetConfig() {
  _config = { ...DEFAULT_CONFIG };
  return saveConfig(_config);
}

export { getConfigPath, DEFAULT_CONFIG };
