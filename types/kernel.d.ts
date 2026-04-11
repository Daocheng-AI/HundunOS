/**
 * HundunOS v3.0 - Core Kernel Type Definitions
 * 核心内核类型定义
 */

// ============================================================================
// 基础类型
// ============================================================================

/**
 * 消息类型
 */
export type MessageType = 'text' | 'file' | 'image' | 'audio' | 'video' | 'command';

/**
 * 意图类型
 */
export type IntentType = 'system' | 'file' | 'code' | 'search' | 'task' | 'chat' | 'unknown';

/**
 * 意图动作
 */
export type IntentAction = string;

/**
 * 模块状态
 */
export type ModuleStatus = 'idle' | 'active' | 'paused' | 'error' | 'disabled';

/**
 * 模块类型
 */
export type ModuleType = 'kernel' | 'stable' | 'extension' | 'tool';

// ============================================================================
// 消息与意图
// ============================================================================

/**
 * 标准化消息接口
 */
export interface Message {
  type: MessageType;
  content: string;
  sessionId: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * 意图接口
 */
export interface Intent {
  type: IntentType;
  action: IntentAction;
  raw: string;
  description: string;
  confidence: number;
  parameters?: Record<string, unknown>;
}

/**
 * 意图解析结果
 */
export interface IntentParseResult extends Intent {
  parameters?: {
    target?: string;
    query?: string;
    language?: string;
    content?: string;
    [key: string]: unknown;
  };
}

// ============================================================================
// 模块系统
// ============================================================================

/**
 * 模块描述符
 */
export interface ModuleDescriptor {
  id: string;
  name: string;
  type: ModuleType;
  status: ModuleStatus;
  instance?: ModuleInstance;
  metadata?: Record<string, unknown>;
}

/**
 * 模块实例接口
 */
export interface ModuleInstance {
  initialize?: () => Promise<void> | void;
  execute: (intent: Intent, session: Session) => Promise<ModuleResult>;
  shutdown?: () => Promise<void> | void;
}

/**
 * 模块执行结果
 */
export interface ModuleResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 会话上下文
 */
export interface Session {
  id: string;
  created: number;
  context: SessionContext;
  aware?: AwareContext;
}

/**
 * 会话上下文数据
 */
export interface SessionContext {
  sessionId: string;
  created: number;
  working: unknown[];
  recent: unknown[];
}

/**
 * 感知上下文
 */
export interface AwareContext {
  pattern?: string;
  confidence?: number;
  history?: unknown[];
}

// ============================================================================
// 系统配置
// ============================================================================

/**
 * 系统配置接口
 */
export interface SystemConfig {
  version: string;
  name: string;
  environment: string;
  kernel: KernelConfig;
  modules: ModulesConfig;
  modelRouter: ModelRouterConfig;
  storage: StorageConfig;
  messageBus: MessageBusConfig;
  platform: PlatformConfig;
  toolBridge: ToolBridgeConfig;
  upgrade: UpgradeConfig;
}

/**
 * 内核配置
 */
export interface KernelConfig {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  maxRetries: number;
  timeout: number;
}

/**
 * 模块配置映射
 */
export interface ModulesConfig {
  [key: string]: {
    enabled: boolean;
    path: string;
  };
}

/**
 * 模型路由配置
 */
export interface ModelRouterConfig {
  defaultStrategy: ModelStrategy;
  providers: string[];
  localFirst: boolean;
  endpoint: string;
  localModel: string;
  localMaxTokens: number;
  requestTimeout: number;
  circuitBreaker: CircuitBreakerConfig;
}

/**
 * 模型策略类型
 */
export type ModelStrategy = 'COST_FIRST' | 'BALANCED' | 'QUALITY_FIRST';

/**
 * 熔断器配置
 */
export interface CircuitBreakerConfig {
  enabled: boolean;
  threshold: number;
  timeout: number;
}

/**
 * 存储配置
 */
export interface StorageConfig {
  type: 'json' | 'sqlite';
  path: string;
}

/**
 * 消息总线配置
 */
export interface MessageBusConfig {
  ackTimeout: number;
  maxRetries: number;
}

/**
 * 平台配置
 */
export interface PlatformConfig {
  os: 'windows' | 'linux' | 'macos';
  workspace: string;
  pythonPath: string;
  nodePath: string;
}

/**
 * 工具桥接配置
 */
export interface ToolBridgeConfig {
  toolsDir: string;
  timeout: number;
}

/**
 * 升级配置
 */
export interface UpgradeConfig {
  trustedSources: string[];
  allowedPatterns: string[];
  requireSignature: boolean;
  requireHash: boolean;
  targetVersion: string;
}

// ============================================================================
// 内核状态
// ============================================================================

/**
 * 内核状态接口
 */
export interface KernelState {
  initialized: boolean;
  running: boolean;
  modules: Map<string, ModuleDescriptor>;
  sessions: Map<string, Session>;
  version: string;
}

/**
 * 内核配置对象
 */
export interface KernelConfigObject {
  workspace: string;
  projectRoot: string;
  storageDir: string;
  systemConfigPath: string;
  system: SystemConfig;
}

// ============================================================================
// 处理结果
// ============================================================================

/**
 * 核心处理结果
 */
export interface ProcessResult {
  success: boolean;
  type: IntentType;
  data: ModuleResult;
  latency: number;
  aware?: Record<string, unknown>;
  timestamp: number;
}

/**
 * 系统状态
 */
export interface SystemStatus {
  version: string;
  running: boolean;
  uptime: number;
  platform?: string;
  modules: ModuleStats;
  aware: AwareStats;
  health: HealthReport;
}

/**
 * 模块统计
 */
export interface ModuleStats {
  total: number;
  active: number;
  idle: number;
  error: number;
}

/**
 * 感知统计
 */
export interface AwareStats {
  pattern?: string;
  confidence?: number;
  tasksProcessed?: number;
}

/**
 * 健康报告
 */
export interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  issues?: HealthIssue[];
}

/**
 * 健康问题
 */
export interface HealthIssue {
  name: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
}

// ============================================================================
// 事件类型
// ============================================================================

/**
 * 内核事件类型
 */
export type KernelEventType =
  | 'kernel:ready'
  | 'kernel:error'
  | 'kernel:shutdown'
  | 'module:registered'
  | 'module:activated'
  | 'module:deactivated'
  | 'message:processed'
  | 'intent:parsed';

/**
 * 内核事件接口
 */
export interface KernelEvent {
  type: KernelEventType;
  timestamp: number;
  data?: unknown;
}

// ============================================================================
// 环境检测
// ============================================================================

/**
 * 环境信息
 */
export interface Environment {
  platform: 'windows' | 'linux' | 'macos';
  nodeVersion: string;
  python?: {
    available: boolean;
    version?: string;
    path?: string;
  };
  ollama?: {
    available: boolean;
    version?: string;
  };
}

// ============================================================================
// 权限与安全
// ============================================================================

/**
 * 权限级别
 */
export type PermissionLevel = 'super' | 'admin' | 'execute' | 'write' | 'read' | 'guest';

/**
 * 权限检查结果
 */
export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  source?: 'rbac' | 'gating' | 'cowork';
  approvalId?: string;
  requiresApproval?: boolean;
}

/**
 * 隐私检查结果
 */
export interface PrivacyResult {
  allowed: boolean;
  reason?: string;
  level?: 0 | 1 | 2 | 3;
  redacted?: boolean;
  redactedContent?: string;
}
