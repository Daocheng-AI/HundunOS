/**
 * @jest-environment node
 * 
 * platform-bridge.test.js
 * 测试 PromptHub 移植的跨平台 Skill 分发模块
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
    SKILL_PLATFORMS,
    getPlatform,
    getPlatformSkillsDir,
    getPlatformConfigPath,
    getSupportedPlatforms,
    detectInstalledPlatforms,
    validateMCPConfig,
} from '../kernel/skills/platform-bridge.js';

// ================================================================
// 平台定义
// ================================================================

describe('SKILL_PLATFORMS', () => {
    it('应包含所有支持的平台', () => {
        const platformIds = SKILL_PLATFORMS.map(p => p.id);
        expect(platformIds).toContain('claude');
        expect(platformIds).toContain('claude-desktop');
        expect(platformIds).toContain('cursor');
        expect(platformIds).toContain('windsurf');
        expect(platformIds).toContain('openclaw');
        expect(platformIds).toContain('hundunos');
    });

    it('每个平台应有必要的属性', () => {
        for (const platform of SKILL_PLATFORMS) {
            expect(platform.id).toBeDefined();
            expect(platform.name).toBeDefined();
            expect(platform.type).toBeDefined();
            expect(['skill-md', 'mcp']).toContain(platform.type);
        }
    });
});

// ================================================================
// 平台查询
// ================================================================

describe('getPlatform', () => {
    it('应返回平台定义', () => {
        const claude = getPlatform('claude');
        expect(claude).toBeDefined();
        expect(claude.id).toBe('claude');
        expect(claude.name).toBe('Claude Code');
        expect(claude.type).toBe('skill-md');
    });

    it('应返回 undefined 对于未知平台', () => {
        expect(getPlatform('unknown-platform')).toBeUndefined();
    });

    it('getPlatformSkillsDir 应返回路径', () => {
        const dir = getPlatformSkillsDir('claude');
        expect(dir).toBeDefined();
        expect(dir).toContain('.claude');
    });

    it('getPlatformConfigPath 应返回 MCP 配置路径', () => {
        const path = getPlatformConfigPath('claude-desktop');
        expect(path).toBeDefined();
        expect(path).toContain('claude_desktop_config.json');
    });
});

describe('getSupportedPlatforms', () => {
    it('应返回所有支持的平台', () => {
        const platforms = getSupportedPlatforms();
        expect(platforms.length).toBeGreaterThanOrEqual(6);
        expect(platforms[0]).toHaveProperty('id');
        expect(platforms[0]).toHaveProperty('name');
        expect(platforms[0]).toHaveProperty('type');
    });
});

// ================================================================
// 平台检测
// ================================================================

describe('detectInstalledPlatforms', () => {
    it('应返回数组', () => {
        const installed = detectInstalledPlatforms();
        expect(Array.isArray(installed)).toBe(true);
    });

    it('应包含 openclaw（测试环境）', () => {
        const installed = detectInstalledPlatforms();
        expect(installed).toContain('openclaw');
    });
});

// ================================================================
// MCP 配置验证
// ================================================================

describe('validateMCPConfig', () => {
    it('应验证有效的 MCP 配置', () => {
        const config = {
            command: 'node',
            args: ['server.js'],
        };
        const result = validateMCPConfig(config);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('应拒绝缺少 command', () => {
        const config = {
            args: ['server.js'],
        };
        const result = validateMCPConfig(config);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('command'))).toBe(true);
    });

    it('应拒绝无效 command 类型', () => {
        const config = {
            command: 123,
        };
        const result = validateMCPConfig(config);
        expect(result.valid).toBe(false);
    });

    it('应警告 args 不是数组', () => {
        const config = {
            command: 'node',
            args: 'not-array',
        };
        const result = validateMCPConfig(config);
        expect(result.warnings.some(w => w.includes('args'))).toBe(true);
    });

    it('应验证 env 必须是对象', () => {
        const config = {
            command: 'node',
            env: { API_KEY: 'xxx' },
        };
        const result = validateMCPConfig(config);
        expect(result.valid).toBe(true);
    });

    it('应拒绝 env 不是对象', () => {
        const config = {
            command: 'node',
            env: 'invalid',
        };
        const result = validateMCPConfig(config);
        expect(result.valid).toBe(false);
    });
});

// ================================================================
// 路径解析
// ================================================================

describe('路径解析', () => {
    it('Claude Code skills 路径应包含 .claude/skills', () => {
        const dir = getPlatformSkillsDir('claude');
        expect(dir).toMatch(/\.claude[\/\\]skills/);
    });

    it('Claude Desktop config 路径应包含 AppData', () => {
        const path = getPlatformConfigPath('claude-desktop');
        expect(path).toMatch(/AppData|Application Support/);
    });

    it('Cursor config 路径应正确', () => {
        const path = getPlatformConfigPath('cursor');
        expect(path).toMatch(/cursor.*mcp/i);
    });

    it('OpenClaw skills 路径应包含 .openclaw', () => {
        const dir = getPlatformSkillsDir('openclaw');
        expect(dir).toMatch(/\.openclaw/);
    });

    it('HundunOS skills 路径应包含 .hundunos', () => {
        const dir = getPlatformSkillsDir('hundunos');
        expect(dir).toMatch(/\.hundunos/);
    });
});
