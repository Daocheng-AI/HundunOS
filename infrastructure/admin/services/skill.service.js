/**
 * Skill服务
 * @module infrastructure/admin/services/skill.service
 */

import { CRUDBase } from '../core/base-crud.js';
import { SkillModel, SkillStatus, InstallSource } from '../models/skill.model.js';
import { SkillException, ValidationException } from '../core/exceptions.js';
import { ErrorCodes } from '../core/response.js';
import { getStorage, getKernel } from '../core/dependencies.js';

/**
 * Skill服务类
 */
export class SkillService extends CRUDBase {
  constructor() {
    super(SkillModel);
  }

  async initialize(storage) {
    this.setStorage(storage || await getStorage());
  }

  /**
   * 启用Skill
   */
  async enable(id, options = {}) {
    const skill = await this.getById(id);

    // 检查依赖
    if (skill.dependencies && skill.dependencies.length > 0) {
      for (const dep of skill.dependencies) {
        const depSkill = await this.findOne({ name: dep.name });
        if (!depSkill || depSkill.status !== SkillStatus.ENABLED) {
          throw new SkillException(
            ErrorCodes.SKILL_DEPENDENCY_MISSING,
            `Missing dependency: ${dep.name}`
          );
        }
      }
    }

    return this.update(id, { status: SkillStatus.ENABLED }, options);
  }

  /**
   * 禁用Skill
   */
  async disable(id, options = {}) {
    return this.update(id, { status: SkillStatus.DISABLED }, options);
  }

  /**
   * 安装Skill
   */
  async install(skillData, options = {}) {
    // 检查是否已存在
    const existing = await this.findOne({ name: skillData.name });
    if (existing) {
      throw new SkillException(ErrorCodes.SKILL_EXISTS, 'Skill already exists');
    }

    // 验证签名（如果有）
    if (skillData.signature) {
      const isValid = await this.verifySignature(skillData);
      if (!isValid) {
        throw new SkillException(ErrorCodes.SKILL_SIGNATURE_INVALID, 'Invalid skill signature');
      }
    }

    // 创建Skill记录
    const skill = await this.create({
      ...skillData,
      status: SkillStatus.ENABLED,
      installedFrom: skillData.installedFrom || InstallSource.LOCAL,
    }, options);

    // 通知内核注册Skill
    try {
      const kernel = await getKernel();
      await kernel.registerSkill?.(skill);
    } catch (error) {
      console.error('Failed to register skill with kernel:', error);
    }

    return skill;
  }

  /**
   * 卸载Skill
   */
  async uninstall(id, options = {}) {
    const skill = await this.getById(id);

    // 通知内核注销Skill
    try {
      const kernel = await getKernel();
      await kernel.unregisterSkill?.(skill.name);
    } catch (error) {
      console.error('Failed to unregister skill from kernel:', error);
    }

    return this.delete(id, options);
  }

  /**
   * 验证Skill签名
   */
  async verifySignature(skillData) {
    // TODO: 实现签名验证逻辑
    return true;
  }

  /**
   * 更新执行统计
   */
  async updateExecuteStats(id, success, executeTime) {
    const skill = await this.getById(id);

    const updateData = {
      lastExecuteTime: new Date().toISOString(),
      lastExecuteResult: success ? 'success' : 'failure',
      executeCount: skill.executeCount + 1,
      successCount: success ? skill.successCount + 1 : skill.successCount,
      failureCount: success ? skill.failureCount : skill.failureCount + 1,
    };

    // 更新平均执行时间
    const totalTime = skill.avgExecuteTime * skill.executeCount + executeTime;
    updateData.avgExecuteTime = totalTime / (skill.executeCount + 1);

    return this.update(id, updateData);
  }

  /**
   * 查找单个Skill
   */
  async findOne(conditions, options = {}) {
    return this.get(conditions, options);
  }

  /**
   * 根据名称查找Skill
   */
  async findByName(name) {
    return this.findOne({ name });
  }

  /**
   * 获取已启用的Skill列表
   */
  async getEnabledSkills() {
    return this.list({ status: SkillStatus.ENABLED });
  }

  /**
   * 按分类获取Skill
   */
  async getByCategory(category) {
    return this.list({ category });
  }
}

export const skillService = new SkillService();
export default SkillService;
