/**
 * HundunOS v3.0 - Everything Search Adapter
 * Everything 搜索引擎适配器
 *
 * 功能:
 * - es.exe 命令行集成
 * - 高速文件搜索
 * - 高级搜索语法支持
 *
 * S-04: 添加输入验证，防止命令注入
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// S-04: 危险字符黑名单
const DANGEROUS_CHARS = /[;&|`$><\r\n]/;
const QUOTE_CHARS = /["'\$\(\)`]/;

// ============================================================================
// 输入验证器
// ============================================================================
class QueryValidator {
    static sanitize(query) {
        if (!query || typeof query !== 'string') {
            return '';
        }
        // 移除控制字符和危险字符
        let sanitized = query.replace(/[\r\n\t]/g, ' ').trim();
        // 检测危险字符
        if (DANGEROUS_CHARS.test(sanitized)) {
            console.warn('[Everything] Query contains dangerous chars, sanitized');
            sanitized = sanitized.replace(DANGEROUS_CHARS, '');
        }
        // 检测引号和命令替换
        if (QUOTE_CHARS.test(sanitized)) {
            console.warn('[Everything] Query contains quote chars, sanitized');
            sanitized = sanitized.replace(QUOTE_CHARS, '');
        }
        // 限制长度
        if (sanitized.length > 500) {
            sanitized = sanitized.substring(0, 500);
        }
        return sanitized;
    }

    static validate(query) {
        if (!query) {
            return { valid: false, reason: 'Empty query' };
        }
        const sanitized = this.sanitize(query);
        if (!sanitized || sanitized.length === 0) {
            return { valid: false, reason: 'Query sanitized to empty' };
        }
        return { valid: true, sanitized };
    }
}

// ============================================================================
// Everything 适配器
// ============================================================================

export class EverythingSearch {
    constructor(config = {}) {
        this.esPath = config.esPath || 'C:\\Program Files\\Everything\\es.exe';
        this.timeout = config.timeout || 30000;
        this.maxResults = config.maxResults || 1000;
        this.available = false;
        this.enableValidation = config.enableValidation !== false; // S-04: 默认启用验证

        this._checkAvailable();
    }

    /**
     * 检查 Everything 是否可用
     */
    async _checkAvailable() {
        try {
            await execAsync(`"${this.esPath}" -n 1 .`, { timeout: 5000 });
            this.available = true;
            // review: removed // review: removed console.log('[Everything] Available');
        } catch {
            this.available = false;
            // review: removed // review: removed console.log('[Everything] Not available');
        }
    }

    /**
     * 执行搜索
     * S-04: 添加输入验证
     */
    async search(query, options = {}) {
        if (!this.available) {
            return { error: 'Everything not available', results: [] };
        }

        // S-04: 输入验证
        if (this.enableValidation) {
            const validation = QueryValidator.validate(query);
            if (!validation.valid) {
                console.warn('[Everything] Invalid query:', validation.reason);
                return { error: validation.reason, results: [] };
            }
            query = validation.sanitized;
        }

        const limit = options.limit || this.maxResults;
        const offset = options.offset || 0;
        const timeout = options.timeout || this.timeout;

        // 构建命令
        const args = this._buildArgs(query, { limit, offset });
        const cmd = `"${this.esPath}" ${args.join(' ')}`;

        try {
            const { stdout } = await execAsync(cmd, { timeout, encoding: 'utf8' });
            const results = this._parseResults(stdout);

            return {
                query,
                total: results.length,
                results: results.slice(0, limit),
                elapsed: 0
            };
        } catch (error) {
            return { error: error.message, results: [] };
        }
    }

    /**
     * 搜索文件
     */
    async searchFiles(query, options = {}) {
        return this.search(`file: ${query}`, options);
    }

    /**
     * 搜索文件夹
     */
    async searchFolders(query, options = {}) {
        return this.search(`folder: ${query}`, options);
    }

    /**
     * 按扩展名搜索
     */
    async searchByExt(ext, options = {}) {
        return this.search(`ext:${ext}`, options);
    }

    /**
     * 按大小搜索
     */
    async searchBySize(operator, size, options = {}) {
        // size: >100mb, size: <1kb, size: 1mb-10mb
        return this.search(`size:${operator}${size}`, options);
    }

    /**
     * 按日期搜索
     */
    async searchByDate(dateType, operator, date, options = {}) {
        // dm:today, dc:lastweek, da:lastmonth
        return this.search(`${dateType}:${operator}${date}`, options);
    }

    /**
     * 获取文件信息
     */
    async getFileInfo(filePath) {
        const result = await this.search(`"${filePath}"`, { limit: 1 });
        return result.results[0] || null;
    }

    /**
     * 统计匹配数
     */
    async count(query) {
        const result = await this.search(query, { limit: 1 });
        return result.total;
    }

    // ========================================================================
    // 内部方法
    // ========================================================================

    _buildArgs(query, options) {
        const args = ['-n', options.limit || this.maxResults];

        if (options.offset) {
            args.push('-o', options.offset);
        }

        // 排序
        if (options.sort) {
            args.push('-sort', options.sort);
        }

        // 升序/降序
        if (options.sortDescending) {
            args.push('-sort-descending');
        }

        // 查询
        args.push(query);

        return args;
    }

    _parseResults(output) {
        const lines = output.trim().split('\n');
        const results = [];

        for (const line of lines) {
            if (!line.trim()) continue;

            results.push({
                path: line,
                name: line.split(/[\\/]/).pop(),
                isDirectory: !line.includes('.') || line.endsWith('\\')
            });
        }

        return results;
    }
}

// ============================================================================
// 高级搜索构建器
// ============================================================================

export class SearchBuilder {
    constructor() {
        this.query = '';
        this.filters = [];
    }

    name(pattern) {
        this.filters.push(pattern);
        return this;
    }

    ext(extension) {
        this.filters.push(`ext:${extension}`);
        return this;
    }

    path(pathPattern) {
        this.filters.push(`path:${pathPattern}`);
        return this;
    }

    size(operator, value) {
        this.filters.push(`size:${operator}${value}`);
        return this;
    }

    dateModified(operator, date) {
        this.filters.push(`dm:${operator}${date}`);
        return this;
    }

    dateCreated(operator, date) {
        this.filters.push(`dc:${operator}${date}`);
        return this;
    }

    file() {
        this.filters.push('file:');
        return this;
    }

    folder() {
        this.filters.push('folder:');
        return this;
    }

    not(filter) {
        this.filters.push(`!${filter}`);
        return this;
    }

    or(...filters) {
        this.filters.push(`(${filters.join(' | ')})`);
        return this;
    }

    and(...filters) {
        this.filters.push(`(${filters.join(' ')})`);
        return this;
    }

    build() {
        return this.filters.join(' ');
    }

    reset() {
        this.query = '';
        this.filters = [];
        return this;
    }
}

// ============================================================================
// 单例
// ============================================================================

let instance = null;

export function getEverythingSearch() {
    if (!instance) {
        instance = new EverythingSearch();
    }
    return instance;
}

export default {
    EverythingSearch,
    SearchBuilder,
    getEverythingSearch
};
