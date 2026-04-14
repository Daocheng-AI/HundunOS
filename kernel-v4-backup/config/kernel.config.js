// hundunos/kernel/config/kernel.config.js
// 内核配置类

/**
 * 内核配置类
 */
export class KernelConfig {
  logLevel = 'info';
  maxRetries = 3;
  timeout = 30000;
  debug = false;
  workspace = '.';
  pythonPath = 'python';
  nodePath = 'node';

  constructor() {
    const validLevels = ['debug', 'info', 'warn', 'error'];
    if (validLevels.includes(process.env.HUNDUNOS_LOG_LEVEL)) {
      this.logLevel = process.env.HUNDUNOS_LOG_LEVEL;
    }
    const mr = parseInt(process.env.HUNDUNOS_MAX_RETRIES, 10);
    if (!isNaN(mr)) this.maxRetries = mr;
    const to = parseInt(process.env.HUNDUNOS_TIMEOUT, 10);
    if (!isNaN(to)) this.timeout = to;
    if (process.env.HUNDUNOS_DEBUG === 'true') this.debug = true;
    if (process.env.HUNDUNOS_WORKSPACE) this.workspace = process.env.HUNDUNOS_WORKSPACE;
    if (process.env.HUNDUNOS_PYTHON_PATH) this.pythonPath = process.env.HUNDUNOS_PYTHON_PATH;
    if (process.env.HUNDUNOS_NODE_PATH) this.nodePath = process.env.HUNDUNOS_NODE_PATH;
  }
}
