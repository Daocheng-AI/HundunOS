/**
 * HundunOS v3.0 - Search Extension
 * 搜索扩展模块
 * 
 * 功能:
 * - Everything 搜索集成
 * - 文件内容搜索
 * - 多源聚合搜索
 */

import { EventEmitter } from 'events';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';

// ============================================================================
// 搜索类型
// ============================================================================

export const SearchType = {
    FILE_NAME:   'file_name',    // 文件名搜索
    FILE_CONTENT: 'file_content', // 文件内容搜索
    EVERYTHING:  'everything',   // Everything 搜索
    WEB:        'web',           // 网络搜索
    MEMORY:     'memory'         // 记忆搜索
};

/**
 * 搜索结果
 */
export class SearchResult {
    constructor(type, data) {
        this.type = type;
        this.path = data.path || '';
        this.name = data.name || '';
        this.snippet = data.snippet || '';
        this.score = data.score || 1;
        this.metadata = data.metadata || {};
        this.timestamp = new Date().toISOString();
    }
}

// ============================================================================
// Search Extension
// ============================================================================

export class SearchExtension extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            everythingPath: config.everythingPath || 'C:\\Program Files\\Everything\\es.exe',
            maxResults: config.maxResults || 100,
            searchTimeout: config.searchTimeout || 10000,
            ...config
        };

        this.cache = new Map();
        this.index = new Map();

        // review: removed // review: removed console.log('[Search] Extension initialized');
    }

    // ========================================================================
    // 搜索接口
    // ========================================================================

    /**
     * 统一搜索入口
     */
    async search(query, options = {}) {
        const type = options.type || SearchType.FILE_NAME;
        const startTime = Date.now();

        // review: removed // review: removed console.log(`[Search] Searching: ${query} (type: ${type})`);
        this.emit('search_start', { query, type });

        let results;

        switch (type) {
            case SearchType.EVERYTHING:
                results = await this._searchEverything(query, options);
                break;
            case SearchType.FILE_CONTENT:
                results = await this._searchFileContent(query, options);
                break;
            case SearchType.FILE_NAME:
            default:
                results = await this._searchFileName(query, options);
        }

        const elapsed = Date.now() - startTime;

        // review: removed // review: removed console.log(`[Search] Found ${results.length} results in ${elapsed}ms`);
        this.emit('search_complete', { query, type, count: results.length, elapsed });

        return {
            query,
            type,
            results: results.slice(0, options.limit || this.config.maxResults),
            total: results.length,
            elapsed
        };
    }

    /**
     * Everything 搜索
     */
    async searchEverything(query, options = {}) {
        return this.search(query, { ...options, type: SearchType.EVERYTHING });
    }

    /**
     * 文件内容搜索
     */
    async searchContent(query, options = {}) {
        return this.search(query, { ...options, type: SearchType.FILE_CONTENT });
    }

    // ========================================================================
    // 内部搜索实现
    // ========================================================================

    async _searchFileName(query, options) {
        const results = [];
        const searchPath = path.resolve(options.path || process.cwd());
        const regex = new RegExp(query, 'i');

        // 标准化路径比较（处理 Windows 大小写 + 符号链接）
        const normalizePath = (p) => p.replace(/\\/g, '/').toLowerCase();

        const walk = (dir) => {
            if (!fs.existsSync(dir)) return;
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const full = path.join(dir, item);
                // 路径穿越防护：确保解析后路径仍在搜索根目录下（Windows 大小写不敏感）
                const resolved = path.resolve(full);
                if (!normalizePath(resolved).startsWith(normalizePath(searchPath) + '/') && 
                    normalizePath(resolved) !== normalizePath(searchPath)) {
                    continue; // 跳过试图逃逸搜索边界的路径
                }
                try {
                    const stat = fs.lstatSync(full); // lstatSync 解析 symlink
                    const realStat = stat.isSymbolicLink() ? fs.statSync(full) : stat;
                    if (regex.test(item)) {
                        results.push(new SearchResult(SearchType.FILE_NAME, {
                            path: full,
                            name: item,
                            score: item.toLowerCase() === query.toLowerCase() ? 1 : 0.8,
                            metadata: {
                                isDirectory: realStat.isDirectory(),
                                size: realStat.size,
                                modified: realStat.mtime
                            }
                        }));
                    }
                    if (stat.isDirectory() && !item.startsWith('.') && results.length < this.config.maxResults) {
                        walk(full);
                    }
                } catch (e) {
                    // 跳过无法访问的文件
                }
            }
        };

        walk(searchPath);
        return results.sort((a, b) => b.score - a.score);
    }

    async _searchEverything(query, options) {
        return new Promise((resolve) => {
            // 安全修复：使用 execFile 替代 exec，避免命令注入
            // 参数数组形式，query 作为独立参数传递
            const args = ['-n', String(this.config.maxResults), query];

            execFile(this.config.everythingPath, args, { timeout: this.config.searchTimeout }, (err, stdout) => {
                if (err) {
                    console.error('[Search] Everything error:', err.message);
                    resolve([]);
                    return;
                }

                const results = stdout.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => new SearchResult(SearchType.EVERYTHING, {
                        path: line,
                        name: path.basename(line),
                        score: 1
                    }));

                resolve(results);
            });
        });
    }

    async _searchFileContent(query, options) {
        const results = [];
        const searchPath = path.resolve(options.path || process.cwd());
        const extensions = options.extensions || ['.js', '.ts', '.py', '.md', '.txt', '.json'];
        // 创建正则时使用 new RegExp 每次重置 lastIndex
        const createRegex = () => new RegExp(query, 'gi');

        const searchFile = (filePath) => {
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');
                const matches = [];
                const regex = createRegex();  // 每个文件创建新的正则

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    regex.lastIndex = 0;  // 重置 lastIndex
                    if (regex.test(line)) {
                        matches.push({
                            line: i + 1,
                            content: line.trim().slice(0, 200)
                        });
                    }
                }

                if (matches.length > 0) {
                    results.push(new SearchResult(SearchType.FILE_CONTENT, {
                        path: filePath,
                        name: path.basename(filePath),
                        snippet: matches[0].content,
                        score: matches.length,
                        metadata: { matches }
                    }));
                }
            } catch (e) {
                // 跳过二进制文件等
            }
        };

        const walk = (dir) => {
            if (!fs.existsSync(dir)) return;
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const full = path.join(dir, item);
                // 路径穿越防护（Windows 大小写不敏感）
                const resolved = path.resolve(full);
                if (!normalizePath(resolved).startsWith(normalizePath(searchPath) + '/') && 
                    normalizePath(resolved) !== normalizePath(searchPath)) {
                    continue;
                }
                try {
                    const stat = fs.lstatSync(full);
                    if (stat.isDirectory() && !item.startsWith('.') && !item.includes('node_modules')) {
                        walk(full);
                    } else if (stat.isFile() && extensions.some(ext => item.endsWith(ext))) {
                        searchFile(full);
                    }
                } catch (e) {
                    // 跳过
                }
            }
        };

        walk(searchPath);
        return results.sort((a, b) => b.score - a.score);
    }

    // ========================================================================
    // 索引管理
    // ========================================================================

    /**
     * 建立索引
     */
    async buildIndex(targetPath) {
        // review: removed // review: removed console.log(`[Search] Building index for ${targetPath}`);
        const index = new Map();
        const rootPath = path.resolve(targetPath);

        // 标准化路径比较
        const normalizePath = (p) => p.replace(/\\/g, '/').toLowerCase();

        const walk = (dir) => {
            if (!fs.existsSync(dir)) return;
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const full = path.join(dir, item);
                // 路径穿越防护（Windows 大小写不敏感）
                const resolved = path.resolve(full);
                if (!normalizePath(resolved).startsWith(normalizePath(rootPath) + '/') && 
                    normalizePath(resolved) !== normalizePath(rootPath)) {
                    continue;
                }
                try {
                    const stat = fs.lstatSync(full);
                    index.set(full.toLowerCase(), {
                        path: full,
                        name: item,
                        isDirectory: stat.isDirectory()
                    });
                    if (stat.isDirectory() && !item.startsWith('.')) {
                        walk(full);
                    }
                } catch (e) {
                    // 跳过
                }
            }
        };

        walk(rootPath);
        this.index = index;
        // review: removed // review: removed console.log(`[Search] Index built: ${index.size} items`);

        return { indexed: index.size };
    }

    /**
     * 快速搜索（使用索引）
     */
    quickSearch(query) {
        const results = [];
        const lowerQuery = query.toLowerCase();

        for (const [key, item] of this.index) {
            if (key.includes(lowerQuery)) {
                results.push(new SearchResult(SearchType.FILE_NAME, {
                    path: item.path,
                    name: item.name,
                    score: item.name.toLowerCase() === lowerQuery ? 1 : 0.8
                }));
            }
        }

        return results.sort((a, b) => b.score - a.score).slice(0, this.config.maxResults);
    }

    /**
     * 获取状态
     */
    getStatus() {
        return {
            cacheSize: this.cache.size,
            indexSize: this.index.size,
            everythingAvailable: fs.existsSync(this.config.everythingPath)
        };
    }
}

// ============================================================================
// 单例
// ============================================================================

let instance = null;

export function getSearchExtension() {
    if (!instance) {
        instance = new SearchExtension();
    }
    return instance;
}

export default {
    SearchExtension,
    getSearchExtension,
    SearchType,
    SearchResult
};
