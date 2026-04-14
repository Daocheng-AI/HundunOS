// hundunos/kernel/tracing.js — Tracing Span Infrastructure v1.0
// 参考 Onyx tracing/framework 设计的轻量级追踪系统
// 核心：AsyncLocalStorage 实现的 span 嵌套 + 自动计时

import { AsyncLocalStorage } from 'async_hooks';

// ================================================================
// Span 数据结构
// ================================================================

class Span {
    constructor(name, parentSpan = null, options = {}) {
        this.id = Span._nextId();
        this.name = name;
        this.parentId = parentSpan?.id || null;
        this.status = 'active';
        this.startTime = null;
        this.endTime = null;
        this.durationMs = null;
        this.input = options.input !== undefined ? options.input : null;
        this.output = options.output !== undefined ? options.output : null;
        this.error = null;
        this.attributes = new Map();
        this.events = [];
    }

    static _nextId() {
        return `span_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    setAttribute(key, value) { this.attributes.set(key, value); return this; }

    addEvent(name, attributes = {}) {
        this.events.push({ name, attributes, timestamp: Date.now() });
        return this;
    }

    recordError(error) {
        this.error = { message: error?.message || String(error), name: error?.name || 'Error', stack: error?.stack || null };
        this.status = 'error';
        return this;
    }

    end(options = {}) {
        if (this.status !== 'active') return this;
        this.endTime = Date.now();
        this.durationMs = this.endTime - (this.startTime || this.endTime);
        this.status = options.error ? 'error' : 'ended';
        if (options.output !== undefined) this.output = options.output;
        if (options.error) this.recordError(options.error);
        return this;
    }

    toJSON() {
        return {
            id: this.id, name: this.name, parentId: this.parentId,
            status: this.status, startTime: this.startTime, endTime: this.endTime,
            durationMs: this.durationMs, input: this.input, output: this.output,
            error: this.error, attributes: Object.fromEntries(this.attributes), events: this.events,
        };
    }
}

// ================================================================
// HundunTracer 主类
// ================================================================

export class HundunTracer {
    constructor(options = {}) {
        this.serviceName = options.serviceName || 'hundunos';
        this.enabled = options.enabled !== false;
        this.maxSpans = options.maxSpans || 1000;
        this.spans = [];
        this._als = new AsyncLocalStorage();
        this._activeCount = 0;
    }

    /** 启动顶级追踪 */
    trace(name, options = {}) {
        if (!this.enabled) return { end: () => {}, setAttribute: () => {}, addEvent: () => {}, recordError: () => {}, id: 'disabled' };
        return this._startSpan(name, null, options);
    }

    /** 函数级 span（自动计时 + 异常捕获） */
    async functionSpan(name, fn, options = {}) {
        if (!this.enabled) return fn();
        const span = this._startSpan(name, null, { input: options.input, metadata: options.metadata });
        try {
            const result = await fn(span);
            span.end({ output: options.outputFn ? options.outputFn(result) : undefined });
            return result;
        } catch (err) {
            span.recordError(err);
            span.end({ error: err });
            throw err;
        }
    }

    /** 嵌套 span（自动继承父 span） */
    span(name, options = {}) {
        if (!this.enabled) return { end: () => {}, setAttribute: () => {}, addEvent: () => {}, recordError: () => {}, id: 'disabled' };
        const parent = this._als.getStore()?.currentSpan || null;
        return this._startSpan(name, parent, options);
    }

    _startSpan(name, parentSpan, options = {}) {
        const span = new Span(name, parentSpan, options);
        span.startTime = Date.now();
        this._activeCount++;

        const wrappedEnd = (endOptions = {}) => {
            span.end(endOptions);
            this._activeCount--;
            this._finalizeSpan(span);
            return span;
        };

        const wrappedSpan = {
            id: span.id, name: span.name,
            setAttribute: (k, v) => { span.setAttribute(k, v); return wrappedSpan; },
            addEvent: (name, attrs) => { span.addEvent(name, attrs); return wrappedSpan; },
            recordError: (err) => { span.recordError(err); return wrappedSpan; },
            end: wrappedEnd,
            _span: span,
        };

        this._als.enterWith({ currentSpan: span });
        return wrappedSpan;
    }

    _finalizeSpan(span) {
        this.spans.push(span.toJSON());
        if (this.spans.length > this.maxSpans) this.spans.splice(0, this.spans.length - this.maxSpans);
    }

    getRecentSpans(count = 50) { return this.spans.slice(-count); }

    getSlowSpans(thresholdMs = 1000) {
        return this.spans.filter(s => s.durationMs > thresholdMs)
            .sort((a, b) => b.durationMs - a.durationMs).slice(0, 20);
    }

    clear() { this.spans = []; }

    getStats() {
        const total = this.spans.length;
        const errors = this.spans.filter(s => s.status === 'error').length;
        const totalDuration = this.spans.reduce((sum, s) => sum + (s.durationMs || 0), 0);
        return { total, errors, activeCount: this._activeCount, avgDurationMs: Math.round(total / (total || 1)) };
    }
}

// ================================================================
// 全局 tracer
// ================================================================

let _globalTracer = null;

export function getTracer() {
    if (!_globalTracer) _globalTracer = new HundunTracer();
    return _globalTracer;
}

export function setTracer(tracer) { _globalTracer = tracer; }
