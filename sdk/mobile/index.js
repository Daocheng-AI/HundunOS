/**
 * HundunOS v4.3 - 移动端 SDK
 * 实现移动端 SDK
 */

class HundunOSSDK {
  constructor(config) {
    this.config = {
      baseUrl: config.baseUrl || 'https://api.hundunos.ai',
      apiKey: config.apiKey,
      deviceId: config.deviceId || this.generateDeviceId(),
      platform: config.platform || 'unknown',
    };
    this.sessionId = null;
    this.lastSync = 0;
  }

  /**
   * 生成设备 ID
   */
  generateDeviceId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * 发送请求
   */
  async request(method, path, body = {}) {
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.config.apiKey,
        'X-Device-ID': this.config.deviceId,
        'X-Platform': this.config.platform,
        'X-Last-Sync': this.lastSync,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  }

  /**
   * 创建会话
   */
  async createSession(options = {}) {
    const result = await this.request('POST', '/api/mobile/sessions', {
      deviceId: this.config.deviceId,
      platform: this.config.platform,
      ...options,
    });
    this.sessionId = result.data.sessionId;
    return result.data;
  }

  /**
   * 获取会话
   */
  async getSession() {
    if (!this.sessionId) {
      throw new Error('No active session');
    }
    const result = await this.request('GET', `/api/mobile/sessions/${this.sessionId}`);
    return result.data;
  }

  /**
   * 发送消息
   */
  async sendMessage(message) {
    if (!this.sessionId) {
      throw new Error('No active session');
    }
    const result = await this.request('POST', `/api/mobile/sessions/${this.sessionId}/messages`, {
      message,
    });
    this.lastSync = Date.now();
    return result.data;
  }

  /**
   * 注册推送通知
   */
  async registerPushNotification(token) {
    const result = await this.request('POST', '/api/mobile/notifications/register', {
      deviceId: this.config.deviceId,
      token,
      platform: this.config.platform,
    });
    return result.data;
  }

  /**
   * 注销推送通知
   */
  async unregisterPushNotification() {
    const result = await this.request('POST', '/api/mobile/notifications/unregister', {
      deviceId: this.config.deviceId,
    });
    return result.data;
  }

  /**
   * 同步离线数据
   */
  async syncOfflineData() {
    const result = await this.request('GET', '/api/mobile/sync');
    this.lastSync = result.data.syncedAt;
    return result.data;
  }

  /**
   * 流式发送消息
   */
  async *streamMessage(message) {
    if (!this.sessionId) {
      throw new Error('No active session');
    }

    const response = await fetch(`${this.config.baseUrl}/api/mobile/sessions/${this.sessionId}/messages/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.config.apiKey,
        'X-Device-ID': this.config.deviceId,
        'X-Platform': this.config.platform,
      },
      body: JSON.stringify({ message }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          yield JSON.parse(data);
        }
      }
    }
  }
}

// 导出 SDK
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HundunOSSDK;
}
