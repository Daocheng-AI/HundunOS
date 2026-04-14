/**
 * HundunOS v5 - 多租户示例
 * 展示Tenant和Billing插件的使用
 */

import {
  createKernel,
  LoggerPlugin,
  SecurityPlugin,
  ConfigPlugin,
  EventsPlugin,
  CachePlugin,
  DatabasePlugin,
  ApiPlugin,
  ModelRouterPlugin,
  TenantPlugin,
  BillingPlugin
} from '../../kernel/v5/index.js';

async function main() {
  console.log('🏢 Starting HundunOS v5 Multi-Tenant Example...\n');

  // 1. 创建内核
  const kernel = createKernel({
    logger: { level: 'info' },
    api: { port: 3002 },
    database: { type: 'sqlite', path: './data/tenant.db' },
    tenant: {
      isolationMode: 'row' // 'row', 'schema', or 'database'
    },
    models: {
      defaultProvider: 'openai',
      providers: {
        openai: { apiKey: process.env.OPENAI_API_KEY || 'test' }
      }
    }
  });

  // 2. 注册插件
  console.log('📦 Registering plugins...');
  await kernel.plugins.register(LoggerPlugin);
  await kernel.plugins.register(ConfigPlugin);
  await kernel.plugins.register(EventsPlugin);
  await kernel.plugins.register(SecurityPlugin);
  await kernel.plugins.register(CachePlugin);
  await kernel.plugins.register(DatabasePlugin);
  await kernel.plugins.register(ApiPlugin);
  await kernel.plugins.register(ModelRouterPlugin);
  await kernel.plugins.register(TenantPlugin);
  await kernel.plugins.register(BillingPlugin);

  await kernel.initialize();
  console.log('✅ Kernel initialized\n');

  // 3. 获取服务
  const tenant = kernel.get('tenant');
  const billing = kernel.get('billing');
  const api = kernel.get('api');

  // 4. 创建租户
  console.log('🏢 Creating Tenants...');
  
  const tenantA = await tenant.create({
    name: 'Acme Corporation',
    slug: 'acme',
    config: {
      theme: 'light',
      features: ['ai', 'analytics']
    },
    quotas: {
      maxUsers: 100,
      maxRequestsPerDay: 10000,
      maxStorage: 1073741824 // 1GB
    }
  });
  console.log('  Created:', tenantA.name, `(${tenantA.id})`);

  const tenantB = await tenant.create({
    name: 'TechStart Inc',
    slug: 'techstart',
    config: {
      theme: 'dark',
      features: ['ai']
    },
    quotas: {
      maxUsers: 10,
      maxRequestsPerDay: 1000,
      maxStorage: 104857600 // 100MB
    }
  });
  console.log('  Created:', tenantB.name, `(${tenantB.id})`);
  console.log();

  // 5. 列出所有租户
  console.log('📋 All Tenants:');
  const allTenants = await tenant.list();
  allTenants.forEach(t => {
    console.log(`  - ${t.name} (${t.slug}): ${t.status}`);
  });
  console.log();

  // 6. 设置计费定价
  console.log('💰 Setting up Billing...');
  billing.setPricing('chat', {
    unitPrice: 0.002,
    unit: '1k_tokens',
    currency: 'USD'
  });
  billing.setPricing('api_request', {
    unitPrice: 0.0001,
    unit: 'request',
    currency: 'USD'
  });
  console.log('✅ Pricing configured\n');

  // 7. 记录使用量和计费
  console.log('📊 Recording Usage...');
  
  // Acme Corp 的使用
  await billing.recordUsage(tenantA.id, 'chat', 5000, {
    resourceId: 'chat-1',
    metadata: { model: 'gpt-3.5-turbo' }
  });
  await billing.recordUsage(tenantA.id, 'api_request', 100, {
    metadata: { endpoint: '/api/chat' }
  });

  // TechStart 的使用
  await billing.recordUsage(tenantB.id, 'chat', 1000, {
    resourceId: 'chat-1',
    metadata: { model: 'gpt-3.5-turbo' }
  });
  await billing.recordUsage(tenantB.id, 'api_request', 50);

  console.log('✅ Usage recorded\n');

  // 8. 查看使用情况
  console.log('📈 Usage Report:');
  
  const usageA = await billing.getUsage(tenantA.id);
  console.log(`  ${tenantA.name}:`);
  usageA.forEach(u => {
    console.log(`    ${u.resourceType}: ${u.quantity} units = $${u.cost.toFixed(4)}`);
  });

  const usageB = await billing.getUsage(tenantB.id);
  console.log(`  ${tenantB.name}:`);
  usageB.forEach(u => {
    console.log(`    ${u.resourceType}: ${u.quantity} units = $${u.cost.toFixed(4)}`);
  });
  console.log();

  // 9. 成本估算
  console.log('💵 Cost Estimation:');
  const estimate = billing.estimateCost('chat', 10000);
  console.log(`  10K tokens would cost: $${estimate.estimatedCost.toFixed(4)}`);
  console.log();

  // 10. 配额检查
  console.log('✅ Quota Check:');
  const quotaA = await billing.checkQuota(tenantA.id, 'api_request', 500);
  console.log(`  ${tenantA.name}: ${quotaA.allowed ? 'OK' : 'EXCEEDED'} (${quotaA.current}/${quotaA.limit})`);
  
  const quotaB = await billing.checkQuota(tenantB.id, 'api_request', 500);
  console.log(`  ${tenantB.name}: ${quotaB.allowed ? 'OK' : 'EXCEEDED'} (${quotaB.current}/${quotaB.limit})`);
  console.log();

  // 11. 创建发票
  console.log('🧾 Creating Invoices...');
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const invoiceA = await billing.createInvoice(
    tenantA.id,
    startOfMonth.toISOString(),
    now.toISOString()
  );
  console.log(`  ${tenantA.name}: Invoice #${invoiceA.id} - $${invoiceA.amount}`);

  const invoiceB = await billing.createInvoice(
    tenantB.id,
    startOfMonth.toISOString(),
    now.toISOString()
  );
  console.log(`  ${tenantB.name}: Invoice #${invoiceB.id} - $${invoiceB.amount}`);
  console.log();

  // 12. 设置API端点
  api.get('/tenants', async (ctx) => {
    const tenants = await tenant.list();
    return { tenants };
  });

  api.get('/tenants/:id/usage', async (ctx) => {
    const usage = await billing.getUsage(ctx.params.id);
    return { usage };
  });

  api.get('/tenants/:id/invoice', async (ctx) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const invoice = await billing.createInvoice(
      ctx.params.id,
      startOfMonth.toISOString(),
      now.toISOString()
    );
    return { invoice };
  });

  // 13. 启动API
  await api.start();
  console.log('🌐 API endpoints:');
  console.log('  GET /tenants');
  console.log('  GET /tenants/:id/usage');
  console.log('  GET /tenants/:id/invoice');
  console.log();

  // 14. 监听租户事件
  kernel.events.on('tenant:created', (data) => {
    console.log('📢 Event: New tenant created -', data.tenant.name);
  });

  console.log('✨ Multi-tenant example completed!');
  console.log('Press Ctrl+C to stop');

  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    await kernel.shutdown();
    console.log('👋 Goodbye!');
    process.exit(0);
  });
}

main().catch(console.error);
