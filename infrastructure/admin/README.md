# HundunOS Admin Dashboard

基于 FastapiAdmin 设计模式的管理后台系统。

## 核心特性

- **泛型CRUD基类**：统一数据操作接口，减少70%重复代码
- **模型混入模式**：自动添加审计字段（创建时间、更新时间等）
- **依赖注入容器**：清晰的依赖管理，提高可测试性
- **统一响应封装**：标准化API响应格式
- **全局异常处理**：统一错误处理和错误码体系
- **完整中间件链**：认证、权限、审计日志、限流

## 目录结构

```
infrastructure/admin/
├── core/                    # 核心基础设施
│   ├── response.js          # 统一响应封装
│   ├── exceptions.js        # 全局异常处理
│   ├── base-model.js        # 模型混入基类
│   ├── dependencies.js      # 依赖注入容器
│   └── base-crud.js         # 泛型CRUD基类
├── storage/                 # 存储层
│   └── json-adapter.js      # JSON文件存储适配器
├── models/                  # 数据模型
│   ├── user.model.js        # 用户模型
│   ├── role.model.js        # 角色模型
│   ├── task.model.js        # 任务模型
│   ├── log.model.js         # 操作日志模型
│   └── skill.model.js       # Skill模型
├── services/                # 服务层
│   ├── user.service.js      # 用户服务
│   ├── role.service.js      # 角色服务
│   ├── task.service.js      # 任务服务
│   ├── skill.service.js     # Skill服务
│   └── log.service.js       # 日志服务
└── api/middlewares/         # 中间件
    ├── auth.js              # 认证中间件
    ├── permission.js        # 权限中间件
    ├── audit-log.js         # 审计日志中间件
    └── rate-limit.js        # 限流中间件
```

## 快速开始

### 初始化

```javascript
import { initializeAdmin } from './infrastructure/admin/index.js';

// 初始化Admin模块
const admin = await initializeAdmin(kernel, {
  storage: { basePath: './data/admin' },
  auth: { secret: process.env.JWT_SECRET || 'YOUR_JWT_SECRET_HERE' }
});

const { services, storage } = admin;
```

### 使用服务

```javascript
const { userService, roleService } = services;

// 创建用户
const user = await userService.create({
  username: 'test',
  pwd: 'PLACEHOLDER',  // ⚠️ 必填：请替换为实际强密码
  roleIds: ['role-id']
});

// 分页查询
const { list, total } = await userService.page(
  { status: 'active' },
  { page: 1, pageSize: 20 }
);

// 更新用户
await userService.update(user.id, { nickname: 'New Name' });
```

### 使用中间件

```javascript
import { createAuthMiddleware, requirePermission, auditLogMiddleware } from './infrastructure/admin/index.js';

// 认证中间件
app.use(createAuthMiddleware({ secret: process.env.JWT_SECRET || 'your-secret' }));

// 权限中间件
app.delete('/api/admin/users/:id', 
  requirePermission('admin:user:delete'),
  userController.delete
);

// 审计日志中间件
app.use(auditLogMiddleware);
```

## API响应格式

所有API响应使用统一格式：

```json
{
  "code": 0,
  "msg": "success",
  "data": { ... },
  "success": true,
  "timestamp": 1234567890000
}
```

分页响应：

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "list": [...],
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "totalPages": 5,
    "hasMore": true
  },
  "success": true,
  "timestamp": 1234567890000
}
```

## 错误码

| 范围 | 类型 |
|------|------|
| 0 | 成功 |
| 1-99 | 通用错误 |
| 100-199 | 验证错误 |
| 200-299 | 认证错误 |
| 300-399 | 权限错误 |
| 1000-1099 | 用户错误 |
| 1100-1199 | 角色错误 |
| 1200-1299 | 任务错误 |
| 1300-1399 | Skill错误 |

## 借鉴 FastapiAdmin 的设计模式

| 模式 | 说明 |
|------|------|
| CRUDBase | 泛型CRUD基类，统一数据操作 |
| ModelMixin | 模型混入，自动添加审计字段 |
| Depends | 依赖注入，清晰管理依赖 |
| ResponseSchema | 统一响应封装 |
| Exception | 全局异常处理体系 |

## License

MIT
