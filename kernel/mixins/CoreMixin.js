// hundunos/kernel/mixins/CoreMixin.js
// HundunOS v4.1 — CoreMixin：配置、状态、生命周期
// 来源：core.js constructor + initialize() Phase 1（安全检查+工具函数）

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, normalize, isAbsolute } from 'path';
import { createHash } from 'crypto';
import { deepMerge, resolveProjectPath } from '../utils.js';

const DEFAULT_PROJECT_ROOT = process.env.HUNDUNOS_WS || join(import.meta.url, '..', '..');
const DEFAULT_STORAGE_DIR = '.hundunos';
const DEFAULT_CONFIG_PATH = join('config', 'system.json');

/**
 * CoreMixin — 核心配置与生命周期管理
 *
 * 职责：
 * - 配置加载（系统配置 + 环境覆盖 + 构造参数）
 * - 工作区安全验证
 * - 状态管理（initialized / running / sessions / version）
 * - 生产环境密钥强制检查
 * - shutdown() 核心清理
 * - getStatus() 核心字段
 *
 * v4.1: 从 core.js 提取，作为所有 Mixin 的基础层
 */
export const CoreMixin = class CoreMixin {
    /**
     * 初始化核心配置（Phase: config）
     * @param {CoreKernel} kernel
     */
    init(kernel) {
        // kernel.state 已在构造函数中初始化，此处无需重复
        // Phase config：仅扩展 config
    }

    /**
     * Phase: platform — 安全环境验证
     * @param {CoreKernel} kernel
     */
    init_platform(kernel) {
        const { workspace, projectRoot, environment } = kernel.config;

        const workspaceNorm = normalize(workspace);
        const projectRootNorm = normalize(projectRoot);
        const isWorkspaceInProject =
            workspaceNorm === projectRootNorm ||
            workspaceNorm.startsWith(
                projectRootNorm + (process.platform === 'win32' ? '\\' : '/')
            );

        if (!isWorkspaceInProject) {
            console.warn(`[Kernel] Workspace path "${workspace}" is outside project root "${projectRoot}".`);
            if (environment === 'production') {
                throw new Error('Security violation: Workspace outside project root');
            }
        }
    }

    // ================================================================
    // 生命周期方法
    // ================================================================

    /**
     * 核心关闭 — 清理 storage / messageBus / restServer
     * @param {CoreKernel} kernel
     */
    async init_shutdown(kernel) {
        // shutdown 钩子由 Kernel.shutdown() 调用，这里注入清理逻辑
        // 实际 shutdown 逻辑在 Kernel.shutdown() 中
    }

    /**
     * 加载系统配置文件
     * @param {string} configPath
     * @returns {Object}
     */
    _loadSystemConfig(configPath) {
        if (!existsSync(configPath)) {
            console.warn(`[Kernel] System config not found: ${configPath}`);
            return {};
        }
        try {
            return JSON.parse(readFileSync(configPath, 'utf8'));
        } catch (e) {
            console.warn(`[Kernel] Failed to load system config: ${e.message}`);
            return {};
        }
    }

    // ================================================================
    // REST API — 内部工具方法（RestMixin 会调用）
    // ================================================================

    _validateApiKey(apiKey) {
        if (!apiKey) return false;
        const configured = this.config.system?.restApi?.apiKeys || [];
        const envKey = process.env.HUNDUN_API_KEY;
        const effectiveKeys = envKey
            ? [...configured.filter(k => k && !k.startsWith('//')), envKey]
            : configured;
        if (!effectiveKeys || effectiveKeys.length === 0) {
            if (this.config.environment !== 'production') return true;
            console.warn('[Kernel] REST API has no API keys configured — rejecting request');
            return false;
        }
        const providedHash = createHash('sha256').update(apiKey).digest('hex');
        return effectiveKeys.some(stored => {
            const storedHash =
                stored.length === 64
                    ? stored
                    : createHash('sha256').update(stored).digest('hex');
            return providedHash === storedHash;
        });
    }

    _readBody(req, maxBytes = 2 * 1024 * 1024) {
        return new Promise((resolve, reject) => {
            let size = 0, data = '';
            req.on('data', chunk => {
                size += chunk.length;
                if (size > maxBytes) return reject(new Error(`Request body too large: ${size} bytes`));
                data += chunk;
            });
            req.on('end', () => resolve(data));
            req.on('error', reject);
        });
    }

    // ================================================================
    // getMixinStatus — Core 贡献的状态字段
    // ================================================================
    getMixinStatus_Core() {
        return {
            core: {
                version: this.state.version,
                running: this.state.running,
                uptime: process.uptime(),
                environment: this.config.environment,
            },
        };
    }

    // ================================================================
    // 事件兼容层 — v4.1 messageBus 作为统一事件总线
    // kernel.emit/on 是 v3.x 遗留 API，代理到 messageBus
    // ================================================================

    /**
     * 发布事件（v3.x 兼容：kernel.emit → messageBus.publish）
     * @param {string} event
     * @param {*} data
     */
    emit(event, data) {
        if (this.messageBus?.publish) {
            this.messageBus.publish(event, data);
        }
    }

    /**
     * 订阅事件（v3.x 兼容：kernel.on → messageBus.on）
     * @param {string} event
     * @param {Function} handler
     */
    on(event, handler) {
        if (this.messageBus?.on) {
            this.messageBus.on(event, handler);
        }
    }
};

export default CoreMixin;
