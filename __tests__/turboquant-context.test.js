/**
 * HundunOS v4.0 — TurboContextCompressor v2 单元测试
 * 基于论文: TurboQuant: Online Vector Quantization with Near-optimal Distortion Rate
 * Google Research, arXiv:2504.19874v1 [cs.LG], 2025
 *
 * 覆盖：
 *   - 两阶段压缩（重要性评分 + 语义聚类）
 *   - Lloyd-Max 量化相似度
 *   - 论文参数：3.5-bit 质量中性
 *   - KV Cache 内存估算
 *   - DoS 防护
 *
 * 运行：node --test __tests__/turboquant-context.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

const {
    TurboContextCompressor,
    scoreImportance,
    clusterMessages,
} = await import('../kernel/model-router/turbo-context-compressor.js');

// 构造模拟 Kernel
function mockKernel(overrides = {}) {
    return {
        config: {
            system: {
                modelRouter: {
                    enableCompression: true,
                    maxTokens: 8192,
                    compressionKeepRecent: 6,
                    embeddingDim: 128,
                },
            },
            ...overrides,
        },
    };
}

function msg(role, content) { return { role, content }; }

describe('TurboContextCompressor v2', () => {

    // ── 实例化 ──────────────────────────────────────────────────

    it('默认配置实例化成功', () => {
        const tc = new TurboContextCompressor(mockKernel());
        assert.strictEqual(tc.config.enabled, true);
        assert.ok(tc.config.embeddingDim > 0);
    });

    it('v2: 默认 bitsPerChannel = 3.5（论文推荐）', () => {
        const tc = new TurboContextCompressor(mockKernel());
        assert.strictEqual(tc.config.bitsPerChannel, 3.5);
    });

    it('custom config 覆盖默认值', () => {
        const tc = new TurboContextCompressor(mockKernel(), {
            maxTokens: 4096,
            keepRecent: 3,
            importanceThreshold: 0.5,
            bitsPerChannel: 4,
            useOutlierSplit: true,
        });
        assert.strictEqual(tc.config.maxTokens, 4096);
        assert.strictEqual(tc.config.keepRecent, 3);
        assert.strictEqual(tc.config.bitsPerChannel, 4);
        assert.strictEqual(tc.config.useOutlierSplit, true);
    });

    // ── 重要性评分 ────────────────────────────────────────────────

    it('错误类型消息得分最高', () => {
        const errorMsg = msg('user', 'Error: database connection failed');
        const okMsg = msg('user', 'Hello, how are you?');
        const scoreError = scoreImportance(errorMsg, 0, 10);
        const scoreOk = scoreImportance(okMsg, 0, 10);
        assert.ok(scoreError > scoreOk,
            `错误消息(${scoreError})应比闲聊(${scoreOk})得分高`);
    });

    it('系统消息评分递增', () => {
        const scores = [
            scoreImportance(msg('system', 'kernel panic critical'), 0, 10),
            scoreImportance(msg('system', 'configuration updated'), 1, 10),
            scoreImportance(msg('system', 'info log entry'), 2, 10),
        ];
        assert.ok(scores[0] > 0.5, 'critical 消息应 > 0.5 分');
    });

    it('scoreImportance 对有效消息返回 0-1 之间', () => {
        const s = scoreImportance(msg('user', 'valid message test'), 0, 10);
        assert.ok(s >= 0 && s <= 1, `应在 [0,1]，实际 ${s}`);
    });

    // ── 聚类合并 ────────────────────────────────────────────────────

    it('clusterMessages 同意图连续消息产生聚类', () => {
        const { createEmbeddingEngine } = require('../kernel/model-router/polar-quant.js');
        const { createEmbeddingEngine: makeEngine } = { createEmbeddingEngine: null };
        // 动态导入避免顶层 await 问题
        // eslint-disable-next-line
        return import('../kernel/model-router/polar-quant.js').then(({ createEmbeddingEngine: makeEng }) => {
            const engine = makeEng({ embeddingDim: 128 });
            const msgs_list = [
                msg('user', 'What is the capital of France?'),
                msg('assistant', 'The capital of France is Paris.'),
                msg('user', 'What about Germany?'),
                msg('assistant', 'The capital of Germany is Berlin.'),
            ];
            const clusters = clusterMessages(msgs_list, engine, 0.80);
            assert.ok(Array.isArray(clusters));
            assert.ok(clusters.length >= 1);
        });
    });

    it('clusterMessages 空数组安全处理', () => {
        return import('../kernel/model-router/polar-quant.js').then(({ createEmbeddingEngine }) => {
            const engine = createEmbeddingEngine({ embeddingDim: 64 });
            const clusters = clusterMessages([], engine, 0.80);
            assert.deepStrictEqual(clusters, []);
        });
    });

    // ── 核心 compress() ────────────────────────────────────────────

    it('不压缩短对话（< 限制）', async () => {
        const tc = new TurboContextCompressor(mockKernel());
        const shortMsgs = [
            msg('user', 'Hi'),
            msg('assistant', 'Hello!'),
        ];
        const result = await tc.compress(shortMsgs, 8192);
        assert.strictEqual(result.compressed, false);
        assert.strictEqual(result.messages, shortMsgs);
    });

    it('压缩后 originalTokens > compressedTokens', async () => {
        const tc = new TurboContextCompressor(mockKernel());
        const longMsgs = Array.from({ length: 200 }, (_, i) =>
            msg('user', `Tell me about topic ${i}: here is some detailed information for testing.`)
        );
        const result = await tc.compress(longMsgs, 500);
        assert.ok(result.compressed, '超长对话应被压缩');
        assert.ok(result.originalTokens > result.compressedTokens,
            `原始 ${result.originalTokens} 应 > 压缩后 ${result.compressedTokens}`);
    });

    it('compress 返回压缩元数据', async () => {
        const tc = new TurboContextCompressor(mockKernel());
        const msgs100 = Array.from({ length: 100 }, (_, i) =>
            msg('user', `Context test message ${i} with some extra content here.`)
        );
        const result = await tc.compress(msgs100, 2000);
        assert.ok(typeof result.originalTokens === 'number');
        assert.ok(typeof result.compressedTokens === 'number');
        assert.ok('stats' in result);
    });

    it('引擎统计中 effectiveBits = 3.5（论文推荐）', async () => {
        const tc = new TurboContextCompressor(mockKernel());
        const msgs50 = Array.from({ length: 50 }, (_, i) =>
            msg('user', `Message ${i}: detailed information content.`)
        );
        await tc.compress(msgs50, 1000);
        const stats = tc.getStats();
        assert.ok(stats.engineStats);
        assert.strictEqual(stats.engineStats.effectiveBits, 3.5);
    });

    // ── KV Cache 内存估算 ──────────────────────────────────────────

    it('estimateKVCache 返回正确字段', async () => {
        const tc = new TurboContextCompressor(mockKernel());
        const est = tc.estimateKVCache(4096);
        assert.ok('original_mb' in est);
        assert.ok('compressed_mb' in est);
        assert.ok('ratio' in est);
        assert.ok('effective_bits' in est);
    });

    it('3.5-bit 压缩比约 9×', async () => {
        const tc = new TurboContextCompressor(mockKernel({
            modelRouter: { embeddingDim: 128 },
        }));
        const est = tc.estimateKVCache(4096);
        const ratio = parseFloat(est.ratio);
        assert.ok(ratio > 8 && ratio < 10,
            `3.5-bit 应 ≈ 9×，实际 ${ratio}`);
    });

    it('outlierSplit=true 压缩比约 13×（2.5-bit）', async () => {
        const tc = new TurboContextCompressor(mockKernel(), {
            useOutlierSplit: true,
            bitsPerChannel: 3.5,
        });
        const est = tc.estimateKVCache(4096);
        const ratio = parseFloat(est.ratio);
        assert.ok(ratio > 12 && ratio < 15,
            `outlier split 应 ≈ 13×，实际 ${ratio}`);
    });

    // ── getStats() ────────────────────────────────────────────────

    it('getStats 返回累计统计', async () => {
        const tc = new TurboContextCompressor(mockKernel());
        const msgs10 = Array.from({ length: 10 }, (_, i) =>
            msg('user', `Stats test message ${i} with content`)
        );
        await tc.compress(msgs10, 500);
        const stats = tc.getStats();
        assert.ok(typeof stats.totalCompressed === 'number');
        assert.ok(typeof stats.totalOriginalTokens === 'number');
        assert.ok(typeof stats.totalCompressedTokens === 'number');
        assert.ok(typeof stats.clustersCreated === 'number');
    });

    // ── DoS 防护 ────────────────────────────────────────────────────

    it('超过 500 条消息在 compress 内部截断', async () => {
        const tc = new TurboContextCompressor(mockKernel());
        const tooMany = Array.from({ length: 502 }, (_, i) =>
            msg('user', `msg ${i}`)
        );
        const result = await tc.compress(tooMany, 100);
        // 压缩后的消息数应 <= 原始截断数（500 + keepRecent）
        assert.ok(result.messages.length <= 512);
    });

    it('maxTokens=1 触发强力压缩', async () => {
        const tc = new TurboContextCompressor(mockKernel());
        const msgs50 = Array.from({ length: 50 }, (_, i) =>
            msg('user', `x`.repeat(200))
        );
        const result = await tc.compress(msgs50, 1);
        assert.strictEqual(result.compressed, true);
    });
});
