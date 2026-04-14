/**
 * HundunOS Agent SDK - Binary Data 管理
 * 基于 n8n Binary Data 设计，提供二进制数据存储和管理的抽象层
 */

/**
 * Binary Data 元数据
 */
export class BinaryMetadata {
  constructor(options = {}) {
    this.id = options.id || this._generateId();
    this.fileName = options.fileName || '';
    this.mimeType = options.mimeType || 'application/octet-stream';
    this.size = options.size || 0;
    this.createdAt = options.createdAt || new Date();
    this.updatedAt = options.updatedAt || new Date();
    this.expiresAt = options.expiresAt || null;
    this.tags = options.tags || [];
    this.customData = options.customData || {};
  }

  /**
   * 生成唯一 ID
   */
  _generateId() {
    return `binary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 转换为 JSON
   */
  toJSON() {
    return {
      id: this.id,
      fileName: this.fileName,
      mimeType: this.mimeType,
      size: this.size,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      expiresAt: this.expiresAt ? this.expiresAt.toISOString() : null,
      tags: this.tags,
      customData: this.customData
    };
  }

  /**
   * 从 JSON 创建
   */
  static fromJSON(json) {
    return new BinaryMetadata({
      id: json.id,
      fileName: json.fileName,
      mimeType: json.mimeType,
      size: json.size,
      createdAt: new Date(json.createdAt),
      updatedAt: new Date(json.updatedAt),
      expiresAt: json.expiresAt ? new Date(json.expiresAt) : null,
      tags: json.tags,
      customData: json.customData
    });
  }
}

/**
 * Binary Data 实体
 */
export class BinaryData {
  constructor(data, metadata = {}) {
    this.data = data;
    this.metadata = new BinaryMetadata(metadata);
  }

  /**
   * 获取数据
   */
  getData() {
    return this.data;
  }

  /**
   * 获取大小
   */
  getSize() {
    return this.data ? this.data.length : this.metadata.size;
  }

  /**
   * 获取 MIME 类型
   */
  getMimeType() {
    return this.metadata.mimeType;
  }

  /**
   * 是否已过期
   */
  isExpired() {
    if (!this.metadata.expiresAt) {
      return false;
    }
    return new Date() > this.metadata.expiresAt;
  }

  /**
   * 添加标签
   */
  addTag(tag) {
    if (!this.metadata.tags.includes(tag)) {
      this.metadata.tags.push(tag);
    }
    return this;
  }

  /**
   * 移除标签
   */
  removeTag(tag) {
    const index = this.metadata.tags.indexOf(tag);
    if (index !== -1) {
      this.metadata.tags.splice(index, 1);
    }
    return this;
  }

  /**
   * 设置自定义数据
   */
  setCustomData(key, value) {
    this.metadata.customData[key] = value;
    return this;
  }

  /**
   * 获取自定义数据
   */
  getCustomData(key) {
    return this.metadata.customData[key];
  }

  /**
   * 转换为 JSON
   */
  toJSON() {
    return {
      metadata: this.metadata.toJSON(),
      // 注意：data 可能很大，通常不直接序列化
      dataSize: this.data ? this.data.length : 0
    };
  }
}

/**
 * 存储后端接口
 */
export class StorageBackend {
  /**
   * 存储数据
   */
  async store(data, metadata) {
    throw new Error('Method not implemented');
  }

  /**
   * 获取数据
   */
  async retrieve(id) {
    throw new Error('Method not implemented');
  }

  /**
   * 删除数据
   */
  async delete(id) {
    throw new Error('Method not implemented');
  }

  /**
   * 检查数据是否存在
   */
  async exists(id) {
    throw new Error('Method not implemented');
  }

  /**
   * 获取元数据
   */
  async getMetadata(id) {
    throw new Error('Method not implemented');
  }

  /**
   * 列出所有数据
   */
  async list(options = {}) {
    throw new Error('Method not implemented');
  }

  /**
   * 清理过期数据
   */
  async cleanup() {
    throw new Error('Method not implemented');
  }
}

/**
 * 文件系统存储后端
 */
export class FileSystemStorage extends StorageBackend {
  constructor(config = {}) {
    super();
    this.basePath = config.basePath || './binary-data';
    this.metadataPath = config.metadataPath || `${this.basePath}/metadata`;
  }

  /**
   * 初始化存储
   */
  async initialize() {
    const fs = await import('fs');
    const path = await import('path');

    // 创建基础目录
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }

    // 创建元数据目录
    if (!fs.existsSync(this.metadataPath)) {
      fs.mkdirSync(this.metadataPath, { recursive: true });
    }
  }

  /**
   * 存储数据
   */
  async store(data, metadata) {
    const fs = await import('fs/promises');
    const path = await import('path');

    const binaryData = new BinaryData(data, {
      ...metadata,
      size: data.length
    });

    const dataPath = path.join(this.basePath, binaryData.metadata.id);
    const metadataPath = path.join(this.metadataPath, `${binaryData.metadata.id}.json`);

    // 存储数据
    await fs.writeFile(dataPath, data, 'binary');

    // 存储元数据
    await fs.writeFile(metadataPath, JSON.stringify(binaryData.metadata.toJSON()), 'utf8');

    return binaryData.metadata.id;
  }

  /**
   * 获取数据
   */
  async retrieve(id) {
    const fs = await import('fs/promises');
    const path = await import('path');

    const dataPath = path.join(this.basePath, id);

    const data = await fs.readFile(dataPath, 'binary');
    const metadata = await this.getMetadata(id);

    return new BinaryData(data, metadata.toJSON());
  }

  /**
   * 删除数据
   */
  async delete(id) {
    const fs = await import('fs/promises');
    const path = await import('path');

    const dataPath = path.join(this.basePath, id);
    const metadataPath = path.join(this.metadataPath, `${id}.json`);

    // 删除数据文件
    try {
      await fs.unlink(dataPath);
    } catch (error) {
      // 文件可能不存在
    }

    // 删除元数据文件
    try {
      await fs.unlink(metadataPath);
    } catch (error) {
      // 文件可能不存在
    }
  }

  /**
   * 检查数据是否存在
   */
  async exists(id) {
    const fs = await import('fs/promises');
    const path = await import('path');

    const dataPath = path.join(this.basePath, id);

    try {
      await fs.access(dataPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取元数据
   */
  async getMetadata(id) {
    const fs = await import('fs/promises');
    const path = await import('path');

    const metadataPath = path.join(this.metadataPath, `${id}.json`);

    const data = await fs.readFile(metadataPath, 'utf8');
    return BinaryMetadata.fromJSON(JSON.parse(data));
  }

  /**
   * 列出所有数据
   */
  async list(options = {}) {
    const fs = await import('fs/promises');
    const path = await import('path');

    const files = await fs.readdir(this.metadataPath);
    const metadataList = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const id = file.replace('.json', '');
        const metadata = await this.getMetadata(id);

        // 过滤条件
        if (options.tags && options.tags.length > 0) {
          if (!options.tags.some(tag => metadata.tags.includes(tag))) {
            continue;
          }
        }

        if (options.mimeType && metadata.mimeType !== options.mimeType) {
          continue;
        }

        metadataList.push(metadata);
      }
    }

    return metadataList;
  }

  /**
   * 清理过期数据
   */
  async cleanup() {
    const metadataList = await this.list();
    const now = new Date();

    for (const metadata of metadataList) {
      if (metadata.expiresAt && new Date(metadata.expiresAt) < now) {
        await this.delete(metadata.id);
      }
    }
  }
}

/**
 * 内存存储后端（用于测试和开发）
 */
export class MemoryStorage extends StorageBackend {
  constructor() {
    super();
    this._storage = new Map();
  }

  /**
   * 存储数据
   */
  async store(data, metadata) {
    const binaryData = new BinaryData(data, {
      ...metadata,
      size: data.length
    });

    this._storage.set(binaryData.metadata.id, binaryData);

    return binaryData.metadata.id;
  }

  /**
   * 获取数据
   */
  async retrieve(id) {
    return this._storage.get(id);
  }

  /**
   * 删除数据
   */
  async delete(id) {
    this._storage.delete(id);
  }

  /**
   * 检查数据是否存在
   */
  async exists(id) {
    return this._storage.has(id);
  }

  /**
   * 获取元数据
   */
  async getMetadata(id) {
    const binaryData = this._storage.get(id);
    return binaryData ? binaryData.metadata : null;
  }

  /**
   * 列出所有数据
   */
  async list(options = {}) {
    const results = [];

    for (const binaryData of this._storage.values()) {
      const metadata = binaryData.metadata;

      // 过滤条件
      if (options.tags && options.tags.length > 0) {
        if (!options.tags.some(tag => metadata.tags.includes(tag))) {
          continue;
        }
      }

      if (options.mimeType && metadata.mimeType !== options.mimeType) {
        continue;
      }

      results.push(metadata);
    }

    return results;
  }

  /**
   * 清理过期数据
   */
  async cleanup() {
    const now = new Date();

    for (const [id, binaryData] of this._storage.entries()) {
      if (binaryData.isExpired()) {
        this._storage.delete(id);
      }
    }
  }

  /**
   * 清空所有数据
   */
  clear() {
    this._storage.clear();
  }

  /**
   * 获取存储数量
  */
  size() {
    return this._storage.size;
  }
}

/**
 * Binary Data 管理器
 */
export class BinaryDataManager {
  constructor(config = {}) {
    this.backend = config.backend || new MemoryStorage();
    this.enableDeduplication = config.enableDeduplication !== false;
    this.enableCompression = config.enableCompression || false;
    this.compressionLevel = config.compressionLevel || 6;
    this.hashCache = new Map(); // 用于去重的哈希缓存
  }

  /**
   * 存储二进制数据
   */
  async store(data, options = {}) {
    let processedData = data;

    // 去重检查
    if (this.enableDeduplication) {
      const hash = await this._calculateHash(data);
      
      if (this.hashCache.has(hash)) {
        const existingId = this.hashCache.get(hash);
        const existingMetadata = await this.backend.getMetadata(existingId);
        
        if (existingMetadata) {
          return {
            id: existingId,
            isNew: false,
            metadata: existingMetadata
          };
        }
      }

      this.hashCache.set(hash, null); // 暂时标记，存储完成后更新
    }

    // 压缩（如果启用）
    if (this.enableCompression) {
      processedData = await this._compress(data);
    }

    // 存储数据
    const metadata = {
      fileName: options.fileName || '',
      mimeType: options.mimeType || 'application/octet-stream',
      tags: options.tags || [],
      expiresAt: options.expiresAt || null,
      customData: options.customData || {}
    };

    const id = await this.backend.store(processedData, metadata);

    // 更新哈希缓存
    if (this.enableDeduplication) {
      const hash = await this._calculateHash(data);
      this.hashCache.set(hash, id);
    }

    const storedMetadata = await this.backend.getMetadata(id);

    return {
      id,
      isNew: true,
      metadata: storedMetadata
    };
  }

  /**
   * 获取二进制数据
   */
  async retrieve(id) {
    const binaryData = await this.backend.retrieve(id);

    if (!binaryData) {
      return null;
    }

    // 检查是否过期
    if (binaryData.isExpired()) {
      await this.delete(id);
      return null;
    }

    let data = binaryData.getData();

    // 解压缩（如果需要）
    if (this.enableCompression) {
      data = await this._decompress(data);
    }

    return {
      data,
      metadata: binaryData.metadata
    };
  }

  /**
   * 删除二进制数据
   */
  async delete(id) {
    // 从哈希缓存中移除
    for (const [hash, cachedId] of this.hashCache.entries()) {
      if (cachedId === id) {
        this.hashCache.delete(hash);
        break;
      }
    }

    await this.backend.delete(id);
  }

  /**
   * 检查数据是否存在
   */
  async exists(id) {
    return await this.backend.exists(id);
  }

  /**
   * 获取元数据
   */
  async getMetadata(id) {
    return await this.backend.getMetadata(id);
  }

  /**
   * 列出所有数据
   */
  async list(options = {}) {
    return await this.backend.list(options);
  }

  /**
   * 搜索数据
   */
  async search(query) {
    const allMetadata = await this.list();
    const results = [];

    for (const metadata of allMetadata) {
      let match = false;

      // 搜索文件名
      if (metadata.fileName.toLowerCase().includes(query.toLowerCase())) {
        match = true;
      }

      // 搜索标签
      if (metadata.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()))) {
        match = true;
      }

      // 搜索自定义数据
      for (const [key, value] of Object.entries(metadata.customData)) {
        if (String(value).toLowerCase().includes(query.toLowerCase())) {
          match = true;
          break;
        }
      }

      if (match) {
        results.push(metadata);
      }
    }

    return results;
  }

  /**
   * 清理过期数据
   */
  async cleanup() {
    const metadataList = await this.list();
    const now = new Date();

    for (const metadata of metadataList) {
      if (metadata.expiresAt && new Date(metadata.expiresAt) < now) {
        await this.delete(metadata.id);
      }
    }

    await this.backend.cleanup();
  }

  /**
   * 切换存储后端
   */
  async switchBackend(newBackend) {
    const oldBackend = this.backend;
    const oldData = await oldBackend.list();

    // 迁移数据
    for (const metadata of oldData) {
      const binaryData = await oldBackend.retrieve(metadata.id);
      if (binaryData) {
        await newBackend.store(binaryData.getData(), metadata.toJSON());
      }
    }

    this.backend = newBackend;
    this.hashCache.clear(); // 清空哈希缓存，重新构建
  }

  /**
   * 计算数据哈希（用于去重）
   */
  async _calculateHash(data) {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * 压缩数据
   */
  async _compress(data) {
    const zlib = await import('zlib');
    return new Promise((resolve, reject) => {
      zlib.deflate(data, { level: this.compressionLevel }, (err, compressed) => {
        if (err) reject(err);
        else resolve(compressed);
      });
    });
  }

  /**
   * 解压缩数据
   */
  async _decompress(data) {
    const zlib = await import('zlib');
    return new Promise((resolve, reject) => {
      zlib.inflate(data, (err, decompressed) => {
        if (err) reject(err);
        else resolve(decompressed);
      });
    });
  }

  /**
   * 获取统计信息
   */
  async getStats() {
    const metadataList = await this.list();
    const totalSize = metadataList.reduce((sum, m) => sum + m.size, 0);
    const expiredCount = metadataList.filter(m => m.expiresAt && new Date(m.expiresAt) < new Date()).length;

    return {
      totalCount: metadataList.length,
      totalSize,
      expiredCount,
      deduplicationEnabled: this.enableDeduplication,
      compressionEnabled: this.enableCompression,
      hashCacheSize: this.hashCache.size
    };
  }
}

/**
 * 创建 Binary Data 管理器的便捷函数
 */
export function createBinaryDataManager(config = {}) {
  return new BinaryDataManager(config);
}

/**
 * 创建文件系统存储后端的便捷函数
 */
export function createFileSystemStorage(config = {}) {
  return new FileSystemStorage(config);
}

/**
 * 创建内存存储后端的便捷函数
 */
export function createMemoryStorage() {
  return new MemoryStorage();
}
