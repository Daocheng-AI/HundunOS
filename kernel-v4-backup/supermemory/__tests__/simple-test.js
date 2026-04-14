#!/usr/bin/env node

/**
 * Supermemory 集成简单测试
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..', '..');

console.log('🧪 Supermemory 集成测试');
console.log('='.repeat(60));
console.log();

// 测试 1: 检查配置文件
console.log('📋 测试 1: 检查配置文件...');
try {
  const configPath = join(ROOT, 'config', 'system.json');
  const configContent = readFileSync(configPath, 'utf8');
  const config = JSON.parse(configContent);

  if (config.supermemory) {
    console.log('✅ Supermemory 配置存在');
    console.log(`   启用状态: ${config.supermemory.enabled ? '✅ 已启用' : '⚠️  未启用'}`);
    console.log(`   API 版本: ${config.supermemory.apiVersion}`);
    console.log(`   基础 URL: ${config.supermemory.baseUrl}`);
  } else {
    console.log('❌ Supermemory 配置不存在');
  }
} catch (error) {
  console.log('❌ 配置文件检查失败:', error.message);
}
console.log();

// 测试 2: 检查环境变量
console.log('🔑 测试 2: 检查环境变量...');
const apiKey = process.env.SUPERMEMORY_API_KEY;
if (apiKey) {
  console.log('✅ SUPERMEMORY_API_KEY 已设置');
  console.log(`   密钥长度: ${apiKey.length} 字符`);
  console.log(`   密钥格式: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`);
} else {
  console.log('⚠️  SUPERMEMORY_API_KEY 未设置');
  console.log('   提示: 请在 .env 文件中设置: SUPERMEMORY_API_KEY=sk_your_api_key_here');
}
console.log();

// 测试 3: 检查核心文件
console.log('📁 测试 3: 检查核心文件...');
const coreFiles = [
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

let missingFiles = 0;
for (const file of coreFiles) {
  const filePath = join(ROOT, file);
  if (existsSync(filePath)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file}`);
    missingFiles++;
  }
}
console.log();

// 测试 4: 检查 ModuleMixin 注册
console.log('🔧 测试 4: 检查 ModuleMixin 注册...');
try {
  const moduleMixinPath = join(ROOT, 'kernel', 'mixins', 'ModuleMixin.js');
  const content = readFileSync(moduleMixinPath, 'utf8');

  if (content.includes('SupermemoryMixin')) {
    console.log('✅ SupermemoryMixin 已在 ModuleMixin 中注册');
  } else {
    console.log('❌ SupermemoryMixin 未在 ModuleMixin 中注册');
  }
} catch (error) {
  console.log('❌ 无法检查 ModuleMixin:', error.message);
}
console.log();

// 总结
console.log('='.repeat(60));
console.log('📊 测试总结');
console.log('='.repeat(60));
console.log();

if (missingFiles === 0) {
  console.log('✅ 所有核心文件存在');
} else {
  console.log(`❌ 缺少 ${missingFiles} 个核心文件`);
}

if (apiKey) {
  console.log('✅ 环境变量已配置');
} else {
  console.log('⚠️  环境变量未配置');
}

console.log();
console.log('下一步：');
console.log('1. 确保 .env 文件中设置了 SUPERMEMORY_API_KEY');
console.log('2. 在 config/system.json 中设置 supermemory.enabled = true');
console.log('3. 启动 HundunOS: npm start');
console.log('4. 查看日志中的 Supermemory 初始化信息');
console.log();
