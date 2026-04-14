/**
 * HundunOS v5 Performance Benchmarks
 * 对比v4和v5架构的性能差异
 */

import { performance } from 'perf_hooks';
import { Kernel } from '../core/Kernel.js';
import { LoggerPlugin } from '../plugins/core/LoggerPlugin.js';
import { SecurityPlugin } from '../plugins/core/SecurityPlugin.js';
import { CachePlugin } from '../plugins/features/CachePlugin.js';

class Benchmark {
  results = [];

  async run(name, fn, iterations = 1000) {
    // Warmup
    for (let i = 0; i < 100; i++) {
      await fn();
    }

    const times = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn();
      const end = performance.now();
      times.push(end - start);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];
    const p99 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.99)];

    const result = {
      name,
      iterations,
      avg: avg.toFixed(3),
      min: min.toFixed(3),
      max: max.toFixed(3),
      p95: p95.toFixed(3),
      p99: p99.toFixed(3),
      opsPerSecond: (1000 / avg).toFixed(0)
    };

    this.results.push(result);
    return result;
  }

  printResults() {
    console.log('\n=== Benchmark Results ===\n');
    console.log('Test Name | Iterations | Avg (ms) | Min (ms) | Max (ms) | P95 (ms) | P99 (ms) | Ops/sec');
    console.log('-'.repeat(100));
    
    for (const r of this.results) {
      console.log(
        `${r.name.padEnd(20)} | ${r.iterations.toString().padEnd(10)} | ` +
        `${r.avg.padEnd(8)} | ${r.min.padEnd(8)} | ${r.max.padEnd(8)} | ` +
        `${r.p95.padEnd(8)} | ${r.p99.padEnd(8)} | ${r.opsPerSecond}`
      );
    }
  }
}

async function runBenchmarks() {
  const benchmark = new Benchmark();
  const kernel = new Kernel();
  
  await kernel.plugins.register(LoggerPlugin);
  await kernel.plugins.register(SecurityPlugin);
  await kernel.plugins.register(CachePlugin);
  await kernel.initialize();

  console.log('Starting HundunOS v5 Performance Benchmarks...\n');

  // 1. Service Registry Performance
  console.log('Testing Service Registry...');
  
  kernel.services.register('bench.service', () => ({ data: 'test' }), { singleton: true });
  
  await benchmark.run('Service Get (singleton)', async () => {
    await kernel.get('bench.service');
  }, 10000);

  // 2. Event Bus Performance
  console.log('Testing Event Bus...');
  
  let eventCount = 0;
  kernel.events.on('bench:event', () => { eventCount++; });
  
  await benchmark.run('Event Emit', async () => {
    await kernel.events.emit('bench:event', { data: 1 });
  }, 10000);

  // 3. Cache Performance
  console.log('Testing Cache...');
  
  const cache = kernel.get('cache');
  
  await benchmark.run('Cache Set', async () => {
    await cache.set(`key-${Math.random()}`, 'value');
  }, 5000);

  await cache.set('bench-key', 'bench-value');
  
  await benchmark.run('Cache Get', async () => {
    await cache.get('bench-key');
  }, 10000);

  // 4. Security Sanitization
  console.log('Testing Security...');
  
  const security = kernel.get('security.sanitize');
  const testInput = '<script>alert("xss")</script>';
  
  await benchmark.run('String Sanitize', async () => {
    security.sanitize(testInput, 'string');
  }, 10000);

  // 5. Config Access
  console.log('Testing Config...');
  
  kernel.config.set('bench.key', 'value');
  
  await benchmark.run('Config Get', async () => {
    kernel.config.get('bench.key');
  }, 10000);

  // 6. Plugin Load Time
  console.log('Testing Plugin System...');
  
  const { BasePlugin } = await import('../core/BasePlugin.js');
  
  class BenchPlugin extends BasePlugin {
    get name() { return `bench-${Math.random()}`; }
    async onInit() {}
  }
  
  await benchmark.run('Plugin Register', async () => {
    const testKernel = new Kernel();
    await testKernel.plugins.register(BenchPlugin);
  }, 100);

  // Print results
  benchmark.printResults();

  // Memory usage
  const memUsage = process.memoryUsage();
  console.log('\n=== Memory Usage ===');
  console.log(`RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Heap Total: ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`External: ${(memUsage.external / 1024 / 1024).toFixed(2)} MB`);

  await kernel.shutdown();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runBenchmarks().catch(console.error);
}

export { runBenchmarks, Benchmark };
