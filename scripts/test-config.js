// hundunos/scripts/test-config.js
// 配置系统测试脚本

import 'reflect-metadata';
import { ConfigLoader, GlobalConfig } from '../kernel/config/config-loader.js';

// console.log('========================================');
// console.log('HundunOS 配置系统测试');
// console.log('========================================\n');

// 测试 1: 加载配置
// console.log('测试 1: 加载配置');
// console.log('------------------------');
try {
  const config = ConfigLoader.load('.', 'development');
  // console.log('✅ 配置加载成功');
  // console.log(`   环境: ${config.environment}`);
  // console.log(`   版本: ${config.version}`);
  // console.log(`   配置来源: ${config.configSource}`);
  // console.log(`   加载时间: ${config.loadedAt}`);
} catch (error) {
  console.error('❌ 配置加载失败:', error.message);
}
// console.log();

// 测试 2: 全局配置类
// console.log('测试 2: 全局配置类');
// console.log('------------------------');
try {
  const config = GlobalConfig();
  // console.log('✅ 全局配置类创建成功');
  // console.log(`   版本: ${config.version}`);
  // console.log(`   名称: ${config.name}`);
  // console.log(`   环境: ${config.environment}`);
  // console.log(`   内核日志级别: ${config.kernel.logLevel}`);
  // console.log(`   内核调试模式: ${config.kernel.debug}`);
  // console.log(`   REST API 端口: ${config.restApi.port}`);
  // console.log(`   存储类型: ${config.storage.type}`);
  // console.log(`   模型路由策略: ${config.modelRouter.defaultStrategy}`);
} catch (error) {
  console.error('❌ 全局配置类创建失败:', error.message);
}
// console.log();

// 测试 3: 环境变量覆盖
// console.log('测试 3: 环境变量覆盖');
// console.log('------------------------');
try {
  process.env.HUNDUNOS_LOG_LEVEL = 'debug';
  process.env.HUNDUNOS_DEBUG = 'true';
  process.env.REST_API_PORT = '39000';

  const config = GlobalConfig();
  // console.log('✅ 环境变量覆盖成功');
  // console.log(`   内核日志级别: ${config.kernel.logLevel} (应为 'debug')`);
  // console.log(`   内核调试模式: ${config.kernel.debug} (应为 true)`);
  // console.log(`   REST API 端口: ${config.restApi.port} (应为 39000)`);

  // 清理环境变量
  delete process.env.HUNDUNOS_LOG_LEVEL;
  delete process.env.HUNDUNOS_DEBUG;
  delete process.env.REST_API_PORT;
} catch (error) {
  console.error('❌ 环境变量覆盖失败:', error.message);
}
// console.log();

// 测试 4: 配置统计
// console.log('测试 4: 配置统计');
// console.log('------------------------');
try {
  const config = ConfigLoader.load('.', 'development');
  const stats = ConfigLoader.getConfigStats(config);
  // console.log('✅ 配置统计获取成功');
  // console.log('   统计信息:');
  // console.log(JSON.stringify(stats, null, 2));
} catch (error) {
  console.error('❌ 配置统计获取失败:', error.message);
}
// console.log();

// 测试 5: 环境模板
// console.log('测试 5: 环境模板');
// console.log('------------------------');
try {
  const prodTemplate = ConfigLoader.createEnvTemplate('production');
  // console.log('✅ 生产环境模板创建成功');
  // console.log('   关键配置:');
  // console.log(`   - NODE_ENV: ${prodTemplate.NODE_ENV}`);
  // console.log(`   - HUNDUNOS_LOG_LEVEL: ${prodTemplate.HUNDUNOS_LOG_LEVEL}`);
  // console.log(`   - LOGGING_FORMAT: ${prodTemplate.LOGGING_FORMAT}`);
  // console.log(`   - REST_API_RATE_LIMIT_ENABLED: ${prodTemplate.REST_API_RATE_LIMIT_ENABLED}`);
  // console.log(`   - STORAGE_ENCRYPT_BACKUPS: ${prodTemplate.STORAGE_ENCRYPT_BACKUPS}`);
} catch (error) {
  console.error('❌ 环境模板创建失败:', error.message);
}
// console.log();

// 测试 6: JSON 配置文件验证
// console.log('测试 6: JSON 配置文件验证');
// console.log('------------------------');
try {
  const result = ConfigLoader.validateJsonFile('./config/system.json');
  if (result.valid) {
    // console.log('✅ JSON 配置文件验证通过');
    // console.log(`   版本: ${result.config.version}`);
    // console.log(`   名称: ${result.config.name}`);
  } else {
    console.warn('⚠️ JSON 配置文件验证失败:');
    result.errors.forEach(error => console.warn(`   - ${error}`));
  }
} catch (error) {
  console.error('❌ JSON 配置文件验证失败:', error.message);
}
// console.log();

// console.log('========================================');
// console.log('测试完成');
// console.log('========================================');
