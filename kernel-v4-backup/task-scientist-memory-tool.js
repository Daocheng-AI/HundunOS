// hundunos/kernel/task-scientist-memory-tool.js
// HundunOS v3.8 Phase 7 — TaskScientist × MemoryGraph 深度集成
// 为 BFTS 节点提供记忆上下文检索和相似任务路径复用

import { EventEmitter } from 'events';

/**
 * TaskScientistMemoryTool — TaskScientist 的记忆上下文工具
 *
 * 功能：
 * 1. 节点执行前自动查询相关历史经验（recall）
 * 2. 检索相似任务的执行路径（成功路径复用）
 * 3. 将记忆上下文注入 BFTS 节点 metadata
 *
 * 使用方式：
 *   const memoryTool = new TaskScientistMemoryTool(kernel.memoryGraph);
 *   const context = await memoryTool.getContextForTask(taskDescription);
 *   const similarPaths = await memoryTool.findSimilarTaskPaths(taskDescription);
 */
export class TaskScientistMemoryTool extends EventEmitter {
    /**
     * @param {import('./memory-graph.js').MemoryGraph} memoryGraph
     */
    constructor(memoryGraph) {
        super();
        this.memoryGraph = memoryGraph;
        this.config = {
            maxRecent: 5,       // 最多返回多少条 recent 记忆
            maxSemantic: 3,     // 最多返回多少条 semantic 记忆
            maxSimilarTasks: 3, // 最多返回多少条相似任务
            similarityThreshold: 0.6, // 相似度阈值
        };
    }

    /**
     * 为给定任务描述获取记忆上下文
     * @param {string} taskDescription - 任务描述
     * @returns {Promise<Object>} 记忆上下文（可直接注入到 BFTS 节点）
     */
    async getContextForTask(taskDescription) {
        if (!this.memoryGraph) {
            return { working: [], recent: [], semantic: [], episodic: [], available: false };
        }

        try {
            const [recallResult, semanticResult] = await Promise.all([
                this.memoryGraph.recall(taskDescription),
                this.memoryGraph.compressor
                    ? this.memoryGraph.compressor.semanticSearch(taskDescription)
                    : Promise.resolve([]),
            ]);

            return {
                available: true,
                recent: recallResult.recent.slice(0, this.config.maxRecent),
                semantic: recallResult.semantic.slice(0, this.config.maxSemantic),
                episodic: recallResult.episodic.slice(0, 2),
                semanticSearch: semanticResult.slice(0, this.config.maxSemantic),
                injectedAt: Date.now(),
            };
        } catch (e) {
            console.warn('[TaskScientistMemory] getContextForTask failed:', e.message);
            return { available: false, recent: [], semantic: [], episodic: [] };
        }
    }

    /**
     * 查找相似任务的执行路径（用于 BFTS 路径复用）
     *
     * 策略：
     * 1. 从 episodic 记忆（完整事件）中查找相似任务
     * 2. 分析其执行结果，提取成功路径模式
     * 3. 为 BFTS 提供历史最优路径参考
     *
     * @param {string} taskDescription - 当前任务描述
     * @param {Object} options - { maxResults?, successfulOnly? }
     * @returns {Promise<Object[]>} 相似任务路径列表
     */
    async findSimilarTaskPaths(taskDescription, options = {}) {
        const { maxResults = 3, successfulOnly = true } = options;

        if (!this.memoryGraph) return [];

        try {
            const lower = taskDescription.toLowerCase();
            const words = lower.split(/\s+/).filter(w => w.length > 2);

            // 1. 从 episodic（完整事件）中找相似任务
            const episodicMatches = this.memoryGraph.episodic
                .filter(e => {
                    if (!e.message) return false;
                    const msgLower = e.message.toLowerCase();
                    // 计算词重叠
                    const overlap = words.filter(w => msgLower.includes(w)).length;
                    const score = overlap / words.length;
                    return score >= 0.3;
                })
                .filter(e => !successfulOnly || e.result === true || e.result === undefined)
                .slice(0, maxResults);

            // 2. 从 recent 中找相似任务
            const recentMatches = this.memoryGraph.recent
                .filter(e => {
                    if (!e.message) return false;
                    const msgLower = e.message.toLowerCase();
                    const overlap = words.filter(w => msgLower.includes(w)).length;
                    const score = overlap / words.length;
                    return score >= 0.3;
                })
                .slice(0, maxResults);

            // 3. 合并结果
            const combined = [...episodicMatches, ...recentMatches]
                .slice(0, maxResults)
                .map((e, i) => ({
                    memoryId: e.id,
                    task: e.message,
                    intent: e.intent,
                    success: e.result !== false,
                    importance: e.importance || 1,
                    timestamp: e.timestamp,
                    // 经验建议（基于任务类型推断）
                    inferredApproach: this._inferApproach(e, taskDescription),
                    rank: i,
                }));

            return combined;
        } catch (e) {
            console.warn('[TaskScientistMemory] findSimilarTaskPaths failed:', e.message);
            return [];
        }
    }

    /**
     * 推断成功任务采用的执行策略（用于路径复用建议）
     */
    _inferApproach(entry, currentTask) {
        const task = (entry.message || '').toLowerCase();
        const current = currentTask.toLowerCase();

        // 检测任务类型关键词
        const patterns = [
            { keywords: ['bug', 'fix', '修复'], approach: '先写测试复现，再定位修复，最后重构' },
            { keywords: ['test', '测试'], approach: '先分析边界条件，再写测试用例，最后运行验证' },
            { keywords: ['api', 'rest', 'endpoint'], approach: '先设计接口契约，再 Mock 实现，最后集成测试' },
            { keywords: ['deploy', '部署', '发布'], approach: '先检查环境变量，再灰度发布，最后监控验证' },
            { keywords: ['refactor', '重构', '优化'], approach: '先写基准测试，再小步重构，最后性能验证' },
            { keywords: ['feature', '功能', '实现'], approach: '先确认需求边界，再写测试，再实现功能' },
            { keywords: ['database', 'migration', '数据库'], approach: '先备份数据，再执行迁移，最后回滚验证' },
            { keywords: ['auth', 'login', '权限'], approach: '先分析威胁模型，再最小实现，最后安全审计' },
        ];

        for (const p of patterns) {
            if (p.keywords.some(k => task.includes(k))) {
                return { strategy: p.approach, type: p.keywords[0] };
            }
        }

        // 通用建议
        return { strategy: '小步前进，每步验证，随时回滚', type: 'general' };
    }

    /**
     * 记录任务执行结果到 MemoryGraph（BFTS 节点执行后调用）
     * @param {string} taskDescription - 任务描述
     * @param {Object} result - { success, nodes?, steps? }
     */
    async recordTaskResult(taskDescription, result) {
        if (!this.memoryGraph) return;

        try {
            const entry = {
                id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                timestamp: Date.now(),
                message: taskDescription,
                intent: { type: 'task_scientist', action: 'bfts_task' },
                result: result.success !== false,
                importance: result.success ? 3 : 4, // 失败任务更重要，防止重复
                metadata: {
                    nodesCount: result.nodes?.length || 0,
                    steps: result.steps || 0,
                    engine: result.engine || 'unknown',
                },
            };

            this.memoryGraph.record(entry.message, entry.intent, { success: entry.result });
            this.emit('task_recorded', entry);
        } catch (e) {
            console.warn('[TaskScientistMemory] recordTaskResult failed:', e.message);
        }
    }

    /**
     * 为 BFTS 节点生成增强提示（注入记忆上下文）
     * @param {Object} node - BFTS 节点
     * @returns {Promise<string>} 增强提示文本
     */
    async enhanceNodePrompt(node) {
        if (!this.memoryGraph || !node?.plan) return '';

        try {
            const context = await this.getContextForTask(node.plan);
            if (!context.available) return '';

            const parts = [];

            // 添加相似任务路径建议
            const similar = await this.findSimilarTaskPaths(node.plan, { maxResults: 2 });
            if (similar.length > 0) {
                parts.push('**历史经验参考**：');
                for (const s of similar) {
                    parts.push(`- [${s.success ? '成功' : '部分'}] ${s.task.slice(0, 80)}...`);
                    if (s.inferredApproach?.strategy) {
                        parts.push(`  → 推荐策略：${s.inferredApproach.strategy}`);
                    }
                }
            }

            // 添加相关记忆
            if (context.recent.length > 0) {
                parts.push(`**相关近期记忆 (${context.recent.length})**：`);
                for (const r of context.recent.slice(0, 2)) {
                    parts.push(`- ${r.message.slice(0, 80)}`);
                }
            }

            return parts.length > 0 ? parts.join('\n') : '';
        } catch (_) {
            return '';
        }
    }

    /**
     * 获取统计信息
     */
    getStats() {
        return {
            memoryAvailable: !!this.memoryGraph,
            recentCount: this.memoryGraph?.recent?.length || 0,
            semanticCount: this.memoryGraph?.semantic?.size || 0,
            episodicCount: this.memoryGraph?.episodic?.length || 0,
        };
    }
}

export default TaskScientistMemoryTool;
