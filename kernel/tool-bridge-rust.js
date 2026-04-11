// hundunos/kernel/tool-bridge-rust.js — ⚠️ DEPRECATED v3.7
// ⚠️ 已废弃：使用 hundunos/tool-bridge.js（Phase 4 已集成 adapters/rust-modules/）
// ⚠️ 此文件仅保留用于向后兼容，将在后续版本中移除
// 新增功能请使用：kernel.rustTool（adapters/rust-modules/tool-bridge.js）
//
// 功能: Rust 三层命令体系 + Schema自省 + Dry Run + 优雅回退

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Rust Tool Bridge v3.0 路径（优先 workspace root 的已编译 binary）
function findRustBinary() {
    const candidates = [
        // vendor/hundunos-rust/ (Phase 2 subtree location — 优先)
        join(__dirname, '..', '..', 'vendor', 'hundunos-rust', 'tool-bridge', 'target', 'release', 'hundunos-tool.exe'),
        // legacy root (兼容 Phase 1 旧布局)
        join(__dirname, '..', '..', 'hundunos-rust', 'target', 'release', 'hundunos-tool.exe'),
    ];

    for (const path of candidates) {
        if (existsSync(path)) {
            return path;
        }
    }
    return null;
}

const RUST_CLI_PATH = findRustBinary();

export class ToolBridgeRust {
    constructor(kernel) {
        this.kernel = kernel;
        this.useRust = !!RUST_CLI_PATH;
        this.fallbackCount = 0;
        this.maxFallback = 3;
        this._statsCache = null;
        this._schemaCache = null;
        this._cacheTime = 0;
        this._cacheTTL = 60000; // 1 minute cache
    }

    /** 发送请求到 Rust Tool Bridge */
    async _sendRequest(req) {
        if (!this.useRust || !RUST_CLI_PATH) {
            throw new Error('Rust CLI not available');
        }

        return new Promise((resolve, reject) => {
            const proc = spawn(RUST_CLI_PATH, [], {
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => {
                const text = data.toString();
                // 过滤 ANSI tracing 行，只保留 JSON
                const lines = text.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed && !trimmed.startsWith('[') && !trimmed.startsWith('\x1b')) {
                        try {
                            const parsed = JSON.parse(trimmed);
                            resolve(parsed);
                            return;
                        } catch {
                            // 不是 JSON，继续
                        }
                    }
                }
                stdout += text;
            });

            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('error', (e) => {
                reject(new Error(`Rust CLI spawn error: ${e.message}`));
            });

            proc.on('close', (code) => {
                if (code !== 0 && !stdout.trim()) {
                    reject(new Error(`Rust CLI exited with code ${code}: ${stderr}`));
                }
            });

            // 发送请求
            proc.stdin.write(JSON.stringify(req) + '\n');
            proc.stdin.end();
        });
    }

    /** 清除缓存 */
    _invalidateCache() {
        this._statsCache = null;
        this._schemaCache = null;
    }

    /**
     * 执行命令 - 三层命令体系
     * 支持 Shortcut (+xxx) / API Command (xxx.xxx) / Raw Command
     */
    async execute(command, options = {}) {
        if (!this.useRust) {
            throw new Error('Rust CLI not available, use tool-bridge.js fallback');
        }

        const req = {
            action: 'Execute',
            request: {
                command,
                cwd: options.cwd,
                timeout_ms: options.timeout || options.timeout_ms || 30000,
                env: options.env,
                pipe_commands: options.pipe_commands,
                max_output_size: options.max_output_size,
                max_memory_mb: options.max_memory_mb,
                capture_stderr: options.capture_stderr ?? true,
                // v3.0: Dry Run
                dry_run: options.dry_run ?? false,
            }
        };

        try {
            const result = await this._sendRequest(req);
            if (!result.success) {
                this.fallbackCount++;
                if (this.fallbackCount >= this.maxFallback) {
                    this.useRust = false;
                }
            } else {
                this.fallbackCount = 0;
            }
            return result;
        } catch (e) {
            this.fallbackCount++;
            if (this.fallbackCount >= this.maxFallback) {
                this.useRust = false;
            }
            throw e;
        }
    }

    /**
     * Dry Run - 预览命令但不执行
     */
    async dryRun(command, options = {}) {
        return await this.execute(command, { ...options, dry_run: true });
    }

    /**
     * Schema 查询
     * @param {Object} query - {type: 'Tree' | 'Search' | 'Shortcut' | 'ApiCommand', ...}
     */
    async schema(query) {
        if (this._schemaCache && (Date.now() - this._cacheTime) < this._cacheTTL) {
            return this._schemaCache;
        }
        try {
            const result = await this._sendRequest({ action: 'Schema', query });
            if (result.success) {
                this._schemaCache = result.data;
                this._cacheTime = Date.now();
            }
            return result;
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 获取所有 Shortcuts（可选按 category 过滤）
     */
    async listShortcuts(category = null) {
        try {
            return await this._sendRequest({ action: 'Shortcuts', category });
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 解析命令（不执行）- 查看展开结果
     */
    async resolve(command) {
        try {
            return await this._sendRequest({ action: 'Resolve', command });
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 获取统计信息
     */
    async getStats() {
        if (this._statsCache && (Date.now() - this._cacheTime) < this._cacheTTL) {
            return this._statsCache;
        }
        try {
            const result = await this._sendRequest({ action: 'GetStats' });
            if (result.success) {
                this._statsCache = result.data;
                this._cacheTime = Date.now();
            }
            return result;
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 获取执行统计（同步）
     */
    getStatsSync() {
        return {
            rustAvailable: this.useRust && !!RUST_CLI_PATH,
            rustPath: RUST_CLI_PATH,
            fallbackCount: this.fallbackCount,
            cacheAge: this._cacheTime ? Date.now() - this._cacheTime : null,
        };
    }

    /**
     * 终止长时间运行的命令
     */
    async terminate(commandId) {
        try {
            return await this._sendRequest({ action: 'Terminate', command_id: commandId });
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 健康检查
     */
    async healthCheck() {
        if (!this.useRust) {
            return { success: false, status: 'unavailable', error: 'Rust CLI disabled' };
        }
        try {
            const stats = await this.getStats();
            return {
                success: true,
                status: 'healthy',
                rustPath: RUST_CLI_PATH,
                stats,
            };
        } catch (e) {
            return { success: false, status: 'unhealthy', error: e.message };
        }
    }

    /**
     * 获取可用命令概览（用于 Agent 上下文注入）
     */
    async getCommandOverview() {
        const [shortcuts, schema] = await Promise.all([
            this.listShortcuts(),
            this.schema({ type: 'Tree' }),
        ]);

        return {
            shortcuts: shortcuts.success ? shortcuts.data || [] : [],
            categories: schema.success && schema.data ? Object.keys(schema.data) : [],
            rustAvailable: this.useRust,
        };
    }
}

export function getToolBridgeRust(kernel) {
    return new ToolBridgeRust(kernel);
}
