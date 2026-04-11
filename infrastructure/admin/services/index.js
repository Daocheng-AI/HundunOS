/**
 * 服务层入口
 * @module infrastructure/admin/services
 */

export { UserService, userService } from './user.service.js';
export { RoleService, roleService } from './role.service.js';
export { TaskService, taskService } from './task.service.js';
export { SkillService, skillService } from './skill.service.js';
export { LogService, logService } from './log.service.js';

/**
 * 初始化所有服务
 */
export async function initializeServices(storage) {
  const { userService } = await import('./user.service.js');
  const { roleService } = await import('./role.service.js');
  const { taskService } = await import('./task.service.js');
  const { skillService } = await import('./skill.service.js');
  const { logService } = await import('./log.service.js');

  await Promise.all([
    userService.initialize(storage),
    roleService.initialize(storage),
    taskService.initialize(storage),
    skillService.initialize(storage),
    logService.initialize(storage),
  ]);

  return {
    userService,
    roleService,
    taskService,
    skillService,
    logService,
  };
}

export default {
  UserService,
  RoleService,
  TaskService,
  SkillService,
  LogService,
  initializeServices,
};
