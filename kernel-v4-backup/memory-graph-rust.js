// hundunos/kernel/memory-graph-rust.js — ⚠️ DEPRECATED v3.7
// ⚠️ 已废弃：使用 hundunos/kernel/memory-graph.js（Phase 4 已集成 adapters/rust-modules/）
// ⚠️ 此文件仅保留用于向后兼容，将在后续版本中移除
// 新增功能请使用：kernel.rustMemory（adapters/rust-modules/memory-graph.js）

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Rust CLI 路径 (Phase 2: vendor/hundunos-rust/)
const RUST_CLI_PATH = join(__dirname, '..', '..', 'vendor', 'hundunos-rust', 'target', 'release', 'hundunos-memory.exe');

export class MemoryGraphRust {
    constructor(kernel) {
        this.kernel = kernel;
        this.useRust = true;
        this.fallbackCount = 0;
        this.maxFallback = 3;
        
        // 检查 Rust CLI 是否存在
        this.rustAvailable = existsSync(RUST_CLI_PATH);
        
        if (!this.rustAvailable) {
            console.warn('[MemoryGraphRust] Rust CLI not found');
        }
    }

    async initialize() {
        // console.log(`[MemoryGraphRust] ${this.rustAvailable ? 'Rust' : 'JS'} implementation`);
    }

    /**
     * 记录记忆
     */
    async record(content, intent, result) {
        if (this.rustAvailable && this.useRust) {
            try {
                const response = await this._sendRust({
                    Record: { content, intent, result }
                });
                return response.data;
            } catch (e) {
                console.warn('[MemoryGraphRust] Rust failed:', e.message);
                this._handleFallback();
            }
        }
        
        return this._recordJS(content, intent, result);
    }

    /**
     * 回忆
     */
    async recall(query) {
        if (this.rustAvailable && this.useRust) {
            try {
                const response = await this._sendRust({
                    Recall: { query }
                });
                return response.data;
            } catch (e) {
                console.warn('[MemoryGraphRust] Rust failed:', e.message);
                this._handleFallback();
            }
        }
        
        return this._recallJS(query);
    }

    /**
     * 设置上下文
     */
    async setContext(level, key, value) {
        if (this.rustAvailable && this.useRust) {
            try {
                await this._sendRust({
                    SetContext: { level, key, value }
                });
                return true;
            } catch (e) {
                console.warn('[MemoryGraphRust] Rust failed:', e.message);
            }
        }
        
        return this._setContextJS(level, key, value);
    }

    /**
     * 获取上下文链
     */
    async getContextChain() {
        if (this.rustAvailable && this.useRust) {
            try {
                const response = await this._sendRust({
                    GetContextChain: {}
                });
                return response.data;
            } catch (e) {
                console.warn('[MemoryGraphRust] Rust failed:', e.message);
            }
        }
        
        return this._getContextChainJS();
    }

    /**
     * 执行蒸馏
     */
    async distill() {
        if (this.rustAvailable && this.useRust) {
            try {
                await this._sendRust({ Distill: {} });
                return true;
            } catch (e) {
                console.warn('[MemoryGraphRust] Rust failed:', e.message);
            }
        }
        
        return this._distillJS();
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

    /**
     * 发送请求到 Rust CLI
     */
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
                    reject(new Error(`Invalid response: ${stdout}`));
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

    // JS 回退实现
    _recordJS(content, intent, result) {
        return { id: `js_${Date.now()}`, content, intent, result, timestamp: Date.now() };
    }

    _recallJS(query) {
        return { recent: [], semantic: [], episodic: [] };
    }

    _setContextJS(level, key, value) {
        return true;
    }

    _getContextChainJS() {
        return {};
    }

    _distillJS() {
        return true;
    }

    _handleFallback() {
        this.fallbackCount++;
        if (this.fallbackCount >= this.maxFallback) {
            console.warn('[MemoryGraphRust] Disabling Rust');
            this.useRust = false;
        }
    }
}

export function getMemoryGraphRust(kernel) {
    return new MemoryGraphRust(kernel);
}
