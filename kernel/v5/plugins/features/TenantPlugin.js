import { BasePlugin } from '../../core/BasePlugin.js';
import { randomUUID } from 'crypto';

export class TenantPlugin extends BasePlugin {
  #tenants = new Map();
  #currentTenant = null;
  #config = null;
  #db = null;
  #cache = null;
  #isolationMode = 'schema'; // 'schema', 'row', or 'database'

  get name() {
    return 'tenant';
  }

  get version() {
    return '2.0.0';
  }

  get dependencies() {
    return ['logger', 'config', 'db', 'cache'];
  }

  async onInit() {
    this.#config = this.kernel.get('config');
    this.#db = this.kernel.get('db');
    this.#cache = this.kernel.get('cache');
    this.#isolationMode = this.#config.get('tenant.isolationMode', 'schema');

    await this.#initializeTenantSchema();

    this.kernel.services.register('tenant', () => ({
      create: this.createTenant.bind(this),
      get: this.getTenant.bind(this),
      update: this.updateTenant.bind(this),
      delete: this.deleteTenant.bind(this),
      list: this.listTenants.bind(this),
      switch: this.switchTenant.bind(this),
      current: this.getCurrentTenant.bind(this),
      getContext: this.getTenantContext.bind(this),
      isIsolated: this.isTenantIsolated.bind(this)
    }), { singleton: true });

    this.logger.info(`Tenant Plugin initialized (isolation: ${this.#isolationMode})`);
  }

  async #initializeTenantSchema() {
    await this.#db.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        config JSON,
        quotas JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
      CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
    `);

    if (this.#isolationMode === 'schema') {
      await this.#initializeSchemaIsolation();
    }
  }

  async #initializeSchemaIsolation() {
    // 创建默认public schema
    const defaultTenant = await this.getTenant('default');
    if (!defaultTenant) {
      await this.createTenant({
        id: 'default',
        name: 'Default Tenant',
        slug: 'default'
      });
    }
  }

  async createTenant(data) {
    const id = data.id || randomUUID();
    const slug = data.slug || this.#generateSlug(data.name);

    const tenant = {
      id,
      name: data.name,
      slug,
      status: data.status || 'active',
      config: JSON.stringify(data.config || {}),
      quotas: JSON.stringify(data.quotas || {
        maxUsers: 100,
        maxStorage: 1073741824, // 1GB
        maxRequestsPerDay: 10000
      }),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await this.#db.query(
      `INSERT INTO tenants (id, name, slug, status, config, quotas, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenant.id, tenant.name, tenant.slug, tenant.status, tenant.config, tenant.quotas, tenant.created_at, tenant.updated_at]
    );

    if (this.#isolationMode === 'schema') {
      await this.#createTenantSchema(id);
    }

    this.#tenants.set(id, tenant);
    this.kernel.events.emit('tenant:created', { tenant });
    this.logger.info(`Tenant created: ${id} (${slug})`);

    return tenant;
  }

  async #createTenantSchema(tenantId) {
    const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;
    
    try {
      await this.#db.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
      this.logger.debug(`Created schema for tenant: ${tenantId}`);
    } catch (err) {
      this.logger.warn(`Failed to create schema for tenant ${tenantId}:`, err.message);
    }
  }

  async getTenant(idOrSlug) {
    // 检查缓存
    let tenant = this.#tenants.get(idOrSlug);
    if (tenant) return tenant;

    // 从数据库查询
    const results = await this.#db.query(
      'SELECT * FROM tenants WHERE id = ? OR slug = ?',
      [idOrSlug, idOrSlug]
    );

    if (results.length === 0) return null;

    tenant = this.#parseTenant(results[0]);
    this.#tenants.set(tenant.id, tenant);
    this.#tenants.set(tenant.slug, tenant);

    return tenant;
  }

  async updateTenant(id, updates) {
    const tenant = await this.getTenant(id);
    if (!tenant) throw new Error(`Tenant not found: ${id}`);

    const allowedUpdates = ['name', 'status', 'config', 'quotas'];
    const setClause = [];
    const values = [];

    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        setClause.push(`${key} = ?`);
        values.push(typeof updates[key] === 'object' ? JSON.stringify(updates[key]) : updates[key]);
      }
    }

    if (setClause.length === 0) return tenant;

    setClause.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    await this.#db.query(
      `UPDATE tenants SET ${setClause.join(', ')} WHERE id = ?`,
      values
    );

    // 更新缓存
    const updated = await this.getTenant(id);
    this.kernel.events.emit('tenant:updated', { tenant: updated, updates });
    this.logger.info(`Tenant updated: ${id}`);

    return updated;
  }

  async deleteTenant(id) {
    const tenant = await this.getTenant(id);
    if (!tenant) throw new Error(`Tenant not found: ${id}`);

    if (this.#isolationMode === 'schema') {
      await this.#dropTenantSchema(id);
    }

    await this.#db.query('DELETE FROM tenants WHERE id = ?', [id]);

    this.#tenants.delete(tenant.id);
    this.#tenants.delete(tenant.slug);

    this.kernel.events.emit('tenant:deleted', { tenant });
    this.logger.info(`Tenant deleted: ${id}`);

    return true;
  }

  async #dropTenantSchema(tenantId) {
    const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;
    
    try {
      await this.#db.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
    } catch (err) {
      this.logger.warn(`Failed to drop schema for tenant ${tenantId}:`, err.message);
    }
  }

  async listTenants(options = {}) {
    const status = options.status;
    const limit = options.limit || 100;
    const offset = options.offset || 0;

    let query = 'SELECT * FROM tenants';
    const params = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const results = await this.#db.query(query, params);
    return results.map(t => this.#parseTenant(t));
  }

  switchTenant(tenantId) {
    const tenant = this.#tenants.get(tenantId) || this.#tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    this.#currentTenant = tenant;
    this.kernel.events.emit('tenant:switched', { tenant });
    this.logger.debug(`Switched to tenant: ${tenantId}`);

    return tenant;
  }

  getCurrentTenant() {
    return this.#currentTenant;
  }

  getTenantContext(tenantId = null) {
    const tenant = tenantId ? this.#tenants.get(tenantId) : this.#currentTenant;
    if (!tenant) {
      throw new Error('No tenant context available');
    }

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      schema: this.#isolationMode === 'schema' ? `tenant_${tenant.id.replace(/-/g, '_')}` : null,
      config: tenant.config,
      quotas: tenant.quotas
    };
  }

  isTenantIsolated() {
    return this.#isolationMode !== 'row';
  }

  #generateSlug(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  #parseTenant(row) {
    return {
      ...row,
      config: JSON.parse(row.config || '{}'),
      quotas: JSON.parse(row.quotas || '{}')
    };
  }

  async checkQuota(tenantId, quotaType, value) {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) throw new Error(`Tenant not found: ${tenantId}`);

    const quota = tenant.quotas[quotaType];
    if (!quota) return { allowed: true };

    const current = await this.#getCurrentUsage(tenantId, quotaType);
    const allowed = current + value <= quota;

    return {
      allowed,
      current,
      limit: quota,
      remaining: Math.max(0, quota - current)
    };
  }

  async #getCurrentUsage(tenantId, quotaType) {
    const cacheKey = `tenant:usage:${tenantId}:${quotaType}`;
    const cached = await this.#cache.get(cacheKey);
    if (cached !== undefined) return cached;

    // 这里应该查询实际使用情况
    const usage = 0;
    await this.#cache.set(cacheKey, usage, 300);
    return usage;
  }

  async onDestroy() {
    this.#tenants.clear();
    this.#currentTenant = null;
  }
}
