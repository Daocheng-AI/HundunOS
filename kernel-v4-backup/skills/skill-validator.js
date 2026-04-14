// kernel/skills/skill-validator.js
// HundunOS v3.9 — Skill 验证器
// 移植自 PromptHub skill-validator.ts，适配 HundunOS 架构
// 
// 职责：
//   - Skill 名称格式验证（kebab-case，1-64字符）
//   - SKILL.md frontmatter 解析
//   - 完整 Skill 包验证

/**
 * Skill name validation regex
 * 技能名称验证正则：小写字母数字 + 单个连字符分隔
 * - Length: 1-64 characters
 * - Format: lowercase alphanumeric with single hyphen separators
 * - Cannot start or end with `-`
 * - Cannot contain consecutive `--`
 */
export const SKILL_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Skill frontmatter 接口
 * @typedef {Object} SkillFrontmatter
 * @property {string} name - Skill 名称（必填）
 * @property {string} [description] - 描述
 * @property {string} [version] - 版本号
 * @property {string} [author] - 作者
 * @property {string} [license] - 许可证
 * @property {string} [compatibility] - 兼容性
 * @property {string[]} [tags] - 标签
 * @property {Record<string, string>} [metadata] - 扩展元数据
 */

/**
 * 解析后的 SKILL.md 结果
 * @typedef {Object} ParsedSkillMd
 * @property {SkillFrontmatter} frontmatter
 * @property {string} body
 * @property {string} raw
 */

/**
 * 验证结果
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {string[]} errors
 * @property {string[]} warnings
 * @property {ParsedSkillMd} [data]
 */

/**
 * 验证 Skill 名称格式
 * @param {string} name - Skill name to validate
 * @returns {boolean} true if valid, false otherwise
 */
export function validateSkillName(name) {
    if (!name || typeof name !== 'string') {
        return false;
    }
    
    // Check length
    if (name.length < 1 || name.length > 64) {
        return false;
    }
    
    // Check format
    return SKILL_NAME_REGEX.test(name);
}

/**
 * 获取 Skill 名称验证错误信息
 * @param {string} name - Skill name to validate
 * @returns {string | null} Error message or null if valid
 */
export function getSkillNameError(name) {
    if (!name || typeof name !== 'string') {
        return 'Skill name is required';
    }
    
    if (name.length < 1) {
        return 'Skill name cannot be empty';
    }
    
    if (name.length > 64) {
        return 'Skill name cannot exceed 64 characters';
    }
    
    if (!SKILL_NAME_REGEX.test(name)) {
        if (name !== name.toLowerCase()) {
            return 'Skill name must be lowercase';
        }
        if (name.startsWith('-') || name.endsWith('-')) {
            return 'Skill name cannot start or end with a hyphen';
        }
        if (name.includes('--')) {
            return 'Skill name cannot contain consecutive hyphens';
        }
        if (/[^a-z0-9-]/.test(name)) {
            return 'Skill name can only contain lowercase letters, numbers, and hyphens';
        }
        return 'Invalid skill name format';
    }
    
    return null;
}

/**
 * 解析 SKILL.md 内容，提取 frontmatter 和正文
 * @param {string} content - Raw SKILL.md content
 * @returns {ParsedSkillMd | null} Parsed result or null if parsing fails
 */
export function parseSkillMd(content) {
    if (!content || typeof content !== 'string') {
        return null;
    }
    
    // Match YAML frontmatter
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    
    if (!frontmatterMatch) {
        // No frontmatter, return body only
        return {
            frontmatter: { name: '' },
            body: content.trim(),
            raw: content,
        };
    }
    
    const yamlContent = frontmatterMatch[1];
    const body = content.slice(frontmatterMatch[0].length).trim();
    
    // Parse YAML manually (simple parser)
    /** @type {SkillFrontmatter} */
    const frontmatter = { name: '' };
    /** @type {Record<string, string>} */
    const metadata = {};
    let inMetadata = false;
    
    const lines = yamlContent.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }
        
        // Check for metadata block
        if (trimmed === 'metadata:') {
            inMetadata = true;
            continue;
        }
        
        // Parse key-value pairs
        const colonIndex = trimmed.indexOf(':');
        if (colonIndex === -1) {
            continue;
        }
        
        const key = trimmed.slice(0, colonIndex).trim();
        let value = trimmed.slice(colonIndex + 1).trim();
        
        // Handle indented metadata entries
        if (inMetadata && line.startsWith('  ')) {
            metadata[key] = value;
            continue;
        } else if (!line.startsWith('  ')) {
            inMetadata = false;
        }
        
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        
        // Handle array values [a, b, c]
        if (value.startsWith('[') && value.endsWith(']')) {
            const arrayContent = value.slice(1, -1);
            const items = arrayContent.split(',').map(item => item.trim().replace(/^['"]|['"]$/g, ''));
            if (key === 'tags') {
                frontmatter.tags = items.filter(Boolean);
            } else if (key === 'compatibility') {
                frontmatter.compatibility = items.filter(Boolean).join(', ');
            }
            continue;
        }
        
        // Map to frontmatter fields
        switch (key) {
            case 'name':
                frontmatter.name = value;
                break;
            case 'description':
                frontmatter.description = value;
                break;
            case 'version':
                frontmatter.version = value;
                break;
            case 'author':
                frontmatter.author = value;
                break;
            case 'license':
                frontmatter.license = value;
                break;
            case 'compatibility':
                frontmatter.compatibility = value;
                break;
            case 'tags':
                // Already handled above for array format
                if (!frontmatter.tags) {
                    frontmatter.tags = value.split(',').map(t => t.trim()).filter(Boolean);
                }
                break;
        }
    }
    
    if (Object.keys(metadata).length > 0) {
        frontmatter.metadata = metadata;
    }
    
    return {
        frontmatter,
        body,
        raw: content,
    };
}

/**
 * 验证 SKILL.md 文件内容
 * @param {string} content - Raw SKILL.md content
 * @param {string} [directoryName] - Optional directory name to match against skill name
 * @returns {ValidationResult} Validation result with errors and warnings
 */
export function validateSkillMd(content, directoryName) {
    /** @type {string[]} */
    const errors = [];
    /** @type {string[]} */
    const warnings = [];
    
    // Parse content
    const parsed = parseSkillMd(content);
    
    if (!parsed) {
        return {
            valid: false,
            errors: ['Failed to parse SKILL.md content'],
            warnings: [],
        };
    }
    
    // Validate name
    if (!parsed.frontmatter.name) {
        errors.push('Missing required field: name');
    } else {
        const nameError = getSkillNameError(parsed.frontmatter.name);
        if (nameError) {
            errors.push(`Invalid name: ${nameError}`);
        }
        
        // Check if name matches directory name
        if (directoryName && parsed.frontmatter.name !== directoryName) {
            warnings.push(`Skill name "${parsed.frontmatter.name}" does not match directory name "${directoryName}"`);
        }
    }
    
    // Validate description
    if (!parsed.frontmatter.description) {
        warnings.push('Missing recommended field: description');
    } else if (parsed.frontmatter.description.length > 1024) {
        errors.push('Description cannot exceed 1024 characters');
    }
    
    // Check for body content
    if (!parsed.body || parsed.body.length === 0) {
        warnings.push('SKILL.md has no content after frontmatter');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings,
        data: parsed,
    };
}

/**
 * 验证 YAML Skill 定义（HundunOS 原生格式）
 * @param {object} def - Skill definition object
 * @returns {ValidationResult}
 */
export function validateSkillDef(def) {
    /** @type {string[]} */
    const errors = [];
    /** @type {string[]} */
    const warnings = [];
    
    if (!def) {
        return { valid: false, errors: ['Skill definition is null or undefined'], warnings: [] };
    }
    
    // Required: name
    if (!def.name) {
        errors.push('Missing required field: name');
    } else {
        const nameError = getSkillNameError(def.name);
        if (nameError) {
            errors.push(`Invalid name: ${nameError}`);
        }
    }
    
    // Required: version
    if (!def.version) {
        warnings.push('Missing recommended field: version (defaulting to 1.0.0)');
    }
    
    // Optional: description
    if (!def.description) {
        warnings.push('Missing recommended field: description');
    }
    
    // Validate tools array
    if (def.tools) {
        if (!Array.isArray(def.tools)) {
            errors.push('tools must be an array');
        } else {
            for (let i = 0; i < def.tools.length; i++) {
                const tool = def.tools[i];
                if (!tool.id && !tool.type) {
                    errors.push(`Tool at index ${i} missing id or type`);
                }
            }
        }
    }
    
    // Validate trigger
    if (def.trigger) {
        if (typeof def.trigger !== 'object') {
            errors.push('trigger must be an object');
        } else {
            if (def.trigger.patterns && !Array.isArray(def.trigger.patterns)) {
                errors.push('trigger.patterns must be an array');
            }
        }
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings,
        data: def,
    };
}

/**
 * 验证完整的 Skill 包（文件夹结构）
 * @param {string} folderPath - Path to skill folder
 * @returns {Promise<ValidationResult>}
 */
export async function validateSkillPackage(folderPath) {
    const { existsSync, statSync, readFileSync } = await import('fs');
    const { join, basename } = await import('path');
    
    /** @type {string[]} */
    const errors = [];
    /** @type {string[]} */
    const warnings = [];
    
    try {
        // Check if folder exists and is a directory
        if (!existsSync(folderPath)) {
            return {
                valid: false,
                errors: ['Folder does not exist'],
                warnings: [],
            };
        }
        
        const stat = statSync(folderPath);
        if (!stat.isDirectory()) {
            return {
                valid: false,
                errors: ['Path is not a directory'],
                warnings: [],
            };
        }
        
        const directoryName = basename(folderPath);
        
        // Check for SKILL.md
        const skillMdPath = join(folderPath, 'SKILL.md');
        let skillMdContent;
        
        try {
            skillMdContent = readFileSync(skillMdPath, 'utf-8');
        } catch {
            return {
                valid: false,
                errors: ['SKILL.md file not found'],
                warnings: [],
            };
        }
        
        // Validate SKILL.md
        const skillMdResult = validateSkillMd(skillMdContent, directoryName);
        errors.push(...skillMdResult.errors);
        warnings.push(...skillMdResult.warnings);
        
        // Check for optional manifest.json
        try {
            const manifestPath = join(folderPath, 'manifest.json');
            const manifestContent = readFileSync(manifestPath, 'utf-8');
            try {
                JSON.parse(manifestContent);
            } catch {
                warnings.push('manifest.json contains invalid JSON');
            }
        } catch {
            // manifest.json is optional
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            data: skillMdResult.data,
        };
    } catch (error) {
        return {
            valid: false,
            errors: [`Failed to validate skill package: ${error}`],
            warnings: [],
        };
    }
}

/**
 * Sanitize imported skill draft（移植自 PromptHub skill-import-sanitize.ts）
 * @param {object} draft - Raw skill draft from import
 * @param {object} options - Sanitization options
 * @returns {object} Sanitized skill object
 */
export function sanitizeImportedSkillDraft(draft, options = {}) {
    const { defaultTags = [] } = options;
    
    const sanitized = {
        name: draft.name || draft.fallbackName || '',
        description: draft.description || draft.fallbackDescription || '',
        version: draft.version || draft.fallbackVersion || '1.0.0',
        author: draft.author || draft.fallbackAuthor || 'Unknown',
        tags: Array.isArray(draft.tags) ? draft.tags : (Array.isArray(draft.fallbackTags) ? draft.fallbackTags : defaultTags),
        instructions: draft.instructions || '',
    };
    
    // Validate and fix name
    if (!validateSkillName(sanitized.name)) {
        // Try to fix: lowercase, replace spaces with hyphens
        sanitized.name = sanitized.name
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '')
            .replace(/^-+|-+$/g, '')
            .replace(/--+/g, '-');
    }
    
    // Ensure tags is an array
    if (!Array.isArray(sanitized.tags)) {
        sanitized.tags = [];
    }
    
    return sanitized;
}

export default {
    validateSkillName,
    getSkillNameError,
    parseSkillMd,
    validateSkillMd,
    validateSkillDef,
    validateSkillPackage,
    sanitizeImportedSkillDraft,
    SKILL_NAME_REGEX,
};
