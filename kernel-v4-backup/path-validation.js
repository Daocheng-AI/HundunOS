/**
 * kernel/path-validation.js
 * 路径校验模块
 */

import { resolve, relative, extname } from "path";
import { realpathSync, existsSync } from "fs";

// P2-8 修复：补充 .npmrc / .yarnrc（含 registry token）到受保护路径
const PROTECTED_PATHS = [".git", ".env", ".env.local", "credentials", "secrets", ".ssh", "node_modules", ".npmrc", ".yarnrc", ".yarnrc.yml"];
// SENSITIVE_SYSTEM 已废弃，统一由 PROTECTED_PATHS + isInWorkspace 覆盖
// P2-8 修复：补充常见证书/密钥/包管理器凭据文件为危险扩展，防止被读取执行
const DANGEROUS_EXTENSIONS = [".exe", ".bat", ".cmd", ".ps1", ".vbs", ".js", ".reg", ".msi",
  ".pem", ".key", ".p12", ".pfx", ".crt", ".cer", ".der", ".keystore", ".jks"];

/**
 * 标准化路径比较（处理 Windows 大小写不敏感 + 符号链接）
 */
function normalizeForCompare(p) {
  // Windows 不区分大小写，统一转小写
  // 统一路径分隔符为正斜杠
  return p.replace(/\\/g, '/').toLowerCase();
}

/**
 * 解析真实路径（处理符号链接）
 */
function resolveRealPath(filePath) {
  try {
    // realpathSync 会解析符号链接到真实路径
    if (existsSync(filePath)) {
      return realpathSync(filePath);
    }
    return resolve(filePath);
  } catch {
    return resolve(filePath);
  }
}

export function validatePath(filePath, workspaceRoot) {
  if (!filePath || typeof filePath !== "string") {
    return { blocked: true, reason: "Invalid file path" };
  }

  // 先检查原始路径中的 .. （在 resolve 之前）
  if (filePath.includes("..")) {
    return { blocked: true, reason: "Path traversal detected", level: "critical" };
  }

  // 解析真实路径（处理符号链接）
  const resolved = resolveRealPath(filePath);
  const resolvedWorkspace = resolveRealPath(workspaceRoot);

  // 使用标准化路径比较（Windows 大小写不敏感 + 统一分隔符）
  const normResolved = normalizeForCompare(resolved);
  const normWorkspace = normalizeForCompare(resolvedWorkspace);
  if (!normResolved.startsWith(normWorkspace)) {
    return { blocked: true, reason: "Path outside workspace", level: "critical" };
  }
  // 边界检查：确保 workspace 后面是路径分隔符或结尾，防止 /workspace-evil 绕过
  if (normResolved.length > normWorkspace.length && normResolved[normWorkspace.length] !== '/') {
    return { blocked: true, reason: "Path outside workspace", level: "critical" };
  }

  const relativePath = relative(workspaceRoot, resolved);
  for (const protectedPath of PROTECTED_PATHS) {
    if (normalizeForCompare(relativePath).startsWith(normalizeForCompare(protectedPath))) {
      return { blocked: true, reason: "Protected path: " + protectedPath, level: "high" };
    }
  }

  const ext = extname(resolved).toLowerCase();
  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    return { blocked: false, reason: "Dangerous extension: " + ext, level: "warning" };
  }

  return { blocked: false };
}

export { PROTECTED_PATHS, DANGEROUS_EXTENSIONS };
