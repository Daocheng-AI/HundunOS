/**
 * kernel/hooks/index.js — Hook System v4.2
 * Hooks 事件系统
 * 
 * 借鉴自 Claude Code Hooks 设计
 * v4.2: 增强 Pre/Post 拦截链，支持参数修改
 * - Pre-hook 可修改输入参数
 * - Post-hook 可访问执行结果
 * - 支持 HookResult 聚合
 */

import { spawn } from 'child_process';

/**
 * 支持的 Hook 事件类型
 */
export const HookEvent = {
  // 会话生命周期
  SESSION_START: 'SessionStart',
  SESSION_END: 'SessionEnd',
  INSTRUCTIONS_LOADED: 'InstructionsLoaded',

  // 用户交互
  USER_PROMPT_SUBMIT: 'UserPromptSubmit',
  NOTIFICATION: 'Notification',

  // 工具执行
  PRE_TOOL_USE: 'PreToolUse',
  POST_TOOL_USE: 'PostToolUse',
  POST_TOOL_USE_FAILURE: 'PostToolUseFailure',
  PERMISSION_REQUEST: 'PermissionRequest',

  // 子代理
  SUBAGENT_START: 'SubagentStart',
  SUBAGENT_STOP: 'SubagentStop',

  // 任务完成
  STOP: 'Stop',
  STOP_FAILURE: 'StopFailure',

  // 文件/配置
  CONFIG_CHANGE: 'ConfigChange',
  CWD_CHANGED: 'CwdChanged',
  FILE_CHANGED: 'FileChanged',

  // 其他
  TASK_COMPLETED: 'TaskCompleted',
  TASK_CREATED: 'TaskCreated',
};

/**
 * Hook 类型
 */
export const HookType = {
  COMMAND: 'command',
  PROMPT: 'prompt',
  HTTP: 'http',
  AGENT: 'agent',
};

/**
 * Hook 执行器
 */
export class HookExecutor {
  constructor(config = {}) {
    this.hooks = config.hooks || {};
    this.timeout = config.timeout || 60000;
    // 注入内核引用，供 Prompt/Agent Hook 使用
    this.kernel = config.kernel || null;
  }

  /**
   * 注入内核引用（延迟注入，避免循环依赖）
   * @param {Object} kernel
   */
  setKernel(kernel) {
    this.kernel = kernel;
  }

  /**
   * 触发 Hook 事件（基础版）
   * @param {string} eventName - 事件名称
   * @param {Object} input - 输入数据
   * @returns {Promise<Object|null>}
   */
  async trigger(eventName, input) {
    const result = await this.execute(eventName, input);
    return result.blocked ? result : null;
  }

  /**
   * 执行 Hook 链（v4.2 增强版）
   * 支持 Pre-hook 修改参数，Post-hook 访问结果
   * 
   * @param {string} eventName - 事件名称
   * @param {Object} input - 输入数据
   * @param {Object} options - 执行选项
   * @param {boolean} options.allowModification - 是否允许 Pre-hook 修改参数
   * @returns {Promise<HookExecutionResult>}
   */
  async execute(eventName, input, options = {}) {
    const { allowModification = true } = options;
    const eventHooks = this.hooks[eventName];
    
    if (!eventHooks) {
      return { blocked: false, modifiedInput: input, results: [] };
    }

    let modifiedInput = { ...input };
    const results = [];
    const isPreEvent = eventName.toLowerCase().includes('pre');

    for (const hookGroup of eventHooks) {
      // 检查 matcher
      if (hookGroup.matcher && !this._matches(modifiedInput?.tool_name, hookGroup.matcher)) {
        continue;
      }

      // 执行所有匹配的 hooks
      for (const hook of hookGroup.hooks) {
        const hookResult = await this._executeHook(hook, modifiedInput);
        results.push({
          hook: hook.type,
          result: hookResult,
          timestamp: Date.now(),
        });

        // 如果被阻断，立即返回
        if (hookResult?.block || hookResult?.blocked) {
          return {
            blocked: true,
            blockReason: hookResult.reason || hookResult.blockReason || 'Blocked by hook',
            modifiedInput,
            results,
            blockingHook: hook.type,
          };
        }

        // Pre-hook 可以修改参数
        if (isPreEvent && allowModification && hookResult?.modifiedInput) {
          modifiedInput = { ...modifiedInput, ...hookResult.modifiedInput };
        }

        // 收集 hook 输出
        if (hookResult?.hookOutput) {
          modifiedInput.hookOutputs = modifiedInput.hookOutputs || [];
          modifiedInput.hookOutputs.push(hookResult.hookOutput);
        }
      }
    }

    return {
      blocked: false,
      modifiedInput,
      results,
    };
  }

  /**
   * 执行带工具调用的 Hook 链
   * v4.2: 简化工具执行前的 Hook 调用
   * 
   * @param {string} toolName - 工具名称
   * @param {Object} toolInput - 工具输入
   * @param {Function} executeTool - 实际执行工具的函数
   * @returns {Promise<Object>}
   */
  async executeWithHooks(toolName, toolInput, executeTool) {
    // 1. Pre-tool hooks
    const preResult = await this.execute(HookEvent.PRE_TOOL_USE, {
      tool_name: toolName,
      tool_input: toolInput,
      timestamp: Date.now(),
    });

    if (preResult.blocked) {
      return {
        success: false,
        error: `Tool execution blocked: ${preResult.blockReason}`,
        hookResults: preResult.results,
      };
    }

    // 使用可能被修改的参数执行工具
    const finalInput = preResult.modifiedInput.tool_input;
    
    // 2. 执行工具
    let toolResult;
    let toolError;
    try {
      toolResult = await executeTool(finalInput);
    } catch (e) {
      toolError = e;
    }

    // 3. Post-tool hooks
    const postEvent = toolError 
      ? HookEvent.POST_TOOL_USE_FAILURE 
      : HookEvent.POST_TOOL_USE;
    
    const postResult = await this.execute(postEvent, {
      tool_name: toolName,
      tool_input: finalInput,
      tool_output: toolResult,
      tool_error: toolError?.message,
      execution_time: Date.now() - preResult.modifiedInput.timestamp,
    }, { allowModification: false }); // Post-hook 不允许修改

    return {
      success: !toolError,
      result: toolResult,
      error: toolError,
      preHookResults: preResult.results,
      postHookResults: postResult.results,
      modifiedInput: finalInput !== toolInput ? finalInput : undefined,
    };
  }

  /**
   * 执行单个 Hook
   * @param {Object} hook - Hook 配置
   * @param {Object} input - 输入数据
   * @returns {Promise<Object>}
   */
  async _executeHook(hook, input) {
    switch (hook.type) {
      case HookType.COMMAND:
        return await this._executeCommand(hook, input);
      case HookType.PROMPT:
        return await this._executePrompt(hook, input);
      case HookType.HTTP:
        return await this._executeHttp(hook, input);
      case HookType.AGENT:
        return await this._executeAgent(hook, input);
      default:
        return { continue: true };
    }
  }

  /**
   * 执行命令 Hook
   */
  async _executeCommand(hook, input) {
    return new Promise((resolve) => {
      const proc = spawn('node', ['-e', hook.command], {
        env: {
          ...process.env,
          CLAUDE_PROJECT_DIR: input.cwd || process.cwd(),
        },
        timeout: hook.timeout || this.timeout,
      });

      let stdout = '';
      let stderr = '';

      proc.stdin.write(JSON.stringify(input));
      proc.stdin.end();

      proc.stdout.on('data', (data) => {
        stdout += data;
      });

      proc.stderr.on('data', (data) => {
        stderr += data;
      });

      proc.on('close', (code) => {
        if (code === 0 && stdout) {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch {
            resolve({ continue: true });
          }
        } else if (code === 2) {
          resolve({ block: true, reason: stderr });
        } else {
          resolve({ continue: true });
        }
      });

      proc.on('error', () => {
        resolve({ continue: true });
      });
    });
  }

  /**
   * 执行 Prompt Hook
   * 通过 ModelRouter 调用 LLM，根据 AI 评估结果决定是否 block/continue/修改
   */
  async _executePrompt(hook, input) {
    const modelRouter = this.kernel?.modelRouter;
    if (!modelRouter) {
      console.warn('[HookExecutor] Prompt Hook: kernel.modelRouter not available, falling back to continue');
      return { continue: true };
    }

    const systemPrompt = hook.systemPrompt || 
      'You are a security and policy enforcement agent. Evaluate whether the following tool call should be allowed. Respond ONLY with valid JSON: {"decision":"allow"|"block","reason":"<brief reason>","modifiedInput":{<optional modified parameters>},"suggestion":"<optional suggestion>"}';

    const userMessage = `Tool: ${input.tool_name || 'unknown'}\nInput: ${JSON.stringify(input.tool_input || {}, null, 2)}\nContext: ${hook.context || 'Evaluate for safety and policy compliance.'}`;

    try {
      const response = await Promise.race([
        modelRouter.route({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          // 优先使用轻量快速模型
          strategy: 'COST_OPTIMIZED',
          maxTokens: 256,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Prompt Hook timeout')), hook.timeout || 10000)
        ),
      ]);

      const text = response?.content?.[0]?.text || response?.choices?.[0]?.message?.content || '';
      // 从返回文本中提取 JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.decision === 'block') {
          return {
            block: true,
            blocked: true,
            reason: parsed.reason || 'Blocked by Prompt Hook',
            suggestion: parsed.suggestion,
          };
        }
        // v4.2: 支持修改输入参数
        if (parsed.modifiedInput) {
          return { 
            continue: true, 
            modifiedInput: parsed.modifiedInput,
            hookSpecificOutput: parsed.hookSpecificOutput 
          };
        }
        if (parsed.hookSpecificOutput) {
          return { continue: true, hookSpecificOutput: parsed.hookSpecificOutput };
        }
      }
    } catch (e) {
      console.warn('[HookExecutor] Prompt Hook evaluation error:', e.message);
    }

    return { continue: true };
  }

  /**
   * 执行 HTTP Hook
   */
  async _executeHttp(hook, input) {
    try {
      const response = await fetch(hook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      return await response.json();
    } catch (e) {
      return { continue: true };
    }
  }

  /**
   * 执行 Agent Hook
   * 通过 SubagentManager 运行指定子代理，子代理的输出决定是否 block/continue
   */
  async _executeAgent(hook, input) {
    const subagentManager = this.kernel?.subagentManager;
    if (!subagentManager) {
      console.warn('[HookExecutor] Agent Hook: kernel.subagentManager not available, falling back to continue');
      return { continue: true };
    }

    const agentName = hook.agent || 'Plan';
    if (!subagentManager.has(agentName)) {
      console.warn(`[HookExecutor] Agent Hook: subagent "${agentName}" not found`);
      return { continue: true };
    }

    const task = hook.task ||
      `Evaluate whether to allow this tool call:\nTool: ${input.tool_name}\nInput: ${JSON.stringify(input.tool_input || {})}\nRespond with JSON: {"decision":"allow"|"block","reason":"..."}`;

    try {
      const result = await Promise.race([
        subagentManager.execute(agentName, task, null),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Agent Hook timeout')), hook.timeout || 30000)
        ),
      ]);

      // 从子代理输出中解析决策
      const output = result?.output || '';
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.decision === 'block') {
          return { block: true, reason: parsed.reason || `Blocked by Agent Hook (${agentName})` };
        }
      }

      // 如果子代理有显式的 hookOutput，透传
      if (result?.hookOutput) {
        return result.hookOutput;
      }
    } catch (e) {
      console.warn('[HookExecutor] Agent Hook execution error:', e.message);
    }

    return { continue: true };
  }

  /**
   * 检查工具名是否匹配 matcher
   */
  _matches(toolName, matcher) {
    if (!matcher || matcher === '*') return true;
    const regex = new RegExp(`^${matcher.replace(/\*/g, '.*')}$`);
    return regex.test(toolName || '');
  }

  /**
   * 注册 Hook
   * @param {string} event - 事件名称
   * @param {Object} hookConfig - Hook 配置
   */
  register(event, hookConfig) {
    if (!this.hooks[event]) {
      this.hooks[event] = [];
    }
    this.hooks[event].push(hookConfig);
  }

  /**
   * 获取所有已注册的 Hooks
   */
  getHooks() {
    return { ...this.hooks };
  }
}

/**
 * 创建默认的 Hook 配置
 * @returns {Object}
 */
export function createDefaultHooks() {
  return {
    PreToolUse: [
      {
        matcher: 'Bash',
        hooks: [
          {
            type: HookType.COMMAND,
            command: `
              const input = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
              const cmd = input.tool_input?.command || '';
              const blocked = /rm\\s+-rf\\s+\\//.test(cmd) || /sudo\\s+rm/.test(cmd);
              process.exit(blocked ? 2 : 0);
            `,
            timeout: 10000,
          },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: 'Write|Edit',
        hooks: [
          {
            type: HookType.COMMAND,
            command: `
              const input = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
              const content = input.tool_input?.content || '';
              const secrets = /password\\s*=/i.test(content) || /api[_-]?key\\s*=/i.test(content);
              if (secrets) {
                console.log(JSON.stringify({
                  hookSpecificOutput: {
                    additionalContext: 'Security warning: potential hardcoded secret detected'
                  }
                }));
              }
            `,
            timeout: 10000,
          },
        ],
      },
    ],
  };
}

/**
 * HookExecutor 配置（从 config/system.json 或环境变量）
 * @returns {Object}
 */
export function getHookExecutorConfig(kernel) {
    const sysHooks = kernel?.config?.system?.hooks || {};
    return {
        hooks: sysHooks.hooks || {},
        timeout: sysHooks.timeout || 60000,
        // Feature Flag 控制
        enabled: kernel?.featureFlags?.isEnabled('HOOK_SYSTEM') ?? true,
    };
}

/**
 * 工厂函数：从 kernel 配置创建 HookExecutor
 * @param {Object} kernel
 * @returns {HookExecutor}
 */
export function createHookExecutor(kernel) {
    const config = getHookExecutorConfig(kernel);
    return new HookExecutor({
        hooks: config.hooks,
        timeout: config.timeout,
        kernel,
    });
}

export default { HookExecutor, HookEvent, HookType, createDefaultHooks, createHookExecutor, getHookExecutorConfig };