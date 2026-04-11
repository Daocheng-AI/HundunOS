// hundunos/kernel/rust-integration.js — ⚠️ DEPRECATED v3.7
// ⚠️ 已废弃：使用 hundunos/adapters/rust-modules/index.js（RustModules 统一管理器）
// ⚠️ 此文件仅保留用于向后兼容，将在后续版本中移除
// 新增功能请使用：kernel.rust（adapters/rust-modules/index.js）

import { existsSync } from 'fs';
import { join } from 'path';

export class RustIntegration {
    constructor(kernel) {
        this.kernel = kernel;
        this.modules = new Map();
        this.stats = {
            rustEnabled: false,
            jsFallback: false,
            totalCalls: 0,
            rustCalls: 0,
            jsCalls: 0
        };
        
        // Phase 2: vendor/hundunos-rust/ subtree — 优先查找 vendored 版本
        const vendorBinPath = join(__dirname, '..', '..', 'vendor', 'hundunos-rust', 'target', 'release');
        // legacy path — 兼容 Phase 1 旧布局
        const legacyBinPath = join(__dirname, '..', '..', 'hundunos-rust', 'target', 'release');
        this.rustBinPath = existsSync(vendorBinPath) ? vendorBinPath : legacyBinPath;
    }

    async initialize() {
        // review: removed // review: removed console.log('[RustIntegration] Initializing...');
        
        // 检查 Rust CLI 是否存在
        this.stats.rustEnabled = this._checkRustModules();
        
        if (this.stats.rustEnabled) {
            // review: removed // review: removed console.log('[RustIntegration] Rust modules enabled');
            this._initializeModules();
        } else {
            // review: removed // review: removed console.log('[RustIntegration] Rust modules not found, using JS fallback');
            this.stats.jsFallback = true;
        }
    }

    /**
     * 检查 Rust 模块
     */
    _checkRustModules() {
        const modules = [
            'hundunos-tool.exe',
            'hundunos-policy.exe',
            'hundunos-memory.exe',
            'hundunos-router.exe'
        ];
        
        let available = 0;
        for (const module of modules) {
            const path = join(this.rustBinPath, module);
            if (existsSync(path)) {
                available++;
            }
        }
        
        // review: removed // review: removed console.log(`[RustIntegration] Found ${available}/${modules.length} Rust modules`);
        return available >= 1;  // 至少有一个模块可用
    }

    /**
     * 初始化 Rust 模块
     */
    _initializeModules() {
        // Tool Bridge
        const toolBridgePath = join(this.rustBinPath, 'hundunos-tool.exe');
        if (existsSync(toolBridgePath)) {
            this.modules.set('toolBridge', {
                path: toolBridgePath,
                available: true,
                wrapper: null  // 动态加载
            });
        }
        
        // Policy Engine
        const policyPath = join(this.rustBinPath, 'hundunos-policy.exe');
        if (existsSync(policyPath)) {
            this.modules.set('policyEngine', {
                path: policyPath,
                available: true
            });
        }
        
        // Memory Graph
        const memoryPath = join(this.rustBinPath, 'hundunos-memory.exe');
        if (existsSync(memoryPath)) {
            this.modules.set('memoryGraph', {
                path: memoryPath,
                available: true
            });
        }
        
        // Model Router
        const routerPath = join(this.rustBinPath, 'hundunos-router.exe');
        if (existsSync(routerPath)) {
            this.modules.set('modelRouter', {
                path: routerPath,
                available: true
            });
        }
    }

    /**
     * 获取模块状态
     */
    getModuleStatus() {
        const status = {};
        for (const [name, module] of this.modules) {
            status[name] = {
                available: module.available,
                path: module.path,
                inUse: module.available && this.stats.rustEnabled
            };
        }
        return status;
    }

    /**
     * 获取统计
     */
    getStats() {
        return {
            ...this.stats,
            rustCallRate: this.stats.totalCalls > 0 
                ? ((this.stats.rustCalls / this.stats.totalCalls) * 100).toFixed(1) + '%'
                : '0%',
            modules: this.getModuleStatus()
        };
    }

    /**
     * 记录调用
     */
    _recordCall(useRust) {
        this.stats.totalCalls++;
        if (useRust) {
            this.stats.rustCalls++;
        } else {
            this.stats.jsCalls++;
        }
    }
}

export function getRustIntegration(kernel) {
    return new RustIntegration(kernel);
}
