// kernel/skills/skill-repo.js
// HundunOS v3.9 — Skill 本地仓库管理
// 移植自 PromptHub skill-installer-repo.ts
//
// 职责：
//   - 本地 Skill 增删改查
//   - 目录扫描与索引
//   - 批量导入/导出
//   - 元数据缓存

import { join, dirname, basename, extname } from 'path';
import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync, unlinkSync, copyFileSync } from 'fs';
import { createHash } from 'crypto';

// ================================================================
// SkillRepo 类
// ================================================================

/**
 * Skill 本地仓库管理器
 */
export class SkillRepo {
    /**
     * @param {object} options
     * @param {string} options.repoDir - 仓库根目录
     * @param {object} [options.kernel] - Kernel 实例
     */
    constructor(options = {}) {
        this.repoDir = options.repoDir || join(process.env.HOME || process.env.USERPROFILE, '.hundunos', 'skills-repo');
        this.kernel = options.kernel;
        
        // 确保目录存在
        if (!existsSync(this.repoDir)) {
            mkdirSync(this.repoDir, { recursive: true });
        }
        
        // 元数据缓存
        this._metadataCache = new Map();
        this._cacheFile = join(this.repoDir, '.metadata-cache.json');
        this._loadCache();
    }

    // ================================================================
    // CRUD 操作
    // ================================================================

    /**
     * 创建新 Skill
     * @param {string} name - Skill 名称
     * @param {object} spec - Skill 定义
     * @returns {{ success: boolean, error?: string, path?: string }}
     */
    create(name, spec = {}) {
        // 验证名称
        if (!this._validateName(name)) {
            return { success: false, error: `Invalid skill name: ${name}` };
        }
        
        const skillDir = join(this.repoDir, name);
        
        // 检查是否已存在
        if (existsSync(skillDir)) {
            return { success: false, error: `Skill "${name}" already exists` };
        }
        
        try {
            // 创建目录
            mkdirSync(skillDir, { recursive: true });
            
            // 生成 SKILL.md
            const skillMd = this._generateSkillMd(name, spec);
            writeFileSync(join(skillDir, 'SKILL.md'), skillMd, 'utf-8');
            
            // 更新缓存
            this._updateCache(name, {
                name,
                version: spec.version || '1.0.0',
                description: spec.description || '',
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
            
            return { success: true, path: skillDir };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 读取 Skill
     * @param {string} name
     * @returns {{ success: boolean, spec?: object, error?: string }}
     */
    read(name) {
        const skillDir = join(this.repoDir, name);
        
        if (!existsSync(skillDir)) {
            return { success: false, error: `Skill "${name}" not found` };
        }
        
        try {
            const skillMdPath = join(skillDir, 'SKILL.md');
            
            if (existsSync(skillMdPath)) {
                const content = readFileSync(skillMdPath, 'utf-8');
                const parsed = this._parseSkillMd(content);
                return { success: true, spec: parsed };
            }
            
            // 尝试 YAML 文件
            const yamlPath = join(skillDir, `${name}.yaml`);
            if (existsSync(yamlPath)) {
                const content = readFileSync(yamlPath, 'utf-8');
                const parsed = this._parseYaml(content);
                return { success: true, spec: parsed };
            }
            
            return { success: false, error: 'No SKILL.md or YAML file found' };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 更新 Skill
     * @param {string} name
     * @param {object} updates
     * @returns {{ success: boolean, error?: string }}
     */
    update(name, updates) {
        const skillDir = join(this.repoDir, name);
        
        if (!existsSync(skillDir)) {
            return { success: false, error: `Skill "${name}" not found` };
        }
        
        try {
            const skillMdPath = join(skillDir, 'SKILL.md');
            
            if (existsSync(skillMdPath)) {
                const content = readFileSync(skillMdPath, 'utf-8');
                const parsed = this._parseSkillMd(content);
                
                // 合并更新
                const updated = { ...parsed.frontmatter, ...updates };
                const newContent = this._generateSkillMd(name, updated);
                
                writeFileSync(skillMdPath, newContent, 'utf-8');
                
                // 更新缓存
                this._updateCache(name, {
                    ...updated,
                    updatedAt: Date.now(),
                });
                
                return { success: true };
            }
            
            return { success: false, error: 'No SKILL.md found' };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 删除 Skill
     * @param {string} name
     * @returns {{ success: boolean, error?: string }}
     */
    delete(name) {
        const skillDir = join(this.repoDir, name);
        
        if (!existsSync(skillDir)) {
            return { success: false, error: `Skill "${name}" not found` };
        }
        
        try {
            // 递归删除目录
            this._removeDir(skillDir);
            
            // 移除缓存
            this._removeCache(name);
            
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 列出所有 Skill
     * @returns {Array<{ name: string, path: string, metadata: object }>}
     */
    list() {
        const skills = [];
        
        if (!existsSync(this.repoDir)) {
            return skills;
        }
        
        const entries = readdirSync(this.repoDir, { withFileTypes: true });
        
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (entry.name.startsWith('.')) continue;
            
            const skillDir = join(this.repoDir, entry.name);
            const metadata = this._metadataCache.get(entry.name) || {};
            
            skills.push({
                name: entry.name,
                path: skillDir,
                metadata,
            });
        }
        
        return skills;
    }

    /**
     * 检查 Skill 是否存在
     * @param {string} name
     * @returns {boolean}
     */
    exists(name) {
        return existsSync(join(this.repoDir, name));
    }

    // ================================================================
    // 批量操作
    // ================================================================

    /**
     * 批量导入 Skill
     * @param {string} sourceDir - 源目录
     * @param {object} options
     * @returns {{ imported: string[], failed: Array<{ name: string, error: string }> }}
     */
    importFromDir(sourceDir, options = {}) {
        const result = { imported: [], failed: [] };
        
        if (!existsSync(sourceDir)) {
            return result;
        }
        
        const entries = readdirSync(sourceDir, { withFileTypes: true });
        
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            
            const skillName = entry.name;
            const srcDir = join(sourceDir, skillName);
            
            try {
                const copyResult = this._copySkillDir(srcDir, skillName, options.overwrite);
                
                if (copyResult.success) {
                    result.imported.push(skillName);
                } else {
                    result.failed.push({ name: skillName, error: copyResult.error });
                }
            } catch (e) {
                result.failed.push({ name: skillName, error: e.message });
            }
        }
        
        return result;
    }

    /**
     * 批量导出 Skill
     * @param {string[]} skillNames - 要导出的 Skill 名称
     * @param {string} targetDir - 目标目录
     * @returns {{ exported: string[], failed: Array<{ name: string, error: string }> }}
     */
    exportToDir(skillNames, targetDir) {
        const result = { exported: [], failed: [] };
        
        if (!existsSync(targetDir)) {
            mkdirSync(targetDir, { recursive: true });
        }
        
        for (const name of skillNames) {
            const srcDir = join(this.repoDir, name);
            
            if (!existsSync(srcDir)) {
                result.failed.push({ name, error: 'Not found' });
                continue;
            }
            
            try {
                const destDir = join(targetDir, name);
                this._copyDir(srcDir, destDir);
                result.exported.push(name);
            } catch (e) {
                result.failed.push({ name, error: e.message });
            }
        }
        
        return result;
    }

    /**
     * 导出所有 Skill
     * @param {string} targetDir
     * @returns {{ exported: string[], failed: Array<{ name: string, error: string }> }}
     */
    exportAll(targetDir) {
        const skills = this.list();
        return this.exportToDir(skills.map(s => s.name), targetDir);
    }

    // ================================================================
    // 索引与搜索
    // ================================================================

    /**
     * 重建索引
     */
    rebuildIndex() {
        this._metadataCache.clear();
        
        const skills = this.list();
        
        for (const skill of skills) {
            const readResult = this.read(skill.name);
            
            if (readResult.success) {
                this._updateCache(skill.name, {
                    name: skill.name,
                    version: readResult.spec.version || '1.0.0',
                    description: readResult.spec.description || '',
                    tags: readResult.spec.tags || [],
                    updatedAt: Date.now(),
                });
            }
        }
        
        this._saveCache();
    }

    /**
     * 按标签搜索
     * @param {string} tag
     * @returns {Array<{ name: string, metadata: object }>}
     */
    findByTag(tag) {
        const results = [];
        
        for (const [name, metadata] of this._metadataCache) {
            if (metadata.tags && metadata.tags.includes(tag)) {
                results.push({ name, metadata });
            }
        }
        
        return results;
    }

    /**
     * 按描述搜索
     * @param {string} query
     * @returns {Array<{ name: string, metadata: object, score: number }>}
     */
    searchByDescription(query) {
        const results = [];
        const queryLower = query.toLowerCase();
        
        for (const [name, metadata] of this._metadataCache) {
            const desc = (metadata.description || '').toLowerCase();
            
            if (desc.includes(queryLower)) {
                const score = this._calculateScore(queryLower, desc);
                results.push({ name, metadata, score });
            }
        }
        
        // 按分数排序
        return results.sort((a, b) => b.score - a.score);
    }

    // ================================================================
    // 内部方法
    // ================================================================

    _validateName(name) {
        return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) && name.length <= 64;
    }

    _generateSkillMd(name, spec) {
        const frontmatter = [
            `name: ${name}`,
            `version: ${spec.version || '1.0.0'}`,
            spec.description ? `description: ${spec.description}` : '',
            spec.author ? `author: ${spec.author}` : '',
            spec.tags?.length ? `tags: [${spec.tags.join(', ')}]` : '',
        ].filter(Boolean).join('\n');

        const body = spec.system_prompt || spec.instructions || `# ${name}\n\nSkill instructions here.`;
        
        return `---\n${frontmatter}\n---\n\n${body}`;
    }

    _parseSkillMd(content) {
        const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        
        if (!match) {
            return { frontmatter: {}, body: content };
        }
        
        const frontmatter = this._parseYaml(match[1]);
        const body = match[2].trim();
        
        return { frontmatter, body };
    }

    _parseYaml(content) {
        const result = {};
        const lines = content.split('\n');
        let currentKey = null;
        let currentArray = [];
        let inArray = false;
        
        for (const line of lines) {
            if (line.trimStart().startsWith('- ')) {
                inArray = true;
                const value = line.trimStart().slice(2).trim().replace(/^['"]|['"]$/g, '');
                currentArray.push(value);
                continue;
            }
            
            if (inArray && !line.trimStart().startsWith('- ')) {
                if (currentKey) {
                    result[currentKey] = currentArray;
                }
                currentArray = [];
                inArray = false;
            }
            
            const colonIndex = line.indexOf(':');
            if (colonIndex === -1) continue;
            
            const key = line.slice(0, colonIndex).trim();
            let value = line.slice(colonIndex + 1).trim();
            
            currentKey = key;
            
            if (!value) continue;
            
            value = value.replace(/^['"]|['"]$/g, '');
            
            if (value.startsWith('[') && value.endsWith(']')) {
                result[key] = value.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
            } else if (value === 'true') {
                result[key] = true;
            } else if (value === 'false') {
                result[key] = false;
            } else if (/^\d+(\.\d+)?$/.test(value)) {
                result[key] = parseFloat(value);
            } else {
                result[key] = value;
            }
        }
        
        if (inArray && currentKey) {
            result[currentKey] = currentArray;
        }
        
        return result;
    }

    _copySkillDir(srcDir, name, overwrite = false) {
        const destDir = join(this.repoDir, name);
        
        if (existsSync(destDir) && !overwrite) {
            return { success: false, error: 'Already exists' };
        }
        
        this._copyDir(srcDir, destDir);
        
        return { success: true };
    }

    _copyDir(src, dest) {
        if (!existsSync(dest)) {
            mkdirSync(dest, { recursive: true });
        }
        
        const entries = readdirSync(src, { withFileTypes: true });
        
        for (const entry of entries) {
            const srcPath = join(src, entry.name);
            const destPath = join(dest, entry.name);
            
            if (entry.isDirectory()) {
                this._copyDir(srcPath, destPath);
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
                unlinkSync(path);
            }
        }
        
        const { rmdirSync } = require('fs');
        rmdirSync(dir);
    }

    _calculateScore(query, text) {
        const words = query.split(/\s+/);
        let score = 0;
        
        for (const word of words) {
            const regex = new RegExp(word, 'gi');
            const matches = text.match(regex);
            if (matches) {
                score += matches.length;
            }
        }
        
        return score;
    }

    // ================================================================
    // 缓存管理
    // ================================================================

    _loadCache() {
        try {
            if (existsSync(this._cacheFile)) {
                const content = readFileSync(this._cacheFile, 'utf-8');
                const data = JSON.parse(content);
                
                for (const [key, value] of Object.entries(data)) {
                    this._metadataCache.set(key, value);
                }
            }
        } catch (e) {
            // 忽略加载错误
        }
    }

    _saveCache() {
        try {
            const data = Object.fromEntries(this._metadataCache);
            writeFileSync(this._cacheFile, JSON.stringify(data, null, 2), 'utf-8');
        } catch (e) {
            // 忽略保存错误
        }
    }

    _updateCache(name, metadata) {
        this._metadataCache.set(name, metadata);
        this._saveCache();
    }

    _removeCache(name) {
        this._metadataCache.delete(name);
        this._saveCache();
    }

    // ================================================================
    // 统计
    // ================================================================

    getStats() {
        return {
            repoDir: this.repoDir,
            skillCount: this._metadataCache.size,
            cacheSize: this._metadataCache.size,
        };
    }
}

export default SkillRepo;
