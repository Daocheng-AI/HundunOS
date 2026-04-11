/**
 * HundunOS v3.0 — IntentEngine 单元测试
 * 覆盖：26 分类器 + 热插拔 + 置信度 + 辅助提取器
 * 运行：node --test __tests__/intent-engine.test.js
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

const { IntentEngine } = await import('../kernel/intent-engine.js');

const mockKernel = () => ({
    storage: {
        put: async () => {},
        get: async () => null,
        keys: async () => []
    },
    on: () => {},
    config: { system: {} }
});

describe('IntentEngine', () => {

    /** @type {IntentEngine} */
    let engine;

    beforeEach(async () => {
        engine = new IntentEngine(mockKernel());
        await engine.initialize();
    });

    // ── 内置分类器 ───────────────────────────────────────────────────

    const CLASSIFIER_CASES = [
        { input: '系统状态怎么样', expectedTypes: ['system', 'status'] },
        { input: '关闭系统', expectedTypes: ['system', 'shutdown'] },
        { input: '重启一下', expectedTypes: ['system', 'restart'] },
        { input: '帮我读取 config.json', expectedTypes: ['file', 'read'] },
        { input: '写一个 hello world 程序', expectedTypes: ['code', 'generate'] },
        { input: '分析一下这个代码', expectedTypes: ['code', 'analyze'] },
        { input: '搜索一下相关内容', expectedTypes: ['search', 'web'] },
        { input: '帮我记住三件事', expectedTypes: ['task', 'create'] },
        { input: '提醒我下午三点开会', expectedTypes: ['reminder', 'remind'] },
        { input: '这个操作需要权限吗', expectedTypes: ['permission', 'permission'] },
    ];

    for (const { input, expectedTypes } of CLASSIFIER_CASES) {
        it(`分类器识别: "${input}"`, async () => {
            const result = await engine.parse({ content: input, sessionId: 'test' }, {});
            assert.strictEqual(result.type, expectedTypes[0],
                `type 应为 ${expectedTypes[0]}，实际 ${result.type}`);
            assert.ok(result.confidence >= 0 && result.confidence <= 1,
                `置信度应在 [0,1] 范围内`);
        });
    }

    it('未知意图默认置信度 ≥ 0.5（不应直接拒绝）', async () => {
        const result = await engine.parse(
            { content: '量子纠缠的哲学意义是什么', sessionId: 'test' },
            {}
        );
        assert.ok(result.confidence >= 0.5,
            `未知意图置信度应 ≥ 0.5，实际 ${result.confidence}`);
        assert.strictEqual(result.type, 'unknown');
    });

    // ── 置信度评分 ─────────────────────────────────────────────────

    it('精确匹配比模糊匹配置信度更高', async () => {
        const [exact, fuzzy] = await Promise.all([
            engine.parse({ content: '关闭系统', sessionId: 'test' }, {}),
            engine.parse({ content: '可以关掉吗', sessionId: 'test' }, {}),
        ]);
        assert.ok(exact.confidence >= fuzzy.confidence,
            `精确匹配 ${exact.confidence} 应 ≥ 模糊匹配 ${fuzzy.confidence}`);
    });

    // ── 热插拔 ────────────────────────────────────────────────────

    it('register() / unregister() 热插拔', async () => {
        await engine.register({
            name: 'test_greeting',
            type: 'custom',
            patterns: [/^你好/, /^hello/i],
            action: 'greet',
            confidence: 0.95
        });

        const withCustom = await engine.parse({ content: '你好世界', sessionId: 'test' }, {});
        assert.strictEqual(withCustom.type, 'custom');

        engine.unregister('test_greeting');

        const withoutCustom = await engine.parse({ content: '你好世界', sessionId: 'test' }, {});
        assert.notStrictEqual(withoutCustom.type, 'custom',
            '注销后应不再匹配');
    });

    it('reload() 重新加载内置分类器（不丢已注册的自定义）', async () => {
        await engine.register({
            name: 'test_custom',
            type: 'mytype',
            patterns: [/^custom/],
            action: 'do',
            confidence: 0.99
        });

        const before = await engine.parse({ content: 'custom action', sessionId: 'test' }, {});
        assert.strictEqual(before.type, 'mytype');

        await engine.reload();

        const after = await engine.parse({ content: 'custom action', sessionId: 'test' }, {});
        assert.strictEqual(after.type, 'mytype',
            'reload 后自定义分类器仍应保留');
    });

    // ── 辅助提取器 ─────────────────────────────────────────────────

    it('_extractPaths() 提取 path: 前缀路径', () => {
        const paths = engine._extractPaths('读取 path:src/main.js 和 path:README.md');
        assert.ok(paths.includes('src/main.js'), '应提取第一个路径');
        assert.ok(paths.includes('README.md'), '应提取第二个路径');
    });

    it('_extractLanguage() 识别编程语言（代码块标记）', () => {
        const lang = engine._extractLanguage('```python\nprint("hi")\n```');
        assert.strictEqual(lang, 'python');
    });

    it('_extractQuery() 提取 query: 前缀查询', () => {
        const q = engine._extractQuery('query: 如何配置 nginx');
        assert.strictEqual(q, '如何配置 nginx');
    });

    it('_extractTime() 提取中文时间表达', () => {
        const time = engine._extractTime('提醒我明天上午九点开会');
        assert.ok(time !== null, '应提取到时间信息');
    });

    it('classifiers.length 包含内置分类器数量（≥ 26）', () => {
        assert.ok(engine.classifiers.length >= 26,
            `内置分类器应 ≥ 26 个，实际 ${engine.classifiers.length}`);
    });
});
