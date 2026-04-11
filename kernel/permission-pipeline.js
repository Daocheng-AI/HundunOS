/**
 * kernel/permission-pipeline.js — Permission Pipeline v4.2
 * 权限判定流水线
 * 
 * v4.2: 集成 OpenHarness PermissionDecision 设计
 * - 支持 requiresConfirmation 状态
 * - 4 种权限模式精细控制
 * - 本地/外部路径区分
 */

import { validatePath } from './path-validation.js';
import { PermissionMode, READ_ONLY_TOOLS, WRITE_TOOLS, normalizeMode } from './permission-mode.js';

/**
 * 权限决策结果类
 * v4.2: 参考 OpenHarness PermissionDecision
 * 明确区分 allowed / requiresConfirmation / reason
 */
export class PermissionDecision {
  constructor({ allowed, requiresConfirmation = false, reason = '', level = 'info' }) {
    this.allowed = allowed;
    this.requiresConfirmation = requiresConfirmation;
    this.reason = reason;
    this.level = level;
    this.timestamp = Date.now();
  }

  /**
   * 快速工厂方法
   */
  static allow(reason = 'Allowed') {
    return new PermissionDecision({ allowed: true, reason });
  }

  static deny(reason = 'Denied') {
    return new PermissionDecision({ allowed: false, reason, level: 'error' });
  }

  static confirm(reason = 'Requires confirmation') {
    return new PermissionDecision({ 
      allowed: false, 
      requiresConfirmation: true, 
      reason,
      level: 'warning'
    });
  }

  /**
   * 转换为旧版决策格式
   */
  toLegacy() {
    if (this.allowed) return { decision: 'allow', reason: this.reason };
    if (this.requiresConfirmation) return { decision: 'ask', reason: this.reason };
    return { decision: 'deny', reason: this.reason };
  }
}

/**
 * 检查权限（v4.2 增强版）
 * 
 * @param {object} toolUse - 工具调用信息
 * @param {string} mode - 权限模式
 * @param {object} engine - 权限引擎
 * @returns {PermissionDecision}
 */
export async function checkPermission(toolUse, mode, engine) {
  const { name: toolName, input } = toolUse;
  
  // 1. 确定路径是否本地
  const pathInput = input?.file_path || input?.path || input?.target;
  let isLocalPath = true;
  if (pathInput && engine?.workspaceRoot) {
    const pathResult = validatePath(pathInput, engine.workspaceRoot);
    if (pathResult.blocked && pathResult.level === 'critical') {
      return PermissionDecision.deny(pathResult.reason);
    }
    isLocalPath = !pathResult.blocked;
  }
  
  // 2. 按模式检查
  const modeDecision = checkByMode(toolName, mode, isLocalPath);
  if (!modeDecision.allowed && !modeDecision.requiresConfirmation) {
    return modeDecision;
  }
  if (modeDecision.allowed && !modeDecision.requiresConfirmation) {
    return modeDecision;
  }
  
  // 3. 按规则检查
  if (engine?.rules) {
    const ruleDecision = checkByRules(toolName, input, engine.rules);
    if (ruleDecision.decision === 'deny') {
      return PermissionDecision.deny(ruleDecision.reason);
    }
    if (ruleDecision.decision === 'ask') {
      return PermissionDecision.confirm(ruleDecision.reason || 'Rule requires confirmation');
    }
    if (ruleDecision.decision === 'allow') {
      return PermissionDecision.allow(ruleDecision.reason || 'Rule allowed');
    }
  }
  
  // 4. 返回模式决策
  return modeDecision;
}

// 向后兼容
export async function checkPermissionLegacy(toolUse, mode, engine) {
  const result = await checkPermission(toolUse, mode, engine);
  return result.toLegacy();
}

/**
 * 根据权限模式检查工具
 * v4.2: 支持 4 种精细权限模式
 * 
 * @param {string} toolName - 工具名称
 * @param {string} mode - 权限模式
 * @param {boolean} isLocalPath - 是否为本地项目路径
 * @returns {PermissionDecision}
 */
export function checkByMode(toolName, mode, isLocalPath = true) {
  const normalizedMode = normalizeMode(mode);
  const isReadOnly = READ_ONLY_TOOLS.includes(toolName);
  const isWrite = WRITE_TOOLS.includes(toolName);
  
  switch (normalizedMode) {
    // HAUL: 全允许（sandbox/测试环境）
    case 'haul':
      return PermissionDecision.allow('Haul mode allows all');
    
    // RESTRICTED: 只读模式
    case 'restricted':
      if (isWrite) {
        return PermissionDecision.deny(
          'Restricted mode blocks mutating tools'
        );
      }
      return PermissionDecision.allow('Read-only allowed in restricted mode');
    
    // ASK: 所有变更都询问（安全模式）
    case 'ask':
      if (isWrite) {
        return PermissionDecision.confirm(
          'Ask mode requires confirmation for mutating tools'
        );
      }
      return PermissionDecision.allow('Read-only allowed');
    
    // LOCAL: 本地项目允许，外部询问（默认）
    case 'local':
    default:
      // 只读工具始终允许
      if (isReadOnly) {
        return PermissionDecision.allow('Read-only tools are allowed');
      }
      
      // 写操作：本地路径直接允许，外部路径需要确认
      if (isWrite) {
        if (isLocalPath) {
          return PermissionDecision.allow('Local workspace write allowed');
        } else {
          return PermissionDecision.confirm(
            'External path requires confirmation'
          );
        }
      }
      
      return PermissionDecision.allow('Tool allowed');
  }
}

// 向后兼容
export function checkByModeLegacy(toolName, mode) {
  return checkByMode(toolName, mode, true).toLegacy();
}

export function checkByRules(toolName, input, rules) {
  for (const rule of rules.deny || []) {
    if (matchesRule(toolName, input, rule)) {
      return { decision: "deny", reason: rule.reason || "Rule denied" };
    }
  }
  for (const rule of rules.ask || []) {
    if (matchesRule(toolName, input, rule)) return { decision: "ask" };
  }
  for (const rule of rules.allow || []) {
    if (matchesRule(toolName, input, rule)) return { decision: "allow" };
  }
  return { decision: "continue" };
}

export function matchesRule(toolName, input, rule) {
  if (rule.tool && rule.tool !== toolName) return false;
  if (rule.pattern) {
    const pathInput = input?.file_path || input?.path || input?.target;
    if (!pathInput) return false;
    try { if (!new RegExp(rule.pattern).test(pathInput)) return false; }
    catch { return false; }
  }
  if (rule.commandPattern && toolName === "Bash") {
    const command = input?.command || "";
    try { if (!new RegExp(rule.commandPattern, "i").test(command)) return false; }
    catch { return false; }
  }
  return true;
}

export function createDefaultRules() {
  return {
    deny: [
      { tool: "Bash", commandPattern: "rm\\s+-rf\\s+/", reason: "Prohibit delete root" },
      { tool: "Bash", commandPattern: "sudo\\s+rm", reason: "Prohibit sudo rm" },
      { tool: "Bash", commandPattern: "git\\s+push\\s+--force", reason: "Prohibit force push" },
      { tool: "Bash", commandPattern: "DROP\\s+TABLE", reason: "Prohibit drop table" },
    ],
    ask: [
      { tool: "Bash", commandPattern: "npm\\\\s+publish" },
      { tool: "Bash", commandPattern: "git\\\\s+push" },
      { tool: "Bash", commandPattern: "kubectl\\\\s+delete" },
    ],
    allow: [
      { tool: "Bash", commandPattern: "^(git status|git log|git diff|git branch)" },
      { tool: "Bash", commandPattern: "^(ls|cat|pwd|echo|which)" },
      { tool: "Bash", commandPattern: "^(npm test|npm run test)" },
    ],
  };
}
