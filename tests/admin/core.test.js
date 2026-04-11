/**
 * 核心模块单元测试
 * @module tests/admin/core.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ResponseSchema, ErrorCodes } from '../../infrastructure/admin/core/response.js';
import { AppException, ValidationException, PermissionException, NotFoundException } from '../../infrastructure/admin/core/exceptions.js';
import { createModel, ModelMixin, UserMixin, validateModel, generateId } from '../../infrastructure/admin/core/base-model.js';
import { DependencyContainer } from '../../infrastructure/admin/core/dependencies.js';
import { CRUDBase, QueryOperators } from '../../infrastructure/admin/core/base-crud.js';

// ============================================
// ResponseSchema 测试
// ============================================
describe('ResponseSchema', () => {
  it('should create success response', () => {
    const data = { id: 1, name: 'test' };
    const response = ResponseSchema.success(data);
    
    expect(response.code).toBe(0);
    expect(response.msg).toBe('success');
    expect(response.data).toEqual(data);
    expect(response.success).toBe(true);
    expect(response.timestamp).toBeDefined();
  });

  it('should create error response', () => {
    const response = ResponseSchema.error(ErrorCodes.USER_EXISTS, 'User already exists');
    
    expect(response.code).toBe(ErrorCodes.USER_EXISTS);
    expect(response.msg).toBe('User already exists');
    expect(response.success).toBe(false);
  });

  it('should create paginated response', () => {
    const list = [{ id: 1 }, { id: 2 }];
    const response = ResponseSchema.paginated(list, 100, 1, 20);
    
    expect(response.data.list).toEqual(list);
    expect(response.data.total).toBe(100);
    expect(response.data.page).toBe(1);
    expect(response.data.pageSize).toBe(20);
    expect(response.data.totalPages).toBe(5);
    expect(response.data.hasMore).toBe(true);
  });

  it('should create validation error response', () => {
    const errors = [{ field: 'name', message: 'Required' }];
    const response = ResponseSchema.validationError(errors);
    
    expect(response.code).toBe(ErrorCodes.VALIDATION_ERROR);
    expect(response.data.errors).toEqual(errors);
  });
});

// ============================================
// Exception 测试
// ============================================
describe('Exceptions', () => {
  it('should create AppException', () => {
    const exception = new AppException(100, 'Test error', { detail: 'info' });
    
    expect(exception.code).toBe(100);
    expect(exception.message).toBe('Test error');
    expect(exception.details).toEqual({ detail: 'info' });
    expect(exception.timestamp).toBeDefined();
  });

  it('should convert to response', () => {
    const exception = new ValidationException([{ field: 'name', message: 'Required' }]);
    const response = exception.toResponse();
    
    expect(response.code).toBe(ErrorCodes.VALIDATION_ERROR);
    expect(response.success).toBe(false);
  });

  it('should create NotFoundException', () => {
    const exception = new NotFoundException('User', '123');
    
    expect(exception.code).toBe(ErrorCodes.NOT_FOUND);
    expect(exception.message).toContain('User');
    expect(exception.message).toContain('123');
  });
});

// ============================================
// Model 测试
// ============================================
describe('Model', () => {
  it('should create model with mixins', () => {
    const TestModel = createModel('Test', {
      name: { type: 'string', required: true },
      age: { type: 'number' },
    }, ModelMixin, UserMixin);
    
    expect(TestModel.__name).toBe('Test');
    expect(TestModel.name).toBeDefined();
    expect(TestModel.id).toBeDefined();
    expect(TestModel.createdTime).toBeDefined();
    expect(TestModel.createdBy).toBeDefined();
  });

  it('should validate model correctly', () => {
    const TestModel = createModel('Test', {
      name: { type: 'string', required: true, min: 2, max: 10 },
      age: { type: 'number', min: 0, max: 150 },
      email: { type: 'string', format: 'email' },
    }, ModelMixin);
    
    // 有效数据
    const validResult = validateModel({ name: 'test', age: 25 }, TestModel);
    expect(validResult.valid).toBe(true);
    expect(validResult.errors).toHaveLength(0);
    
    // 缺少必填字段
    const missingResult = validateModel({}, TestModel);
    expect(missingResult.valid).toBe(false);
    expect(missingResult.errors.length).toBeGreaterThan(0);
  });

  it('should generate valid UUID', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});

// ============================================
// DependencyContainer 测试
// ============================================
describe('DependencyContainer', () => {
  let container;

  beforeEach(() => {
    container = new DependencyContainer();
  });

  it('should register and resolve dependency', async () => {
    container.register('test', () => ({ value: 123 }));
    const result = await container.resolve('test');
    
    expect(result.value).toBe(123);
  });

  it('should cache singleton', async () => {
    let callCount = 0;
    container.singleton('test', () => {
      callCount++;
      return { value: callCount };
    });
    
    await container.resolve('test');
    await container.resolve('test');
    
    expect(callCount).toBe(1);
  });

  it('should resolve dependencies', async () => {
    container.register('a', () => 1);
    container.register('b', async (deps) => deps.a + 1, ['a']);
    
    const result = await container.resolve('b');
    expect(result).toBe(2);
  });

  it('should detect circular dependency', async () => {
    container.register('a', async (deps) => deps.b, ['b']);
    container.register('b', async (deps) => deps.a, ['a']);
    
    await expect(container.resolve('a')).rejects.toThrow('Circular dependency');
  });
});

// ============================================
// CRUDBase 测试
// ============================================
describe('CRUDBase', () => {
  it('should build query conditions', () => {
    const model = { __name: 'Test' };
    const crud = new CRUDBase(model);
    
    const query = crud.buildQuery({
      name: 'test',
      age: ['gt', 18],
      status: ['in', ['active', 'pending']],
    });
    
    expect(query.name).toBe('test');
    expect(query.age).toEqual({ $gt: 18 });
    expect(query.status).toEqual({ $in: ['active', 'pending'] });
  });

  it('should support query operators', () => {
    expect(QueryOperators.EQ).toBe('eq');
    expect(QueryOperators.GT).toBe('gt');
    expect(QueryOperators.IN).toBe('in');
    expect(QueryOperators.LIKE).toBe('like');
    expect(QueryOperators.BETWEEN).toBe('between');
  });
});

// review: removed // review: removed console.log('✅ Core module tests completed');
