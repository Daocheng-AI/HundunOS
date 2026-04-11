/**
 * 认证中间件
 * @module infrastructure/admin/api/middlewares/auth
 */

import { AuthenticationException, PermissionException } from '../../core/exceptions.js';
import { ErrorCodes, ResponseSchema } from '../../core/response.js';
import { getStorage } from '../../core/dependencies.js';
import crypto from 'crypto';

/**
 * JWT配置
 */
const JWT_CONFIG = {
  algorithm: 'HS256',
  expiresIn: 30 * 60 * 1000, // 30分钟
  refreshExpiresIn: 7 * 24 * 60 * 60 * 1000, // 7天
};

/**
 * 生成JWT Token
 * @param {Object} payload - 载荷
 * @param {string} secret - 密钥
 * @param {number} expiresIn - 过期时间（毫秒）
 * @returns {string}
 */
export function generateToken(payload, secret, expiresIn = JWT_CONFIG.expiresIn) {
  const header = { alg: JWT_CONFIG.algorithm, typ: 'JWT' };
  const now = Date.now();
  
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = createSignature(`${headerB64}.${payloadB64}`, secret);

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * 验证JWT Token
 * @param {string} token - Token
 * @param {string} secret - 密钥
 * @returns {Object} 解析后的载荷
 */
export function verifyToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new AuthenticationException('Invalid token format', ErrorCodes.TOKEN_INVALID);
  }

  const [headerB64, payloadB64, signature] = parts;
  
  // 验证签名
  const expectedSignature = createSignature(`${headerB64}.${payloadB64}`, secret);
  if (signature !== expectedSignature) {
    throw new AuthenticationException('Invalid token signature', ErrorCodes.TOKEN_INVALID);
  }

  // 解析载荷
  const payload = JSON.parse(base64UrlDecode(payloadB64));
  
  // 检查过期
  if (payload.exp && Date.now() > payload.exp) {
    throw new AuthenticationException('Token expired', ErrorCodes.TOKEN_EXPIRED);
  }

  return payload;
}

/**
 * 创建签名
 */
function createSignature(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

/**
 * Base64 URL编码
 */
function base64UrlEncode(str) {
  return Buffer.from(str).toString('base64url');
}

/**
 * Base64 URL解码
 */
function base64UrlDecode(str) {
  return Buffer.from(str, 'base64url').toString();
}

/**
 * 认证中间件工厂
 * @param {Object} options - 配置选项
 * @param {string} options.secret - JWT密钥
 * @param {string} [options.apiKeyHeader='x-api-key'] - API Key请求头
 * @param {string} [options.authHeader='authorization'] - 认证请求头
 * @returns {Function} 中间件函数
 */
export function createAuthMiddleware(options = {}) {
  const {
    secret = process.env.HUNDUNOS_ADMIN_JWT_SECRET || (() => {
      console.warn('[Auth] SECURITY: 使用默认JWT密钥，请设置 HUNDUNOS_ADMIN_JWT_SECRET 环境变量');
      return 'hundunos-admin-default-key-please-set-env';
    })(),
    apiKeyHeader = 'x-api-key',
    authHeader = 'authorization',
  } = options;

  return async function authMiddleware(req, res, next) {
    try {
      // 尝试从请求头获取Token
      let token = null;
      let authType = null;

      // 方式1: Authorization: Bearer <token>
      const authHeaderValue = req.headers[authHeader];
      if (authHeaderValue && authHeaderValue.startsWith('Bearer ')) {
        token = authHeaderValue.slice(7);
        authType = 'jwt';
      }

      // 方式2: X-Api-Key
      const apiKey = req.headers[apiKeyHeader];
      if (apiKey && !token) {
        token = apiKey;
        authType = 'apikey';
      }

      // 方式3: Query参数 (用于WebSocket等场景)
      if (!token) {
        token = req.query?.token;
        authType = token ? 'jwt' : null;
      }

      if (!token) {
        throw new AuthenticationException('No authentication token provided', ErrorCodes.UNAUTHORIZED);
      }

      let user = null;

      if (authType === 'jwt') {
        // JWT认证
        const payload = verifyToken(token, secret);
        user = await loadUserById(payload.userId);
      } else if (authType === 'apikey') {
        // API Key认证
        user = await loadUserByApiKey(token);
      }

      if (!user) {
        throw new AuthenticationException('User not found', ErrorCodes.USER_NOT_FOUND);
      }

      if (user.status !== 'active') {
        throw new AuthenticationException('Account is disabled', ErrorCodes.ACCOUNT_DISABLED);
      }

      // 将用户信息附加到请求对象
      req.user = user;
      req.authType = authType;

      next();
    } catch (error) {
      if (error instanceof AuthenticationException) {
        return res.status(401).json(error.toResponse());
      }
      next(error);
    }
  };
}

/**
 * 根据ID加载用户
 */
async function loadUserById(userId) {
  const storage = await getStorage();
  const users = await storage.loadModelData('User');
  return users.find(u => u.id === userId && u.status !== 'deleted');
}

/**
 * 根据API Key加载用户
 */
async function loadUserByApiKey(apiKey) {
  // API Key格式: userId:hash
  const [userId, hash] = apiKey.split(':');
  if (!userId || !hash) return null;

  const user = await loadUserById(userId);
  if (!user) return null;

  // 验证API Key (简化实现，实际应使用更安全的方式)
  const expectedHash = crypto.createHash('sha256').update(`${userId}:${user.password}`).digest('hex').slice(0, 16);
  if (hash !== expectedHash) return null;

  return user;
}

/**
 * 生成API Key
 * @param {string} userId - 用户ID
 * @param {string} password - 用户密码（加密后）
 * @returns {string}
 */
export function generateApiKey(userId, password) {
  const hash = crypto.createHash('sha256').update(`${userId}:${password}`).digest('hex').slice(0, 16);
  return `${userId}:${hash}`;
}

/**
 * 可选认证中间件（不强制要求认证）
 */
export function createOptionalAuthMiddleware(options = {}) {
  const authMiddleware = createAuthMiddleware(options);

  return async function optionalAuthMiddleware(req, res, next) {
    // 如果没有认证信息，继续执行
    const hasAuth = req.headers[options.authHeader || 'authorization'] || 
                    req.headers[options.apiKeyHeader || 'x-api-key'] ||
                    req.query?.token;

    if (!hasAuth) {
      req.user = null;
      return next();
    }

    return authMiddleware(req, res, next);
  };
}

/**
 * 默认认证中间件
 */
export const authMiddleware = createAuthMiddleware();

export default {
  createAuthMiddleware,
  createOptionalAuthMiddleware,
  authMiddleware,
  generateToken,
  verifyToken,
  generateApiKey,
};
