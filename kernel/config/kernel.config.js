// hundunos/kernel/config/kernel.config.js
// 内核配置类

import { Config, Env, Nested } from './decorators.js';

/**
 * 日志级别枚举
 */
const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

/**
 * 内核配置类
 */
@Config
export class KernelConfig {
  /** 日志级别 */
  @Env('HUNDUNOS_LOG_LEVEL', logLevelSchema)
  logLevel = 'info';

  /** 最大重试次数 */
  @Env('HUNDUNOS_MAX_RETRIES')
  maxRetries = 3;

  /** 超时时间（毫秒） */
  @Env('HUNDUNOS_TIMEOUT')
  timeout = 30000;

  /** 是否启用调试模式 */
  @Env('HUNDUNOS_DEBUG')
  debug = false;

  /** 工作目录 */
  @Env('HUNDUNOS_WORKSPACE')
  workspace = '.';

  /** Python 路径 */
  @Env('HUNDUNOS_PYTHON_PATH')
  pythonPath = 'python';

  /** Node.js 路径 */
  @Env('HUNDUNOS_NODE_PATH')
  nodePath = 'node';
}
