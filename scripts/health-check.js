/**
 * HundunOS v3.0 - ESM 健康检查脚本
 * 用途：Docker HEALTHCHECK / k8s readiness probe
 * 替代旧 Dockerfile 中错误的 require('http') 调用
 *
 * 用法：
 *   node scripts/health-check.js
 *   node scripts/health-check.js --verbose
 *
 * 退出码：0 = 健康，1 = 不健康
 */

import http from 'http';
import { exit } from 'process';
import { existsSync } from 'fs';
import { join } from 'path';

const PORT = parseInt(process.env.HUNDUNOS_PORT || '38080', 10);
const HOST = process.env.HUNDUNOS_HOST || 'localhost';
const VERBOSE = process.argv.includes('--verbose');

// 检查 Storage 数据目录是否存在（进程已启动的间接证明）
function checkStorageReady() {
  const storageDir = join(process.cwd(), '.hundunos', 'storage');
  return existsSync(storageDir);
}

// 通过 HTTP 检查 kernel readiness（如果 kernel 暴露了 HTTP 端点）
function checkHttpHealth() {
  return new Promise((resolve) => {
    const req = http.get(`http://${HOST}:${PORT}/health`, (res) => {
      if (VERBOSE) console.log(`[health-check] HTTP ${res.statusCode}`);
      resolve(res.statusCode === 200);
      res.resume(); // 消耗响应体避免内存泄漏
    });
    req.on('error', (err) => {
      if (VERBOSE) console.log(`[health-check] HTTP error: ${err.message}`);
      resolve(false);
    });
    req.setTimeout(5000, () => {
      if (VERBOSE) console.log('[health-check] HTTP timeout');
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  let healthy = false;

  // 优先尝试 HTTP 健康检查（如果 kernel 启动了 HTTP server）
  if (await checkHttpHealth()) {
    if (VERBOSE) console.log('[health-check] HTTP health check PASS');
    healthy = true;
  } else if (checkStorageReady()) {
    // 降级：只要 Storage 目录存在就认为进程存活
    if (VERBOSE) console.log('[health-check] Storage-ready health check PASS');
    healthy = true;
  } else {
    if (VERBOSE) console.log('[health-check] All checks FAILED');
    healthy = false;
  }

  if (VERBOSE) {
    console.log(`[health-check] Result: ${healthy ? 'HEALTHY' : 'UNHEALTHY'}`);
  }

  exit(healthy ? 0 : 1);
}

main();
