// hundunos/kernel/utils.js — 公共工具函数
// 集中管理重复的工具函数，避免代码冗余

import { join, isAbsolute, normalize } from 'path';

/**
 * 深度合并对象
 * @param {Object} base - 基础对象
 * @param {Object} override - 覆盖对象
 * @returns {Object} 合并后的对象
 */
export function deepMerge(base = {}, override = {}) {
    const result = { ...base };
    for (const [key, value] of Object.entries(override || {})) {
        if (
            value && typeof value === 'object' &&
            !Array.isArray(value) &&
            typeof base[key] === 'object' &&
            !Array.isArray(base[key])
        ) {
            result[key] = deepMerge(base[key], value);
        } else {
            result[key] = value;
        }
    }
    return result;
}

/**
 * 解析项目路径（相对路径转绝对路径）
 * @param {string} targetPath - 目标路径
 * @param {string} baseDir - 基础目录
 * @returns {string} 解析后的绝对路径
 */
export function resolveProjectPath(targetPath, baseDir) {
    if (!targetPath) return baseDir;
    return isAbsolute(targetPath) ? targetPath : join(baseDir, targetPath);
}

/**
 * 验证路径是否在白名单范围内
 * @param {string} targetPath - 目标路径
 * @param {string[]} allowedBaseDirs - 允许的基础目录列表
 * @returns {boolean} 是否允许
 */
export function isPathAllowed(targetPath, allowedBaseDirs) {
    if (!targetPath) return false;
    const normalized = normalize(targetPath);
    for (const allowed of allowedBaseDirs) {
        if (normalized.startsWith(normalize(allowed))) return true;
    }
    return false;
}

/**
 * 安全的 JSON 解析
 * @param {string} str - JSON 字符串
 * @param {*} defaultValue - 解析失败时的默认值
 * @returns {*} 解析结果
 */
export function safeJsonParse(str, defaultValue = null) {
    try {
        return JSON.parse(str);
    } catch (e) {
        return defaultValue;
    }
}

/**
 * 延迟执行
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise<void>}
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 重试函数
 * @param {Function} fn - 要执行的函数
 * @param {number} maxRetries - 最大重试次数
 * @param {number} delayMs - 重试间隔（毫秒）
 * @returns {Promise<*>} 函数执行结果
 */
export async function retry(fn, maxRetries = 3, delayMs = 1000) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (e) {
            lastError = e;
            if (i < maxRetries - 1) {
                await delay(delayMs);
            }
        }
    }
    throw lastError;
}

/**
 * 防抖函数
 * @param {Function} fn - 要防抖的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
export function debounce(fn, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), wait);
    };
}

/**
 * 节流函数
 * @param {Function} fn - 要节流的函数
 * @param {number} limit - 时间限制（毫秒）
 * @returns {Function} 节流后的函数
 */
export function throttle(fn, limit) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * 格式化错误信息
 * @param {Error|string} error - 错误对象或消息
 * @returns {string} 格式化后的错误信息
 */
export function formatError(error) {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}${error.stack ? '\n' + error.stack : ''}`;
    }
    return String(error);
}

/**
 * 检查是否为有效的 URL
 * @param {string} str - 要检查的字符串
 * @returns {boolean} 是否为有效 URL
 */
export function isValidUrl(str) {
    try {
        new URL(str);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * 生成唯一 ID
 * @param {string} prefix - ID 前缀
 * @returns {string} 唯一 ID
 */
export function generateId(prefix = '') {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

export default {
    deepMerge,
    resolveProjectPath,
    isPathAllowed,
    safeJsonParse,
    delay,
    retry,
    debounce,
    throttle,
    formatError,
    isValidUrl,
    generateId,
};
