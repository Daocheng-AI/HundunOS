// hundunos/kernel/config/global.config.js
// 全局配置类

import { Config, Env, Nested } from './decorators.js';
import { KernelConfig } from './kernel.config.js';
import { ModelRouterConfig } from './model-router.config.js';
import { RestApiConfig } from './rest-api.config.js';
import { StorageConfig } from './storage.config.js';

/**
 * 环境枚举
 */
const environmentSchema = z.enum(['development', 'testing', 'production']);

/**
 * 平台配置
 */
@Config
export class PlatformConfig {
  /** 操作系统 */
  @Env('PLATFORM_OS')
  os = 'windows';

  /** 工作空间 */
  @Env('PLATFORM_WORKSPACE')
  workspace = '.';

  /** Python 路径 */
  @Env('PLATFORM_PYTHON_PATH')
  pythonPath = 'python';

  /** Node.js 路径 */
  @Env('PLATFORM_NODE_PATH')
  nodePath = 'node';
}

/**
 * 消息总线配置
 */
@Config
export class MessageBusConfig {
  /** 确认超时时间（毫秒） */
  @Env('MESSAGE_BUS_ACK_TIMEOUT')
  ackTimeout = 5000;

  /** 最大重试次数 */
  @Env('MESSAGE_BUS_MAX_RETRIES')
  maxRetries = 3;

  /** 是否启用持久化 */
  @Env('MESSAGE_BUS_PERSISTENCE_ENABLED')
  persistenceEnabled = false;
}

/**
 * 工具桥接配置
 */
@Config
export class ToolBridgeConfig {
  /** 工具目录 */
  @Env('TOOL_BRIDGE_TOOLS_DIR')
  toolsDir = './scripts/tools';

  /** 超时时间（毫秒） */
  @Env('TOOL_BRIDGE_TIMEOUT')
  timeout = 30000;

  /** 是否启用沙箱 */
  @Env('TOOL_BRIDGE_SANDBOX_ENABLED')
  sandboxEnabled = true;
}

/**
 * 技能配置
 */
@Config
export class SkillsConfig {
  /** 是否启用技能系统 */
  @Env('SKILLS_ENABLED')
  enabled = true;

  /** 技能目录列表 */
  @Env('SKILLS_DIRS')
  dirs = ['./.claude/skills', './skills'];

  /** 是否启用热重载 */
  @Env('SKILLS_HOT_RELOAD')
  hotReload = false;
}

/**
 * 日志配置
 */
@Config
export class LoggingConfig {
  /** 日志级别 */
  @Env('LOGGING_LEVEL')
  level = 'info';

  /** 日志格式 */
  @Env('LOGGING_FORMAT')
  format = 'pretty';

  /** 是否启用彩色输出 */
  @Env('LOGGING_COLORS')
  colors = true;

  /** 日志文件路径 */
  @Env('LOGGING_FILE_PATH')
  filePath = './logs/hundunos.log';

  /** 是否启用结构化日志 */
  @Env('LOGGING_STRUCTURED')
  structured = false;
}

/**
 * Rust 模块配置
 */
@Config
export class RustModulesConfig {
  /** 是否启用 Rust 模块 */
  @Env('RUST_MODULES_ENABLED')
  enabled = true;

  /** 运行模式 */
  @Env('RUST_MODULES_MODE')
  mode = 'auto';

  /** TCP 端口 */
  @Env('RUST_MODULES_TCP_PORT')
  tcpPort = 38082;

  /** Socket 路径 */
  @Env('RUST_MODULES_SOCKET_PATH')
  socketPath = '\\\\.\\pipe\\hundunos';

  /** 是否回退到 JS */
  @Env('RUST_MODULES_FALLBACK_TO_JS')
  fallbackToJS = true;

  /** 健康检查间隔（毫秒） */
  @Env('RUST_MODULES_HEALTH_CHECK_INTERVAL')
  healthCheckInterval = 30000;
}

/**
 * 全局配置类
 */
@Config
export class GlobalConfig {
  /** 版本号 */
  @Env('HUNDUNOS_VERSION')
  version = '3.6.0';

  /** 系统名称 */
  @Env('HUNDUNOS_NAME')
  name = 'HundunOS';

  /** 运行环境 */
  @Env('NODE_ENV', environmentSchema)
  environment = 'development';

  /** 内核配置 */
  @Nested
  kernel = new KernelConfig();

  /** 模型路由器配置 */
  @Nested
  modelRouter = new ModelRouterConfig();

  /** REST API 配置 */
  @Nested
  restApi = new RestApiConfig();

  /** 存储配置 */
  @Nested
  storage = new StorageConfig();

  /** 平台配置 */
  @Nested
  platform = new PlatformConfig();

  /** 消息总线配置 */
  @Nested
  messageBus = new MessageBusConfig();

  /** 工具桥接配置 */
  @Nested
  toolBridge = new ToolBridgeConfig();

  /** 技能配置 */
  @Nested
  skills = new SkillsConfig();

  /** 日志配置 */
  @Nested
  logging = new LoggingConfig();

  /** Rust 模块配置 */
  @Nested
  rustModules = new RustModulesConfig();

  /** 是否启用健康监控 */
  @Env('HEALTH_MONITOR_ENABLED')
  healthMonitorEnabled = true;

  /** 权限模式 */
  @Env('PERMISSION_MODE')
  permissionMode = 'default';

  /** 是否启用审计日志 */
  @Env('AUDIT_LOGGING_ENABLED')
  auditLoggingEnabled = true;

  /** 是否启用权限门控 */
  @Env('PERMISSION_GATING_ENABLED')
  permissionGatingEnabled = true;

  /** 是否启用隐私保护 */
  @Env('PRIVACY_SHIELD_ENABLED')
  privacyShieldEnabled = true;
}
