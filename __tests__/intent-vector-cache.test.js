/**
 * HundunOS v4.0 — IntentVectorCache 单元测试
 * 覆盖：初始化、预加载、压缩搜索、LRU 淘汰、DoS防护
 * 运行：node --test __tests__/intent-vector-cache.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

const { IntentVectorCache, createIntentVectorCache } = await import(
    '../kernel/intent-vector-cache.js'
);

// 标准分类器列表
const CLASSIFIERS = [
    { name: 'system_status', type: 'system', action: 'status', patterns: [/status/i], priority: 0 },
    { name: 'system_shutdown', type: 'system', action: 'shutdown', patterns: [/shutdown/i], priority: 0 },
    { name: 'code_generate', type: 'code', action: 'generate', patterns: [/code/i], priority: 0 },
    { name: 'web_search', type: 'search', action: 'web', patterns: [/search/i], priority: 0 },
];

function mockKernel(classifiers = []) {
    return {
        config: { system: {} },
        intentEngine: { classifiers },
        storage: {
            put: async () => {},
            get: async () => null,
            keys: async () => [],
        },
    };
}

describe('IntentVectorCache', () => {

    it('默认配置实例化成功', () => {
        const cache = new IntentVectorCache(mockKernel());
        assert.strictEqual(cache.config.enabled, true);
        assert.ok(typeof cache.embeddingEngine === 'object');
        assert.ok(cache.intentIndex instanceof Map);
    });

    it('custom config 覆盖默认值', () => {
        const cache = new IntentVectorCache(mockKernel(), {
            enabled: false,
            similarityThreshold: 0.8,
        });
        assert.strictEqual(cache.config.enabled, false);
        assert.strictEqual(cache.config.similarityThreshold, 0.8);
    });

    // ── 初始化预加载 ──────────────────────────────────────────────

    it('initialize 从 intentEngine 预加载分类器', async () => {
        const cache = new IntentVectorCache(mockKernel(CLASSIFIERS));
        await cache.initialize();
        assert.ok(cache.intentIndex.size > 0, '应有预加载的 intent');
        assert.ok(cache.intentIndex.has('system_status'));
        assert.ok(cache.intentIndex.has('code_generate'));
    });

    it('initialize 跳过超过上限的节点', async () => {
        // 测试：预加载时超过 MAX_INTENT_NODES=200 被截断
        const manyClassifiers = Array.from({ length: 201 }, (_, i) => ({
            name: `intent_${i}`,
            type: 'x',
            action: 'a',
            patterns: [new RegExp(`p${i}`)],
        }));
        const cache = new IntentVectorCache(mockKernel(manyClassifiers));
        await cache.initialize();
        assert.ok(
            cache.intentIndex.size <= 200,
            `intentIndex 应 ≤ 200，实际 ${cache.intentIndex.size}`
        );
    });

    // ── findBestIntent() ──────────────────────────────────────────

    it('findBestIntent 返回匹配 intent（返回非null）', async () => {
        const cache = new IntentVectorCache(mockKernel(CLASSIFIERS));
        await cache.initialize();
        const result = await cache.findBestIntent('check the system status');
        assert.ok(result !== null, '应找到匹配');
        assert.ok(typeof result.score === 'number');
        assert.ok(result.score > 0 && result.score <= 1);
    });

    it('findBestIntent 相同查询返回一致 intent', async () => {
        const cache = new IntentVectorCache(mockKernel(CLASSIFIERS));
        await cache.initialize();
        const q = 'write code now';
        const r1 = await cache.findBestIntent(q);
        const r2 = await cache.findBestIntent(q);
        assert.strictEqual(r1?.intentName, r2?.intentName, '相同查询应返回相同 intent');
    });

    it('findBestIntent 返回结构包含必需字段', async () => {
        const cache = new IntentVectorCache(mockKernel(CLASSIFIERS));
        await cache.initialize();
        const result = await cache.findBestIntent('generate code');
        if (result) {
            assert.ok('intentName' in result);
            assert.ok('type' in result);
            assert.ok('score' in result);
            assert.ok(result.score >= 0 && result.score <= 1);
        }
    });

    // ── registerIntent / unregisterIntent ──────────────────────────

    it('registerIntent 添加新 intent 到索引', async () => {
        const cache = new IntentVectorCache(mockKernel([]));
        await cache.initialize();
        cache.registerIntent({ name: 'new_intent', type: 'x', action: 'y', patterns: [/new/i] });
        assert.ok(cache.intentIndex.has('new_intent'));
    });

    it('unregisterIntent 从索引移除', async () => {
        const cache = new IntentVectorCache(mockKernel(CLASSIFIERS));
        await cache.initialize();
        assert.ok(cache.intentIndex.has('system_status'));
        cache.unregisterIntent('system_status');
        assert.ok(!cache.intentIndex.has('system_status'));
    });

    // ── 缓存 ──────────────────────────────────────────────────────

    it('重复查询命中 LRU 缓存（fromCache=true）', async () => {
        const cache = new IntentVectorCache(mockKernel(CLASSIFIERS));
        await cache.initialize();
        const q = 'system status check';
        // 第一次查询
        const r1 = await cache.findBestIntent(q);
        assert.ok(r1 !== null);
        // 第二次查询应在缓存中
        const r2 = await cache.findBestIntent(q);
        assert.ok(r2 !== null, '第二次查询应有结果');
        assert.strictEqual(r1.intentName, r2.intentName, '两次结果一致');
        assert.strictEqual(r2.fromCache, true, '第二次应命中缓存');
    });

    it('getStats 返回有效统计', async () => {
        const cache = new IntentVectorCache(mockKernel(CLASSIFIERS));
        await cache.initialize();
        await cache.findBestIntent('code');
        await cache.findBestIntent('code');
        const stats = cache.getStats();
        assert.ok(typeof stats.intentIndexSize === 'number');
        assert.ok(typeof stats.queryCacheSize === 'number');
        assert.ok(typeof stats.cacheHitRate === 'string');
    });

    it('reset() 清空查询缓存', async () => {
        const cache = new IntentVectorCache(mockKernel(CLASSIFIERS));
        await cache.initialize();
        await cache.findBestIntent('code');
        cache.reset();
        assert.strictEqual(cache.queryCache.size, 0);
        assert.strictEqual(cache.queryLRU.length, 0);
    });

    // ── 工厂函数 ────────────────────────────────────────────────────

    it('createIntentVectorCache 工厂创建实例', () => {
        const cache = createIntentVectorCache(mockKernel(CLASSIFIERS));
        assert.ok(cache instanceof IntentVectorCache);
    });
});
