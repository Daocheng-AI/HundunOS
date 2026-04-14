/**
 * HundunOS v5 - 基础示例应用
 * 展示如何使用v5微内核架构
 */

import {
  createKernel,
  LoggerPlugin,
  SecurityPlugin,
  ConfigPlugin,
  EventsPlugin,
  CachePlugin,
  DatabasePlugin,
  ApiPlugin
} from '../../kernel/v5/index.js';

async function main() {
  console.log('🚀 Starting HundunOS v5 Basic Example...\n');

  // 1. 创建内核实例
  const kernel = createKernel({
    logger: {
      level: 'info'
    },
    api: {
      port: 3000,
      host: 'localhost'
    },
    database: {
      type: 'sqlite',
      path: './data/app.db'
    },
    cache: {
      defaultTtl: 3600
    }
  });

  // 2. 注册核心插件
  console.log('📦 Registering plugins...');
  await kernel.plugins.register(LoggerPlugin);
  await kernel.plugins.register(ConfigPlugin);
  await kernel.plugins.register(EventsPlugin);
  await kernel.plugins.register(SecurityPlugin);
  await kernel.plugins.register(CachePlugin);
  await kernel.plugins.register(DatabasePlugin);
  await kernel.plugins.register(ApiPlugin);

  // 3. 初始化内核
  console.log('🔧 Initializing kernel...');
  await kernel.initialize();
  console.log('✅ Kernel initialized\n');

  // 4. 使用安全服务
  const security = kernel.get('security.sanitize');
  const dirtyInput = '<script>alert("xss")</script>Hello World';
  const cleanInput = security.sanitize(dirtyInput, 'string');
  console.log('🔒 Security Example:');
  console.log('  Input:', dirtyInput);
  console.log('  Output:', cleanInput);
  console.log();

  // 5. 使用缓存服务
  const cache = kernel.get('cache');
  console.log('💾 Cache Example:');
  await cache.set('greeting', 'Hello from HundunOS v5!', 60);
  const cachedValue = await cache.get('greeting');
  console.log('  Cached:', cachedValue);
  console.log();

  // 6. 使用数据库服务
  const db = kernel.get('db');
  console.log('🗄️  Database Example:');
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE
    )
  `);
  
  await db.query(
    'INSERT OR IGNORE INTO users (name, email) VALUES (?, ?)',
    ['Admin', 'admin@hundunos.local']
  );
  
  const users = await db.query('SELECT * FROM users');
  console.log('  Users:', users);
  console.log();

  // 7. 设置API路由
  const api = kernel.get('api');
  console.log('🌐 API Example:');
  
  api.get('/health', async (ctx) => {
    return {
      status: 'healthy',
      version: '5.0.0',
      timestamp: new Date().toISOString()
    };
  });

  api.get('/users', async (ctx) => {
    const users = await db.query('SELECT * FROM users');
    return { users };
  });

  api.post('/users', async (ctx) => {
    const { name, email } = ctx.body;
    await db.query(
      'INSERT INTO users (name, email) VALUES (?, ?)',
      [name, email]
    );
    return { success: true };
  });

  // 8. 监听事件
  kernel.events.on('api:started', (data) => {
    console.log(`  API Server started on ${data.host}:${data.port}`);
  });

  // 9. 启动API服务
  await api.start();
  console.log();

  // 10. 测试API
  console.log('🧪 Testing API endpoints...');
  
  try {
    const healthRes = await fetch('http://localhost:3000/health');
    const health = await healthRes.json();
    console.log('  GET /health:', health);

    const usersRes = await fetch('http://localhost:3000/users');
    const usersData = await usersRes.json();
    console.log('  GET /users:', usersData);
  } catch (err) {
    console.log('  (API test skipped - fetch not available)');
  }

  console.log('\n✨ Example completed successfully!');
  console.log('Press Ctrl+C to stop the server');

  // 保持运行
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    await kernel.shutdown();
    console.log('👋 Goodbye!');
    process.exit(0);
  });
}

main().catch(console.error);
