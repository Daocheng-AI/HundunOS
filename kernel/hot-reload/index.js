// hundunos/kernel/hot-reload/index.js — 配置文件热重载模块
// 功能: 监控配置文件和SOUL.md变化，动态重载无需重启
// 状态: 新增

import { watch } from 'chokidar';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class HotReload {
    constructor(kernel) {
        this.kernel = kernel;
        this.watchers = new Map();
        this.callbacks = new Map();
        this.configPath = join(__dirname, '..', '..', 'config');
        this.workspaceRoot = kernel?.config?.workspace || join(__dirname, '..', '..');
    }

    async initialize() {
        // review: removed // review: removed console.log('[HotReload] Initializing...');

        // 1. 监控配置文件
        await this._watchConfig();

        // 2. 监控 SOUL.md
        await this._watchSoul();

        // review: removed // review: removed console.log('[HotReload] Hot reload enabled');
    }

    async _watchConfig() {
        const configFiles = [
            'system.json',
            'system.development.json',
            'system.production.json',
            'system.testing.json'
        ];

        const watcher = watch(
            configFiles.map(f => join(this.configPath, f)),
            {
                persistent: true,
                ignoreInitial: true,
                awaitWriteFinish: {
                    stabilityThreshold: 500,
                    pollInterval: 100
                }
            }
        );

        watcher.on('change', (path) => {
            // review: removed // review: removed console.log(`[HotReload] Config changed: ${path}`);
            this._reloadConfig(path);
        });

        this.watchers.set('config', watcher);
    }

    async _watchSoul() {
        const soulPath = join(this.workspaceRoot, 'SOUL.md');

        // 检查 SOUL.md 是否存在
        if (!existsSync(soulPath)) {
            // review: removed // review: removed console.log('[HotReload] SOUL.md not found, skipping');
            return;
        }

        const watcher = watch(soulPath, {
            persistent: true,
            awaitWriteFinish: {
                stabilityThreshold: 500,
                pollInterval: 100
            }
        });

        watcher.on('change', () => {
            // review: removed // review: removed console.log('[HotReload] SOUL.md changed, reloading...');
            this._reloadSoul();
        });

        this.watchers.set('soul', watcher);
    }

    _reloadConfig(path) {
        try {
            const content = readFileSync(path, 'utf8');
            const newConfig = JSON.parse(content);

            // 触发回调
            const callbacks = this.callbacks.get('config') || [];
            callbacks.forEach(cb => cb(path, newConfig));

            // review: removed // review: removed console.log(`[HotReload] Config reloaded: ${path}`);
        } catch (e) {
            console.error(`[HotReload] Failed to reload config: ${e.message}`);
        }
    }

    _reloadSoul() {
        try {
            const soulPath = join(this.workspaceRoot, 'SOUL.md');
            const content = readFileSync(soulPath, 'utf8');

            // 更新内核的 aware system
            if (this.kernel?.aware?.loadSoul) {
                this.kernel.aware.loadSoul(content);
            }

            // 触发回调
            const callbacks = this.callbacks.get('soul') || [];
            callbacks.forEach(cb => cb(content));

            // review: removed // review: removed console.log('[HotReload] SOUL.md reloaded');
        } catch (e) {
            console.error(`[HotReload] Failed to reload SOUL: ${e.message}`);
        }
    }

    // 注册回调
    on(event, callback) {
        if (!this.callbacks.has(event)) {
            this.callbacks.set(event, []);
        }
        this.callbacks.get(event).push(callback);
    }

    // 获取状态
    getStats() {
        return {
            watchers: Array.from(this.watchers.keys()),
            configPath: this.configPath,
            soulPath: join(this.workspaceRoot, 'SOUL.md')
        };
    }

    // 关闭所有监控
    async shutdown() {
        for (const [name, watcher] of this.watchers) {
            await watcher.close();
            // review: removed // review: removed console.log(`[HotReload] Stopped watching: ${name}`);
        }
        this.watchers.clear();
    }
}

export function getHotReload(kernel) {
    return new HotReload(kernel);
}