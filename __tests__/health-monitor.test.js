/**
 * HundunOS v3.0 — HealthMonitor 单元测试
 * 覆盖：权重校验（浮点容差） + 权重覆盖机制
 * 运行：node --test __tests__/health-monitor.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

const { HealthMonitor, HealthDimension, HealthStatus } = await import(
    '../kernel/health-monitor/index.js'
);

describe('HealthMonitor — 权重校验与评分', () => {

    it('权重总和 = 1.0 时正常构造', () => {
        const kernel = { on: () => {}, config: { system: {} } };
        const hm = new HealthMonitor(kernel);
        const sum = Object.values(hm.weights).reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(sum - 1.0) <= 0.001,
            `权重总和 ${sum} 应在 1.0 ± 0.001`);
    });

    it('权重总和不等于 1.0 → 抛出错误', () => {
        const kernel = {
            on: () => {},
            config: {
                system: {
                    healthMonitor: {
                        weights: {
                            kernel: 0.5,
                            memory: 0.5,
                            model_router: 0.5,
                            edict: 0.5,
                            security: 0.1,
                            storage: 0.1,
                            cron: 0.1,
                            mcp: 0.1,
                            workbuddy: 0.1,
                            network: 0.5  // 总和明显 > 1
                        }
                    }
                }
            }
        };

        assert.throws(
            () => new HealthMonitor(kernel),
            /权重总和不等于 1.0/,
            '权重总和偏离 1.0 时应抛出错误'
        );
    });

    it('允许从 system.json 覆盖部分权重', () => {
        const kernel = {
            on: () => {},
            config: {
                system: {
                    healthMonitor: {
                        weights: {
                            // 只覆盖 kernel=0.20；memory 调低 0.05 以保持总和=1.0
                            kernel: 0.20,
                            memory: 0.07
                        }
                    }
                }
            }
        };

        const hm = new HealthMonitor(kernel);
        assert.strictEqual(hm.weights[HealthDimension.KERNEL], 0.20,
            '覆盖的 kernel 权重应为 0.20');
        assert.strictEqual(hm.weights[HealthDimension.MEMORY], 0.07,
            '覆盖的 memory 权重应为 0.07');
        assert.strictEqual(hm.weights[HealthDimension.MODEL_ROUTER], 0.12,
            '未覆盖的 model_router 权重保持默认值 0.12');

        const sum = Object.values(hm.weights).reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(sum - 1.0) <= 0.001,
            `部分覆盖后总和仍应 ≈ 1.0，实际为 ${sum}`);
    });

    it('浮点容差 0.001 内接受（0.1 + 0.2 ≠ 0.3 的 JS 特性）', () => {
        // 0.1 + 0.2 === 0.30000000000000004，但在 JS 中常见
        const kernel = {
            on: () => {},
            config: {
                system: {
                    healthMonitor: {
                        weights: {
                            kernel: 0.1,
                            memory: 0.2,
                            model_router: 0.1,
                            edict: 0.1,
                            security: 0.1,
                            storage: 0.1,
                            cron: 0.1,
                            mcp: 0.05,
                            workbuddy: 0.05,
                            network: 0.1
                            // 0.1 + 0.2 + 0.1 + 0.1 + 0.1 + 0.1 + 0.1 + 0.05 + 0.05 + 0.1 = 1.0
                            // JS 中实际计算结果会略偏，但容差 ±0.001 内应接受
                        }
                    }
                }
            }
        };

        assert.doesNotThrow(() => new HealthMonitor(kernel),
            '浮点容差 0.001 内不应抛出错误');
    });

    it('_computeOverall() 返回正确结构和评分', async () => {
        const kernel = {
            on: () => {},
            config: { system: {} }
        };
        const hm = new HealthMonitor(kernel);

        const results = {
            [HealthDimension.KERNEL]: { status: HealthStatus.OK, score: 100 },
            [HealthDimension.MEMORY]: { status: HealthStatus.WARN, score: 60 },
            [HealthDimension.MODEL_ROUTER]: { status: HealthStatus.OK, score: 90 },
            [HealthDimension.EDICT]: { status: HealthStatus.OK, score: 95 },
            [HealthDimension.SECURITY]: { status: HealthStatus.ERROR, score: 0 },
            [HealthDimension.STORAGE]: { status: HealthStatus.OK, score: 100 },
            [HealthDimension.CRON]: { status: HealthStatus.WARN, score: 70 },
            [HealthDimension.MCP]: { status: HealthStatus.OK, score: 100 },
            [HealthDimension.WORKBUDDY]: { status: HealthStatus.OK, score: 90 },
            [HealthDimension.NETWORK]: { status: HealthStatus.OK, score: 90 },
        };

        const overall = hm._computeOverall(results);

        assert.ok('score' in overall);
        assert.ok('status' in overall);
        assert.ok('issues' in overall);
        assert.ok(overall.score <= 100 && overall.score >= 0);
        assert.ok(overall.issues.some(i => i.severity === 'error'),
            'security ERROR 应出现在 issues 中');
    });
});
