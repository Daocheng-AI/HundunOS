/**
 * HundunOS v3.0 - Edict (三省六部) Type Definitions
 * 任务调度系统类型定义
 */

import { Intent, ModuleResult } from './kernel.d.ts';

// ============================================================================
// 任务类型
// ============================================================================

/**
 * 任务类型
 */
export type TaskType =
  | 'media_operation'      // 媒体运营
  | 'knowledge_system'      // 知识系统
  | 'document'              // 文档
  | 'code_project'          // 代码项目
  | 'general';              // 通用

/**
 * 任务状态
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

/**
 * 阶段状态
 */
export type StageStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

// ============================================================================
// 三省六部架构
// ============================================================================

/**
 * 六部类型
 */
export type MinistryType =
  | 'bing'      // 兵部 - 技术实现与编码
  | 'hu'        // 户部 - 数据处理与分析
  | 'gong'      // 工部 - 工程与系统操作
  | 'li'        // 礼部 - 文档撰写
  | 'xing'      // 刑部 - 审核与检查
  | 'li';       // 吏部 - 资源调度

/**
 * 任务阶段
 */
export interface TaskStage {
  id: string;
  name: string;
  status: StageStatus;
  ministry?: MinistryType;
  startedAt?: number;
  completedAt?: number;
  result?: ModuleResult;
  error?: string;
}

/**
 * Edict 任务
 */
export interface EdictTask {
  id: string;
  userId: string;
  originalMessage: string;
  taskType: TaskType;
  status: TaskStatus;
  stages: TaskStage[];
  currentStageIndex: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: ModuleResult;
  metadata?: Record<string, unknown>;
}

/**
 * 路由决策
 */
export interface RoutingDecision {
  useEdict: boolean;
  useTaskHub: boolean;
  reason: string;
  taskType?: TaskType;
  stages?: TaskStage[];
}

// ============================================================================
// 处理结果
// ============================================================================

/**
 * Edict 处理结果
 */
export interface EdictResult {
  status: 'done' | 'in_progress' | 'failed' | 'cancelled';
  edictId: string;
  taskType: TaskType;
  result?: ModuleResult;
  stages?: TaskStage[];
  error?: string;
  timestamp: number;
}

/**
 * 阶段执行结果
 */
export interface StageExecutionResult {
  stageId: string;
  status: StageStatus;
  result?: ModuleResult;
  error?: string;
  elapsed: number;
}

// ============================================================================
// 配置
// ============================================================================

/**
 * Edict 配置
 */
export interface EdictConfig {
  enabled: boolean;
  path: string;
  maxConcurrentTasks: number;
  taskTimeout: number;
  autoProgression: boolean;
  maxRetries: number;
}

/**
 * 六部配置
 */
export interface MinistryConfig {
  id: MinistryType;
  name: string;
  description: string;
  capabilities: string[];
  priority: number;
}

// ============================================================================
// 白名单
// ============================================================================

/**
 * 白名单条目
 */
export interface WhitelistEntry {
  pattern: RegExp;
  taskType: TaskType;
  stages: TaskStage[];
}

/**
 * 白名单匹配结果
 */
export interface WhitelistMatch {
  matched: boolean;
  entry?: WhitelistEntry;
  taskType?: TaskType;
  stages?: TaskStage[];
}
