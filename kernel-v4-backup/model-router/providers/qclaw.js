// HundunOS Model Router - QClaw Provider
// 通过 ClientAdapterManager 调用 QClaw

export class QClawProvider {
    constructor(kernel, config = {}) {
        this.kernel = kernel;
        this.config = {
            model: config.model || 'qclaw/modelroute',
            ...config
        };
        this.id = 'qclaw';
        this.name = 'QClaw';
        this.type = 'EXTERNAL';
        this.capabilities = ['text', 'chat', 'streaming'];
    }

    async chat(messages, options = {}) {
        const adapter = this.kernel?.clientAdapterManager?.getActiveAdapter();
        
        if (!adapter) {
            throw new Error('QClaw adapter not available');
        }

        if (adapter.status !== 'connected') {
            await adapter.connect();
        }

        const result = await adapter.chat(messages, options);
        
        if (!result.success) {
            throw new Error(result.error || 'QClaw request failed');
        }

        return {
            content: result.content,
            usage: result.usage,
            latency: result.latency,
            model: result.model,
            provider: 'qclaw'
        };
    }

    async stream(messages, options = {}) {
        // QClaw 当前不支持流式，回退到普通 chat
        const result = await this.chat(messages, options);
        return {
            content: result.content,
            done: true
        };
    }

    getStatus() {
        const adapter = this.kernel?.clientAdapterManager?.getActiveAdapter();
        return {
            available: !!adapter && adapter.status === 'connected',
            status: adapter?.status || 'unavailable',
            model: this.config.model
        };
    }
}

export default QClawProvider;
