/**
 * 认证控制器
 * @module infrastructure/admin/api/controllers/auth.controller
 */

import { ResponseSchema, ErrorCodes } from '../../core/response.js';
import { AuthenticationException, ValidationException } from '../../core/exceptions.js';
import { generateToken, generateApiKey } from '../middlewares/auth.js';
import { userService } from '../../services/user.service.js';
import { getKernel } from '../../core/dependencies.js';

/**
 * 用户登录
 * POST /api/admin/auth/login
 */
export async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    throw new ValidationException([{ message: 'Username and password are required' }]);
  }

  // 验证用户
  const user = await userService.authenticate(username, password);

  // 更新登录信息
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
              req.connection?.remoteAddress || 'unknown';
  await userService.updateLoginInfo(user.id, ip);

  // 生成Token
  const config = await getConfig();
  const accessToken = generateToken(
    { userId: user.id, username: user.username },
    config?.auth?.secret || 'hundunos-admin-secret',
    30 * 60 * 1000 // 30分钟
  );
  const refreshToken = generateToken(
    { userId: user.id, type: 'refresh' },
    config?.auth?.secret || 'hundunos-admin-secret',
    7 * 24 * 60 * 60 * 1000 // 7天
  );

  // 返回用户信息和Token
  res.json(ResponseSchema.success({
    user: {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      email: user.email,
      avatar: user.avatar,
      isSuperAdmin: user.isSuperAdmin,
      roleIds: user.roleIds,
    },
    accessToken,
    refreshToken,
    expiresIn: 30 * 60 * 1000,
  }));
}

/**
 * 用户登出
 * POST /api/admin/auth/logout
 */
export async function logout(req, res) {
  // 可以在这里处理Token黑名单等逻辑
  res.json(ResponseSchema.success(null, 'Logout successful'));
}

/**
 * 刷新Token
 * POST /api/admin/auth/refresh
 */
export async function refreshToken(req, res) {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new AuthenticationException('Refresh token is required');
  }

  const config = await getConfig();
  const { verifyToken } = await import('../middlewares/auth.js');
  
  // 验证刷新Token
  const payload = verifyToken(refreshToken, config?.auth?.secret || 'hundunos-admin-secret');
  
  if (payload.type !== 'refresh') {
    throw new AuthenticationException('Invalid refresh token');
  }

  // 获取用户信息
  const user = await userService.getById(payload.userId);

  // 生成新的访问Token
  const accessToken = generateToken(
    { userId: user.id, username: user.username },
    config?.auth?.secret || 'hundunos-admin-secret',
    30 * 60 * 1000
  );

  res.json(ResponseSchema.success({
    accessToken,
    expiresIn: 30 * 60 * 1000,
  }));
}

/**
 * 获取当前用户信息
 * GET /api/admin/auth/profile
 */
export async function getProfile(req, res) {
  const user = req.user;

  if (!user) {
    throw new AuthenticationException('Not authenticated');
  }

  // 获取完整用户信息
  const fullUser = await userService.getById(user.id);

  res.json(ResponseSchema.success({
    id: fullUser.id,
    username: fullUser.username,
    nickname: fullUser.nickname,
    email: fullUser.email,
    phone: fullUser.phone,
    avatar: fullUser.avatar,
    status: fullUser.status,
    isSuperAdmin: fullUser.isSuperAdmin,
    roleIds: fullUser.roleIds,
    deptId: fullUser.deptId,
    lastLoginTime: fullUser.lastLoginTime,
    createdTime: fullUser.createdTime,
  }));
}

/**
 * 修改密码
 * PUT /api/admin/auth/password
 */
export async function changePassword(req, res) {
  const user = req.user;
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    throw new ValidationException([{ message: 'Old and new password are required' }]);
  }

  await userService.changePassword(user.id, oldPassword, newPassword);

  res.json(ResponseSchema.success(null, 'Password changed successfully'));
}

/**
 * 生成API Key
 * POST /api/admin/auth/api-key
 */
export async function generateUserApiKey(req, res) {
  const user = req.user;

  // 获取完整用户信息
  const fullUser = await userService.getById(user.id);

  // 生成API Key
  const apiKey = generateApiKey(user.id, fullUser.password);

  res.json(ResponseSchema.success({ apiKey }));
}

/**
 * 获取配置
 */
async function getConfig() {
  try {
    return await import('../../core/dependencies.js').then(m => m.getConfig?.());
  } catch {
    return null;
  }
}

export default {
  login,
  logout,
  refreshToken,
  getProfile,
  changePassword,
  generateUserApiKey,
};
