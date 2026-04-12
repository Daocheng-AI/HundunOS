// hundunos/vitest.config.js
// Vitest 配置文件

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 测试环境
    environment: 'node',

    // 测试文件匹配模式
    include: [
      'tests/**/*.test.js',
      'kernel/**/*.test.js',
      'scripts/**/*.test.js'
    ],

    // 排除文件
    exclude: [
      'node_modules',
      'dist',
      '.tmp'
    ],

    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'kernel/**/*.js',
        'scripts/**/*.js'
      ],
      exclude: [
        'kernel/**/*.test.js',
        'scripts/**/*.test.js',
        'node_modules',
        'dist',
        '.tmp'
      ],
      // 覆盖率阈值
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60
      }
    },

    // 全局设置
    globals: true,

    // 测试超时时间（毫秒）
    testTimeout: 10000,

    // Hook 超时时间（毫秒）
    hookTimeout: 10000,

    // 并行执行
    threads: true,

    // 测试报告器
    reporter: ['verbose', 'json'],

    // 输出目录
    outputFile: {
      json: './test-results/results.json'
    }
  },

  // 解析配置
  resolve: {
    alias: {
      '@': new URL('./', import.meta.url).pathname
    }
  }
});
