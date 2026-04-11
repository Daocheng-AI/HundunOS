// adapters/rust-modules/policy-engine.js
// HundunOS Policy Engine Adapter v1.0

export class PolicyEngineAdapter {
  constructor(transport) {
    this.transport = transport;
  }

  async checkFileRead(filePath) {
    return await this.transport.send('policy', { CheckFileRead: { path: filePath } });
  }

  async checkFileWrite(filePath, size = null) {
    const params = { path: filePath };
    if (size !== null) params.size = size;
    return await this.transport.send('policy', { CheckFileWrite: params });
  }

  async checkFileDelete(filePath) {
    return await this.transport.send('policy', { CheckFileDelete: { path: filePath } });
  }

  async checkNetwork(url) {
    return await this.transport.send('policy', { CheckNetwork: { url } });
  }

  async checkTool(tool, command) {
    return await this.transport.send('policy', { CheckTool: { tool, command } });
  }

  async getPolicy() {
    const resp = await this.transport.send('policy', { GetPolicy: {} });
    return resp.data ?? resp;
  }

  async setPolicy(config) {
    const resp = await this.transport.send('policy', { SetPolicy: { config } });
    return resp.success;
  }
}

export default PolicyEngineAdapter;
