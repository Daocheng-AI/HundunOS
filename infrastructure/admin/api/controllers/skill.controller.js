/**
 * Skill控制器
 * @module infrastructure/admin/api/controllers/skill.controller
 */

import { ResponseSchema } from '../../core/response.js';
import { ValidationException } from '../../core/exceptions.js';
import { skillService } from '../../services/skill.service.js';

/**
 * 获取Skill列表
 * GET /api/admin/skills
 */
export async function list(req, res) {
  const { page, pageSize, orderBy, ...filters } = req.query;

  const result = await skillService.page(filters, {
    page: parseInt(page) || 1,
    pageSize: Math.min(parseInt(pageSize) || 20, 100),
    orderBy: orderBy || 'createdTime:desc',
  });

  res.json(ResponseSchema.paginated(result.list, result.total, result.page, result.pageSize));
}

/**
 * 获取Skill详情
 * GET /api/admin/skills/:id
 */
export async function getById(req, res) {
  const { id } = req.params;
  const skill = await skillService.getById(id);

  res.json(ResponseSchema.success(skill));
}

/**
 * 更新Skill
 * PUT /api/admin/skills/:id
 */
export async function update(req, res) {
  const { id } = req.params;
  const data = req.body;

  const skill = await skillService.update(id, data, { userId: req.user?.id });

  res.json(ResponseSchema.success(skill, 'Skill updated successfully'));
}

/**
 * 启用Skill
 * PUT /api/admin/skills/:id/enable
 */
export async function enable(req, res) {
  const { id } = req.params;

  const skill = await skillService.enable(id, { userId: req.user?.id });

  res.json(ResponseSchema.success(skill, 'Skill enabled successfully'));
}

/**
 * 禁用Skill
 * PUT /api/admin/skills/:id/disable
 */
export async function disable(req, res) {
  const { id } = req.params;

  const skill = await skillService.disable(id, { userId: req.user?.id });

  res.json(ResponseSchema.success(skill, 'Skill disabled successfully'));
}

/**
 * 获取Skill市场列表
 * GET /api/admin/skills/market
 */
export async function getMarket(req, res) {
  const { search, category, page, pageSize } = req.query;

  // 调用内核获取Skill市场数据
  try {
    const { getKernel } = await import('../../core/dependencies.js');
    const kernel = await getKernel();
    
    const marketSkills = await kernel.getSkillMarket?.({
      search,
      category,
      page: parseInt(page) || 1,
      pageSize: Math.min(parseInt(pageSize) || 20, 100),
    }) || [];

    res.json(ResponseSchema.success(marketSkills));
  } catch (error) {
    // 如果内核不支持，返回空列表
    res.json(ResponseSchema.success({ list: [], total: 0 }));
  }
}

/**
 * 安装Skill
 * POST /api/admin/skills/install
 */
export async function install(req, res) {
  const { name, source, version } = req.body;

  if (!name) {
    throw new ValidationException([{ message: 'Skill name is required' }]);
  }

  // 从市场或指定源安装
  try {
    const { getKernel } = await import('../../core/dependencies.js');
    const kernel = await getKernel();
    
    const skillData = await kernel.installSkillFromMarket?.({ name, source, version });
    
    if (!skillData) {
      throw new ValidationException([{ message: 'Skill not found in market' }]);
    }

    const skill = await skillService.install(skillData, { userId: req.user?.id });

    res.status(201).json(ResponseSchema.success(skill, 'Skill installed successfully'));
  } catch (error) {
    if (error instanceof ValidationException) throw error;
    throw new ValidationException([{ message: `Failed to install skill: ${error.message}` }]);
  }
}

/**
 * 卸载Skill
 * DELETE /api/admin/skills/:id
 */
export async function uninstall(req, res) {
  const { id } = req.params;

  await skillService.uninstall(id, { userId: req.user?.id });

  res.json(ResponseSchema.success(null, 'Skill uninstalled successfully'));
}

/**
 * 获取Skill统计
 * GET /api/admin/skills/stats
 */
export async function getStats(req, res) {
  const [total, enabled, disabled] = await Promise.all([
    skillService.count(),
    skillService.count({ status: 'enabled' }),
    skillService.count({ status: 'disabled' }),
  ]);

  // 获取分类统计
  const allSkills = await skillService.list({}, { fields: ['category'] });
  const byCategory = {};
  for (const skill of allSkills) {
    const cat = skill.category || 'other';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }

  res.json(ResponseSchema.success({
    total,
    enabled,
    disabled,
    byCategory,
  }));
}

export default {
  list,
  getById,
  update,
  enable,
  disable,
  getMarket,
  install,
  uninstall,
  getStats,
};
