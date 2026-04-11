// adapters/rust-modules/health.js
// HundunOS Rust Modules Health Check v4.0
// Phase 3: 支持 JSON-RPC 2.0 (hundunos-core daemon) + process fallback

import { createConnection } from 'net';

/**
 * 独立 RPC 调用（health.js 自用，每模块单独连接）
 * daemon 每个 TCP 连接只处理一个请求后退出进程，所以每次都用新连接。
 */
function _rpcDaemon(module, method, params, tcpPort = 38082) {
  return new Promise((resolve, reject) => {
    const conn = createConnection({ host: '127.0.0.1', port: tcpPort });
    let settled = false;
    let timer;

    const cleanup = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        try { conn.destroy(); } catch (_) {}
      }
    };

    timer = setTimeout(() => {
      console.error(`[_rpcDaemon] timeout: ${module}/${method}`);
      cleanup();
      reject(new Error(`Timeout: ${module}/${method}`));
    }, 8000);

    conn.on('connect', () => {
      const id = Date.now() % 100000;
      const req = JSON.stringify({ jsonrpc: '2.0', id, module, method, params }) + '\n';
      conn.write(req, err => {
        if (err) { cleanup(); reject(err); }
      });
    });

    let buf = '';
    // Daemon keeps connection open after sending response.
    // Close the client side immediately after receiving data to force daemon process exit.
    conn.on('data', chunk => {
      buf += chunk.toString();
      cleanup(); // destroy → daemon gets FIN → child processes exit cleanly
      if (!buf.trim()) { reject(new Error(`Empty: ${module}/${method}`)); return; }
      try {
        const line = buf.trim().split('\n').filter(Boolean).pop();
        resolve(line ? JSON.parse(line) : null);
      } catch (e) {
        reject(new Error(`Parse: ${e.message} | buf=${buf.slice(0,200)}`));
      }
    });

    conn.on('error', e => { cleanup(); reject(e); });
  });
}

/**
 * 健康检查：检测所有 Rust 模块是否可用
 * Phase 3 优先通过 hundunos-core daemon (JSON-RPC) 检查，
 * daemon 不可用时降级到各模块 binary 直接健康检查。
 *
 * @param {RustTransport} transport
 * @returns {Promise<{allHealthy: boolean, modules: object, timestamp: number, transport?: string}>}
 */
export async function checkRustHealth(transport) {
  const modules = ['tool', 'memory', 'router', 'policy', 'scientist'];
  const results = {};
  let allHealthy = true;

  for (const module of modules) {
    try {
      const result = await _checkModuleHealth(transport, module);
      results[module] = result;
      if (result.status !== 'healthy') allHealthy = false;
    } catch (e) {
      results[module] = { status: 'unhealthy', error: e.message, fallback: 'js' };
      allHealthy = false;
    }
  }

  return { allHealthy, modules: results, timestamp: Date.now() };
}

/**
 * 单模块健康检查
 * @param {RustTransport} transport
 * @param {string} module
 */
async function _checkModuleHealth(transport, module) {
  // Module → (method, params) for JSON-RPC / native request
  const commands = {
    tool:      { method: 'get_stats',  params: {} },
    memory:    { method: 'get_stats',  params: {} },
    router:    { method: 'get_stats',  params: {} },
    policy:    { method: 'get_policy', params: {} },
    scientist: { method: 'journal',    params: {} },  // scientist has no get_stats
  };

  const cmd = commands[module];
  if (!cmd) return { status: 'unknown', fallback: 'js' };

  try {
    // JSON-RPC 2.0 via daemon
    // health.js creates a fresh TCP connection for each module (daemon is single-request)
    // Protocol: { jsonrpc:"2.0", id, module, method, params } → { jsonrpc:"2.0", id, result|error }
    const resp = await _rpcDaemon(module, cmd.method, cmd.params, transport.tcpPort);
    if (!resp || resp === null) {
      return { status: 'degraded', error: 'Empty response', fallback: 'js' };
    }
    // Module inner responses (e.g. tool, policy): {success, data, error}
    if (typeof resp.success === 'boolean') {
      if (!resp.success) {
        return { status: 'degraded', error: resp.error || 'Module returned success:false', fallback: 'js' };
      }
      return { status: 'healthy', transport: 'daemon', data: resp.data || resp };
    }
    // Plain stats responses (e.g. memory-graph, model-router, scientist get_stats): valid object
    return { status: 'healthy', transport: 'daemon', data: resp };
  } catch (e) {
    // Fallback: try individual binary directly (process mode)
    return _checkProcessHealth(transport, module, cmd);
  }
}

async function _checkProcessHealth(transport, module, cmd) {
  const nativeCommands = {
    tool:      { action: 'GetStats' },
    memory:    { GetStats: {} },
    router:    { GetStats: {} },
    policy:    { GetPolicy: {} },
    scientist: { Journal: { task_id: '' } },  // requires task_id but ok for health check
  };

  const binaryMap = {
    tool: 'hundunos-tool.exe',
    memory: 'hundunos-memory.exe',
    router: 'hundunos-router.exe',
    policy: 'hundunos-policy.exe',
    scientist: 'hundunos-scientist.exe',
  };

  if (!transport.binaryRoot) {
    return { status: 'unhealthy', error: 'No binary root configured', fallback: 'js' };
  }

  const binaryPath = `${transport.binaryRoot}/${binaryMap[module]}`;

  try {
    const resp = await transport.sendProcess(binaryPath, nativeCommands[module]);
    if (resp && resp.success !== false) {
      return { status: 'healthy', transport: 'process', binary: binaryPath };
    }
    return { status: 'degraded', error: resp?.error, fallback: 'js' };
  } catch (e) {
    return { status: 'unhealthy', error: e.message, fallback: 'js', binary: binaryPath };
  }
}

export async function checkModuleHealth(transport, moduleName) {
  return _checkModuleHealth(transport, moduleName);
}

export default { checkRustHealth, checkModuleHealth };

