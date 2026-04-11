// hundunos/tests/module_registry_test.js
// ModuleRegistry 工厂模式单元测试

import { ModuleRegistry } from '../kernel/module-registry.js';

// 测试计数器（与 test_runner.js 兼容）
let _passed = 0, _failed = 0;
const _assert = (cond, msg) => {
    if (!cond) { _failed++; throw new Error(msg || 'Assertion failed'); }
    _passed++;
};

// ================================================================
// Test: registerFactory — 基本注册与惰性实例化
// ================================================================
export async function test_factory_register_and_lazy() {
    const registry = new ModuleRegistry({});

    // 注册一个简单工厂
    let called = false;
    registry.registerFactory('dummy', async () => {
        called = true;
        return { name: 'dummy', value: 42 };
    }, { type: 'kernel', version: '1.0.0' });

    // 实例化前：called === false
    _assert(!called, 'Factory should not be called before get()');
    _assert(registry.has('dummy'), 'Module should be registered');

    // 惰性获取
    const inst = await registry.getInstance('dummy');
    _assert(called === true, 'Factory should be called after getInstance()');
    _assert(inst.value === 42, 'Instance should have correct value');
    _assert((await registry.getInstance('dummy')).value === 42, 'Cached instance should be returned');
}

// ================================================================
// Test: registerFactory — 重复注册应跳过
// ================================================================
export async function test_factory_duplicate_skip() {
    const registry = new ModuleRegistry({});
    let callCount = 0;

    registry.registerFactory('dup', async () => { callCount++; return {}; });
    registry.registerFactory('dup', async () => { callCount += 100; return {}; }); // 应跳过

    await registry.getInstance('dup');
    _assert(callCount === 1, `Factory should only be called once, got ${callCount}`);
}

// ================================================================
// Test: getInstance — 未注册模块应抛出明确错误
// ================================================================
export async function test_get_unregistered_error() {
    const registry = new ModuleRegistry({});
    let err = null;
    try {
        await registry.getInstance('nonexistent');
    } catch (e) {
        err = e;
    }
    _assert(err !== null, 'Should throw for unregistered module');
    _assert(err.message.includes('not registered'), 'Error message should mention "not registered"');
}

// ================================================================
// Test: getInstance — 有元数据但无工厂应抛出错误
// ================================================================
export async function test_get_no_factory_error() {
    const registry = new ModuleRegistry({});
    // 手动注册一个没有工厂的条目（instance=null）
    registry.register({ id: 'nofactory', name: 'nofactory', type: 'kernel', instance: null });

    let err = null;
    try {
        await registry.getInstance('nofactory');
    } catch (e) {
        err = e;
    }
    _assert(err !== null, 'Should throw when no factory and no instance');
    _assert(err.message.includes('no factory'), 'Error should mention no factory');
}

// ================================================================
// Test: initAll — 并行初始化所有模块
// ================================================================
export async function test_init_all() {
    const registry = new ModuleRegistry({});
    const order = [];

    registry.registerFactory('mod-a', async () => { order.push('a'); return { id: 'a' }; });
    registry.registerFactory('mod-b', async () => { order.push('b'); return { id: 'b' }; });
    registry.registerFactory('mod-c', async () => { order.push('c'); return { id: 'c' }; });

    await registry.initAll();

    const allReady = ['a', 'b', 'c'].every(async id => {
        const inst = await registry.getInstance(id);
        return inst?.id === id;
    });
    _assert(await allReady, 'All modules should be instantiated after initAll');
}

// ================================================================
// Test: activate / deactivate — 模块生命周期
// ================================================================
export async function test_activate_deactivate() {
    const registry = new ModuleRegistry({});
    let activated = false, deactivated = false;

    const makeMod = (id) => ({
        id,
        async activate() { activated = true; },
        async deactivate() { deactivated = true; }
    });

    registry.registerFactory('lifecycle', async () => makeMod('lifecycle'));
    const inst = await registry.getInstance('lifecycle');
    _assert(inst.id === 'lifecycle', 'Instance should be created by factory');

    await registry.activate('lifecycle');
    const entry = registry.get('lifecycle');
    _assert(entry.status === 'active', `Status should be 'active', got '${entry.status}'`);

    await registry.deactivate('lifecycle');
    _assert(entry.status === 'sleeping', `Status should be 'sleeping', got '${entry.status}'`);
}

// ================================================================
// Test: activate — 未注册模块应抛出错误
// ================================================================
export async function test_activate_unknown_error() {
    const registry = new ModuleRegistry({});
    let err = null;
    try {
        await registry.activate('unknown');
    } catch (e) { err = e; }
    _assert(err !== null, 'activate() should throw for unknown module');
    _assert(err.message.includes('not found'), 'Error should mention "not found"');
}

// ================================================================
// Test: fromConfig — 基本配置驱动注册
// ================================================================
export async function test_from_config_basic() {
    const registry = new ModuleRegistry({ config: { projectRoot: '' } });
    const fakeKernel = {};

    const cfg = {
        modules: {
            'memory-graph': {
                enabled: true,
                type: 'kernel',
                lazy: true
            },
            'aware-system': {
                enabled: false   // 应跳过
            },
            'tool-bridge': {
                enabled: true,
                type: 'kernel',
                lazy: false
            }
        }
    };

    const result = registry.fromConfig(cfg, fakeKernel);

    _assert(result.registered.length === 2, `Should register 2 modules, got ${result.registered.length}`);
    _assert(result.skipped.includes('aware-system'), 'disabled module should be in skipped list');
    _assert(registry.has('memory-graph'), 'memory-graph should be registered');
    _assert(registry.has('tool-bridge'), 'tool-bridge should be registered');
    _assert(!registry.has('aware-system'), 'disabled module should NOT be registered');
}

// ================================================================
// Test: fromConfig — 未提供 modules 字段应安全处理
// ================================================================
export async function test_from_config_empty() {
    const registry = new ModuleRegistry({});
    const result = registry.fromConfig({}, {});
    _assert(result.registered.length === 0, 'Empty config should register nothing');
    _assert(result.skipped.length === 0, 'Empty config should have no skips');
}

// ================================================================
// Test: getStats — 统计准确性
// ================================================================
export async function test_get_stats() {
    const registry = new ModuleRegistry({});
    registry.registerFactory('f1', async () => ({}), { type: 'kernel' });
    registry.registerFactory('f2', async () => ({}), { type: 'stable' });
    registry.register({ id: 'pre1', instance: {}, type: 'kernel' });  // 预注册

    const stats = registry.getStats();
    _assert(stats.total === 3, `Total should be 3, got ${stats.total}`);
    _assert(stats.factories === 2, `Factories should be 2, got ${stats.factories}`);
    _assert(stats.byType.kernel === 2, `kernel type should be 2, got ${stats.byType.kernel}`);
    _assert(stats.byType.stable === 1, `stable type should be 1, got ${stats.byType.stable}`);
}

// ================================================================
// Test: listModules — 过滤功能
// ================================================================
export async function test_list_modules_filter() {
    const registry = new ModuleRegistry({});
    registry.registerFactory('kernel-a', async () => ({}), { type: 'kernel' });
    registry.registerFactory('kernel-b', async () => ({}), { type: 'kernel' });
    registry.registerFactory('stable-a', async () => ({}), { type: 'stable' });

    const all = registry.listModules();
    _assert(all.length === 3, `Should list 3 modules, got ${all.length}`);

    const kernels = registry.listModules({ type: 'kernel' });
    _assert(kernels.length === 2, `Should list 2 kernel modules, got ${kernels.length}`);
}

// ================================================================
// Test: lifecycle events
// ================================================================
export async function test_lifecycle_events() {
    const registry = new ModuleRegistry({});
    const events = [];

    registry.on('module:instantiated', (m) => events.push(`instantiated:${m.id}`));
    registry.on('module:activated', (m) => events.push(`activated:${m.id}`));
    registry.on('module:deactivated', (m) => events.push(`deactivated:${m.id}`));

    registry.registerFactory('evt-mod', async () => ({
        id: 'evt-mod', async activate() {}, async deactivate() {}
    }));

    await registry.getInstance('evt-mod');
    await registry.activate('evt-mod');
    await registry.deactivate('evt-mod');

    _assert(events.includes('instantiated:evt-mod'), 'Should fire instantiated event');
    _assert(events.includes('activated:evt-mod'), 'Should fire activated event');
    _assert(events.includes('deactivated:evt-mod'), 'Should fire deactivated event');
}

// ================================================================
// Test: 错误工厂应正确传播并标记为 error
// ================================================================
export async function test_factory_error_propagates() {
    const registry = new ModuleRegistry({});
    registry.registerFactory('bad', async () => { throw new Error('Factory intentionally failed'); });

    let err = null;
    try {
        await registry.getInstance('bad');
    } catch (e) {
        err = e;
    }

    _assert(err !== null, 'Should propagate factory error');
    _assert(err.message.includes('Factory intentionally failed'), 'Should preserve original error message');

    const entry = registry.get('bad');
    _assert(entry.status === 'error', `Status should be 'error', got '${entry.status}'`);
    _assert(entry.error === 'Factory intentionally failed', 'Error message should be stored');
}

// ================================================================
// 打印摘要（test_runner.js 自动调用 test_* 函数，无需汇总）
// ================================================================
