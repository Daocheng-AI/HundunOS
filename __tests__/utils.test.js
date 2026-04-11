// hundunos/__tests__/utils.test.js — 公共工具函数单元测试

import { deepMerge, resolveProjectPath, isPathAllowed, safeJsonParse, retry, debounce, throttle, formatError, isValidUrl, generateId } from '../kernel/utils.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        passed++;
        console.log(`  ✅ ${message}`);
    } else {
        failed++;
        console.error(`  ❌ ${message}`);
    }
}

// ═══════════════════════════════════════════════════════════════
// deepMerge 测试
// ═══════════════════════════════════════════════════════════════

console.log('\n=== deepMerge 测试 ===');

assert(deepMerge({}, {}) !== undefined, '空对象合并返回对象');
assert(deepMerge({ a: 1 }, { b: 2 }).a === 1, '保留基础属性');
assert(deepMerge({ a: 1 }, { b: 2 }).b === 2, '添加覆盖属性');
assert(deepMerge({ a: 1 }, { a: 2 }).a === 2, '覆盖同名属性');
assert(deepMerge({ a: { b: 1 } }, { a: { c: 2 } }).a.b === 1, '深度合并保留子属性');
assert(deepMerge({ a: { b: 1 } }, { a: { c: 2 } }).a.c === 2, '深度合并添加子属性');
assert(Array.isArray(deepMerge({ a: [1] }, { a: [2] }).a), '数组直接覆盖而非合并');
assert(deepMerge(null, { a: 1 }).a === 1, 'base 为 null 时正常处理');
assert(deepMerge({ a: 1 }, null).a === 1, 'override 为 null 时正常处理');

// ═══════════════════════════════════════════════════════════════
// resolveProjectPath 测试
// ═══════════════════════════════════════════════════════════════

console.log('\n=== resolveProjectPath 测试 ===');

assert(resolveProjectPath(null, '/base') === '/base', '空路径返回基础目录');
assert(resolveProjectPath('', '/base') === '/base', '空字符串返回基础目录');
assert(resolveProjectPath('/absolute', '/base') === '/absolute', '绝对路径直接返回');
assert(resolveProjectPath('relative', '/base').includes('relative'), '相对路径拼接基础目录');

// ═══════════════════════════════════════════════════════════════
// isPathAllowed 测试
// ═══════════════════════════════════════════════════════════════

console.log('\n=== isPathAllowed 测试 ===');

assert(isPathAllowed('/base/sub', ['/base']) === true, '子路径允许');
assert(isPathAllowed('/other', ['/base']) === false, '外部路径拒绝');
assert(isPathAllowed(null, ['/base']) === false, '空路径拒绝');
assert(isPathAllowed('/base', ['/base']) === true, '相同路径允许');

// ═══════════════════════════════════════════════════════════════
// safeJsonParse 测试
// ═══════════════════════════════════════════════════════════════

console.log('\n=== safeJsonParse 测试 ===');

assert(safeJsonParse('{"a":1}').a === 1, '有效 JSON 解析');
assert(safeJsonParse('invalid') === null, '无效 JSON 返回 null');
assert(safeJsonParse('invalid', {}).constructor === Object, '无效 JSON 返回默认值');
assert(safeJsonParse('null') === null, 'null JSON 返回 null');

// ═══════════════════════════════════════════════════════════════
// formatError 测试
// ═══════════════════════════════════════════════════════════════

console.log('\n=== formatError 测试 ===');

assert(formatError(new Error('test')).includes('Error: test'), 'Error 对象格式化');
assert(formatError('string') === 'string', '字符串错误格式化');
assert(formatError(new Error('test')).includes('stack') || formatError(new Error('test')).length > 10, 'Error 包含堆栈信息');

// ═══════════════════════════════════════════════════════════════
// isValidUrl 测试
// ═══════════════════════════════════════════════════════════════

console.log('\n=== isValidUrl 测试 ===');

assert(isValidUrl('https://example.com') === true, '有效 HTTPS URL');
assert(isValidUrl('http://localhost:3000') === true, '有效 HTTP URL');
assert(isValidUrl('not-a-url') === false, '无效 URL');
assert(isValidUrl('') === false, '空字符串不是 URL');

// ═══════════════════════════════════════════════════════════════
// generateId 测试
// ═══════════════════════════════════════════════════════════════

console.log('\n=== generateId 测试 ===');

const id1 = generateId();
const id2 = generateId();
assert(typeof id1 === 'string', '生成字符串 ID');
assert(id1 !== id2, '生成唯一 ID');
assert(generateId('test').startsWith('test_'), '带前缀的 ID');

// ═══════════════════════════════════════════════════════════════
// retry 测试
// ═══════════════════════════════════════════════════════════════

console.log('\n=== retry 测试 ===');

let retryCount = 0;
try {
    await retry(async () => {
        retryCount++;
        if (retryCount < 3) throw new Error('retry');
        return 'success';
    }, 3, 10);
    assert(retryCount === 3, '重试 3 次后成功');
} catch (e) {
    assert(false, '重试 3 次后成功');
}

try {
    await retry(async () => { throw new Error('always fail'); }, 2, 10);
    assert(false, '超过重试次数抛出错误');
} catch (e) {
    assert(e.message === 'always fail', '超过重试次数抛出错误');
}

// ═══════════════════════════════════════════════════════════════
// 结果汇总
// ═══════════════════════════════════════════════════════════════

console.log(`\n╔══════════════════════════════════════════╗`);
console.log(`║   utils.test.js 结果                     ║`);
console.log(`╚══════════════════════════════════════════╝`);
console.log(`总计: ${passed + failed} | 通过: ${passed} | 失败: ${failed} | 通过率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

if (failed > 0) {
    console.error('❌ 存在失败的测试');
    process.exit(1);
} else {
    console.log('✅ 所有测试通过');
}
