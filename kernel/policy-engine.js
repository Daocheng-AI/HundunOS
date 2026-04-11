// hundunos/kernel/policy-engine.js — Policy Engine v1.1
// 功能: 安全策略引擎，加载YAML策略并执行检查
// 参考: fastclaw-ai/fastclaw Policy Engine 设计
// v3.7 Phase 4: 集成 adapters/rust-modules/policy-engine.js（hundunos-core daemon）
// v4.2: 集成 OpenHarness SENSITIVE_PATH_PATTERNS 硬编码保护
//   - kernel.rustPolicy 作为快速策略检查后端（TCP:38082，~0ms）
//   - JS 层始终加载 YAML 策略，Rust 层用于快速路径检查
//   - 新增 immutable 敏感路径保护（不可被用户配置覆盖）

import { readFileSync, existsSync } from 'fs';
import { join, dirname, normalize } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';
import { minimatch } from 'minimatch';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 不可覆盖的敏感路径模式列表
 * 参考: OpenHarness permissions/checker.py SENSITIVE_PATH_PATTERNS
 * 这些路径始终被拒绝访问，无论用户配置如何（防御深度）
 */
export const SENSITIVE_PATH_PATTERNS = [
    // SSH 密钥和配置
    '**/.ssh/*',
    '**/.ssh/id_*',
    '**/.ssh/authorized_keys',
    '**/.ssh/known_hosts',
    '**/.ssh/config',
    // AWS 凭证
    '**/.aws/credentials',
    '**/.aws/config',
    // GCP 凭证
    '**/.config/gcloud/*',
    '**/.config/gcloud/credentials.db',
    '**/.config/gcloud/legacy_credentials/*',
    // Azure 凭证
    '**/.azure/*',
    '**/.azure/azureProfile.json',
    '**/.azure/accessTokens.json',
    // GPG 密钥
    '**/.gnupg/*',
    '**/.gnupg/secring.gpg',
    '**/.gnupg/private-keys-v1.d/*',
    // Docker 凭证
    '**/.docker/config.json',
    '**/.docker/daemon.json',
    // Kubernetes 凭证
    '**/.kube/config',
    '**/.kube/cache/*',
    // npm 和 Python 凭证
    '**/.npmrc',
    '**/.pypirc',
    // Git 凭证
    '**/.git-credentials',
    '**/.gitconfig',
    // 其他敏感文件
    '**/.netrc',
    '**/.pgpass',
    '**/.my.cnf',
    '**/.mysql_history',
    '**/.psql_history',
    '**/.bash_history',
    '**/.zsh_history',
    // 环境变量文件
    '**/.env',
    '**/.env.*',
    '**/.env.local',
    '**/.env.production',
    '**/.env.development',
    // HundunOS 自身凭证存储
    '**/.openharness/credentials.json',
    '**/.openharness/copilot_auth.json',
    '**/.hundunos/credentials.json',
    '**/.hundunos/auth.json',
    // Windows 特定路径
    '**/AppData/Roaming/*/credentials*',
    '**/AppData/Local/*/credentials*',
    // 通用敏感文件名
    '**/id_rsa',
    '**/id_rsa.pub',
    '**/id_ecdsa',
    '**/id_ecdsa.pub',
    '**/id_ed25519',
    '**/id_ed25519.pub',
    '**/*.pem',
    '**/*.key',
    '**/credentials*.json',
    '**/secrets*.json',
    '**/secrets*.yaml',
    '**/secrets*.yml',
];

export class PolicyEngine {
    constructor(kernel) {
        this.kernel = kernel;
        this.policies = {};
        this.workspaceRoot = kernel?.config?.workspace || join(__dirname, '..', '..');
        // Phase 4: Rust 策略检查后端（adapters/rust-modules/policy-engine.js）
        this.rustAdapter = kernel?.rustPolicy || null;
    }

    async initialize() {
        console.log('[PolicyEngine] Initializing...');

        // 加载默认策略
        await this._loadPolicy('default');

        // 检查是否有自定义策略
        const customPath = join(__dirname, '..', '..', 'config', 'policies', 'custom.yaml');
        if (existsSync(customPath)) {
            await this._loadPolicy('custom', customPath);
        }

        console.log('[PolicyEngine] Loaded policies:', Object.keys(this.policies));

        // Phase 4: Rust 后端状态
        if (this.rustAdapter) {
            console.log('[PolicyEngine] Rust backend: ✅ adapters/rust-modules/policy (hundunos-core daemon)');
        } else {
            console.log('[PolicyEngine] Rust backend: ⚠️  using JS policy layer only');
        }
    }

    async _loadPolicy(name, path = null) {
        const policyPath = path || join(__dirname, '..', '..', 'config', 'policies', `${name}.yaml`);

        if (!existsSync(policyPath)) {
            console.warn(`[PolicyEngine] Policy not found: ${policyPath}`);
            return;
        }

        try {
            const content = readFileSync(policyPath, 'utf8');
            const parsed = parse(content);
            this.policies[name] = this._expandVariables(parsed);
            console.log(`[PolicyEngine] Loaded: ${name}`);
        } catch (e) {
            console.error(`[PolicyEngine] Failed to load ${name}:`, e.message);
        }
    }

    /**
     * 检查路径是否匹配敏感路径模式
     * v4.2: 新增 OpenHarness 风格的硬编码敏感路径保护
     * @param {string} filePath - 要检查的文件路径
     * @returns {object|null} - 如果匹配敏感路径返回拒绝结果，否则返回 null
     */
    checkSensitivePath(filePath) {
        if (!filePath || typeof filePath !== 'string') {
            return null;
        }

        // 规范化路径用于匹配
        const normalizedPath = normalize(filePath).replace(/\\/g, '/');
        const normalizedLower = normalizedPath.toLowerCase();

        for (const pattern of SENSITIVE_PATH_PATTERNS) {
            // 使用 minimatch 进行 glob 匹配
            // 同时检查原始路径和全小写路径（Windows 不区分大小写）
            if (minimatch(normalizedPath, pattern, { nocase: true, dot: true })) {
                return {
                    allowed: false,
                    blocked: true,
                    level: 'critical',
                    reason: `Access denied: ${filePath} is a sensitive credential path (matched pattern: ${pattern})`,
                    pattern: pattern,
                    immutable: true, // 不可被用户配置覆盖
                };
            }
        }

        return null;
    }

    _expandVariables(policy) {
        // 替换 ${workspace} 变量
        const expanded = JSON.parse(JSON.stringify(policy), (key, value) => {
            if (typeof value === 'string') {
                return value.replace(/\$\{workspace\}/g, this.workspaceRoot);
            }
            return value;
        });
        return expanded;
    }

    // 检查文件读取权限
    // Phase 4: 优先 Rust 检查，JS 层兜底
    // v4.2: 新增敏感路径硬编码检查（最先执行，不可绕过）
    async checkFileRead(filePath) {
        // v4.2: 首先检查敏感路径（防御深度，不可绕过）
        const sensitiveCheck = this.checkSensitivePath(filePath);
        if (sensitiveCheck) {
            console.warn(`[PolicyEngine] Sensitive path access blocked: ${filePath}`);
            return sensitiveCheck;
        }

        if (this.rustAdapter) {
            try {
                const rustResult = await this.rustAdapter.checkFileRead(filePath);
                if (rustResult && rustResult.allowed !== undefined) return rustResult;
            } catch {}
        }
        // JS 层兜底
        const policy = this.policies.default?.file?.read;
        if (!policy) return { allowed: true };
        if (policy.allowed_extensions) {
            const ext = filePath.substring(filePath.lastIndexOf('.'));
            if (!policy.allowed_extensions.includes(ext)) {
                return { allowed: false, reason: `Extension ${ext} not allowed` };
            }
        }
        return { allowed: true };
    }

    // 检查网络请求
    // Phase 4: 优先 Rust 检查，JS 层兜底
    async checkNetwork(url) {
        if (this.rustAdapter) {
            try {
                const rustResult = await this.rustAdapter.checkNetwork(url);
                if (rustResult && rustResult.allowed !== undefined) return rustResult;
            } catch {}
        }
        // JS 层兜底
        const policy = this.policies.default?.network;
        if (!policy) return { allowed: true };
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;
            if (policy.blocked_domains) {
                for (const blocked of policy.blocked_domains) {
                    if (this._matchPattern(hostname, blocked)) {
                        return { allowed: false, reason: `Domain ${hostname} is blocked` };
                    }
                }
            }
            if (policy.allowed_domains) {
                let allowed = false;
                for (const allowedDomain of policy.allowed_domains) {
                    if (this._matchPattern(hostname, allowedDomain)) {
                        allowed = true;
                        break;
                    }
                }
                if (!allowed) {
                    return { allowed: false, reason: `Domain ${hostname} not in whitelist` };
                }
            }
        } catch (e) {
            return { allowed: false, reason: 'Invalid URL' };
        }
        return { allowed: true };
    }

    // 检查工具执行
    // Phase 4: 优先 Rust 检查，JS 层兜底
    // v4.2: 对文件相关工具检查敏感路径
    async checkTool(toolName, params = {}) {
        // v4.2: 对文件相关工具检查敏感路径
        if (params.path || params.file_path) {
            const sensitiveCheck = this.checkSensitivePath(params.path || params.file_path);
            if (sensitiveCheck) {
                console.warn(`[PolicyEngine] Tool ${toolName} blocked on sensitive path: ${params.path || params.file_path}`);
                return sensitiveCheck;
            }
        }

        if (this.rustAdapter) {
            try {
                const rustResult = await this.rustAdapter.checkTool(toolName);
                if (rustResult && rustResult.allowed !== undefined) return rustResult;
            } catch {}
        }
        // JS 层兜底
        const policy = this.policies.default?.tools?.[toolName];
        if (!policy) return { allowed: true };
        if (policy.allowed === false) {
            return { allowed: false, reason: `Tool ${toolName} is disabled` };
        }
        if (policy.max_duration && params.duration && params.duration > policy.max_duration) {
            return { allowed: false, reason: `Duration exceeds limit of ${policy.max_duration}ms` };
        }
        return { allowed: true };
    }

    _matchPattern(hostname, pattern) {
        // 简单通配符匹配
        if (pattern.startsWith('*.')) {
            const suffix = pattern.substring(1);
            return hostname.endsWith(suffix) || hostname === suffix.substring(1);
        }
        return hostname === pattern || hostname.endsWith('.' + pattern);
    }

    // 获取统计
    getStats() {
        return {
            loaded: Object.keys(this.policies).length,
            workspace: this.workspaceRoot
        };
    }

    async shutdown() {
        this.policies = {};
    }

    /**
     * 获取安全统计信息
     * v4.2: 新增敏感路径保护统计
     */
    getSecurityStats() {
        return {
            sensitivePatterns: SENSITIVE_PATH_PATTERNS.length,
            immutableRules: true,
            rustBackend: !!this.rustAdapter,
            loadedPolicies: Object.keys(this.policies).length,
        };
    }
}

export function getPolicyEngine(kernel) {
    return new PolicyEngine(kernel);
}