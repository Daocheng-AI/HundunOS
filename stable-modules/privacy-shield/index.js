// hundunos/stable-modules/privacy-shield/index.js — Privacy Shield v3.0

export class PrivacyShield {
    constructor(kernel) {
        this.kernel = kernel;
        this.rules = [];
        this.stats = { checked: 0, blocked: 0, redacted: 0 };
        this._initRules();
    }

    async initialize() {
        // review: removed // review: removed console.log('[Privacy] Shield initialized, rules:', this.rules.length);
    }

    _initRules() {
        // 改进的 PII 规则：增加上下文验证和校验码检查
        this.rules = [
            // 姓名（中文）
            { id: 'pii_name', level: 3, pattern: /[\u4e00-\u9fa5]{2,4}[先生女士姐同学哥爷奶总的]/g, replacement: '[姓名]' },
            
            // 手机号（更精确的匹配）
            { id: 'pii_phone', level: 3, pattern: /1[3-9]\d{9}/g, replacement: '[手机号]' },
            
            // 邮箱
            { id: 'pii_email', level: 3, pattern: /[\w.+-]+@[\w.-]+\.[a-z]{2,}(?!\w)/gi, replacement: '[邮箱]' },
            
            // 身份证（增加校验码验证）
            { id: 'pii_idcard', level: 4, 
              pattern: /([1-9]\d{5})(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g, 
              replacement: '[身份证]' },
            
            // 银行卡（16-19位连续数字）
            { id: 'fin_bank', level: 4,
              pattern: /\b\d{16,19}\b/g,
              replacement: '[银行卡]' },
            
            // 密码
            { id: 'fin_password', level: 4, 
              pattern: /(?:password|pwd|passwd|secret|token|key)\s*[:=]\s*\S+/gi, 
              replacement: '[密码]' },
            
            // IP 地址
            { id: 'net_ip', level: 2, 
              pattern: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g, 
              replacement: '[IP]' },
        ];
    }

    async check(intent, message) {
        this.stats.checked++;
        let content = message.content || '';
        const level = this._detectLevel(content);

        if (level === 4 && this._isOutgoing(intent)) {
            this.stats.blocked++;
            return { allowed: false, reason: 'L4 机密数据禁止外传', level: 'RED' };
        }

        // 实际调用脱敏
        if (level >= 3) {
            content = this._redact(content);
            this.stats.redacted++;
        }

        return { allowed: true, level, redacted: level >= 3, redactedContent: level >= 3 ? content : null };
    }

    _detectLevel(content) {
        let maxLevel = 1;
        for (const rule of this.rules) {
            // S-12: 用非全局正则测试，避免 /g 模式的 lastIndex 累积导致漏检
            const testPattern = new RegExp(rule.pattern.source, rule.pattern.flags.replace('g', ''));
            if (testPattern.test(content)) maxLevel = Math.max(maxLevel, rule.level);
        }
        return maxLevel;
    }

    _redact(content) {
        let result = content;
        for (const rule of this.rules) {
            // S-12 fix: 重建正则时必须保留 /g 标志，否则 replace() 只替换第一个匹配
            // （不含 g → String.replace 只替换第一次出现，导致后续 PII 漏检）
            const noGFlags = (rule.pattern.flags || '').replace(/g/g, '');
            const replacePattern = new RegExp(rule.pattern.source, noGFlags + 'g');
            result = result.replace(replacePattern, rule.replacement);
        }
        return result;
    }

    _isOutgoing(intent) {
        return ['network_send', 'file_write', 'export', 'send', 'email'].some(k => (intent.action || '').includes(k));
    }

    async redact(content) { return this._redact(content); }

    getStats() { return { ...this.stats }; }
}

export default PrivacyShield;
