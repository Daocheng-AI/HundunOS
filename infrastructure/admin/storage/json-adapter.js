/**
 * JSON文件存储适配器
 * @module infrastructure/admin/storage/json-adapter
 */

import { promises as fs } from 'fs';
import path from 'path';
import { generateId, getCurrentTime } from '../core/base-model.js';

/**
 * JSON存储适配器
 * 使用JSON文件进行数据持久化
 */
export class JSONStorageAdapter {
  /**
   * @param {Object} config - 配置选项
   * @param {string} [config.basePath='./data/admin'] - 数据文件存储路径
   * @param {number} [config.cacheTTL=30000] - 缓存过期时间（毫秒）
   * @param {boolean} [config.prettyPrint=true] - 是否美化JSON输出
   */
  constructor(config = {}) {
    this.basePath = config.basePath || './data/admin';
    this.cacheTTL = config.cacheTTL || 30000;
    this.prettyPrint = config.prettyPrint !== false;

    // 数据缓存
    this.cache = new Map();
    // 文件锁（防止并发写入）
    this.fileLocks = new Map();
  }

  /**
   * 初始化存储适配器
   * 确保数据目录存在
   */
  async initialize() {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * 获取模型数据文件路径
   * @param {Object} model - 模型定义
   * @returns {string}
   */
  getFilePath(model) {
    const modelName = model.__name || model;
    return path.join(this.basePath, `${modelName}.json`);
  }

  /**
   * 加载模型数据
   * @param {Object} model - 模型定义
   * @returns {Promise<Array>}
   */
  async loadModelData(model) {
    const modelName = model.__name || model;
    const cacheKey = modelName;

    // 检查缓存
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.time < this.cacheTTL) {
      return cached.data;
    }

    // 读取文件
    const filePath = this.getFilePath(model);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      // 更新缓存
      this.cache.set(cacheKey, { data, time: Date.now() });

      return data;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // 文件不存在，返回空数组
        const emptyData = [];
        this.cache.set(cacheKey, { data: emptyData, time: Date.now() });
        return emptyData;
      }
      throw error;
    }
  }

  /**
   * 保存模型数据
   * @param {Object} model - 模型定义
   * @param {Array} data - 数据
   */
  async saveModelData(model, data) {
    const modelName = model.__name || model;
    const filePath = this.getFilePath(model);

    // 获取文件锁
    const lock = this.fileLocks.get(filePath);
    if (lock) {
      await lock;
    }

    // 创建写入Promise并设置锁
    const writePromise = this._writeFile(filePath, data);
    this.fileLocks.set(filePath, writePromise);

    try {
      await writePromise;
    } finally {
      this.fileLocks.delete(filePath);
    }

    // 更新缓存
    this.cache.set(modelName, { data, time: Date.now() });
  }

  /**
   * 写入文件
   * @param {string} filePath - 文件路径
   * @param {Array} data - 数据
   */
  async _writeFile(filePath, data) {
    const content = this.prettyPrint
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data);

    // 先写入临时文件，再重命名（原子操作）
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, content, 'utf-8');
    await fs.rename(tempPath, filePath);
  }

  /**
   * 清除模型缓存
   * @param {Object|string} model - 模型定义或模型名称
   */
  clearCache(model) {
    const modelName = model.__name || model;
    this.cache.delete(modelName);
  }

  /**
   * 清除所有缓存
   */
  clearAllCache() {
    this.cache.clear();
  }

  // ============================================
  // CRUD操作
  // ============================================

  /**
   * 查询单条记录
   * @param {Object} model - 模型定义
   * @param {Object} conditions - 查询条件
   * @returns {Promise<Object|null>}
   */
  async findOne(model, conditions) {
    const data = await this.loadModelData(model);
    return data.find(record => this.matchConditions(record, conditions)) || null;
  }

  /**
   * 查询多条记录
   * @param {Object} model - 模型定义
   * @param {Object} conditions - 查询条件
   * @param {Object} [options={}] - 查询选项
   * @returns {Promise<Array>}
   */
  async findMany(model, conditions, options = {}) {
    let data = await this.loadModelData(model);

    // 应用条件过滤
    data = data.filter(record => this.matchConditions(record, conditions));

    // 应用排序
    if (options.orderBy) {
      data = this.applySort(data, options.orderBy);
    }

    // 应用偏移和限制
    if (options.offset !== undefined) {
      data = data.slice(options.offset);
    }
    if (options.limit !== undefined) {
      data = data.slice(0, options.limit);
    }

    return data;
  }

  /**
   * 查询多条记录并返回总数
   * @param {Object} model - 模型定义
   * @param {Object} conditions - 查询条件
   * @param {Object} [options={}] - 查询选项
   * @returns {Promise<{records: Array, total: number}>}
   */
  async findManyWithCount(model, conditions, options = {}) {
    const allData = await this.loadModelData(model);

    // 应用条件过滤
    const filteredData = allData.filter(record => this.matchConditions(record, conditions));
    const total = filteredData.length;

    // 应用排序
    let data = filteredData;
    if (options.orderBy) {
      data = this.applySort(data, options.orderBy);
    }

    // 应用偏移和限制
    if (options.offset !== undefined) {
      data = data.slice(options.offset);
    }
    if (options.limit !== undefined) {
      data = data.slice(0, options.limit);
    }

    return { records: data, total };
  }

  /**
   * 统计记录数
   * @param {Object} model - 模型定义
   * @param {Object} conditions - 查询条件
   * @returns {Promise<number>}
   */
  async count(model, conditions) {
    const data = await this.loadModelData(model);
    return data.filter(record => this.matchConditions(record, conditions)).length;
  }

  /**
   * 创建记录
   * @param {Object} model - 模型定义
   * @param {Object} data - 数据
   * @returns {Promise<Object>}
   */
  async create(model, data) {
    const records = await this.loadModelData(model);

    // 确保有ID
    const record = {
      ...data,
      id: data.id || generateId(),
    };

    records.push(record);
    await this.saveModelData(model, records);

    return record;
  }

  /**
   * 更新记录
   * @param {Object} model - 模型定义
   * @param {string} id - 记录ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>}
   */
  async update(model, id, data) {
    const records = await this.loadModelData(model);
    const index = records.findIndex(r => r.id === id);

    if (index === -1) {
      throw new Error(`Record with id '${id}' not found`);
    }

    // 合并更新数据
    records[index] = {
      ...records[index],
      ...data,
      id, // 确保ID不被修改
    };

    await this.saveModelData(model, records);

    return records[index];
  }

  /**
   * 批量更新
   * @param {Object} model - 模型定义
   * @param {Object} conditions - 查询条件
   * @param {Object} data - 更新数据
   * @returns {Promise<number>} 更新的记录数
   */
  async updateMany(model, conditions, data) {
    const records = await this.loadModelData(model);
    let count = 0;

    for (let i = 0; i < records.length; i++) {
      if (this.matchConditions(records[i], conditions)) {
        records[i] = { ...records[i], ...data };
        count++;
      }
    }

    if (count > 0) {
      await this.saveModelData(model, records);
    }

    return count;
  }

  /**
   * 删除记录
   * @param {Object} model - 模型定义
   * @param {string} id - 记录ID
   * @returns {Promise<boolean>}
   */
  async delete(model, id) {
    const records = await this.loadModelData(model);
    const index = records.findIndex(r => r.id === id);

    if (index === -1) {
      return false;
    }

    records.splice(index, 1);
    await this.saveModelData(model, records);

    return true;
  }

  /**
   * 批量删除
   * @param {Object} model - 模型定义
   * @param {Object} conditions - 查询条件
   * @returns {Promise<number>} 删除的记录数
   */
  async deleteMany(model, conditions) {
    const records = await this.loadModelData(model);
    const filteredRecords = records.filter(r => !this.matchConditions(r, conditions));
    const count = records.length - filteredRecords.length;

    if (count > 0) {
      await this.saveModelData(model, filteredRecords);
    }

    return count;
  }

  // ============================================
  // 查询辅助方法
  // ============================================

  /**
   * 检查记录是否匹配条件
   * @param {Object} record - 记录
   * @param {Object} conditions - 条件
   * @returns {boolean}
   */
  matchConditions(record, conditions) {
    for (const [field, condition] of Object.entries(conditions)) {
      if (!this.matchCondition(record, field, condition)) {
        return false;
      }
    }
    return true;
  }

  /**
   * 检查单个条件
   * @param {Object} record - 记录
   * @param {string} field - 字段名
   * @param {*} condition - 条件值
   * @returns {boolean}
   */
  matchCondition(record, field, condition) {
    const value = record[field];

    // 处理操作符对象
    if (typeof condition === 'object' && condition !== null && !Array.isArray(condition)) {
      for (const [op, operand] of Object.entries(condition)) {
        if (!this.applyOperator(value, op, operand)) {
          return false;
        }
      }
      return true;
    }

    // 简单相等比较
    return value === condition;
  }

  /**
   * 应用操作符
   * @param {*} value - 字段值
   * @param {string} operator - 操作符
   * @param {*} operand - 操作数
   * @returns {boolean}
   */
  applyOperator(value, operator, operand) {
    switch (operator) {
      case '$eq':
        return value === operand;
      case '$ne':
        return value !== operand;
      case '$gt':
        return value > operand;
      case '$gte':
        return value >= operand;
      case '$lt':
        return value < operand;
      case '$lte':
        return value <= operand;
      case '$in':
        return Array.isArray(operand) && operand.includes(value);
      case '$nin':
        return Array.isArray(operand) && !operand.includes(value);
      case '$like':
        return typeof value === 'string' && value.includes(operand);
      case '$ilike':
        return typeof value === 'string' && value.toLowerCase().includes(operand.toLowerCase());
      case '$between':
        return Array.isArray(operand) && value >= operand[0] && value <= operand[1];
      case '$null':
        return value === null || value === undefined;
      case '$notnull':
        return value !== null && value !== undefined;
      case '$regex':
        return typeof value === 'string' && new RegExp(operand).test(value);
      default:
        return true;
    }
  }

  /**
   * 应用排序
   * @param {Array} data - 数据
   * @param {string|Object} orderBy - 排序规则
   * @returns {Array}
   */
  applySort(data, orderBy) {
    if (!orderBy) return data;

    const sortFields = typeof orderBy === 'string'
      ? [orderBy]
      : Object.entries(orderBy).map(([field, order]) => ({ field, order }));

    return data.sort((a, b) => {
      for (const sort of sortFields) {
        const field = typeof sort === 'string' ? sort.replace(/^-/, '') : sort.field;
        const order = typeof sort === 'string'
          ? (sort.startsWith('-') ? -1 : 1)
          : (sort.order === 'desc' ? -1 : 1);

        const aVal = a[field];
        const bVal = b[field];

        if (aVal < bVal) return -1 * order;
        if (aVal > bVal) return 1 * order;
      }
      return 0;
    });
  }
}

/**
 * 创建存储适配器
 * @param {Object} config - 配置
 * @returns {JSONStorageAdapter}
 */
export function createStorageAdapter(config = {}) {
  const adapter = new JSONStorageAdapter(config);
  return adapter;
}

export default JSONStorageAdapter;
