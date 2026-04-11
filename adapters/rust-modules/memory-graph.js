// adapters/rust-modules/memory-graph.js
// HundunOS Memory Graph Adapter v1.0
// 统一适配层：从 kernel/memory-graph-rust.js 迁移而来

export class MemoryGraphAdapter {
  constructor(transport) {
    this.transport = transport;
  }

  async record(content, intent, result) {
    const resp = await this.transport.send('memory', {
      Record: { content, intent, result }
    });
    return resp.data ?? resp;
  }

  async recall(query) {
    const resp = await this.transport.send('memory', {
      Recall: { query }
    });
    return resp.data ?? resp;
  }

  async search(query, limit = 10) {
    const resp = await this.transport.send('memory', {
      Search: { query, limit }
    });
    return resp.data ?? resp;
  }

  async setContext(level, key, value, priority = 3) {
    await this.transport.send('memory', {
      SetContext: { level, key, value, priority }
    });
    return true;
  }

  async getContext(level, key) {
    const resp = await this.transport.send('memory', {
      GetContext: { level, key }
    });
    return resp.data;
  }

  async getContextChain() {
    const resp = await this.transport.send('memory', {
      GetContextChain: {}
    });
    return resp.data ?? resp;
  }

  async getMemoryInjection(context, maxTokens = 4000) {
    const resp = await this.transport.send('memory', {
      GetMemoryInjection: { context, max_tokens: maxTokens }
    });
    return resp.data ?? resp;
  }

  async distill() {
    await this.transport.send('memory', { Distill: {} });
    return true;
  }

  async createSnapshot() {
    const resp = await this.transport.send('memory', { CreateSnapshot: {} });
    return resp.data;
  }

  async restoreSnapshot(snapshot) {
    await this.transport.send('memory', { RestoreSnapshot: { snapshot } });
  }

  async cleanupExpired() {
    const resp = await this.transport.send('memory', { CleanupExpired: {} });
    return resp.data ?? 0;
  }

  async getStats() {
    const resp = await this.transport.send('memory', { GetStats: {} });
    return resp.data ?? resp;
  }

  async ftsSearch(query, limit = 20, layerFilter = null) {
    const resp = await this.transport.send('memory', {
      FtsSearch: { query, limit, layer_filter: layerFilter }
    });
    return resp.data ?? resp;
  }

  async semanticSearch(query, topK = 5) {
    const resp = await this.transport.send('memory', {
      SemanticSearch: { query, top_k: topK }
    });
    return resp.data ?? resp;
  }
}

export default MemoryGraphAdapter;
