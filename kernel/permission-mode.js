/**
 * kernel/permission-mode.js — Permission Mode v4.2
 * 权限模式枚举
 * 
 * v4.2: 集成 OpenHarness PermissionMode 设计
 * 参考 OpenHarness permissions/modes.py
 */

/**
 * 权限模式枚举
 * 从 OpenHarness 的 3 档模式扩展到 4 档：
 * - HAUL: 全允许（sandbox/测试环境）
 * - LOCAL: 本地项目允许，外部询问（默认）
 * - ASK: 所有变更都询问（安全模式）
 * - RESTRICTED: 只读模式（审查模式）
 */
export const PermissionMode = {
  // v4.2 新命名（推荐）
  HAUL: 'haul',
  LOCAL: 'local',
  ASK: 'ask',
  RESTRICTED: 'restricted',
  
  // 向后兼容旧命名
  DEFAULT: 'local',        // 映射到 LOCAL
  PLAN: 'restricted',    // 映射到 RESTRICTED
  ACCEPT_EDITS: 'ask',     // 映射到 ASK
  BYPASS_PERMISSIONS: 'haul', // 映射到 HAUL
  DONT_ASK: 'haul',        // 映射到 HAUL
  AUTO: 'haul',            // 映射到 HAUL
};

/**
 * 获取规范化的权限模式名称
 * @param {string} mode - 输入的模式名称
 * @returns {string} - 规范化的模式名称
 */
export function normalizeMode(mode) {
  if (!mode) return 'local';
  const normalized = mode.toLowerCase();
  
  // 检查是否已经是新命名
  if (['haul', 'local', 'ask', 'restricted'].includes(normalized)) {
    return normalized;
  }
  
  // 旧命名映射
  const mapping = {
    'default': 'local',
    'plan': 'restricted',
    'acceptedits': 'ask',
    'bypass_permissions': 'haul',
    'bypasspermissions': 'haul',
    'dontask': 'haul',
    'auto': 'haul',
    'fullauto': 'haul',
  };
  
  return mapping[normalized] || 'local';
}

export function isValidMode(mode) {
  return Object.values(PermissionMode).includes(mode);
}

export const READ_ONLY_TOOLS = ["Read", "Glob", "Grep", "WebFetch", "WebSearch", "List"];
export const WRITE_TOOLS = ["Write", "Edit", "Bash", "Delete", "Move", "Copy"];
