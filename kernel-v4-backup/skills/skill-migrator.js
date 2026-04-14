/**
 * Skill 迁移工具
 * 将现有的基于 YAML Frontmatter 的 Skill 迁移到新的声明式定义系统
 */

import { SkillDefinition, SkillType, SkillExecutionMode } from './skill-definition.js';
import { parseSkillMarkdown } from './skill-loader.js';

/**
 * Skill 迁移配置
 * @typedef {Object} MigrationConfig
 * @property {boolean} preserveOriginal - 是否保留原始格式
 * @property {boolean} validateOutput - 是否验证输出
 * @property {Function} parameterMapper - 参数映射函数
 * @property {Function} toolMapper - 工具映射函数
 */

/**
 * 默认迁移配置
 */
const DEFAULT_MIGRATION_CONFIG = {
  preserveOriginal: true,
  validateOutput: true,
  parameterMapper: null,
  toolMapper: null
};

/**
 * 迁移映射表
 * 将旧格式字段映射到新格式
 */
const MIGRATION_MAPPINGS = {
  // 描述字段映射
  description: {
    name: 'name',
    displayName: 'name', // 如果没有 displayName，使用 name
    description: 'description',
    version: 'version',
    category: 'category',
    subcategory: 'subcategory',
    tags: 'tags',
    author: 'author',
    documentationUrl: 'documentationUrl',
    icon: 'icon',
    iconColor: 'iconColor'
  },
  
  // 功能标志映射
  features: {
    asyncExecution: 'async_execution',
    retrySupport: 'retry_support',
    continueOnFail: 'continue_on_fail',
    caching: 'caching',
    streaming: 'streaming',
    binaryData: 'binary_data',
    aiIntegration: 'ai_integration',
    webhooks: 'webhooks'
  },
  
  // 配置映射
  config: {
    timeout: 'timeout',
    maxExecutionTime: 'max_execution_time',
    isolation: 'isolation',
    retryCount: 'retry_count',
    retryDelay: 'retry_delay',
    memoryLimit: 'memory_limit'
  },
  
  // 类型映射
  type: {
    execute: SkillType.EXECUTE,
    poll: SkillType.POLL,
    trigger: SkillType.TRIGGER,
    webhook: SkillType.WEBHOOK,
    manual: SkillType.MANUAL
  },
  
  // 执行模式映射
  executionMode: {
    manual: SkillExecutionMode.MANUAL,
    trigger: SkillExecutionMode.TRIGGER,
    webhook: SkillExecutionMode.WEBHOOK,
    retry: SkillExecutionMode.RETRY,
    cli: SkillExecutionMode.CLI,
    evaluation: SkillExecutionMode.EVALUATION
  }
};

/**
 * Skill 迁移器类
 */
export class SkillMigrator {
  /**
   * @param {MigrationConfig} config - 迁移配置
   */
  constructor(config = {}) {
    this.config = { ...DEFAULT_MIGRATION_CONFIG, ...config };
  }

  /**
   * 从 YAML Frontmatter Skill 迁移到新的 SkillDefinition
   * @param {Object} oldSkill - 旧格式的 Skill 对象
   * @returns {SkillDefinition}
   */
  migrateFromYAMLFrontmatter(oldSkill) {
    const { name, description, version, tags, author, priority, requires, related_skills, metadata } = oldSkill;

    // 构建新的 Skill 定义
    const builder = SkillDefinition.builder()
      .withName(this._normalizeName(name))
      .withDisplayName(this._capitalizeFirst(name))
      .withDescription(description || `Skill: ${name}`)
      .withVersion(this._parseVersion(version))
      .withType(SkillType.EXECUTE)
      .withExecutionMode(SkillExecutionMode.MANUAL);

    // 添加标签
    if (tags && Array.isArray(tags)) {
      tags.forEach(tag => builder.withTag(tag));
    }

    // 添加分类（从标签推断）
    if (tags && tags.length > 0) {
      builder.withCategory(tags[0]);
    }

    // 构建基础 SkillDefinition
    const skillDefinition = builder.build();

    // 添加作者
    if (author) {
      skillDefinition.description.author = author;
    }

    // 添加额外元数据（通过扩展字段）
    const extendedMetadata = {};
    
    // 添加优先级到元数据
    if (priority) {
      extendedMetadata.priority = priority;
    }

    // 添加依赖
    if (requires && Array.isArray(requires)) {
      skillDefinition.description.dependencies = requires;
    }

    // 添加相关 Skills
    if (related_skills && Array.isArray(related_skills)) {
      extendedMetadata.related_skills = related_skills;
    }

    // 添加其他元数据
    if (metadata) {
      Object.assign(extendedMetadata, metadata);
    }

    // 将扩展元数据添加到 description
    if (Object.keys(extendedMetadata).length > 0) {
      // 由于 Schema 中没有 metadata 字段，我们需要将其作为自定义字段处理
      // 这里我们将其添加到 description 中，并确保 Schema 允许额外字段
      skillDefinition.description.metadata = extendedMetadata;
    }

    // 验证输出
    if (this.config.validateOutput) {
      this._validateMigration(skillDefinition);
    }

    return skillDefinition;
  }

  /**
   * 从 Markdown 文件迁移 Skill
   * @param {string} filePath - Markdown 文件路径
   * @param {string} defaultName - 默认名称
   * @returns {SkillDefinition}
   */
  migrateFromMarkdown(filePath, defaultName) {
    const oldSkill = parseSkillMarkdown(defaultName, '');
    
    // 读取文件内容
    const content = this._readFile(filePath);
    const parsed = parseSkillMarkdown(defaultName, content);

    return this.migrateFromYAMLFrontmatter({
      ...parsed,
      path: filePath
    });
  }

  /**
   * 批量迁移 Skills
   * @param {Array<Object>} oldSkills - 旧格式的 Skill 数组
   * @returns {Array<SkillDefinition>}
   */
  migrateBatch(oldSkills) {
    const results = [];
    const errors = [];

    for (const oldSkill of oldSkills) {
      try {
        const newSkill = this.migrateFromYAMLFrontmatter(oldSkill);
        results.push({
          success: true,
          oldName: oldSkill.name,
          newName: newSkill.getName(),
          skill: newSkill
        });
      } catch (error) {
        errors.push({
          success: false,
          oldName: oldSkill.name,
          error: error.message
        });
      }
    }

    return {
      migrated: results,
      errors,
      total: oldSkills.length,
      successCount: results.length,
      errorCount: errors.length
    };
  }

  /**
   * 生成迁移报告
   * @param {Object} migrationResult - 迁移结果
   * @returns {string}
   */
  generateMigrationReport(migrationResult) {
    const { migrated, errors, total, successCount, errorCount } = migrationResult;

    let report = `=== Skill Migration Report ===\n\n`;
    report += `Total Skills: ${total}\n`;
    report += `Successfully Migrated: ${successCount}\n`;
    report += `Failed: ${errorCount}\n\n`;

    if (migrated.length > 0) {
      report += `=== Successfully Migrated ===\n`;
      migrated.forEach((item, index) => {
        report += `${index + 1}. ${item.oldName} -> ${item.newName}\n`;
      });
      report += `\n`;
    }

    if (errors.length > 0) {
      report += `=== Failed Migrations ===\n`;
      errors.forEach((item, index) => {
        report += `${index + 1}. ${item.oldName}: ${item.error}\n`;
      });
      report += `\n`;
    }

    return report;
  }

  /**
   * 标准化 Skill 名称
   * @private
   * @param {string} name - 原始名称
   * @returns {string}
   */
  _normalizeName(name) {
    if (!name) return 'unnamed-skill';
    
    // 转换为小写，用连字符替换空格和下划线
    return name
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * 首字母大写
   * @private
   * @param {string} str - 字符串
   * @returns {string}
   */
  _capitalizeFirst(str) {
    if (!str) return 'Unnamed Skill';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * 解析版本号
   * @private
   * @param {string|number} version - 版本号
   * @returns {number}
   */
  _parseVersion(version) {
    if (!version) return 1;
    
    if (typeof version === 'number') {
      return version;
    }

    // 移除 'v' 前缀
    const cleaned = version.toString().replace(/^v/i, '');
    
    // 解析主版本号（取第一个数字）
    const match = cleaned.match(/^\d+/);
    return match ? parseInt(match[0], 10) : 1;
  }

  /**
   * 验证迁移结果
   * @private
   * @param {SkillDefinition} skillDefinition - Skill 定义
   */
  _validateMigration(skillDefinition) {
    // 验证名称
    if (!skillDefinition.getName()) {
      throw new Error('Skill name is required');
    }

    // 验证描述
    if (!skillDefinition.getDisplayName()) {
      throw new Error('Skill display name is required');
    }

    // 验证版本
    if (skillDefinition.getVersion() <= 0) {
      throw new Error('Skill version must be positive');
    }
  }

  /**
   * 读取文件内容
   * @private
   * @param {string} filePath - 文件路径
   * @returns {string}
   */
  _readFile(filePath) {
    try {
      const fs = require('fs');
      return fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error.message}`);
    }
  }
}

/**
 * 创建默认的 Skill 迁移器
 * @returns {SkillMigrator}
 */
export function createSkillMigrator(config) {
  return new SkillMigrator(config);
}

/**
 * 快速迁移单个 Skill
 * @param {Object} oldSkill - 旧格式的 Skill
 * @returns {SkillDefinition}
 */
export function migrateSkill(oldSkill) {
  const migrator = new SkillMigrator();
  return migrator.migrateFromYAMLFrontmatter(oldSkill);
}

/**
 * 快速批量迁移 Skills
 * @param {Array<Object>} oldSkills - 旧格式的 Skill 数组
 * @returns {Object}
 */
export function migrateSkills(oldSkills) {
  const migrator = new SkillMigrator();
  return migrator.migrateBatch(oldSkills);
}
