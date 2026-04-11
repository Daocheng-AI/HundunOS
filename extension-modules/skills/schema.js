/**
 * HundunOS Skill 标准格式定义 v1.0
 * 参考 MiniMax-AI/skills 设计
 * 
 * 技能文件格式: skill.json
 */

// ============================================================================
// Skill Schema
// ============================================================================

/**
 * 标准 Skill JSON 结构:
 * {
 *   "schema": "hundunos-skill-v1",
 *   "info": {
 *     "name": "skill-name",
 *     "version": "1.0.0",
 *     "description": "技能描述",
 *     "author": "author@example.com",
 *     "tags": ["tag1", "tag2"]
 *   },
 *   "triggers": {
 *     "keywords": ["关键词1", "关键词2"],
 *     "patterns": ["regex pattern"],
 *     "intents": ["intent-type"]
 *   },
 *   "config": {
 *     "enabled": true,
 *     "autoLoad": true,
 *     "timeout": 30000,
 *     "retry": 0
 *   },
 *   "parameters": {
 *     "input": {
 *       "type": "object",
 *       "properties": {
 *         "query": { "type": "string", "required": true }
 *       }
 *     },
 *     "output": {
 *       "type": "object"
 *     }
 *   },
 *   "handler": {
 *     "type": "javascript|external|workflow",
 *     "entry": "./handler.js | http://...",
 *     "env": {
 *       "KEY": "value"
 *     }
 *   },
 *   "permissions": {
 *     "requires": ["network", "filesystem"],
 *     "level": "normal|elevated|system"
 *   }
 * }
 */

// ============================================================================
// 示例: 文件整理技能
// ============================================================================

/*
{
  "schema": "hundunos-skill-v1",
  "info": {
    "name": "file-organizer",
    "version": "1.0.0",
    "description": "智能文件整理技能，按类型自动归类文件",
    "author": "hundunos",
    "tags": ["文件管理", "整理", "自动化"]
  },
  "triggers": {
    "keywords": ["整理文件", "文件整理", "归类文件", "整理桌面"],
    "patterns": ["^(整理|归类).*[文件|桌面]$"],
    "intents": ["task"]
  },
  "config": {
    "enabled": true,
    "autoLoad": true,
    "timeout": 60000,
    "retry": 2
  },
  "parameters": {
    "input": {
      "type": "object",
      "properties": {
        "targetPath": { "type": "string", "description": "要整理的目录路径" },
        "mode": { "type": "string", "enum": ["type", "date", "size"], "default": "type" }
      },
      "required": ["targetPath"]
    },
    "output": {
      "type": "object",
      "properties": {
        "success": { "type": "boolean" },
        "moved": { "type": "number" },
        "categories": { "type": "object" }
      }
    }
  },
  "handler": {
    "type": "javascript",
    "entry": "./skills/file-organizer.js"
  },
  "permissions": {
    "requires": ["filesystem"],
    "level": "normal"
  }
}
*/

// ============================================================================
// 类型定义
// ============================================================================

export const SKILL_SCHEMA_VERSION = 'hundunos-skill-v1';

export const SKILL_TYPES = {
    JAVASCRIPT: 'javascript',     // 本地 JS handler
    EXTERNAL: 'external',          // 外部服务 (HTTP/RPC)
    WORKFLOW: 'workflow',          // 工作流组合
    BUILTIN: 'builtin'             // 内置技能
};

export const PERMISSION_LEVELS = {
    NORMAL: 'normal',              // 普通权限
    ELEVATED: 'elevated',          // 需提升权限
    SYSTEM: 'system'               // 系统级权限
};

// ============================================================================
// 验证函数
// ============================================================================

/**
 * 验证 Skill JSON 结构
 */
export function validateSkill(skillJson) {
    const errors = [];

    // 检查 schema
    if (!skillJson.schema) {
        errors.push('Missing schema field');
    } else if (skillJson.schema !== SKILL_SCHEMA_VERSION) {
        errors.push(`Invalid schema version: ${skillJson.schema}`);
    }

    // 检查 info
    if (!skillJson.info) {
        errors.push('Missing info section');
    } else {
        if (!skillJson.info.name) errors.push('Missing info.name');
        if (!skillJson.info.version) errors.push('Missing info.version');
    }

    // 检查 triggers
    if (!skillJson.triggers) {
        errors.push('Missing triggers section');
    } else if (!skillJson.triggers.keywords && !skillJson.triggers.patterns) {
        errors.push('At least one trigger type required');
    }

    // 检查 handler
    if (!skillJson.handler) {
        errors.push('Missing handler section');
    } else if (!skillJson.handler.type || !skillJson.handler.entry) {
        errors.push('Handler must have type and entry');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * 导出兼容格式
 */
export function toLegacyFormat(skillJson) {
    return {
        id: skillJson.info.name,
        name: skillJson.info.name,
        version: skillJson.info.version,
        description: skillJson.info.description,
        keywords: skillJson.triggers?.keywords || [],
        metadata: {
            author: skillJson.info.author,
            tags: skillJson.info.tags,
            schema: skillJson.schema
        },
        handler: skillJson.handler
    };
}