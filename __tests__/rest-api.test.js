/**
 * RestAPI 安全与功能测试
 * 覆盖: H-01 CORS, H-02 Rate Limiter, H-03 Body Parser, M-01 错误信息泄露
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { RestAPI } from '../shell/rest-api/index.js';

describe('RestAPI Security Tests', () => {

  let api;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    api = new RestAPI({ port: 0, cors: true });
  });

  afterEach(async () => {
    if (api) {
      await api.stop();
      api = null;
    }
    delete process.env.HUNDUNOS_CORS_ORIGINS;
    delete process.env.NODE_ENV;
  });

  // H-01: 生产环境 CORS 必须有明确白名单
  test('H-01: production CORS rejects requests when HUNDUNOS_CORS_ORIGINS not set', async () => {
    process.env.NODE_ENV = 'production';
    const prodApi = new RestAPI({ port: 0, cors: true });

    const response = await new Promise((resolve) => {
      const http = require('node:http');
      const req = http.request({
        hostname: 'localhost',
        port: prodApi.config.port,
        path: '/api',
        method: 'GET',
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.end();
    });

    // Should get 500 because production requires explicit CORS origins
    assert.strictEqual(response.status, 500);
    await prodApi.stop();
  });

  // H-02: Rate Limiter 应限制请求数
  test('H-02: rate limiter blocks requests exceeding limit', async () => {
    const limitedApi = new RestAPI({
      port: 0,
      rateLimit: { windowMs: 60000, max: 2 },
    });

    await limitedApi.start();
    const port = limitedApi.config.port;

    const http = require('node:http');
    const makeReq = () => new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost', port, path: '/api',
        method: 'GET',
      }, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(res.statusCode)); });
      req.end();
    });

    // 第一个请求成功
    const r1 = await makeReq();
    assert.strictEqual(r1, 200);

    // 第二个请求成功
    const r2 = await makeReq();
    assert.strictEqual(r2, 200);

    // 第三个请求被限流
    const r3 = await makeReq();
    assert.strictEqual(r3, 429);

    await limitedApi.stop();
  });

  // H-03: 请求体大小限制
  test('H-03: body parser rejects oversized payload with 413', async () => {
    await api.start();
    const port = api.config.port;

    const http = require('node:http');
    const response = await new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost', port, path: '/api',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      });
      // 发送 2MB 数据（超过 1MB 限制）
      req.write('{"data":"' + 'x'.repeat(2_100_000) + '"}');
      req.end();
    });

    assert.strictEqual(response.status, 413);
    await api.stop();
  });

  // M-01: 错误信息不泄露给客户端
  test('M-01: error responses do not expose internal details', async () => {
    api.post('/test-error', async () => {
      throw new Error('Database connection failed: postgres://localhost:5432/db');
    });

    await api.start();
    const port = api.config.port;

    const http = require('node:http');
    const response = await new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost', port, path: '/test-error',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      });
      req.write('{}');
      req.end();
    });

    assert.strictEqual(response.status, 500);
    const body = JSON.parse(response.body);
    // 必须不包含原始错误详情
    assert.strictEqual(body.error, 'Internal server error');
    assert.ok(!body.error.includes('Database'), 'Should not leak DB details');

    await api.stop();
  });

  // 健康检查路由
  test('health endpoint returns status ok', async () => {
    await api.start();
    const port = api.config.port;

    const http = require('node:http');
    const response = await new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost', port, path: '/health',
        method: 'GET',
      }, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
      });
      req.end();
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.status, 'ok');

    await api.stop();
  });
});
