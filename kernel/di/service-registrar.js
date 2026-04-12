// hundunos/kernel/di/service-registrar.js
// 服务注册器

import { Container, registerService, registerValue, registerFactory } from './container.js';
import { LoggerService } from './services/logger.service.js';
import { ConfigService } from './services/config.service.js';
import { KernelService } from './services/kernel.service.js';
import { GlobalConfig } from '../config/schema-config.js';

// 导出服务类
export { LoggerService } from './services/logger.service.js';
export { ConfigService } from './services/config.service.js';
export { KernelService } from './services/kernel.service.js';

/**
 * 注册所有核心服务
 */
export function registerCoreServices() {
  // 1. 注册配置服务
  registerService(ConfigService);

  // 2. 注册日志服务（使用工厂函数，依赖配置服务）
  registerFactory(
    LoggerService,
    (configService) => {
      const config = GlobalConfig.create();
      return new LoggerService({
        level: config.logging.level,
        format: config.logging.format,
        colors: config.logging.colors
      });
    },
    [ConfigService]
  );

  // 3. 注册内核服务（使用工厂函数，依赖日志服务和配置服务）
  registerFactory(
    KernelService,
    (loggerService, configService) => {
      return new KernelService(loggerService, configService);
    },
    [LoggerService, ConfigService]
  );

  console.log('[DI] Core services registered successfully');
}

/**
 * 获取服务实例
 * @template T
 * @param {Function} ServiceClass - 服务类
 * @returns {T} 服务实例
 */
export function getService(ServiceClass) {
  return Container.get(ServiceClass);
}

/**
 * 手动设置服务实例
 * @template T
 * @param {Function} ServiceClass - 服务类
 * @param {T} instance - 服务实例
 */
export function setService(ServiceClass, instance) {
  Container.set(ServiceClass, instance);
}

/**
 * 检查服务是否已注册
 * @template T
 * @param {Function} ServiceClass - 服务类
 * @returns {boolean} 是否已注册
 */
export function hasService(ServiceClass) {
  return Container.has(ServiceClass);
}

/**
 * 重置容器（清除所有实例）
 */
export function resetContainer() {
  Container.reset();
}

/**
 * 获取容器统计信息
 * @returns {Object} 统计信息
 */
export function getContainerStats() {
  return Container.getStats();
}

/**
 * 获取所有已注册的服务类型
 * @returns {Function[]} 服务类型列表
 */
export function getRegisteredServices() {
  return Container.getRegisteredTypes();
}
