/**
 * API文档
 * @module docs/admin/api
 */

# HundunOS Admin API 文档

## 概述

- **Base URL**: `/api/admin`
- **认证方式**: JWT Token 或 API Key
- **响应格式**: JSON

## 认证

### 请求头

```
Authorization: Bearer <jwt_token>
```

或

```
X-Api-Key: <api_key>
```

---

## 认证接口

### POST /auth/login

用户登录

**请求体**:
```json
{
  "username": "string",
  "password": "string"
}
```

**响应**:
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "user": {
      "id": "string",
      "username": "string",
      "nickname": "string",
      "isSuperAdmin": false
    },
    "accessToken": "string",
    "refreshToken": "string",
    "expiresIn": 1800000
  }
}
```

### POST /auth/logout

用户登出

### POST /auth/refresh

刷新Token

**请求体**:
```json
{
  "refreshToken": "string"
}
```

### GET /auth/profile

获取当前用户信息

### PUT /auth/password

修改密码

**请求体**:
```json
{
  "oldPassword": "string",
  "newPassword": "string"
}
```

---

## 用户管理接口

### GET /users

获取用户列表

**查询参数**:
- `page`: 页码 (默认: 1)
- `pageSize`: 每页条数 (默认: 20, 最大: 100)
- `orderBy`: 排序字段
- `status`: 状态过滤

**响应**:
```json
{
  "code": 0,
  "data": {
    "list": [...],
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "totalPages": 5
  }
}
```

### GET /users/:id

获取用户详情

### POST /users

创建用户

**请求体**:
```json
{
  "username": "string",
  "password": "string",
  "nickname": "string",
  "email": "string",
  "roleIds": ["string"]
}
```

### PUT /users/:id

更新用户

### DELETE /users/:id

删除用户

### PUT /users/:id/password

重置密码

**请求体**:
```json
{
  "newPassword": "string"
}
```

### PUT /users/:id/status

更新状态

**请求体**:
```json
{
  "status": "active|inactive|disabled"
}
```

### PUT /users/:id/roles

分配角色

**请求体**:
```json
{
  "roleIds": ["string"]
}
```

---

## 角色管理接口

### GET /roles

获取角色列表

### GET /roles/all

获取所有角色（下拉选择用）

### GET /roles/:id

获取角色详情

### POST /roles

创建角色

**请求体**:
```json
{
  "name": "string",
  "code": "string",
  "level": 50,
  "permissions": ["string"],
  "dataScope": 1
}
```

### PUT /roles/:id

更新角色

### DELETE /roles/:id

删除角色

### GET /roles/:id/users

获取角色关联用户

### PUT /roles/:id/permissions

更新权限

**请求体**:
```json
{
  "permissions": ["admin:user:list", "admin:user:read"]
}
```

### GET /roles/permissions/tree

获取权限树

---

## 任务管理接口

### GET /tasks

获取任务列表

### GET /tasks/:id

获取任务详情

### POST /tasks

创建任务

**请求体**:
```json
{
  "name": "string",
  "command": "string",
  "triggerType": "cron|interval|date|manual",
  "triggerConfig": {
    "expression": "0 0 * * *"
  }
}
```

### PUT /tasks/:id

更新任务

### DELETE /tasks/:id

删除任务

### PUT /tasks/:id/enable

启用任务

### PUT /tasks/:id/disable

禁用任务

### POST /tasks/:id/execute

手动执行任务

### GET /tasks/:id/logs

获取执行日志

---

## Skill管理接口

### GET /skills

获取Skill列表

### GET /skills/:id

获取Skill详情

### PUT /skills/:id

更新Skill

### PUT /skills/:id/enable

启用Skill

### PUT /skills/:id/disable

禁用Skill

### GET /skills/market

获取Skill市场列表

### POST /skills/install

安装Skill

**请求体**:
```json
{
  "name": "string",
  "source": "market",
  "version": "1.0.0"
}
```

### DELETE /skills/:id

卸载Skill

---

## 日志管理接口

### GET /logs/operation

获取操作日志列表

**查询参数**:
- `page`, `pageSize`, `orderBy`
- `startTime`: 开始时间
- `endTime`: 结束时间
- `module`: 模块过滤
- `operatorId`: 操作人过滤
- `result`: 结果过滤 (success/failure)

### GET /logs/operation/:id

获取操作日志详情

### GET /logs/system

获取系统日志列表

### GET /logs/export

导出日志

**查询参数**:
- `format`: 导出格式 (json/csv)

### GET /logs/stats

获取日志统计

---

## 监控接口

### GET /monitor/system

获取系统状态

**响应**:
```json
{
  "code": 0,
  "data": {
    "cpu": { "cores": 8, "model": "..." },
    "memory": {
      "total": 16777216,
      "free": 8388608,
      "usagePercent": "50.00"
    },
    "os": {
      "platform": "darwin",
      "type": "Darwin"
    }
  }
}
```

### GET /monitor/kernel

获取内核状态

### GET /monitor/metrics

获取监控指标

### GET /monitor/realtime

获取实时数据

### GET /monitor/health

健康检查（无需认证）

---

## 错误码

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 1-99 | 通用错误 |
| 100-199 | 验证错误 |
| 200-299 | 认证错误 |
| 300-399 | 权限错误 |
| 404 | 资源不存在 |
| 1001 | 用户名已存在 |
| 1003 | 密码强度不足 |
| 1101 | 角色名已存在 |
| 1102 | 角色正在使用 |
| 1203 | 任务正在执行 |
| 1205 | Cron表达式无效 |

---

## 数据权限范围

| 值 | 说明 |
|----|------|
| 1 | 仅本人数据 |
| 2 | 本部门数据 |
| 3 | 本部门及子级数据 |
| 4 | 全部数据 |
| 5 | 自定义数据范围 |

---

## 权限标识

权限格式: `admin:{module}:{action}`

示例:
- `admin:user:list` - 用户列表
- `admin:user:create` - 创建用户
- `admin:role:update-permissions` - 更新角色权限
- `admin:task:execute` - 执行任务
- `admin:log:export` - 导出日志

超级管理员拥有权限 `*`，可执行所有操作。
