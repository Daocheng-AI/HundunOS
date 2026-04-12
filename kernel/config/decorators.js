// hundunos/kernel/config/decorators.js
// 配置装饰器实现

import 'reflect-metadata';
import { readFileSync } from 'fs';
import { z } from 'zod';

// eslint-disable-next-line @typescript-eslint/no-restricted-types
const Class = Function;
const PropertyKey = String | Symbol;
const PropertyType = Number | Boolean | String | Class;

/**
 * 属性元数据接口
 * @typedef {Object} PropertyMetadata
 * @property {PropertyType} type - 属性类型
 * @property {string} [envName] - 环境变量名称
 * @property {z.ZodType} [schema] - Zod 验证 schema
 */

/**
 * 全局元数据存储
 * @type {Map<Class, Map<PropertyKey, PropertyMetadata>>}
 */
const globalMetadata = new Map();

/**
 * 读取环境变量（支持 _FILE 后缀）
 * @param {string} envName - 环境变量名称
 * @returns {string|undefined} 环境变量值
 */
const readEnv = (envName) => {
  if (envName in process.env) return process.env[envName];

  // 如果定义了 _FILE 环境变量，从文件读取
  const filePath = process.env[`${envName}_FILE`];
  if (filePath) {
    try {
      const value = readFileSync(filePath, 'utf8');
      if (value !== value.trim()) {
        console.warn(
          `[HundunOS] Warning: The file specified by ${envName}_FILE contains leading or trailing whitespace, which may cause authentication failures.`
        );
      }
      return value;
    } catch (error) {
      console.error(`[HundunOS] Error reading file ${filePath}:`, error.message);
      return undefined;
    }
  }

  return undefined;
};

/**
 * 配置类装饰器
 * @param {Class} ConfigClass - 配置类
 * @returns {Class} 装饰后的类
 */
export const Config = (ConfigClass) => {
  const factory = function (...args) {
    const config = new ConfigClass(...args);
    const classMetadata = globalMetadata.get(ConfigClass);

    if (!classMetadata) {
      throw new Error(`Invalid config class: ${ConfigClass.name}`);
    }

    for (const [key, { type, envName, schema }] of classMetadata) {
      if (typeof type === 'function' && globalMetadata.has(type)) {
        // 嵌套配置类，递归创建实例
        config[key] = new type();
      } else if (envName) {
        // 环境变量映射
        const value = readEnv(envName);
        if (value === undefined) continue;

        if (schema) {
          // 使用 Zod schema 验证
          const result = schema.safeParse(value);
          if (result.error) {
            console.warn(
              `[HundunOS] Invalid value for ${envName} - ${result.error.issues[0].message}. Falling back to default value.`
            );
            continue;
          }
          config[key] = result.data;
        } else if (type === Number) {
          const parsed = Number(value);
          if (isNaN(parsed)) {
            console.warn(`[HundunOS] Invalid number value for ${envName}: ${value}`);
          } else {
            config[key] = parsed;
          }
        } else if (type === Boolean) {
          if (['true', '1'].includes(value.toLowerCase())) {
            config[key] = true;
          } else if (['false', '0'].includes(value.toLowerCase())) {
            config[key] = false;
          } else {
            console.warn(`[HundunOS] Invalid boolean value for ${envName}: ${value}`);
          }
        } else if (type === Date) {
          const timestamp = Date.parse(value);
          if (isNaN(timestamp)) {
            console.warn(`[HundunOS] Invalid timestamp value for ${envName}: ${value}`);
          } else {
            config[key] = new Date(timestamp);
          }
        } else if (type === String) {
          config[key] = value.trim().replace(/^(['"])(.*)\1$/, '$2');
        } else {
          // 自定义类型
          config[key] = new type(value);
        }
      }
    }

    // 调用 sanitize 方法（如果存在）
    if (typeof config.sanitize === 'function') {
      config.sanitize();
    }

    return config;
  };

  return factory(ConfigClass);
};

/**
 * 嵌套配置属性装饰器
 * @param {object} target - 目标对象
 * @param {PropertyKey} key - 属性键
 */
export const Nested = (target, key) => {
  const ConfigClass = target.constructor;
  const classMetadata = globalMetadata.get(ConfigClass) ?? new Map();
  const type = Reflect.getMetadata('design:type', target, key);
  classMetadata.set(key, { type });
  globalMetadata.set(ConfigClass, classMetadata);
};

/**
 * 环境变量属性装饰器
 * @param {string} envName - 环境变量名称
 * @param {z.ZodType} [schema] - 可选的 Zod 验证 schema
 * @returns {Function} 属性装饰器
 */
export const Env = (envName, schema) => {
  return (target, key) => {
    const ConfigClass = target.constructor;
    const classMetadata = globalMetadata.get(ConfigClass) ?? new Map();

    const type = Reflect.getMetadata('design:type', target, key);
    const isZodSchema = schema instanceof z.ZodType;

    if (type === Object && !isZodSchema) {
      throw new Error(
        `Invalid decorator metadata on key "${key}" on ${ConfigClass.name}. Please use explicit typing on all config fields.`
      );
    }

    classMetadata.set(key, { type, envName, schema });
    globalMetadata.set(ConfigClass, classMetadata);
  };
};

/**
 * 获取配置类的元数据
 * @param {Class} ConfigClass - 配置类
 * @returns {Map<PropertyKey, PropertyMetadata>|undefined} 元数据
 */
export const getConfigMetadata = (ConfigClass) => {
  return globalMetadata.get(ConfigClass);
};

/**
 * 清除配置类的元数据（主要用于测试）
 * @param {Class} ConfigClass - 配置类
 */
export const clearConfigMetadata = (ConfigClass) => {
  globalMetadata.delete(ConfigClass);
};
