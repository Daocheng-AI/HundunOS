import { BasePlugin } from '../../core/BasePlugin.js';
import { randomUUID } from 'crypto';

export class BillingPlugin extends BasePlugin {
  #pricing = new Map();
  #invoices = new Map();
  #config = null;
  #db = null;
  #cache = null;
  #tenant = null;

  get name() {
    return 'billing';
  }

  get version() {
    return '2.0.0';
  }

  get dependencies() {
    return ['logger', 'config', 'db', 'cache', 'tenant'];
  }

  async onInit() {
    this.#config = this.kernel.get('config');
    this.#db = this.kernel.get('db');
    this.#cache = this.kernel.get('cache');
    this.#tenant = this.kernel.get('tenant');

    await this.#initializeBillingSchema();
    this.#setupDefaultPricing();

    this.kernel.services.register('billing', () => ({
      recordUsage: this.recordUsage.bind(this),
      getUsage: this.getUsage.bind(this),
      getInvoice: this.getInvoice.bind(this),
      createInvoice: this.createInvoice.bind(this),
      setPricing: this.setPricing.bind(this),
      getPricing: this.getPricing.bind(this),
      estimateCost: this.estimateCost.bind(this),
      checkQuota: this.checkQuota.bind(this)
    }), { singleton: true });

    this.logger.info('Billing Plugin initialized');
  }

  async #initializeBillingSchema() {
    await this.#db.query(`
      CREATE TABLE IF NOT EXISTS billing_usage (
        id VARCHAR(255) PRIMARY KEY,
        tenant_id VARCHAR(255) NOT NULL,
        resource_type VARCHAR(100) NOT NULL,
        resource_id VARCHAR(255),
        quantity DECIMAL(15, 6) NOT NULL,
        unit VARCHAR(50) NOT NULL,
        cost DECIMAL(15, 6),
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_billing_usage_tenant 
        ON billing_usage(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_billing_usage_resource 
        ON billing_usage(resource_type, created_at);
      CREATE INDEX IF NOT EXISTS idx_billing_usage_created 
        ON billing_usage(created_at);
    `);

    await this.#db.query(`
      CREATE TABLE IF NOT EXISTS billing_invoices (
        id VARCHAR(255) PRIMARY KEY,
        tenant_id VARCHAR(255) NOT NULL,
        period_start TIMESTAMP NOT NULL,
        period_end TIMESTAMP NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        status VARCHAR(50) DEFAULT 'pending',
        items JSON,
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_billing_invoices_tenant 
        ON billing_invoices(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_billing_invoices_period 
        ON billing_invoices(period_start, period_end);
    `);

    await this.#db.query(`
      CREATE TABLE IF NOT EXISTS billing_pricing (
        id VARCHAR(255) PRIMARY KEY,
        resource_type VARCHAR(100) NOT NULL,
        tier VARCHAR(50) DEFAULT 'default',
        unit_price DECIMAL(15, 6) NOT NULL,
        unit VARCHAR(50) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        valid_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        valid_until TIMESTAMP,
        UNIQUE(resource_type, tier, valid_from)
      );
    `);
  }

  #setupDefaultPricing() {
    const defaultPricing = [
      { resourceType: 'chat', tier: 'default', unitPrice: 0.002, unit: '1k_tokens', currency: 'USD' },
      { resourceType: 'embedding', tier: 'default', unitPrice: 0.0001, unit: '1k_tokens', currency: 'USD' },
      { resourceType: 'storage', tier: 'default', unitPrice: 0.02, unit: 'gb_month', currency: 'USD' },
      { resourceType: 'api_request', tier: 'default', unitPrice: 0.0001, unit: 'request', currency: 'USD' }
    ];

    for (const pricing of defaultPricing) {
      this.#pricing.set(pricing.resourceType, pricing);
    }
  }

  async recordUsage(tenantId, resourceType, quantity, options = {}) {
    const pricing = this.#pricing.get(resourceType);
    const cost = pricing ? (quantity * pricing.unitPrice) / this.#getUnitMultiplier(pricing.unit) : 0;

    const usage = {
      id: randomUUID(),
      tenant_id: tenantId,
      resource_type: resourceType,
      resource_id: options.resourceId || null,
      quantity,
      unit: pricing?.unit || 'unit',
      cost: cost.toFixed(6),
      metadata: JSON.stringify(options.metadata || {}),
      created_at: new Date().toISOString()
    };

    await this.#db.query(
      `INSERT INTO billing_usage (id, tenant_id, resource_type, resource_id, quantity, unit, cost, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [usage.id, usage.tenant_id, usage.resource_type, usage.resource_id, 
       usage.quantity, usage.unit, usage.cost, usage.metadata, usage.created_at]
    );

    // 更新缓存
    const cacheKey = `billing:usage:${tenantId}:${resourceType}:${this.#getCurrentPeriod()}`;
    const current = await this.#cache.get(cacheKey) || { quantity: 0, cost: 0 };
    current.quantity += quantity;
    current.cost += cost;
    await this.#cache.set(cacheKey, current, 3600);

    this.kernel.events.emit('billing:usage', { usage });
    this.logger.debug(`Recorded usage: ${tenantId} - ${resourceType} - ${quantity}`);

    return usage;
  }

  async getUsage(tenantId, options = {}) {
    const startDate = options.startDate || this.#getPeriodStart();
    const endDate = options.endDate || new Date().toISOString();
    const resourceType = options.resourceType;

    let query = `
      SELECT resource_type, SUM(quantity) as total_quantity, SUM(cost) as total_cost
      FROM billing_usage
      WHERE tenant_id = ? AND created_at BETWEEN ? AND ?
    `;
    const params = [tenantId, startDate, endDate];

    if (resourceType) {
      query += ' AND resource_type = ?';
      params.push(resourceType);
    }

    query += ' GROUP BY resource_type';

    const results = await this.#db.query(query, params);
    
    return results.map(r => ({
      resourceType: r.resource_type,
      quantity: parseFloat(r.total_quantity),
      cost: parseFloat(r.total_cost)
    }));
  }

  async createInvoice(tenantId, periodStart, periodEnd) {
    const usage = await this.getUsage(tenantId, {
      startDate: periodStart,
      endDate: periodEnd
    });

    const totalAmount = usage.reduce((sum, u) => sum + u.cost, 0);

    const invoice = {
      id: randomUUID(),
      tenant_id: tenantId,
      period_start: periodStart,
      period_end: periodEnd,
      amount: totalAmount.toFixed(2),
      currency: 'USD',
      status: 'pending',
      items: JSON.stringify(usage),
      created_at: new Date().toISOString()
    };

    await this.#db.query(
      `INSERT INTO billing_invoices (id, tenant_id, period_start, period_end, amount, currency, status, items, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoice.id, invoice.tenant_id, invoice.period_start, invoice.period_end,
       invoice.amount, invoice.currency, invoice.status, invoice.items, invoice.created_at]
    );

    this.#invoices.set(invoice.id, invoice);
    this.kernel.events.emit('billing:invoice:created', { invoice });
    this.logger.info(`Invoice created: ${invoice.id} for tenant ${tenantId}`);

    return invoice;
  }

  async getInvoice(invoiceId) {
    let invoice = this.#invoices.get(invoiceId);
    if (invoice) return invoice;

    const results = await this.#db.query(
      'SELECT * FROM billing_invoices WHERE id = ?',
      [invoiceId]
    );

    if (results.length === 0) return null;

    invoice = {
      ...results[0],
      items: JSON.parse(results[0].items || '[]')
    };

    this.#invoices.set(invoiceId, invoice);
    return invoice;
  }

  setPricing(resourceType, pricing) {
    this.#pricing.set(resourceType, {
      resourceType,
      ...pricing
    });
    this.logger.debug(`Updated pricing for ${resourceType}`);
  }

  getPricing(resourceType) {
    return this.#pricing.get(resourceType);
  }

  estimateCost(resourceType, quantity) {
    const pricing = this.#pricing.get(resourceType);
    if (!pricing) return null;

    const cost = (quantity * pricing.unitPrice) / this.#getUnitMultiplier(pricing.unit);
    
    return {
      resourceType,
      quantity,
      unitPrice: pricing.unitPrice,
      unit: pricing.unit,
      estimatedCost: cost,
      currency: pricing.currency
    };
  }

  async checkQuota(tenantId, resourceType, additionalUsage = 0) {
    const tenant = await this.#tenant.get(tenantId);
    if (!tenant) throw new Error(`Tenant not found: ${tenantId}`);

    const quota = tenant.quotas?.[resourceType];
    if (!quota) return { allowed: true, unlimited: true };

    const currentUsage = await this.getUsage(tenantId, {
      resourceType,
      startDate: this.#getPeriodStart()
    });

    const totalUsed = currentUsage.reduce((sum, u) => sum + u.quantity, 0);
    const wouldExceed = totalUsed + additionalUsage > quota;

    return {
      allowed: !wouldExceed,
      current: totalUsed,
      limit: quota,
      remaining: Math.max(0, quota - totalUsed),
      wouldExceed
    };
  }

  #getUnitMultiplier(unit) {
    const multipliers = {
      'unit': 1,
      'request': 1,
      '1k_tokens': 1000,
      '1m_tokens': 1000000,
      'gb_month': 1,
      'hour': 1
    };
    return multipliers[unit] || 1;
  }

  #getCurrentPeriod() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  #getPeriodStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }

  async onDestroy() {
    this.#pricing.clear();
    this.#invoices.clear();
  }
}
