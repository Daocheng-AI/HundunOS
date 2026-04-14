# Mixin 架构 (v4.1)

## 概述

HundunOS v4.1 采用 MixinFactory 组合模式，将原本 ~1720 行的 `core.js` 巨石拆分为职责单一的 Mixin 类，通过 `MixinFactory.create()` 组合为 `CoreKernelV4`。

## 文件结构

```
kernel/
  core.js          ← Facade（15行），导出 CoreKernelV4
  core.v4.js       ← Mixin 组合入口
  mixins/
    MixinFactory.js   ← Mixin 组合工厂
    CoreMixin.js      ← 核心状态/生命周期
    ModuleMixin.js    ← 20+ 模块初始化（Phase 1-9）
    ProcessMixin.js   ← 消息处理管线
    SessionMixin.js   ← 会话管理
    RestMixin.js      ← REST API + Hook 系统
    index.js          ← 统一导出
```

## MixinFactory

```javascript
import { MixinFactory } from './MixinFactory.js';
import { CoreMixin } from './CoreMixin.js';
import { ModuleMixin } from './ModuleMixin.js';
import { ProcessMixin } from './ProcessMixin.js';
import { SessionMixin } from './SessionMixin.js';
import { RestMixin } from './RestMixin.js';

const CoreKernelV4 = MixinFactory.create(
  CoreMixin,
  ModuleMixin,
  ProcessMixin,
  SessionMixin,
  RestMixin
);
```

### 组合原理

1. `MixinFactory.create()` 创建 `CoreKernelBase`（空类）
2. 遍历每个 Mixin，通过 `Object.getOwnPropertyDescriptors(Mixin.prototype)` 获取方法
3. 过滤掉 `constructor`，将所有方法复制到 `CoreKernelBase.prototype`
4. Mixin 的字段（实例属性）需要额外处理

### Mixin 编写规范

每个 Mixin 必须：
- 是 ES6 Class
- 定义 `async init(kernel)` 方法（MixinFactory 验证要求）
- 方法内调用 `this.init_modules(kernel)` 等具体实现方法
- 使用 `pathToFileURL()` + `_r()` helper 处理动态 `import()`

```javascript
import { pathToFileURL } from 'url';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const _r = (subPath) => pathToFileURL(join(ROOT, subPath)).href;

export const MyMixin = class MyMixin {
    // MixinFactory 验证要求的方法
    async init(kernel) { return this.init_my_feature(kernel); }

    // 具体实现
    async init_my_feature(kernel) {
        const { MyModule } = await import(_r('my/module/index.js'));
        kernel.myModule = new MyModule(kernel);
    }
};
```

## 各 Mixin 职责

| Mixin | 职责 | 关键方法 |
|-------|------|---------|
| CoreMixin | 状态管理、生命周期、Facade | `initialize()`, `shutdown()`, `getStatus()` |
| ModuleMixin | 20+ 模块初始化编排 | `init_modules()`, `_initPhase1-8()` |
| ProcessMixin | 消息处理管线 | `process()`, `_routeMessage()` |
| SessionMixin | 会话管理 | `createSession()`, `getSession()`, `endSession()` |
| RestMixin | REST API + Hook 系统 | `init_rest_api()`, `_handleRestRequest()`, `_routeRest()` |

## 初始化顺序

```
kernel.initialize()
  1. init_platform(this)      ← CoreMixin
  2. init_modules(this)       ← ModuleMixin（Phase 1-8）
  3. init_hooks(this)         ← RestMixin
  4. init_rest_api(this)      ← RestMixin
```

## Windows ESM 注意事项

Node.js ESM 动态 `import()` 在 Windows 上需要 `file://` URL 格式：

```javascript
// ❌ 错误：Windows 绝对路径
await import('C:\\Users\\...\\module.js')

// ✅ 正确：file:// URL
import { pathToFileURL } from 'url';
await import(pathToFileURL('C:\\Users\\...\\module.js').href)
```

Mixin 中使用 `_r()` helper 统一处理：
```javascript
const _r = (subPath) => pathToFileURL(join(ROOT, subPath)).href;
```
