/**
 * HundunOS v4.3 - 多租户管理器
 * 实现租户隔离、资源配额、计费系统
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * 租户管理器
 */
export class TenantManager {
  constructor(kernel, options = {}) {
    this.kernel = kernel;
    this.options = {
      storageDir: options.storageDir || '.hundunos/tenants',
    };
    this.tenants = new Map();
  }

  /**
   * 创建租户
   */
  async createTenant(name, plan = 'free') {
    const tenantId = uuidv4();
    const tenant = {
      id: tenantId,
      name,
      plan,
      createdAt: new Date().toISOString(),
      status: 'active',
      quotas: this.getPlanQuotas(plan),
      usage: {
        sessions: 0,
        messages: 0,
        tokens: 0,
        storage: 0,
      },
    };

    this.tenants.set(tenantId, tenant);
    await this.kernel.storage.put(`${this.options.storageDir}/${tenantId}.json`, tenant);

    return tenant;
  }

  /**
   * 获取租户
   */
  async getTenant(tenantId) {
    if (this.tenants.has(tenantId)) {
      return this.tenants.get(tenantId);
    }

    const tenant = await this.kernel.storage.get(`${this.options.storageDir}/${tenantId}.json`);
    if (tenant) {
      this.tenants.set(tenantId, tenant);
    }
    return tenant;
  }

  /**
   * 更新租户
   */
  async updateTenant(tenantId, updates) {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    Object.assign(tenant, updates);
    this.tenants.set(tenantId, tenant);
    await this.kernel.storage.put(`${this.options.storageDir}/${tenantId}.json`, tenant);

    return tenant;
  }

  /**
   * 删除租户
   */
  async deleteTenant(tenantId) {
    this.tenants.delete(tenantId);
    await this.kernel.storage.del(`${this.options.storageDir}/${tenantId}.json`);
  }

  /**
   * 检查配额
   */
  async checkQuota(tenantId, resource, amount = 1) {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const quota = tenant.quotas[resource];
    const usage = tenant.usage[resource];

    if (usage + amount > quota) {
      return { allowed: false, quota, usage, amount };
    }

    return { allowed: true, quota, usage, amount };
  }

  /**
   * 使用配额
   */
  async useQuota(tenantId, resource, amount = 1) {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const check = await this.checkQuota(tenantId, resource, amount);
    if (!check.allowed) {
      throw new Error(`Quota exceeded for ${resource}`);
    }

    tenant.usage[resource] += amount;
    await this.kernel.storage.put(`${this.options.storageDir}/${tenantId}.json`, tenant);

    return tenant.usage[resource];
  }

  /**
   * 获取计划配额
   */
  getPlanQuotas(plan) {
    const plans = {
      free: {
        sessions: 1,
        messages: 100,
        tokens: 100000,
        storage: 1024 * 1024 * 100, // 100MB
      },
      pro: {
        sessions: 10,
        messages: 10000,
        tokens: 10000000,
        storage: 1024 * 1024 * 1024, // 1GB
      },
      enterprise: {
        sessions: 100,
        messages: 1000000,
        tokens: 1000000000,
        storage: 1024 * 1024 * 1024 * 100, // 100GB
      },
    };
    return plans[plan] || plans.free;
  }

  /**
   * 列出租户
   */
  async listTenants() {
    const keys = await this.kernel.storage.keys(`${this.options.storageDir}/*.json`);
    const tenants = [];
    for (const key of keys) {
      const tenant = await this.kernel.storage.get(key);
      tenants.push(tenant);
    }
    return tenants;
  }
}

/**
 * 计费管理器
 */
export class BillingManager {
  constructor(kernel, options = {}) {
    this.kernel = kernel;
    this.options = {
      storageDir: options.storageDir || '.hundunos/billing',
      rates: options.rates || {
        tokens: 0.00001, // $0.00001 per token
        storage: 0.0000001, // $0.0000001 per byte
      },
    };
  }

  /**
   * 创建账单
   */
  async createInvoice(tenantId, month) {
    const invoiceId = uuidv4();
    const invoice = {
      id: invoiceId,
      tenantId,
      month,
      status: 'pending',
      items: [],
      total: 0,
      createdAt: new Date().toISOString(),
    };

    await this.kernel.storage.put(`${this.options.storageDir}/${invoiceId}.json`, invoice);
    return invoice;
  }

  /**
   * 获取账单
   */
  async getInvoice(invoiceId) {
    return await this.kernel.storage.get(`${this.options.storageDir}/${invoiceId}.json`);
  }

  /**
   * 添加账单项
   */
  async addInvoiceItem(invoiceId, item) {
    const invoice = await this.getInvoice(invoiceId);
    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }

    invoice.items.push(item);
    invoice.total += item.amount;

    await this.kernel.storage.put(`${this.options.storageDir}/${invoiceId}.json`, invoice);
    return invoice;
  }

  /**
   * 计算账单
   */
  async calculateInvoice(tenantId, month) {
    const tenant = await this.kernel.tenantManager.getTenant(tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const invoice = await this.createInvoice(tenantId, month);

    // Token 费用
    const tokenCost = tenant.usage.tokens * this.options.rates.tokens;
    await this.addInvoiceItem(invoice.id, {
      type: 'tokens',
      quantity: tenant.usage.tokens,
      unitPrice: this.options.rates.tokens,
      amount: tokenCost,
    });

    // 存储费用
    const storageCost = tenant.usage.storage * this.options.rates.storage;
    await this.addInvoiceItem(invoice.id, {
      type: 'storage',
      quantity: tenant.usage.storage,
      unitPrice: this.options.rates.storage,
      amount: storageCost,
    });

    return invoice;
  }

  /**
   * 支付账单
   */
  async payInvoice(invoiceId, paymentMethod) {
    const invoice = await this.getInvoice(invoiceId);
    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }

    invoice.status = 'paid';
    invoice.paymentMethod = paymentMethod;
    invoice.paidAt = new Date().toISOString();

    await this.kernel.storage.put(`${this.options.storageDir}/${invoiceId}.json`, invoice);
    return invoice;
  }

  /**
   * 列出账单
   */
  async listInvoices(tenantId) {
    const keys = await this.kernel.storage.keys(`${this.options.storageDir}/*.json`);
    const invoices = [];
    for (const key of keys) {
      const invoice = await this.kernel.storage.get(key);
      if (invoice.tenantId === tenantId) {
        invoices.push(invoice);
      }
    }
    return invoices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
}

export default { TenantManager, BillingManager };
