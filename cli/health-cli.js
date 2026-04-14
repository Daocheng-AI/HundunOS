#!/usr/bin/env node
/**
 * HundunOS v4.3 - Health CLI 工具
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const STORAGE_DIR = process.env.HUNDUNOS_STORAGE || '.hundunos';
const ERRORS_DIR = join(process.cwd(), STORAGE_DIR, 'errors');

/**
 * 读取错误统计
 */
function getErrorStats() {
  const fs = require('fs');
  const files = [];

  try {
    const allFiles = fs.readdirSync(ERRORS_DIR);
    for (const f of allFiles) {
      if (f.startsWith('error_') && f.endsWith('.json')) {
        files.push(f);
      }
    }
  } catch (e) {
    return { total: 0, recent: [] };
  }

  const recent = files.slice(-10).map(f => {
    const filepath = join(ERRORS_DIR, f);
    try {
      return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    } catch (e) {
      return null;
    }
  }).filter(Boolean);

  return {
    total: files.length,
    recent,
  };
}

/**
 * 显示错误统计
 */
function showErrors() {
  const stats = getErrorStats();

  // console.log(`\nError Statistics:`);
  // console.log(`  Total errors: ${stats.total}`);
  // console.log(`  Recent errors: ${stats.recent.length}\n`);

  if (stats.recent.length > 0) {
    // console.log('Recent errors:');
    for (const error of stats.recent) {
      // console.log(`  [${new Date(error.timestamp).toISOString()}] ${error.message}`);
      // console.log(`    Module: ${error.context?.module || 'unknown'}`);
      // console.log();
    }
  }
}

/**
 * 清空错误日志
 */
function clearErrors() {
  const fs = require('fs');
  
  try {
    const files = fs.readdirSync(ERRORS_DIR);
    for (const f of files) {
      const filepath = join(ERRORS_DIR, f);
      fs.unlinkSync(filepath);
    }
    // console.log('Error logs cleared');
  } catch (e) {
    console.error('Failed to clear errors:', e.message);
  }
}

// CLI 入口
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'errors':
    showErrors();
    break;

  case 'clear-errors':
    clearErrors();
    break;

  default:
    // console.log(`
HundunOS v4.3 Health CLI

Usage:
  health-cli errors          Show error statistics
  health-cli clear-errors    Clear error logs

Examples:
  health-cli errors
  health-cli clear-errors
`);
    process.exit(1);
}
