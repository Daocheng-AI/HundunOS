/**
 * HundunOS v5 Integration Tests
 * 测试多个插件协同工作
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kernel } from '../core/Kernel.js';
import { LoggerPlugin } from '../plugins/core/LoggerPlugin.js';
import { SecurityPlugin } from '../plugins/core/SecurityPlugin.js';
import { ConfigPlugin } from '../plugins/core/ConfigPlugin.js';
import { EventsPlugin } from '../plugins/core/EventsPlugin.js';
import { CachePlugin } from '../plugins/features/CachePlugin.js';
import { DatabasePlugin } from '../plugins/features/DatabasePlugin.js';
import { TenantPlugin } from '../plugins/features/TenantPlugin.js';
import { BillingPlugin } from '../plugins/features/BillingPlugin.js';

describe('Integration: Security + Events', () => {
  let kernel;

  beforeEach(async () => {
    kernel = new Kernel();
    await kernel.plugins.register(LoggerPlugin);
    await kernel.plugins.register(ConfigPlugin);
    await kernel.plugins.register(EventsPlugin);
    await kernel.plugins.register(SecurityPlugin);
    await kernel.initialize();
  });

  afterEach(async () => {
    await kernel.shutdown();
  });

  it('should emit security events', async () => {
    const events = [];
    kernel.events.on('security:*', (data) => events.push(data));

    const rateLimit = kernel.get('security.rateLimit');
    rateLimit.check('test-key', { maxRequests: 1, windowMs: 60000 });
    rateLimit.check('test-key', { maxRequests: 1, windowMs: 60000 });

    // Should have rate limit exceeded event
    expect(events.length).toBeGreaterThan(0);
  });

  it('should sanitize input before processing events', async () => {
    const security = kernel.get('security.sanitize');
    const events = kernel.get('events');

    const maliciousInput = '<script>alert("xss")</script>Hello';
    const cleanInput = security.sanitize(maliciousInput, 'string');

    let receivedData = null;
    events.on('test:sanitize', (data) => {
      receivedData = data;
    });

    await events.emit('test:sanitize', { input: cleanInput });

    expect(receivedData.input).not.toContain('<script>');
  });
});

describe('Integration: Cache + Database', () => {
  let kernel;
  let cache;
  let db;

  beforeEach(async () => {
    kernel = new Kernel({
      database: { type: 'sqlite', path: ':memory:' }
    });
    await kernel.plugins.register(LoggerPlugin);
    await kernel.plugins.register(CachePlugin);
    await kernel.plugins.register(DatabasePlugin);
    await kernel.initialize();
    cache = kernel.get('cache');
    db = kernel.get('db');
  });

  afterEach(async () => {
    await kernel.shutdown();
  });

  it('should cache database queries', async () => {
    await db.query('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
    await db.query('INSERT INTO users (name) VALUES (?)', ['Alice']);

    // First query - hits database
    const queryDb = async () => db.query('SELECT * FROM users');
    const result1 = await cache.remember('users:all', 60, queryDb);
    expect(result1).toHaveLength(1);

    // Add another user
    await db.query('INSERT INTO users (name) VALUES (?)', ['Bob']);

    // Second query - should return cached result
    const result2 = await cache.remember('users:all', 60, queryDb);
    expect(result2).toHaveLength(1); // Still 1 from cache

    // Clear cache and query again
    await cache.delete('users:all');
    const result3 = await cache.remember('users:all', 60, queryDb);
    expect(result3).toHaveLength(2); // Now 2 from database
  });

  it('should invalidate cache on data change', async () => {
    await db.query('CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)');

    const getItems = async () => db.query('SELECT * FROM items');
    
    // Initial cache
    await cache.remember('items:all', 60, getItems);
    
    // Insert and invalidate
    await db.query('INSERT INTO items (value) VALUES (?)', ['item1']);
    await cache.delete('items:all');
    
    // Should get fresh data
    const items = await cache.remember('items:all', 60, getItems);
    expect(items).toHaveLength(1);
  });
});

describe('Integration: Tenant + Billing', () => {
  let kernel;
  let tenant;
  let billing;

  beforeEach(async () => {
    kernel = new Kernel({
      database: { type: 'sqlite', path: ':memory:' },
      tenant: { isolationMode: 'row' }
    });
    await kernel.plugins.register(LoggerPlugin);
    await kernel.plugins.register(ConfigPlugin);
    await kernel.plugins.register(CachePlugin);
    await kernel.plugins.register(DatabasePlugin);
    await kernel.plugins.register(TenantPlugin);
    await kernel.plugins.register(BillingPlugin);
    await kernel.initialize();
    tenant = kernel.get('tenant');
    billing = kernel.get('billing');
  });

  afterEach(async () => {
    await kernel.shutdown();
  });

  it('should track usage per tenant', async () => {
    // Create tenants
    const tenantA = await tenant.create({
      name: 'Tenant A',
      slug: 'tenant-a'
    });

    const tenantB = await tenant.create({
      name: 'Tenant B',
      slug: 'tenant-b'
    });

    // Record usage
    await billing.recordUsage(tenantA.id, 'api_request', 100);
    await billing.recordUsage(tenantA.id, 'api_request', 50);
    await billing.recordUsage(tenantB.id, 'api_request', 200);

    // Check usage
    const usageA = await billing.getUsage(tenantA.id);
    const usageB = await billing.getUsage(tenantB.id);

    const apiUsageA = usageA.find(u => u.resourceType === 'api_request');
    const apiUsageB = usageB.find(u => u.resourceType === 'api_request');

    expect(apiUsageA.quantity).toBe(150);
    expect(apiUsageB.quantity).toBe(200);
  });

  it('should enforce tenant quotas', async () => {
    const t = await tenant.create({
      name: 'Limited Tenant',
      slug: 'limited',
      quotas: {
        api_request: 100
      }
    });

    // Record usage up to quota
    await billing.recordUsage(t.id, 'api_request', 80);

    // Check quota
    const quota = await billing.checkQuota(t.id, 'api_request', 30);
    expect(quota.allowed).toBe(false);
    expect(quota.wouldExceed).toBe(true);

    const quota2 = await billing.checkQuota(t.id, 'api_request', 10);
    expect(quota2.allowed).toBe(true);
  });

  it('should generate tenant invoices', async () => {
    const t = await tenant.create({
      name: 'Invoiced Tenant',
      slug: 'invoiced'
    });

    // Record some usage
    await billing.recordUsage(t.id, 'chat', 5000);
    await billing.recordUsage(t.id, 'api_request', 1000);

    // Generate invoice
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const invoice = await billing.createInvoice(
      t.id,
      startOfMonth.toISOString(),
      now.toISOString()
    );

    expect(invoice.tenant_id).toBe(t.id);
    expect(parseFloat(invoice.amount)).toBeGreaterThan(0);
    expect(invoice.status).toBe('pending');
  });

  it('should emit tenant events', async () => {
    const events = [];
    kernel.events.on('tenant:created', (data) => events.push(data));

    await tenant.create({
      name: 'Event Test',
      slug: 'event-test'
    });

    expect(events.length).toBe(1);
    expect(events[0].tenant.name).toBe('Event Test');
  });
});

describe('Integration: Full System', () => {
  let kernel;

  beforeEach(async () => {
    kernel = new Kernel({
      database: { type: 'sqlite', path: ':memory:' },
      cache: { defaultTtl: 300 },
      tenant: { isolationMode: 'row' }
    });

    // Register all plugins
    await kernel.plugins.register(LoggerPlugin);
    await kernel.plugins.register(ConfigPlugin);
    await kernel.plugins.register(EventsPlugin);
    await kernel.plugins.register(SecurityPlugin);
    await kernel.plugins.register(CachePlugin);
    await kernel.plugins.register(DatabasePlugin);
    await kernel.plugins.register(TenantPlugin);
    await kernel.plugins.register(BillingPlugin);

    await kernel.initialize();
  });

  afterEach(async () => {
    await kernel.shutdown();
  });

  it('should handle complete workflow', async () => {
    const security = kernel.get('security.sanitize');
    const cache = kernel.get('cache');
    const db = kernel.get('db');
    const tenant = kernel.get('tenant');
    const billing = kernel.get('billing');
    const events = kernel.get('events');

    // Track events
    const eventLog = [];
    events.on('*', (data, eventName) => {
      eventLog.push(eventName);
    });

    // 1. Create tenant
    const t = await tenant.create({
      name: 'Test Corp',
      slug: 'test-corp',
      quotas: { api_request: 1000 }
    });

    // 2. Sanitize user input
    const userInput = '<script>alert("xss")</script>Hello';
    const cleanInput = security.sanitize(userInput, 'string');

    // 3. Store data with caching
    await db.query('CREATE TABLE data (id INTEGER PRIMARY KEY, content TEXT)');
    const fetchData = async () => {
      await billing.recordUsage(t.id, 'api_request', 1);
      return db.query('SELECT * FROM data');
    };

    await db.query('INSERT INTO data (content) VALUES (?)', [cleanInput]);
    const cachedData = await cache.remember(`data:${t.id}`, 60, fetchData);

    // 4. Check quota
    const quota = await billing.checkQuota(t.id, 'api_request', 500);

    // 5. Verify results
    expect(cachedData).toHaveLength(1);
    expect(cachedData[0].content).not.toContain('<script>');
    expect(quota.allowed).toBe(true);
    expect(eventLog).toContain('tenant:created');
    expect(eventLog).toContain('billing:usage');
  });

  it('should maintain data isolation between tenants', async () => {
    const tenant = kernel.get('tenant');
    const db = kernel.get('db');

    // Create two tenants
    const t1 = await tenant.create({ name: 'Tenant 1', slug: 't1' });
    const t2 = await tenant.create({ name: 'Tenant 2', slug: 't2' });

    // Create tables for each tenant context
    await db.query(`
      CREATE TABLE tenant_data (
        id INTEGER PRIMARY KEY,
        tenant_id TEXT,
        data TEXT
      )
    `);

    // Insert data for each tenant
    await db.query(
      'INSERT INTO tenant_data (tenant_id, data) VALUES (?, ?)',
      [t1.id, 'Data for tenant 1']
    );
    await db.query(
      'INSERT INTO tenant_data (tenant_id, data) VALUES (?, ?)',
      [t2.id, 'Data for tenant 2']
    );

    // Query with tenant context
    const data1 = await db.query(
      'SELECT * FROM tenant_data WHERE tenant_id = ?',
      [t1.id]
    );
    const data2 = await db.query(
      'SELECT * FROM tenant_data WHERE tenant_id = ?',
      [t2.id]
    );

    expect(data1).toHaveLength(1);
    expect(data1[0].data).toBe('Data for tenant 1');
    expect(data2).toHaveLength(1);
    expect(data2[0].data).toBe('Data for tenant 2');
  });
});
