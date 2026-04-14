// hundunos/kernel/context-enhancer.js — Context 构建增强 v2.0
// 借鉴 Claude Code context.ts + memdir.ts 设计
// v2.0 升级（借鉴 TaxHacker buildLLMPrompt）：
//   - 统一 prompt 模板系统（replaceTemplate + buildLLMPrompt）
//   - 模板变量自动收集：{gitBranch}/{gitStatus}/{memoryFiles}/{kernelVersion}
//   - injectPromptTemplate() 方法：用户自定义 prompt 可引用运行时变量
//   - fieldsToJsonSchema() 导出供 intent-engine / skill-registry 使用
import { existsSync, readFileSync, statSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname, relative } from 'path';
import { homedir } from 'os';
import { feature } from './feature-flags.js';
import { replaceTemplate, buildLLMPrompt, renderFieldsToPrompt, fieldsToJsonSchema } from './prompt-template.js';

const MAX_ENTRYPOINT_LINES = 200;
const MAX_ENTRYPOINT_BYTES = 25_000;
const MAX_GIT_STATUS_CHARS = 2000;

// ================================================================
// Git Context Builder
// ================================================================

class GitContextBuilder {
  constructor(cwd) {
    this.cwd = cwd || process.cwd();
    this._isGit = null;
  }

  async isGitRepo() {
    if (this._isGit !== null) return this._isGit;
    try {
      execFileSync('git', ['rev-parse', '--git-dir'], {
        cwd: this.cwd, stdio: 'ignore', timeout: 2000,
      });
      this._isGit = true;
    } catch {
      this._isGit = false;
    }
    return this._isGit;
  }

  async getStatus() {
    if (!(await this.isGitRepo())) return null;
    try {
      const out = execFileSync('git', ['--no-optional-locks', 'status', '--short'], {
        cwd: this.cwd, encoding: 'utf8', timeout: 3000,
        maxBuffer: 10 * 1024 * 1024,
      });
      const trimmed = out.trim();
      return trimmed.length > MAX_GIT_STATUS_CHARS
        ? trimmed.substring(0, MAX_GIT_STATUS_CHARS) + '\n... (truncated)'
        : trimmed || null;
    } catch {
      return null;
    }
  }

  async getBranch() {
    if (!(await this.isGitRepo())) return null;
    try {
      return execFileSync('git', ['branch', '--show-current'], {
        cwd: this.cwd, encoding: 'utf8', timeout: 2000,
      }).trim();
    } catch {
      return null;
    }
  }

  async getDefaultBranch() {
    if (!(await this.isGitRepo())) return null;
    try {
      const main = execFileSync('git', ['rev-parse', '--verify', 'main'], {
        cwd: this.cwd, encoding: 'utf8', timeout: 2000,
      }).trim();
      if (main) return 'main';
      return execFileSync('git', ['rev-parse', '--verify', 'master'], {
        cwd: this.cwd, encoding: 'utf8', timeout: 2000,
      }).trim() || 'main';
    } catch {
      return 'main';
    }
  }

  async getRecentCommits(n = 5) {
    if (!(await this.isGitRepo())) return [];
    try {
      const out = execFileSync(
        'git', ['--no-optional-locks', 'log', '--oneline', `-n`, String(n)],
        { cwd: this.cwd, encoding: 'utf8', timeout: 2000 }
      ).trim();
      return out.split('\n').filter(Boolean).map(l => l.trim());
    } catch {
      return [];
    }
  }

  async getUserName() {
    if (!(await this.isGitRepo())) return null;
    try {
      return execFileSync('git', ['config', 'user.name'], {
        cwd: this.cwd, encoding: 'utf8', timeout: 2000,
      }).trim() || null;
    } catch {
      return null;
    }
  }

  async getFullContext() {
    const [branch, defaultBranch, status, commits, userName] = await Promise.all([
      this.getBranch(), this.getDefaultBranch(), this.getStatus(),
      this.getRecentCommits(), this.getUserName(),
    ]);
    if (!branch) return null;

    const lines = [
      'This is the git status at the start of the conversation.',
      'Note that this status is a snapshot in time.',
      `Current branch: ${branch}`,
      `Main branch (usually used for PRs): ${defaultBranch}`,
      ...(userName ? [`Git user: ${userName}`] : []),
      '',
      'Recent commits:',
      ...(commits.length > 0 ? commits.map(c => `  ${c}`) : ['  (none)']),
      '',
      'Working tree status:',
      status ? status.split('\n').map(l => `  ${l}`).join('\n') : '  (clean)',
    ];
    return lines.join('\n');
  }
}

// ================================================================
// Memory File Discoverer
// ================================================================

class MemoryFileDiscoverer {
  constructor(projectRoot) {
    this.projectRoot = projectRoot || process.cwd();
  }

  discover() {
    const results = {
      projectMemory: null,
      claudeMd: [],
      globalMemory: null,
    };

    const projectMemoryPath = join(this.projectRoot, 'MEMORY.md');
    if (existsSync(projectMemoryPath)) {
      results.projectMemory = this._readEntrypoint(projectMemoryPath);
    }

    const root = dirname(this.projectRoot);
    const relParts = this.projectRoot.substring(root.length).split(/[/\\]/).filter(Boolean);
    const ancestors = [root, ...relParts.reduce((acc, part) => {
      if (acc.length) acc.push(join(acc[acc.length - 1], '..'));
      return acc;
    }, []).map(p => join(root, p))];

    const uniqueAncestors = [...new Set(ancestors.reverse())];
    for (const dir of uniqueAncestors) {
      const claudeMdPath = join(dir, 'CLAUDE.md');
      if (existsSync(claudeMdPath)) {
        const content = this._readEntrypoint(claudeMdPath);
        if (content) {
          results.claudeMd.push({
            path: relative(this.projectRoot, claudeMdPath),
            absolute: claudeMdPath,
            content,
          });
        }
      }
    }

    const globalMemoryPath = join(homedir(), '.claude', 'MEMORY.md');
    if (existsSync(globalMemoryPath)) {
      results.globalMemory = this._readEntrypoint(globalMemoryPath);
    }

    return results;
  }

  _readEntrypoint(filePath) {
    try {
      const raw = readFileSync(filePath, 'utf8').trim();
      const lines = raw.split('\n');
      const byteCount = Buffer.byteLength(raw, 'utf8');

      const wasLineTruncated = lines.length > MAX_ENTRYPOINT_LINES;
      const wasByteTruncated = byteCount > MAX_ENTRYPOINT_BYTES;

      if (!wasLineTruncated && !wasByteTruncated) {
        return { content: raw, lines: lines.length, bytes: byteCount, truncated: false };
      }

      let truncated = wasLineTruncated
        ? lines.slice(0, MAX_ENTRYPOINT_LINES).join('\n')
        : raw;

      if (Buffer.byteLength(truncated, 'utf8') > MAX_ENTRYPOINT_BYTES) {
        let bytes = 0, lastNewline = 0;
        for (let i = 0; i < truncated.length; i++) {
          bytes += Buffer.byteLength(truncated[i], 'utf8');
          if (truncated[i] === '\n') lastNewline = i;
          if (bytes > MAX_ENTRYPOINT_BYTES) break;
        }
        truncated = truncated.substring(0, lastNewline);
      }

      return {
        content: truncated + '\n\n[... content truncated ...]',
        lines: Math.min(lines.length, MAX_ENTRYPOINT_LINES),
        bytes: Buffer.byteLength(truncated, 'utf8'),
        truncated: true,
        wasLineTruncated,
        wasByteTruncated,
      };
    } catch {
      return null;
    }
  }
}

// ================================================================
// Context Enhancer (v2.0)
// ================================================================

export class ContextEnhancer {
  constructor(kernel) {
    this.kernel = kernel;
    this.cwd = kernel?.config?.workspace || process.cwd();
    this.projectRoot = kernel?.config?.projectRoot || this.cwd;
    this._gitContext = null;
    this._gitCacheTTL = 30_000;
    this._gitCacheTime = 0;

    this._gitBuilder = null;
    this._memoryDiscoverer = null;
    this._contextCache = new Map();
  }

  async initialize() {
    this._gitBuilder = new GitContextBuilder(this.cwd);
    this._memoryDiscoverer = new MemoryFileDiscoverer(this.projectRoot);
    // console.log('[ContextEnhancer] Initialized v2.0');
  }

  /**
   * 构建标准上下文片段
   */
  async buildContext(options = {}) {
    const {
      includeGit = true,
      includeMemory = true,
      includeTimestamp = true,
      includeEnv = false,
      includeKernel = true,
    } = options;

    const parts = [];
    if (includeKernel) parts.push(this._buildKernelSection());
    if (includeGit) parts.push(await this._getGitContext());
    if (includeMemory) parts.push(this._buildMemorySection());
    if (includeTimestamp) parts.push(this._buildTimestampSection());
    if (includeEnv) parts.push(this._buildEnvSection());

    return parts.filter(Boolean).join('\n\n');
  }

  async buildIncrementalContext() {
    return this.buildContext();
  }

  // ================================================================
  // v2.0: Prompt Template System（借鉴 TaxHacker buildLLMPrompt）
  // ================================================================

  /**
   * 构建模板变量字典（TaxHacker 风格的运行时变量收集）
   * 用于 injectPromptTemplate() 渲染用户自定义 prompt
   *
   * @param {Object} options
   * @param {Array}  [options.fields]     - 字段定义 [{ code, llm_prompt, type, isRequired }]
   * @param {Array}  [options.categories] - 类别定义 [{ code, llm_prompt }]
   * @param {Array}  [options.projects]   - 项目定义 [{ code, llm_prompt }]
   * @param {Object} [options.extra]      - 额外自定义变量
   * @returns {Promise<Object>} 模板变量名 → 值
   *
   * @example
   *   const vars = await ctx.collectTemplateVars({
   *     fields: kernel.skillRegistry?.getFields() || [],
   *     categories: kernel.skillRegistry?.getCategories() || [],
   *   })
   *   const rendered = ctx.injectPromptTemplate(
   *     "提取字段：\n{fields}\n类别：{categories}",
   *     vars
   *   )
   */
  async collectTemplateVars(options = {}) {
    const vars = {};

    // Git 相关变量
    if (await this._gitBuilder?.isGitRepo()) {
      vars.gitBranch = await this._gitBuilder.getBranch() || '';
      vars.gitStatus = await this._gitBuilder.getStatus() || '(clean)';
      vars.gitCommits = (await this._gitBuilder.getRecentCommits(3) || []).join('\n');
    }

    // Memory 文件内容
    if (this._memoryDiscoverer) {
      const { projectMemory, globalMemory } = this._memoryDiscoverer.discover();
      vars.projectMemory = projectMemory?.content?.content || '';
      vars.globalMemory = globalMemory?.content || '';
    }

    // 字段渲染（TaxHacker 风格）
    if (options.fields) {
      vars.fields = renderFieldsToPrompt(options.fields, { showType: true, showRequired: true });
      vars['fields.code'] = options.fields.filter(f => f.code).map(f => f.code).join(', ');
    }

    // 类别渲染
    if (options.categories) {
      vars.categories = options.categories
        .filter(c => c.llm_prompt)
        .map(c => `- ${c.code}: for ${c.llm_prompt}`)
        .join('\n');
      vars['categories.code'] = options.categories.filter(c => c.code).map(c => c.code).join(', ');
    }

    // 项目渲染
    if (options.projects) {
      vars.projects = options.projects
        .filter(p => p.llm_prompt)
        .map(p => `- ${p.code}: for ${p.llm_prompt}`)
        .join('\n');
      vars['projects.code'] = options.projects.filter(p => p.code).map(p => p.code).join(', ');
    }

    // JSON Schema（用于 LLM structured output）
    if (options.fields) {
      vars.schema = JSON.stringify(fieldsToJsonSchema(options.fields, { includeItems: false }), null, 2);
    }

    // Kernel 元信息
    vars.kernelVersion = this.kernel?.state?.version || '3.6.0';
    vars.kernelCapabilities = 'Multi-model routing, 4-layer memory, tool bridge, intent engine';
    vars.workspace = this.cwd;
    vars.timestamp = new Date().toISOString();

    // 额外自定义变量
    if (options.extra && typeof options.extra === 'object') {
      Object.assign(vars, options.extra);
    }

    return vars;
  }

  /**
   * 渲染自定义 prompt 模板（TaxHacker buildLLMPrompt 统一入口）
   * 支持 {fields}/{categories}/{projects}/{gitBranch}/{gitStatus} 等变量
   *
   * @param {string} template - 含 {变量} 占位符的模板字符串
   * @param {Object} [vars]   - 额外变量（与 collectTemplateVars 合并）
   * @returns {Promise<string>} 渲染后的 prompt
   *
   * @example
   *   const vars = await ctx.collectTemplateVars({ fields: myFields });
   *   const prompt = ctx.injectPromptTemplate(
   *     "分析文档，提取字段：\n{fields}\n\n参考：kernel v{kernelVersion}",
   *     vars
   *   );
   */
  injectPromptTemplate(template, vars = {}) {
    return replaceTemplate(template, vars);
  }

  /**
   * 使用 fields 构建完整 prompt（TaxHacker buildLLMPrompt 封装）
   *
   * @param {string} template
   * @param {Object} params  - { fields, categories, projects, extra }
   * @param {Object} [options]
   * @returns {string}
   */
  buildPromptFromFields(template, params = {}, options = {}) {
    return buildLLMPrompt(template, params, options);
  }

  // ================================================================
  // 内部构建方法
  // ================================================================

  _buildKernelSection() {
    const version = this.kernel?.state?.version || '3.6.0';
    return `[HundunOS v${version} — AI Operating System Kernel]\n` +
      `Architecture: Microkernel + Rust Modules\n` +
      `Capabilities: Multi-model routing, 4-layer memory, tool bridge, intent engine`;
  }

  async _getGitContext() {
    if (!feature('CONTEXT_COMPACT')) {
      try {
        const branch = await this._gitBuilder?.getBranch();
        if (!branch) return '';
        return `[Git Context]\nCurrent branch: ${branch}`;
      } catch {
        return '';
      }
    }

    const now = Date.now();
    if (this._gitContext && (now - this._gitCacheTime) < this._gitCacheTTL) {
      return this._gitContext;
    }
    this._gitContext = await this._gitBuilder?.getFullContext() || '';
    this._gitCacheTime = now;
    return this._gitContext;
  }

  _buildMemorySection() {
    if (!feature('CONTEXT_COMPACT')) return '';
    const { projectMemory, claudeMd, globalMemory } = this._memoryDiscoverer?.discover() || {};
    const lines = ['[Memory Files]'];

    if (projectMemory) {
      lines.push(`\n## Project MEMORY.md`);
      lines.push(projectMemory.content);
    }
    if (claudeMd?.length > 0) {
      lines.push(`\n## CLAUDE.md chain (${claudeMd.length} files)`);
      for (const { path, content } of claudeMd) {
        lines.push(`\n### ${path}`);
        lines.push(content.content);
      }
    }
    if (globalMemory) {
      lines.push(`\n## Global ~/.claude/MEMORY.md`);
      lines.push(globalMemory.content);
    }
    return lines.join('\n');
  }

  _buildTimestampSection() {
    const now = new Date();
    return `[Session Context]\n` +
      `Current date: ${now.toISOString().split('T')[0]}\n` +
      `Current time: ${now.toTimeString().split(' ')[0]} UTC${now.getTimezoneOffset() > 0 ? '+' : ''}${-now.getTimezoneOffset() / 60}`;
  }

  _buildEnvSection() {
    const relevant = [
      'HUNDUNOS_ENV', 'NODE_ENV', 'LANG', 'LC_ALL', 'PATH', 'HOME', 'USER', 'SHELL',
    ].filter(k => process.env[k]);
    if (relevant.length === 0) return '';
    return `[Relevant Environment]\n` + relevant.map(k => `${k}=${process.env[k]}`).join('\n');
  }

  // ================================================================
  // 缓存管理
  // ================================================================

  invalidateCache(reason = 'manual') {
    const size = this._contextCache.size;
    this._contextCache.clear();
    this._gitContext = null;
    this._gitCacheTime = 0;
    return { cleared: size, reason };
  }

  getCacheStats() {
    return {
      size: this._contextCache.size,
      gitTTL: this._gitCacheTTL,
      gitAge: this._gitCacheTime ? Date.now() - this._gitCacheTime : 0,
      gitCached: this._gitContext !== null,
    };
  }
}

// ================================================================
// Re-export prompt-template utilities for external use
// ================================================================
export { replaceTemplate, buildLLMPrompt, renderFieldsToPrompt, fieldsToJsonSchema, parseLLMResponse } from './prompt-template.js';
