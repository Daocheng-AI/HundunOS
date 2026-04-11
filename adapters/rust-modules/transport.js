// adapters/rust-modules/transport.js
// HundunOS Rust Modules — Unified Transport Layer v4.0
// 三层传输：Unix Socket (Linux/macOS) → TCP:38082 (Windows) → Child Process
//
// Phase 3 交付物：hundunos-core 统一守护进程支持
// 构建：cargo build --release --bin hundunos-core
// 启动：HUNDUNOS_TCP_PORT=38082 ./target/release/hundunos-core
//
// JSON-RPC 2.0 协议（对齐 rust-api-contract.md）：
//   { "jsonrpc": "2.0", "id": 1, "module": "tool", "method": "execute", "params": {...} }

import { createConnection } from 'net';
import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const DEFAULT_TCP_PORT = 38082;
const ENV_SOCKET   = 'HUNDUNOS_SOCKET';
const ENV_TCP      = 'HUNDUNOS_TCP_PORT';
const ENV_DAEMON   = 'HUNDUNOS_DAEMON';  // 'auto' | 'always' | 'never'
const ENV_BINARY   = 'HUNDUNOS_BINARY_ROOT';

export const RPC_ERRORS = {
    E_PARSE:     -32700,
    E_INVALID:   -32600,
    E_NOT_FOUND: -32601,
    E_TIMEOUT:   -32001,
    E_PANIC:     -32002,
    E_NO_MODULE: -32003,
    E_TRANSPORT: -32004,
    E_MEMORY:    -32005,
};

export class RpcError extends Error {
    constructor(code, message, data = null) {
        super(`[RPC ${code}] ${message}`);
        this.name = 'RpcError';
        this.code = code;
        this.data = data;
        this.isTimeout  = code === RPC_ERRORS.E_TIMEOUT;
        this.isNotFound = code === RPC_ERRORS.E_NOT_FOUND;
        this.isPanic    = code === RPC_ERRORS.E_PANIC;
    }
}

export class RustTransport {
    constructor(options = {}) {
        this.tcpPort    = options.tcpPort    || parseInt(process.env[ENV_TCP]  || String(DEFAULT_TCP_PORT));
        this.daemonMode = options.daemonMode  || process.env[ENV_DAEMON]        || 'auto';
        this.binaryRoot = options.binaryRoot  || process.env[ENV_BINARY]        || this._detectBinaryRoot();
        this.timeout    = options.timeout     || 60_000;

        this.mode   = null;
        this._conn   = null;
        this._reader = null;
        this._id    = 0;
        this._pending = new Map();
    }

    async connect() {
        if (this.daemonMode === 'never') {
            this.mode = 'process';
            return { mode: 'process', connected: true };
        }
        const connected = await this._tryTcp();
        if (connected) {
            this.mode = 'tcp';
            return { mode: 'tcp', connected: true };
        }
        this.mode = 'process';
        return { mode: 'process', connected: true };
    }

    async send(module, method, params = {}) {
        if (!this.mode) await this.connect();
        const id  = ++this._id;
        const req = { jsonrpc: '2.0', id, module, method, params };
        if (this.mode === 'tcp') return this._sendOneway(req);
        throw new Error(`process mode: use sendProcess() for module=${module} method=${method}`);
    }

    /**
     * 一次请求一个新鲜 TCP 连接。
     * Daemon (hundunos-core) 处理完一个请求后，继续在同连接上等待下一行，
     * 不会主动关闭连接。所以必须由客户端主动关闭连接才能让 Daemon 退出读取循环。
     * 这与 health.js 的 _rpcDaemon 模式一致。
     */
    _sendOneway(req) {
        return new Promise((resolve, reject) => {
            const conn = createConnection({ host: '127.0.0.1', port: this.tcpPort });
            let settled = false;
            let buf = '';

            const timer = setTimeout(() => {
                cleanup();
                reject(new RpcError(RPC_ERRORS.E_TIMEOUT, `Request ${req.id} timed out after ${this.timeout}ms`));
            }, this.timeout);

            const cleanup = () => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    try { conn.destroy(); } catch (_) {}
                }
            };

            conn.on('connect', () => {
                conn.setNoDelay(true); // 禁用 Nagle，立即发送
                const reqStr = JSON.stringify(req) + '\n';
                conn.write(reqStr, err => {
                    if (err) { cleanup(); reject(new RpcError(RPC_ERRORS.E_TRANSPORT, `Write: ${err.message}`)); }
                });
            });

            conn.on('data', chunk => {
                buf += chunk.toString();
                cleanup(); // 收到数据立即关闭连接 → Daemon 收到 FIN，退出 read_line 循环
                if (!buf.trim()) { reject(new RpcError(RPC_ERRORS.E_PARSE, `Empty response`)); return; }
                try {
                    const line = buf.trim().split('\n').filter(Boolean).pop();
                    const resp = JSON.parse(line);
                    const p = this._pending.get(resp.id);
                    if (p) { clearTimeout(p.timer); this._pending.delete(resp.id); p[resp.error ? 'reject' : 'resolve'](resp.error ? new RpcError(resp.error.code, resp.error.message, resp.error.data) : resp.result); }
                    // oneway 模式：直接返回 result
                    resolve(resp.result);
                } catch (e) {
                    reject(new RpcError(RPC_ERRORS.E_PARSE, `Parse: ${e.message} | buf=${buf.slice(0, 200)}`));
                }
            });

            conn.on('error', e => { cleanup(); reject(new RpcError(RPC_ERRORS.E_TRANSPORT, e.message)); });
            conn.on('close', () => { /* ignore graceful close */ });
        });
    }

    /** Low-level child process call (used by individual adapters in process mode). */
    sendProcess(binaryPath, nativeReq) {
        return new Promise((resolve, reject) => {
            if (this.daemonMode === 'always') {
                reject(new Error('Daemon mode enforced but not connected'));
                return;
            }
            const child = spawn(binaryPath, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
            let stdout = '', stderr = '', settled = false;
            const timer = setTimeout(() => {
                if (!settled) { settled = true; child.kill('SIGKILL'); reject(new RpcError(RPC_ERRORS.E_TIMEOUT, `Process timed out: ${binaryPath}`)); }
            }, this.timeout);
            child.stdout.on('data', d => { stdout += d.toString(); });
            child.stderr.on('data', d => { stderr += d.toString(); });
            child.on('close', code => {
                if (settled) return; settled = true; clearTimeout(timer);
                try {
                    const line = stdout.trim().split('\n').filter(Boolean).pop() || '{}';
                    resolve(JSON.parse(line));
                } catch (e) {
                    reject(new RpcError(RPC_ERRORS.E_PARSE, `Parse error: ${e.message}`, { stdout, stderr, code }));
                }
            });
            child.on('error', e => { if (!settled) { settled = true; clearTimeout(timer); reject(new RpcError(RPC_ERRORS.E_TRANSPORT, e.message)); } });
            child.stdin.write(JSON.stringify(nativeReq) + '\n');
            child.stdin.end();
        });
    }

    async ping()    { return this.send('system', 'ping'); }
    async modules() { return this.send('system', 'modules'); }
    async health()  { return this.send('system', 'health'); }

    async disconnect() {
        if (this._conn) { try { this._conn.destroy(); } catch (_) {} this._conn = null; }
        for (const [, p] of this._pending) { clearTimeout(p.timer); p.reject(new Error('Disconnected')); }
        this._pending.clear();
        this.mode = null;
    }

    status() { return { mode: this.mode, connected: this._conn !== null || this.mode === 'process' }; }

    _tryTcp() {
        return new Promise(resolve => {
            const conn = createConnection({ host: '127.0.0.1', port: this.tcpPort }, () => {
                this._conn = conn;
                conn.setNoDelay(true); // Disable Nagle — send immediately (critical for one-shot protocol)
                this._reader = createInterface({ input: conn, crlfDelay: Infinity });
                this._reader.on('line', line => {
                    try {
                        const resp = JSON.parse(line.trim());
                        const p = this._pending.get(resp.id);
                        if (p) { clearTimeout(p.timer); this._pending.delete(resp.id); p[resp.error ? 'reject' : 'resolve'](resp.error ? new RpcError(resp.error.code, resp.error.message, resp.error.data) : resp.result); }
                    } catch (e) { console.error('[RustTransport] Parse error:', line, e); }
                });
                conn.on('close', () => { try { this._reader?.close(); } catch (_) {} this._reader = null; this._conn = null; });
                resolve(true);
            });
            conn.on('error', () => resolve(false));
            conn.setTimeout(3000, () => { conn.destroy(); resolve(false); });
        });
    }

    _sendConn(req, id) {
        return new Promise((resolve, reject) => {
            if (!this._conn || !this._conn.writable) { reject(new Error('Not connected')); return; }
            const timer = setTimeout(() => { this._pending.delete(id); reject(new RpcError(RPC_ERRORS.E_TIMEOUT, `Request ${id} timed out after ${this.timeout}ms`)); }, this.timeout);
            this._pending.set(id, { resolve, reject, timer });
            this._conn.write(JSON.stringify(req) + '\n', err => {
                if (err) { clearTimeout(timer); this._pending.delete(id); reject(new RpcError(RPC_ERRORS.E_TRANSPORT, `Write error: ${err.message}`)); }
            });
        });
    }

    _detectBinaryRoot() {
        try {
            const __dir = dirname(fileURLToPath(import.meta.url));
            return resolve(__dir, '..', '..', 'vendor', 'hundunos-rust', 'target', 'release');
        } catch { return null; }
    }
}

export default RustTransport;
