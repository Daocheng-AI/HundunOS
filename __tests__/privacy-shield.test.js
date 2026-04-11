/**
 * HundunOS v3.0 — PrivacyShield 单元测试
 * 覆盖：PII 4级分类 + S-12 回归（非全局正则 lastIndex 漏检）
 * 运行：node --test __tests__/privacy-shield.test.js
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

const { PrivacyShield } = await import('../stable-modules/privacy-shield/index.js');

/** 构造一个最小 mock kernel */
const mockKernel = () => ({ on: () => {}, config: {} });

describe('PrivacyShield — PII 检测与脱敏', () => {

    it('L1: 普通文本放行', async () => {
        const shield = new PrivacyShield(mockKernel());
        // 使用英文文本避免触发中文姓名规则
        const result = await shield.check(
            { action: 'analyze' },
            { content: 'Analyze the temperature data for today' }
        );
        assert.strictEqual(result.allowed, true);
        assert.strictEqual(result.level, 1);
    });

    it('L2: IP 地址被识别为 L2', async () => {
        const shield = new PrivacyShield(mockKernel());
        const result = await shield.check(
            { action: 'analyze' },
            { content: '服务器 IP 是 192.168.1.100' }
        );
        assert.strictEqual(result.level, 2);
    });

    it('L3: 手机号被识别为 L3 且脱敏', async () => {
        const shield = new PrivacyShield(mockKernel());
        const result = await shield.check(
            { action: 'analyze' },
            { content: '联系电话是 13812345678，请尽快回复' }
        );
        assert.strictEqual(result.level, 3);
        assert.strictEqual(result.redacted, true);
        assert.ok(!result.redactedContent?.includes('13812345678'));
    });

    it('L4: 身份证 + 出站操作 → 阻止', async () => {
        const shield = new PrivacyShield(mockKernel());
        const result = await shield.check(
            { action: 'network_send' },
            { content: '身份证号是 110101199001011234' }
        );
        assert.strictEqual(result.allowed, false);
        assert.strictEqual(result.level, 'RED');
    });

    it('L4: 银行卡 + 本地操作 → 允许但脱敏', async () => {
        const shield = new PrivacyShield(mockKernel());
        // 银行卡号前后有空格，保证 \b 词边界正常工作
        const result = await shield.check(
            { action: 'analyze' },
            { content: 'Bank card: 6222021234567890123 confirmed.' }
        );
        assert.strictEqual(result.allowed, true);
        assert.strictEqual(result.level, 4);
    });

    // ── S-12 回归测试 ───────────────────────────────────────────────────

    it('S-12: /g 正则 lastIndex 累积导致漏检（bug 回归）', async () => {
        /**
         * 原始 bug：
         *   const re = /1[3-9]\d{9}/g;
         *   re.test('13811111111');  // true，lastIndex = 11
         *   re.test('13922222222');  // 从 index 11 开始 → false（漏检！）
         *
         * 修复：每次 test/replace 重建不带 g 的正则
         */
        const shield = new PrivacyShield(mockKernel());

        // 连续两个手机号，原 bug 会漏检第二个
        const content = '手机1: 13811111111，手机2: 13922222222';
        const result = await shield.check({ action: 'analyze' }, { content });

        // 两个号码都必须被脱敏
        assert.ok(!result.redactedContent?.includes('13811111111'),
            '第一个手机号未被脱敏（S-12 bug 未修复）');
        assert.ok(!result.redactedContent?.includes('13922222222'),
            '第二个手机号未被脱敏（S-12 bug: lastIndex 累积漏检）');
    });

    it('S-12: 多个邮箱连续检测不漏检', async () => {
        const shield = new PrivacyShield(mockKernel());
        const content = '联系 alice@example.com 和 bob@example.com';
        const result = await shield.check({ action: 'analyze' }, { content });

        assert.ok(!result.redactedContent?.includes('alice@example.com'),
            '第一个邮箱未被脱敏');
        assert.ok(!result.redactedContent?.includes('bob@example.com'),
            '第二个邮箱未被脱敏（S-12 /g lastIndex 漏检）');
    });

    it('getStats() 正确累计 blocked / redacted', async () => {
        const shield = new PrivacyShield(mockKernel());

        await shield.check({ action: 'analyze' }, { content: '手机 13912345678' });
        await shield.check({ action: 'network_send' }, { content: '身份证 110101199001011234' });

        const stats = shield.getStats();
        assert.strictEqual(stats.checked, 2);
        assert.strictEqual(stats.blocked, 1);
        assert.strictEqual(stats.redacted, 1);
    });
});
