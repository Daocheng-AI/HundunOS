/**
 * HundunOS v4.3 - 插件沙箱
 * 实现插件隔离、资源限制、安全执行
 */

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { cpus } from 'os';

/**
 * 插件沙箱
 */
export class PluginSandbox {
  constructor(options = {}) {
    this.options = {
      timeout: options.timeout || 30000,
      memoryLimit: options.memoryLimit || 128 * 1024 * 1024, // 128MB
      cpuLimit: options.cpuLimit || 1,
      allowedModules: options.allowedModules || [],
      blockedModules: options.blockedModules || ['fs', 'child_process', 'net', 'http', 'https'],
    };
  }

  /**
   * 执行插件代码
   */
  async execute(code, input = {}) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(__filename, {
        workerData: {
          code,
          input,
          options: this.options,
        },
        resourceLimits: {
          maxOldGenerationSizeMb: this.options.memoryLimit / (1024 * 1024),
        },
      });

      const timeout = setTimeout(() => {
        worker.terminate();
        reject(new Error('Plugin execution timeout'));
      }, this.options.timeout);

      worker.on('message', (result) => {
        clearTimeout(timeout);
        worker.terminate();
        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve(result.data);
        }
      });

      worker.on('error', (error) => {
        clearTimeout(timeout);
        worker.terminate();
        reject(error);
      });

      worker.on('exit', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`Plugin execution failed with code ${code}`));
        }
      });
    });
  }
}

/**
 * Worker 线程执行
 */
if (!isMainThread) {
  const { code, input, options } = workerData;

  try {
    // 模块拦截
    const Module = require('module');
    const originalRequire = Module.prototype.require;

    Module.prototype.require = function (id) {
      if (options.blockedModules.includes(id)) {
        throw new Error(`Module ${id} is blocked`);
      }
      if (options.allowedModules.length > 0 && !options.allowedModules.includes(id)) {
        throw new Error(`Module ${id} is not allowed`);
      }
      return originalRequire.apply(this, arguments);
    };

    // 执行代码
    const fn = new Function('input', code);
    const result = fn(input);

    parentPort.postMessage({ data: result });
  } catch (error) {
    parentPort.postMessage({ error: error.message });
  }
}

export default PluginSandbox;
