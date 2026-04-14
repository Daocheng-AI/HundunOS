/**
 * 版本化 Skill 类型系统
 * 基于 n8n 的 VersionedNodeType 设计，支持多个版本的 Skill
 */

import { SkillDefinition } from './skill-definition.js';

/**
 * Skill 版本接口
 * @typedef {Object} ISkillVersion
 * @property {number} version - 版本号
 * @property {SkillDefinition} definition - Skill 定义
 */

/**
 * 版本化 Skill 类型接口
 * @typedef {Object} IVersionedSkillType
 * @property {Object} description - Skill 描述信息
 * @property {number} currentVersion - 当前版本号
 * @property {number} defaultVersion - 默认版本号
 * @property {Record<number, ISkillVersion>} skillVersions - 所有版本
 */

/**
 * 版本化 Skill 类型类
 */
export class VersionedSkillType {
  /**
   * @param {Record<number, SkillDefinition>} skillVersions - Skill 版本映射
   * @param {Object} description - Skill 描述
   */
  constructor(skillVersions, description) {
    if (!skillVersions || Object.keys(skillVersions).length === 0) {
      throw new Error('skillVersions must contain at least one version');
    }

    this.skillVersions = {};
    
    // 转换并验证所有版本
    for (const [versionStr, skillDefinition] of Object.entries(skillVersions)) {
      const version = parseInt(versionStr, 10);
      
      if (isNaN(version) || version <= 0) {
        throw new Error(`Invalid version number: ${versionStr}`);
      }

      if (!skillDefinition || !(skillDefinition instanceof SkillDefinition)) {
        throw new Error(`Skill definition for version ${version} must be a SkillDefinition instance`);
      }

      // 验证 Skill 定义的版本号是否匹配
      if (skillDefinition.getVersion() !== version) {
        throw new Error(
          `Skill definition version (${skillDefinition.getVersion()}) does not match key version (${version})`
        );
      }

      this.skillVersions[version] = {
        version,
        definition: skillDefinition
      };
    }

    this.description = description || {};
    this.defaultVersion = description.defaultVersion ?? this.getLatestVersion();
    this.currentVersion = this.defaultVersion;
  }

  /**
   * 获取最新版本号
   * @returns {number}
   */
  getLatestVersion() {
    return Math.max(...Object.keys(this.skillVersions).map(Number));
  }

  /**
   * 获取所有版本号
   * @returns {Array<number>}
   */
  getAllVersions() {
    return Object.keys(this.skillVersions).map(Number).sort((a, b) => a - b);
  }

  /**
   * 检查版本是否存在
   * @param {number} version - 版本号
   * @returns {boolean}
   */
  hasVersion(version) {
    return version in this.skillVersions;
  }

  /**
   * 获取指定版本的 Skill 定义
   * @param {number} version - 版本号（可选，默认使用当前版本）
   * @returns {SkillDefinition}
   */
  getSkillDefinition(version = this.currentVersion) {
    const skillVersion = this.skillVersions[version];
    
    if (!skillVersion) {
      const availableVersions = this.getAllVersions().join(', ');
      throw new Error(
        `Version ${version} not found. Available versions: ${availableVersions}`
      );
    }

    return skillVersion.definition;
  }

  /**
   * 获取当前版本的 Skill 定义
   * @returns {SkillDefinition}
   */
  getCurrentSkillDefinition() {
    return this.getSkillDefinition(this.currentVersion);
  }

  /**
   * 获取最新版本的 Skill 定义
   * @returns {SkillDefinition}
   */
  getLatestSkillDefinition() {
    return this.getSkillDefinition(this.getLatestVersion());
  }

  /**
   * 获取默认版本的 Skill 定义
   * @returns {SkillDefinition}
   */
  getDefaultSkillDefinition() {
    return this.getSkillDefinition(this.defaultVersion);
  }

  /**
   * 设置当前版本
   * @param {number} version - 版本号
   * @returns {VersionedSkillType}
   */
  setCurrentVersion(version) {
    if (!this.hasVersion(version)) {
      const availableVersions = this.getAllVersions().join(', ');
      throw new Error(
        `Cannot set version ${version}. Available versions: ${availableVersions}`
      );
    }

    this.currentVersion = version;
    return this;
  }

  /**
   * 设置默认版本
   * @param {number} version - 版本号
   * @returns {VersionedSkillType}
   */
  setDefaultVersion(version) {
    if (!this.hasVersion(version)) {
      const availableVersions = this.getAllVersions().join(', ');
      throw new Error(
        `Cannot set default version ${version}. Available versions: ${availableVersions}`
      );
    }

    this.defaultVersion = version;
    return this;
  }

  /**
   * 重置为默认版本
   * @returns {VersionedSkillType}
   */
  resetToDefaultVersion() {
    this.currentVersion = this.defaultVersion;
    return this;
  }

  /**
   * 升级到最新版本
   * @returns {VersionedSkillType}
   */
  upgradeToLatestVersion() {
    this.currentVersion = this.getLatestVersion();
    return this;
  }

  /**
   * 获取版本迁移信息
   * @param {number} fromVersion - 源版本
   * @param {number} toVersion - 目标版本
   * @returns {Object}
   */
  getVersionMigrationInfo(fromVersion, toVersion) {
    if (!this.hasVersion(fromVersion)) {
      throw new Error(`Source version ${fromVersion} not found`);
    }

    if (!this.hasVersion(toVersion)) {
      throw new Error(`Target version ${toVersion} not found`);
    }

    const fromDef = this.getSkillDefinition(fromVersion);
    const toDef = this.getSkillDefinition(toVersion);

    return {
      fromVersion,
      toVersion,
      isUpgrade: toVersion > fromVersion,
      isDowngrade: toVersion < fromVersion,
      breakingChanges: this._detectBreakingChanges(fromDef, toDef),
      parameters: this._compareParameters(fromDef, toDef),
      returns: this._compareReturns(fromDef, toDef),
      credentials: this._compareCredentials(fromDef, toDef)
    };
  }

  /**
   * 检测破坏性变更
   * @private
   * @param {SkillDefinition} fromDef - 源 Skill 定义
   * @param {SkillDefinition} toDef - 目标 Skill 定义
   * @returns {Array<string>}
   */
  _detectBreakingChanges(fromDef, toDef) {
    const changes = [];

    // 检查删除的必需参数
    const fromRequiredParams = new Set(fromDef.getRequiredParameters());
    const toRequiredParams = new Set(toDef.getRequiredParameters());
    
    for (const param of fromRequiredParams) {
      if (!toDef.getParameter(param)) {
        changes.push(`Required parameter '${param}' was removed`);
      }
    }

    // 检查参数类型变更
    for (const param of fromDef.parameters) {
      const toParam = toDef.getParameter(param.name);
      if (toParam && toParam.type !== param.type) {
        changes.push(`Parameter '${param.name}' type changed from ${param.type} to ${toParam.type}`);
      }
    }

    // 检查返回值变更
    for (const ret of fromDef.returns) {
      const toRet = toDef.getReturn(ret.name);
      if (!toRet) {
        changes.push(`Return value '${ret.name}' was removed`);
      } else if (toRet.type !== ret.type) {
        changes.push(`Return value '${ret.name}' type changed from ${ret.type} to ${toRet.type}`);
      }
    }

    return changes;
  }

  /**
   * 比较参数
   * @private
   * @param {SkillDefinition} fromDef - 源 Skill 定义
   * @param {SkillDefinition} toDef - 目标 Skill 定义
   * @returns {Object}
   */
  _compareParameters(fromDef, toDef) {
    const added = [];
    const removed = [];
    const modified = [];

    const fromParams = new Map(fromDef.parameters.map(p => [p.name, p]));
    const toParams = new Map(toDef.parameters.map(p => [p.name, p]));

    // 检查新增的参数
    for (const [name, param] of toParams) {
      if (!fromParams.has(name)) {
        added.push(name);
      }
    }

    // 检查删除的参数
    for (const [name, param] of fromParams) {
      if (!toParams.has(name)) {
        removed.push(name);
      } else {
        const toParam = toParams.get(name);
        // 检查是否有修改
        if (
          param.type !== toParam.type ||
          param.required !== toParam.required ||
          param.default !== toParam.default
        ) {
          modified.push({
            name,
            from: {
              type: param.type,
              required: param.required,
              default: param.default
            },
            to: {
              type: toParam.type,
              required: toParam.required,
              default: toParam.default
            }
          });
        }
      }
    }

    return { added, removed, modified };
  }

  /**
   * 比较返回值
   * @private
   * @param {SkillDefinition} fromDef - 源 Skill 定义
   * @param {SkillDefinition} toDef - 目标 Skill 定义
   * @returns {Object}
   */
  _compareReturns(fromDef, toDef) {
    const added = [];
    const removed = [];
    const modified = [];

    const fromReturns = new Map(fromDef.returns.map(r => [r.name, r]));
    const toReturns = new Map(toDef.returns.map(r => [r.name, r]));

    // 检查新增的返回值
    for (const [name, ret] of toReturns) {
      if (!fromReturns.has(name)) {
        added.push(name);
      }
    }

    // 检查删除的返回值
    for (const [name, ret] of fromReturns) {
      if (!toReturns.has(name)) {
        removed.push(name);
      } else {
        const toRet = toReturns.get(name);
        // 检查是否有修改
        if (ret.type !== toRet.type) {
          modified.push({
            name,
            from: ret.type,
            to: toRet.type
          });
        }
      }
    }

    return { added, removed, modified };
  }

  /**
   * 比较凭证
   * @private
   * @param {SkillDefinition} fromDef - 源 Skill 定义
   * @param {SkillDefinition} toDef - 目标 Skill 定义
   * @returns {Object}
   */
  _compareCredentials(fromDef, toDef) {
    const added = [];
    const removed = [];

    const fromCreds = new Set(fromDef.credentials.map(c => c.name));
    const toCreds = new Set(toDef.credentials.map(c => c.name));

    // 检查新增的凭证
    for (const cred of toCreds) {
      if (!fromCreds.has(cred)) {
        added.push(cred);
      }
    }

    // 检查删除的凭证
    for (const cred of fromCreds) {
      if (!toCreds.has(cred)) {
        removed.push(cred);
      }
    }

    return { added, removed };
  }

  /**
   * 序列化为 JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      description: this.description,
      currentVersion: this.currentVersion,
      defaultVersion: this.defaultVersion,
      skillVersions: Object.fromEntries(
        Object.entries(this.skillVersions).map(([version, skillVersion]) => [
          version,
          {
            version: skillVersion.version,
            definition: skillVersion.definition.toJSON()
          }
        ])
      )
    };
  }

  /**
   * 从 JSON 创建版本化 Skill 类型
   * @param {Object} json - JSON 对象
   * @returns {VersionedSkillType}
   */
  static fromJSON(json) {
    const skillVersions = {};

    for (const [versionStr, skillVersion] of Object.entries(json.skillVersions)) {
      const version = parseInt(versionStr, 10);
      skillVersions[version] = SkillDefinition.fromJSON(skillVersion.definition);
    }

    return new VersionedSkillType(skillVersions, json.description);
  }

  /**
   * 创建版本化 Skill 类型构建器
   * @param {Object} description - Skill 描述
   * @returns {VersionedSkillTypeBuilder}
   */
  static builder(description) {
    return new VersionedSkillTypeBuilder(description);
  }
}

/**
 * 版本化 Skill 类型构建器
 */
export class VersionedSkillTypeBuilder {
  /**
   * @param {Object} description - Skill 描述
   */
  constructor(description = {}) {
    this._description = description;
    this._skillVersions = {};
  }

  /**
   * 添加版本
   * @param {number} version - 版本号
   * @param {SkillDefinition} definition - Skill 定义
   * @returns {VersionedSkillTypeBuilder}
   */
  withVersion(version, definition) {
    if (version in this._skillVersions) {
      throw new Error(`Version ${version} already exists`);
    }

    if (definition.getVersion() !== version) {
      throw new Error(
        `Skill definition version (${definition.getVersion()}) does not match specified version (${version})`
      );
    }

    this._skillVersions[version] = definition;
    return this;
  }

  /**
   * 设置默认版本
   * @param {number} version - 版本号
   * @returns {VersionedSkillTypeBuilder}
   */
  withDefaultVersion(version) {
    this._description.defaultVersion = version;
    return this;
  }

  /**
   * 构建版本化 Skill 类型
   * @returns {VersionedSkillType}
   */
  build() {
    if (Object.keys(this._skillVersions).length === 0) {
      throw new Error('At least one version must be added');
    }

    return new VersionedSkillType(this._skillVersions, this._description);
  }
}
