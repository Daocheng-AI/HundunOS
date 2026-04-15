#!/usr/bin/env node
/**
 * HundunOS v5 - GitHub 推送前安全验证脚本
 * 检查是否有敏感信息会被提交到 GitHub
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(command) {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
  } catch (error) {
    return '';
  }
}

function checkGitignore() {
  log('\n🔍 检查 .gitignore 配置...', 'cyan');
  
  try {
    const gitignore = readFileSync('.gitignore', 'utf-8');
    const requiredPatterns = [
      '.env',
      '.env.local',
      'node_modules/',
      '*.pem',
      '*.key',
      'secrets/',
      'credentials/',
      'data/',
      'logs/',
    ];
    
    let allGood = true;
    for (const pattern of requiredPatterns) {
      if (gitignore.includes(pattern)) {
        log(`  ✅ ${pattern} 已忽略`, 'green');
      } else {
        log(`  ❌ ${pattern} 未忽略`, 'red');
        allGood = false;
      }
    }
    
    return allGood;
  } catch (error) {
    log('  ❌ 无法读取 .gitignore', 'red');
    return false;
  }
}

function checkEnvFiles() {
  log('\n🔍 检查 .env 文件...', 'cyan');
  
  const envFiles = ['.env', '.env.local', '.env.production'];
  let found = false;
  
  for (const file of envFiles) {
    try {
      readFileSync(file, 'utf-8');
      log(`  ⚠️  发现 ${file}，请确保已添加到 .gitignore`, 'yellow');
      found = true;
    } catch (error) {
      // 文件不存在，正常
    }
  }
  
  if (!found) {
    log('  ✅ 未发现 .env 文件', 'green');
    return true;
  }
  
  return true; // 即使存在，只要在 gitignore 中也可以
}

function checkStagedFiles() {
  log('\n🔍 检查暂存的文件...', 'cyan');
  
  const stagedFiles = runCommand('git diff --cached --name-only');
  
  if (!stagedFiles.trim()) {
    log('  ✅ 没有暂存的文件', 'green');
    return true;
  }
  
  const files = stagedFiles.split('\n').filter(f => f.trim());
  const sensitivePatterns = [
    { pattern: /\.env$/, name: '.env 文件' },
    { pattern: /\.pem$/, name: '.pem 证书' },
    { pattern: /\.key$/, name: '.key 密钥' },
    { pattern: /^secrets\//, name: 'secrets/ 目录' },
    { pattern: /^credentials\//, name: 'credentials/ 目录' },
    { pattern: /^node_modules\//, name: 'node_modules/' },
  ];
  
  let hasSensitive = false;
  
  for (const file of files) {
    for (const { pattern, name } of sensitivePatterns) {
      if (pattern.test(file)) {
        log(`  ❌ 发现敏感文件：${file} (${name})`, 'red');
        hasSensitive = true;
      }
    }
  }
  
  if (!hasSensitive) {
    log(`  ✅ 暂存的 ${files.length} 个文件都是安全的`, 'green');
  }
  
  return !hasSensitive;
}

function checkGitTrackedFiles() {
  log('\n🔍 检查 Git 追踪的文件...', 'cyan');
  
  const trackedFiles = runCommand('git ls-files');
  const files = trackedFiles.split('\n').filter(f => f.trim());
  
  const sensitivePatterns = [
    { pattern: /^\.env$/, name: '.env 文件' },
    { pattern: /^\.env\.local$/, name: '.env.local 文件' },
    { pattern: /^node_modules\//, name: 'node_modules/' },
    { pattern: /\.pem$/, name: '.pem 文件' },
    { pattern: /\.key$/, name: '.key 文件' },
  ];
  
  let found = false;
  
  for (const file of files) {
    for (const { pattern, name } of sensitivePatterns) {
      if (pattern.test(file)) {
        log(`  ❌ Git 追踪中发现敏感文件：${file} (${name})`, 'red');
        found = true;
      }
    }
  }
  
  if (!found) {
    log('  ✅ Git 追踪中无敏感文件', 'green');
  }
  
  return !found;
}

function checkHardcodedSecrets() {
  log('\n🔍 检查硬编码密钥...', 'cyan');
  
  const patterns = [
    { regex: /api[_-]?key\s*[=:]\s*['"][^'\"]{20,}['\"]/i, name: 'API 密钥' },
    { regex: /password\s*[=:]\s*['"][^'\"]{8,}['\"]/i, name: '密码' },
    { regex: /secret\s*[=:]\s*['"][^'\"]{16,}['\"]/i, name: '密钥' },
    { regex: /token\s*[=:]\s*['"][^'\"]{20,}['\"]/i, name: 'Token' },
  ];
  
  // 只检查代码文件，排除测试文件
  const codeFiles = runCommand('git ls-files "*.js" "*.ts" "*.json" "*.yaml" "*.yml"');
  const files = codeFiles.split('\n')
    .filter(f => f.trim() && !f.includes('.test.') && !f.includes('test/'));
  
  let found = false;
  
  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8');
      
      for (const { regex, name } of patterns) {
        const matches = content.match(regex);
        if (matches) {
          log(`  ⚠️  ${file}: 可能包含${name}`, 'yellow');
          found = true;
        }
      }
    } catch (error) {
      // 跳过无法读取的文件
    }
  }
  
  if (!found) {
    log('  ✅ 未发现明显的硬编码密钥', 'green');
  }
  
  return !found;
}

function main() {
  log('\n╔════════════════════════════════════════════════════════╗', 'cyan');
  log('║    HundunOS v5 - GitHub 推送前安全验证                  ║', 'cyan');
  log('╚════════════════════════════════════════════════════════╝', 'cyan');
  
  const results = {
    gitignore: checkGitignore(),
    envFiles: checkEnvFiles(),
    stagedFiles: checkStagedFiles(),
    trackedFiles: checkGitTrackedFiles(),
    hardcodedSecrets: checkHardcodedSecrets(),
  };
  
  log('\n╔════════════════════════════════════════════════════════╗', 'cyan');
  log('║                  验证结果总结                          ║', 'cyan');
  log('╚════════════════════════════════════════════════════════╝', 'cyan');
  
  const passed = Object.values(results).every(r => r);
  
  if (passed) {
    log('\n✅ 所有安全检查通过！可以安全推送。\n', 'green');
    process.exit(0);
  } else {
    log('\n❌ 发现安全问题，请检查上述报告后再推送！\n', 'red');
    log('提示：', 'yellow');
    log('  1. 确保 .env 文件已添加到 .gitignore', 'yellow');
    log('  2. 从 Git 缓存中删除敏感文件：git rm --cached <file>', 'yellow');
    log('  3. 运行本脚本再次验证', 'yellow');
    log('\n');
    process.exit(1);
  }
}

main();
