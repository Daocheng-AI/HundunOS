// hundunos/kernel/model-router-rust.js — ⚠️ DEPRECATED v3.7
// ⚠️ 已废弃：使用 hundunos/kernel/model-router/index.js（Phase 4 已集成 adapters/rust-modules/）
// ⚠️ 此文件仅保留用于向后兼容，将在后续版本中移除
// 新增功能请使用：kernel.rustRouter（adapters/rust-modules/model-router.js）

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Rust CLI 路径 (Phase 2: vendor/hundunos-rust/)
const RUST_CLI_PATH = join(__dirname, '..', '..', 'vendor', 'hundunos-rust', 'target', 'release', 'hundunos-router.exe');

export class ModelRouterRust {
    constructor(kernel) {
        this.kernel = kernel;
        this.useRust = true;
        this.rustAvailable = existsSync(RUST_CLI_PATH);
        
        if (!this.rustAvailable) {
            console.warn('[ModelRouterRust] Rust CLI not found');
        }
    }

    async initialize() {
        console.log(`[ModelRouterRust] ${this.rustAvailable ? 'Rust' : 'JS'} implementation`);
    }

    /**
     * 路由请求
     */
    async route(content, taskType = null, maxTokens = null) {
        if (this.rustAvailable && this.useRust) {
            try {
                const response = await this._sendRust({
                    Route: { content, task_type: taskType, max_tokens: maxTokens }
                });
                return response.data;
            } catch (e) {
                console.warn('[ModelRouterRust] Rust failed:', e.message);
            }
        }
        
        return this._routeJS(content, taskType);
    }

    /**
     * 记录成功
     */
    async recordSuccess(providerId) {
        if (this.rustAvailable) {
            try {
                await this._sendRust({
                    RecordSuccess: { provider_id: providerId }
                });
            } catch (e) {
                console.warn('[ModelRouterRust] recordSuccess failed:', e.message);
            }
        }
    }

    /**
     * 记录失败
     */
    async recordFailure(providerId) {
        if (this.rustAvailable) {
            try {
                await this._sendRust({
                    RecordFailure: { provider_id: providerId }
                });
            } catch (e) {
                console.warn('[ModelRouterRust] recordFailure failed:', e.message);
            }
        }
    }

    /**
     * 缓存响应
     */
    async cacheResponse(content, response, tokens) {
        if (this.rustAvailable) {
            try {
                await this._sendRust({
                    CacheResponse: { content, response, tokens }
                });
            } catch (e) {
                console.warn('[ModelRouterRust] cacheResponse failed:', e.message);
            }
        }
    }

    /**
     * 获取统计
     */
    getStats() {
        return {
            useRust: this.rustAvailable && this.useRust,
            implementation: this.rustAvailable ? 'rust' : 'javascript'
        };
    }

    async _sendRust(request) {
        return new Promise((resolve, reject) => {
            const proc = spawn(RUST_CLI_PATH, [], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            proc.on('close', () => {
                try {
                    const response = JSON.parse(stdout.trim());
                    resolve(response);
                } catch (e) {
                    reject(new Error(`Invalid response`));
                }
            });

            proc.on('error', (e) => {
                reject(e);
            });

            proc.stdin.write(JSON.stringify(request) + '\n');
            proc.stdin.end();

            setTimeout(() => {
                proc.kill();
                reject(new Error('Timeout'));
            }, 5000);
        });
    }

    _routeJS(content, taskType) {
        return {
            provider_id: 'openai_gpt4',
            provider_name: 'OpenAI GPT-4',
            model: 'gpt-4',
            task_type: taskType || 'BALANCED',
            is_cached: false
        };
    }
}

export function getModelRouterRust(kernel) {
    return new ModelRouterRust(kernel);
}
