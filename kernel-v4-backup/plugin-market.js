/**
 * HundunOS v4.3 - 插件市场
 * 实现插件的发布、发现、安装、更新、卸载
 */

import { createHash } from 'crypto';

/**
 * 插件市场管理器
 */
export class PluginMarketManager {
  constructor(kernel, options = {}) {
    this.kernel = kernel;
    this.options = {
      registryUrl: options.registryUrl || 'https://plugins.hundunos.ai',
      cacheDir: options.cacheDir || '.hundunos/plugins/cache',
      installDir: options.installDir || '.hundunos/plugins/installed',
    };
    this.cache = new Map();
  }

  /**
   * 搜索插件
   */
  async search(query = '') {
    try {
      const response = await fetch(`${this.options.registryUrl}/api/plugins/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      return data.plugins || [];
    } catch (e) {
      console.error('[PluginMarket] Search failed:', e.message);
      return [];
    }
  }

  /**
   * 获取插件信息
   */
  async getPluginInfo(pluginId) {
    try {
      const response = await fetch(`${this.options.registryUrl}/api/plugins/${pluginId}`);
      const data = await response.json();
      return data.plugin || null;
    } catch (e) {
      console.error('[PluginMarket] Get plugin info failed:', e.message);
      return null;
    }
  }

  /**
   * 下载插件
   */
  async downloadPlugin(pluginId, version = 'latest') {
    try {
      const response = await fetch(`${this.options.registryUrl}/api/plugins/${pluginId}/${version}/download`);
      const buffer = await response.arrayBuffer();
      const hash = createHash('sha256').update(Buffer.from(buffer)).digest('hex');
      
      const cachePath = `${this.options.cacheDir}/${pluginId}-${version}-${hash}.tgz`;
      await this.kernel.storage.put(cachePath, buffer);
      
      return { path: cachePath, hash };
    } catch (e) {
      console.error('[PluginMarket] Download failed:', e.message);
      return null;
    }
  }

  /**
   * 验证插件签名
   */
  async verifyPluginSignature(pluginPath, signature) {
    try {
      const buffer = await this.kernel.storage.get(pluginPath);
      const hash = createHash('sha256').update(buffer).digest('hex');
      return hash === signature;
    } catch (e) {
      console.error('[PluginMarket] Verify signature failed:', e.message);
      return false;
    }
  }

  /**
   * 安装插件
   */
  async installPlugin(pluginId, version = 'latest') {
    const pluginInfo = await this.getPluginInfo(pluginId);
    if (!pluginInfo) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    const downloadResult = await this.downloadPlugin(pluginId, version);
    if (!downloadResult) {
      throw new Error(`Download plugin ${pluginId} failed`);
    }

    const verified = await this.verifyPluginSignature(downloadResult.path, pluginInfo.signature);
    if (!verified) {
      throw new Error(`Plugin ${pluginId} signature verification failed`);
    }

    const installPath = `${this.options.installDir}/${pluginId}`;
    await this.kernel.storage.put(installPath, downloadResult.path);

    return { success: true, path: installPath };
  }

  /**
   * 卸载插件
   */
  async uninstallPlugin(pluginId) {
    const installPath = `${this.options.installDir}/${pluginId}`;
    await this.kernel.storage.del(installPath);
    return { success: true };
  }

  /**
   * 更新插件
   */
  async updatePlugin(pluginId) {
    const pluginInfo = await this.getPluginInfo(pluginId);
    if (!pluginInfo) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    const currentVersion = await this.getInstalledVersion(pluginId);
    if (currentVersion === pluginInfo.version) {
      return { success: true, message: 'Already up to date' };
    }

    return await this.installPlugin(pluginId, pluginInfo.version);
  }

  /**
   * 获取已安装版本
   */
  async getInstalledVersion(pluginId) {
    const installPath = `${this.options.installDir}/${pluginId}`;
    const data = await this.kernel.storage.get(installPath);
    return data?.version || null;
  }

  /**
   * 列出已安装插件
   */
  async listInstalledPlugins() {
    const plugins = [];
    const keys = await this.kernel.storage.keys(`${this.options.installDir}/*`);
    for (const key of keys) {
      const data = await this.kernel.storage.get(key);
      plugins.push(data);
    }
    return plugins;
  }
}

export default PluginMarketManager;
