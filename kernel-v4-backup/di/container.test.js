// hundunos/kernel/di/container.test.js
// 依赖注入容器单元测试

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  Container,
  registerService,
  registerFactory,
  registerValue,
  DIError
} from './container.js';

describe('DI Container', () => {
  let originalEnv;

  beforeEach(() => {
    // 清空容器
    Container.clear();
  });

  afterEach(() => {
    // 清空容器
    Container.clear();
  });

  describe('registerService', () => {
    it('should register a service', () => {
      class TestService {
        constructor() {
          this.value = 'test';
        }
      }

      registerService(TestService);
      expect(Container.has(TestService)).toBe(true);
    });

    it('should return the same instance for singletons', () => {
      class TestService {
        constructor() {
          this.value = 'test';
        }
      }

      registerService(TestService);
      const instance1 = Container.get(TestService);
      const instance2 = Container.get(TestService);

      expect(instance1).toBe(instance2);
    });
  });

  describe('registerFactory', () => {
    it('should register a factory function', () => {
      class TestService {
        constructor(value) {
          this.value = value;
        }
      }

      registerFactory(TestService, () => new TestService('factory'));
      const instance = Container.get(TestService);

      expect(instance).toBeInstanceOf(TestService);
      expect(instance.value).toBe('factory');
    });

    it('should resolve dependencies from factory', () => {
      class DependencyService {
        constructor() {
          this.name = 'dependency';
        }
      }

      class TestService {
        constructor(dependency) {
          this.dependency = dependency;
        }
      }

      registerService(DependencyService);
      registerFactory(
        TestService,
        (dep) => new TestService(dep),
        [DependencyService]
      );

      const instance = Container.get(TestService);

      expect(instance).toBeInstanceOf(TestService);
      expect(instance.dependency).toBeInstanceOf(DependencyService);
    });
  });

  describe('registerValue', () => {
    it('should register a value', () => {
      class TestService {
        constructor() {
          this.value = 'test';
        }
      }

      const value = new TestService();
      registerValue(TestService, value);

      const instance = Container.get(TestService);

      expect(instance).toBe(value);
    });
  });

  describe('Container.get', () => {
    it('should throw error for unregistered service', () => {
      class TestService {
        constructor() {
          this.value = 'test';
        }
      }

      expect(() => Container.get(TestService)).toThrow(DIError);
    });

    it('should return undefined for unregistered dependency', () => {
      class DependencyService {
        constructor() {
          this.name = 'dependency';
        }
      }

      class TestService {
        constructor(dependency) {
          this.dependency = dependency;
        }
      }

      registerFactory(
        TestService,
        (dep) => new TestService(dep),
        [DependencyService]
      );

      const instance = Container.get(TestService);

      expect(instance.dependency).toBeUndefined();
    });

    it('should detect circular dependencies', () => {
      class ServiceA {
        constructor(serviceB) {
          this.serviceB = serviceB;
        }
      }

      class ServiceB {
        constructor(serviceA) {
          this.serviceA = serviceA;
        }
      }

      registerFactory(ServiceA, (b) => new ServiceA(b), [ServiceB]);
      registerFactory(ServiceB, (a) => new ServiceB(a), [ServiceA]);

      expect(() => Container.get(ServiceA)).toThrow(DIError);
    });
  });

  describe('Container.has', () => {
    it('should return true for registered service', () => {
      class TestService {
        constructor() {
          this.value = 'test';
        }
      }

      registerService(TestService);
      expect(Container.has(TestService)).toBe(true);
    });

    it('should return false for unregistered service', () => {
      class TestService {
        constructor() {
          this.value = 'test';
        }
      }

      expect(Container.has(TestService)).toBe(false);
    });
  });

  describe('Container.set', () => {
    it('should manually set an instance', () => {
      class TestService {
        constructor() {
          this.value = 'test';
        }
      }

      const instance = new TestService();
      instance.value = 'custom';

      Container.set(TestService, instance);

      const retrieved = Container.get(TestService);
      expect(retrieved.value).toBe('custom');
    });
  });

  describe('Container.reset', () => {
    it('should clear all instances', () => {
      class TestService {
        constructor() {
          this.value = 'test';
        }
      }

      registerService(TestService);
      const instance1 = Container.get(TestService);

      Container.reset();

      const instance2 = Container.get(TestService);

      // 单例模式，reset 后应该返回不同的实例
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Container.clear', () => {
    it('should clear all registrations', () => {
      class TestService {
        constructor() {
          this.value = 'test';
        }
      }

      registerService(TestService);
      expect(Container.has(TestService)).toBe(true);

      Container.clear();

      expect(Container.has(TestService)).toBe(false);
    });
  });

  describe('Container.getStats', () => {
    it('should return container statistics', () => {
      class TestService {
        constructor() {
          this.value = 'test';
        }
      }

      registerService(TestService);
      const stats = Container.getStats();

      expect(stats.registeredTypes).toBe(1);
      expect(stats.instantiatedTypes).toBe(0);
      expect(stats.resolutionDepth).toBe(0);

      Container.get(TestService);

      const statsAfter = Container.getStats();
      expect(statsAfter.registeredTypes).toBe(1);
      expect(statsAfter.instantiatedTypes).toBe(1);
    });
  });
});
