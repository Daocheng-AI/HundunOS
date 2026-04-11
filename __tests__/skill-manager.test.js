/**
 * @jest-environment node
 * 
 * skill-manager.test.js
 * 测试 Facade 模式重构后的 SkillManager
 */

import { describe, it, expect, beforeEach, vi } from '@jest/globals';
import { SkillManager, SKILL_PLATFORMS } from '../kernel/skills/skill-manager.js';

// Mock kernel
const mockKernel = {
    config: {
        projectRoot: process.cwd(),
    },
    modelRouter: null,
    emit: vi.fn(),
};

// ================================================================
// SkillManager 初始化
// ================================================================

describe('SkillManager', () => {
    let manager;

    beforeEach(() => {
        manager = new SkillManager(mockKernel);
    });

    describe('构造函数', () => {
        it('应创建所有核心组件', () => {
            expect(manager.registry).toBeDefined();
            expect(manager.matcher).toBeDefined();
            expect(manager.runner).toBeDefined();
            expect(manager.market).toBeDefined();
            expect(manager.loader).toBeDefined();
        });

        it('初始状态应为未初始化', () => {
            expect(manager._initialized).toBe(false);
        });

        it('应初始化验证警告数组', () => {
            expect(manager._validationWarnings).toEqual([]);
        });
    });

    // ================================================================
    // 验证器 API
    // ================================================================

    describe('验证器 API', () => {
        it('isValidSkillName 应返回正确结果', () => {
            expect(manager.isValidSkillName('my-skill')).toBe(true);
            expect(manager.isValidSkillName('MySkill')).toBe(false);
        });

        it('getSkillNameValidationError 应返回错误信息', () => {
            expect(manager.getSkillNameValidationError('my-skill')).toBeNull();
            expect(manager.getSkillNameValidationError('-invalid')).toContain('hyphen');
        });

        it('parseSkillMdContent 应解析 SKILL.md', () => {
            const content = `---
name: test-skill
version: 1.0.0
---
body`;
            const result = manager.parseSkillMdContent(content);
            expect(result.frontmatter.name).toBe('test-skill');
        });

        it('validateDefinition 应验证 Skill 定义', () => {
            const validDef = { name: 'test', version: '1.0.0' };
            const invalidDef = { name: 'Invalid' };
            
            expect(manager.validateDefinition(validDef).valid).toBe(true);
            expect(manager.validateDefinition(invalidDef).valid).toBe(false);
        });
    });

    // ================================================================
    // 平台 API
    // ================================================================

    describe('平台 API', () => {
        it('detectPlatforms 应返回数组', () => {
            const platforms = manager.detectPlatforms();
            expect(Array.isArray(platforms)).toBe(true);
        });

        it('getSupportedPlatforms 应返回平台列表', () => {
            const platforms = manager.getSupportedPlatforms();
            expect(platforms.length).toBeGreaterThanOrEqual(6);
            expect(platforms[0]).toHaveProperty('id');
            expect(platforms[0]).toHaveProperty('name');
        });

        it('getPlatformInfo 应返回平台信息', () => {
            const claude = manager.getPlatformInfo('claude');
            expect(claude).toBeDefined();
            expect(claude.name).toBe('Claude Code');
        });

        it('getPlatformInfo 对未知平台应返回 undefined', () => {
            expect(manager.getPlatformInfo('unknown')).toBeUndefined();
        });
    });

    // ================================================================
    // 注册 API
    // ================================================================

    describe('注册 API', () => {
        it('register 应验证并注册 Skill', () => {
            const result = manager.register({
                name: 'test-skill',
                version: '1.0.0',
                description: 'Test',
            });
            
            expect(result.success).toBe(true);
            expect(result.warnings).toBeDefined();
        });

        it('register 应拒绝无效 Skill', () => {
            const result = manager.register({
                name: 'InvalidName',
            });
            
            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('register 应收集警告', () => {
            manager.register({ name: 'test' }); // 缺少 version 和 description
            
            const warnings = manager.getValidationWarnings();
            expect(warnings.length).toBeGreaterThan(0);
        });

        it('clearValidationWarnings 应清除警告', () => {
            manager.register({ name: 'test' });
            manager.clearValidationWarnings();
            
            expect(manager.getValidationWarnings()).toHaveLength(0);
        });
    });

    // ================================================================
    // 状态 API
    // ================================================================

    describe('状态 API', () => {
        it('getStats 应返回完整状态', () => {
            const stats = manager.getStats();
            
            expect(stats).toHaveProperty('initialized');
            expect(stats).toHaveProperty('registry');
            expect(stats).toHaveProperty('matcher');
            expect(stats).toHaveProperty('runner');
            expect(stats).toHaveProperty('market');
            expect(stats).toHaveProperty('validation');
        });

        it('getLoadStats 应返回加载统计', () => {
            const loadStats = manager.getLoadStats();
            expect(loadStats).toBeDefined();
        });
    });

    // ================================================================
    // System Prompt API
    // ================================================================

    describe('System Prompt API', () => {
        it('getSystemPrompts 应返回数组', () => {
            const prompts = manager.getSystemPrompts();
            expect(Array.isArray(prompts)).toBe(true);
        });

        it('getAvailableSkillsDescription 应返回描述数组', () => {
            const descriptions = manager.getAvailableSkillsDescription();
            expect(Array.isArray(descriptions)).toBe(true);
        });
    });
});

// ================================================================
// SKILL_PLATFORMS 导出
// ================================================================

describe('SKILL_PLATFORMS 导出', () => {
    it('应从 skill-manager.js 导出', () => {
        expect(SKILL_PLATFORMS).toBeDefined();
        expect(Array.isArray(SKILL_PLATFORMS)).toBe(true);
        expect(SKILL_PLATFORMS.length).toBeGreaterThanOrEqual(6);
    });
});
