// hundunos/extension-modules/i18n/index.js — Internationalization System
// 功能: 多语言支持，本地化界面和消息
// 状态: 新增

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const SupportedLocales = {
    ZH_CN: 'zh-CN',   // 简体中文
    ZH_TW: 'zh-TW',   // 繁体中文
    EN_US: 'en-US',   // 英语
    JA_JP: 'ja-JP',   // 日语
    KO_KR: 'ko-KR',   // 韩语
    ES_ES: 'es-ES',   // 西班牙语
    DE_DE: 'de-DE',   // 德语
    FR_FR: 'fr-FR'    // 法语
};

export class I18n {
    constructor(kernel) {
        this.kernel = kernel;
        this.currentLocale = SupportedLocales.ZH_CN;
        this.translations = new Map();
        this.fallbackLocale = SupportedLocales.EN_US;
        
        this.config = {
            localesDir: join(__dirname, '..', '..', 'config', 'locales'),
            defaultLocale: SupportedLocales.ZH_CN
        };
    }

    async initialize() {
        // 加载所有语言包
        await this._loadAllTranslations();
        
        // 设置默认语言
        this.currentLocale = this.config.defaultLocale;
        
        // console.log('[I18n] Initialized with', this.translations.size, 'locales');
    }

    /**
     * 加载所有翻译
     */
    async _loadAllTranslations() {
        for (const locale of Object.values(SupportedLocales)) {
            await this._loadTranslation(locale);
        }
    }

    /**
     * 加载单个语言包
     */
    async _loadTranslation(locale) {
        const localeFile = join(this.config.localesDir, `${locale}.json`);
        
        if (existsSync(localeFile)) {
            try {
                const translations = JSON.parse(readFileSync(localeFile, 'utf8'));
                this.translations.set(locale, translations);
            } catch (e) {
                console.warn(`[I18n] Failed to load ${locale}:`, e.message);
            }
        }
    }

    /**
     * 翻译文本
     */
    t(key, params = {}, locale = null) {
        const targetLocale = locale || this.currentLocale;
        
        // 获取翻译
        let translation = this._getTranslation(targetLocale, key);
        
        // 如果没有找到，尝试后备语言
        if (!translation && targetLocale !== this.fallbackLocale) {
            translation = this._getTranslation(this.fallbackLocale, key);
        }
        
        // 如果还没有，返回原始 key
        if (!translation) {
            return key;
        }
        
        // 替换参数
        return this._interpolate(translation, params);
    }

    /**
     * 获取翻译字符串
     */
    _getTranslation(locale, key) {
        const translations = this.translations.get(locale);
        if (!translations) return null;
        
        // 支持点号路径，如 "menu.file.open"
        const parts = key.split('.');
        let value = translations;
        
        for (const part of parts) {
            if (value && typeof value === 'object') {
                value = value[part];
            } else {
                return null;
            }
        }
        
        return value;
    }

    /**
     * 替换参数
     */
    _interpolate(text, params) {
        return text.replace(/\{(\w+)\}/g, (match, key) => {
            return params[key] !== undefined ? params[key] : match;
        });
    }

    /**
     * 设置当前语言
     */
    setLocale(locale) {
        if (!Object.values(SupportedLocales).includes(locale)) {
            console.warn(`[I18n] Unsupported locale: ${locale}`);
            return false;
        }
        
        this.currentLocale = locale;
        // console.log(`[I18n] Locale set to: ${locale}`);
        
        return true;
    }

    /**
     * 获取当前语言
     */
    getLocale() {
        return this.currentLocale;
    }

    /**
     * 获取支持的语言列表
     */
    getSupportedLocales() {
        return Object.values(SupportedLocales).map(locale => ({
            code: locale,
            name: this._getLocaleName(locale),
            nativeName: this._getNativeName(locale)
        }));
    }

    /**
     * 获取语言名称
     */
    _getLocaleName(locale) {
        const names = {
            [SupportedLocales.ZH_CN]: 'Chinese (Simplified)',
            [SupportedLocales.ZH_TW]: 'Chinese (Traditional)',
            [SupportedLocales.EN_US]: 'English',
            [SupportedLocales.JA_JP]: 'Japanese',
            [SupportedLocales.KO_KR]: 'Korean',
            [SupportedLocales.ES_ES]: 'Spanish',
            [SupportedLocales.DE_DE]: 'German',
            [SupportedLocales.FR_FR]: 'French'
        };
        return names[locale] || locale;
    }

    /**
     * 获取本地名称
     */
    _getNativeName(locale) {
        const names = {
            [SupportedLocales.ZH_CN]: '简体中文',
            [SupportedLocales.ZH_TW]: '繁體中文',
            [SupportedLocales.EN_US]: 'English',
            [SupportedLocales.JA_JP]: '日本語',
            [SupportedLocales.KO_KR]: '한국어',
            [SupportedLocales.ES_ES]: 'Español',
            [SupportedLocales.DE_DE]: 'Deutsch',
            [SupportedLocales.FR_FR]: 'Français'
        };
        return names[locale] || locale;
    }

    /**
     * 翻译日期格式
     */
    formatDate(date, format = 'short') {
        const d = new Date(date);
        
        const formats = {
            short: this.t('date.short'),
            long: this.t('date.long'),
            time: this.t('date.time'),
            datetime: this.t('date.datetime')
        };
        
        return d.toLocaleDateString(this.currentLocale, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * 翻译数字格式
     */
    formatNumber(num, decimals = 0) {
        return new Intl.NumberFormat(this.currentLocale, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(num);
    }

    /**
     * 翻译货币格式
     */
    formatCurrency(amount, currency = 'USD') {
        return new Intl.NumberFormat(this.currentLocale, {
            style: 'currency',
            currency
        }).format(amount);
    }

    /**
     * 加载自定义翻译
     */
    loadCustomTranslations(locale, translations) {
        const existing = this.translations.get(locale) || {};
        const merged = { ...existing, ...translations };
        this.translations.set(locale, merged);
        
        // console.log(`[I18n] Custom translations loaded for ${locale}`);
    }

    /**
     * 导出翻译为 JSON
     */
    exportTranslations(locale) {
        return this.translations.get(locale) || {};
    }

    /**
     * 获取统计
     */
    getStats() {
        return {
            currentLocale: this.currentLocale,
            fallbackLocale: this.fallbackLocale,
            availableLocales: this.translations.size,
            supportedLocales: Object.values(SupportedLocales)
        };
    }
}

export function getI18n(kernel) {
    return new I18n(kernel);
}