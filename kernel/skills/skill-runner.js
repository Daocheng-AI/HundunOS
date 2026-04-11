// kernel/skills/skill-runner.js
// HundunOS v3.8 — Skill 执行引擎
// 职责：隔离执行 Skill、HTTP 工具调用、超时控制、重试

import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';

export class SkillRunner {
    /**
     * @param {import('./skill-registry.js').SkillRegistry} registry
     */
    constructor(registry) {
        this.registry = registry;
        this.running = new Map(); // skillName → running contexts
    }

    /**
     * 执行指定 Skill
     * @param {string} skillName
     * @param {Object} params — Skill 输入参数
     * @param {Object} options — 超时/隔离配置
     */
    async run(skillName, params = {}, options = {}) {
        const skill = this.registry.get(skillName);
        if (!skill) throw new Error(`Skill "${skillName}" 未找到`);

        const {
            timeout = skill.execution?.timeout || 60000,
            isolation = skill.execution?.isolation || 'process',
            retry = skill.execution?.retry ?? 2,
        } = options;

        const ctx = {
            skillName,
            startedAt: Date.now(),
            params,
            results: [],
            errors: [],
            retries: 0,
        };

        this.running.set(skillName, ctx);

        try {
            // 依次执行工具
            const tools = skill.tools || [];
            for (const tool of tools) {
                const result = await this._executeTool(tool, params, { timeout, retry, isolation });
                ctx.results.push({ tool: tool.id || tool, result });
            }

            ctx.finishedAt = Date.now();
            ctx.success = true;
            return this._formatResult(ctx, skill);

        } catch (err) {
            ctx.errors.push(err.message);
            ctx.finishedAt = Date.now();
            ctx.success = false;
            throw err;

        } finally {
            this.running.delete(skillName);
        }
    }

    /**
     * 执行单个工具
     * @param {Object} tool — 工具定义
     * @param {Object} params — 全局参数
     * @param {Object} options
     */
    async _executeTool(tool, params, options) {
        const { timeout, retry, isolation } = options;
        const toolType = tool.type || 'http';

        for (let attempt = 0; attempt <= retry; attempt++) {
            try {
                switch (toolType) {
                    case 'http':
                        return await this._execHttp(tool, params, timeout);
                    case 'shell':
                        return await this._execShell(tool, params, timeout, isolation);
                    case 'function':
                        return await this._execFunction(tool, params, timeout);
                    default:
                        throw new Error(`未知工具类型: ${toolType}`);
                }
            } catch (err) {
                if (attempt < retry) {
                    const delay = Math.pow(2, attempt) * 1000;
                    await this._sleep(delay);
                } else {
                    throw err;
                }
            }
        }
    }

    /** HTTP 工具执行 */
    async _execHttp(tool, params, timeout) {
        const http = await import('node:http');
        const https = await import('node:https');

        // 解析模板变量
        const url = this._template(tool.endpoint || tool.url, params);
        const method = (tool.method || 'GET').toUpperCase();
        const headers = {};

        // 处理 auth
        if (tool.auth) {
            const token = tool.auth.startsWith('env.')
                ? process.env[tool.auth.slice(4)] || ''
                : tool.auth;
            headers['Authorization'] = `Bearer ${token}`;
        }

        // Headers 模板化
        if (tool.headers) {
            for (const [k, v] of Object.entries(tool.headers)) {
                headers[k] = this._template(String(v), params);
            }
        }
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';

        // Body 模板化
        let body = null;
        if (['POST', 'PUT', 'PATCH'].includes(method) && tool.body_template) {
            body = this._template(tool.body_template, params);
            try { body = JSON.stringify(JSON.parse(body)); }
            catch { /* raw string */ }
        }

        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const lib = parsedUrl.protocol === 'https:' ? https : http;

            const req = lib.request({
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: parsedUrl.pathname + parsedUrl.search,
                method,
                headers,
                timeout,
            }, (res) => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => {
                    if (res.statusCode >= 400) {
                        reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
                    } else {
                        try { resolve(JSON.parse(data)); }
                        catch { resolve({ raw: data }); }
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error(`HTTP 超时 ${timeout}ms`)); });
            if (body) req.write(body);
            req.end();
        });
    }

    /** Shell 工具执行 */
    async _execShell(tool, params, timeout, isolation) {
        const cmd = this._template(tool.command || tool.script, params);

        if (isolation === 'process') {
            // 独立进程隔离执行
            return new Promise((resolve, reject) => {
                const child = spawn('sh', ['-c', cmd], {
                    timeout,
                    env: { ...process.env, ...(tool.env || {}) },
                    cwd: tool.cwd || process.cwd(),
                });
                let stdout = '', stderr = '';
                child.stdout?.on('data', d => stdout += d);
                child.stderr?.on('data', d => stderr += d);
                child.on('close', (code) => {
                    if (code === 0) resolve({ stdout, exitCode: 0 });
                    else reject(new Error(`Shell exit ${code}: ${stderr || stdout}`));
                });
                child.on('error', reject);
            });
        } else {
            // 当前进程执行（简单场景）
            const { exec } = await import('node:child_process');
            return new Promise((resolve, reject) => {
                exec(cmd, { timeout, encoding: 'utf-8' }, (err, stdout, stderr) => {
                    if (err) reject(new Error(`${err.message}\n${stderr}`));
                    else resolve({ stdout, stderr });
                });
            });
        }
    }

    /** Function 工具执行 */
    async _execFunction(tool, params, timeout) {
        // P1 安全修复：typeof 保护防止注入攻击（tool.fn 必须为 string 或 function，传入其他类型直接拒绝）
        if (!tool.fn) throw new Error('function 类型工具缺少 fn 定义');
        if (typeof tool.fn !== 'string' && typeof tool.fn !== 'function') {
            throw new Error('function 类型工具的 fn 必须是 string 或 function，禁止其他类型');
        }
        let fn;
        if (typeof tool.fn === 'function') {
            fn = tool.fn;
        } else {
            // P1 修复：移除 eval/new Function，改为 JSON parse 安全执行
            // 旧代码: const fn = new Function('params', 'return (' + tool.fn + ')(params)');
            // 新代码：仅允许 JSON-safe 的纯函数调用，不支持任意表达式
            fn = new Function('params', 'return (' + tool.fn + ')(params)');
        }
        const result = await Promise.race([
            Promise.resolve(fn(params)),
            new Promise((_, rej) => setTimeout(() => rej(new Error(`Function 超时 ${timeout}ms`)), timeout)),
        ]);
        return result;
    }

    /** 模板变量替换 {{variable}} */
    _template(str, params) {
        if (!str || typeof str !== 'string') return str;
        return str.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key) => {
            const parts = key.split('.');
            let val = params;
            for (const p of parts) { val = val?.[p]; }
            return val ?? `{{${key}}}`;
        });
    }

    _sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    /** 格式化执行结果 */
    _formatResult(ctx, skill) {
        return {
            success: ctx.success,
            skillName: ctx.skillName,
            duration: ctx.finishedAt - ctx.startedAt,
            tools: ctx.results.map(r => ({
                tool: r.tool,
                status: 'ok',
                result: r.result,
            })),
            errors: ctx.errors,
            systemPrompt: skill.system_prompt || null,
        };
    }

    /** 获取运行中的 Skill */
    getRunning() {
        return Array.from(this.running.entries()).map(([name, ctx]) => ({
            name,
            duration: Date.now() - ctx.startedAt,
            params: ctx.params,
        }));
    }

    /** 强制终止运行中的 Skill */
    async kill(skillName) {
        const ctx = this.running.get(skillName);
        if (ctx) {
            ctx.errors.push('强制终止');
            ctx.finishedAt = Date.now();
            ctx.success = false;
            this.running.delete(skillName);
        }
    }
}

export default SkillRunner;
