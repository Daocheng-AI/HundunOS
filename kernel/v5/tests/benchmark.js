/**
 * HundunOS v5 - 性能基准测试框架
 * 提供核心功能的性能基准测试
 */

import { Kernel } from './core/Kernel.js';
import { LoggerPlugin } from './plugins/core/LoggerPlugin.js';
import { ConfigPlugin } from './plugins/core/ConfigPlugin.js';
import { EventsPlugin } from './plugins/core/EventsPlugin.js';
import { SecurityPlugin } from './plugins/core/SecurityPlugin.js';
import { CachePlugin } from './plugins/features/CachePlugin.js';
import { UtilsPlugin } from './plugins/utils/UtilsPlugin.js';
import { PerformanceMonitor } from './performance-monitor.js';

/**
 * 基准测试结果
 */
class BenchmarkResult {
  constructor(name) {
    this.name = name;
    this.iterations = 0;
    this.totalTime = 0;
    this.minTime = Infinity;
    this.maxTime = 0;
    this.times = [];
    this.throughput = 0;
    this.startTime = null;
    this.endTime = null;
  }

  addIteration(timeMs) {
    this.iterations++;
    this.totalTime += timeMs;
    this.minTime = Math.min(this.minTime, timeMs);
    this.maxTime = Math.max(this.maxTime, timeMs);
    this.times.push(timeMs);
  }

  calculate() {
    this.avgTime = this.totalTime / this.iterations;
    this.throughput = this.iterations / (this.totalTime / 1000); // ops/sec
    
    // 计算标准差
    const mean = this.avgTime;
    const variance = this.times.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / this.iterations;
    this.stdDev = Math.sqrt(variance);
    
    // 计算百分位数
    const sorted = [...this.times].sort((a, b) => a - b);
    this.p50 = sorted[Math.floor(sorted.length * 0.5)];
    this.p95 = sorted[Math.floor(sorted.length * 0.95)];
    this.p99 = sorted[Math.floor(sorted.length * 0.99)];
  }

  toJSON() {
    return {
      name: this.name,
      iterations: this.iterations,
      totalTime: Math.round(this.totalTime * 100) / 100,
      avgTime: Math.round(this.avgTime * 100) / 100,
      minTime: Math.round(this.minTime * 100) / 100,
      maxTime: Math.round(this.maxTime * 100) / 100,
      stdDev: Math.round(this.stdDev * 100) / 100,
      p50: Math.round(this.p50 * 100) / 100,
      p95: Math.round(this.p95 * 100) / 100,
      p99: Math.round(this.p99 * 100) / 100,
      throughput: Math.round(this.throughput * 100) / 100,
    };
  }
}

/**
 * 基准测试运行器
 */
export class BenchmarkRunner {
  constructor(options = {}) {
    this.options = {
      iterations: options.iterations || 100,
      warmup: options.warmup || 10,
      timeout: options.timeout || 300000, // 5 分钟
      ...options,
    };
    this.results = [];
    this.kernel = null;
  }

  /**
   * 初始化 Kernel
   */
  async setup() {
    console.log('\n🔧 初始化 Kernel...');
    this.kernel = new Kernel();
    
    await this.kernel.plugins.register(LoggerPlugin);
    await this.kernel.plugins.register(ConfigPlugin);
    await this.kernel.plugins.register(EventsPlugin);
    await this.kernel.plugins.register(SecurityPlugin);
    await this.kernel.plugins.register(CachePlugin);
    await this.kernel.plugins.register(UtilsPlugin);
    
    await this.kernel.initialize();
    console.log('✅ Kernel 初始化完成\n');
  }

  /**
   * 关闭 Kernel
   */
  async teardown() {
    if (this.kernel) {
      await this.kernel.shutdown();
      console.log('\n🔴 Kernel 已关闭');
    }
  }

  /**
   * 运行单个基准测试
   * @param {string} name - 测试名称
   * @param {Function} fn - 测试函数
   * @param {Object} options - 配置选项
   * @returns {BenchmarkResult} 测试结果
   */
  async runBenchmark(name, fn, options = {}) {
    const {
      iterations = this.options.iterations,
      warmup = this.options.warmup,
    } = options;

    console.log(`\n📊 运行基准测试：${name}`);
    console.log(`   迭代次数：${iterations}, 预热：${warmup}`);

    const result = new BenchmarkResult(name);

    // 预热
    if (warmup > 0) {
      console.log(`   预热中...`);
      for (let i = 0; i < warmup; i++) {
        await fn(this.kernel, i);
      }
    }

    // 正式测试
    console.log(`   执行测试...`);
    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      
      await fn(this.kernel, i);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      result.addIteration(duration);
      
      // 进度显示
      if ((i + 1) % 10 === 0 || i === iterations - 1) {
        process.stdout.write(`\r   进度：${i + 1}/${iterations} (${Math.round((i + 1) / iterations * 100)}%)`);
      }
    }

    result.calculate();
    this.results.push(result);

    // 打印结果
    console.log(`\n   ✅ 完成`);
    console.log(`   平均耗时：${result.avgTime.toFixed(2)}ms`);
    console.log(`   吞吐量：${result.throughput.toFixed(2)} ops/sec`);
    console.log(`   P95: ${result.p95.toFixed(2)}ms, P99: ${result.p99.toFixed(2)}ms`);

    return result;
  }

  /**
   * 运行所有基准测试
   */
  async runAll() {
    const summary = {
      startTime: new Date().toISOString(),
      tests: [],
      totalDuration: 0,
    };

    const startTime = performance.now();

    try {
      await this.setup();

      // 运行各项测试
      summary.tests.push(await this.runBenchmark('密码哈希 (PBKDF2)', this.benchmarkPasswordHashing));
      summary.tests.push(await this.runBenchmark('缓存操作', this.benchmarkCacheOperations));
      summary.tests.push(await this.runBenchmark('事件发射', this.benchmarkEventEmission));
      summary.tests.push(await this.runBenchmark('工具函数', this.benchmarkUtilsFunctions));
      summary.tests.push(await this.runBenchmark('安全策略检查', this.benchmarkSecurityChecks));

    } finally {
      await this.teardown();
    }

    const endTime = performance.now();
    summary.totalDuration = endTime - startTime;
    summary.endTime = new Date().toISOString();

    this.printSummary(summary);
    return summary;
  }

  // ──────────────────────────────────────────────
  // 基准测试用例
  // ──────────────────────────────────────────────

  async benchmarkPasswordHashing(kernel) {
    const security = kernel.plugins.get('security');
    const password = 'TestPassword123!@#';
    await security.hashPassword(password);
  }

  async benchmarkCacheOperations(kernel) {
    const cache = kernel.plugins.get('cache');
    const key = `bench:${Date.now()}`;
    await cache.set(key, { data: 'test' }, 60);
    await cache.get(key);
    await cache.del(key);
  }

  async benchmarkEventEmission(kernel) {
    const events = kernel.plugins.get('events');
    events.emit('benchmark:event', { timestamp: Date.now() });
  }

  async benchmarkUtilsFunctions(kernel) {
    const utils = kernel.plugins.get('utils');
    const data = { a: 1, b: { c: 2 }, d: [3, 4, 5] };
    const override = { b: { c: 3 }, e: 6 };
    utils.deepMerge(data, override);
  }

  async benchmarkSecurityChecks(kernel) {
    const security = kernel.plugins.get('security');
    const acm = security.accessControl;
    acm.check('tool', 'read', ['user']);
  }

  // ──────────────────────────────────────────────
  // 结果输出
  // ──────────────────────────────────────────────

  printSummary(summary) {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║          HundunOS v5 性能基准测试总结                  ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log(`\n测试时间：${summary.startTime}`);
    console.log(`总耗时：${(summary.totalDuration / 1000).toFixed(2)} 秒`);
    console.log(`\n详细结果:\n`);

    console.log('┌─────────────────────────────┬──────────┬──────────┬──────────┬──────────┐');
    console.log('│ 测试名称                    │ 迭代次数 │ 平均 (ms) │ P95 (ms) │ 吞吐量   │');
    console.log('├─────────────────────────────┼──────────┼──────────┼──────────┼──────────┤');

    for (const test of summary.tests) {
      const name = test.name.padEnd(27);
      const iterations = String(test.iterations).padStart(8);
      const avg = test.avgTime.toFixed(2).padStart(8);
      const p95 = test.p95.toFixed(2).padStart(8);
      const throughput = test.throughput.toFixed(2).padStart(8);
      console.log(`│ ${name} │ ${iterations} │ ${avg} │ ${p95} │ ${throughput} │`);
    }

    console.log('└─────────────────────────────┴──────────┴──────────┴──────────┴──────────┘');
    console.log('\n✅ 基准测试完成');
  }
}

/**
 * 运行基准测试
 */
async function main() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║       HundunOS v5 - 性能基准测试框架                   ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  const runner = new BenchmarkRunner({
    iterations: 100,
    warmup: 10,
  });

  try {
    const summary = await runner.runAll();
    
    // 保存结果到文件
    const fs = await import('fs');
    const path = await import('path');
    const resultsPath = path.join(process.cwd(), 'test-results', 'benchmark-results.json');
    
    fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
    fs.writeFileSync(resultsPath, JSON.stringify(summary, null, 2));
    
    console.log(`\n📁 结果已保存到：${resultsPath}`);
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ 基准测试失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default BenchmarkRunner;
