// hundunos/infrastructure/message-bus/index.js — MessageBus v3.0
// 发布/订阅 + ACK 可靠消息传递

import { EventEmitter } from 'events';

export class MessageBus extends EventEmitter {
    constructor(kernel) {
        super();
        this.kernel = kernel;
        this.subscriptions = new Map();   // topic → Set<handler>
        this.pendingAcks = new Map();       // messageId → { resolve, reject, timer }
        this.messageId = 0;
        this.stats = { published: 0, received: 0, acked: 0, errors: 0 };
        this.deliveryModes = ['fire-and-forget', 'ack', 'request-response'];
    }

    async initialize() {
        // console.log('[MessageBus] Initialized v3.0');
    }

    // ================================================================
    // 发布/订阅
    // ================================================================
    subscribe(topic, handler) {
        if (!this.subscriptions.has(topic)) {
            this.subscriptions.set(topic, new Set());
        }
        this.subscriptions.get(topic).add(handler);
        return () => this.unsubscribe(topic, handler); // 返回取消订阅函数
    }

    unsubscribe(topic, handler) {
        if (this.subscriptions.has(topic)) {
            this.subscriptions.get(topic).delete(handler);
            if (this.subscriptions.get(topic).size === 0) {
                this.subscriptions.delete(topic);
            }
        }
    }

    // 订阅多个 topic
    subscribeMany(topics, handler) {
        const unsubs = topics.map(t => this.subscribe(t, handler));
        return () => unsubs.forEach(fn => fn());
    }

    // ================================================================
    // 发布
    // ================================================================
    async publish(topic, data, options = {}) {
        const { mode = 'fire-and-forget' } = options;
        this.stats.published++;

        const handlers = this.subscriptions.get(topic);
        if (!handlers || handlers.size === 0) {
            return { delivered: 0, total: 0 };
        }

        const message = {
            id: `msg_${++this.messageId}`,
            topic,
            data,
            timestamp: Date.now(),
            mode
        };

        if (mode === 'request-response') {
            return this._handleRPC(message, handlers);
        }

        // fire-and-forget 或 ack
        const results = await Promise.allSettled(
            Array.from(handlers).map(handler => this._deliver(message, handler, mode))
        );

        const delivered = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        if (failed > 0) this.stats.errors += failed;

        return { delivered, total: handlers.size, messageId: message.id };
    }

    // 广播（跨 topic）
    async broadcast(data, topics = null) {
        if (!topics) topics = Array.from(this.subscriptions.keys());
        const results = await Promise.all(topics.map(t => this.publish(t, data)));
        return results.reduce((acc, r) => ({
            delivered: acc.delivered + (r.delivered || 0),
            topics: acc.topics + 1
        }), { delivered: 0, topics: 0 });
    }

    // ================================================================
    // 带 ACK 的发布
    // ================================================================
    async publishWithAck(topic, data, timeoutMs = 5000) {
        return this.publish(topic, data, { mode: 'ack', timeoutMs });
    }

    async _deliver(message, handler, mode) {
        const timeoutMs = mode === 'ack' ? 5000 : 0;

        const result = await Promise.race([
            Promise.resolve().then(() => handler(message.data, message)),
            timeoutMs > 0 ? new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Handler timeout')), timeoutMs)
            ) : Promise.resolve()
        ]);

        this.stats.received++;
        if (mode === 'ack') this.stats.acked++;

        return result;
    }

    // ================================================================
    // RPC (Request-Response)
    // ================================================================
    async _handleRPC(message, handlers) {
        return new Promise(async (resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingAcks.delete(message.id);
                reject(new Error(`RPC timeout: ${message.topic}`));
            }, 10000);

            this.pendingAcks.set(message.id, { resolve, reject, timer, handlers });

            try {
                const results = await Promise.allSettled(
                    Array.from(handlers).map(h => this._deliver(message, h, 'ack'))
                );
                clearTimeout(timer);
                const ok = results.filter(r => r.status === 'fulfilled');
                this.stats.received += ok.length;
                resolve({ responses: ok.map(r => r.value), count: ok.length });
            } catch (e) {
                clearTimeout(timer);
                reject(e);
            }
        });
    }

    // 响应 RPC
    respond(messageId, data) {
        const pending = this.pendingAcks.get(messageId);
        if (!pending) return false;
        clearTimeout(pending.timer);
        pending.resolve({ data, from: messageId });
        this.pendingAcks.delete(messageId);
        return true;
    }

    // ================================================================
    // 统计
    // ================================================================
    getTopics() {
        return Array.from(this.subscriptions.keys()).map(t => ({
            topic: t,
            subscribers: this.subscriptions.get(t).size
        }));
    }

    getStats() {
        return {
            ...this.stats,
            topics: this.subscriptions.size,
            pendingRPCs: this.pendingAcks.size
        };
    }

    clearStats() {
        this.stats = { published: 0, received: 0, acked: 0, errors: 0 };
    }

    async shutdown() {
        for (const pending of this.pendingAcks.values()) {
            clearTimeout(pending.timer);
        }
        this.pendingAcks.clear();
        this.subscriptions.clear();
    }
}
