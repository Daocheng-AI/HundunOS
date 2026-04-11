/**
 * HundunOS v3.0 — AuditLogger 单元测试
 * 覆盖：S-17 审计顺序 + S-18 sessionId + 敏感字段脱敏
 * 运行：node --test __tests__/audit-logger.test.js
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

const { AuditLogger } = await import('../stable-modules/audit-logger/index.js');

/** 构造一个带 mock storage 的 kernel */
const mockKernel = () => ({
    storage: {
        append: async () => {},
        ensureStorage: async () => {}
    }
});

describe('AuditLogger', () => {

    it('log() 生成带 crypto.randomUUID() 的审计条目', async () => {
        const kernel = mockKernel();
        const logger = new AuditLogger(kernel);
        await logger.initialize();

        const id = await logger.log('test', { msg: 'hello' }, { sessionId: 'sess_001' });
        assert.ok(id.startsWith('audit_'), 'ID 应以 audit_ 前缀开头');
        assert.strictEqual(logger.buffer.length, 1);
        assert.strictEqual(logger.stats.total, 1);
    });

    // ── S-18 ───────────────────────────────────────────────────────

    it('S-18: sessionId 取自 context.sessionId（而非 Map 第一个）', async () => {
        const kernel = mockKernel();
        const logger = new AuditLogger(kernel);
        await logger.initialize();

        await logger.log('intent', { type: 'test' }, { sessionId: 'sess_abc_xyz' });
        const entry = logger.buffer[0];
        assert.strictEqual(entry.sessionId, 'sess_abc_xyz',
            'S-18: sessionId 必须取自 context.sessionId');
    });

    it('S-18: 未传 sessionId 时默认 unknown', async () => {
        const kernel = mockKernel();
        const logger = new AuditLogger(kernel);
        await logger.initialize();

        await logger.log('intent', {});
        assert.strictEqual(logger.buffer[0].sessionId, 'unknown');
    });

    // ── S-17 ───────────────────────────────────────────────────────

    it('S-17: flush 成功后 buffer 清空，pending 归零', async () => {
        const kernel = mockKernel();
        const logger = new AuditLogger(kernel);
        await logger.initialize();

        await logger.log('test', { a: 1 });
        await logger.log('test', { b: 2 });
        assert.strictEqual(logger.buffer.length, 2);

        await logger.flush();
        assert.strictEqual(logger.buffer.length, 0, 'flush 后 buffer 应清空');
        assert.strictEqual(logger.stats.pending, 0);
        assert.strictEqual(logger.stats.written, 2);
    });

    it('S-17: flush 失败时 push 恢复至 buffer 尾部（保持原始顺序）', async () => {
        const callLog = [];
        const kernel = {
            storage: {
                append: async () => {
                    callLog.push('append');
                    throw new Error('故意触发 flush 失败');
                }
            }
        };

        const logger = new AuditLogger(kernel);
        await logger.initialize();

        await logger.log('test', { seq: 1 }); // buffer: [entry1]
        await logger.log('test', { seq: 2 }); // buffer: [entry1, entry2]

        // 触发 flush（第 3 次 log 触发或手动 flush）
        logger.bufferSize = 1; // 强制下次 log 时 flush
        await logger.flush();  // 手动 flush，模拟失败

        // S-17: 用 push 恢复到尾部 → 顺序保持 [entry1, entry2]
        // 如果错误地用 unshift 插到头部 → 顺序变成 [entry2, entry1]（错误）
        assert.strictEqual(logger.buffer.length, 2,
            '失败条目应全部恢复到 buffer');

        const seqs = logger.buffer.map(e => e.data.seq);
        assert.deepStrictEqual(seqs, [1, 2],
            'S-17: 顺序必须保持为 [1, 2]，unshift 会导致 [2, 1]');
        assert.strictEqual(logger.stats.errors, 1);
        assert.strictEqual(logger.stats.pending, 2);
    });

    // ── 敏感字段脱敏 ────────────────────────────────────────────────

    const SENSITIVE_CASES = [
        { input: { password: 'hunter2' }, field: 'password' },
        { input: { token: 'sk-abc123' }, field: 'token' },
        { input: { api_key: 'key_xyz' }, field: 'api_key' },
        { input: { secret: 's3cr3t' }, field: 'secret' },
        { input: { credential: 'abcd' }, field: 'credential' },
    ];

    for (const { input, field } of SENSITIVE_CASES) {
        it(`_sanitize() 脱敏字段: ${field}`, () => {
            const logger = new AuditLogger(mockKernel());
            const sanitized = logger._sanitize(input);
            assert.strictEqual(sanitized[field], '[REDACTED]',
                `敏感字段 ${field} 必须被脱敏为 [REDACTED]`);
        });
    }

    it('getStats() 返回完整统计', async () => {
        const kernel = mockKernel();
        const logger = new AuditLogger(kernel);
        await logger.initialize();

        await logger.log('test', { msg: 'a' });
        await logger.log('test', { msg: 'b' });

        const stats = logger.getStats();
        assert.strictEqual(stats.total, 2);
        assert.strictEqual(stats.pending, 2);
        assert.ok('written' in stats);
        assert.ok('errors' in stats);
    });
});
