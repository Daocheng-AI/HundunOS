/**
 * HundunOS v4.3 - 插件沙箱
 * 实现插件隔离、资源限制、安全执行
 */

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { cpus } from 'os';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

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
      const workerCode = `
        const { parentPort, workerData, isMainThread } = require('worker_threads');
        const vm = require('vm');
        const { code, input, options } = workerData;
        try {
          const script = new vm.Script(\`
            'use strict';
            const input = _input;
            \${code}
          \`, {
            filename: 'plugin-sandbox.js',
            produceCachedData: false,
          });
          const sandbox = vm.createContext({
            _input: input,
            console: {
              log: (...args) => console.log('[Plugin]', ...args),
              warn: (...args) => console.warn('[Plugin]', ...args),
              error: (...args) => console.error('[Plugin]', ...args),
              info: (...args) => console.info('[Plugin]', ...args),
            },
            Math, JSON, Array, Object, String, Number, Boolean, Date, RegExp,
            Map, Set, Promise, Error, TypeError, RangeError, SyntaxError, ReferenceError,
            encodeURIComponent, decodeURIComponent, isNaN, isFinite, parseInt, parseFloat,
          });
          Object.freeze(sandbox);
          Object.preventExtensions(sandbox);
          const result = script.runInContext(sandbox, {
            timeout: options.timeout || 30000,
            displayErrors: true,
          });
          parentPort.postMessage({ data: result });
        } catch (error) {
          parentPort.postMessage({ error: error.message });
        }
      `;
      const worker = new Worker(workerCode, {
        eval: true,
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

export default PluginSandbox;
