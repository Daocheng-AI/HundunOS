/**
 * HundunOS v3.8 — TaskScientist 单元测试
 * 覆盖：JSFallbackOrchestrator + BFTS 检测
 * 运行：node --test __tests__/task-scientist.test.js
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

const { JSFallbackOrchestrator } = await import('../kernel/task-scientist.js');

describe('JSFallbackOrchestrator', () => {

    /** @type {JSFallbackOrchestrator} */
    let orch;

    beforeEach(() => {
        orch = new JSFallbackOrchestrator();
    });

    // ── createTask ───────────────────────────────────────────────────

    it('createTask() 返回 taskId + nodeId', () => {
        // FIX-R0: createTask 现在是 async（memoryTool 注入），测试使用内部 _createTaskSync
        const result = orch._createTaskSync('实现登录模块');
        assert.ok(result.taskId, '应有 taskId');
        assert.ok(result.nodeId, '应有 nodeId（新任务的根节点 ID）');
        assert.strictEqual(result.stage, 'analysis', '新任务 stage 为 analysis');
        assert.ok(result.journal, '应有 journal');
    });

    it('createTask() 两次调用创建不同任务', () => {
        const a = orch._createTaskSync('任务 A');
        const b = orch._createTaskSync('任务 B');
        assert.notStrictEqual(a.taskId, b.taskId, '两个 taskId 应不同');
    });

    it('createTask() journal 结构正确', () => {
        const result = orch._createTaskSync('测试 journal 结构');
        const { journal } = result;
        assert.ok(journal.task_id, 'journal.task_id 应存在');
        assert.ok(Array.isArray(journal.root_nodes), 'journal.root_nodes 应为数组');
        assert.strictEqual(journal.root_nodes.length, 1, '初始状态只有 1 个根节点');
        assert.ok(journal.nodes, 'journal.nodes 应存在');
        assert.ok(Array.isArray(journal.completed_stages), 'completed_stages 应为数组');
    });

    // ── runBFTS ─────────────────────────────────────────────────────

    it('runBFTS() 返回 journal + iterations', async () => {
        const { taskId } = orch._createTaskSync('实现计数器');
        const result = await orch.runBFTS(taskId);
        assert.ok(result.journal, '应有 journal');
        assert.ok(result.iterations >= 1, `iterations 应 ≥ 1，实际 ${result.iterations}`);
    });

    it('runBFTS() 阶段演进：BFTS 后节点数增加', async () => {
        const { taskId } = orch._createTaskSync('实现 REST API');
        await orch.runBFTS(taskId);
        const stats = orch.getStats(taskId);
        assert.ok(stats, '应有 stats');
        assert.ok(typeof stats.total_nodes === 'number', 'total_nodes 应为数字');
        assert.ok(stats.total_nodes >= 1, `BFTS 后节点数应 ≥ 1，实际 ${stats.total_nodes}`);
    });

    it('runBFTS() 未知 taskId 抛出错误', async () => {
        await assert.rejects(
            orch.runBFTS('nonexistent-task-id'),
            { message: /not found/i }
        );
    });

    // ── getStats ────────────────────────────────────────────────────

    it('getStats() 返回结构化统计', () => {
        const { taskId } = orch._createTaskSync('测试统计');
        const stats = orch.getStats(taskId);
        assert.ok(typeof stats.total_nodes === 'number', '应有 total_nodes');
        assert.ok(typeof stats.root_nodes === 'number', '应有 root_nodes');
        assert.ok(typeof stats.leaf_nodes === 'number', '应有 leaf_nodes');
        assert.strictEqual(stats.root_nodes, 1, '初始状态 root_nodes = 1');
    });

    it('getStats() 未知 taskId 返回 null（不抛错）', () => {
        const stats = orch.getStats('no-such-id');
        assert.strictEqual(stats, null, '未知 taskId 应返回 null');
    });

    it('getStats() BFTS 后 total_nodes 增加', async () => {
        const { taskId } = orch._createTaskSync('实现功能');
        const before = orch.getStats(taskId);
        await orch.runBFTS(taskId);
        const after = orch.getStats(taskId);
        assert.ok(after.total_nodes >= before.total_nodes,
            `BFTS 后节点数应增加，实际 ${before.total_nodes} → ${after.total_nodes}`);
    });

    // ── listTasks ───────────────────────────────────────────────────

    it('listTasks() 返回任务数组', () => {
        orch._createTaskSync('任务 X');
        orch._createTaskSync('任务 Y');
        const tasks = orch.listTasks();
        assert.ok(Array.isArray(tasks));
        assert.ok(tasks.length >= 2);
    });

    it('listTasks() 返回字符串数组（taskId 列表）', () => {
        orch._createTaskSync('描述文本');
        const tasks = orch.listTasks();
        const latest = tasks[tasks.length - 1];
        assert.strictEqual(typeof latest, 'string', 'listTasks() 返回 taskId 字符串数组');
        assert.ok(latest.length > 0, 'taskId 不应为空');
    });

    // ── deleteTask ─────────────────────────────────────────────────

    it('deleteTask() 成功删除后 getStats 返回 null', () => {
        const { taskId } = orch._createTaskSync('待删除任务');
        orch.deleteTask(taskId);
        const stats = orch.getStats(taskId);
        assert.strictEqual(stats, null, '删除后 getStats 应返回 null');
    });

    it('deleteTask() 不存在时静默成功（不抛错）', () => {
        // 不应抛出
        orch.deleteTask('fake-task-id-123');
    });

    // ── getJournal ──────────────────────────────────────────────────

    it('getJournal() 返回 journal 对象', () => {
        const { taskId } = orch._createTaskSync('获取 Journal');
        const journal = orch.getJournal(taskId);
        assert.ok(journal, 'journal 应存在');
        assert.ok(journal.nodes, 'journal.nodes 应存在');
        assert.ok(typeof journal.nodes === 'object', 'journal.nodes 应为对象');
        assert.ok(journal.task_id, 'journal.task_id 应存在');
    });

    it('getJournal() 未知 taskId 返回 null', () => {
        const journal = orch.getJournal('nonexistent');
        assert.strictEqual(journal, null, '未知 taskId 应返回 null');
    });
});

describe('FIX-R0: memoryTool 集成', () => {
    it('setMemoryTool() 传播到 jsFallback', () => {
        const mockTool = { getContextForTask: async () => ({ available: true, recent: [] }) };
        const orch = new JSFallbackOrchestrator();
        assert.strictEqual(orch.memoryTool, null, '初始无 memoryTool');
        orch.setMemoryTool(mockTool);
        assert.strictEqual(orch.memoryTool, mockTool, 'setMemoryTool 正确设置');
    });

    it('createTask() 种子节点携带 memory 字段（有 memoryTool）', async () => {
        const mockTool = {
            getContextForTask: async (task) => ({
                available: true,
                recent: [{ message: '历史：' + task }],
                semantic: [],
                episodic: [],
                semanticSearch: [],
                injectedAt: Date.now(),
            }),
        };
        const orch = new JSFallbackOrchestrator();
        orch.setMemoryTool(mockTool);
        const result = await orch.createTask('实现用户认证');
        const { journal, nodeId } = result;
        const seedNode = journal.nodes[nodeId];
        assert.ok(seedNode.memory, '种子节点应有 memory 字段');
        assert.ok(seedNode.memory.available, 'memory.available 应为 true');
        assert.strictEqual(seedNode.memory.recent.length, 1, '应有 1 条 recent 记忆');
        assert.strictEqual(journal.memory_injected, true, 'journal.memory_injected 为 true');
    });

    it('createTask() 无 memoryTool 时 memory 字段为 null（静默降级）', async () => {
        const orch = new JSFallbackOrchestrator();
        const result = await orch.createTask('测试降级');
        const seedNode = result.journal.nodes[result.nodeId];
        assert.strictEqual(seedNode.memory, null, '无 memoryTool 时 memory 为 null');
    });

    it('runBFTS() 子节点携带 memory 元数据（memoryTool 可用时）', async () => {
        const mockTool = {
            getContextForTask: async () => ({ available: true, recent: [], semantic: [], episodic: [], semanticSearch: [] }),
            // FIX: enhanceNodePrompt 检查 taskDescription 是否包含 '实现' 关键词（与 '实现功能' 匹配）
            enhanceNodePrompt: async (node) => node.plan?.includes('实现') ? '历史建议：先写测试' : '',
            findSimilarTaskPaths: async (taskDesc) => {
                // FIX: 匹配 '实现功能' 或其前缀
                if (taskDesc?.includes('实现')) {
                    return [{ memoryId: 'mem1', task: '类似任务', success: true,
                        inferredApproach: { strategy: '先测试后实现' }, rank: 0 }];
                }
                return [];
            },
        };
        const orch = new JSFallbackOrchestrator({ maxSteps: 2 });
        orch.setMemoryTool(mockTool);
        const { taskId } = await orch.createTask('实现功能');
        const result = await orch.runBFTS(taskId);
        const childNodes = Object.values(result.journal.nodes).filter(n => n.memory && n.memory.enhancedPrompt);
        assert.ok(childNodes.length > 0, '至少有 1 个子节点携带 memory 元数据');
        const child = childNodes[0];
        assert.ok(child.memory.enhancedPrompt.includes('历史建议'), '应有增强提示');
        assert.ok(child.memory.similarPaths?.length > 0, '应有相似路径');
        assert.strictEqual(child.memory.priorityBoost, 0.1, '相似成功路径 +0.1 分');
    });

    it('runBFTS() 无 memoryTool 时正常执行（不抛错）', async () => {
        const orch = new JSFallbackOrchestrator({ maxSteps: 2 });
        const { taskId } = await orch.createTask('无 memoryTool 任务');
        const result = await orch.runBFTS(taskId);
        assert.ok(result.iterations >= 1, '应有迭代');
        assert.ok(result.journal, '应有 journal');
    });
});

describe('BFTS 智能检测信号', () => {
    // 独立测试：直接验证置信度算法

    const STRONG_SIGNALS  = ['实现', '构建', '测试', '部署', '架构', 'implement', 'build', 'test', 'deploy'];
    const MEDIUM_SIGNALS  = ['多文件', '批量', '自动化', 'script', 'refactor'];
    const WEAK_SIGNALS    = ['是什么', '怎么用', '翻译', '查找', '查询', 'what is', 'how to'];

    const computeScore = (task) => {
        let score = 0.3;
        const lower = task.toLowerCase();
        STRONG_SIGNALS.forEach(s => { if (lower.includes(s.toLowerCase())) score += 0.4; });
        MEDIUM_SIGNALS.forEach(s => { if (lower.includes(s.toLowerCase())) score += 0.2; });
        WEAK_SIGNALS.forEach(s => { if (lower.includes(s.toLowerCase())) score -= 0.3; });
        return Math.min(Math.max(score, 0), 1);
    };

    it('强信号达到高置信度 (≥ 0.7)', () => {
        const score = computeScore('帮我实现用户认证系统');
        assert.ok(score >= 0.7, `强信号置信度应 ≥ 0.7，实际 ${score}`);
    });

    it('弱信号置信度偏低 (< 0.4)', () => {
        const score = computeScore('什么是 OAuth2？');
        assert.ok(score < 0.4, `弱信号置信度应 < 0.4，实际 ${score}`);
    });

    it('混合信号取平衡值', () => {
        const score = computeScore('实现一个函数，告诉我它是什么');
        assert.ok(score >= 0.3 && score <= 0.8, `混合信号应在 [0.3, 0.8]，实际 ${score}`);
    });

    it('置信度边界：不超过 1.0', () => {
        const score = computeScore('实现 构建 测试 部署 架构');
        assert.ok(score <= 1.0, `置信度不超过 1.0，实际 ${score}`);
    });

    it('置信度边界：不低于 0', () => {
        const score = computeScore('是什么 翻译 查找');
        assert.ok(score >= 0, `置信度不低于 0，实际 ${score}`);
    });
});
