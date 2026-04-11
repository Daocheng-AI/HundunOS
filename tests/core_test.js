// hundunos/tests/core_test.js — HundunOS 核心模块测试
// 8 个核心测试，覆盖 Kernel、Storage、IntentEngine、MessageBus、MemoryGraph

import { CoreKernel } from '../kernel/core.js';

export async function test_kernel_initialize() {
    const k = new CoreKernel();
    await k.initialize();
    if (!k.state || !k.state.running) throw new Error('Kernel not running');
    await k.shutdown();
}

export async function test_kernel_process_returns_structure() {
    const k = new CoreKernel();
    await k.initialize();
    const r = await k.process({ content: 'hello' });
    if (typeof r.success !== 'boolean') throw new Error('Missing success field');
    if (typeof r.type !== 'string') throw new Error('Missing type field');
    if (typeof r.latency !== 'number') throw new Error('Missing latency field');
    await k.shutdown();
}

export async function test_kernel_process_hello() {
    const k = new CoreKernel();
    await k.initialize();
    const r = await k.process({ content: 'hello' });
    if (!r.success) throw new Error('Process should succeed for hello');
    if (!r.type) throw new Error('Type should be defined');
    await k.shutdown();
}

export async function test_storage_put_get() {
    const k = new CoreKernel();
    await k.initialize();
    await k.storage.put('test:put_get', { value: 42, ts: Date.now() });
    const v = await k.storage.get('test:put_get');
    if (v.value !== 42) throw new Error(`Expected 42, got ${v.value}`);
    await k.shutdown();
}

export async function test_messagebus_pub_sub() {
    const k = new CoreKernel();
    await k.initialize();
    let triggered = false;
    k.messageBus.subscribe('test:pubsub', () => { triggered = true; });
    k.messageBus.publish('test:pubsub', { data: 1 });
    await new Promise(r => setTimeout(r, 50));
    if (!triggered) throw new Error('Pub/sub did not trigger callback');
    await k.shutdown();
}

export async function test_all_modules_loaded() {
    const k = new CoreKernel();
    await k.initialize();
    const required = [
        'storage', 'messageBus', 'envHealth', 'auditLogger', 'privacyShield',
        'aware', 'intentEngine', 'messageRouter', 'permissionGating',
        'recoverableMemory', 'modelRouter', 'upgradeController', 'memoryGraph', 'toolBridge'
    ];
    for (const mod of required) {
        if (!k[mod]) throw new Error(`Module missing: ${mod}`);
    }
    await k.shutdown();
}

export async function test_intent_engine_recognize() {
    const k = new CoreKernel();
    await k.initialize();
    const r = await k.process({ content: 'hello' });
    if (!r.type) throw new Error('IntentEngine should return a type');
    await k.shutdown();
}

export async function test_memory_graph_record_recall() {
    const k = new CoreKernel();
    await k.initialize();
    await k.memoryGraph.record(
        { content: 'test record message' },
        { type: 'test', action: 'record' },
        { success: true }
    );
    const results = await k.memoryGraph.recall('test');
    if (results.recent.length === 0) throw new Error('Memory recall returned nothing');
    await k.shutdown();
}
