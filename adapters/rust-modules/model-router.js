// adapters/rust-modules/model-router.js
// HundunOS Model Router Adapter v1.0

export class ModelRouterAdapter {
  constructor(transport) {
    this.transport = transport;
  }

  async route(content, taskType = null, maxTokens = null) {
    const resp = await this.transport.send('router', {
      Route: { content, task_type: taskType, max_tokens: maxTokens }
    });
    return resp.data ?? resp;
  }

  async recordSuccess(providerId) {
    await this.transport.send('router', {
      RecordSuccess: { provider_id: providerId }
    });
  }

  async recordFailure(providerId, error = '') {
    await this.transport.send('router', {
      RecordFailure: { provider_id: providerId, error }
    });
  }

  async getStats() {
    const resp = await this.transport.send('router', { GetStats: {} });
    return resp.data ?? resp;
  }

  async getProviders() {
    const resp = await this.transport.send('router', { GetProviders: {} });
    return resp.data ?? resp;
  }

  async addProvider(provider) {
    const resp = await this.transport.send('router', { AddProvider: { provider } });
    return resp.success;
  }

  async updateProvider(id, updates) {
    const resp = await this.transport.send('router', { UpdateProvider: { id, updates } });
    return resp.success;
  }
}

export default ModelRouterAdapter;
