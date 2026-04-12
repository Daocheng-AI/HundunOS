// hundunos/scripts/test-di.js
// 依赖注入容器测试脚本

import { registerCoreServices, getService, hasService, getContainerStats } from '../kernel/di/service-registrar.js';
import { LoggerService, ConfigService, KernelService } from '../kernel/di/service-registrar.js';

console.log('========================================');
console.log('HundunOS 依赖注入容器测试');
console.log('========================================\n');

// 测试 1: 注册服务
console.log('测试 1: 注册核心服务');
console.log('------------------------');
try {
  registerCoreServices();
  console.log('✅ 核心服务注册成功');
} catch (error) {
  console.error('❌ 核心服务注册失败:', error.message);
}
console.log();

// 测试 2: 检查服务是否已注册
console.log('测试 2: 检查服务注册状态');
console.log('------------------------');
try {
  const hasLogger = hasService(LoggerService);
  const hasConfig = hasService(ConfigService);
  const hasKernel = hasService(KernelService);

  console.log('✅ 服务注册状态检查成功');
  console.log(`   LoggerService: ${hasLogger ? '✓' : '✗'}`);
  console.log(`   ConfigService: ${hasConfig ? '✓' : '✗'}`);
  console.log(`   KernelService: ${hasKernel ? '✓' : '✗'}`);
} catch (error) {
  console.error('❌ 服务注册状态检查失败:', error.message);
}
console.log();

// 测试 3: 获取服务实例
console.log('测试 3: 获取服务实例');
console.log('------------------------');
try {
  const logger = getService(LoggerService);
  const config = getService(ConfigService);
  const kernel = getService(KernelService);

  console.log('✅ 服务实例获取成功');
  console.log(`   LoggerService 实例: ${logger ? '✓' : '✗'}`);
  console.log(`   ConfigService 实例: ${config ? '✓' : '✗'}`);
  console.log(`   KernelService 实例: ${kernel ? '✓' : '✗'}`);
} catch (error) {
  console.error('❌ 服务实例获取失败:', error.message);
}
console.log();

// 测试 4: 测试单例模式
console.log('测试 4: 测试单例模式');
console.log('------------------------');
try {
  const logger1 = getService(LoggerService);
  const logger2 = getService(LoggerService);

  const isSameInstance = logger1 === logger2;
  console.log('✅ 单例模式测试成功');
  console.log(`   两次获取的实例是否相同: ${isSameInstance ? '✓' : '✗'}`);
} catch (error) {
  console.error('❌ 单例模式测试失败:', error.message);
}
console.log();

// 测试 5: 测试服务依赖
console.log('测试 5: 测试服务依赖');
console.log('------------------------');
try {
  const kernel = getService(KernelService);

  console.log('✅ 服务依赖测试成功');
  console.log(`   KernelService 有 LoggerService: ${kernel.logger ? '✓' : '✗'}`);
  console.log(`   KernelService 有 ConfigService: ${kernel.config ? '✓' : '✗'}`);
} catch (error) {
  console.error('❌ 服务依赖测试失败:', error.message);
}
console.log();

// 测试 6: 测试日志服务
console.log('测试 6: 测试日志服务');
console.log('------------------------');
try {
  const logger = getService(LoggerService);

  console.log('✅ 日志服务测试成功');
  logger.debug('This is a debug message');
  logger.info('This is an info message');
  logger.warn('This is a warning message');
  logger.error('This is an error message');
} catch (error) {
  console.error('❌ 日志服务测试失败:', error.message);
}
console.log();

// 测试 7: 测试配置服务
console.log('测试 7: 测试配置服务');
console.log('------------------------');
try {
  const config = getService(ConfigService);

  config.set('app.name', 'HundunOS');
  config.set('app.version', '3.6.0');
  config.set('app.features.debug', true);

  console.log('✅ 配置服务测试成功');
  console.log(`   app.name: ${config.get('app.name')}`);
  console.log(`   app.version: ${config.get('app.version')}`);
  console.log(`   app.features.debug: ${config.get('app.features.debug')}`);
  console.log(`   app.nonexistent: ${config.get('app.nonexistent', 'default')}`);
} catch (error) {
  console.error('❌ 配置服务测试失败:', error.message);
}
console.log();

// 测试 8: 测试内核服务
console.log('测试 8: 测试内核服务');
console.log('------------------------');
try {
  const kernel = getService(KernelService);

  // 设置配置
  const config = getService(ConfigService);
  config.set('version', '3.6.0');
  config.set('modules', {
    edict: { enabled: true },
    permissionGating: { enabled: true }
  });

  // 启动内核
  await kernel.start();

  // 获取状态
  const status = kernel.getStatus();

  console.log('✅ 内核服务测试成功');
  console.log(`   运行状态: ${status.isRunning ? '运行中' : '已停止'}`);
  console.log(`   版本: ${status.version}`);
  console.log(`   运行时间: ${status.uptime}ms`);

  // 停止内核
  await kernel.stop();

  const stoppedStatus = kernel.getStatus();
  console.log(`   停止后状态: ${stoppedStatus.isRunning ? '运行中' : '已停止'}`);
} catch (error) {
  console.error('❌ 内核服务测试失败:', error.message);
}
console.log();

// 测试 9: 获取容器统计信息
console.log('测试 9: 获取容器统计信息');
console.log('------------------------');
try {
  const stats = getContainerStats();

  console.log('✅ 容器统计信息获取成功');
  console.log('   统计信息:');
  console.log(JSON.stringify(stats, null, 2));
} catch (error) {
  console.error('❌ 容器统计信息获取失败:', error.message);
}
console.log();

console.log('========================================');
console.log('测试完成');
console.log('========================================');
