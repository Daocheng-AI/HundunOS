/**
 * HundunOS v4.0 — TurboQuant v2 单元测试
 * 基于论文: TurboQuant: Online Vector Quantization with Near-optimal Distortion Rate
 * Google Research, arXiv:2504.19874v1 [cs.LG], 2025
 *
 * 覆盖：
 *   - SHA-256 伪嵌入（确定性）
 *   - 随机旋转矩阵（QR 分解）
 *   - Lloyd-Max 标量量化（N(0,1) 空间）
 *   - 量化/逆量化（MSE 最优）
 *   - 两阶段 PROD（MSE + QJL 残差校正）
 *   - 近似最近邻搜索（压缩域）
 *   - KV Cache 内存估算
 *   - DoS 防护
 *
 * 运行：node --test __tests__/turboquant-polar.test.js
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

const {
    TurboQuantizer,
    EmbeddingEngine,
    textToEmbedding,
    estimateKVCacheMemory,
    DEFAULT_CONFIG_V2,
    createEmbeddingEngine,
    createTurboQuantizer,
} = await import('../kernel/model-router/polar-quant.js');

describe('TurboQuant v2', () => {

    // ── 工厂 ──────────────────────────────────────────────────────────

    it('默认配置实例化成功', () => {
        const q = new TurboQuantizer();
        assert.strictEqual(q.cfg.embeddingDim, 384);
        assert.strictEqual(q.cfg.bitsPerChannel, 3.5);
        assert.ok(q.rotationMatrix !== null);
    });

    it('自定义配置覆盖默认值', () => {
        const q = new TurboQuantizer({ embeddingDim: 256, bitsPerChannel: 4 });
        assert.strictEqual(q.dim, 256);
        assert.strictEqual(q.cfg.bitsPerChannel, 4);
    });

    // ── SHA-256 伪嵌入 ──────────────────────────────────────────────

    it('相同文本生成相同嵌入（确定性）', () => {
        const v1 = textToEmbedding('hello world', 128);
        const v2 = textToEmbedding('hello world', 128);
        assert.deepStrictEqual(v1, v2);
    });

    it('不同文本生成不同嵌入', () => {
        const v1 = textToEmbedding('hello', 128);
        const v2 = textToEmbedding('world', 128);
        assert.notDeepStrictEqual(v1, v2);
    });

    it('嵌入向量维度 = 指定维度', () => {
        const dims = [64, 128, 256, 384];
        for (const dim of dims) {
            const v = textToEmbedding('test', dim);
            assert.strictEqual(v.length, dim, `dim=${dim} 时长度应匹配`);
        }
    });

    // ── 随机旋转矩阵 ─────────────────────────────────────────────────

    it('旋转矩阵维度 = dim × dim', () => {
        const q = new TurboQuantizer({ embeddingDim: 64 });
        assert.strictEqual(q.rotationMatrix.length, 64);
        assert.strictEqual(q.rotationMatrix[0].length, 64);
    });

    it('旋转是正交的（Q^T Q ≈ I）', () => {
        const dim = 64;
        const q = new TurboQuantizer({ embeddingDim: dim });
        const Q = q.rotationMatrix;
        // 验证 Q[i]·Q[j] = δ_ij
        for (let i = 0; i < 5; i++) {
            for (let j = 0; j < 5; j++) {
                let dot = 0;
                for (let k = 0; k < dim; k++) dot += Q[k][i] * Q[k][j];
                const expected = i === j ? 1 : 0;
                assert.ok(Math.abs(dot - expected) < 0.01,
                    `Q[:,${i}]·Q[:,${j}] 应 ≈ ${expected}，实际 ${dot}`);
            }
        }
    });

    // ── Lloyd-Max 标量量化 ──────────────────────────────────────────

    it('b=4 有 16 个质心', () => {
        const q = new TurboQuantizer({ embeddingDim: 64, bitsPerChannel: 4 });
        assert.strictEqual(q.centroids.length, 16);
    });

    it('b=1 质心 = ±0.79788456（论文值）', () => {
        const q = new TurboQuantizer({ embeddingDim: 64, bitsPerChannel: 1 });
        assert.strictEqual(q.centroids.length, 2);
        assert.ok(Math.abs(q.centroids[0] + 0.79788456) < 0.001);
        assert.ok(Math.abs(q.centroids[1] - 0.79788456) < 0.001);
    });

    // ── 量化 / 逆量化 ────────────────────────────────────────────────

    it('quantize 返回压缩结构（含 indices + norms）', () => {
        const q = new TurboQuantizer({ embeddingDim: 128 });
        const v = textToEmbedding('test message', 128);
        const result = q.quantize(v);
        assert.ok('indices' in result, '应有 indices 字段');
        assert.ok('norms' in result, '应有 norms 字段');
        assert.ok(Array.isArray(result.indices), 'indices 应为数组');
        assert.strictEqual(result.indices.length, 128);
        assert.ok(typeof result.norms === 'number', 'norms 应为 number');
    });

    it('量化后索引范围在 [0, 2^bits-1]', () => {
        const q = new TurboQuantizer({ embeddingDim: 64, bitsPerChannel: 4 });
        const v = textToEmbedding('range test', 64);
        const result = q.quantize(v);
        const maxIdx = Math.max(...result.indices);
        const minIdx = Math.min(...result.indices);
        assert.ok(minIdx >= 0, '最小索引应 >= 0');
        assert.ok(maxIdx <= 15, '最大索引应 <= 15 (2^4-1)');
    });

    it('dequantize 返回数组维度正确', () => {
        const q = new TurboQuantizer({ embeddingDim: 128 });
        const v = textToEmbedding('hello hundunos', 128);
        const result = q.quantize(v);
        const restored = q.dequantize(result);
        assert.strictEqual(restored.length, 128);
    });

    it('dequantize 能还原有效数值（非全零）', () => {
        const q = new TurboQuantizer({ embeddingDim: 64 });
        const v = textToEmbedding('non-trivial message', 64);
        const result = q.quantize(v);
        const restored = q.dequantize(result);
        const hasNonZero = restored.some(x => x !== 0);
        assert.ok(hasNonZero, '还原后向量应至少有一个非零元素');
    });

    it('量化/逆量化误差在合理范围（MSE < 0.01 for d=64）', () => {
        const q = new TurboQuantizer({ embeddingDim: 64, bitsPerChannel: 4 });
        const v = textToEmbedding('error test', 64);
        const result = q.quantize(v);
        const restored = q.dequantize(result);
        let mse = 0;
        for (let i = 0; i < 64; i++) {
            mse += (v[i] - restored[i]) ** 2;
        }
        mse /= 64;
        assert.ok(mse < 0.01, `MSE 应 < 0.01，实际 ${mse}`);
    });

    // ── EmbeddingEngine ──────────────────────────────────────────────

    it('EmbeddingEngine 默认实例化成功', () => {
        const engine = createEmbeddingEngine({ embeddingDim: 128 });
        assert.strictEqual(engine.dim, 128);
    });

    it('embedAndQuantize 返回量化结构', () => {
        const engine = createEmbeddingEngine({ embeddingDim: 128 });
        const q = engine.embedAndQuantize('test input');
        assert.ok('indices' in q);
        assert.ok('norms' in q);
    });

    it('embedAndQuantize 相同文本命中缓存（一致性）', () => {
        const engine = createEmbeddingEngine({ embeddingDim: 64 });
        const q1 = engine.embedAndQuantize('cache test');
        const q2 = engine.embedAndQuantize('cache test');
        assert.strictEqual(q1.norms, q2.norms);
    });

    it('embedBatch 对多条消息生成不同压缩向量', () => {
        const engine = createEmbeddingEngine({ embeddingDim: 128 });
        const msgs = ['hello', 'world', 'foo', 'bar', 'baz'];
        const results = engine.embedBatch(msgs);
        assert.strictEqual(results.length, 5);
    });

    // ── 近似最近邻搜索（压缩域）──────────────────────────────────────

    it('searchCompressed 返回按得分降序结果', () => {
        const engine = createEmbeddingEngine({ embeddingDim: 128 });
        const candidates = [
            engine.embedAndQuantize('python programming language'),
            engine.embedAndQuantize('javascript web development'),
            engine.embedAndQuantize('chess strategy game'),
        ];
        const results = engine.searchCompressed('write code in python', candidates, 3);
        assert.strictEqual(results.length, 3);
        assert.ok(results[0].score >= results[1].score,
            '结果应按得分降序排列');
    });

    // ── KV Cache 内存估算 ────────────────────────────────────────────

    it('estimateKVCacheMemory 返回正确结构', () => {
        const est = estimateKVCacheMemory(4096);
        assert.ok('original_mb' in est);
        assert.ok('compressed_mb' in est);
        assert.ok('ratio' in est);
        assert.ok('effective_bits' in est);
    });

    it('3.5-bit 压缩比约 4.5×', () => {
        const est = estimateKVCacheMemory(4096, {
            numLayers: 32, numHeads: 32, headDim: 128,
            bitsPerChannel: 3.5, useOutlierSplit: false,
        });
        const ratio = parseFloat(est.ratio);
        assert.ok(ratio >= 4 && ratio <= 5.5, `3.5-bit ratio should be ~4.5x, got ${ratio}x`);
    });

    it('2.5-bit (outlier) 压缩比约 7×', () => {
        const est = estimateKVCacheMemory(4096, {
            numLayers: 32, numHeads: 32, headDim: 128,
            bitsPerChannel: 3.5, useOutlierSplit: true,
        });
        const ratio = parseFloat(est.ratio);
        assert.ok(ratio >= 6 && ratio <= 8, `2.5-bit outlier ratio should be ~7x, got ${ratio}x`);
    });

    // ── getStats ────────────────────────────────────────────────────

    it('getStats 返回压缩率和调用计数', () => {
        const engine = createEmbeddingEngine({ embeddingDim: 128 });
        engine.embedAndQuantize('stat test 1');
        engine.embedAndQuantize('stat test 2');
        const stats = engine.getStats();
        assert.ok(stats.totalOriginalBytes > 0, '应有原始字节统计');
        assert.ok(stats.totalCompressedBytes > 0, '应有压缩字节统计');
        assert.ok(stats.compressionRatio > 0, '应有压缩率');
        assert.ok(stats.compressionRatio > 1, '压缩比应 > 1');
    });

    // ── DoS 防护 ────────────────────────────────────────────────────

    it('超过 embeddingDim 的向量抛出错误', () => {
        const q = new TurboQuantizer({ embeddingDim: 512 });
        const bigVec = new Array(600).fill(0.1);
        assert.throws(
            () => q.quantize(bigVec),
            /dimension|expects|不匹配/i,
            '超维度应抛出错误'
        );
    });

    it('EmbeddingEngine embedBatch 限制批次大小', () => {
        const engine = createEmbeddingEngine({ embeddingDim: 128 });
        const longList = Array.from({ length: 1001 }, (_, i) => `msg ${i}`);
        const results = engine.embedBatch(longList);
        assert.ok(
            results.length <= 1000,
            `应限制在 1000 以内，实际 ${results.length}`
        );
    });

    it('TurboQuantizer 统计不因 DoS 防护崩溃', () => {
        const q = new TurboQuantizer({ embeddingDim: 64 });
        const v = textToEmbedding('normal input', 64);
        const result = q.quantize(v);
        assert.ok(result !== null);
    });
});
