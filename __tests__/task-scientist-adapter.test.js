/**
 * HundunOS v3.8 — TaskScientist Adapter 协议测试
 * 验证 adapters/rust-modules/task-scientist.js v1.1 协议对齐
 * 运行：node --test __tests__/task-scientist-adapter.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

const { TaskScientistAdapter } = await import('../adapters/rust-modules/task-scientist.js');

// ── Mock Transport ─────────────────────────────────────────────────────────

class MockTransport {
    constructor(responses = {}) {
        this.responses = responses;
        this.calls = [];
    }

    async send(module, payload) {
        this.calls.push({ module, payload });
        if (typeof this.responses === 'function') {
            return this.responses(module, payload);
        }
        return this.responses[JSON.stringify(payload)] || { success: true };
    }
}

// ── 协议对齐测试 ──────────────────────────────────────────────────────────

describe('TaskScientistAdapter v1.1 协议对齐', () => {

    it('createTask() 发送正确的 Rust 协议格式 (action: CreateTask)', async () => {
        const transport = new MockTransport();
        const adapter = new TaskScientistAdapter(transport);

        await adapter.createTask('实现登录模块', {
            task_id: 'test-uuid-123',
            stages: ['前端', '后端']
        });

        const lastCall = transport.calls[transport.calls.length - 1];
        assert.strictEqual(lastCall.payload.action, 'CreateTask',
            '顶层 action 字段必须为 CreateTask');
        assert.strictEqual(lastCall.payload.task_id, 'test-uuid-123');
        assert.strictEqual(
            typeof lastCall.payload.description.title, 'string',
            'description.title 应为 string'
        );
        assert.ok(Array.isArray(lastCall.payload.description.stages));
    });

    it('createTask() 不发送旧的 { CreateTask: { task, context } } 格式', async () => {
        const transport = new MockTransport();
        const adapter = new TaskScientistAdapter(transport);

        await adapter.createTask('我的任务', {});

        const lastCall = transport.calls[transport.calls.length - 1];
        assert.ok(!lastCall.payload.hasOwnProperty('CreateTask'),
            '不应使用旧格式 { CreateTask: ... }');
    });

    it('createTask() 自动生成 task_id（无 context.task_id 时）', async () => {
        const transport = new MockTransport();
        const adapter = new TaskScientistAdapter(transport);

        const result = await adapter.createTask('无 ID 任务', {});

        assert.ok(result.task_id, '返回应包含 task_id');
    });

    it('createTask() 继承 context.title / context.description', async () => {
        const transport = new MockTransport();
        const adapter = new TaskScientistAdapter(transport);

        await adapter.createTask('基础描述', {
            title: '自定义标题',
            description: '自定义描述',
        });

        const lastCall = transport.calls[transport.calls.length - 1];
        assert.strictEqual(lastCall.payload.description.title, '自定义标题');
        assert.strictEqual(lastCall.payload.description.description, '自定义描述');
    });

    it('runBFTS() 发送 action: RunBfts（Rust 格式）', async () => {
        const transport = new MockTransport();
        const adapter = new TaskScientistAdapter(transport);

        await adapter.runBFTS('task-456');

        const lastCall = transport.calls[transport.calls.length - 1];
        assert.strictEqual(lastCall.payload.action, 'RunBfts',
            'Rust 用 RunBfts（非 RunBFTS）');
        assert.strictEqual(lastCall.payload.task_id, 'task-456');
    });

    it('runBFTS() 不使用旧的 { RunBFTS: { task_id } } 格式', async () => {
        const transport = new MockTransport();
        const adapter = new TaskScientistAdapter(transport);

        await adapter.runBFTS('any-id');

        const lastCall = transport.calls[transport.calls.length - 1];
        assert.ok(!lastCall.payload.hasOwnProperty('RunBFTS'));
    });

    it('getJournal() 发送 action: GetJournal', async () => {
        const transport = new MockTransport();
        const adapter = new TaskScientistAdapter(transport);

        await adapter.getJournal('journal-task-id');

        const lastCall = transport.calls[transport.calls.length - 1];
        assert.strictEqual(lastCall.payload.action, 'GetJournal');
    });

    it('getStats() 支持带 taskId', async () => {
        const transport = new MockTransport();
        const adapter = new TaskScientistAdapter(transport);

        await adapter.getStats('stats-task-id');

        const lastCall = transport.calls[transport.calls.length - 1];
        assert.strictEqual(lastCall.payload.action, 'GetStats');
        assert.strictEqual(lastCall.payload.task_id, 'stats-task-id');
    });

    it('getStats() 支持无 taskId（全局统计）', async () => {
        const transport = new MockTransport();
        const adapter = new TaskScientistAdapter(transport);

        await adapter.getStats();

        const lastCall = transport.calls[transport.calls.length - 1];
        assert.strictEqual(lastCall.payload.action, 'GetStats');
        assert.ok(!lastCall.payload.hasOwnProperty('task_id'));
    });

    it('listTasks() 发送 action: ListTasks', async () => {
        const transport = new MockTransport();
        const adapter = new TaskScientistAdapter(transport);

        await adapter.listTasks();

        const lastCall = transport.calls[transport.calls.length - 1];
        assert.strictEqual(lastCall.payload.action, 'ListTasks');
    });

    it('deleteTask() 发送 action: DeleteTask + task_id', async () => {
        const transport = new MockTransport();
        const adapter = new TaskScientistAdapter(transport);

        await adapter.deleteTask('del-id-789');

        const lastCall = transport.calls[transport.calls.length - 1];
        assert.strictEqual(lastCall.payload.action, 'DeleteTask');
        assert.strictEqual(lastCall.payload.task_id, 'del-id-789');
    });

    it('getConfig() 发送 action: GetConfig', async () => {
        const transport = new MockTransport();
        const adapter = new TaskScientistAdapter(transport);

        await adapter.getConfig();

        const lastCall = transport.calls[transport.calls.length - 1];
        assert.strictEqual(lastCall.payload.action, 'GetConfig');
    });

    it('visualizeTree() 发送 action: VisualizeTree + task_id', async () => {
        const transport = new MockTransport();
        const adapter = new TaskScientistAdapter(transport);

        await adapter.visualizeTree('vis-id');

        const lastCall = transport.calls[transport.calls.length - 1];
        assert.strictEqual(lastCall.payload.action, 'VisualizeTree');
        assert.strictEqual(lastCall.payload.task_id, 'vis-id');
    });
});

describe('TaskScientistAdapter runTask() 全自动流程', () => {

    it('runTask() 依次调用 createTask + runBFTS', async () => {
        const transport = new MockTransport();
        const adapter = new TaskScientistAdapter(transport);

        let callIndex = 0;
        transport.responses = () => {
            callIndex++;
            if (callIndex === 1) return { task_id: 'rt-001' };
            return { journal: { nodes: [] }, iterations: 2 };
        };

        const result = await adapter.runTask('全自动任务', {});

        assert.strictEqual(transport.calls.length, 4,
            '应调用 createTask + runBFTS + getStats + visualizeTree');
        assert.strictEqual(result.taskId, 'rt-001');
    });
});
