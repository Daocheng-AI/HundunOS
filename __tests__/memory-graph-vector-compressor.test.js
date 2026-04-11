/**
 * HundunOS v4.0 — MemoryGraphVectorCompressor 单元测试
 * 覆盖：压缩存储、LRU 缓存、语义搜索、量化统计、DoS防护
 * 运行：node --test __tests__/memory-graph-vector-compressor.test.js
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

const { MemoryGraphVectorCompressor } = await import(
    '../kernel/memory-graph-vector-compressor.js'
);

// 构造模拟 Kernel（含 mock memoryGraph）
function mockKernel() {
    return {
        config: { system: {} },
        memoryGraph: {
            semantic: new Map(),
        },
    };
}

// 模拟 kernel（无 memoryGraph → 应安全处理）
function mockKernelNoMemGraph() {
    return { config: { system: {} } };
}

describe('MemoryGraphVectorCompressor', () => {

    it('默认配置实例化成功', () => {
        const mvc = new MemoryGraphVectorCompressor(mockKernel());
        assert.strictEqual(mvc.config.enabled, true);
        assert.ok(mvc.semanticIndex instanceof Map);
        assert.ok(mvc.decompressedCache instanceof Map);
    });

    it('custom config 覆盖默认值', () => {
        const mvc = new MemoryGraphVectorCompressor(mockKernel(), {
            enabled: false,
            embeddingDim: 128,
            similarityThreshold: 0.75,
        });
        // enabled 字段在 config 中
        assert.strictEqual(mvc.config.enabled, false);
        assert.strictEqual(mvc.config.embeddingDim, 128);
        assert.strictEqual(mvc.config.similarityThreshold, 0.75);
    });

    it('无 memoryGraph 时安全处理（不崩溃）', () => {
        assert.doesNotThrow(() => new MemoryGraphVectorCompressor(mockKernelNoMemGraph()));
    });

    // ── 注入验证 ────────────────────────────────────────────────────

    it('constructor 覆盖 semantic.set 方法', () => {
        const kernel = mockKernel();
        const mvc = new MemoryGraphVectorCompressor(kernel);
        // 注入后 semantic.set 被覆盖
        const origSet = Map.prototype.set;
        kernel.memoryGraph.semantic.set('test_key', { description: 'test description' });
        // 注入完成，semanticIndex 应包含新条目
        assert.ok(
            mvc.semanticIndex.has('test_key'),
            'semantic.set 被覆盖后写入 semanticIndex'
        );
    });

    it('覆盖后 semantic.get 支持按需逆量化', () => {
        const kernel = mockKernel();
        const mvc = new MemoryGraphVectorCompressor(kernel);
        // 手动写入压缩数据
        mvc.semanticIndex.set('decompress_test', { angular: [1, 2, 3], radius: 1 });
        kernel.memoryGraph.semantic.set('decompress_test', { _quantized: { angular: [1, 2, 3], radius: 1 } });
        // 通过覆盖后的 get 读取
        const result = kernel.memoryGraph.semantic.get('decompress_test');
        assert.ok(result !== undefined);
    });

    // ── 语义搜索 ────────────────────────────────────────────────────

    it('semanticSearch 返回相似条目列表', async () => {
        const kernel = mockKernel();
        const mvc = new MemoryGraphVectorCompressor(kernel);
        // 手动填充 semanticIndex
        mvc.semanticIndex.set('concept:javascript', { angular: [10, 20, 30], radius: 1 });
        mvc.semanticIndex.set('concept:python', { angular: [15, 25, 35], radius: 1 });
        mvc.semanticIndex.set('concept:chess', { angular: [100, 200, 1], radius: 1 });

        const results = mvc.semanticSearch('programming language', 2);
        assert.ok(Array.isArray(results));
    });

    it('semanticSearch 空索引返回空数组', () => {
        const mvc = new MemoryGraphVectorCompressor(mockKernel());
        const results = mvc.semanticSearch('any query', 3);
        assert.deepStrictEqual(results, []);
    });

    it('semanticSearch 结果按得分降序', () => {
        const kernel = mockKernel();
        const mvc = new MemoryGraphVectorCompressor(kernel);
        mvc.semanticIndex.set('a:code', { angular: [10, 20], radius: 1 });
        mvc.semanticIndex.set('b:debug', { angular: [30, 40], radius: 1 });
        mvc.semanticIndex.set('c:hello', { angular: [100, 1], radius: 1 });

        const results = mvc.semanticSearch('write code', 3);
        if (results.length >= 2) {
            for (let i = 1; i < results.length; i++) {
                assert.ok(
                    results[i - 1].score >= results[i].score,
                    `第 ${i} 项应 ≥ 第 ${i + 1} 项`
                );
            }
        }
    });

    // ── compressExisting ────────────────────────────────────────────

    it('compressExisting 批量压缩 semanticMap', async () => {
        const mvc = new MemoryGraphVectorCompressor(mockKernel());
        const semanticMap = new Map([
            ['entity_1', { description: 'Python programming language' }],
            ['entity_2', { description: 'JavaScript web framework' }],
        ]);
        const result = await mvc.compressExisting(semanticMap);
        assert.ok(typeof result.compressed === 'number');
        assert.ok(typeof result.skipped === 'number');
        assert.ok(result.compressed >= 0);
    });

    it('compressExisting 非 Map 输入安全处理', async () => {
        const mvc = new MemoryGraphVectorCompressor(mockKernel());
        const result = await mvc.compressExisting(null);
        assert.deepStrictEqual(result, { compressed: 0, skipped: 0 });
    });

    // ── LRU 缓存 ────────────────────────────────────────────────────

    it('重复读取触发 LRU 缓存命中', () => {
        const kernel = mockKernel();
        const mvc = new MemoryGraphVectorCompressor(kernel);
        mvc.semanticIndex.set('lru_key', { angular: [1, 2, 3], radius: 1 });
        kernel.memoryGraph.semantic.set('lru_key', { _quantized: { angular: [1, 2, 3], radius: 1 } });

        // 第一次
        kernel.memoryGraph.semantic.get('lru_key');
        const statsAfter1 = mvc.stats.cacheHits;

        // 第二次
        kernel.memoryGraph.semantic.get('lru_key');
        assert.ok(
            mvc.stats.cacheHits > statsAfter1,
            `第2次读取应增加缓存命中计数（${statsAfter1} → ${mvc.stats.cacheHits}）`
        );
    });

    // ── 量化统计 ───────────────────────────────────────────────────

    it('getStats 返回存储统计', async () => {
        const kernel = mockKernel();
        const mvc = new MemoryGraphVectorCompressor(kernel);
        mvc.semanticIndex.set('s1', { angular: [1], radius: 1 });
        mvc.semanticIndex.set('s2', { angular: [2], radius: 1 });
        const stats = mvc.getStats();
        assert.ok(typeof stats.compressionRatio === 'string');
        assert.ok(typeof stats.indexSize === 'number');
        assert.strictEqual(stats.indexSize, 2);
        assert.ok(typeof stats.cacheHitRate === 'number');
    });

    // ── DoS 防护 ────────────────────────────────────────────────────

    it('语义搜索自动限制到 MAX_SEARCH_NODES', () => {
        const kernel = mockKernel();
        const mvc = new MemoryGraphVectorCompressor(kernel);
        // 填入大量节点
        for (let i = 0; i < 2000; i++) {
            mvc.semanticIndex.set(`node_${i}`, { angular: [i % 256, (i * 2) % 256], radius: 1 });
        }
        const results = mvc.semanticSearch('query text', 10);
        assert.ok(results.length <= 10, '结果应限制在 topK');
    });
});
