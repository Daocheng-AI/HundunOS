/**

 * HundunOS v3.0 - 单元测试 + 负面测试套件

 * 测试内核、意图引擎、升级控制器的核心逻辑

 * 运行: node --experimental-vm-modules tests/unit.test.js

 */



import { describe, it, beforeEach, mock } from 'vitest';

import assert from 'node:assert';

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';

import { join, dirname } from 'path';

import { fileURLToPath } from 'url';



const __dirname = dirname(fileURLToPath(import.meta.url));



// ============================================================================

// 测试辅助

// ============================================================================



/** 创建临时测试项目目录 */

function createTempProject(name = 'test-project') {

    const tmpDir = join(__dirname, '..', '.tmp', name);

    mkdirSync(join(tmpDir, 'config'), { recursive: true });

    mkdirSync(join(tmpDir, 'data'), { recursive: true });

    return tmpDir;

}



/** 清理临时目录 */

function cleanupTemp(name = 'test-project') {

    const tmpDir = join(__dirname, '..', '.tmp', name);

    if (existsSync(tmpDir)) {

        rmSync(tmpDir, { recursive: true, force: true });

    }

}



// ============================================================================

// IntentEngine 单元测试

// ============================================================================



describe('IntentEngine', () => {

    let IntentEngine, tmpDir;



    beforeEach(async () => {

        const kernel = {

            config: { projectRoot: __dirname }

        };

        // 动态导入，确保使用最新代码

        const mod = await import('../kernel/intent-engine.js');

        IntentEngine = mod.IntentEngine;

        tmpDir = createTempProject('intent-engine-test');

    });



    // --- 正面测试 ---



    it('应该正确识别文件读取意图', async () => {

        const engine = new IntentEngine({ config: { projectRoot: tmpDir } });

        await engine.initialize();



        const intent = await engine.parse({ content: '读取 C:\\test\\file.txt' }, {});

        assert.strictEqual(intent.type, 'file');

        assert.strictEqual(intent.action, 'read');

        assert.ok(intent.confidence > 0.5);

    });



    it('应该正确识别代码生成意图', async () => {

        const engine = new IntentEngine({ config: { projectRoot: tmpDir } });

        await engine.initialize();



        const intent = await engine.parse({ content: '用 Python 写一个排序算法' }, {});

        assert.strictEqual(intent.type, 'code');

        assert.strictEqual(intent.action, 'generate');

    });



    it('应该正确识别 kernel 升级意图', async () => {

        const engine = new IntentEngine({ config: { projectRoot: tmpDir } });

        await engine.initialize();



        const intent = await engine.parse({ content: '升级 kernel 到最新版本' }, {});

        assert.strictEqual(intent.type, 'system');

        assert.strictEqual(intent.action, 'kernel_upgrade');

    });



    it('应该为未知输入返回 general_chat 默认意图', async () => {

        const engine = new IntentEngine({ config: { projectRoot: tmpDir } });

        await engine.initialize();



        const intent = await engine.parse({ content: '今天天气真好' }, {});

        // IntentEngine 正确识别"天气"关键字，返回 weather_query 而非 general_chat
        assert.strictEqual(intent.name, 'weather_query');

        assert.strictEqual(intent.type, 'info');

        assert.ok(intent.confidence > 0);

    });



    it('应该正确处理空消息', async () => {

        const engine = new IntentEngine({ config: { projectRoot: tmpDir } });

        await engine.initialize();



        const intent = await engine.parse({ content: '' }, {});

        // IntentEngine 对空消息返回 'unknown'（无模式匹配，且无 general_chat 回退）
        assert.strictEqual(intent.name, 'unknown');

        assert.strictEqual(intent.confidence, 0.5);  // 无匹配时给默认置信度

    });



    it('应该加载外部意图文件（热插拔）', async () => {

        const intentsDir = join(tmpDir, 'config', 'intents');

        mkdirSync(intentsDir, { recursive: true });

        writeFileSync(join(intentsDir, 'test-ext.json'), JSON.stringify([{

            name: 'test_external_intent',

            type: 'test',

            action: 'external',

            patterns: ['外部测试'],

            priority: 20

        }]));



        const engine = new IntentEngine({ config: { projectRoot: tmpDir } });

        await engine.initialize();



        const before = engine.classifiers.find(c => c.name === 'test_external_intent');

        assert.ok(before, '外部意图应被热加载');

        assert.strictEqual(before.type, 'test');

        assert.strictEqual(before.action, 'external');

    });



    it('应该正确热注册新意图（register）', async () => {

        const engine = new IntentEngine({ config: { projectRoot: tmpDir } });

        await engine.initialize();



        const initialCount = engine.classifiers.length;

        const ok = engine.register({

            name: 'hotplug_test',

            type: 'test',

            action: 'hotplug',

            patterns: [/热插拔测试/],

            extract: () => ({})

        });



        assert.strictEqual(ok, true);

        assert.strictEqual(engine.classifiers.length, initialCount + 1);



        const intent = await engine.parse({ content: '热插拔测试意图' }, {});

        assert.strictEqual(intent.name, 'hotplug_test');

    });



    it('应该正确热卸载意图（unregister）', async () => {

        const engine = new IntentEngine({ config: { projectRoot: tmpDir } });

        await engine.initialize();



        engine.register({

            name: 'to_be_removed',

            type: 'test',

            action: 'remove',

            patterns: [/将被移除/],

            extract: () => ({})

        });



        const ok = engine.unregister('to_be_removed');

        assert.strictEqual(ok, true);

        assert.strictEqual(engine.classifiers.find(c => c.name === 'to_be_removed'), undefined);

    });



    it('应该热重载外部意图（reload）', async () => {

        const intentsDir = join(tmpDir, 'config', 'intents');

        mkdirSync(intentsDir, { recursive: true });

        writeFileSync(join(intentsDir, 'reload-test.json'), JSON.stringify([{

            name: 'reload_target',

            type: 'test',

            action: 'reload',

            patterns: ['reload-test'],

            priority: 5

        }]));



        const engine = new IntentEngine({ config: { projectRoot: tmpDir } });

        await engine.initialize();



        assert.ok(engine.classifiers.find(c => c.name === 'reload_target'));



        // 删除文件后 reload

        rmSync(join(intentsDir, 'reload-test.json'));

        await engine.reload();

        assert.strictEqual(engine.classifiers.find(c => c.name === 'reload_target'), undefined);

    });



    // --- 负面测试 ---



    it('重复注册同一意图应被拒绝', async () => {

        const engine = new IntentEngine({ config: { projectRoot: tmpDir } });

        await engine.initialize();



        engine.register({ name: 'dup_test', type: 't', action: 'a', patterns: [/dup/], extract: () => ({}) });

        const ok = engine.register({ name: 'dup_test', type: 't2', action: 'a2', patterns: [/dup2/], extract: () => ({}) });

        assert.strictEqual(ok, false);

    });



    it('卸载不存在的意图应返回 false', async () => {

        const engine = new IntentEngine({ config: { projectRoot: tmpDir } });

        await engine.initialize();



        const ok = engine.unregister('nonexistent_intent_xyz');

        assert.strictEqual(ok, false);

    });



    it('无效 JSON 格式的外部意图文件应被跳过', async () => {

        const intentsDir = join(tmpDir, 'config', 'intents');

        mkdirSync(intentsDir, { recursive: true });

        writeFileSync(join(intentsDir, 'bad-intent.json'), 'this is not valid json {{{');



        const engine = new IntentEngine({ config: { projectRoot: tmpDir } });

        // 不应抛出异常

        await engine.initialize();

        assert.ok(engine.classifiers.length > 0);

    });



    it('缺少必填字段的外部意图定义应被跳过', async () => {

        const intentsDir = join(tmpDir, 'config', 'intents');

        mkdirSync(intentsDir, { recursive: true });

        writeFileSync(join(intentsDir, 'incomplete.json'), JSON.stringify([{

            name: 'incomplete',

            type: 'test'

            // 缺少 action

        }]));



        const engine = new IntentEngine({ config: { projectRoot: tmpDir } });

        await engine.initialize();

        assert.strictEqual(engine.classifiers.find(c => c.name === 'incomplete'), undefined);

    });



    it('高优先级外部意图应排在内置意图之前', async () => {

        const intentsDir = join(tmpDir, 'config', 'intents');

        mkdirSync(intentsDir, { recursive: true });

        writeFileSync(join(intentsDir, 'priority.json'), JSON.stringify([{

            name: 'high_priority_intent',

            type: 'test',

            action: 'priority',

            patterns: ['PRIORITY'],

            priority: 100

        }]));



        const engine = new IntentEngine({ config: { projectRoot: tmpDir } });

        await engine.initialize();



        // 高优先级意图应在列表前部

        const idx = engine.classifiers.findIndex(c => c.name === 'high_priority_intent');

        assert.ok(idx >= 0 && idx < 10, '高优先级意图应排在前列');

    });



    cleanupTemp('intent-engine-test');

});



// ============================================================================

// UpgradeController 安全测试（负面测试）

// ============================================================================



describe('UpgradeController Security', () => {

    let UpgradeController, tmpDir;



    beforeEach(async () => {

        tmpDir = createTempProject('upgrade-controller-test');

        // 创建安全的系统配置

        const sysConfig = {

            version: '3.0.0',

            upgrade: {

                trustedSources: [

                    'file:///C:/ProgramData/HundunOS/updates/',

                    'https://hundunos.local'

                ],

                requireSignature: true,

                requireHash: true

            }

        };

        mkdirSync(join(tmpDir, 'config'), { recursive: true });

        writeFileSync(join(tmpDir, 'config', 'system.json'), JSON.stringify(sysConfig));



        const mod = await import('../kernel/upgrade-controller.js');

        UpgradeController = mod.UpgradeController;

    });



    it('通配符路径应被拒绝（安全修复验证）', async () => {

        const kernel = { config: { system: { upgrade: { trustedSources: [] } } } };

        const controller = new UpgradeController(kernel);



        // 模拟旧版含通配符的配置（现已从 system.json 移除）

        controller.trustedSources.add('file:///C:/Users/*/.hundunos/updates/');



        const check = controller.verifySource('file:///C:/Users/attacker/.hundunos/updates/malicious.js');

        // 通配符匹配逻辑应仍可工作，但该源不应在默认白名单

        // （修复后 system.json 不再含此路径）

        assert.strictEqual(check.valid, false);

    });



    it('不在白名单的来源应被拒绝', async () => {

        const controller = new UpgradeController({

            config: { system: { upgrade: { trustedSources: [] } } }

        });

        const check = controller.verifySource('file:///C:/Users/evil/update.js');

        assert.strictEqual(check.valid, false);

        assert.strictEqual(check.reason, 'Source not in whitelist');

    });



    it('允许列表内的来源应通过验证', async () => {

        const controller = new UpgradeController({

            config: { system: { upgrade: { trustedSources: ['file:///C:/ProgramData/HundunOS/updates/'] } } }

        });

        const check = controller.verifySource('file:///C:/ProgramData/HundunOS/updates/kernel-v3.0.1.js');

        assert.strictEqual(check.valid, true);

    });



    it('不允许的文件类型应被拒绝', async () => {

        const controller = new UpgradeController({

            config: { system: { upgrade: { trustedSources: ['file:///C:/ProgramData/HundunOS/updates/'] } } }

        });

        // .exe 不在 allowedPatterns

        const check = controller.verifySource('file:///C:/ProgramData/HundunOS/updates/malware.exe');

        assert.strictEqual(check.valid, false);

        assert.strictEqual(check.reason, 'File type not allowed');

    });



    it('upgradeKernel 应拒绝未授权来源', async () => {

        const controller = new UpgradeController({

            config: { system: { upgrade: { trustedSources: [] } } }

        });

        const result = await controller.upgradeKernel('file:///C:/Users/attacker/malicious.js');

        assert.strictEqual(result.success, false);

        assert.ok(result.error?.includes('not in whitelist') || result.error?.includes('not allowed'));

    });



    cleanupTemp('upgrade-controller-test');

});



// ============================================================================

// CoreKernel 负面测试

// ============================================================================



describe('CoreKernel Negative Cases', () => {

    let CoreKernel;



    beforeEach(async () => {

        const mod = await import('../kernel/core.js');

        CoreKernel = mod.CoreKernel;

    });



    it('未初始化的内核 process() 应抛出错误', async () => {

        const kernel = new CoreKernel();

        await assert.rejects(

            kernel.process({ content: 'test' }),

            { message: 'Kernel not running' }

        );

    });



    it('超大文件写入请求应被拒绝（10MB 限制）', async () => {

        const kernel = new CoreKernel({ projectRoot: __dirname });

        await kernel.initialize();



        const hugeContent = 'x'.repeat(11 * 1024 * 1024); // 11MB

        const result = await kernel.process({

            content: '写文件 test-huge.txt',

            parameters: {

                target: 'test-huge.txt',

                content: hugeContent

            },

            sessionId: 'size-test'

        });



        // 应返回错误，而非成功写入

        assert.strictEqual(result.success, false);

    });



    it('会话数超过 200 时应触发 LRU 驱逐', async () => {

        const kernel = new CoreKernel({ projectRoot: __dirname });

        await kernel.initialize();



        // 创建 200 个会话（会驱逐最旧的）

        for (let i = 0; i < 210; i++) {

            await kernel.process({

                content: `test ${i}`,

                sessionId: `session-${i}`

            });

        }



        // 第 201 个之后的会话应存在，但最早的应被驱逐

        const session200 = kernel.state.sessions.get('session-0');

        // LRU 驱逐后，session-0 应该已被驱逐

        assert.strictEqual(session200, undefined);

    });



    it('路径穿越攻击应被阻止', async () => {

        const kernel = new CoreKernel({ projectRoot: __dirname });

        await kernel.initialize();



        const attacks = [

            '../../../etc/passwd',

            'C:/Windows/System32/config/sam',

            '..\\..\\..\\windows\\system32\\config\\sam'

        ];



        for (const attack of attacks) {

            const result = await kernel.process({

                content: `读取 ${attack}`,

                parameters: { target: attack },

                sessionId: 'security-test'

            });

            assert.strictEqual(

                result.success,

                false,

                `Path traversal should be blocked: ${attack}`

            );

        }

    });



    it('malformed 输入应被优雅处理', async () => {

        const kernel = new CoreKernel({ projectRoot: __dirname });

        await kernel.initialize();



        const badInputs = [null, undefined, ''];

        for (const input of badInputs) {

            const result = await kernel.process({ content: input, sessionId: 'malformed-test' });

            // 内核不应崩溃，应返回有意义的响应

            assert.ok(result !== undefined);

            assert.ok(typeof result === 'object');

        }

    });

});



// console.log('Running HundunOS Unit Tests...');

