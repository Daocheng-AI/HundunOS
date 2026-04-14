// hundunos/scripts/test-config-v2.js
// 配置系统测试脚本（基于 Schema）

import { ConfigLoader, GlobalConfig } from '../kernel/config/config-loader-v2.js';

// console.log('========================================');
// console.log('HundunOS 配置系统测试 (Schema 版本)');
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
  const config = GlobalConfig.create();
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

  const config = GlobalConfig.create();
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

// 测试 7: Schema 验证
// console.log('测试 7: Schema 验证');
// console.log('------------------------');
try {
  // 测试有效的日志级别
  process.env.HUNDUNOS_LOG_LEVEL = 'debug';
  let config = GlobalConfig.create();
  // console.log('✅ 有效日志级别 "debug" 验证通过:', config.kernel.logLevel);

  // 测试无效的日志级别（应该回退到默认值）
  process.env.HUNDUNOS_LOG_LEVEL = 'invalid';
  config = GlobalConfig.create();
  // console.log('✅ 无效日志级别回退到默认值:', config.kernel.logLevel);

  // 测试有效的端口号
  process.env.REST_API_PORT = '39000';
  config = GlobalConfig.create();
  // console.log('✅ 有效端口号 "39000" 验证通过:', config.restApi.port);

  // 测试无效的端口号（应该回退到默认值）
  process.env.REST_API_PORT = '99999';
  config = GlobalConfig.create();
  // console.log('✅ 无效端口号回退到默认值:', config.restApi.port);

  // 清理环境变量
  delete process.env.HUNDUNOS_LOG_LEVEL;
  delete process.env.REST_API_PORT;
} catch (error) {
  console.error('❌ Schema 验证失败:', error.message);
}
// console.log();

// 测试 8: 嵌套配置
// console.log('测试 8: 嵌套配置');
// console.log('------------------------');
try {
  const config = GlobalConfig.create();
  // console.log('✅ 嵌套配置测试成功');
  // console.log(`   内核配置: ${config.kernel ? '✓' : '✗'}`);
  // console.log(`   模型路由器配置: ${config.modelRouter ? '✓' : '✗'}`);
  // console.log(`   REST API 配置: ${config.restApi ? '✓' : '✗'}`);
  // console.log(`   存储配置: ${config.storage ? '✓' : '✗'}`);
  // console.log(`   日志配置: ${config.logging ? '✓' : '✗'}`);
  // console.log(`   熔断器配置: ${config.modelRouter.circuitBreaker ? '✓' : '✗'}`);
  // console.log(`   CORS 配置: ${config.restApi.cors ? '✓' : '✗'}`);
} catch (error) {
  console.error('❌ 嵌套配置测试失败:', error.message);
}
// console.log();

// 测试 9: 类型转换
// console.log('测试 9: 类型转换');
// console.log('------------------------');
try {
  // 测试布尔值转换
  process.env.HUNDUNOS_DEBUG = 'true';
  process.env.RUST_MODULES_ENABLED = '1';
  process.env.SKILLS_HOT_RELOAD = 'false';
  let config = GlobalConfig.create();
  // console.log('✅ 布尔值转换测试成功');
  // console.log(`   'true' -> ${config.kernel.debug}`);
  // console.log(`   '1' -> ${config.rustModules.enabled}`);
  // console.log(`   'false' -> ${config.skills.hotReload}`);

  // 测试数字转换
  process.env.HUNDUNOS_MAX_RETRIES = '5';
  process.env.REST_API_PORT = '39000';
  config = GlobalConfig.create();
  // console.log('✅ 数字转换测试成功');
  // console.log(`   '5' -> ${config.kernel.maxRetries} (number)`);
  // console.log(`   '39000' -> ${config.restApi.port} (number)`);

  // 测试数组转换
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:38080,http://127.0.0.1:38080,https://example.com';
  process.env.SKILLS_DIRS = './.claude/skills,./skills,./custom/skills';
  config = GlobalConfig.create();
  // console.log('✅ 数组转换测试成功');
  // console.log(`   CORS 源: ${config.restApi.cors.allowedOrigins.join(', ')}`);
  // console.log(`   技能目录: ${config.skills.dirs.join(', ')}`);

  // 清理环境变量
  delete process.env.HUNDUNOS_DEBUG;
  delete process.env.RUST_MODULES_ENABLED;
  delete process.env.SKILLS_HOT_RELOAD;
  delete process.env.HUNDUNOS_MAX_RETRIES;
  delete process.env.REST_API_PORT;
  delete process.env.CORS_ALLOWED_ORIGINS;
  delete process.env.SKILLS_DIRS;
} catch (error) {
  console.error('❌ 类型转换测试失败:', error.message);
}
// console.log();

// console.log('========================================');
// console.log('测试完成');
// console.log('========================================');
