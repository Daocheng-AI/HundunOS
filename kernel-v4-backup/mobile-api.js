/**
 * HundunOS v4.3 - 移动端 API
 * 实现移动端专用 API
 */

/**
 * 移动端 API 管理器
 */
export class MobileAPIManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.routes = new Map();
  }

  /**
   * 注册路由
   */
  registerRoute(method, path, handler) {
    const key = `${method.toUpperCase()} ${path}`;
    this.routes.set(key, handler);
  }

  /**
   * 处理请求
   */
  async handleRequest(method, path, body = {}, headers = {}) {
    const key = `${method.toUpperCase()} ${path}`;
    const handler = this.routes.get(key);

    if (!handler) {
      return { error: 'Not found', statusCode: 404 };
    }

    try {
      const result = await handler(body, headers);
      return { data: result, statusCode: 200 };
    } catch (e) {
      return { error: e.message, statusCode: 500 };
    }
  }

  /**
   * 初始化路由
   */
  initializeRoutes() {
    // 会话管理
    this.registerRoute('POST', '/api/mobile/sessions', async (body) => {
      return await this.kernel.createSession(body);
    });

    this.registerRoute('GET', '/api/mobile/sessions/:sessionId', async (body, headers) => {
      const sessionId = headers.path.split('/').pop();
      return await this.kernel.getSession(sessionId);
    });

    this.registerRoute('DELETE', '/api/mobile/sessions/:sessionId', async (body, headers) => {
      const sessionId = headers.path.split('/').pop();
      return await this.kernel.deleteSession(sessionId);
    });

    // 消息处理
    this.registerRoute('POST', '/api/mobile/sessions/:sessionId/messages', async (body, headers) => {
      const sessionId = headers.path.split('/').pop();
      return await this.kernel.process({
        type: 'text',
        content: body.message,
        sessionId,
      });
    });

    // 推送通知
    this.registerRoute('POST', '/api/mobile/notifications/register', async (body) => {
      return await this.registerPushNotification(body);
    });

    this.registerRoute('POST', '/api/mobile/notifications/unregister', async (body) => {
      return await this.unregisterPushNotification(body);
    });

    // 离线同步
    this.registerRoute('GET', '/api/mobile/sync', async (body, headers) => {
      return await this.syncOfflineData(headers);
    });
  }

  /**
   * 注册推送通知
   */
  async registerPushNotification({ deviceId, token, platform }) {
    const data = {
      deviceId,
      token,
      platform,
      registeredAt: new Date().toISOString(),
    };
    await this.kernel.storage.put(`.hundunos/mobile/notifications/${deviceId}.json`, data);
    return { success: true };
  }

  /**
   * 注销推送通知
   */
  async unregisterPushNotification({ deviceId }) {
    await this.kernel.storage.del(`.hundunos/mobile/notifications/${deviceId}.json`);
    return { success: true };
  }

  /**
   * 发送推送通知
   */
  async sendPushNotification(deviceId, notification) {
    const data = await this.kernel.storage.get(`.hundunos/mobile/notifications/${deviceId}.json`);
    if (!data) {
      throw new Error('Device not registered');
    }

    // TODO: 实现推送通知逻辑（当前仅记录日志）
    // Issue: https://github.com/hundunos/hundunos/issues/xxx
    // console.log('[MobileAPI] Send push notification:', notification);
    return { success: true };
  }

  /**
   * 同步离线数据
   */
  async syncOfflineData(headers) {
    const lastSync = headers['x-last-sync'] || '0';
    const since = new Date(parseInt(lastSync));

    // 获取离线期间的消息
    const messages = await this.kernel.storage.keys(`.hundunos/sessions/*/messages/*.json`);
    const syncedMessages = [];

    for (const key of messages) {
      const message = await this.kernel.storage.get(key);
      if (new Date(message.timestamp) > since) {
        syncedMessages.push(message);
      }
    }

    return {
      messages: syncedMessages,
      syncedAt: Date.now(),
    };
  }
}

export default MobileAPIManager;
