// kernel/skills/skill-version.js
// HundunOS v3.9 — Skill 版本管理系统
// 
// 职责：
//   - semver 版本解析与比较
//   - 增量更新检测（etag / last-modified）
//   - 回滚到指定版本
//   - 版本历史记录

import { join, dirname } from 'path';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, statSync } from 'fs';

// ================================================================
// Semver 工具
// ================================================================

/**
 * 解析 semver 版本字符串
 * @param {string} version
 * @returns {{ major: number, minor: number, patch: number, prerelease: string[] | null }}
 */
export function parseVersion(version) {
    const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$/);
    
    if (!match) {
        return null;
    }
    
    return {
        major: parseInt(match[1], 10),
        minor: parseInt(match[2], 10),
        patch: parseInt(match[3], 10),
        prerelease: match[4] ? match[4].split('.') : null,
        build: match[5] || null,
    };
}

/**
 * 比较两个版本
 * @param {string} v1
 * @param {string} v2
 * @returns {-1 | 0 | 1} -1: v1 < v2, 0: v1 == v2, 1: v1 > v2
 */
export function compareVersions(v1, v2) {
    const p1 = parseVersion(v1);
    const p2 = parseVersion(v2);
    
    if (!p1 || !p2) {
        throw new Error('Invalid version format');
    }
    
    // 比较 major
    if (p1.major !== p2.major) {
        return p1.major < p2.major ? -1 : 1;
    }
    
    // 比较 minor
    if (p1.minor !== p2.minor) {
        return p1.minor < p2.minor ? -1 : 1;
    }
    
    // 比较 patch
    if (p1.patch !== p2.patch) {
        return p1.patch < p2.patch ? -1 : 1;
    }
    
    // 比较 prerelease
    if (p1.prerelease && !p2.prerelease) return -1;
    if (!p1.prerelease && p2.prerelease) return 1;
    
    if (p1.prerelease && p2.prerelease) {
        for (let i = 0; i < Math.max(p1.prerelease.length, p2.prerelease.length); i++) {
            const pre1 = p1.prerelease[i];
            const pre2 = p2.prerelease[i];
            
            if (pre1 === undefined) return -1;
            if (pre2 === undefined) return 1;
            
            const num1 = parseInt(pre1, 10);
            const num2 = parseInt(pre2, 10);
            
            if (isNaN(num1) && isNaN(num2)) {
                const cmp = pre1.localeCompare(pre2);
                if (cmp !== 0) return cmp;
            } else if (isNaN(num1)) {
                return 1;
            } else if (isNaN(num2)) {
                return -1;
            } else if (num1 !== num2) {
                return num1 < num2 ? -1 : 1;
            }
        }
    }
    
    return 0;
}

/**
 * 检查版本是否满足约束
 * @param {string} version
 * @param {string} constraint - 如 '>=1.0.0', '^2.0.0', '~1.2.0'
 * @returns {boolean}
 */
export function satisfies(version, constraint) {
    const parsed = parseVersion(version);
    if (!parsed) return false;
    
    constraint = constraint.trim();
    
    // 精确匹配
    if (/^\d/.test(constraint)) {
        return compareVersions(version, constraint) === 0;
    }
    
    // 范围约束
    const match = constraint.match(/^([<>=!]+)\s*(.+)$/);
    if (!match) return false;
    
    const [, operator, target] = match;
    const cmp = compareVersions(version, target);
    
    switch (operator) {
        case '=':
        case '==':
        case '===':
            return cmp === 0;
        case '>':
            return cmp > 0;
        case '>=':
            return cmp >= 0;
        case '<':
            return cmp < 0;
        case '<=':
            return cmp <= 0;
        case '^':
            // 兼容版本：相同 major
            const targetParsed = parseVersion(target);
            return parsed.major === targetParsed.major && 
                   compareVersions(version, target) >= 0;
        case '~':
            // 近似版本：相同 major.minor
            const approxParsed = parseVersion(target);
            return parsed.major === approxParsed.major &&
                   parsed.minor === approxParsed.minor &&
                   compareVersions(version, target) >= 0;
        default:
            return false;
    }
}

/**
 * 增加版本号
 * @param {string} version
 * @param {'major' | 'minor' | 'patch'} type
 * @returns {string}
 */
export function incrementVersion(version, type = 'patch') {
    const parsed = parseVersion(version);
    if (!parsed) return '0.0.1';
    
    switch (type) {
        case 'major':
            return `${parsed.major + 1}.0.0`;
        case 'minor':
            return `${parsed.major}.${parsed.minor + 1}.0`;
        case 'patch':
        default:
            return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
    }
}

// ================================================================
// SkillVersionManager 类
// ================================================================

/**
 * Skill 版本管理器
 */
export class SkillVersionManager {
    /**
     * @param {object} options
     * @param {string} options.versionsDir - 版本存储目录
     * @param {object} [options.kernel] - Kernel 实例
     */
    constructor(options = {}) {
        this.versionsDir = options.versionsDir || join(process.env.HOME || process.env.USERPROFILE, '.hundunos', 'skill-versions');
        this.kernel = options.kernel;
        
        // 确保目录存在
        if (!existsSync(this.versionsDir)) {
            mkdirSync(this.versionsDir, { recursive: true });
        }
        
        // 版本历史索引
        this._historyIndex = new Map();
        this._loadHistoryIndex();
    }

    // ================================================================
    // 版本快照
    // ================================================================

    /**
     * 创建版本快照
     * @param {string} skillName
     * @param {string} skillPath - Skill 目录路径
     * @param {object} options
     * @returns {{ success: boolean, version?: string, error?: string }}
     */
    createSnapshot(skillName, skillPath, options = {}) {
        if (!existsSync(skillPath)) {
            return { success: false, error: `Skill path not found: ${skillPath}` };
        }
        
        // 确定版本号
        const version = options.version || this._getNextVersion(skillName);
        
        // 验证版本格式
        if (!parseVersion(version)) {
            return { success: false, error: `Invalid version format: ${version}` };
        }
        
        // 创建版本目录
        const versionDir = join(this.versionsDir, skillName, version.replace(/^v/, ''));
        
        if (existsSync(versionDir)) {
            return { success: false, error: `Version ${version} already exists` };
        }
        
        try {
            mkdirSync(versionDir, { recursive: true });
            
            // 复制文件
            this._copySkillFiles(skillPath, versionDir);
            
            // 创建元数据
            const metadata = {
                skillName,
                version,
                createdAt: Date.now(),
                message: options.message || '',
                author: options.author || 'system',
                checksum: this._calculateChecksum(skillPath),
            };
            
            writeFileSync(join(versionDir, '.version-meta.json'), JSON.stringify(metadata, null, 2), 'utf-8');
            
            // 更新历史索引
            this._addToHistory(skillName, metadata);
            
            return { success: true, version };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 恢复到指定版本
     * @param {string} skillName
     * @param {string} version
     * @param {string} targetPath - 恢复目标路径
     * @returns {{ success: boolean, error?: string }}
     */
    restore(skillName, version, targetPath) {
        const versionDir = join(this.versionsDir, skillName, version.replace(/^v/, ''));
        
        if (!existsSync(versionDir)) {
            return { success: false, error: `Version ${version} not found` };
        }
        
        try {
            // 备份当前版本
            if (existsSync(targetPath)) {
                const backupDir = `${targetPath}.backup-${Date.now()}`;
                this._copySkillFiles(targetPath, backupDir);
            }
            
            // 恢复文件
            this._copySkillFiles(versionDir, targetPath);
            
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 列出所有版本
     * @param {string} skillName
     * @returns {Array<{ version: string, createdAt: number, message: string }>}
     */
    listVersions(skillName) {
        const versions = [];
        const skillVersionsDir = join(this.versionsDir, skillName);
        
        if (!existsSync(skillVersionsDir)) {
            return versions;
        }
        
        const entries = readdirSync(skillVersionsDir, { withFileTypes: true });
        
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            
            const metaPath = join(skillVersionsDir, entry.name, '.version-meta.json');
            
            if (existsSync(metaPath)) {
                try {
                    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
                    versions.push({
                        version: meta.version,
                        createdAt: meta.createdAt,
                        message: meta.message,
                        author: meta.author,
                    });
                } catch (e) {
                    // 忽略解析错误
                }
            }
        }
        
        // 按版本号排序
        return versions.sort((a, b) => compareVersions(b.version, a.version));
    }

    /**
     * 获取最新版本
     * @param {string} skillName
     * @returns {string | null}
     */
    getLatestVersion(skillName) {
        const versions = this.listVersions(skillName);
        return versions.length > 0 ? versions[0].version : null;
    }

    /**
     * 删除版本
     * @param {string} skillName
     * @param {string} version
     * @returns {{ success: boolean, error?: string }}
     */
    deleteVersion(skillName, version) {
        const versionDir = join(this.versionsDir, skillName, version.replace(/^v/, ''));
        
        if (!existsSync(versionDir)) {
            return { success: false, error: `Version ${version} not found` };
        }
        
        try {
            this._removeDir(versionDir);
            this._removeFromHistory(skillName, version);
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // ================================================================
    // 更新检测
    // ================================================================

    /**
     * 检测远程更新
     * @param {string} skillName
     * @param {string} remoteUrl
     * @returns {Promise<{ hasUpdate: boolean, latestVersion?: string, error?: string }>}
     */
    async checkForUpdate(skillName, remoteUrl) {
        // 获取本地最新版本
        const localVersion = this.getLatestVersion(skillName);
        
        // 获取远程版本信息
        try {
            const { safeFetch } = await import('./skill-remote.js');
            
            // 尝试获取版本信息
            const versionUrl = remoteUrl.replace(/\.yaml$/, '.version.json');
            const result = await safeFetch(versionUrl, { timeout: 5000 });
            
            if (!result.success) {
                // 如果没有版本文件，尝试直接比较
                return { hasUpdate: false };
            }
            
            const versionInfo = JSON.parse(result.content);
            const remoteVersion = versionInfo.version;
            
            if (!remoteVersion) {
                return { hasUpdate: false };
            }
            
            // 比较版本
            if (!localVersion || compareVersions(remoteVersion, localVersion) > 0) {
                return { hasUpdate: true, latestVersion: remoteVersion };
            }
            
            return { hasUpdate: false };
        } catch (e) {
            return { hasUpdate: false, error: e.message };
        }
    }

    // ================================================================
    // 内部方法
    // ================================================================

    _getNextVersion(skillName) {
        const versions = this.listVersions(skillName);
        
        if (versions.length === 0) {
            return '1.0.0';
        }
        
        const latest = versions[0].version;
        return incrementVersion(latest, 'patch');
    }

    _copySkillFiles(src, dest) {
        if (!existsSync(dest)) {
            mkdirSync(dest, { recursive: true });
        }
        
        const entries = readdirSync(src, { withFileTypes: true });
        
        for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;
            
            const srcPath = join(src, entry.name);
            const destPath = join(dest, entry.name);
            
            if (entry.isDirectory()) {
                this._copySkillFiles(srcPath, destPath);
            } else {
                copyFileSync(srcPath, destPath);
            }
        }
    }

    _removeDir(dir) {
        if (!existsSync(dir)) return;
        
        const entries = readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const path = join(dir, entry.name);
            
            if (entry.isDirectory()) {
                this._removeDir(path);
            } else {
                const { unlinkSync } = require('fs');
                unlinkSync(path);
            }
        }
        
        const { rmdirSync } = require('fs');
        rmdirSync(dir);
    }

    _calculateChecksum(skillPath) {
        const entries = readdirSync(skillPath, { withFileTypes: true });
        const hashes = [];
        
        for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;
            
            const filePath = join(skillPath, entry.name);
            
            if (entry.isFile()) {
                const content = readFileSync(filePath);
                const { createHash } = require('crypto');
                hashes.push(createHash('md5').update(content).digest('hex'));
            }
        }
        
        const { createHash } = require('crypto');
        return createHash('md5').update(hashes.join('')).digest('hex');
    }

    _loadHistoryIndex() {
        const indexPath = join(this.versionsDir, '.history-index.json');
        
        try {
            if (existsSync(indexPath)) {
                const data = JSON.parse(readFileSync(indexPath, 'utf-8'));
                
                for (const [key, value] of Object.entries(data)) {
                    this._historyIndex.set(key, value);
                }
            }
        } catch (e) {
            // 忽略加载错误
        }
    }

    _saveHistoryIndex() {
        const indexPath = join(this.versionsDir, '.history-index.json');
        
        try {
            const data = Object.fromEntries(this._historyIndex);
            writeFileSync(indexPath, JSON.stringify(data, null, 2), 'utf-8');
        } catch (e) {
            // 忽略保存错误
        }
    }

    _addToHistory(skillName, metadata) {
        if (!this._historyIndex.has(skillName)) {
            this._historyIndex.set(skillName, []);
        }
        
        const history = this._historyIndex.get(skillName);
        history.push({
            version: metadata.version,
            createdAt: metadata.createdAt,
            message: metadata.message,
        });
        
        this._saveHistoryIndex();
    }

    _removeFromHistory(skillName, version) {
        if (!this._historyIndex.has(skillName)) return;
        
        const history = this._historyIndex.get(skillName);
        const filtered = history.filter(h => h.version !== version);
        
        this._historyIndex.set(skillName, filtered);
        this._saveHistoryIndex();
    }

    // ================================================================
    // 统计
    // ================================================================

    getStats() {
        let totalVersions = 0;
        
        for (const [, history] of this._historyIndex) {
            totalVersions += history.length;
        }
        
        return {
            versionsDir: this.versionsDir,
            skillsWithVersions: this._historyIndex.size,
            totalVersions,
        };
    }
}

export default SkillVersionManager;
