// hundunos/infrastructure/platform-adapter/windows.js — Windows Adapter v3.0
// Windows 平台适配：Python/Ollama/Node.js 检测、PowerShell 命令执行

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

export class WindowsAdapter {
    constructor() {
        this.platform = 'win32';
        this.shell = 'powershell';
        this.pathSep = '\\';
        this.tempDir = process.env.TEMP || 'C:\\Windows\\Temp';
        this.userDir = process.env.USERPROFILE || 'C:\\Users\\Unknown';
        this.kernel = null;
    }

    _getPlatformConfig() {
        return this.kernel?.config?.system?.platform || {};
    }

    _resolveConfiguredPath(targetPath, fallbackBase = this.kernel?.config?.projectRoot || this.userDir) {
        if (!targetPath) return null;
        return /^[a-zA-Z]:\\|^\\\\/.test(targetPath) ? targetPath : join(fallbackBase, targetPath);
    }

    _getWorkspaceRoot() {
        const configuredWorkspace = this._getPlatformConfig().workspace;
        return this._resolveConfiguredPath(configuredWorkspace, this.kernel?.config?.projectRoot || this.userDir)
            || this.kernel?.config?.workspace
            || join(this.userDir, '.qclaw', 'workspace');
    }

    // ================================================================
    // detect() — 环境检测
    // ================================================================
    async detect() {
        const python = await this._detectPython();
        const [ollama, node, openclaw, powershell, docker] = await Promise.all([
            this._detectOllama(python?.path),
            this._detectNode(),
            this._detectOpenClaw(),
            this._detectPowerShell(),
            this._detectDocker()
        ]);

        const os = await this._getOSVersion();

        return {
            platform: 'win32',
            os,
            arch: process.arch,
            python, ollama, node, openclaw, powershell, docker,
            powershellAvailable: powershell !== null,
            pythonAvailable: python?.available || false,
            ollamaAvailable: ollama?.available || false,
            workspace: this._getWorkspaceRoot()
        };
    }

    async _detectPython() {
        const platformConfig = this._getPlatformConfig();
        const configuredPython = process.env.HUNDUNOS_PYTHON || platformConfig.pythonPath;
        const versions = ['311', '312', '313', '314'];
        const candidates = Array.from(new Set([
            configuredPython,
            'python', 'python3',
            'C:\\Python\\python.exe',
            ...versions.map(version => `C:\\Python${version}\\python.exe`),
            ...versions.map(version => join(this.userDir, 'AppData', 'Local', 'Programs', 'Python', `Python${version}`, 'python.exe'))
        ].filter(Boolean)));

        for (const cmd of candidates) {
            try {
                const { stdout } = await execAsync(
                    `${cmd} --version 2>&1`,
                    { timeout: 5000, windowsHide: true }
                );
                const v = stdout.match(/Python (\d+\.\d+[\d.]*)/)?.[1];
                if (v) {
                    // 检测 pip
                    let packages = [];
                    try {
                        const { stdout: pipOut } = await execAsync(
                            `${cmd} -m pip list --format=freeze 2>&1`,
                            { timeout: 10000, windowsHide: true }
                        );
                        packages = pipOut.split('\n').filter(l => l.trim() && !l.includes('---'));
                    } catch {}

                    return { path: cmd, version: v, available: true, packages };
                }
            } catch {}
        }
        return { available: false, hint: 'Python 未安装，请从 https://python.org 下载' };
    }

    async _detectOllama(pythonPath) {
        const endpoint = process.env.HUNDUNOS_OLLAMA_ENDPOINT
            || this.kernel?.config?.system?.modelRouter?.endpoint
            || 'http://127.0.0.1:11434';
        const pythonCommand = pythonPath || process.env.HUNDUNOS_PYTHON || this._getPlatformConfig().pythonPath || 'python';
        const escapedPython = pythonCommand.includes(' ') ? `"${pythonCommand}"` : pythonCommand;
        const escapedEndpoint = endpoint.replace(/"/g, '\\"');

        try {
            const { stdout } = await execAsync(
                `${escapedPython} -c "import json,sys,urllib.request; r=urllib.request.urlopen(sys.argv[1] + '/api/tags', timeout=3); print(r.read().decode())" "${escapedEndpoint}"`,
                { timeout: 5000, windowsHide: true }
            );
            const data = JSON.parse(stdout);
            return { available: true, endpoint, models: data.models || [] };
        } catch {
            return { available: false, endpoint, hint: 'Ollama 未运行，请运行: ollama serve' };
        }
    }

    async _detectNode() {
        const platformConfig = this._getPlatformConfig();
        const configuredNode = process.env.HUNDUNOS_NODE || platformConfig.nodePath;
        const candidates = Array.from(new Set([
            configuredNode,
            process.execPath,
            'node',
            join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
            join(this.userDir, 'AppData', 'Local', 'nodejs', 'PFiles64', 'nodejs', 'node.exe'),
            join(this.userDir, 'AppData', 'Local', 'Programs', 'nodejs', 'node.exe')
        ].filter(Boolean)));

        for (const cmd of candidates) {
            try {
                const { stdout } = await execAsync(`${cmd} --version 2>&1`, { timeout: 3000, windowsHide: true });
                const v = stdout.trim().replace('v', '');
                if (v) return { path: cmd, version: v, available: true };
            } catch {}
        }
        return { available: false, hint: 'Node.js 不在 PATH 中' };
    }

    async _detectOpenClaw() {
        const platformConfig = this._getPlatformConfig();
        const candidates = Array.from(new Set([
            process.env.HUNDUNOS_OPENCLAW_PATH,
            platformConfig.openClawPath,
            join(process.env.ProgramFiles || 'C:\\Program Files', 'QClaw', 'resources', 'openclaw', 'openclaw.exe'),
            join(this.userDir, 'AppData', 'Local', 'Programs', 'QClaw', 'resources', 'openclaw', 'openclaw.exe')
        ].filter(Boolean)));

        for (const openclawPath of candidates) {
            try {
                if (!existsSync(openclawPath)) continue;
                const { stdout } = await execAsync(`"${openclawPath}" --version 2>&1`, { timeout: 5000, windowsHide: true });
                const v = stdout.match(/(\d+\.\d+\.\d+)/)?.[1];
                return { available: !!v, version: v || 'unknown', path: openclawPath };
            } catch {}
        }

        return { available: false };
    }

    async _detectPowerShell() {
        try {
            const { stdout } = await execAsync(
                `powershell -NoProfile -Command "$PSVersionTable.PSVersion.ToString()"`,
                { timeout: 3000, windowsHide: true }
            );
            return { version: stdout.trim(), available: true };
        } catch { return { available: false }; }
    }

    async _detectDocker() {
        try {
            const { stdout } = await execAsync('docker --version 2>&1', { timeout: 5000, windowsHide: true });
            const v = stdout.match(/Docker version ([\d.]+)/)?.[1];
            return { available: !!v, version: v || 'unknown' };
        } catch { return { available: false }; }
    }

    async _getOSVersion() {
        try {
            const { stdout } = await execAsync(
                `powershell -NoProfile -Command "(Get-CimInstance Win32_OperatingSystem).Caption"`,
                { timeout: 5000, windowsHide: true }
            );
            return stdout.trim();
        } catch { return 'Windows (unknown version)'; }
    }

    // ================================================================
    // 命令执行
    // ================================================================
    buildCommand(cmd) {
        return `powershell -NoProfile -ExecutionPolicy Bypass -OutputFormat Text -Command "${cmd.replace(/"/g, '\\"')}"`;
    }

    async run(cmd, timeout = 30000) {
        const ps = this.buildCommand(cmd);
        return execAsync(ps, { timeout, encoding: 'utf8', windowsHide: true });
    }

    async runBackground(cmd) {
        const ps = this.buildCommand(cmd);
        return spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd], {
            detached: true, stdio: 'ignore', windowsHide: true
        }).unref();
    }

    async fetch(url, options = {}) {
        const timeout = options.timeout || 10000;
        const method = (options.method || 'GET').toUpperCase();
        const headers = options.headers || {};
        const contentType = headers['Content-Type'] || headers['content-type'] || options.contentType;
        const body = typeof options.body === 'string' ? options.body : null;

        const escapedUrl = String(url).replace(/'/g, "''");
        const escapedBody = body ? body.replace(/'/g, "''") : null;
        const headerEntries = Object.entries(headers)
            .filter(([key]) => !/^content-type$/i.test(key))
            .map(([key, value]) => `$headers['${String(key).replace(/'/g, "''")}'] = '${String(value).replace(/'/g, "''")}'`)
            .join('; ');

        let ps = `$headers = @{}; ${headerEntries}`;
        ps += `$params = @{ Uri = '${escapedUrl}'; Method = '${method}'; TimeoutSec = ${Math.ceil(timeout / 1000)}; UseBasicParsing = $true; Headers = $headers }; `;
        if (contentType) {
            ps += `$params['ContentType'] = '${String(contentType).replace(/'/g, "''")}'; `;
        }
        if (escapedBody !== null) {
            ps += `$params['Body'] = '${escapedBody}'; `;
        }
        ps += `$resp = Invoke-WebRequest @params; [Console]::Out.Write($resp.Content)`;

        try {
            const result = await this.run(ps, timeout);
            return { stdout: result.stdout, status: 200 };
        } catch (e) {
            return { stdout: '', status: 0, error: e.message };
        }
    }

    normalizePath(path) {
        return path.replace(/\//g, this.pathSep);
    }

    // ================================================================
    // Python 执行（直接调用）
    // ================================================================
    async runPython(script, args = [], timeout = 60000) {
        const python = this.kernel?.env?.python?.path || 'python';
        const cmd = [python, script, ...args].join(' ');
        return this.run(cmd, timeout);
    }

    // ================================================================
    // Ollama 调用
    // ================================================================
    async callOllama(model, messages, options = {}) {
        if (!this.kernel?.env?.ollama?.available) {
            throw new Error('Ollama not available');
        }

        const body = {
            model: model || this.kernel.env.ollama.models?.[0]?.name || 'qwen2.5:1.5b',
            messages,
            stream: false,
            options: {
                temperature: options.temperature || 0.7,
                num_predict: options.maxTokens || 2048
            }
        };

        const endpoint = process.env.HUNDUNOS_OLLAMA_ENDPOINT
            || this.kernel?.config?.system?.modelRouter?.endpoint
            || 'http://127.0.0.1:11434';

        const { stdout } = await this.fetch(`${endpoint}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            timeout: options.timeout || 120000
        });

        try {
            const resp = JSON.parse(stdout);
            return {
                content: resp.message?.content || '',
                usage: {
                    prompt_tokens: resp.prompt_eval_count || 0,
                    completion_tokens: resp.eval_count || 0,
                    total: (resp.prompt_eval_count || 0) + (resp.eval_count || 0)
                },
                latency: resp.total_duration ? resp.total_duration / 1e9 : 0,
                model: body.model
            };
        } catch (e) {
            throw new Error(`Ollama parse error: ${e.message}, raw: ${stdout.slice(0, 200)}`);
        }
    }
}
