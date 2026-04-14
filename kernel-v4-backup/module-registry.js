// hundunos/kernel/module-registry.js — Module Registry v3.0
// 模块注册表：发现/注册/激活/停用

import { existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * ModuleRegistry — 工厂模式模块注册表
 *
 * 支持三种注册方式：
 * 1. register(moduleDef)  — 注册已有实例或元数据
 * 2. register(name, factory) — 注册工厂函数，惰性实例化
 * 3. fromConfig(config)    — 根据配置批量注册（配置驱动）
 *
 * 核心 API：
 * - get(name)        — 惰性获取模块实例（首次调用时执行工厂）
 * - initAll()        — 预初始化所有已注册模块
 * - activate(name)   — 激活模块生命周期
 * - deactivate(name)  — 停用模块生命周期
 */
export class ModuleRegistry {
    #kernel;
    #modules;         // id → { id, name, type, status, instance, version, capabilities, config, path }
    #factories;       // id → () → Promise<any>  惰性工厂
    #activeModules;   // Set<id>
    #discoveryPaths;
    #lifecycle;       // event → Function[]

    constructor(kernel) {
        this.#kernel = kernel;
        this.#modules = new Map();
        this.#factories = new Map();
        this.#activeModules = new Set();
        this.#discoveryPaths = ['kernel', 'stable-modules', 'extension-modules'];
        this.#lifecycle = new Map();
    }

    // ================================================================
    // 工厂模式 API（核心新增）
    // ================================================================

    /**
     * 注册一个惰性工厂函数。
     * @param {string} name   - 模块唯一名称
     * @param {Function} factory - async () => ModuleInstance
     * @param {Object} meta   - { type, version, capabilities, config }
     */
    registerFactory(name, factory, meta = {}) {
        if (this.#factories.has(name)) {
            console.warn(`[ModuleRegistry] Factory "${name}" already registered, skipping.`);
            return;
        }
        this.#factories.set(name, factory);
        this.#modules.set(name, {
            id: name,
            name: name,
            type: meta.type || 'unknown',
            status: 'registered',   // registered | instantiated | active | sleeping | error
            instance: null,
            version: meta.version || '1.0.0',
            capabilities: meta.capabilities || [],
            config: meta.config || {}
        });
    }

    /**
     * 惰性获取模块实例（工厂模式核心 API）。
     * 首次调用时执行已注册的工厂函数，之后缓存结果。
     * @param {string} name - 模块名称
     * @returns {Promise<any>} 模块实例
     */
    async getInstance(name) {
        const entry = this.#modules.get(name);
        if (!entry) {
            throw new Error(`[ModuleRegistry] Module not registered: "${name}". Available: ${JSON.stringify([...this.#modules.keys()])}`);
        }

        // 已有实例，直接返回（支持显式 null 的合法值）
        if (entry.instance !== undefined && entry.instance !== null) return entry.instance;

        // 从工厂惰性实例化
        const factory = this.#factories.get(name);
        if (!factory) {
            throw new Error(`[ModuleRegistry] Module "${name}" has no factory and no pre-registered instance.`);
        }

        try {
            entry.instance = await factory();
            entry.status = 'instantiated';
            this.#emit('module:instantiated', entry);
            return entry.instance;
        } catch (err) {
            entry.status = 'error';
            entry.error = err.message;
            this.#emit('module:error', entry);
            throw err;
        }
    }

    /**
     * 预初始化所有已注册模块（并行）。
     * 用于 Kernel 启动时 eager 模式。
     */
    async initAll() {
        const names = [...this.#modules.keys()];
        await Promise.all(names.map(name => this.getInstance(name).catch(e =>
            console.warn(`[ModuleRegistry] initAll: "${name}" failed — ${e.message}`)
        )));
        this.#emit('modules:all-ready', { count: names.length });
    }

    // ================================================================
    // 原有公开 API（适配私有字段）
    // ================================================================

    async initialize() {
        // console.log('[ModuleRegistry] Initializing...');
        await this.discoverModules();
        // console.log(`[ModuleRegistry] Discovered ${this.#modules.size} modules (factories: ${this.#factories.size})`);
    }

    async discoverModules() {
        // 优先使用 Kernel 配置的项目根目录，否则向上查找
        let projectRoot = this.#kernel?.config?.projectRoot;

        if (!projectRoot) {
            // 向上查找 package.json 所在目录
            let currentDir = __dirname;
            for (let i = 0; i < 5; i++) {
                if (existsSync(join(currentDir, 'package.json'))) {
                    projectRoot = currentDir;
                    break;
                }
                const parent = dirname(currentDir);
                if (parent === currentDir) break;
                currentDir = parent;
            }
        }

        if (!projectRoot) {
            projectRoot = join(__dirname, '..');
        }

        for (const relPath of this.#discoveryPaths) {
            const absPath = join(projectRoot, relPath);
            if (!existsSync(absPath)) continue;

            try {
                const entries = readdirSync(absPath, { withFileTypes: true });
                for (const entry of entries) {
                    // 跳过非目录和特殊目录
                    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'providers' || entry.name === 'strategies') continue;

                    const modId = entry.name;
                    // 已注册的跳过（Kernel 初始化时已注册的内置模块）
                    if (this.#modules.has(modId)) continue;

                    // 检查是否有 index.js
                    const indexPath = join(absPath, entry.name, 'index.js');
                    if (existsSync(indexPath)) {
                        // 判断模块类型
                        const type = relPath === 'kernel' ? 'kernel'
                            : relPath === 'stable-modules' ? 'stable'
                            : 'extension';

                        this.#modules.set(modId, {
                            id: modId,
                            name: modId,
                            type,
                            status: 'registered',
                            instance: null,
                            version: '1.0.0',
                            capabilities: [],
                            config: {},
                            path: indexPath
                        });
                    }
                }
            } catch (e) {
                console.warn(`[ModuleRegistry] Failed to scan ${absPath}: ${e.message}`);
            }
        }

        // 自动发现 kernel 下的独立 .js 模块
        const kernelPath = join(projectRoot, 'kernel');
        if (existsSync(kernelPath)) {
            try {
                const entries = readdirSync(kernelPath, { withFileTypes: true });
                for (const entry of entries) {
                    if (!entry.isFile() || !entry.name.endsWith('.js') || entry.name === 'core.js') continue;
                    const modId = entry.name.replace('.js', '');
                    if (this.#modules.has(modId)) continue;
                    this.#modules.set(modId, {
                        id: modId,
                        name: modId,
                        type: 'kernel',
                        status: 'registered',
                        instance: null,
                        version: '1.0.0',
                        capabilities: [],
                        config: {},
                        path: join(kernelPath, entry.name)
                    });
                }
            } catch {}
        }
    }

    /**
     * 注册已有实例或元数据（兼容原有 API）。
     * 注意：若需要惰性实例化，使用 registerFactory()。
     */
    register(moduleDef) {
        const mod = {
            id: moduleDef.id,
            name: moduleDef.name || moduleDef.id,
            type: moduleDef.type || 'unknown',  // kernel | stable | extension
            status: moduleDef.instance ? 'instantiated' : 'registered',
            instance: moduleDef.instance || null,
            version: moduleDef.version || '1.0.0',
            capabilities: moduleDef.capabilities || [],
            config: moduleDef.config || {},
            path: moduleDef.path
        };
        this.#modules.set(mod.id, mod);
        return mod;
    }

    get(id) { return this.#modules.get(id); }  // 同步：返回元数据条目（非实例）

    has(id) { return this.#modules.has(id); }

    async activate(id) {
        const mod = this.#modules.get(id);
        if (!mod) throw new Error(`[ModuleRegistry] Module not found: "${id}"`);

        // 惰性实例化（如果尚未实例化）
        if (!mod.instance && this.#factories.has(id)) {
            try { await this.getInstance(id); } catch { /* 继续报错路径 */ }
        }

        if (mod.status === 'active') return mod;

        try {
            if (mod.instance?.activate) await mod.instance.activate();
            mod.status = 'active';
            this.#activeModules.add(id);
            this.#emit('module:activated', mod);
            return mod;
        } catch (e) {
            mod.status = 'error';
            mod.error = e.message;
            throw e;
        }
    }

    async deactivate(id) {
        const mod = this.#modules.get(id);
        if (!mod) return;
        if (mod.status !== 'active') return;

        try {
            if (mod.instance?.deactivate) await mod.instance.deactivate();
            mod.status = 'sleeping';
            this.#activeModules.delete(id);
            this.#emit('module:deactivated', mod);
        } catch (e) {
            mod.status = 'error';
            mod.error = e.message;
        }
    }

    async sleep(id) { return this.deactivate(id); }

    async shutdownAll() {
        // console.log(`[ModuleRegistry] Shutting down ${this.#modules.size} registered modules...`);

        for (const [id, mod] of this.#modules.entries()) {
            try {
                if (mod.status === 'active') {
                    await this.deactivate(id);
                }
                if (typeof mod.instance?.shutdown === 'function') {
                    await mod.instance.shutdown();
                }
            } catch (e) {
                mod.status = 'error';
                mod.error = e.message;
            }
        }

        // console.log('[ModuleRegistry] All modules stopped');
    }

    listModules(filter = {}) {
        let mods = Array.from(this.#modules.values());
        if (filter.type) mods = mods.filter(m => m.type === filter.type);
        if (filter.status) mods = mods.filter(m => m.status === filter.status);
        return mods;
    }

    getStats() {
        const byType = { kernel: 0, stable: 0, extension: 0, infrastructure: 0, unknown: 0 };

        for (const mod of this.#modules.values()) {
            const type = mod.type || 'unknown';
            byType[type] = (byType[type] || 0) + 1;
        }

        return {
            total: this.#modules.size,
            factories: this.#factories.size,
            active: this.#activeModules.size,
            byType
        };
    }

    // ================================================================
    // 生命周期事件（私有实现，公开别名）
    // ================================================================
    on(event, handler) {
        if (!this.#lifecycle.has(event)) this.#lifecycle.set(event, []);
        this.#lifecycle.get(event).push(handler);
    }

    #emit(event, data) {
        const handlers = this.#lifecycle.get(event) || [];
        handlers.forEach(h => {
            try { h(data); } catch (e) { console.warn(`[ModuleRegistry] Event handler error: ${e.message}`); }
        });
    }

    count() { return this.#modules.size; }

    getRegisteredIds() {
        return Array.from(this.#modules.keys());
    }

    getFactoryIds() {
        return Array.from(this.#factories.keys());
    }

    // ================================================================
    // 配置驱动初始化（MemoryFactory 模式移植）
    // ================================================================

    /**
     * 根据配置对象批量注册模块工厂。
     *
     * @param {Object} config - 模块配置
     *   {
     *     modules: {
     *       'module-name': {
     *         enabled?: boolean,     // default: true
     *         lazy?: boolean,         // default: true（惰性初始化）
     *         type?: string,          // 'kernel' | 'stable' | 'extension'
     *         importPath?: string,   // 动态 import 路径（默认 kernel/<name>.js）
     *         exportName?: string,   // 导出名（默认取模块名）
     *         config?: Object        // 透传给模块构造函数
     *       }
     *     }
     *   }
     * @param {Object} kernel - Kernel 实例（用于构造模块）
     */
    fromConfig(config, kernel) {
        const mods = config?.modules || {};
        const registered = [];
        const skipped = [];

        for (const [name, cfg] of Object.entries(mods)) {
            if (cfg.enabled === false) {
                skipped.push(name);
                continue;
            }

            const importPath = cfg.importPath || `./${name}.js`;
            const exportName = cfg.exportName || name;
            const modType = cfg.type || 'kernel';
            const lazy = cfg.lazy !== false;   // 默认真

            // 注册工厂函数
            this.registerFactory(name, async () => {
                const m = await import(importPath);
                const Cls = m[exportName] || m.default;
                if (!Cls) throw new Error(`[ModuleRegistry] ${name}: export "${exportName}" not found in ${importPath}`);
                return new Cls(kernel, cfg.config);
            }, {
                type: modType,
                version: cfg.version || '1.0.0',
                capabilities: cfg.capabilities || [],
                config: cfg.config || {}
            });

            registered.push({ name, lazy, path: importPath });
        }

        this.#emit('config:loaded', { registered, skipped, total: registered.length });
        return { registered, skipped };
    }
}
