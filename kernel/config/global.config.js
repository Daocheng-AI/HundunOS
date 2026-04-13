// hundunos/kernel/config/global.config.js
// 全局配置类（纯 ESM，无装饰器语法）

import { KernelConfig } from './kernel.config.js';
import { ModelRouterConfig } from './model-router.config.js';
import { RestApiConfig } from './rest-api.config.js';
import { StorageConfig } from './storage.config.js';

/**
 * 环境枚举
 */
const environmentSchema = ['development', 'testing', 'production'];

/**
 * 读取环境变量（同步）
 */
const readEnv = (envName, defaultVal) => {
  if (envName in process.env) return process.env[envName];
  return defaultVal;
};

/**
 * 平台配置
 */
export class PlatformConfig {
  os = 'windows';
  workspace = '.';
  pythonPath = 'python';
  nodePath = 'node';
  constructor() {
    if (process.env.PLATFORM_OS) this.os = process.env.PLATFORM_OS;
    if (process.env.PLATFORM_WORKSPACE) this.workspace = process.env.PLATFORM_WORKSPACE;
    if (process.env.PLATFORM_PYTHON_PATH) this.pythonPath = process.env.PLATFORM_PYTHON_PATH;
    if (process.env.PLATFORM_NODE_PATH) this.nodePath = process.env.PLATFORM_NODE_PATH;
  }
}

/**
 * 消息总线配置
 */
export class MessageBusConfig {
  ackTimeout = 5000;
  maxRetries = 3;
  persistenceEnabled = false;
  constructor() {
    const v = parseInt(process.env.MESSAGE_BUS_ACK_TIMEOUT, 10);
    if (!isNaN(v)) this.ackTimeout = v;
    const r = parseInt(process.env.MESSAGE_BUS_MAX_RETRIES, 10);
    if (!isNaN(r)) this.maxRetries = r;
    if (process.env.MESSAGE_BUS_PERSISTENCE_ENABLED === 'true') this.persistenceEnabled = true;
  }
}

/**
 * 工具桥接配置
 */
export class ToolBridgeConfig {
  toolsDir = './scripts/tools';
  timeout = 30000;
  sandboxEnabled = true;
  constructor() {
    if (process.env.TOOL_BRIDGE_TOOLS_DIR) this.toolsDir = process.env.TOOL_BRIDGE_TOOLS_DIR;
    const t = parseInt(process.env.TOOL_BRIDGE_TIMEOUT, 10);
    if (!isNaN(t)) this.timeout = t;
    if (process.env.TOOL_BRIDGE_SANDBOX_ENABLED === 'false') this.sandboxEnabled = false;
  }
}

/**
 * 技能配置
 */
export class SkillsConfig {
  enabled = true;
  dirs = ['./.claude/skills', './skills'];
  hotReload = false;
  constructor() {
    if (process.env.SKILLS_ENABLED === 'false') this.enabled = false;
    if (process.env.SKILLS_DIRS) this.dirs = process.env.SKILLS_DIRS.split(',').map(s => s.trim());
    if (process.env.SKILLS_HOT_RELOAD === 'true') this.hotReload = true;
  }
}

/**
 * 日志配置
 */
export class LoggingConfig {
  level = 'info';
  format = 'pretty';
  colors = true;
  filePath = './logs/hundunos.log';
  structured = false;
  constructor() {
    if (process.env.LOGGING_LEVEL) this.level = process.env.LOGGING_LEVEL;
    if (process.env.LOGGING_FORMAT) this.format = process.env.LOGGING_FORMAT;
    if (process.env.LOGGING_COLORS === 'false') this.colors = false;
    if (process.env.LOGGING_FILE_PATH) this.filePath = process.env.LOGGING_FILE_PATH;
    if (process.env.LOGGING_STRUCTURED === 'true') this.structured = true;
  }
}

/**
 * Rust 模块配置
 */
export class RustModulesConfig {
  enabled = true;
  mode = 'auto';
  tcpPort = 38082;
  socketPath = '\\\\.\\pipe\\hundunos';
  fallbackToJS = true;
  healthCheckInterval = 30000;
  constructor() {
    if (process.env.RUST_MODULES_ENABLED === 'false') this.enabled = false;
    if (process.env.RUST_MODULES_MODE) this.mode = process.env.RUST_MODULES_MODE;
    const p = parseInt(process.env.RUST_MODULES_TCP_PORT, 10);
    if (!isNaN(p)) this.tcpPort = p;
    if (process.env.RUST_MODULES_SOCKET_PATH) this.socketPath = process.env.RUST_MODULES_SOCKET_PATH;
    if (process.env.RUST_MODULES_FALLBACK_TO_JS === 'false') this.fallbackToJS = false;
    const h = parseInt(process.env.RUST_MODULES_HEALTH_CHECK_INTERVAL, 10);
    if (!isNaN(h)) this.healthCheckInterval = h;
  }
}

/**
 * 全局配置类
 */
export class GlobalConfig {
  version = '3.6.0';
  name = 'HundunOS';
  environment = 'development';
  kernel = new KernelConfig();
  modelRouter = new ModelRouterConfig();
  restApi = new RestApiConfig();
  storage = new StorageConfig();
  platform = new PlatformConfig();
  messageBus = new MessageBusConfig();
  toolBridge = new ToolBridgeConfig();
  skills = new SkillsConfig();
  logging = new LoggingConfig();
  rustModules = new RustModulesConfig();
  healthMonitorEnabled = true;
  permissionMode = 'default';
  auditLoggingEnabled = true;
  permissionGatingEnabled = true;
  privacyShieldEnabled = true;

  constructor() {
    if (process.env.HUNDUNOS_VERSION) this.version = process.env.HUNDUNOS_VERSION;
    if (process.env.HUNDUNOS_NAME) this.name = process.env.HUNDUNOS_NAME;
    if (environmentSchema.includes(process.env.NODE_ENV)) {
      this.environment = process.env.NODE_ENV;
    }
    if (process.env.HEALTH_MONITOR_ENABLED === 'false') this.healthMonitorEnabled = false;
    if (process.env.PERMISSION_MODE) this.permissionMode = process.env.PERMISSION_MODE;
    if (process.env.AUDIT_LOGGING_ENABLED === 'false') this.auditLoggingEnabled = false;
    if (process.env.PERMISSION_GATING_ENABLED === 'false') this.permissionGatingEnabled = false;
    if (process.env.PRIVACY_SHIELD_ENABLED === 'false') this.privacyShieldEnabled = false;
  }
}
