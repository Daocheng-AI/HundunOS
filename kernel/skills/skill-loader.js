/**
 * kernel/skills/skill-loader.js v4.2
 * Phase 3: Skills 渐进式加载系统
 *
 * 三级加载架构：
 *   Level 1 - Metadata（~100 tokens/skill，始终加载）
 *     name, version, description, tags, trigger.patterns
 *
 *   Level 2 - Instructions（<5k tokens，触发时加载）
 *     system_prompt, tool schemas, execution config
 *
 *   Level 3 - Resources（按需加载）
 *     scripts, endpoints, auth configs, external references
 *
 * 设计原则：
 *   - 冷启动只加载 L1，最小化内存/时间开销
 *   - L2 在 skill.match() 时预热，避免首次执行延迟
 *   - L3 在工具实际执行时按需加载
 *   - 支持并行加载多个 skill
 * 
 * v4.2: 集成 OpenHarness YAML Frontmatter 解析
 *   - 支持 `--- yaml ---` 格式
 *   - 与 OpenHarness SKILL.md 生态兼容
 *   - Fallback 到标题/首段提取
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYAML } from 'yaml';

// 各层级预估 token 数（用于日志/调试）
const LEVEL_TOKEN_ESTIMATE = {
    1: 100,    // Level 1 metadata
    2: 3000,   // Level 2 instructions (worst case)
    3: 0,      // Level 3 resources (variable, not counted upfront)
};

/**
 * 解析 Markdown 文件中的 YAML Frontmatter
 * v4.2: 参考 OpenHarness skills/loader.py _parse_skill_markdown
 * 
 * 支持格式：
 *   ---
 *   name: my-skill
 *   description: A brief description
 *   version: 1.0.0
 *   tags: [tag1, tag2]
 *   ---
 *   
 *   # Skill Content
 *   ...
 * 
 * @param {string} defaultName - 默认名称（从文件名提取）
 * @param {string} content - Markdown 文件内容
 * @returns {{name: string, description: string, metadata: object, body: string}}
 */
export function parseSkillMarkdown(defaultName, content) {
    const result = {
        name: defaultName,
        description: '',
        version: '1.0.0',
        tags: [],
        metadata: {},
        body: content,
    };

    // 尝试 YAML frontmatter 解析
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    
    if (frontmatterMatch) {
        const yamlContent = frontmatterMatch[1].trim();
        result.body = frontmatterMatch[2].trim();

        try {
            // 使用 yaml 解析器
            const parsed = parseYAML(yamlContent);
            
            // 提取标准字段
            if (parsed.name) result.name = parsed.name;
            if (parsed.description) result.description = parsed.description;
            if (parsed.version) result.version = parsed.version;
            if (parsed.tags) {
                result.tags = Array.isArray(parsed.tags) 
                    ? parsed.tags 
                    : parsed.tags.split(',').map(t => t.trim());
            }
            
            // 保存其他元数据
            result.metadata = { ...parsed };
            
            // 提取 trigger 信息
            if (parsed.triggers || parsed.trigger) {
                result.metadata.trigger = parsed.triggers || parsed.trigger;
            }
            
        } catch (e) {
            console.warn('[SkillLoader] YAML frontmatter parse failed, using fallback:', e.message);
        }
    }

    // Fallback: 从标题提取名称
    if (!result.name || result.name === defaultName) {
        const titleMatch = content.match(/^#\s+(.+)$/m);
        if (titleMatch) {
            result.name = titleMatch[1].trim() || defaultName;
        }
    }

    // Fallback: 从首段提取描述
    if (!result.description) {
        // 跳过 frontmatter 后的第一个非空段落
        const bodyContent = result.body || content;
        const lines = bodyContent.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
                result.description = trimmed.slice(0, 200);
                break;
            }
        }
    }

    // 如果仍然没有描述，使用默认值
    if (!result.description) {
        result.description = `Skill: ${result.name}`;
    }

    return result;
}

/**
 * 从 Markdown 文件加载 Skill
 * v4.2: 支持 YAML frontmatter
 * 
 * @param {string} filePath - Skill 文件路径
 * @param {string} defaultName - 默认名称
 * @returns {object|null}
 */
export function loadSkillFromMarkdown(filePath, defaultName) {
    if (!existsSync(filePath)) {
        return null;
    }

    try {
        const content = readFileSync(filePath, 'utf-8');
        const parsed = parseSkillMarkdown(defaultName, content);
        
        return {
            ...parsed,
            path: filePath,
            source: 'markdown',
            loadLevel: 1, // Level 1 metadata
        };
    } catch (e) {
        console.error(`[SkillLoader] Failed to load skill from ${filePath}:`, e.message);
        return null;
    }
}

/**
 * 获取 Skill 定义的轻量摘要（Level 1）
 * 用于快速匹配而不加载完整内容
 */
export function extractMetadata(skillDef) {
    return {
        name: skillDef.name,
        version: skillDef.version,
        description: skillDef.description || '',
        tags: Array.isArray(skillDef.tags) ? skillDef.tags : [],
        trigger: skillDef.trigger || { patterns: [], semantic: false },
        // 工具数量（不加载工具详情）
        toolCount: Array.isArray(skillDef.tools) ? skillDef.tools.length : 0,
    };
}

/**
 * Skill 加载状态枚举
 */
export const LoadLevel = {
    NOT_LOADED: 0,  // 尚未加载（仅路径已知）
    L1_METADATA: 1, // 仅元数据
    L2_INSTRUCTIONS: 2, // 指令+工具定义
    L3_RESOURCES: 3, // 完整加载
};

/**
 * SkillLazyLoader - 管理 Skill 的渐进式加载
 *
 * @example
 *   const loader = new SkillLazyLoader(skillRegistry);
 *   // 冷启动：仅加载 metadata
 *   await loader.loadLevel1All();
 *   // 触发匹配：预热 L2
 *   await loader.warmLevel2('github');
 *   // 执行工具：加载 L3
 *   await loader.loadLevel3Tool('github', 'github_create_issue');
 */
export class SkillLazyLoader {
    /**
     * @param {object} registry - SkillRegistry 实例
     */
    constructor(registry) {
        this.registry = registry;

        /**
         * skillName -> 当前加载级别
         * @type {Map<string, number>}
         */
        this._loadState = new Map();

        /**
         * skillName -> 原始 YAML 内容缓存（用于 L2/L3 延迟解析）
         * @type {Map<string, string>}
         */
        this._yamlCache = new Map();

        /**
         * skillName -> 解析后的完整 skill 对象（复用）
         * @type {Map<string, object>}
         */
        this._fullDefCache = new Map();

        /**
         * 加载统计
         */
        this._stats = {
            l1Count: 0,
            l2Count: 0,
            l3Count: 0,
            bytesSaved: 0, // L2/L3 未加载时节省的内存
        };
    }

    // ================================================================
    // Level 1: 元数据加载（冷启动路径）
    // ================================================================

    /**
     * 加载所有 Skill 的 Level 1 元数据
     * 仅解析 metadata 字段，延迟 system_prompt/tools/execution
     * @returns {Promise<{loaded: number, failed: number}>}
     */
    async loadLevel1All() {
        const skillDir = this.registry.skillsDir;
        if (!existsSync(skillDir)) {
            return { loaded: 0, failed: 0 };
        }

        const { readdirSync } = await import('fs');
        let entries;
        try {
            entries = readdirSync(skillDir, { withFileTypes: true });
        } catch (e) {
            console.warn(`[SkillLazyLoader] Cannot read dir: ${e.message}`);
            return { loaded: 0, failed: 0 };
        }

        let loaded = 0;
        let failed = 0;

        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith('.yaml')) continue;

            const yamlPath = join(skillDir, entry.name);
            try {
                const meta = await this._loadLevel1(yamlPath);
                if (meta) {
                    loaded++;
                    this._stats.l1Count++;
                    // 注册轻量 metadata
                    this.registry._registerLightweight(meta);
                    this._loadState.set(meta.name, LoadLevel.L1_METADATA);
                }
            } catch (e) {
                failed++;
                console.warn(`[SkillLazyLoader] L1 failed for ${entry.name}: ${e.message}`);
            }
        }

        console.log(`[SkillLazyLoader] Level1: ${loaded} skills loaded (${failed} failed)`);
        return { loaded, failed };
    }

    /**
     * 加载单个 Skill 的 Level 1 元数据
     * @param {string} yamlPath
     * @returns {Promise<object>} metadata
     */
    async _loadLevel1(yamlPath) {
        const content = readFileSync(yamlPath, 'utf-8');

        // 快速解析：只提取 L1 字段（避免解析整个 YAML）
        const meta = this._extractL1FromYaml(content);
        meta.path = yamlPath;

        if (!meta.name) {
            const basename = yamlPath.replace(/\\/g, '/').split('/').pop().replace('.yaml', '');
            meta.name = basename;
        }

        // 缓存 YAML 原文（用于后续 L2/L3）
        this._yamlCache.set(meta.name, content);

        return meta;
    }

    /**
     * 从 YAML 内容中提取 Level 1 字段（不完整解析整个文件）
     * 只取 name/version/description/tags/trigger/tools(count)
     */
    _extractL1FromYaml(content) {
        const lines = content.split('\n');
        const result = {};
        let inFrontMatter = false;
        let currentKey = '';
        let currentIndent = 0;
        let toolCount = 0;
        let inTools = false;
        let toolsIndent = 0;

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            const line = rawLine.replace(/\r$/, '');
            const trimmed = line.trim();

            // 跳过注释
            if (trimmed.startsWith('#')) continue;

            // 跳过 YAML frontmatter
            if (trimmed === '---') {
                inFrontMatter = !inFrontMatter;
                continue;
            }

            // 计算缩进
            const indent = line.search(/\S/);
            if (indent === -1) {
                // 空行
                inTools = false;
                continue;
            }

            const isArrayItem = trimmed.startsWith('- ');
            const kvMatch = trimmed.match(/^(\w[\w-]*)\s*:\s*(.*)$/);

            if (kvMatch) {
                const [, key, rawVal] = kvMatch;
                currentKey = key;
                currentIndent = indent;
                const val = rawVal.trim();

                // Level 1 字段
                if (['name', 'version', 'description', 'tags', 'trigger', 'tools'].includes(key)) {
                    if (key === 'tools') {
                        inTools = true;
                        toolsIndent = indent;
                        toolCount = 0;
                        // tools 为空或 [] 时值是空的
                        if (val === '[]' || val === '') {
                            result.tools = [];
                            inTools = false;
                        }
                    } else if (key === 'trigger') {
                        // trigger 对象在 L1 只记录 patterns 的第一行
                        result.trigger = { patterns: [], semantic: false };
                        if (val && val !== '' && val !== '|' && val !== '>') {
                            result.trigger = this._parseInlineTrigger(val) || result.trigger;
                        }
                    } else if (key === 'tags' && val) {
                        result.tags = this._parseInlineArray(val);
                    } else {
                        result[key] = this._unquote(val) || '';
                    }
                }
            } else if (isArrayItem && inTools) {
                toolCount++;
            } else if (inTools && indent <= toolsIndent && trimmed && !isArrayItem) {
                // tools 块结束
                inTools = false;
            }
        }

        result.tools = []; // L1 不加载工具详情
        result.toolCount = toolCount;

        // 默认值
        result.version = result.version || '1.0.0';
        result.description = result.description || '';
        result.tags = result.tags || [];
        result.trigger = result.trigger || { patterns: [], semantic: false };

        return result;
    }

    _parseInlineTrigger(val) {
        if (val.startsWith('{')) {
            try {
                return JSON.parse(val);
            } catch {
                return null;
            }
        }
        return null;
    }

    _parseInlineArray(val) {
        if (val.startsWith('[') && val.endsWith(']')) {
            return val.slice(1, -1).split(',').map(s => this._unquote(s.trim())).filter(Boolean);
        }
        return [this._unquote(val)].filter(Boolean);
    }

    _unquote(val) {
        if (!val) return val;
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            if (val.startsWith('"')) {
                return val.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            }
            return val.slice(1, -1).replace(/''/g, "'");
        }
        if (val === 'true') return true;
        if (val === 'false') return false;
        if (val === 'null' || val === '~') return null;
        const n = Number(val);
        if (!isNaN(n) && val !== '') return n;
        return val;
    }

    // ================================================================
    // Level 2: 指令加载（匹配时预热）
    // ================================================================

    /**
     * 预热指定 Skill 到 Level 2（匹配时调用）
     * 加载 system_prompt + tool schemas + execution
     * @param {string} skillName
     * @returns {Promise<boolean>} 是否成功
     */
    async warmLevel2(skillName) {
        const currentLevel = this._loadState.get(skillName) || LoadLevel.NOT_LOADED;
        if (currentLevel >= LoadLevel.L2_INSTRUCTIONS) {
            return true; // 已有 L2
        }

        const yamlContent = this._yamlCache.get(skillName);
        if (!yamlContent) {
            // 未做 L1，从文件加载
            const skill = this.registry.get(skillName);
            if (!skill?.path) return false;
            try {
                this._yamlCache.set(skillName, readFileSync(skill.path, 'utf-8'));
            } catch {
                return false;
            }
        }

        try {
            await this._loadLevel2(skillName);
            this._loadState.set(skillName, LoadLevel.L2_INSTRUCTIONS);
            this._stats.l2Count++;
            console.log(`[SkillLazyLoader] Level2 warmed: ${skillName}`);
            return true;
        } catch (e) {
            console.warn(`[SkillLazyLoader] L2 failed for ${skillName}: ${e.message}`);
            return false;
        }
    }

    /**
     * 批量预热多个 Skill 到 Level 2（并行）
     * @param {string[]} skillNames
     */
    async warmLevel2Batch(skillNames) {
        await Promise.allSettled(
            skillNames.map(name => this.warmLevel2(name))
        );
    }

    /**
     * 预热匹配到的所有 Skills 到 Level 2
     * 由 SkillMatcher 调用
     * @param {MatchResult[]} matches
     */
    async warmMatches(matches) {
        const skillNames = [...new Set(matches.map(m => m.skill))];
        await this.warmLevel2Batch(skillNames);
    }

    /**
     * 加载 Level 2 数据
     */
    async _loadLevel2(skillName) {
        const yamlContent = this._yamlCache.get(skillName);
        if (!yamlContent) return;

        // 完整解析 YAML
        const fullDef = this.registry._parseYaml(yamlContent);

        // 补充默认值
        fullDef.version = fullDef.version || '1.0.0';
        fullDef.description = fullDef.description || '';
        fullDef.trigger = fullDef.trigger || { patterns: [], semantic: false };
        fullDef.tools = Array.isArray(fullDef.tools) ? fullDef.tools : [];
        fullDef.execution = fullDef.execution || { isolation: 'none', timeout: 30000 };
        fullDef.tags = Array.isArray(fullDef.tags) ? fullDef.tags : [];
        fullDef.path = this.registry.get(skillName)?.path || '';

        // 注册到 registry（替换 L1 metadata）
        this._fullDefCache.set(skillName, fullDef);
        this.registry._register(fullDef);

        // 缓存 system_prompt
        if (fullDef.system_prompt) {
            this.registry.systemPrompts.set(skillName, fullDef.system_prompt.trim());
        }

        // 统计节省
        const savedBytes = yamlContent.length - JSON.stringify(extractMetadata(fullDef)).length;
        this._stats.bytesSaved += Math.max(0, savedBytes);
    }

    // ================================================================
    // Level 3: 资源加载（工具执行时按需）
    // ================================================================

    /**
     * 加载指定工具的 Level 3 资源
     * 包括：scripts 内容、endpoint 详情、auth 配置等
     * @param {string} skillName
     * @param {string} toolId
     * @returns {Promise<object|null>} 工具完整定义
     */
    async loadLevel3Tool(skillName, toolId) {
        const currentLevel = this._loadState.get(skillName) || LoadLevel.NOT_LOADED;

        // 确保 L2 已加载
        if (currentLevel < LoadLevel.L2_INSTRUCTIONS) {
            await this.warmLevel2(skillName);
        }

        this._loadState.set(skillName, LoadLevel.L3_RESOURCES);
        this._stats.l3Count++;

        // 从 registry 获取工具定义
        const skill = this.registry.get(skillName);
        if (!skill) return null;

        const tool = (skill.tools || []).find(t =>
            t.id === toolId || `${skillName}_${t.type}` === toolId
        );

        if (!tool) return null;

        // 加载脚本内容（type=script 时从文件读取）
        if (tool.type === 'script' && tool.script_path) {
            try {
                const { readFileSync: rf } = await import('fs');
                tool._scriptContent = rf(tool.script_path, 'utf-8');
            } catch {
                // 脚本文件不存在，静默跳过
            }
        }

        return tool;
    }

    // ================================================================
    // 工具函数
    // ================================================================

    /**
     * 获取 Skill 的当前加载级别
     * @param {string} skillName
     * @returns {number}
     */
    getLoadLevel(skillName) {
        return this._loadState.get(skillName) || LoadLevel.NOT_LOADED;
    }

    /**
     * 检查 Skill 是否已预热到指定级别
     */
    isLoaded(skillName, minLevel = LoadLevel.L2_INSTRUCTIONS) {
        return this.getLoadLevel(skillName) >= minLevel;
    }

    /**
     * 获取加载统计
     */
    getStats() {
        return {
            ...this._stats,
            skillsByLevel: {
                L1: [...this._loadState.entries()].filter(([, v]) => v === LoadLevel.L1_METADATA).length,
                L2: [...this._loadState.entries()].filter(([, v]) => v === LoadLevel.L2_INSTRUCTIONS).length,
                L3: [...this._loadState.entries()].filter(([, v]) => v === LoadLevel.L3_RESOURCES).length,
            },
            bytesSaved: this._stats.bytesSaved,
            tokenEstimate: this._stats.l2Count * LEVEL_TOKEN_ESTIMATE[2],
        };
    }

    /**
     * 预清理（释放 YAML 缓存）
     * 已在 L2/L3 加载后调用，节省内存
     */
    evictYamlCache(skillName) {
        if (this._loadState.get(skillName) >= LoadLevel.L2_INSTRUCTIONS) {
            this._yamlCache.delete(skillName);
        }
    }

    /**
     * 释放所有 YAML 缓存（节省内存）
     */
    evictAllYamlCache() {
        for (const [name] of this._yamlCache) {
            this.evictYamlCache(name);
        }
    }
}
