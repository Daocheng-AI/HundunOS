/**
 * HundunOS v3.0 - Client Adapter System
 * 第三方客户端适配器系统
 * 
 * 设计目标:
 * - 以第三方客户端身份接入各类 AI 平台 (QClaw, Claude Desktop, Poe, etc.)
 * - 不触碰敏感凭证，通过平台标准接口通信
 * - 统一的管理界面，支持多平台切换
 * - 可插拔架构，易于扩展新平台
 * 
 * 架构:
 *   ClientAdapter (基类)
 *   ├── QClawAdapter      → 接入 QClaw Gateway
 *   ├── ClaudeAdapter     → 接入 Claude Desktop (未来)
 *   ├── PoeAdapter        → 接入 Poe API (未来)
 *   └── CustomAdapter     → 通用 OpenAI 兼容接口
 */

import { EventEmitter } from 'events';

// ============================================================================
// 基类: ClientAdapter
// ============================================================================

export class ClientAdapter extends EventEmitter {
    constructor(kernel, config = {}) {
        super();
        this.kernel = kernel;
        this.id = config.id || this.constructor.name.toLowerCase();
        this.name = config.name || this.id;
        this.version = config.version || '1.0.0';
        this.config = config;
        this.status = 'disconnected'; // disconnected | connecting | connected | error
        this.stats = { requests: 0, tokens: 0, errors: 0, latency: 0 };
        this.capabilities = new Set(['chat']);
    }

    /**
     * 检测平台是否可用 (本地服务是否运行)
     */
    async detect() {
        throw new Error('Subclass must implement detect()');
    }

    /**
     * 连接到平台
     */
    async connect() {
        throw new Error('Subclass must implement connect()');
    }

    /**
     * 断开连接
     */
    async disconnect() {
        this.status = 'disconnected';
        this.emit('disconnected');
    }

    /**
     * 发送聊天请求
     */
    async chat(messages, options = {}) {
        throw new Error('Subclass must implement chat()');
    }

    /**
     * 获取可用模型列表
     */
    async listModels() {
        return [];
    }

    /**
     * 获取适配器状态
     */
    getStatus() {
        return {
            id: this.id,
            name: this.name,
            status: this.status,
            stats: { ...this.stats },
            capabilities: Array.from(this.capabilities)
        };
    }

    /**
     * 获取配置界面 Schema (用于 GUI 动态渲染配置表单)
     */
    getConfigSchema() {
        return {
            fields: []
        };
    }
}

// ============================================================================
// QClaw Adapter - 接入 QClaw Gateway
// ============================================================================

export class QClawAdapter extends ClientAdapter {
    constructor(kernel, config = {}) {
        super(kernel, {
            id: 'qclaw',
            name: 'QClaw',
            version: '3.0.0',
            ...config
        });
        this.gatewayUrl = config.gatewayUrl || 'http://127.0.0.1:28789';
        this.gatewayToken = config.gatewayToken || null;
        this.model = config.model || 'qclaw/modelroute';
        this.capabilities.add('streaming');
    }

    getConfigSchema() {
        return {
            fields: [
                { key: 'gatewayUrl', label: 'Gateway 地址', type: 'url', default: 'http://127.0.0.1:28789' },
                { key: 'model', label: '模型', type: 'select', options: ['qclaw/modelroute'], default: 'qclaw/modelroute' }
            ]
        };
    }

    /**
     * 自动发现本地 QClaw 配置
     */
    static async discover() {
        const { homedir } = await import('os');
        const { join } = await import('path');
        const { readFileSync, existsSync } = await import('fs');
        
        const configPath = join(homedir(), '.qclaw', 'openclaw.json');
        if (!existsSync(configPath)) {
            return null;
        }

        try {
            const raw = readFileSync(configPath, 'utf8');
            const config = JSON.parse(raw);
            
            return {
                available: true,
                gatewayUrl: `http://127.0.0.1:${config.gateway?.port || 28789}`,
                gatewayToken: config.gateway?.auth?.token,
                model: config.agents?.defaults?.model?.primary || 'qclaw/modelroute',
                userId: config.channels?.['wechat-access']?.userId,
                channels: Object.keys(config.channels || {}).filter(k => config.channels[k]?.enabled)
            };
        } catch (e) {
            return { available: false, error: e.message };
        }
    }

    async detect() {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            
            const res = await fetch(`${this.gatewayUrl}/health`, {
                signal: controller.signal
            });
            clearTimeout(timeout);
            
            return res.ok;
        } catch {
            return false;
        }
    }

    async connect() {
        this.status = 'connecting';
        
        // 尝试自动发现配置
        if (!this.gatewayToken) {
            const discovered = await QClawAdapter.discover();
            if (discovered?.available) {
                this.gatewayUrl = discovered.gatewayUrl;
                this.gatewayToken = discovered.gatewayToken;
                this.model = discovered.model;
            }
        }

        const isAvailable = await this.detect();
        if (!isAvailable) {
            this.status = 'error';
            throw new Error('QClaw Gateway 未运行或无法访问');
        }

        this.status = 'connected';
        this.emit('connected', { gatewayUrl: this.gatewayUrl, model: this.model });
        return true;
    }

    async chat(messages, options = {}) {
        if (this.status !== 'connected') {
            await this.connect();
        }

        const start = Date.now();
        this.stats.requests++;

        try {
            const res = await fetch(`${this.gatewayUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.gatewayToken}`
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: messages.map(m => ({ role: m.role, content: m.content })),
                    temperature: options.temperature ?? 0.7,
                    max_tokens: options.max_tokens ?? 2048,
                    stream: false
                })
            });

            if (!res.ok) {
                const err = await res.text();
                throw new Error(`QClaw API error: ${res.status} - ${err}`);
            }

            const data = await res.json();
            const latency = Date.now() - start;
            this.stats.latency += latency;
            this.stats.tokens += data.usage?.total_tokens || 0;

            return {
                success: true,
                content: data.choices?.[0]?.message?.content || '',
                usage: data.usage,
                latency,
                model: this.model,
                provider: 'qclaw'
            };
        } catch (e) {
            this.stats.errors++;
            return { success: false, error: e.message, provider: 'qclaw' };
        }
    }

    async listModels() {
        // QClaw 目前只有 modelroute，但可以通过配置扩展
        return [{
            id: this.model,
            name: 'QClaw ModelRoute',
            provider: 'qclaw',
            capabilities: ['chat', 'streaming']
        }];
    }
}

// ============================================================================
// Client Adapter Manager - 统一管理所有客户端适配器
// ============================================================================

export class ClientAdapterManager extends EventEmitter {
    constructor(kernel) {
        super();
        this.kernel = kernel;
        this.adapters = new Map();      // id → adapter instance
        this.discovered = new Map();    // 自动发现的配置
        this.activeAdapterId = null;
    }

    async initialize() {
        console.log('[ClientAdapterManager] Initializing...');
        
        // 注册内置适配器
        this.register(QClawAdapter);
        
        // 自动发现可用平台
        await this.discoverAll();
        
        // 尝试连接第一个可用平台
        for (const [id, adapter] of this.adapters) {
            const discovered = this.discovered.get(id);
            if (discovered?.available) {
                try {
                    await adapter.connect();
                    this.activeAdapterId = id;
                    console.log(`[ClientAdapterManager] Connected to ${adapter.name}`);
                    break;
                } catch (e) {
                    console.warn(`[ClientAdapterManager] Failed to connect ${id}:`, e.message);
                }
            }
        }
    }

    register(AdapterClass) {
        const adapter = new AdapterClass(this.kernel);
        this.adapters.set(adapter.id, adapter);
        
        adapter.on('connected', (info) => {
            this.emit('adapter:connected', { id: adapter.id, ...info });
        });
        
        adapter.on('disconnected', () => {
            this.emit('adapter:disconnected', { id: adapter.id });
        });
        
        return adapter;
    }

    async discoverAll() {
        // QClaw 自动发现
        const qclawInfo = await QClawAdapter.discover();
        if (qclawInfo) {
            this.discovered.set('qclaw', qclawInfo);
            const adapter = this.adapters.get('qclaw');
            if (adapter && qclawInfo.available) {
                adapter.gatewayUrl = qclawInfo.gatewayUrl;
                adapter.gatewayToken = qclawInfo.gatewayToken;
                adapter.model = qclawInfo.model;
            }
        }
    }

    get(id) {
        return this.adapters.get(id);
    }

    getActive() {
        return this.activeAdapterId ? this.adapters.get(this.activeAdapterId) : null;
    }

    async switchAdapter(id) {
        const adapter = this.adapters.get(id);
        if (!adapter) throw new Error(`Adapter not found: ${id}`);
        
        // 断开当前
        const current = this.getActive();
        if (current) await current.disconnect();
        
        // 连接新的
        await adapter.connect();
        this.activeAdapterId = id;
        
        return adapter;
    }

    listAdapters() {
        return Array.from(this.adapters.values()).map(a => ({
            ...a.getStatus(),
            discovered: this.discovered.get(a.id) || null
        }));
    }

    /**
     * 统一的聊天接口 - 自动路由到当前激活的适配器
     */
    async chat(messages, options = {}) {
        const adapter = this.getActive();
        if (!adapter) {
            return { success: false, error: 'No client adapter available. Please connect to a platform first.' };
        }
        return adapter.chat(messages, options);
    }
}

// ============================================================================
// 导出
// ============================================================================

export default {
    ClientAdapter,
    QClawAdapter,
    ClientAdapterManager
};
