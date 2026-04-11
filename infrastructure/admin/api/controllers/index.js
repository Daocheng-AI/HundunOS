/**
 * 控制器入口
 * @module infrastructure/admin/api/controllers
 */

export * as authController from './auth.controller.js';
export * as userController from './user.controller.js';
export * as roleController from './role.controller.js';
export * as taskController from './task.controller.js';
export * as skillController from './skill.controller.js';
export * as logController from './log.controller.js';
export * as monitorController from './monitor.controller.js';

export default {
  auth: require('./auth.controller.js'),
  user: require('./user.controller.js'),
  role: require('./role.controller.js'),
  task: require('./task.controller.js'),
  skill: require('./skill.controller.js'),
  log: require('./log.controller.js'),
  monitor: require('./monitor.controller.js'),
};
