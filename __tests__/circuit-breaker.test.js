/**
 * HundunOS v3.0 — CircuitBreaker 单元测试
 * 覆盖：CLOSED → OPEN → HALF_OPEN 三态转换
 * 运行：node --test __tests__/circuit-breaker.test.js
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

// 动态导入（ESM）
const { CircuitBreaker } = await import('../kernel/model-router/circuit-breaker.js');

describe('CircuitBreaker', () => {
    /** 每次创建新的熔断器实例，失败阈值=5，成功阈值=3 */
    const newBreaker = () => new CircuitBreaker({
        failureThreshold: 5,
        successThreshold: 3,
        timeout: 1000
    });

    // ── CLOSED 状态 ──────────────────────────────────────────────────

    it('CLOSED: 初始状态为 CLOSED', () => {
        const cb = newBreaker();
        assert.strictEqual(cb.state, 'CLOSED');
        assert.strictEqual(cb.failures, 0);
    });

    it('CLOSED: 失败次数 < 阈值时保持 CLOSED', async () => {
        const cb = newBreaker();
        for (let i = 0; i < 4; i++) {
            await cb.recordFailure();
        }
        assert.strictEqual(cb.state, 'CLOSED');
        assert.strictEqual(cb.failures, 4);
    });

    it('CLOSED: 失败次数达到阈值后切换到 OPEN', async () => {
        const cb = newBreaker();
        for (let i = 0; i < 5; i++) {
            await cb.recordFailure();
        }
        assert.strictEqual(cb.state, 'OPEN');
        assert.strictEqual(cb.failures, 5);
    });

    it('CLOSED: 调用 isCallAllowed() 不记录成功（旁路）', async () => {
        const cb = newBreaker();
        const allowed = await cb.isCallAllowed();
        assert.strictEqual(allowed, true);
        assert.strictEqual(cb.failures, 0);
    });

    // ── OPEN 状态 ───────────────────────────────────────────────────

    it('OPEN: 调用直接拒绝（returns false）', async () => {
        const cb = newBreaker();
        // 触发 OPEN
        for (let i = 0; i < 5; i++) await cb.recordFailure();
        assert.strictEqual(cb.state, 'OPEN');

        // OPEN 状态下调用被拒绝
        const allowed = await cb.isCallAllowed();
        assert.strictEqual(allowed, false);
    });

    it('OPEN: 超时后自动进入 HALF_OPEN', async () => {
        const cb = newBreaker();
        for (let i = 0; i < 5; i++) await cb.recordFailure();
        assert.strictEqual(cb.state, 'OPEN');

        // 模拟超时（将 openedAt 往前推）
        cb.openedAt = Date.now() - 2000; // 已超时 2 秒

        const allowed = await cb.isCallAllowed();
        assert.strictEqual(cb.state, 'HALF_OPEN');
        assert.strictEqual(allowed, true);
    });

    // ── HALF_OPEN 状态 ─────────────────────────────────────────────

    it('HALF_OPEN: 连续成功阈值次后回到 CLOSED', async () => {
        const cb = newBreaker();
        for (let i = 0; i < 5; i++) await cb.recordFailure();
        cb.openedAt = Date.now() - 2000; // 强制进入 HALF_OPEN
        await cb.isCallAllowed(); // 触发 HALF_OPEN

        assert.strictEqual(cb.state, 'HALF_OPEN');

        for (let i = 0; i < 3; i++) {
            await cb.recordSuccess();
        }
        assert.strictEqual(cb.state, 'CLOSED');
        assert.strictEqual(cb.failures, 0);
    });

    it('HALF_OPEN: 一次失败即回到 OPEN', async () => {
        const cb = newBreaker();
        for (let i = 0; i < 5; i++) await cb.recordFailure();
        cb.openedAt = Date.now() - 2000;
        await cb.isCallAllowed(); // 进入 HALF_OPEN

        await cb.recordFailure();
        assert.strictEqual(cb.state, 'OPEN');
    });

    // ── getState() 统计 ────────────────────────────────────────────

    it('getState() 返回结构包含当前状态和失败次数', async () => {
        const cb = newBreaker();
        for (let i = 0; i < 3; i++) await cb.recordFailure();

        const state = cb.getState();
        assert.strictEqual(state.state, 'CLOSED');
        assert.strictEqual(state.failures, 3);
        assert.ok('failureThreshold' in state);
    });
});
