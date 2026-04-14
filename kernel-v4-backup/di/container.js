// hundunos/kernel/di/container.js
// 轻量级依赖注入容器

import 'reflect-metadata';

/**
 * 可构造类型
 * @template T
 * @typedef {new (...args: any[]) => T} Constructable
 */

/**
 * 服务标识符类型
 * @template T
 * @typedef {Constructable<T>} ServiceIdentifier
 */

/**
 * 元数据接口
 * @template T
 * @typedef {Object} Metadata
 * @property {T} [instance] - 实例
 * @property {Function} [factory] - 工厂函数
 */

/**
 * 服务注册选项
 * @template T
 * @typedef {Object} ServiceOptions
 * @property {Function} [factory] - 工厂函数
 * @property {boolean} [singleton] - 是否单例（默认 true）
 * @property {Function[]} [dependencies] - 依赖列表（用于工厂函数）
 */

/** @type {Map<ServiceIdentifier, Metadata>} */
const instances = new Map();

/**
 * DI 错误类
 */
class DIError extends Error {
  constructor(message) {
    super(`[DI] ${message}`);
    this.name = 'DIError';
  }
}

/**
 * 容器类
 */
class ContainerClass {
  /** @type {ServiceIdentifier[]} */
  resolutionStack = [];

  /**
   * 检查类型是否已注册
   * @template T
   * @param {ServiceIdentifier<T>} type - 类型构造函数
   * @returns {boolean} 是否已注册
   */
  has(type) {
    return instances.has(type);
  }

  /**
   * 获取或创建实例
   * @template T
   * @param {ServiceIdentifier<T>} type - 类型构造函数
   * @returns {T} 实例
   */
  get(type) {
    const metadata = instances.get(type);

    if (!metadata) {
      // 如果在解析依赖链中，允许返回 undefined
      if (this.resolutionStack.length > 0) {
        return undefined;
      }
      throw new DIError(`${type.name} is not registered in the container`);
    }

    // 如果已有实例，直接返回
    if (metadata.instance !== undefined) {
      return metadata.instance;
    }

    // 检测循环依赖：如果 type 已在解析栈中，说明出现了循环
    if (this.resolutionStack.includes(type)) {
      throw new DIError(
        `Circular dependency detected for ${type.name}.\n` +
        `Resolution stack: ${this.resolutionStack.map(t => t.name).join(' -> ')} -> ${type.name}`
      );
    }

    // 添加到解析栈
    this.resolutionStack.push(type);

    try {
      let instance;

      // 确定依赖列表
      let dependencies;
      if (metadata.dependencies && metadata.dependencies.length > 0) {
        // 使用注册时指定的依赖列表
        dependencies = metadata.dependencies.map((depType, index) => {
          if (depType === undefined) {
            throw new DIError(
              `Circular dependency detected in ${type.name} at index ${index}.\n` +
              `Resolution stack: ${this.resolutionStack.map(t => t.name).join(' -> ')}`
            );
          }
          return this.get(depType);
        });
      } else {
        // 使用构造函数参数类型元数据
        const paramTypes = Reflect.getMetadata('design:paramtypes', type) || [];
        dependencies = paramTypes.map((paramType, index) => {
          if (paramType === undefined) {
            throw new DIError(
              `Circular dependency detected in ${type.name} at index ${index}.\n` +
              `Resolution stack: ${this.resolutionStack.map(t => t.name).join(' -> ')}`
            );
          }
          return this.get(paramType);
        });
      }

      // 创建实例
      if (metadata.factory) {
        instance = metadata.factory(...dependencies);
      } else {
        instance = new type(...dependencies);
      }

      // 缓存实例
      instances.set(type, { ...metadata, instance });
      return instance;
    } catch (error) {
      if (error instanceof TypeError && error.message.toLowerCase().includes('abstract')) {
        throw new DIError(`${type.name} is an abstract class and cannot be instantiated`);
      }
      // 当循环依赖时工厂函数访问 undefined 属性会抛出 TypeError，将此类错误转换为 DIError
      if (error instanceof TypeError) {
        throw new DIError(
          `Circular dependency detected in ${type.name}.\n` +
          `Resolution stack: ${this.resolutionStack.map(t => t.name).join(' -> ')}`
        );
      }
      throw error;
    } finally {
      // 从解析栈中移除
      this.resolutionStack.pop();
    }
  }

  /**
   * 手动设置实例
   * @template T
   * @param {ServiceIdentifier<T>} type - 类型构造函数
   * @param {T} instance - 实例
   */
  set(type, instance) {
    const metadata = instances.get(type) || {};
    instances.set(type, { ...metadata, instance });
  }

  /**
   * 重置容器（清除所有实例）
   */
  reset() {
    for (const metadata of instances.values()) {
      delete metadata.instance;
    }
  }

  /**
   * 清空容器（清除所有注册）
   */
  clear() {
    instances.clear();
  }

  /**
   * 获取所有已注册的类型
   * @returns {ServiceIdentifier[]} 类型列表
   */
  getRegisteredTypes() {
    return Array.from(instances.keys());
  }

  /**
   * 获取容器统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      registeredTypes: instances.size,
      instantiatedTypes: Array.from(instances.values()).filter(m => m.instance !== undefined).length,
      resolutionDepth: this.resolutionStack.length
    };
  }
}

/**
 * 全局容器实例
 */
export const Container = new ContainerClass();

/**
 * 注册服务
 * @template T
 * @param {Constructable<T>} type - 类型构造函数
 * @param {ServiceOptions<T>} [options] - 注册选项
 * @returns {Constructable<T>} 类型构造函数
 */
export function registerService(type, options = {}) {
  const { factory, singleton = true, dependencies = [] } = options;

  instances.set(type, {
    factory,
    singleton,
    dependencies
  });

  return type;
}

/**
 * 注册单例服务
 * @template T
 * @param {Constructable<T>} type - 类型构造函数
 * @param {ServiceOptions<T>} [options] - 注册选项
 * @returns {Constructable<T>} 类型构造函数
 */
export function registerSingleton(type, options = {}) {
  return registerService(type, { ...options, singleton: true });
}

/**
 * 注册瞬时服务（每次获取都创建新实例）
 * 注意：当前实现不支持真正的瞬时服务，因为依赖注入需要缓存实例
 * 如果需要瞬时服务，请使用工厂函数
 * @template T
 * @param {Constructable<T>} type - 类型构造函数
 * @param {ServiceOptions<T>} [options] - 注册选项
 * @returns {Constructable<T>} 类型构造函数
 */
export function registerTransient(type, options = {}) {
  return registerService(type, { ...options, singleton: false });
}

/**
 * 注册值（常量）
 * @template T
 * @param {Constructable<T>} type - 类型构造函数
 * @param {T} value - 值
 * @returns {Constructable<T>} 类型构造函数
 */
export function registerValue(type, value) {
  instances.set(type, {
    instance: value,
    factory: () => value,
    singleton: true
  });

  return type;
}

/**
 * 注册工厂
 * @template T
 * @param {Constructable<T>} type - 类型构造函数
 * @param {Function} factory - 工厂函数
 * @param {Function[]} [dependencies] - 依赖列表
 * @returns {Constructable<T>} 类型构造函数
 */
export function registerFactory(type, factory, dependencies = []) {
  instances.set(type, {
    factory,
    singleton: true,
    dependencies
  });

  return type;
}

/**
 * 创建子容器（继承父容器的注册）
 * @returns {ContainerClass} 子容器
 */
export function createChildContainer() {
  const childContainer = new ContainerClass();

  // 复制父容器的注册
  for (const [type, metadata] of instances.entries()) {
    instances.set(type, { ...metadata });
  }

  return childContainer;
}

export { DIError };
