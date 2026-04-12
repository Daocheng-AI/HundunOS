// hundunos/kernel/mixins/ProcessMixin.js
// HundunOS v4.2 — ProcessMixin：主处理管线 + 编排 + 对话压缩
// 来源：core.js process() + _orchestrate()
// 参考：MemOS BaseScheduler.process() 管线模式
// v4.2: 集成 OpenHarness 风格对话压缩机制

import { feature } from '../feature-flags.js';
import { buildSystemPrompt } from '../prompts/prompt-parts.js';

/**
 * 对话压缩配置
 * v4.2: 参考 OpenHarness engine/query.py CompactProgressEvent
 * v4.3: 参考 learn-claude-code s06 三层压缩机制
 */
const COMPACT_CONFIG = {
  // 上下文窗口阈值（token 估算）
  contextWindowThreshold: 12000,  // 触发压缩的阈值
  maxHistoryRounds: 10,         // 保留的最大对话轮数
  summaryModel: 'glm-4-flash',   // 用于摘要的轻量模型
  maxSummaryTokens: 500,        // 摘要最大 token 数
  compressionStrategy: 'llm',   // llm | truncate | hybrid

  // v4.3: 微压缩配置（参考 learn-claude-code s06）
  microCompactEnabled: true,
  keepRecentToolResults: 3,      // 保留最近 N 个工具结果
};

/**
 * 估算消息 token 数（简单估算）
 * v4.2: 参考 OpenHarness cost_tracker
 */
function estimateTokens(messages) {
  let total = 0;
  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    // 简单估算：1 token ≈ 4 字符（英文）或 1 字符（中文）
    total += Math.ceil(content.length / 4);
    // 系统提示权重更高
    if (msg.role === 'system') total += 100;
  }
  return total;
}

/**
 * 微压缩：保留最近 N 个工具结果
 * v4.3: 参考 learn-claude-code s06 microcompact()
 */
function microcompact(messages) {
  if (!COMPACT_CONFIG.microCompactEnabled) return messages;

  const toolResults = [];
  const nonToolResults = [];

  // 分离工具结果和非工具结果
  for (const msg of messages) {
    if (msg.role === 'tool' || (msg.role === 'user' && Array.isArray(msg.content))) {
      toolResults.push(msg);
    } else {
      nonToolResults.push(msg);
    }
  }

  // 保留最近 N 个工具结果
  const recentToolResults = toolResults.slice(-COMPACT_CONFIG.keepRecentToolResults);
  const oldToolResults = toolResults.slice(0, -COMPACT_CONFIG.keepRecentToolResults);

  // 旧工具结果替换为摘要
  const summaryMessages = oldToolResults.map(msg => ({
    role: 'user',
    content: `[Previous tool result: ${Array.isArray(msg.content)
      ? msg.content.map(c => c.tool_name || c.name || 'unknown').join(', ')
      : 'tool call'}]`,
    _microcompacted: true,
  }));

  // 重新组装消息（按原始顺序）
  const result = [];
  let toolIndex = 0;
  let summaryIndex = 0;

  for (const msg of messages) {
    if (msg.role === 'tool' || (msg.role === 'user' && Array.isArray(msg.content))) {
      if (toolIndex < oldToolResults.length) {
        result.push(summaryMessages[summaryIndex++]);
      } else {
        result.push(recentToolResults[toolIndex - oldToolResults.length]);
      }
      toolIndex++;
    } else {
      result.push(msg);
    }
  }

  return result;
}

/**
 * ProcessMixin — 主入口 process() + 模块编排
 *
 * 职责：
 * - 输入标准化（_normalizeInput）
 * - 会话获取/创建（委托给 SessionMixin）
 * - Hook 触发（UserPromptSubmit）
 * - Aware 感知观察
 * - 意图解析
 * - 隐私检查（PrivacyShield）
 * - 权限检查（PermissionGating）
 * - Kernel 升级检测
 * - 模块路由 + 编排执行
 * - 记忆更新
 * - 结果返回
 *
 * v4.1: 从 core.js process() 提取，职责单一化
 */
export const ProcessMixin = class ProcessMixin {

    /**
     * Phase: core — process 管线方法注入
     * @param {CoreKernel} kernel
     */
    init(kernel) {
        // process 方法已在原型上，由类定义提供
    }

    // ================================================================
    // 主入口
    // ================================================================

    async process(input) {
        if (!this.state.running) throw new Error('Kernel not running');
        const start = Date.now();

        // 1. 标准化输入
        let message = this._normalizeInput(input);

        // 1.5. 会话（由 SessionMixin 提供）
        const session = await this._getOrCreateSession(message);

        // v4.3: Todo reminder（参考 learn-claude-code s03）
        const todoReminder = this.todoManager?.reminder?.() || null;
        if (todoReminder) {
            session?.messages?.push({ role: 'user', content: todoReminder });
        }

        // v4.3: 三层压缩机制（参考 learn-claude-code s06）
        // 第1层: 微压缩（保留最近 3 个工具结果）
        if (session?.messages) {
            session.messages = microcompact(session.messages);
        }

        // v4.2: 对话压缩 — 检查上下文窗口
        // 第2层: Token 估算 → 自动压缩
        if (session?.messages && estimateTokens(session.messages) > COMPACT_CONFIG.contextWindowThreshold) {
            // review: removed // review: removed console.log('[ProcessMixin] Context window exceeded, triggering compaction...');
            const compactStart = Date.now();
            const compressedMessages = await this._compactMessages(session.messages);
            session.messages = compressedMessages;
            session.compressionInfo = {
                triggered: true,
                timestamp: Date.now(),
                duration: Date.now() - compactStart,
                originalCount: session.messages.length + (compressedMessages.length < session.messages.length ? session.messages.length - compressedMessages.length : 0),
                newCount: compressedMessages.length,
            };
            // review: removed // review: removed console.log(`[ProcessMixin] Compaction complete: ${session.compressionInfo.originalCount} → ${session.compressionInfo.newCount} messages`);
        }

        // 2. Hook: USER_PROMPT_SUBMIT
        if (this.hooks) {
            const hookResult = await this.hooks.trigger('UserPromptSubmit', {
                tool_name: null,
                tool_input: message,
                sessionId: session?.id,
            }).catch(() => null);
            if (hookResult?.block) {
                return {
                    success: false, type: 'hook_blocked',
                    reason: hookResult.reason,
                    latency: Date.now() - start,
                };
            }
        }

        // 3. Aware 观察
        if (this.aware?.observe) {
            try { this.aware.observe(message); }
            catch (e) { console.error('[Kernel] Aware observe failed:', e.message); }
        }

        // 4. 意图解析
        const intent = await this.intentEngine.parse(message, session).catch(() => ({
            type: 'unknown', action: 'unknown', raw: message,
            description: message.content, confidence: 0,
        }));

        // 4.5. Skill 上下文注入（v4.1 新增）
        // 为匹配的 Skill 注入 system prompt，增强 LLM 对话上下文
        /** @type {{ systemPrompt: string, injectedSkills: string[], warnings: string[] } | null} */
        let skillContext = null;
        if (this.skills?.injector) {
            try {
                skillContext = await this.skills.injector.inject(message.content, {
                    includeSystemPrompt: true,
                    includeToolList: true,
                    maxSkills: 5,
                });
                // 注入到 session 供后续模块使用（modelRouter / contextEnhancer）
                if (session) {
                    session.skillContext = skillContext;
                }
                if (skillContext?.injectedSkills?.length > 0) {
                    if (this.auditLogger) {
                        this.auditLogger.log('skill_inject', {
                            skills: skillContext.injectedSkills,
                            message: message.content,
                        }, { sessionId: session?.id }).catch(() => {});
                    }
                }
            } catch (e) {
                console.warn('[Kernel] Skill context injection failed:', e.message);
            }
        }

        // 5. 审计记录
        if (this.auditLogger) {
            await this.auditLogger.log('intent', { message, intent }, { sessionId: session?.id }).catch(() => {});
        }

        // 6. 隐私检查
        if (this.privacyShield) {
            const privacy = await this.privacyShield.check(intent, message).catch(() => ({ allowed: true }));
            if (!privacy.allowed) {
                return {
                    success: false, type: 'privacy_blocked',
                    reason: privacy.reason, level: privacy.level,
                    latency: Date.now() - start,
                };
            }
            if (privacy.redacted && privacy.redactedContent) {
                message = { ...message, content: privacy.redactedContent };
            }
        }

        // 7. 权限检查
        let permission = { allowed: true };
        if (this.permissionGating) {
            permission = await this.permissionGating.check(intent, message).catch(() => ({ allowed: true }));
            if (!permission.allowed) {
                return {
                    success: false, type: 'permission_denied',
                    reason: permission.reason,
                    approvalId: permission.approvalId,
                    requiresApproval: true,
                    latency: Date.now() - start,
                };
            }
        }

        // 8. Kernel 升级检测
        if (this.isKernelUpgradeIntent(intent)) {
            return await this.handleKernelUpgrade(intent);
        }

        // 9. 路由到模块
        const targetModules = await this.messageRouter.route(intent, session).catch(() => []);

        // 10. 模块编排执行
        const result = await this._orchestrate(targetModules, intent, session).catch(e => ({
            success: false, error: e.message, results: [], errors: [{ error: e.message }],
        }));

        // 11. Cowork 监控
        if (this.coworkMonitor && permission?.source === 'cowork') {
            await this.coworkMonitor.monitor(intent, permission).catch(() => {});
        }

        // 12. 更新记忆 + Aware
        if (this.memoryGraph) {
            await this.memoryGraph.update(message, intent, result).catch(e =>
                console.error('[Kernel] MemoryGraph update failed:', e.message));
        }
        if (this.aware) {
            try { this.aware.learn(message, intent, result); }
            catch (e) { console.error('[Kernel] Aware learn failed:', e.message); }
            // v3.2: 偏好提取
            if (this.aware.preferenceExtractor && session?.id) {
                const recentMsgs = this.memoryGraph?.recent?.slice?.(0, 5) || [];
                if (recentMsgs.length >= 3) {
                    this.aware.extractPreference(recentMsgs, session.id);
                }
            }
        }

        // 13. 审计结果
        if (this.auditLogger) {
            await this.auditLogger.log('result', { intent, result, modules: targetModules }, { sessionId: session?.id }).catch(() => {});
        }

        // 14. 返回
        return {
            success: result.success !== false,
            type: intent.type,
            data: result,
            latency: Date.now() - start,
            aware: this.aware?.getSummary() || {},
            timestamp: Date.now(),
            // v4.1: Skill 上下文（已注入到 session）
            skills: skillContext?.injectedSkills?.length
                ? { matched: skillContext.injectedSkills, count: skillContext.injectedSkills.length }
                : null,
        };
    }

    // ================================================================
    // 对话压缩（v4.2 新增）
    // ================================================================

    /**
     * 压缩对话历史
     * v4.2: 参考 OpenHarness engine/query.py 智能压缩策略
     * 
     * 策略：
     * 1. 保留系统提示
     * 2. 保留最近 N 轮对话
     * 3. 早期对话使用 LLM 摘要
     * 
     * @param {Array} messages - 原始消息列表
     * @returns {Array} - 压缩后的消息列表
     */
    async _compactMessages(messages) {
        if (!messages || messages.length <= COMPACT_CONFIG.maxHistoryRounds * 2) {
            return messages;
        }

        const strategy = COMPACT_CONFIG.compressionStrategy;
        
        switch (strategy) {
            case 'truncate':
                return this._compactTruncate(messages);
            case 'llm':
                return await this._compactLLMSummary(messages);
            case 'hybrid':
            default:
                return await this._compactHybrid(messages);
        }
    }

    /**
     * 截断策略 — 简单保留最近 N 轮
     */
    _compactTruncate(messages) {
        const systemMessage = messages.find(m => m.role === 'system');
        const recentMessages = messages.slice(-COMPACT_CONFIG.maxHistoryRounds * 2);
        
        if (systemMessage && !recentMessages.some(m => m.role === 'system')) {
            return [systemMessage, ...recentMessages];
        }
        return recentMessages;
    }

    /**
     * LLM 摘要策略 — 使用轻量模型摘要早期对话
     * v4.3: 优先保留 user type memories（参考 learn-claude-code s09）
     * v4.3: 使用 PromptParts 重新组装 prompt（参考 learn-claude-code s10）
     */
    async _compactLLMSummary(messages) {
        const systemMessage = messages.find(m => m.role === 'system');
        const recentMessages = messages.slice(-COMPACT_CONFIG.maxHistoryRounds * 2);
        const oldMessages = messages.slice(systemMessage ? 1 : 0, -(COMPACT_CONFIG.maxHistoryRounds * 2));

        if (oldMessages.length === 0) {
            return messages;
        }

        try {
            // v4.3: 使用 PromptParts 重新组装 prompt（恢复 skill/memory 上下文）
            const newSystemPrompt = await buildSystemPrompt(this, {
                includeMemory: true,
                includeSkills: true,
                includeToolList: true,
                maxSkills: 5,
            });

            // 使用轻量模型生成摘要
            const summaryPrompt = this._buildSummaryPrompt(oldMessages);
            const response = await this.modelRouter?.route({
                messages: [
                    { role: 'system', content: 'Summarize the following conversation concisely. Focus on key decisions, context, and outcomes.' },
                    { role: 'user', content: summaryPrompt },
                ],
                model: COMPACT_CONFIG.summaryModel,
                maxTokens: COMPACT_CONFIG.maxSummaryTokens,
                strategy: 'COST_OPTIMIZED',
            });

            const summary = response?.content?.[0]?.text || 
                           response?.choices?.[0]?.message?.content || 
                           'Earlier conversation summarized.';

            const result = [];
            result.push({
                role: 'system',
                content: newSystemPrompt,
            });
            result.push({
                role: 'user',
                content: `[Earlier conversation summarized]: ${summary}`,
                compressed: true,
                originalCount: oldMessages.length,
            });
            result.push(...recentMessages);

            return result;
        } catch (e) {
            console.warn('[ProcessMixin] LLM summary failed, falling back to truncate:', e.message);
            return this._compactTruncate(messages);
        }
    }

    /**
     * 混合策略 — 工具调用只保留结果
     */
    async _compactHybrid(messages) {
        const systemMessage = messages.find(m => m.role === 'system');
        const recentMessages = messages.slice(-COMPACT_CONFIG.maxHistoryRounds * 2);
        const oldMessages = messages.slice(systemMessage ? 1 : 0, -(COMPACT_CONFIG.maxHistoryRounds * 2));

        // 简化旧消息：工具调用只保留结果摘要
        const simplifiedOld = oldMessages.map(msg => {
            if (msg.tool_calls) {
                return {
                    role: 'assistant',
                    content: `[Executed ${msg.tool_calls.length} tool(s)]`,
                    simplified: true,
                };
            }
            if (msg.role === 'tool') {
                // 工具结果只保留成功/失败状态
                const isError = msg.content?.includes('error') || msg.is_error;
                return {
                    role: 'tool',
                    content: isError ? '[Tool execution failed]' : '[Tool execution successful]',
                    simplified: true,
                };
            }
            return msg;
        });

        // 如果简化后仍然太多，使用 LLM 摘要
        if (simplifiedOld.length > COMPACT_CONFIG.maxHistoryRounds) {
            return await this._compactLLMSummary([
                ...(systemMessage ? [systemMessage] : []),
                ...simplifiedOld,
                ...recentMessages,
            ]);
        }

        const result = [];
        if (systemMessage) result.push(systemMessage);
        result.push(...simplifiedOld);
        result.push(...recentMessages);
        return result;
    }

    /**
     * 构建摘要提示
     */
    _buildSummaryPrompt(messages) {
        const lines = messages.map(m => {
            const role = m.role || 'unknown';
            const content = typeof m.content === 'string' 
                ? m.content 
                : JSON.stringify(m.content).slice(0, 200);
            return `${role}: ${content.slice(0, 500)}`;
        });
        return lines.join('\n---\n');
    }

    // ================================================================
    // 编排器
    // ================================================================

    async _orchestrate(modules, intent, session) {
        if (!modules || modules.length === 0) {
            if (this.modelRouter) {
                const result = await this.modelRouter.route(intent, session).catch(() => null);
                if (result) return { success: result.success !== false, results: [result], modules: 1, errors: [] };
            }
            return { success: false, error: 'No modules matched', results: [], modules: 0, errors: [] };
        }

        const results = [];
        for (const moduleId of modules) {
            const descriptor = this.moduleRegistry?.get(moduleId);
            if (!descriptor) {
                results.push({ module: moduleId, error: 'Module not registered', success: false });
                continue;
            }
            if (!descriptor.instance || typeof descriptor.instance.execute !== 'function') {
                results.push({ module: moduleId, error: 'Module instance not executable', success: false });
                continue;
            }
            try {
                const result = await descriptor.instance.execute(intent, session);
                results.push({ module: moduleId, ...result, success: true });
            } catch (e) {
                results.push({ module: moduleId, error: e.message, success: false });
            }
        }

        return {
            success: results.every(r => r.success !== false),
            results,
            modules: results.length,
            errors: results.filter(r => !r.success).map(r => ({ module: r.module, error: r.error })),
        };
    }

    // ================================================================
    // 输入标准化
    // ================================================================

    _normalizeInput(input) {
        if (typeof input === 'string') {
            return { type: 'text', content: input, sessionId: 'default', timestamp: Date.now() };
        }
        return {
            type: input.type || 'text',
            content: input.content || input,
            sessionId: input.sessionId || 'default',
            timestamp: input.timestamp || Date.now(),
            metadata: input.metadata || {},
        };
    }

    // ================================================================
    // 授权回调
    // ================================================================

    async approveOperation(approvalId, options = {}) {
        const result = await this.permissionGating.approve(approvalId, options).catch(() => ({ success: false }));
        if (result.success) {
            const pending = this.permissionGating.getPending(approvalId);
            if (pending) return await this.process(pending.message);
        }
        return result;
    }

    // ================================================================
    // Kernel 升级处理
    // ================================================================

    isKernelUpgradeIntent(intent) {
        return (
            intent?.type === 'kernel_upgrade' ||
            intent?.action === 'kernel_upgrade' ||
            intent?.raw?.toLowerCase?.()?.includes('upgrade kernel') ||
            intent?.raw?.toLowerCase?.()?.includes('更新内核') ||
            intent?.raw?.toLowerCase?.()?.includes('upgrade hundunos')
        );
    }

    async handleKernelUpgrade(intent) {
        const { UpgradeController } = await import('../upgrade-controller.js');
        const controller = this.upgradeController || new UpgradeController(this);
        try {
            const result = await controller.upgrade(intent.options || {});
            return { success: true, type: 'kernel_upgrade', data: result };
        } catch (e) {
            return { success: false, type: 'kernel_upgrade_failed', error: e.message };
        }
    }

    // ================================================================
    // getMixinStatus
    // ================================================================
    getMixinStatus_Process() {
        return {
            process: {
                running: this.state.running,
                uptime: process.uptime(),
            },
        };
    }
};

export default ProcessMixin;
