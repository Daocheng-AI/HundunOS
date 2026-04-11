# HundunOS Skill 模板指南

**版本**: v1.0  
**更新日期**: 2026-04-07

---

## 概述

Skill 是 HundunOS 的功能扩展单元。每个 Skill 可以：
- 监听特定关键词或模式
- 处理特定类型的任务
- 提供专用工具或功能

---

## Skill 目录结构

```
skill-name/
├── SKILL.md           # Skill 定义文件（必需）
├── handler.js         # 处理逻辑（必需）
├── schema.js          # 类型定义（可选）
├── config.json        # 配置文件（可选）
├── README.md          # 说明文档（可选）
└── assets/            # 静态资源（可选）
    ├── icon.svg
    └── templates/
```

---

## SKILL.md 结构

```yaml
---
name: skill-name
version: 1.0.0
description: 简短描述技能的功能
author: your-name
tags:
  - tag1
  - tag2
triggers:
  keywords:
    - 关键词1
    - 关键词2
  patterns:
    - "正则表达式模式"
  intents:
    - intent-type
permissions:
  - filesystem
  - network
config:
  enabled: true
  autoLoad: true
---
```

---

## 完整示例

### 1. 创建 SKILL.md

```yaml
---
name: file-organizer
version: 1.0.0
description: 智能文件整理技能，按类型自动归类文件
author: hundunos
tags:
  - 文件管理
  - 整理
  - 自动化
triggers:
  keywords:
    - 整理文件
    - 文件整理
    - 归类文件
  patterns:
    - "^(整理|归类).*[文件|桌面]$"
  intents:
    - task
permissions:
  - filesystem
config:
  enabled: true
  autoLoad: true
  mode: "type"  # type | date | size
---

# File Organizer Skill

智能文件整理技能。

## 使用方式

- "整理桌面文件"
- "按类型归类文件"
- "整理下载文件夹"
```

### 2. 创建 handler.js

```javascript
// handler.js - File Organizer Skill

export const SKILL_NAME = 'file-organizer';

export async function handle(intent, context) {
    const { content, params } = intent;
    const targetPath = params?.targetPath || context.cwd;
    const mode = params?.mode || 'type';
    
    // 执行文件整理逻辑
    const result = await organizeFiles(targetPath, mode);
    
    return {
        success: true,
        message: `已整理 ${result.moved} 个文件`,
        details: result
    };
}

async function organizeFiles(targetPath, mode) {
    // 实现文件整理逻辑
    const files = await scanDirectory(targetPath);
    const categories = {};
    
    for (const file of files) {
        const category = getCategory(file, mode);
        if (!categories[category]) {
            categories[category] = [];
        }
        categories[category].push(file);
        await moveFile(file, targetPath, category);
    }
    
    return {
        moved: files.length,
        categories: Object.keys(categories).length
    };
}

function getCategory(file, mode) {
    // 根据模式分类文件
    const ext = file.ext.toLowerCase();
    
    const typeMap = {
        images: ['.jpg', '.png', '.gif', '.svg'],
        documents: ['.doc', '.pdf', '.txt', '.md'],
        code: ['.js', '.py', '.java', '.rs'],
        // ...
    };
    
    for (const [category, extensions] of Object.entries(typeMap)) {
        if (extensions.includes(ext)) {
            return category;
        }
    }
    
    return 'others';
}

export default { handle, SKILL_NAME };
```

### 3. 创建 schema.js（可选）

```javascript
// schema.js - Skill Schema Definitions

export const SKILL_TYPE = 'file-organizer';

export const PARAMETERS = {
    input: {
        type: 'object',
        properties: {
            targetPath: {
                type: 'string',
                description: '要整理的目录路径'
            },
            mode: {
                type: 'string',
                enum: ['type', 'date', 'size'],
                default: 'type'
            }
        },
        required: ['targetPath']
    },
    output: {
        type: 'object',
        properties: {
            success: { type: 'boolean' },
            moved: { type: 'number' },
            categories: { type: 'object' }
        }
    }
};
```

---

## 标准 Skill 格式 (hundunos-skill-v1)

参考 `extension-modules/skills/schema.js` 的标准格式：

```json
{
  "schema": "hundunos-skill-v1",
  "info": {
    "name": "skill-name",
    "version": "1.0.0",
    "description": "技能描述",
    "author": "author@example.com",
    "tags": ["tag1", "tag2"]
  },
  "triggers": {
    "keywords": ["关键词1", "关键词2"],
    "patterns": ["正则模式"],
    "intents": ["intent-type"]
  },
  "config": {
    "enabled": true,
    "autoLoad": true,
    "timeout": 30000,
    "retry": 0
  },
  "parameters": {
    "input": {
      "type": "object",
      "properties": {}
    },
    "output": {
      "type": "object"
    }
  },
  "handler": {
    "type": "javascript",
    "entry": "./handler.js"
  },
  "permissions": {
    "requires": ["filesystem"],
    "level": "normal"
  }
}
```

---

## 最佳实践

### 1. 错误处理

```javascript
export async function handle(intent, context) {
    try {
        // 业务逻辑
        const result = await doSomething(intent);
        return { success: true, data: result };
    } catch (error) {
        console.error(`[${SKILL_NAME}] Error:`, error);
        return {
            success: false,
            error: error.message,
            code: error.code || 'UNKNOWN_ERROR'
        };
    }
}
```

### 2. 日志记录

```javascript
import { logger } from '@hundunos/logger';

export async function handle(intent, context) {
    logger.info(`[${SKILL_NAME}] Processing intent:`, intent.id);
    
    // ... 业务逻辑
    
    logger.info(`[${SKILL_NAME}] Completed:`, {
        intentId: intent.id,
        duration: Date.now() - startTime
    });
}
```

### 3. 性能优化

```javascript
export async function handle(intent, context) {
    // 使用缓存
    const cacheKey = `skill:${SKILL_NAME}:${intent.id}`;
    const cached = await context.cache.get(cacheKey);
    if (cached) {
        return cached;
    }
    
    // 业务逻辑
    const result = await process(intent);
    
    // 缓存结果
    await context.cache.set(cacheKey, result, { ttl: 300 });
    
    return result;
}
```

### 4. 超时控制

```javascript
export async function handle(intent, context) {
    const timeout = context.config?.timeout || 30000;
    
    const result = await Promise.race([
        doLongRunningTask(intent),
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), timeout)
        )
    ]);
    
    return result;
}
```

---

## 测试 Skill

```javascript
// __tests__/file-organizer.test.js

import { handle, SKILL_NAME } from '../handler';

describe(SKILL_NAME, () => {
    it('should organize files by type', async () => {
        const intent = {
            content: '整理桌面',
            params: {
                targetPath: '/tmp/test',
                mode: 'type'
            }
        };
        
        const result = await handle(intent, {
            cwd: '/tmp/test'
        });
        
        expect(result.success).toBe(true);
        expect(result.moved).toBeGreaterThan(0);
    });
});
```

---

## 发布 Skill

1. 确保所有测试通过
2. 更新版本号
3. 添加更新日志
4. 创建 Pull Request

---

## 参考

- Skill Schema: `extension-modules/skills/schema.js`
- 已有 Skill 示例: `extension-modules/skills/`