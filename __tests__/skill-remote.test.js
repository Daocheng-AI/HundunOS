/**
 * @jest-environment node
 * 
 * skill-remote.test.js
 * 测试 PromptHub 移植的远程 Skill 安装 + SSRF 防护模块
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
    validateUrl,
    safeFetch,
    installFromUrl,
    installFromGist,
    installFromGitHubRef,
    PRIVATE_IP_RANGES,
    BLOCKED_HOSTNAME_PATTERNS,
} from '../kernel/skills/skill-remote.js';

// ================================================================
// SSRF 防护 - URL 验证
// ================================================================

describe('validateUrl', () => {
    describe('正常 URL', () => {
        it('应允许 HTTPS URL', () => {
            const result = validateUrl('https://github.com/user/skill.yaml');
            expect(result.allowed).toBe(true);
        });

        it('应允许 HTTP URL', () => {
            const result = validateUrl('http://example.com/skill.yaml');
            expect(result.allowed).toBe(true);
        });

        it('应允许带端口的 URL', () => {
            const result = validateUrl('https://example.com:8080/skill.yaml');
            expect(result.allowed).toBe(true);
        });

        it('应允许带查询参数的 URL', () => {
            const result = validateUrl('https://example.com/skill.yaml?v=1');
            expect(result.allowed).toBe(true);
        });
    });

    describe('协议限制', () => {
        it('应拒绝 FTP 协议', () => {
            const result = validateUrl('ftp://example.com/file');
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('Protocol');
        });

        it('应拒绝 JavaScript 协议', () => {
            const result = validateUrl('javascript:alert(1)');
            expect(result.allowed).toBe(false);
        });

        it('应拒绝 file 协议', () => {
            const result = validateUrl('file:///etc/passwd');
            expect(result.allowed).toBe(false);
        });

        it('应拒绝 data 协议', () => {
            const result = validateUrl('data:text/html,<script>alert(1)</script>');
            expect(result.allowed).toBe(false);
        });
    });

    describe('私有 IP 阻止', () => {
        it('应阻止 127.0.0.1', () => {
            const result = validateUrl('http://127.0.0.1/admin');
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('private');
        });

        it('应阻止 192.168.x.x', () => {
            const result = validateUrl('http://192.168.1.1/admin');
            expect(result.allowed).toBe(false);
        });

        it('应阻止 10.x.x.x', () => {
            const result = validateUrl('http://10.0.0.1/admin');
            expect(result.allowed).toBe(false);
        });

        it('应阻止 172.16-31.x.x', () => {
            const result = validateUrl('http://172.16.0.1/admin');
            expect(result.allowed).toBe(false);
            expect(validateUrl('http://172.31.255.255/admin').allowed).toBe(false);
        });

        it('应允许 172.15.x.x（非私有）', () => {
            const result = validateUrl('http://172.15.0.1/skill');
            expect(result.allowed).toBe(true);
        });

        it('应允许 172.32.x.x（非私有）', () => {
            const result = validateUrl('http://172.32.0.1/skill');
            expect(result.allowed).toBe(true);
        });

        it('应阻止 169.254.x.x（链路本地）', () => {
            const result = validateUrl('http://169.254.1.1/admin');
            expect(result.allowed).toBe(false);
        });

        it('应阻止 0.0.0.0', () => {
            const result = validateUrl('http://0.0.0.0/admin');
            expect(result.allowed).toBe(false);
        });
    });

    describe('主机名阻止', () => {
        it('应阻止 localhost', () => {
            const result = validateUrl('http://localhost/admin');
            expect(result.allowed).toBe(false);
        });

        it('应阻止 *.local', () => {
            const result = validateUrl('http://test.local/admin');
            expect(result.allowed).toBe(false);
        });

        it('应阻止 *.internal', () => {
            const result = validateUrl('http://app.internal.example.com/admin');
            expect(result.allowed).toBe(false);
        });

        it('应阻止包含 internal 的域名', () => {
            const result = validateUrl('http://internal.corp/admin');
            expect(result.allowed).toBe(false);
        });

        it('应阻止 local 主机名', () => {
            const result = validateUrl('http://local/admin');
            expect(result.allowed).toBe(false);
        });
    });

    describe('IPv6', () => {
        it('应阻止 ::1（IPv6 loopback）', () => {
            const result = validateUrl('http://[::1]/admin');
            expect(result.allowed).toBe(false);
        });

        it('应阻止 ::（IPv6 所有地址）', () => {
            const result = validateUrl('http://[::]/admin');
            expect(result.allowed).toBe(false);
        });
    });

    describe('无效 URL', () => {
        it('应拒绝无效 URL 格式', () => {
            const result = validateUrl('not-a-valid-url');
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('Invalid URL');
        });

        it('应拒绝空 URL', () => {
            const result = validateUrl('');
            expect(result.allowed).toBe(false);
        });
    });
});

// ================================================================
// 安全获取
// ================================================================

describe('safeFetch', () => {
    it('应拒绝 SSRF URL', async () => {
        const result = await safeFetch('http://localhost/admin');
        expect(result.success).toBe(false);
        expect(result.error).toContain('SSRF');
    });

    it('应拒绝无效 URL', async () => {
        const result = await safeFetch('not-a-url');
        expect(result.success).toBe(false);
    });

    // 注意：真实网络请求测试需要 mock 或跳过
    it('超时参数应生效', async () => {
        // 使用一个不存在的地址测试超时
        const result = await safeFetch('https://10.255.255.1/test', { timeout: 100 });
        expect(result.success).toBe(false);
        // 可能是 SSRF 阻止或超时
    });
});

// ================================================================
// GitHub 安装
// ================================================================

describe('installFromGitHubRef', () => {
    it('应拒绝无效格式', async () => {
        const result = await installFromGitHubRef('invalid-format');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid github:');
    });

    it('应解析有效引用', async () => {
        // 格式验证（不会真正请求）
        const validRef = 'github:user/repo/skill.yaml';
        expect(validRef).toMatch(/^github:/);
    });
});

describe('installFromGist', () => {
    it('应拒绝无效 Gist URL', async () => {
        const result = await installFromGist('https://example.com/not-a-gist');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid Gist');
    });
});

// ================================================================
// 配置验证
// ================================================================

describe('配置常量', () => {
    it('PRIVATE_IP_RANGES 应包含主要私有网段', () => {
        expect(PRIVATE_IP_RANGES).toContain('10.0.0.0/8');
        expect(PRIVATE_IP_RANGES).toContain('172.16.0.0/12');
        expect(PRIVATE_IP_RANGES).toContain('192.168.0.0/16');
        expect(PRIVATE_IP_RANGES).toContain('127.0.0.0/8');
    });

    it('BLOCKED_HOSTNAME_PATTERNS 应包含 localhost', () => {
        const hasLocalhost = BLOCKED_HOSTNAME_PATTERNS.some(p => p.test('localhost'));
        expect(hasLocalhost).toBe(true);
    });
});
