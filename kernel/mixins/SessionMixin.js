// hundunos/kernel/mixins/SessionMixin.js
// HundunOS v4.1 — SessionMixin：会话管理与 Agent/Subagent
// 来源：core.js _getOrCreateSession() + spawnAgent() + runSubagent() + stats

/**
 * SessionMixin — 会话管理与子代理
 *
 * 职责：
 * - 会话创建/获取（LRU 驱逐，上限 200 个）
 * - Subagent 管理（spawn / run / stats / list）
 *
 * v4.1: 从 core.js 提取，会话相关逻辑独立
 */
export const SessionMixin = class SessionMixin {

    /**
     * Phase: core — 注入会话和 Agent 相关方法
     * @param {CoreKernel} kernel
     */
    init(kernel) {
        // 方法已定义在类原型上
    }

    // ================================================================
    // 会话管理
    // ================================================================

    async _getOrCreateSession(message) {
        const sessionId = message.sessionId || 'default';
        if (!this.state.sessions.has(sessionId)) {
            // LRU 驱逐：超过 200 个会话时清除最老的
            if (this.state.sessions.size >= 200) {
                let oldest = null;
                let oldestTime = Infinity;
                for (const [id, sess] of this.state.sessions) {
                    if (sess.created < oldestTime && id !== sessionId) {
                        oldestTime = sess.created;
                        oldest = id;
                    }
                }
                if (oldest) {
                    this.state.sessions.delete(oldest);
                    console.warn(`[Kernel] Session cap (200) reached — evicted: ${oldest}`);
                }
            }
            const ctx = { sessionId, created: Date.now(), working: [], recent: [] };
            this.state.sessions.set(sessionId, {
                id: sessionId,
                created: Date.now(),
                context: ctx,
                aware: this.aware
                    ? await this.aware.createSessionContext(sessionId).catch(() => ctx)
                    : ctx,
            });
        }
        return this.state.sessions.get(sessionId);
    }

    // ================================================================
    // Agent / Subagent
    // ================================================================

    async spawnAgent(config) {
        const { id, task, isolation = 'process', timeout = 120_000 } = config;

        if (this.featureFlags?.isEnabled?.('DEBUG_MODE')) {
            // review: removed // review: removed console.log(`[Kernel] Spawning agent ${id}: "${task.substring(0, 60)}..."`);
        }

        try {
            const result = await Promise.race([
                this.modelRouter.route({ type: 'task', action: 'execute', raw: task }, null),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Agent timeout')), timeout)
                ),
            ]);
            return { success: true, agentId: id, result, isolation };
        } catch (err) {
            return { success: false, agentId: id, error: err.message, isolation };
        }
    }

    async runSubagent(subagentName, task, options = {}) {
        if (!this.subagents) {
            return { success: false, error: 'SubagentManager not initialized' };
        }

        const isolation = options.isolation || 'fork';
        const taskMode = options.taskMode || null;

        // Hook: SUBAGENT_START
        if (this.hooks) {
            const hookResult = await this.hooks.trigger('SubagentStart', {
                subagent_name: subagentName,
                task,
                isolation,
                taskMode,
                sessionId: options.sessionId,
            }).catch(() => null);
            if (hookResult?.block) {
                return { success: false, type: 'hook_blocked', reason: hookResult.reason };
            }
        }

        try {
            const result = await this.subagents.execute(subagentName, task, options.sessionId);

            // Hook: SUBAGENT_END
            if (this.hooks) {
                await this.hooks.trigger('SubagentEnd', {
                    subagent_name: subagentName,
                    task,
                    result,
                    sessionId: options.sessionId,
                }).catch(() => null);
            }

            return result;
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    getSubagentStats() {
        if (!this.subagents) return null;
        return this.subagents.getStats();
    }

    listSubagents() {
        if (!this.subagents) return [];
        return this.subagents.getAll().map(s => ({
            name: s.name,
            type: s.type,
            description: s.description,
            taskMode: s.taskMode,
            isolation: s.isolation,
        }));
    }

    // ================================================================
    // getMixinStatus
    // ================================================================
    getMixinStatus_Session() {
        return {
            sessions: {
                active: this.state.sessions?.size || 0,
            },
            subagents: this.subagents
                ? { names: this.subagents.getNames?.() || [] }
                : null,
        };
    }
};

export default SessionMixin;
