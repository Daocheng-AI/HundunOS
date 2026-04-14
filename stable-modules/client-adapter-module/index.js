/**
 * HundunOS v3.0 - Client Adapter Module
 * 第三方客户端适配器模块 (Stable Module)
 * 
 * 功能:
 * - 管理多个第三方 AI 平台连接 (QClaw, Claude, Poe, etc.)
 * - 提供统一接口供 ModelRouter 调用
 * - 支持动态切换平台
 * - 提供 GUI 配置界面
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _projectRoot = join(__dirname, '..', '..');

// 动态导入，避免静态解析路径截断
let _ClientAdapterManager, _QClawAdapter;

export async function getClientAdapterDeps() {
    if (!_ClientAdapterManager) {
        // Windows ESM 兼容：使用 pathToFileURL 转换绝对路径
        const modulePath = join(_projectRoot, 'kernel', 'client-adapter', 'index.js');
        const moduleURL = pathToFileURL(modulePath).href;
        const mod = await import(moduleURL);
        _ClientAdapterManager = mod.ClientAdapterManager;
        _QClawAdapter = mod.QClawAdapter;
    }
    return { ClientAdapterManager: _ClientAdapterManager, QClawAdapter: _QClawAdapter };
}

export class ClientAdapterModule {
    constructor(kernel) {
        this.kernel = kernel;
        this.manager = null;
        this.config = {
            autoDiscover: true,
            autoConnect: true,
            preferredAdapter: null  // 'qclaw' | null (auto)
        };
    }

    async initialize() {
        // console.log('[ClientAdapterModule] Initializing...');
        
        try {
            const { ClientAdapterManager } = await getClientAdapterDeps();
            this.manager = new ClientAdapterManager(this.kernel);
        } catch (e) {
            console.warn('[ClientAdapterModule] ClientAdapter deps not available:', e.message);
            this.manager = null;
            return;
        }
        
        // 加载用户配置
        const savedConfig = await this.kernel.storage?.get?.('config:clientAdapter');
        if (savedConfig) {
            this.config = { ...this.config, ...savedConfig };
        }
        
        await this.manager.initialize();
        
        // 注册到 ModelRouter 作为提供者
        if (this.kernel.modelRouter) {
            this.registerAsModelProvider();
        }
        
        // console.log('[ClientAdapterModule] Initialized with', this.manager.listAdapters().length, 'adapters');
    }

    /**
     * 注册为 ModelRouter 的提供者
     */
    registerAsModelProvider() {
        const mr = this.kernel.modelRouter;
        
        // 创建虚拟 provider 代理到 ClientAdapterManager
        const clientProvider = {
            id: 'client_adapter',
            name: 'Client Adapter',
            type: 'ADAPTER',
            
            call: async (messages, opts) => {
                return this.manager.chat(messages, opts);
            },
            
            listModels: async () => {
                const adapter = this.manager.getActive();
                if (!adapter) return [];
                return adapter.listModels();
            },
            
            getStatus: () => {
                const adapter = this.manager.getActive();
                return adapter ? adapter.getStatus() : { status: 'disconnected' };
            }
        };
        
        // 添加到 ModelRouter
        mr.providers.set('client_adapter', clientProvider);
        mr.providerInstances.set('client_adapter', clientProvider);
        
        // console.log('[ClientAdapterModule] Registered as model provider');
    }

    /**
     * 获取所有适配器状态 (供 GUI 使用)
     */
    async getAdaptersStatus() {
        return this.manager.listAdapters();
    }

    /**
     * 切换当前适配器
     */
    async switchAdapter(adapterId) {
        const adapter = await this.manager.switchAdapter(adapterId);
        
        // 保存偏好
        this.config.preferredAdapter = adapterId;
        await this.kernel.storage?.put?.('config:clientAdapter', this.config);
        
        return adapter.getStatus();
    }

    /**
     * 获取当前活跃适配器
     */
    getActiveAdapter() {
        const adapter = this.manager.getActive();
        return adapter ? adapter.getStatus() : null;
    }

    /**
     * 手动配置适配器 (供 GUI 使用)
     */
    async configureAdapter(adapterId, config) {
        const AdapterClass = this.getAdapterClass(adapterId);
        if (!AdapterClass) throw new Error(`Unknown adapter: ${adapterId}`);
        
        // 创建新实例并替换
        const newAdapter = new AdapterClass(this.kernel, config);
        this.manager.adapters.set(adapterId, newAdapter);
        
        // 尝试连接
        await newAdapter.connect();
        
        // 如果是第一个或用户指定，设为活跃
        if (!this.manager.activeAdapterId || this.config.preferredAdapter === adapterId) {
            this.manager.activeAdapterId = adapterId;
        }
        
        // 保存配置
        await this.kernel.storage?.put?.(`adapter:${adapterId}:config`, config);
        
        return newAdapter.getStatus();
    }

    getAdapterClass(id) {
        // 异步加载适配器类
        const adapterMap = {
            'qclaw': () => getClientAdapterDeps().then(m => m.QClawAdapter)
        };
        return adapterMap[id] || null;
    }

    async getAdapterClassAsync(id) {
        const loader = {
            'qclaw': async () => (await getClientAdapterDeps()).QClawAdapter
        };
        return loader[id] ? await loader[id]() : null;
    }

    /**
     * 获取适配器的配置表单 Schema (供 GUI 动态渲染)
     */
    getConfigSchema(adapterId) {
        const adapter = this.manager.get(adapterId);
        if (!adapter) return null;
        return adapter.getConfigSchema();
    }

    getStats() {
        return {
            adapters: this.manager.listAdapters(),
            active: this.manager.activeAdapterId,
            config: this.config
        };
    }
}

export default ClientAdapterModule;
