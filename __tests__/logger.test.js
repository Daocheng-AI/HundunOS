// hundunos/__tests__/logger.test.js — 统一日志系统单元测试

import { Logger, LogLevel, getLogger, setLogger, createLogger } from '../kernel/logger.js';

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
// Logger 构造测试
// ═══════════════════════════════════════════════════════════════

console.log('\n=== Logger 构造测试 ===');

const logger = new Logger({ name: 'Test' });
assert(logger instanceof Logger, 'Logger 实例化');
assert(logger.name === 'Test', '名称设置正确');
assert(logger.level === LogLevel.INFO, '默认级别为 INFO');

// ═══════════════════════════════════════════════════════════════
// LogLevel 测试
// ═══════════════════════════════════════════════════════════════

console.log('\n=== LogLevel 测试 ===');

assert(LogLevel.DEBUG < LogLevel.INFO, 'DEBUG < INFO');
assert(LogLevel.INFO < LogLevel.WARN, 'INFO < WARN');
assert(LogLevel.WARN < LogLevel.ERROR, 'WARN < ERROR');
assert(LogLevel.ERROR < LogLevel.FATAL, 'ERROR < FATAL');

// ═══════════════════════════════════════════════════════════════
// setLevel 测试
// ═══════════════════════════════════════════════════════════════

console.log('\n=== setLevel 测试 ===');

logger.setLevel(LogLevel.DEBUG);
assert(logger.level === LogLevel.DEBUG, '设置 DEBUG 级别');
logger.setLevel(LogLevel.ERROR);
assert(logger.level === LogLevel.ERROR, '设置 ERROR 级别');
logger.setLevel(LogLevel.INFO);

// ═══════════════════════════════════════════════════════════════
// 日志输出测试（不抛异常即通过）
// ═══════════════════════════════════════════════════════════════

console.log('\n=== 日志输出测试 ===');

let errorCalled = false;
const testLogger = new Logger({
    name: 'OutputTest',
    level: LogLevel.DEBUG,
    errorHandler: () => { errorCalled = true; },
});

try { testLogger.debug('debug message'); assert(true, 'debug 输出'); } catch (e) { assert(false, 'debug 输出'); }
try { testLogger.info('info message'); assert(true, 'info 输出'); } catch (e) { assert(false, 'info 输出'); }
try { testLogger.warn('warn message'); assert(true, 'warn 输出'); } catch (e) { assert(false, 'warn 输出'); }
try { testLogger.error('error message'); assert(true, 'error 输出'); } catch (e) { assert(false, 'error 输出'); }
try { testLogger.fatal('fatal message'); assert(true, 'fatal 输出'); } catch (e) { assert(false, 'fatal 输出'); }

assert(errorCalled === true, 'ERROR 级别触发 errorHandler');

// ═══════════════════════════════════════════════════════════════
// 子日志器测试
// ═══════════════════════════════════════════════════════════════

console.log('\n=== 子日志器测试 ===');

const childLogger = testLogger.child('SubModule');
assert(childLogger instanceof Logger, '子日志器实例化');
assert(childLogger.name === 'OutputTest:SubModule', '子日志器名称');
assert(childLogger.level === testLogger.level, '子日志器继承级别');

// ═══════════════════════════════════════════════════════════════
// getStats 测试
// ═══════════════════════════════════════════════════════════════

console.log('\n=== getStats 测试 ===');

const stats = testLogger.getStats();
assert(stats.name === 'OutputTest', '统计信息包含名称');
assert(typeof stats.level === 'string', '统计信息包含级别名称');
assert(typeof stats.outputs === 'number', '统计信息包含输出数量');

// ═══════════════════════════════════════════════════════════════
// 全局日志器测试
// ═══════════════════════════════════════════════════════════════

console.log('\n=== 全局日志器测试 ===');

const globalLogger = getLogger({ name: 'Global' });
assert(globalLogger instanceof Logger, '获取全局日志器');

const customLogger = new Logger({ name: 'Custom' });
setLogger(customLogger);
assert(getLogger().name === 'Custom', '设置全局日志器');

const moduleLogger = createLogger('Module');
assert(moduleLogger.name === 'Custom:Module', '创建模块日志器');

// 恢复默认
setLogger(globalLogger);

// ═══════════════════════════════════════════════════════════════
// 结果汇总
// ═══════════════════════════════════════════════════════════════

console.log(`\n╔══════════════════════════════════════════╗`);
console.log(`║   logger.test.js 结果                    ║`);
console.log(`╚══════════════════════════════════════════╝`);
console.log(`总计: ${passed + failed} | 通过: ${passed} | 失败: ${failed} | 通过率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

if (failed > 0) {
    console.error('❌ 存在失败的测试');
    process.exit(1);
} else {
    console.log('✅ 所有测试通过');
}
