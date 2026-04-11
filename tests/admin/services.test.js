/**
 * 服务层单元测试
 * @module tests/admin/services.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserService } from '../../infrastructure/admin/services/user.service.js';
import { RoleService } from '../../infrastructure/admin/services/role.service.js';
import { TaskService } from '../../infrastructure/admin/services/task.service.js';
import { SkillService } from '../../infrastructure/admin/services/skill.service.js';
import { LogService } from '../../infrastructure/admin/services/log.service.js';
import { ValidationException, UserException } from '../../infrastructure/admin/core/exceptions.js';
import { ErrorCodes } from '../../infrastructure/admin/core/response.js';

// Mock storage adapter
const createMockStorage = () => ({
  data: new Map(),
  
  async loadModelData(model) {
    return this.data.get(model.__name || model) || [];
  },
  
  async saveModelData(model, data) {
    this.data.set(model.__name || model, data);
  },
  
  async findOne(model, conditions) {
    const data = await this.loadModelData(model);
    return data.find(item => {
      for (const [key, value] of Object.entries(conditions)) {
        if (item[key] !== value) return false;
      }
      return true;
    }) || null;
  },
  
  async findMany(model, conditions, options = {}) {
    let data = await this.loadModelData(model);
    return data.filter(item => {
      for (const [key, value] of Object.entries(conditions)) {
        if (item[key] !== value) return false;
      }
      return true;
    });
  },
  
  async create(model, data) {
    const records = await this.loadModelData(model);
    const record = { ...data, id: data.id || `id-${Date.now()}` };
    records.push(record);
    await this.saveModelData(model, records);
    return record;
  },
  
  async update(model, id, data) {
    const records = await this.loadModelData(model);
    const index = records.findIndex(r => r.id === id);
    if (index === -1) throw new Error('Not found');
    records[index] = { ...records[index], ...data };
    await this.saveModelData(model, records);
    return records[index];
  },
  
  async delete(model, id) {
    const records = await this.loadModelData(model);
    const filtered = records.filter(r => r.id !== id);
    await this.saveModelData(model, filtered);
  },
  
  async count(model, conditions) {
    const data = await this.findMany(model, conditions);
    return data.length;
  },
  
  async findManyWithCount(model, conditions, options) {
    const records = await this.findMany(model, conditions, options);
    return { records, total: records.length };
  },
  
  async initialize() {},
});

// ============================================
// UserService 测试
// ============================================
describe('UserService', () => {
  let userService;
  let mockStorage;

  beforeEach(async () => {
    userService = new UserService();
    mockStorage = createMockStorage();
    await mockStorage.initialize();
    userService.setStorage(mockStorage);
  });

  it('should create user with hashed password', async () => {
    const user = await userService.create({
      username: 'testuser',
      password: 'Test@123',
      roleIds: ['role-1'],
    });
    
    expect(user.username).toBe('testuser');
    expect(user.password).not.toBe('Test@123'); // 密码应被加密
    expect(user.id).toBeDefined();
  });

  it('should reject duplicate username', async () => {
    await userService.create({
      username: 'testuser',
      password: 'Test@123',
      roleIds: ['role-1'],
    });
    
    await expect(userService.create({
      username: 'testuser',
      password: 'Test@456',
      roleIds: ['role-1'],
    })).rejects.toThrow();
  });

  it('should validate password strength', () => {
    expect(() => userService.validatePasswordStrength('weak')).toThrow();
    expect(() => userService.validatePasswordStrength('Test@123')).not.toThrow();
  });

  it('should authenticate user', async () => {
    await userService.create({
      username: 'testuser',
      password: 'Test@123',
      roleIds: ['role-1'],
    });
    
    const user = await userService.authenticate('testuser', 'Test@123');
    expect(user.username).toBe('testuser');
  });

  it('should reject wrong password', async () => {
    await userService.create({
      username: 'testuser',
      password: 'Test@123',
      roleIds: ['role-1'],
    });
    
    await expect(userService.authenticate('testuser', 'WrongPass')).rejects.toThrow();
  });
});

// ============================================
// RoleService 测试
// ============================================
describe('RoleService', () => {
  let roleService;
  let mockStorage;

  beforeEach(async () => {
    roleService = new RoleService();
    mockStorage = createMockStorage();
    await mockStorage.initialize();
    roleService.setStorage(mockStorage);
  });

  it('should create role', async () => {
    const role = await roleService.create({
      name: 'Admin',
      code: 'admin',
      level: 80,
      permissions: ['*'],
    });
    
    expect(role.name).toBe('Admin');
    expect(role.code).toBe('admin');
  });

  it('should reject duplicate role name', async () => {
    await roleService.create({
      name: 'Admin',
      code: 'admin',
      level: 80,
      permissions: [],
    });
    
    await expect(roleService.create({
      name: 'Admin',
      code: 'admin2',
      level: 70,
      permissions: [],
    })).rejects.toThrow();
  });
});

// ============================================
// TaskService 测试
// ============================================
describe('TaskService', () => {
  let taskService;
  let mockStorage;

  beforeEach(async () => {
    taskService = new TaskService();
    mockStorage = createMockStorage();
    await mockStorage.initialize();
    taskService.setStorage(mockStorage);
  });

  it('should create task with cron trigger', async () => {
    const task = await taskService.create({
      name: 'Daily Report',
      command: 'npm run report',
      triggerType: 'cron',
      triggerConfig: { expression: '0 0 * * *' },
    });
    
    expect(task.name).toBe('Daily Report');
    expect(task.triggerType).toBe('cron');
  });

  it('should validate trigger config', () => {
    expect(() => taskService.validateTriggerConfig('cron', {})).toThrow();
    expect(() => taskService.validateTriggerConfig('cron', { expression: '0 0 * * *' })).not.toThrow();
    expect(() => taskService.validateTriggerConfig('interval', { seconds: 60 })).not.toThrow();
  });
});

// ============================================
// LogService 测试
// ============================================
describe('LogService', () => {
  let logService;
  let mockStorage;

  beforeEach(async () => {
    logService = new LogService();
    mockStorage = createMockStorage();
    await mockStorage.initialize();
    logService.setStorage(mockStorage);
  });

  it('should create log entry', async () => {
    const log = await logService.log({
      module: '用户管理',
      operation: '创建用户',
      method: 'POST',
      url: '/api/admin/users',
      result: 'success',
      duration: 100,
      operatorName: 'admin',
      ip: '127.0.0.1',
    });
    
    expect(log.module).toBe('用户管理');
    expect(log.result).toBe('success');
  });

  it('should sanitize sensitive params', () => {
    const params = {
      username: 'test',
      password: 'secret123',
      token: 'abc123',
    };
    
    const sanitized = logService.sanitizeParams(params);
    
    expect(sanitized.username).toBe('test');
    expect(sanitized.password).toBe('******');
    expect(sanitized.token).toBe('******');
  });
});

// review: removed // review: removed console.log('✅ Service layer tests completed');
