/**
 * kernel/skills/index.js v2.0
 * HundunOS Skills 渐进式加载系统
 *
 * 借鉴自 Claude Code Skills + larksuite/cli Skill 系统设计
 *
 * Level 1: 元数据 (始终加载, ~100 tokens/skill)
 * Level 2: 指令 (触发时加载, <5k tokens)
 * Level 3: 资源 (按需加载, 无限制)
 *
 * 增强 v2.0:
 * - requires 依赖链加载（MUST 先读依赖）
 * - references 目录扫描
 * - Schema 元数据提取
 * - 优先级排序（critical > high > medium > low）
 * - tags 分类支持
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';

/**
 * Skill 元数据
 * @typedef {Object} SkillMeta
 * @property {string} name - 技能名称
 * @property {string} description - 简短描述
 * @property {string} priority - 优先级: critical/high/medium/low
 * @property {string} version - 版本号
 * @property {string} author - 作者
 * @property {string[]} tags - 分类标签
 * @property {string[]} requires - 依赖技能列表（必须先读）
 * @property {string[]} related_skills - 相关技能
 * @property {string} path - SKILL.md 文件路径
 * @property {string} dir - 技能目录路径
 * @property {string[]} references - references 目录下文件列表
 */

/**
 * Skill 加载器 v2.0
 */
export class SkillLoader {
  constructor(skillDirs = []) {
    this.skillDirs = skillDirs;
    /** @type {Map<string, SkillMeta>} */
    this.metadata = new Map();   // Level 1: 元数据
    /** @type {Map<string, string>} */
    this.instructions = new Map(); // Level 2: 指令（缓存）
    /** @type {Map<string, string>} */
    this.referenceDocs = new Map(); // references 文件内容缓存
    /** @type {Set<string>} */
    this._loadingSet = new Set(); // 防止循环依赖
  }

  /**
   * 加载所有 Skill 元数据 (Level 1)
   * 启动时执行，约 100 tokens per skill
   */
  loadAllMetadata() {
    for (const dir of this.skillDirs) {
      this._scanDirectory(dir);
    }

    // 按优先级排序（critical 最先）
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const sorted = [...this.metadata.values()].sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 99;
      const pb = priorityOrder[b.priority] ?? 99;
      return pa - pb;
    });

    // 按优先级输出加载顺序
    const loaded = sorted.map(s => s.name).join(', ');
    // console.log(`[SkillLoader] Loaded ${this.metadata.size} skills (priority order): ${loaded}`);
  }

  /**
   * 扫描目录查找 Skills
   */
  _scanDirectory(dir) {
    if (!existsSync(dir)) {
      console.warn(`[SkillLoader] Skill directory not found: ${dir}`);
      return;
    }

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      console.warn(`[SkillLoader] Failed to read directory ${dir}: ${e.message}`);
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = join(dir, entry.name, 'SKILL.md');
        if (existsSync(skillPath)) {
          try {
            const meta = this._parseSkill(skillPath, dir);
            if (meta.name) {
              // 如果同名 skill 已存在，不覆盖（优先加载）
              if (!this.metadata.has(meta.name)) {
                this.metadata.set(meta.name, meta);
              }
            }
          } catch (e) {
            console.warn(`[SkillLoader] Failed to parse ${skillPath}: ${e.message}`);
          }
        }
      }
    }
  }

  /**
   * 解析完整 Skill 文件
   * @param {string} skillPath
   * @param {string} baseDir
   * @returns {SkillMeta}
   */
  _parseSkill(skillPath, baseDir) {
    const content = readFileSync(skillPath, 'utf-8');
    const skillDir = dirname(skillPath);
    const skillName = dirname(skillPath).replace(baseDir + '\\', '').replace(baseDir + '/', '');

    // 提取 frontmatter
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    let meta = { name: skillName, priority: 'medium', version: '1.0.0', author: '', tags: [], requires: [], related_skills: [], description: '', path: skillPath, dir: skillDir };
    let body = content;

    if (match) {
      meta = { ...meta, ...this._parseYaml(match[1]) };
      body = match[2];
    }

    // 确保 name 和 path 正确
    meta.name = meta.name || skillName;
    meta.path = skillPath;
    meta.dir = skillDir;

    // 规范化 tags（支持 YAML 数组格式）
    if (typeof meta.tags === 'string') {
      meta.tags = meta.tags.replace(/[\[\]]/g, '').split(',').map(t => t.trim());
    }
    if (!Array.isArray(meta.tags)) meta.tags = [];

    // 规范化 requires
    if (typeof meta.requires === 'string') {
      meta.requires = meta.requires.replace(/[\[\]]/g, '').split(',').map(t => t.trim()).filter(Boolean);
    }
    if (!Array.isArray(meta.requires)) meta.requires = [];

    // 规范化 related_skills
    if (typeof meta.related_skills === 'string') {
      meta.related_skills = meta.related_skills.replace(/[\[\]]/g, '').split(',').map(t => t.trim());
    }
    if (!Array.isArray(meta.related_skills)) meta.related_skills = [];

    // 扫描 references 目录
    const refsDir = join(skillDir, 'references');
    meta.references = [];
    if (existsSync(refsDir)) {
      try {
        const refFiles = readdirSync(refsDir);
        meta.references = refFiles
          .filter(f => f.endsWith('.md'))
          .map(f => f.replace('.md', ''));
      } catch (e) {
        // 忽略
      }
    }

    return meta;
  }

  /**
   * 解析 YAML frontmatter（支持更多类型）
   */
  _parseYaml(yaml) {
    const result = {};
    const lines = yaml.split('\n');
    let currentKey = null;
    let currentArray = [];
    let inArray = false;

    for (const line of lines) {
      // 检测数组开始
      if (line.match(/^\s*-\s+/)) {
        inArray = true;
        const match = line.match(/^\s*-\s+(.*)$/);
        if (match && currentKey) {
          currentArray.push(match[1].trim());
        }
        continue;
      }

      // 结束数组
      if (inArray && !line.match(/^\s*-\s+/)) {
        result[currentKey] = [...currentArray];
        currentArray = [];
        inArray = false;
      }

      // 键值对
      const kvMatch = line.match(/^(\w+):\s*(.*)$/);
      if (kvMatch) {
        const [, key, value] = kvMatch;
        currentKey = key;
        if (value.trim()) {
          result[key] = value.trim();
        }
      }
    }

    // 最后一个数组
    if (inArray && currentKey) {
      result[currentKey] = [...currentArray];
    }

    return result;
  }

  /**
   * 获取技能的完整加载链（包含 requires 依赖）
   * 返回按加载顺序排列的技能列表
   * @param {string} skillName
   * @returns {string[]} 加载顺序
   */
  getLoadChain(skillName) {
    const chain = [];
    const visited = new Set();

    const visit = (name) => {
      if (visited.has(name)) return; // 防止循环依赖
      visited.add(name);

      const meta = this.metadata.get(name);
      if (!meta) {
        console.warn(`[SkillLoader] Skill not found in load chain: ${name}`);
        return;
      }

      // 先加载所有依赖
      for (const dep of (meta.requires || [])) {
        visit(dep);
      }

      // 然后加载自身
      chain.push(name);
    };

    visit(skillName);
    return chain;
  }

  /**
   * 加载 Skill 指令 (Level 2)
   * 自动处理 requires 依赖链
   * @param {string} skillName
   * @returns {string|null}
   */
  loadInstructions(skillName) {
    if (this.instructions.has(skillName)) {
      return this.instructions.get(skillName);
    }

    const meta = this.metadata.get(skillName);
    if (!meta) {
      return null;
    }

    // 循环依赖保护
    if (this._loadingSet.has(skillName)) {
      console.warn(`[SkillLoader] Circular dependency detected for skill: ${skillName}`);
      return null;
    }

    this._loadingSet.add(skillName);

    try {
      // 1. 加载所有 requires 依赖（拼接在前面）
      let fullContent = '';

      for (const dep of (meta.requires || [])) {
        const depInstructions = this.loadInstructions(dep);
        if (depInstructions) {
          fullContent += `\n\n## [Requires] ${dep}\n\n${depInstructions}`;
        }
      }

      // 2. 加载自身内容
      const content = readFileSync(meta.path, 'utf-8');
      const body = this._extractBody(content);
      fullContent += `\n\n## [Skill] ${skillName}\n\n${body}`;

      this.instructions.set(skillName, fullContent);
      return fullContent;
    } finally {
      this._loadingSet.delete(skillName);
    }
  }

  /**
   * 加载 Reference 文档
   * @param {string} skillName
   * @param {string} refName - references/ 下的文件名（不含扩展名）
   */
  loadReference(skillName, refName) {
    const cacheKey = `${skillName}:${refName}`;
    if (this.referenceDocs.has(cacheKey)) {
      return this.referenceDocs.get(cacheKey);
    }

    const meta = this.metadata.get(skillName);
    if (!meta) return null;

    const refPath = join(meta.dir, 'references', `${refName}.md`);
    if (!existsSync(refPath)) return null;

    try {
      const content = readFileSync(refPath, 'utf-8');
      this.referenceDocs.set(cacheKey, content);
      return content;
    } catch (e) {
      return null;
    }
  }

  /**
   * 提取 body 内容（YAML frontmatter 之后）
   */
  _extractBody(content) {
    const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    return match ? match[1].trim() : content;
  }

  /**
   * 获取资源文件路径 (Level 3)
   */
  getResource(skillName, resourcePath) {
    const meta = this.metadata.get(skillName);
    if (!meta) return null;

    const fullPath = join(meta.dir, resourcePath);
    return {
      path: fullPath,
      exists: existsSync(fullPath),
    };
  }

  /**
   * 检查 Skill 是否存在
   */
  hasSkill(name) {
    return this.metadata.has(name);
  }

  /**
   * 获取所有 Skill 名称
   */
  getSkillNames() {
    return Array.from(this.metadata.keys());
  }

  /**
   * 获取 Skill 元数据
   */
  getMetadata(name) {
    return this.metadata.get(name);
  }

  /**
   * 获取所有元数据
   */
  getAllMetadata() {
    return Array.from(this.metadata.values());
  }

  /**
   * 按优先级获取 Skills
   */
  getByPriority(priority) {
    return [...this.metadata.values()].filter(s => s.priority === priority);
  }

  /**
   * 按 Tag 搜索 Skills
   */
  getByTag(tag) {
    return [...this.metadata.values()].filter(s => s.tags.includes(tag));
  }

  /**
   * 获取 Schema 元数据（供 Agent 使用）
   * 从 skill 的 frontmatter 和 references 中提取工具描述
   */
  getSchema() {
    const schema = {};
    for (const [name, meta] of this.metadata) {
      schema[name] = {
        name: meta.name,
        description: meta.description,
        priority: meta.priority,
        tags: meta.tags,
        requires: meta.requires,
        references: meta.references,
      };
    }
    return schema;
  }
}

/**
 * Skill 执行器
 */
export class SkillExecutor {
  constructor(loader) {
    this.loader = loader;
    this.activeSkills = new Set();
  }

  /**
   * 执行 Skill
   * 自动处理 requires 依赖链
   */
  async execute(skillName, params = {}) {
    const instructions = this.loader.loadInstructions(skillName);
    if (!instructions) {
      throw new Error(`Skill not found: ${skillName}`);
    }

    this.activeSkills.add(skillName);

    try {
      return {
        success: true,
        skill: skillName,
        instructions,
        params,
        requires: this.loader.getMetadata(skillName)?.requires || [],
        references: this.loader.getMetadata(skillName)?.references || [],
      };
    } finally {
      this.activeSkills.delete(skillName);
    }
  }

  /**
   * 执行 Reference 文档中的操作
   */
  async executeReference(skillName, refName) {
    const meta = this.loader.getMetadata(skillName);
    if (!meta) {
      throw new Error(`Skill not found: ${skillName}`);
    }

    const refContent = this.loader.loadReference(skillName, refName);
    if (!refContent) {
      throw new Error(`Reference not found: ${skillName}/${refName}`);
    }

    return {
      success: true,
      skill: skillName,
      reference: refName,
      content: refContent,
    };
  }

  /**
   * 获取当前活跃的 Skills
   */
  getActiveSkills() {
    return Array.from(this.activeSkills);
  }
}

// v3.6 Phase 1: 额外导出（v2.0 SkillLoader/SkillExecutor 已在上面定义）
export { SkillRegistry } from './skill-registry.js';
export { SkillRunner } from './skill-runner.js';
export { SkillMatcher } from './skill-matcher.js';
export { SkillMarket } from './skill-market.js';
export { SkillManager } from './skill-manager.js';

// v3.9 Phase 1: PromptHub 移植模块 - skill-validator
export {
    validateSkillName,
    getSkillNameError,
    parseSkillMd,
    validateSkillMd,
    validateSkillDef,
    validateSkillPackage,
    sanitizeImportedSkillDraft,
    SKILL_NAME_REGEX,
} from './skill-validator.js';

// v3.9 Phase 1: PromptHub 移植模块 - platform-bridge
export {
    SKILL_PLATFORMS,
    getPlatform,
    getPlatformSkillsDir,
    getPlatformConfigPath,
    getSupportedPlatforms,
    detectInstalledPlatforms,
    validateMCPConfig,
    installToPlatform,
    uninstallFromPlatform,
    installSkillMd,
    uninstallSkillMd,
    installSkillMdSymlink,
    getSkillMdInstallStatus,
    getMCPInstallStatus,
    installToMultiplePlatforms,
} from './platform-bridge.js';

// v3.9 Phase 2: 远程安装 + SSRF 防护
export {
    validateUrl,
    safeFetch,
    installFromUrl,
    installFromGist,
    installFromGitHubRef,
} from './skill-remote.js';

// v3.9 Phase 3: 本地仓库管理
export { SkillRepo } from './skill-repo.js';

// v3.9 Phase 3: 版本管理
export {
    SkillVersionManager,
    parseVersion,
    compareVersions,
    satisfies,
    incrementVersion,
} from './skill-version.js';

// v3.9 Phase 3: WebDAV 同步
export { WebDAVClient, SkillSync } from './skill-sync.js';

// v3.9 Task 3: Skill Testing Framework
export {
    MockTool,
    createMockTools,
    TestContext,
    TestResult,
    testSkill,
    assertions,
    TestSuite,
    describe,
    it,
    expect,
} from './skill-tester.js';

// v3.9 Task 5: Package Registry
export { SkillRegistryServer } from './skill-registry-server.js';

// v3.9 Task 6: AI Skill Generator
export {
    SkillGenerator,
    generateSkill,
    generateFromNL,
} from './skill-generator.js';

// 注意：SkillLoader 和 SkillExecutor 已在上方定义为 class
