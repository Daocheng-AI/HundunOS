// hundunos/kernel/policy-engine-rust.js — ⚠️ DEPRECATED v3.7
// ⚠️ 已废弃：使用 hundunos/kernel/policy-engine.js（Phase 4 已集成 adapters/rust-modules/）
// ⚠️ 此文件仅保留用于向后兼容，将在后续版本中移除
// 新增功能请使用：kernel.rustPolicy（adapters/rust-modules/policy-engine.js）

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Rust CLI 路径 (Phase 2: vendor/hundunos-rust/)
const RUST_CLI_PATH = join(__dirname, '..', '..', 'vendor', 'hundunos-rust', 'target', 'release', 'hundunos-policy.exe');

export class PolicyEngineRust {
    constructor(kernel) {
        this.kernel = kernel;
        this.useRust = true;
        this.fallbackCount = 0;
        this.maxFallback = 3;
        this.workspaceRoot = kernel?.config?.workspace || join(__dirname, '..', '..');
        
        // 检查 Rust CLI 是否存在
        this.rustAvailable = existsSync(RUST_CLI_PATH);
        
        // 初始化 JS 回退
        if (!this.rustAvailable) {
            console.warn('[PolicyEngineRust] Rust CLI not found, using JS fallback');
        }
    }

    /**
     * 初始化
     */
    async initialize() {
        if (this.rustAvailable) {
            console.log('[PolicyEngineRust] Using Rust implementation');
        } else {
            console.log('[PolicyEngineRust] Using JS implementation');
        }
    }

    /**
     * 检查文件读取权限
     */
    async checkFileRead(filePath) {
        if (this.rustAvailable && this.useRust) {
            try {
                return await this._checkRust('CheckFileRead', { path: filePath });
            } catch (e) {
                console.warn('[PolicyEngineRust] Rust failed:', e.message);
                this._handleFallback();
            }
        }
        
        // JS 回退
        return this._checkJS('fileRead', { path: filePath });
    }

    /**
     * 检查网络请求
     */
    async checkNetwork(url) {
        if (this.rustAvailable && this.useRust) {
            try {
                return await this._checkRust('CheckNetwork', { url });
            } catch (e) {
                console.warn('[PolicyEngineRust] Rust failed:', e.message);
                this._handleFallback();
            }
        }
        
        return this._checkJS('network', { url });
    }

    /**
     * 检查工具执行
     */
    async checkTool(toolName, params = {}) {
        if (this.rustAvailable && this.useRust) {
            try {
                return await this._checkRust('CheckTool', { tool: toolName, duration_ms: params.duration });
            } catch (e) {
                console.warn('[PolicyEngineRust] Rust failed:', e.message);
                this._handleFallback();
            }
        }
        
        return this._checkJS('tool', { tool: toolName, ...params });
    }

    /**
     * 加载策略
     */
    async loadPolicy(name, content) {
        if (this.rustAvailable && this.useRust) {
            try {
                const result = await this._sendRust({
                    type: 'LoadPolicy',
                    name,
                    content
                });
                return result.success;
            } catch (e) {
                console.warn('[PolicyEngineRust] Load policy failed:', e.message);
            }
        }
        
        return false;
    }

    /**
     * 获取统计
     */
    getStats() {
        return {
            useRust: this.rustAvailable && this.useRust,
            implementation: this.rustAvailable ? 'rust' : 'javascript',
            workspace: this.workspaceRoot
        };
    }

    /**
     * 使用 Rust 检查
     */
    async _checkRust(type, params) {
        const result = await this._sendRust({
            type,
            ...params
        });
        
        if (result.result) {
            return result.result;
        }
        
        throw new Error(result.error || 'Unknown error');
    }

    /**
     * 发送请求到 Rust CLI
     */
    async _sendRust(request) {
        return new Promise((resolve, reject) => {
            const proc = spawn(RUST_CLI_PATH, [], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                try {
                    const response = JSON.parse(stdout);
                    resolve(response);
                } catch (e) {
                    reject(new Error(`Invalid response: ${stdout}`));
                }
            });

            proc.on('error', (e) => {
                reject(e);
            });

            // 发送请求
            proc.stdin.write(JSON.stringify(request) + '\n');
            proc.stdin.end();

            // 超时处理
            setTimeout(() => {
                proc.kill();
                reject(new Error('Rust CLI timeout'));
            }, 5000);
        });
    }

    /**
     * JS 回退实现
     */
    _checkJS(type, params) {
        // 简化实现，实际应该调用原来的 JS policy-engine.js
        console.log(`[PolicyEngineRust] Using JS fallback for ${type}`);
        return { allowed: true };
    }

    /**
     * 处理回退
     */
    _handleFallback() {
        this.fallbackCount++;
        if (this.fallbackCount >= this.maxFallback) {
            console.warn('[PolicyEngineRust] Disabling Rust after multiple failures');
            this.useRust = false;
        }
    }

    async shutdown() {}
}

export function getPolicyEngineRust(kernel) {
    return new PolicyEngineRust(kernel);
}
