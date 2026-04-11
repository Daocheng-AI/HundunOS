/**
 * kernel/skills/skill-manager.js v3.9
 * HundunOS Phase 1: Skill 系统统一管理器
 *
 * 整合 Registry + Matcher + Runner + Market + Validator + PlatformBridge 为统一 API
 * 暴露给 Kernel 使用的顶层 Skill 接口
 *
 * v3.9 新增：
 *   - 集成 skill-validator 验证能力
 *   - 集成 platform-bridge 跨平台分发能力
 *   - 统一错误处理与警告收集
 *
 * 用法：
 *   kernel.skills.match('帮我创建一个 GitHub issue')
 *   kernel.skills.run('github', 'github_create_issue', { owner: 'me', repo: 'test', title: 'Bug' })
 *   kernel.skills.install('https://.../my-skill.yaml')
 *   kernel.skills.installToPlatform('my-skill', 'claude')  // v3.9 新增
 */

import { join } from 'path';
import { SkillRegistry } from './skill-registry.js';
import { SkillMatcher } from './skill-matcher.js';
import { SkillRunner } from './skill-runner.js';
import { SkillMarket } from './skill-market.js';
import { SkillLazyLoader, LoadLevel } from './skill-loader.js';

// v3.9: 验证器与平台桥接
import {
    validateSkillName,
    getSkillNameError,
    parseSkillMd,
    validateSkillMd,
    validateSkillDef,
    validateSkillPackage,
    sanitizeImportedSkillDraft,
} from './skill-validator.js';

import {
    SKILL_PLATFORMS,
    getPlatform,
    getSupportedPlatforms,
    detectInstalledPlatforms,
    installSkillMd,
    installToPlatform,
    uninstallFromPlatform,
    installSkillMdSymlink,
    getSkillMdInstallStatus,
    getMCPInstallStatus,
    installToMultiplePlatforms,
} from './platform-bridge.js';

export class SkillManager {
    /**
     * @param {object} kernel - Kernel 实例
     */
    constructor(kernel) {
        this.kernel = kernel;
        const projectRoot = kernel?.config?.projectRoot || '';

        // 核心组件
        this.registry = new SkillRegistry({
            kernel,
            skillsDir: join(projectRoot, 'kernel', 'skills', 'skills'),
        });

        // Phase 3: 渐进式加载器（替换全量 loadAll）
        this.loader = new SkillLazyLoader(this.registry);

        this.matcher = new SkillMatcher({
            registry: this.registry,
            kernel,
            modelRouter: kernel?.modelRouter || null,
        });

        this.runner = new SkillRunner({
            registry: this.registry,
            kernel,
        });

        this.market = new SkillMarket({
            registry: this.registry,
            installDir: join(projectRoot, 'kernel', 'skills', 'installed'),
        });

        this._initialized = false;
        
        // v3.9: 验证警告收集
        this._validationWarnings = [];
    }

    // ================================================================
    // 生命周期
    // ================================================================

    async initialize() {
        if (this._initialized) return;
        console.log('[SkillManager] Initializing Phase 3 Skill System (lazy loading)...');

        // 1. Phase 3: Level 1 元数据加载（冷启动，只加载 name/description/tags）
        const loadResult = await this.loader.loadLevel1All();
        console.log(`[SkillManager] L1 loaded: ${loadResult.loaded} skills (${loadResult.failed} failed)`);
        console.log(`[SkillManager] Stats: ${JSON.stringify(this.loader.getStats())}`);

        // 2. 加载远程安装的 skills
        try {
            const installed = this.market.listInstalled();
            for (const entry of installed) {
                // 重新注册（market install 时已注册，这里仅确保加载）
                const yamlPath = join(this.market.getInstallDir(), `${entry.name}.yaml`);
                const { existsSync } = await import('fs');
                if (existsSync(yamlPath)) {
                    const { readFileSync } = await import('fs');
                    const content = readFileSync(yamlPath, 'utf-8');
                    const def = this.registry._parseYaml(content);
                    this.registry.register({ ...def, path: yamlPath });
                }
            }
        } catch (e) {
            console.warn(`[SkillManager] Failed to reload installed skills: ${e.message}`);
        }

        this._initialized = true;
        console.log(`[SkillManager] Ready. Skills: ${this.registry.getSkillNames().join(', ')}`);
    }

    // ================================================================
    // 匹配 API
    // ================================================================

    /**
     * 匹配用户查询触发的 Skill
     * @param {string} query
     * @param {object} [opts]
     * @returns {Promise<MatchResult[]>}
     */
    async match(query, opts = {}) {
        const matches = await this.matcher.match(query, opts);
        this.loader.warmMatches(matches).catch(() => {});
        return matches;
    }

    /**
     * 查找匹配的 Skill 并返回详细信息
     */
    async matchWithDetails(query, opts = {}) {
        const skillNames = [];
        const matches = await this.matcher.match(query, opts);
        for (const m of matches) {
            if (!skillNames.includes(m.skill)) skillNames.push(m.skill);
        }
        await this.loader.warmLevel2Batch(skillNames);

        return matches.map(m => ({
            ...m,
            tools: this.registry.getTools(m.skill),
            systemPrompt: this.registry.systemPrompts.get(m.skill) || null,
            loadLevel: this.loader.getLoadLevel(m.skill),
        }));
    }

    /**
     * 获取加载统计（Phase 3 诊断）
     */
    getLoadStats() {
        return this.loader.getStats();
    }

    // ================================================================
    // 执行 API
    // ================================================================

    /**
     * 执行 Skill 中的工具
     */
    async run(skillName, toolId, params = {}, options = {}) {
        await this.loader.loadLevel3Tool(skillName, toolId).catch(() => {});
        const result = await this.runner.runTool(skillName, toolId, params, options);
        this._emitEvent('tool:executed', { skillName, toolId, result });
        return result;
    }

    /**
     * 执行多个工具（批量）
     */
    async runBatch(skillName, toolsToRun = [], options = {}) {
        return this.runner.runSkill(skillName, toolsToRun, options);
    }

    // ================================================================
    // System Prompt 注入
    // ================================================================

    /**
     * 获取所有活跃 Skill 的 system prompt 片段
     */
    getSystemPrompts(skillNames) {
        const names = skillNames || this.registry.getSkillNames();
        return this.registry.getSystemPrompts(names);
    }

    /**
     * 获取 Skill 描述（用于告诉 Agent 有哪些 Skill 可用）
     */
    getAvailableSkillsDescription() {
        const skills = this.registry.getAllSkills();
        return skills.map(s => ({
            name: s.name,
            description: s.description,
            tags: s.tags || [],
            toolCount: s.tools?.length || 0,
            version: s.version,
        }));
    }

    // ================================================================
    // 动态注册（v3.9 增强）
    // ================================================================

    /**
     * 注册新的 Skill（运行时）
     * @param {object} skillDef - Skill 定义
     * @returns {{ success: boolean, warnings: string[], errors: string[] }}
     */
    register(skillDef) {
        // v3.9: 使用验证器
        const validation = validateSkillDef(skillDef);
        
        if (!validation.valid) {
            return {
                success: false,
                warnings: validation.warnings,
                errors: validation.errors,
            };
        }
        
        // 收集警告
        if (validation.warnings.length > 0) {
            this._validationWarnings.push({
                skill: skillDef.name,
                warnings: validation.warnings,
                timestamp: Date.now(),
            });
        }
        
        this.registry.register(skillDef);
        
        return {
            success: true,
            warnings: validation.warnings,
            errors: [],
        };
    }

    /** 注销 Skill */
    unregister(name) {
        this.registry.unregister(name);
    }

    // ================================================================
    // Market API
    // ================================================================

    /** 从 URL 安装 Skill */
    async install(url, opts = {}) {
        return this.market.install(url, opts);
    }

    /** 从本地文件安装 */
    async installLocal(path, opts = {}) {
        return this.market.installLocal(path, opts);
    }

    /** 卸载 Skill */
    uninstall(name) {
        return this.market.uninstall(name);
    }

    /** 列出已安装 Skill */
    listInstalled() {
        return this.market.listInstalled();
    }

    // ================================================================
    // v3.9: 验证器 API
    // ================================================================

    /**
     * 验证 Skill 名称格式
     * @param {string} name
     * @returns {boolean}
     */
    isValidSkillName(name) {
        return validateSkillName(name);
    }

    /**
     * 获取 Skill 名称验证错误
     * @param {string} name
     * @returns {string | null}
     */
    getSkillNameValidationError(name) {
        return getSkillNameError(name);
    }

    /**
     * 解析 SKILL.md 内容
     * @param {string} content
     * @returns {object | null}
     */
    parseSkillMdContent(content) {
        return parseSkillMd(content);
    }

    /**
     * 验证 SKILL.md 文件
     * @param {string} content
     * @param {string} [directoryName]
     * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
     */
    validateSkillMdContent(content, directoryName) {
        return validateSkillMd(content, directoryName);
    }

    /**
     * 验证 Skill 定义对象
     * @param {object} def
     * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
     */
    validateDefinition(def) {
        return validateSkillDef(def);
    }

    /**
     * 验证 Skill 文件夹
     * @param {string} folderPath
     * @returns {Promise<{ valid: boolean, errors: string[], warnings: string[] }>}
     */
    async validateSkillFolder(folderPath) {
        return validateSkillPackage(folderPath);
    }

    /**
     * 获取验证警告历史
     */
    getValidationWarnings() {
        return [...this._validationWarnings];
    }

    /**
     * 清除验证警告历史
     */
    clearValidationWarnings() {
        this._validationWarnings = [];
    }

    // ================================================================
    // v3.9: 跨平台分发 API
    // ================================================================

    /**
     * 检测已安装的 AI 平台
     * @returns {string[]}
     */
    detectPlatforms() {
        return detectInstalledPlatforms();
    }

    /**
     * 获取所有支持的平台
     * @returns {Array<{id: string, name: string, type: string}>}
     */
    getSupportedPlatforms() {
        return getSupportedPlatforms().map(p => ({
            id: p.id,
            name: p.name,
            type: p.type,
        }));
    }

    /**
     * 获取平台定义
     * @param {string} platformId
     * @returns {object | undefined}
     */
    getPlatformInfo(platformId) {
        const p = getPlatform(platformId);
        if (!p) return undefined;
        return {
            id: p.id,
            name: p.name,
            type: p.type,
        };
    }

    /**
     * 安装 Skill 到指定平台
     * @param {string} skillName - Skill 名称
     * @param {string} platformId - 平台 ID
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async installToPlatform(skillName, platformId) {
        // 检查 Skill 是否存在
        const skill = this.registry.get(skillName);
        if (!skill) {
            return { success: false, error: `Skill "${skillName}" not found` };
        }

        // 生成 SKILL.md 内容
        const skillMdContent = this._generateSkillMd(skill);
        
        // 调用平台桥接
        return installSkillMd(skillName, skillMdContent, platformId);
    }

    /**
     * 安装 Skill 到多个平台
     * @param {string} skillName
     * @param {string[]} platformIds
     * @returns {Promise<Record<string, { success: boolean, error?: string }>>}
     */
    async installToMultiplePlatforms(skillName, platformIds) {
        const skill = this.registry.get(skillName);
        if (!skill) {
            const result = {};
            for (const pid of platformIds) {
                result[pid] = { success: false, error: `Skill "${skillName}" not found` };
            }
            return result;
        }

        const skillMdContent = this._generateSkillMd(skill);
        return installToMultiplePlatforms(skillName, skillMdContent, platformIds);
    }

    /**
     * 安装 MCP 配置到平台
     * @param {string} platformId
     * @param {string} skillName
     * @param {object} mcpConfig
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async installMCPToPlatform(platformId, skillName, mcpConfig) {
        return installToPlatform(platformId, skillName, mcpConfig);
    }

    /**
     * 从平台卸载 Skill
     * @param {string} skillName
     * @param {string} platformId
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async uninstallFromPlatform(skillName, platformId) {
        return uninstallFromPlatform(skillName, platformId);
    }

    /**
     * 获取 Skill 的平台安装状态
     * @param {string} skillName
     * @returns {Record<string, boolean>}
     */
    getPlatformInstallStatus(skillName) {
        return getSkillMdInstallStatus(skillName);
    }

    /**
     * 获取 Skill 的 MCP 安装状态
     * @param {string} skillName
     * @returns {Record<string, boolean>}
     */
    getMCPInstallStatus(skillName) {
        return getMCPInstallStatus(skillName);
    }

    /**
     * 通过符号链接安装（一处更新，多平台同步）
     * @param {string} skillName
     * @param {string} platformId
     * @param {string} [canonicalDir] - 源目录，默认 ~/.hundunos/skills
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async installWithSymlink(skillName, platformId, canonicalDir) {
        const skill = this.registry.get(skillName);
        if (!skill) {
            return { success: false, error: `Skill "${skillName}" not found` };
        }

        const skillMdContent = this._generateSkillMd(skill);
        return installSkillMdSymlink(skillName, skillMdContent, platformId, canonicalDir);
    }

    // ================================================================
    // 内部方法
    // ================================================================

    /**
     * 从 Skill spec 生成 SKILL.md 内容
     * @private
     */
    _generateSkillMd(spec) {
        const frontmatter = [
            `name: ${spec.name}`,
            `version: ${spec.version || '1.0.0'}`,
            spec.description ? `description: ${spec.description}` : '',
            spec.author ? `author: ${spec.author}` : '',
            spec.tags?.length ? `tags: [${spec.tags.join(', ')}]` : '',
        ].filter(Boolean).join('\n');

        const body = spec.system_prompt || spec.instructions || '';
        
        return `---\n${frontmatter}\n---\n\n${body}`;
    }

    // ================================================================
    // 状态
    // ================================================================

    getStats() {
        return {
            initialized: this._initialized,
            registry: this.registry.getStats(),
            matcher: this.matcher.getStats(),
            runner: this.runner.getStats(),
            market: this.market.getStats(),
            validation: {
                warningsCount: this._validationWarnings.length,
            },
        };
    }

    _emitEvent(event, data) {
        this.kernel?.emit?.(event, data);
    }
}

// 导出常量供外部使用
export { SKILL_PLATFORMS };

export default SkillManager;
