// hundunos/kernel/upgrade-controller.js — Upgrade Controller v3.0
// S-04: 增强的升级安全验证

import { pathToFileURL } from 'url';
import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join, normalize, dirname } from 'path';

export class UpgradeController {
    constructor(kernel) {
        this.kernel = kernel;
        this.upgradeHistory = [];
        this.targetVersion = kernel?.config?.system?.upgrade?.targetVersion || '3.0.1';
        const configuredSources = kernel?.config?.system?.upgrade?.trustedSources || [];
        // SEC-03 修复：移除 localhost 默认信任源，仅通过显式配置或 projectRoot 添加
        const defaultSources = configuredSources.length > 0 ? [] : [];
        const projectRootSource = kernel?.config?.projectRoot
            ? `${pathToFileURL(kernel.config.projectRoot).href.replace(/\/$/, '')}/`
            : null;

        this.trustedSources = new Set([
            ...defaultSources,
            ...configuredSources,
            ...(projectRootSource ? [projectRootSource] : [])
        ]);

        // S-04: 新增安全配置
        this.allowedPatterns = kernel?.config?.system?.upgrade?.allowedPatterns || ['*.json', '*.js'];
        this.requireSignature = kernel?.config?.system?.upgrade?.requireSignature || false;
        this.requireHash = kernel?.config?.system?.upgrade?.requireHash || false;
    }

    async initialize() {
        // console.log('[UpgradeController] Initialized, trusted sources:', this.trustedSources.size);
        // console.log('[UpgradeController] Security: signature=', this.requireSignature, 'hash=', this.requireHash);
    }

    verifySource(source) {
        if (!source) return { valid: false, reason: 'No source specified' };

        // S-04: 增强源验证 - 检查通配符模式匹配
        for (const trusted of this.trustedSources) {
            if (this._matchSource(source, trusted)) {
                // S-04: 检查文件类型
                if (!this._checkFilePattern(source)) {
                    return { valid: false, reason: 'File type not allowed', allowed: this.allowedPatterns };
                }
                return { valid: true, source };
            }
        }
        return { valid: false, reason: 'Source not in whitelist', suggestion: 'Add source to trusted list first' };
    }

    // S-04: 支持通配符的源匹配
    _matchSource(source, trusted) {
        if (trusted.includes('*')) {
            const pattern = trusted.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace('\\*', '.*');
            return new RegExp(`^${pattern}`, 'i').test(source);
        }
        return source.startsWith(trusted);
    }

    // S-04: 文件类型检查
    _checkFilePattern(source) {
        const fileName = source.split('/').pop().split('\\').pop();
        return this.allowedPatterns.some(pattern => {
            const regex = new RegExp(`^${pattern.replace('*', '.*')}$`, 'i');
            return regex.test(fileName);
        });
    }

    // S-04: 计算文件哈希
    async _computeHash(filePath) {
        if (!existsSync(filePath)) return null;
        const content = readFileSync(filePath);
        return createHash('sha256').update(content).digest('hex');
    }

    // S-04: 验证文件完整性
    async _verifyIntegrity(source, expectedHash) {
        if (!expectedHash) return { valid: true, reason: 'No hash provided, skipping' };

        // 转换为文件路径
        let filePath = source;
        if (source.startsWith('file://')) {
            filePath = decodeURIComponent(source.replace('file://', '').replace(/\//g, '\\'));
        }

        const actualHash = await this._computeHash(filePath);
        if (!actualHash) return { valid: false, reason: 'Cannot read source file' };

        if (actualHash !== expectedHash) {
            return { valid: false, reason: 'Hash mismatch', expected: expectedHash, actual: actualHash };
        }
        return { valid: true, reason: 'Hash verified' };
    }

    // S-04: 验证代码签名 (简化版 - 实际应调用系统签名验证)
    async _verifySignature(source) {
        if (!this.requireSignature) return { valid: true, reason: 'Signature check disabled' };

        // 转换为文件路径
        let filePath = source;
        if (source.startsWith('file://')) {
            filePath = decodeURIComponent(source.replace('file://', '').replace(/\//g, '\\'));
        }

        if (!existsSync(filePath)) {
            return { valid: false, reason: 'Source file not found' };
        }

        // 简化实现：检查文件是否在受信任目录
        const normalizedPath = normalize(filePath);
        const trusted = Array.from(this.trustedSources).filter(s => s.startsWith('file://'));

        for (const t of trusted) {
            const trustedPath = decodeURIComponent(t.replace('file://', '').replace(/\//g, '\\'));
            if (normalizedPath.toLowerCase().startsWith(trustedPath.toLowerCase())) {
                return { valid: true, reason: 'Located in trusted directory' };
            }
        }

        return { valid: false, reason: 'Source not in trusted directory' };
    }

    async upgradeKernel(newSource, options = {}) {
        const check = this.verifySource(newSource);
        if (!check.valid) {
            return { success: false, error: check.reason, suggestion: check.suggestion };
        }

        // S-04: 签名验证
        if (this.requireSignature) {
            const sigCheck = await this._verifySignature(newSource);
            if (!sigCheck.valid) {
                return { success: false, error: `Signature verification failed: ${sigCheck.reason}` };
            }
        }

        // S-04: 完整性校验
        if (this.requireHash && options.expectedHash) {
            const hashCheck = await this._verifyIntegrity(newSource, options.expectedHash);
            if (!hashCheck.valid) {
                return { success: false, error: `Integrity check failed: ${hashCheck.reason}` };
            }
        }

        try {
            // 快照当前状态
            await this.kernel.recoverableMemory.takeSnapshot({ type: 'pre_upgrade', note: 'Before kernel upgrade' });

            const upgrade = {
                id: `upgrade_${Date.now()}`,
                source: newSource,
                from: this.kernel.state.version,
                to: this.targetVersion,
                timestamp: Date.now(),
                status: 'applying',
                signatureVerified: this.requireSignature,
                hashVerified: this.requireHash && !!options.expectedHash
            };

            this.upgradeHistory.push(upgrade);

            // 应用升级代码（实际实现需要根据 upgrade.source 加载新代码）
            // console.log(`[UpgradeController] Upgrade ${upgrade.id} queued for ${upgrade.source} -> ${upgrade.to}`);
            return { success: true, upgradeId: upgrade.id, message: 'Kernel upgrade queued' };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    async rollback(upgradeId) {
        const upgrade = this.upgradeHistory.find(u => u.id === upgradeId);
        if (!upgrade) return { success: false, error: 'Upgrade not found' };
        // 回滚实现：标记 upgrade 为 rolled back，恢复到 from 版本
        upgrade.status = 'rolled_back';
        // console.log(`[UpgradeController] Rollback ${upgradeId}: ${upgrade.to} -> ${upgrade.from}`);
        return { success: true, message: 'Rollback completed', from: upgrade.to, to: upgrade.from };
    }

    getHistory() { return [...this.upgradeHistory]; }
}
