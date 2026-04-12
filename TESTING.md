# HundunOS 测试框架

HundunOS 使用 Vitest 作为测试框架，提供快速的单元测试和集成测试支持。

## 安装

```bash
npm install --save-dev vitest
```

## 配置

测试配置位于 `vitest.config.js`：

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js', 'kernel/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60
      }
    }
  }
});
```

## 运行测试

```bash
# 运行所有测试
npm test

# 监听模式
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

## 编写测试

### 基本测试

```javascript
import { describe, it, expect } from 'vitest';

describe('MyService', () => {
  it('should do something', () => {
    const result = myService.doSomething();
    expect(result).toBe('expected value');
  });
});
```

### 异步测试

```javascript
import { describe, it, expect } from 'vitest';

describe('MyService', () => {
  it('should handle async operations', async () => {
    const result = await myService.doSomethingAsync();
    expect(result).toBe('expected value');
  });
});
```

### 设置和清理

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('MyService', () => {
  let service;

  beforeEach(() => {
    service = new MyService();
  });

  afterEach(() => {
    service.cleanup();
  });

  it('should do something', () => {
    const result = service.doSomething();
    expect(result).toBe('expected value');
  });
});
```

### Mock 和 Spy

```javascript
import { describe, it, expect, vi } from 'vitest';

describe('MyService', () => {
  it('should call dependency', () => {
    const mockDependency = vi.fn().mockReturnValue('mocked value');
    const service = new MyService(mockDependency);

    service.doSomething();

    expect(mockDependency).toHaveBeenCalled();
    expect(mockDependency).toHaveBeenCalledWith('expected arg');
  });
});
```

## 测试文件位置

- 单元测试: `kernel/**/*.test.js`
- 集成测试: `tests/**/*.test.js`
- E2E 测试: `tests/e2e/**/*.test.js`

## 测试覆盖率

目标覆盖率：
- 行覆盖率: 60%
- 函数覆盖率: 60%
- 分支覆盖率: 60%
- 语句覆盖率: 60%

## 最佳实践

1. **测试独立性**: 每个测试应该独立运行
2. **描述性名称**: 使用清晰的测试名称
3. **AAA 模式**: Arrange, Act, Assert
4. **Mock 外部依赖**: 使用 mock 隔离外部依赖
5. **测试边界情况**: 测试正常和异常情况
