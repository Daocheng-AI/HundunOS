/**
 * Supermemory 集成测试脚本
 *
 * 用于验证 Supermemory 集成是否正常工作
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 加载配置
 */
function loadConfig() {
  try {
    const configPath = join(process.cwd(), 'config', 'system.json');
    const configContent = readFileSync(configPath, 'utf8');
    return JSON.parse(configContent);
  } catch (error) {
    console.error('❌ 无法加载配置文件:', error.message);
    throw error;
  }
}

/**
 * 检查配置
 */
function checkConfig(config) {
  console.log('📋 检查配置...\n');

  // 检查 Supermemory 配置
  if (!config.supermemory) {
    console.log('❌ Supermemory 配置不存在');
    return false;
  }

  console.log('✅ Supermemory 配置存在');
  console.log(`   启用状态: ${config.supermemory.enabled ? '✅ 已启用' : '⚠️  未启用'}`);
  console.log(`   API 版本: ${config.supermemory.apiVersion}`);
  console.log(`   基础 URL: ${config.supermemory.baseUrl}`);
  console.log(`   容器标签策略: ${config.supermemory.containerTagStrategy}`);
  console.log(`   缓存: ${config.supermemory.cache?.enabled ? '✅ 已启用' : '⚠️  未启用'}`);
  console.log(`   批量操作: ${config.supermemory.batch?.enabled ? '✅ 已启用' : '⚠️  未启用'}`);
  console.log(`   同步: ${config.supermemory.sync?.enabled ? '✅ 已启用' : '⚠️  未启用'}`);
  console.log(`   离线模式: ${config.supermemory.offline?.enabled ? '✅ 已启用' : '⚠️  未启用'}`);

  return true;
}

/**
 * 检查环境变量
 */
function checkEnvVariables() {
  console.log('\n🔑 检查环境变量...\n');

  const apiKey = process.env.SUPERMEMORY_API_KEY;

  if (!apiKey) {
    console.log('⚠️  SUPERMEMORY_API_KEY 未设置');
    console.log('   提示: 请在 .env 文件中设置: SUPERMEMORY_API_KEY=sk_your_api_key_here');
    return false;
  }

  // 验证 API 密钥格式
  if (!apiKey.startsWith('sk_')) {
    console.log('⚠️  SUPERMEMORY_API_KEY 格式不正确（应以 sk_ 开头）');
    return false;
  }

  console.log('✅ SUPERMEMORY_API_KEY 已设置');
  console.log(`   密钥长度: ${apiKey.length} 字符`);
  console.log(`   密钥格式: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`);

  return true;
}

/**
 * 检查文件结构
 */
function checkFileStructure() {
  console.log('\n📁 检查文件结构...\n');

  const requiredFiles = [
    'kernel/supermemory/supermemory-mixin.js',
    'kernel/supermemory/config-loader.js',
    'kernel/supermemory/adapters/api-client.js',
    'kernel/supermemory/adapters/supermemory-adapter.js',
    'kernel/supermemory/managers/error-handler.js',
    'kernel/supermemory/managers/cache-manager.js',
    'kernel/supermemory/managers/bulk-operator.js',
    'kernel/supermemory/integrations/context-enhancer-integration.js',
    'kernel/supermemory/integrations/memory-graph-integration.js',
    'kernel/supermemory/utils/helpers.js',
    'kernel/supermemory/types/index.js'
  ];

  const optionalFiles = [
    'kernel/supermemory/examples.js',
    'kernel/supermemory/README.md',
    'kernel/supermemory/QUICKSTART.md',
    'kernel/supermemory/IMPLEMENTATION_SUMMARY.md',
    'kernel/supermemory/PROJECT_COMPLETION_REPORT.md',
    'kernel/supermemory/DEPLOYMENT_GUIDE.md'
  ];

  let missingFiles = [];

  console.log('必需文件:');
  for (const file of requiredFiles) {
    try {
      const stats = statSync(join(process.cwd(), file));
      if (stats.isFile()) {
        console.log(`  ✅ ${file}`);
      } else {
        console.log(`  ❌ ${file} (不是文件)`);
        missingFiles.push(file);
      }
    } catch (error) {
      console.log(`  ❌ ${file} (不存在)`);
      missingFiles.push(file);
    }
  }

  console.log('\n可选文件:');
  for (const file of optionalFiles) {
    try {
      const stats = statSync(join(process.cwd(), file));
      if (stats.isFile()) {
        console.log(`  ✅ ${file}`);
      } else {
        console.log(`  ⚠️  ${file} (不是文件)`);
      }
    } catch (error) {
      console.log(`  ⚠️  ${file} (不存在)`);
    }
  }

  return missingFiles.length === 0;
}

/**
 * 检查 ModuleMixin 注册
 */
function checkModuleMixinRegistration() {
  console.log('\n🔧 检查 ModuleMixin 注册...\n');

  try {
    const moduleMixinPath = join(process.cwd(), 'kernel', 'mixins', 'ModuleMixin.js');
    const content = readFileSync(moduleMixinPath, 'utf8');

    if (content.includes('SupermemoryMixin')) {
      console.log('✅ SupermemoryMixin 已在 ModuleMixin 中注册');
      return true;
    } else {
      console.log('❌ SupermemoryMixin 未在 ModuleMixin 中注册');
      return false;
    }
  } catch (error) {
    console.log('❌ 无法检查 ModuleMixin:', error.message);
    return false;
  }
}

/**
 * 生成测试报告
 */
function generateTestReport(results) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试报告');
  console.log('='.repeat(60) + '\n');

  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  const failedTests = results.filter(r => !r.passed).length;

  console.log(`总测试数: ${totalTests}`);
  console.log(`通过: ${passedTests} ✅`);
  console.log(`失败: ${failedTests} ❌`);
  console.log(`通过率: ${((passedTests / totalTests) * 100).toFixed(1)}%\n`);

  if (failedTests > 0) {
    console.log('失败的测试:');
    results.filter(r => !r.passed).forEach(result => {
      console.log(`  ❌ ${result.name}`);
      console.log(`     ${result.message}`);
    });
    console.log();
  }

  console.log('='.repeat(60));
  console.log();

  return failedTests === 0;
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log('🧪 Supermemory 集成测试');
  console.log('='.repeat(60));
  console.log();

  const results = [];

  // 测试 1: 配置检查
  try {
    const config = loadConfig();
    const passed = checkConfig(config);
    results.push({
      name: '配置检查',
      passed: passed,
      message: passed ? '配置正确' : '配置不正确'
    });
  } catch (error) {
    results.push({
      name: '配置检查',
      passed: false,
      message: error.message
    });
  }

  // 测试 2: 环境变量检查
  try {
    const passed = checkEnvVariables();
    results.push({
      name: '环境变量检查',
      passed: passed,
      message: passed ? '环境变量正确' : '环境变量未设置'
    });
  } catch (error) {
    results.push({
      name: '环境变量检查',
      passed: false,
      message: error.message
    });
  }

  // 测试 3: 文件结构检查
  try {
    const passed = checkFileStructure();
    results.push({
      name: '文件结构检查',
      passed: passed,
      message: passed ? '文件结构完整' : '缺少必需文件'
    });
  } catch (error) {
    results.push({
      name: '文件结构检查',
      passed: false,
      message: error.message
    });
  }

  // 测试 4: ModuleMixin 注册检查
  try {
    const passed = checkModuleMixinRegistration();
    results.push({
      name: 'ModuleMixin 注册检查',
      passed: passed,
      message: passed ? '注册成功' : '未注册'
    });
  } catch (error) {
    results.push({
      name: 'ModuleMixin 注册检查',
      passed: false,
      message: error.message
    });
  }

  // 生成测试报告
  const allPassed = generateTestReport(results);

  if (allPassed) {
    console.log('✅ 所有测试通过！Supermemory 集成配置正确。\n');
    console.log('下一步：');
    console.log('1. 确保 .env 文件中设置了 SUPERMEMORY_API_KEY');
    console.log('2. 在 config/system.json 中设置 supermemory.enabled = true');
    console.log('3. 启动 HundunOS: npm start');
    console.log('4. 查看日志中的 Supermemory 初始化信息');
  } else {
    console.log('❌ 部分测试失败，请检查上述问题。\n');
    console.log('建议操作：');
    console.log('1. 阅读 DEPLOYMENT_GUIDE.md 了解详细部署步骤');
    console.log('2. 确保所有必需文件都已创建');
    console.log('3. 检查配置文件格式是否正确');
  }

  return allPassed;
}

// 主函数
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('测试执行失败:', error);
      process.exit(1);
    });
}
