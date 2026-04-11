/**
 * 泛型CRUD基类模块
 * 借鉴 FastapiAdmin 的 CRUDBase 设计模式
 * @module infrastructure/admin/core/base-crud
 */

import { NotFoundException, ValidationException, ConflictException } from './exceptions.js';
import { ErrorCodes } from './response.js';
import { addAuditFields, validateModel, generateId, getCurrentTime } from './base-model.js';

/**
 * 查询操作符
 */
export const QueryOperators = {
  EQ: 'eq',           // 等于
  NE: 'ne',           // 不等于
  GT: 'gt',           // 大于
  GTE: 'gte',         // 大于等于
  LT: 'lt',           // 小于
  LTE: 'lte',         // 小于等于
  IN: 'in',           // 包含
  NIN: 'nin',         // 不包含
  LIKE: 'like',       // 模糊匹配
  ILIKE: 'ilike',     // 不区分大小写模糊匹配
  BETWEEN: 'between', // 范围
  NULL: 'null',       // 为空
  NOTNULL: 'notnull', // 不为空
  REGEX: 'regex',     // 正则匹配
};

/**
 * 泛型CRUD基类
 * 提供统一的数据操作接口
 */
export class CRUDBase {
  /**
   * @param {Object} model - 数据模型定义
   * @param {Object} [options={}] - 配置选项
   * @param {Object} [options.storage] - 存储适配器
   * @param {string} [options.primaryKey='id'] - 主键字段名
   * @param {boolean} [options.softDelete=true] - 是否启用软删除
   * @param {boolean} [options.timestamps=true] - 是否自动添加时间戳
   */
  constructor(model, options = {}) {
    this.model = model;
    this.modelName = model.__name || 'Unknown';
    this.options = {
      primaryKey: 'id',
      softDelete: true,
      timestamps: true,
      ...options,
    };

    // 存储适配器（延迟注入）
    this._storage = options.storage || null;
  }

  /**
   * 获取存储适配器
   * @returns {Object}
   */
  get storage() {
    if (!this._storage) {
      throw new Error('Storage adapter not set. Call setStorage() first.');
    }
    return this._storage;
  }

  /**
   * 设置存储适配器
   * @param {Object} storage - 存储适配器
   */
  setStorage(storage) {
    this._storage = storage;
  }

  // ============================================
  // 查询方法
  // ============================================

  /**
   * 根据条件获取单条记录
   * @param {Object} conditions - 查询条件
   * @param {Object} [options={}] - 查询选项
   * @param {Array<string>} [options.preload=[]] - 预加载关联
   * @param {Array<string>} [options.fields] - 返回字段
   * @returns {Promise<Object|null>}
   */
  async get(conditions, options = {}) {
    const { preload = [], fields } = options;

    // 构建查询条件
    const query = this.buildQuery(conditions);

    // 执行查询
    let record = await this.storage.findOne(this.model, query);

    if (!record) {
      return null;
    }

    // 检查软删除
    if (this.options.softDelete && record.status === 'deleted') {
      return null;
    }

    // 预加载关联
    if (preload.length > 0) {
      record = await this.preloadRelations(record, preload);
    }

    // 字段投影
    if (fields) {
      record = this.projectFields(record, fields);
    }

    return record;
  }

  /**
   * 根据ID获取单条记录
   * @param {string} id - 记录ID
   * @param {Object} [options={}] - 查询选项
   * @returns {Promise<Object>}
   * @throws {NotFoundException} 记录不存在时抛出异常
   */
  async getById(id, options = {}) {
    const record = await this.get({ [this.options.primaryKey]: id }, options);
    if (!record) {
      throw new NotFoundException(this.modelName, id);
    }
    return record;
  }

  /**
   * 根据条件获取多条记录
   * @param {Object} [conditions={}] - 查询条件
   * @param {Object} [options={}] - 查询选项
   * @param {string|Object} [options.orderBy] - 排序
   * @param {Array<string>} [options.preload=[]] - 预加载关联
   * @param {number} [options.limit] - 限制数量
   * @param {Array<string>} [options.fields] - 返回字段
   * @returns {Promise<Array>}
   */
  async list(conditions = {}, options = {}) {
    const { orderBy, preload = [], limit, fields } = options;

    // 构建查询条件
    let query = this.buildQuery(conditions);

    // 添加软删除过滤
    if (this.options.softDelete) {
      query = { ...query, status: { $ne: 'deleted' } };
    }

    // 执行查询
    let records = await this.storage.findMany(this.model, query, { orderBy, limit });

    // 预加载关联
    if (preload.length > 0) {
      records = await Promise.all(
        records.map(record => this.preloadRelations(record, preload))
      );
    }

    // 字段投影
    if (fields) {
      records = records.map(record => this.projectFields(record, fields));
    }

    return records;
  }

  /**
   * 分页查询
   * @param {Object} [conditions={}] - 查询条件
   * @param {Object} [options={}] - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.pageSize=20] - 每页条数
   * @param {string|Object} [options.orderBy] - 排序
   * @param {Array<string>} [options.preload=[]] - 预加载关联
   * @param {Array<string>} [options.fields] - 返回字段
   * @returns {Promise<{list: Array, total: number, page: number, pageSize: number, totalPages: number}>}
   */
  async page(conditions = {}, options = {}) {
    let {
      page = 1,
      pageSize = 20,
      orderBy,
      preload = [],
      fields,
    } = options;

    // 参数校验
    page = Math.max(1, parseInt(page, 10));
    pageSize = Math.min(100, Math.max(1, parseInt(pageSize, 10)));

    // 构建查询条件
    let query = this.buildQuery(conditions);

    // 添加软删除过滤
    if (this.options.softDelete) {
      query = { ...query, status: { $ne: 'deleted' } };
    }

    // 计算偏移量
    const offset = (page - 1) * pageSize;

    // 执行查询
    const { records, total } = await this.storage.findManyWithCount(
      this.model,
      query,
      { offset, limit: pageSize, orderBy }
    );

    // 预加载关联
    let list = records;
    if (preload.length > 0) {
      list = await Promise.all(
        records.map(record => this.preloadRelations(record, preload))
      );
    }

    // 字段投影
    if (fields) {
      list = list.map(record => this.projectFields(record, fields));
    }

    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 获取树形结构数据
   * @param {Object} [conditions={}] - 查询条件
   * @param {Object} [options={}] - 查询选项
   * @param {string} [options.parentField='parentId'] - 父ID字段
   * @param {string} [options.childrenField='children'] - 子节点字段
   * @returns {Promise<Array>}
   */
  async treeList(conditions = {}, options = {}) {
    const { parentField = 'parentId', childrenField = 'children' } = options;

    // 获取所有记录
    const records = await this.list(conditions, options);

    // 构建树形结构
    const buildTree = (items, parentId = null) => {
      return items
        .filter(item => item[parentField] === parentId)
        .map(item => ({
          ...item,
          [childrenField]: buildTree(items, item.id),
        }));
    };

    return buildTree(records);
  }

  /**
   * 统计记录数
   * @param {Object} [conditions={}] - 查询条件
   * @returns {Promise<number>}
   */
  async count(conditions = {}) {
    let query = this.buildQuery(conditions);

    if (this.options.softDelete) {
      query = { ...query, status: { $ne: 'deleted' } };
    }

    return this.storage.count(this.model, query);
  }

  /**
   * 检查记录是否存在
   * @param {Object} conditions - 查询条件
   * @returns {Promise<boolean>}
   */
  async exists(conditions) {
    const count = await this.count(conditions);
    return count > 0;
  }

  // ============================================
  // 创建方法
  // ============================================

  /**
   * 创建记录
   * @param {Object} data - 数据
   * @param {Object} [options={}] - 选项
   * @param {string} [options.userId] - 当前用户ID
   * @returns {Promise<Object>}
   */
  async create(data, options = {}) {
    // 验证数据
    const validation = validateModel(data, this.model, { partial: false });
    if (!validation.valid) {
      throw new ValidationException(validation.errors);
    }

    // 添加审计字段
    const record = addAuditFields(data, this.model, {
      userId: options.userId,
      isUpdate: false,
    });

    // 执行创建前钩子
    await this.beforeCreate(record, options);

    // 执行创建
    const created = await this.storage.create(this.model, record);

    // 执行创建后钩子
    await this.afterCreate(created, options);

    return created;
  }

  /**
   * 批量创建
   * @param {Array<Object>} dataList - 数据列表
   * @param {Object} [options={}] - 选项
   * @returns {Promise<Array<Object>>}
   */
  async createMany(dataList, options = {}) {
    const results = [];
    for (const data of dataList) {
      results.push(await this.create(data, options));
    }
    return results;
  }

  // ============================================
  // 更新方法
  // ============================================

  /**
   * 更新记录
   * @param {string} id - 记录ID
   * @param {Object} data - 更新数据
   * @param {Object} [options={}] - 选项
   * @param {string} [options.userId] - 当前用户ID
   * @returns {Promise<Object>}
   */
  async update(id, data, options = {}) {
    // 检查记录是否存在
    const existing = await this.getById(id);

    // 验证数据
    const validation = validateModel(data, this.model, { partial: true });
    if (!validation.valid) {
      throw new ValidationException(validation.errors);
    }

    // 添加审计字段
    const updateData = addAuditFields(data, this.model, {
      userId: options.userId,
      isUpdate: true,
    });

    // 执行更新前钩子
    await this.beforeUpdate(id, updateData, existing, options);

    // 执行更新
    const updated = await this.storage.update(this.model, id, updateData);

    // 执行更新后钩子
    await this.afterUpdate(updated, existing, options);

    return updated;
  }

  /**
   * 根据条件更新
   * @param {Object} conditions - 查询条件
   * @param {Object} data - 更新数据
   * @param {Object} [options={}] - 选项
   * @returns {Promise<number>} 更新的记录数
   */
  async updateWhere(conditions, data, options = {}) {
    const query = this.buildQuery(conditions);
    const updateData = addAuditFields(data, this.model, {
      userId: options.userId,
      isUpdate: true,
    });

    return this.storage.updateMany(this.model, query, updateData);
  }

  /**
   * 批量更新
   * @param {Array<string>} ids - ID列表
   * @param {Object} data - 更新数据
   * @param {Object} [options={}] - 选项
   * @returns {Promise<Array<Object>>}
   */
  async updateMany(ids, data, options = {}) {
    const results = [];
    for (const id of ids) {
      results.push(await this.update(id, data, options));
    }
    return results;
  }

  // ============================================
  // 删除方法
  // ============================================

  /**
   * 删除记录
   * @param {string} id - 记录ID
   * @param {Object} [options={}] - 选项
   * @param {boolean} [options.force=false] - 强制删除（忽略软删除）
   * @param {string} [options.userId] - 当前用户ID
   * @returns {Promise<boolean>}
   */
  async delete(id, options = {}) {
    const { force = false, userId } = options;

    // 检查记录是否存在
    const existing = await this.getById(id);

    // 执行删除前钩子
    await this.beforeDelete(id, existing, options);

    let result;
    if (this.options.softDelete && !force) {
      // 软删除
      result = await this.storage.update(this.model, id, {
        status: 'deleted',
        deletedTime: getCurrentTime(),
        deletedBy: userId,
      });
    } else {
      // 硬删除
      result = await this.storage.delete(this.model, id);
    }

    // 执行删除后钩子
    await this.afterDelete(id, existing, options);

    return true;
  }

  /**
   * 批量删除
   * @param {Array<string>} ids - ID列表
   * @param {Object} [options={}] - 选项
   * @returns {Promise<number>} 删除的记录数
   */
  async deleteMany(ids, options = {}) {
    let count = 0;
    for (const id of ids) {
      await this.delete(id, options);
      count++;
    }
    return count;
  }

  /**
   * 根据条件删除
   * @param {Object} conditions - 查询条件
   * @param {Object} [options={}] - 选项
   * @returns {Promise<number>} 删除的记录数
   */
  async deleteWhere(conditions, options = {}) {
    const records = await this.list(conditions, { fields: ['id'] });
    return this.deleteMany(records.map(r => r.id), options);
  }

  /**
   * 恢复软删除的记录
   * @param {string} id - 记录ID
   * @param {Object} [options={}] - 选项
   * @returns {Promise<Object>}
   */
  async restore(id, options = {}) {
    const record = await this.storage.findOne(this.model, { id });
    if (!record || record.status !== 'deleted') {
      throw new NotFoundException(this.modelName, id);
    }

    return this.storage.update(this.model, id, {
      status: 'active',
      deletedTime: null,
      deletedBy: null,
    });
  }

  // ============================================
  // 辅助方法
  // ============================================

  /**
   * 构建查询条件
   * @param {Object} conditions - 原始条件
   * @returns {Object} 构建后的查询条件
   */
  buildQuery(conditions) {
    const query = {};

    for (const [field, value] of Object.entries(conditions)) {
      // 跳过空值
      if (value === undefined || value === null) continue;

      // 处理操作符格式: { field: ['operator', value] }
      if (Array.isArray(value) && value.length === 2) {
        const [operator, operand] = value;
        query[field] = this.buildOperatorQuery(operator, operand);
      }
      // 处理对象格式: { field: { $op: value } }
      else if (typeof value === 'object' && !Array.isArray(value)) {
        query[field] = value;
      }
      // 简单相等
      else {
        query[field] = value;
      }
    }

    return query;
  }

  /**
   * 构建操作符查询
   * @param {string} operator - 操作符
   * @param {*} value - 值
   * @returns {Object}
   */
  buildOperatorQuery(operator, value) {
    const opMap = {
      [QueryOperators.EQ]: '$eq',
      [QueryOperators.NE]: '$ne',
      [QueryOperators.GT]: '$gt',
      [QueryOperators.GTE]: '$gte',
      [QueryOperators.LT]: '$lt',
      [QueryOperators.LTE]: '$lte',
      [QueryOperators.IN]: '$in',
      [QueryOperators.NIN]: '$nin',
      [QueryOperators.LIKE]: '$like',
      [QueryOperators.ILIKE]: '$ilike',
      [QueryOperators.BETWEEN]: '$between',
      [QueryOperators.NULL]: '$null',
      [QueryOperators.NOTNULL]: '$notnull',
      [QueryOperators.REGEX]: '$regex',
    };

    const mongoOp = opMap[operator];
    if (!mongoOp) {
      throw new Error(`Unknown query operator: ${operator}`);
    }

    return { [mongoOp]: value };
  }

  /**
   * 预加载关联
   * @param {Object} record - 记录
   * @param {Array<string>} relations - 关联列表
   * @returns {Promise<Object>}
   */
  async preloadRelations(record, relations) {
    // 子类实现具体预加载逻辑
    return record;
  }

  /**
   * 字段投影
   * @param {Object} record - 记录
   * @param {Array<string>} fields - 字段列表
   * @returns {Object}
   */
  projectFields(record, fields) {
    const result = {};
    for (const field of fields) {
      if (field in record) {
        result[field] = record[field];
      }
    }
    return result;
  }

  // ============================================
  // 生命周期钩子
  // ============================================

  /**
   * 创建前钩子
   * @param {Object} record - 记录
   * @param {Object} options - 选项
   */
  async beforeCreate(record, options) {
    // 子类可重写
  }

  /**
   * 创建后钩子
   * @param {Object} record - 创建的记录
   * @param {Object} options - 选项
   */
  async afterCreate(record, options) {
    // 子类可重写
  }

  /**
   * 更新前钩子
   * @param {string} id - 记录ID
   * @param {Object} data - 更新数据
   * @param {Object} existing - 现有记录
   * @param {Object} options - 选项
   */
  async beforeUpdate(id, data, existing, options) {
    // 子类可重写
  }

  /**
   * 更新后钩子
   * @param {Object} updated - 更新后的记录
   * @param {Object} existing - 更新前的记录
   * @param {Object} options - 选项
   */
  async afterUpdate(updated, existing, options) {
    // 子类可重写
  }

  /**
   * 删除前钩子
   * @param {string} id - 记录ID
   * @param {Object} existing - 现有记录
   * @param {Object} options - 选项
   */
  async beforeDelete(id, existing, options) {
    // 子类可重写
  }

  /**
   * 删除后钩子
   * @param {string} id - 记录ID
   * @param {Object} existing - 被删除的记录
   * @param {Object} options - 选项
   */
  async afterDelete(id, existing, options) {
    // 子类可重写
  }
}

export default CRUDBase;
