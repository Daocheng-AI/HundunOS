// hundunos/kernel/config/config-loader.test.js
// 配置加载器测试

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigLoader, GlobalConfig } from './config-loader.js';

describe('ConfigLoader', () => {
  let originalEnv;

  beforeEach(() => {
    // 保存原始环境变量
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // 恢复原始环境变量
    process.env = originalEnv;
  });

  describe('load', () => {
    it('should load config with decorator values when env vars are set', () => {
      process.env.NODE_ENV = 'development';
      process.env.HUNDUNOS_LOG_LEVEL = 'debug';
      process.env.HUNDUNOS_DEBUG = 'true';
      process.env.REST_API_PORT = '38080';

      const config = ConfigLoader.load('.', 'development');

      expect(config.environment).toBe('development');
      expect(config.kernel.logLevel).toBe('debug');
      expect(config.kernel.debug).toBe(true);
      expect(config.restApi.port).toBe(38080);
      expect(config.configSource).toBe('decorators');
    });

    it('should fallback to JSON config when no env vars are set', () => {
      // 清除相关环境变量
      delete process.env.HUNDUNOS_LOG_LEVEL;
      delete process.env.HUNDUNOS_DEBUG;
      delete process.env.REST_API_PORT;

      const config = ConfigLoader.load('.', 'development');

      expect(config.environment).toBe('development');
      expect(config.configSource).not.toBe('none');
      expect(config.loadedAt).toBeDefined();
    });

    it('should merge decorator and JSON configs', () => {
      process.env.NODE_ENV = 'development';
      process.env.HUNDUNOS_LOG_LEVEL = 'debug';

      const config = ConfigLoader.load('.', 'development');

      expect(config.configSource).toBe('mixed' || 'decorators');
      expect(config.kernel.logLevel).toBe('debug');
    });
  });

  describe('_loadDecoratorConfig', () => {
    it('should create GlobalConfig instance', () => {
      const config = ConfigLoader._loadDecoratorConfig('development');

      expect(config).toBeDefined();
      expect(config.version).toBeDefined();
      expect(config.name).toBeDefined();
      expect(config.kernel).toBeDefined();
      expect(config.modelRouter).toBeDefined();
      expect(config.restApi).toBeDefined();
      expect(config.storage).toBeDefined();
    });

    it('should use default values when env vars are not set', () => {
      delete process.env.HUNDUNOS_LOG_LEVEL;
      delete process.env.HUNDUNOS_DEBUG;

      const config = ConfigLoader._loadDecoratorConfig('development');

      expect(config.kernel.logLevel).toBe('info');
      expect(config.kernel.debug).toBe(false);
    });
  });

  describe('getConfigStats', () => {
    it('should return config statistics', () => {
      process.env.NODE_ENV = 'development';
      const config = ConfigLoader.load('.', 'development');
      const stats = ConfigLoader.getConfigStats(config);

      expect(stats.environment).toBe('development');
      expect(stats.version).toBeDefined();
      expect(stats.configSource).toBeDefined();
      expect(stats.loadedAt).toBeDefined();
    });
  });

  describe('createEnvTemplate', () => {
    it('should create production env template', () => {
      const template = ConfigLoader.createEnvTemplate('production');

      expect(template.NODE_ENV).toBe('production');
      expect(template.HUNDUNOS_LOG_LEVEL).toBe('info');
      expect(template.HUNDUNOS_DEBUG).toBe('false');
      expect(template.LOGGING_LEVEL).toBe('info');
      expect(template.LOGGING_FORMAT).toBe('json');
      expect(template.LOGGING_STRUCTURED).toBe('true');
      expect(template.REST_API_RATE_LIMIT_ENABLED).toBe('true');
      expect(template.STORAGE_ENCRYPT_BACKUPS).toBe('true');
    });

    it('should create development env template', () => {
      const template = ConfigLoader.createEnvTemplate('development');

      expect(template.NODE_ENV).toBe('development');
      expect(template.HUNDUNOS_LOG_LEVEL).toBe('debug');
      expect(template.HUNDUNOS_DEBUG).toBe('true');
      expect(template.LOGGING_LEVEL).toBe('debug');
      expect(template.LOGGING_FORMAT).toBe('pretty');
      expect(template.LOGGING_COLORS).toBe('true');
      expect(template.REST_API_RATE_LIMIT_ENABLED).toBe('false');
      expect(template.SKILLS_HOT_RELOAD).toBe('true');
    });

    it('should create testing env template', () => {
      const template = ConfigLoader.createEnvTemplate('testing');

      expect(template.NODE_ENV).toBe('testing');
      expect(template.HUNDUNOS_LOG_LEVEL).toBe('warn');
      expect(template.HUNDUNOS_DEBUG).toBe('false');
      expect(template.LOGGING_LEVEL).toBe('warn');
      expect(template.LOGGING_FORMAT).toBe('simple');
      expect(template.MODEL_ROUTER_STRATEGY).toBe('MOCK');
      expect(template.MODEL_ROUTER_LOCAL_FIRST).toBe('false');
    });
  });
});

describe('GlobalConfig', () => {
  it('should create a valid config instance', () => {
    const config = GlobalConfig();

    expect(config.version).toBeDefined();
    expect(config.name).toBeDefined();
    expect(config.environment).toBeDefined();
    expect(config.kernel).toBeDefined();
    expect(config.modelRouter).toBeDefined();
    expect(config.restApi).toBeDefined();
    expect(config.storage).toBeDefined();
  });
});
