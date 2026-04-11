// hundunos/__tests__/task-scientist-memory.test.js
// HundunOS v3.8 Phase 7 — TaskScientistMemoryTool 测试

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'events';

function createMockMemoryGraph() {
    return {
        recent: [
            { id: 'mem_1', message: '修复了 REST API 认证 bug', intent: 'code', result: true, importance: 3, timestamp: Date.now() - 1000 },
            { id: 'mem_2', message: '实现了用户登录功能', intent: 'code', result: true, importance: 2, timestamp: Date.now() - 2000 },
            { id: 'mem_3', message: '重构了数据库访问层', intent: 'refactor', result: true, importance: 4, timestamp: Date.now() - 3000 },
        ],
        semantic: new Map([
            ['REST API', { description: 'REST API 设计与实现', count: 5, entries: ['mem_1'], lastSeen: Date.now() }],
            ['authentication', { description: '用户认证系统', count: 3, entries: ['mem_2'], lastSeen: Date.now() }],
        ]),
        episodic: [
            { id: 'epi_1', message: '修复了 REST API 认证 bug', intent: 'code', result: true, importance: 3, timestamp: Date.now() - 1000 },
        ],
        async recall(query) {
            const q = query.toLowerCase();
            return {
                recent: this.recent.filter(e =>
                    e.message.toLowerCase().includes(q) || e.intent.includes(q)
                ),
                semantic: Array.from(this.semantic.entries())
                    .filter(([k, v]) => k.toLowerCase().includes(q) || v.description?.toLowerCase().includes(q))
                    .map(([k, v]) => ({ key: k, ...v })),
                episodic: this.episodic.filter(e => e.message.toLowerCase().includes(q)),
            };
        },
        record(message, intent, result) {
            // no-op
        },
    };
}

describe('TaskScientistMemoryTool', async () => {
    const { TaskScientistMemoryTool } = await import('../kernel/task-scientist-memory-tool.js');

    let memoryTool;
    let mockMemory;

    beforeEach(() => {
        mockMemory = createMockMemoryGraph();
        memoryTool = new TaskScientistMemoryTool(mockMemory);
    });

    it('should initialize with default config', () => {
        assert.strictEqual(memoryTool.config.maxRecent, 5);
        assert.strictEqual(memoryTool.config.maxSemantic, 3);
        assert.strictEqual(memoryTool.config.similarityThreshold, 0.6);
        assert.strictEqual(memoryTool.memoryGraph, mockMemory);
    });

    it('should extend EventEmitter', () => {
        assert.ok(memoryTool instanceof EventEmitter);
    });

    describe('getContextForTask', () => {
        it('should return available=true when memoryGraph exists', async () => {
            const context = await memoryTool.getContextForTask('REST API');
            assert.strictEqual(context.available, true);
        });

        it('should return recent memories matching the query', async () => {
            const context = await memoryTool.getContextForTask('REST API');
            assert.ok(Array.isArray(context.recent));
            assert.ok(context.recent.length >= 1);
            assert.ok(context.recent.some(r => r.message.includes('REST API')));
        });

        it('should return semantic memories matching the query', async () => {
            const context = await memoryTool.getContextForTask('authentication');
            assert.ok(Array.isArray(context.semantic));
            assert.ok(context.semantic.length >= 1);
        });

        it('should return empty results for unknown query', async () => {
            const context = await memoryTool.getContextForTask('xyz_unknown_query_12345');
            assert.strictEqual(context.available, true);
            assert.strictEqual(context.recent.length, 0);
        });

        it('should handle unavailable memoryGraph gracefully', async () => {
            const toolWithoutMemory = new TaskScientistMemoryTool(null);
            const context = await toolWithoutMemory.getContextForTask('any query');
            assert.strictEqual(context.available, false);
            assert.deepStrictEqual(context.recent, []);
        });

        it('should include injectedAt timestamp', async () => {
            const before = Date.now();
            const context = await memoryTool.getContextForTask('bug');
            const after = Date.now();
            assert.ok(context.injectedAt >= before);
            assert.ok(context.injectedAt <= after);
        });
    });

    describe('findSimilarTaskPaths', () => {
        it('should find similar tasks from episodic memory', async () => {
            const similar = await memoryTool.findSimilarTaskPaths('修复 REST API bug', { maxResults: 3 });
            assert.ok(Array.isArray(similar));
            assert.ok(similar.length >= 1);
        });

        it('should return inferred approach for matching tasks', async () => {
            const similar = await memoryTool.findSimilarTaskPaths('修复认证 bug', { maxResults: 3 });
            assert.ok(similar.length >= 1);
            assert.ok(similar[0].inferredApproach);
            assert.ok(similar[0].inferredApproach.strategy);
        });

        it('should handle empty memory gracefully', async () => {
            const emptyMemory = new TaskScientistMemoryTool({ recent: [], episodic: [] });
            const similar = await emptyMemory.findSimilarTaskPaths('any task');
            assert.deepStrictEqual(similar, []);
        });
    });

    describe('_inferApproach', () => {
        it('should infer approach for bug fix task', () => {
            const approach = memoryTool._inferApproach(
                { message: '修复了数据库 bug' },
                'fix database bug'
            );
            assert.strictEqual(approach.type, 'bug');
            assert.ok(approach.strategy.includes('测试'));
        });

        it('should infer approach for test task', () => {
            const approach = memoryTool._inferApproach(
                { message: '写单元测试' },
                'write tests'
            );
            assert.strictEqual(approach.type, 'test');
        });

        it('should infer approach for API task', () => {
            const approach = memoryTool._inferApproach(
                { message: '实现 REST API' },
                'implement REST API'
            );
            assert.strictEqual(approach.type, 'api');
        });

        it('should infer approach for deploy task', () => {
            const approach = memoryTool._inferApproach(
                { message: '部署到生产环境' },
                'deploy to production'
            );
            assert.strictEqual(approach.type, 'deploy');
        });

        it('should return general approach for unknown task type', () => {
            const approach = memoryTool._inferApproach(
                { message: 'do something unusual' },
                'unusual task'
            );
            assert.strictEqual(approach.type, 'general');
        });
    });

    describe('recordTaskResult', () => {
        it('should not throw when memoryGraph is null', async () => {
            const toolWithoutMemory = new TaskScientistMemoryTool(null);
            await toolWithoutMemory.recordTaskResult('test task', { success: true });
            // Should not throw
        });

        it('should emit task_recorded event', async () => {
            let recorded = false;
            memoryTool.on('task_recorded', (entry) => {
                recorded = true;
                assert.strictEqual(entry.message, 'test task');
                assert.strictEqual(entry.result, true);
            });
            await memoryTool.recordTaskResult('test task', { success: true });
            assert.strictEqual(recorded, true);
        });

        it('should set higher importance for failed tasks', async () => {
            let entry = null;
            memoryTool.on('task_recorded', (e) => { entry = e; });
            await memoryTool.recordTaskResult('failed task', { success: false });
            assert.strictEqual(entry.importance, 4);
        });

        it('should set normal importance for successful tasks', async () => {
            let entry = null;
            memoryTool.on('task_recorded', (e) => { entry = e; });
            await memoryTool.recordTaskResult('success task', { success: true });
            assert.strictEqual(entry.importance, 3);
        });
    });

    describe('getStats', () => {
        it('should return correct statistics', () => {
            const stats = memoryTool.getStats();
            assert.strictEqual(stats.memoryAvailable, true);
            assert.strictEqual(stats.recentCount, 3);
            assert.strictEqual(stats.semanticCount, 2);
            assert.strictEqual(stats.episodicCount, 1);
        });

        it('should return memoryAvailable=false when no memoryGraph', () => {
            const tool = new TaskScientistMemoryTool(null);
            const stats = tool.getStats();
            assert.strictEqual(stats.memoryAvailable, false);
            assert.strictEqual(stats.recentCount, 0);
        });
    });
});
