/**
 * @jest-environment node
 * 
 * skill-validator.test.js
 * 测试 PromptHub 移植的 Skill 验证器
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
    validateSkillName,
    getSkillNameError,
    parseSkillMd,
    validateSkillMd,
    validateSkillDef,
    validateSkillPackage,
    sanitizeImportedSkillDraft,
    SKILL_NAME_REGEX,
} from '../kernel/skills/skill-validator.js';

// ================================================================
// Skill 名称验证
// ================================================================

describe('validateSkillName', () => {
    it('应接受有效的 kebab-case 名称', () => {
        expect(validateSkillName('my-skill')).toBe(true);
        expect(validateSkillName('github-helper')).toBe(true);
        expect(validateSkillName('a')).toBe(true);
        expect(validateSkillName('skill-123')).toBe(true);
        expect(validateSkillName('my-skill-v2')).toBe(true);
    });

    it('应拒绝大写字母', () => {
        expect(validateSkillName('MySkill')).toBe(false);
        expect(validateSkillName('my-Skill')).toBe(false);
        expect(validateSkillName('MY-SKILL')).toBe(false);
    });

    it('应拒绝连续连字符', () => {
        expect(validateSkillName('skill--test')).toBe(false);
        expect(validateSkillName('my---skill')).toBe(false);
    });

    it('应拒绝开头/结尾连字符', () => {
        expect(validateSkillName('-invalid')).toBe(false);
        expect(validateSkillName('invalid-')).toBe(false);
        expect(validateSkillName('-both-')).toBe(false);
    });

    it('应拒绝特殊字符', () => {
        expect(validateSkillName('skill_name')).toBe(false);
        expect(validateSkillName('skill.name')).toBe(false);
        expect(validateSkillName('skill@name')).toBe(false);
        expect(validateSkillName('skill name')).toBe(false);
    });

    it('应拒绝超长名称（>64字符）', () => {
        const longName = 'a'.repeat(65);
        expect(validateSkillName(longName)).toBe(false);
    });

    it('应接受 64 字符名称', () => {
        const maxName = 'a'.repeat(64);
        expect(validateSkillName(maxName)).toBe(true);
    });

    it('应拒绝空名称', () => {
        expect(validateSkillName('')).toBe(false);
    });
});

describe('getSkillNameError', () => {
    it('应返回 null 对于有效名称', () => {
        expect(getSkillNameError('my-skill')).toBe(null);
    });

    it('应返回详细错误信息', () => {
        expect(getSkillNameError('MySkill')).toContain('lowercase');
        expect(getSkillNameError('-invalid')).toContain('start or end');
        expect(getSkillNameError('skill--test')).toContain('consecutive');
        expect(getSkillNameError('a'.repeat(65))).toContain('64 characters');
    });
});

// ================================================================
// SKILL.md 解析
// ================================================================

describe('parseSkillMd', () => {
    const validSkillMd = `---
name: github-helper
version: 2.0.0
description: GitHub operations via gh CLI
author: HundunOS
tags: [github, git, cli]
---

## Instructions

You are a GitHub assistant.

### Available Tools
- create_issue
- create_pr
`;

    it('应正确解析 frontmatter', () => {
        const result = parseSkillMd(validSkillMd);
        expect(result).not.toBeNull();
        expect(result.frontmatter.name).toBe('github-helper');
        expect(result.frontmatter.version).toBe('2.0.0');
        expect(result.frontmatter.description).toBe('GitHub operations via gh CLI');
        expect(result.frontmatter.author).toBe('HundunOS');
        expect(result.frontmatter.tags).toEqual(['github', 'git', 'cli']);
    });

    it('应正确解析 body', () => {
        const result = parseSkillMd(validSkillMd);
        expect(result.body).toContain('## Instructions');
        expect(result.body).toContain('GitHub assistant');
    });

    it('应处理无 frontmatter 的内容', () => {
        const result = parseSkillMd('Just some content without frontmatter');
        expect(result.frontmatter).toEqual({});
        expect(result.body).toBe('Just some content without frontmatter');
    });

    it('应处理空内容', () => {
        const result = parseSkillMd('');
        expect(result.frontmatter).toEqual({});
        expect(result.body).toBe('');
    });

    it('应解析 YAML inline 数组', () => {
        const skillMd = `---
name: test
tags: [a, b, c]
---
body`;
        const result = parseSkillMd(skillMd);
        expect(result.frontmatter.tags).toEqual(['a', 'b', 'c']);
    });

    it('应解析多行数组', () => {
        const skillMd = `---
name: test
tags:
  - a
  - b
  - c
---
body`;
        const result = parseSkillMd(skillMd);
        expect(result.frontmatter.tags).toEqual(['a', 'b', 'c']);
    });
});

// ================================================================
// SKILL.md 验证
// ================================================================

describe('validateSkillMd', () => {
    it('应验证有效的 SKILL.md', () => {
        const content = `---
name: my-skill
version: 1.0.0
description: A test skill
---
Instructions here`;
        const result = validateSkillMd(content, 'my-skill');
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('应检测名称不匹配', () => {
        const content = `---
name: different-name
version: 1.0.0
---
body`;
        const result = validateSkillMd(content, 'my-skill');
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('match'))).toBe(true);
    });

    it('应警告缺少推荐字段', () => {
        const content = `---
name: my-skill
---
body`;
        const result = validateSkillMd(content, 'my-skill');
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings.some(w => w.includes('description'))).toBe(true);
    });

    it('应拒绝无效名称', () => {
        const content = `---
name: InvalidName
---
body`;
        const result = validateSkillMd(content);
        expect(result.valid).toBe(false);
    });
});

// ================================================================
// SkillDef 验证
// ================================================================

describe('validateSkillDef', () => {
    it('应验证有效的 Skill 定义', () => {
        const def = {
            name: 'github',
            version: '1.0.0',
            description: 'GitHub operations',
            tools: [{ id: 'create_issue', type: 'http' }],
        };
        const result = validateSkillDef(def);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('应拒绝无效名称', () => {
        const def = { name: 'InvalidName' };
        const result = validateSkillDef(def);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('name'))).toBe(true);
    });

    it('应拒绝 tools 不是数组', () => {
        const def = { name: 'test', tools: 'not-array' };
        const result = validateSkillDef(def);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('tools'))).toBe(true);
    });

    it('应拒绝无效工具定义', () => {
        const def = {
            name: 'test',
            tools: [{ /* 缺少 id 和 type */ }],
        };
        const result = validateSkillDef(def);
        expect(result.valid).toBe(false);
    });

    it('应警告缺少推荐字段', () => {
        const def = { name: 'test' };
        const result = validateSkillDef(def);
        expect(result.warnings.some(w => w.includes('version'))).toBe(true);
        expect(result.warnings.some(w => w.includes('description'))).toBe(true);
    });

    it('应验证 trigger 定义', () => {
        const def = {
            name: 'test',
            trigger: {
                patterns: ['test'],
                semantic: true,
            },
        };
        const result = validateSkillDef(def);
        expect(result.valid).toBe(true);
    });

    it('应拒绝无效 trigger', () => {
        const def = {
            name: 'test',
            trigger: 'invalid',
        };
        const result = validateSkillDef(def);
        expect(result.valid).toBe(false);
    });
});

// ================================================================
// 导入数据清洗
// ================================================================

describe('sanitizeImportedSkillDraft', () => {
    it('应清洗导入数据', () => {
        const draft = {
            name: 'My-Skill', // 将被转为小写
            version: '1.0.0',
            description: 'Test',
            extraField: 'should be removed',
        };
        const result = sanitizeImportedSkillDraft(draft);
        expect(result.name).toBe('my-skill');
        expect(result.extraField).toBeUndefined();
    });

    it('应处理无效名称', () => {
        const draft = { name: 'invalid_name' };
        const result = sanitizeImportedSkillDraft(draft);
        expect(result.name).toBe('invalid-name');
    });
});
