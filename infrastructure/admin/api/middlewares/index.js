/**
 * 中间件入口
 * @module infrastructure/admin/api/middlewares
 */

export {
  createAuthMiddleware,
  createOptionalAuthMiddleware,
  authMiddleware,
  generateToken,
  verifyToken,
  generateApiKey,
} from './auth.js';

export {
  requirePermission,
  requireRole,
  requireSuperAdmin,
  dataScopeFilter,
  clearPermissionCache,
} from './permission.js';

export {
  createAuditLogMiddleware,
  auditLogMiddleware,
  manualAuditLog,
} from './audit-log.js';

export {
  createRateLimitMiddleware,
  createSlidingWindowRateLimit,
  createTokenBucketRateLimit,
  rateLimitMiddleware,
  strictRateLimitMiddleware,
} from './rate-limit.js';

/**
 * 创建完整的中间件链
 * @param {Object} options - 配置选项
 * @returns {Object} 中间件集合
 */
export function createMiddlewareChain(options = {}) {
  const {
    auth = {},
    rateLimit = {},
    auditLog = {},
  } = options;

  return {
    auth: createAuthMiddleware(auth),
    optionalAuth: createOptionalAuthMiddleware(auth),
    rateLimit: createRateLimitMiddleware(rateLimit),
    auditLog: createAuditLogMiddleware(auditLog),
    requirePermission,
    requireRole,
    requireSuperAdmin,
    dataScopeFilter,
  };
}

export default {
  createMiddlewareChain,
};
