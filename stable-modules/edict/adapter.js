// hundunos/stable-modules/edict/adapter.js — Edict Adapter
// 将现有 Python edict 系统集成到 HundunOS
//
// 关键修复（R1 验证后实施）：
// - 路径修正：使用 edict_cli.py 而非 core.py（core.py 是库，cli 是入口）
// - 命令传递：command 参数通过 argv 传给 CLI（而非静默忽略）
// - 环境隔离：PYTHONPATH 限制导入范围
// - Logger 接入：替代 console.log

import { spawn } from 'child_process';
import { join, resolve, normalize } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { homedir } from 'os';

// 使用 new URL('.', import.meta.url) 确保 __dirname 始终指向本文件所在目录
// 避免动态 import 时 import.meta.url 被解析为调用方路径的问题
const __filename = fileURLToPath(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));

// EDICT_BASE: 指向 C:\Users\Lin\.qclaw\workspace\edict
// adapter.js 位于 hundunos/stable-modules/edict/，EDICT_BASE 是 hundunos 的同级目录
// 路径逻辑（用 join 而非 resolve，避免 resolve 对 .. 的特殊规范化）：
//   adapter → .. → stable-modules/edict → ../.. → stable-modules → ../../.. → hundunos
//   → ../workspace/edict → qclaw/workspace/edict ✅
const EDICT_BASE = join(__dirname, '..', '..', '..', '../workspace/edict');
const EDICT_SCRIPTS = join(EDICT_BASE, 'scripts');

// Edict CLI 支持的命令（与 edict_cli.py main 对齐）
const EDICT_COMMANDS = ['status', 'submit', 'list', 'memorial', 'test', 'upgrade-check', 'refresh'];

export class EdictAdapter {
    constructor(kernel) {
        this.kernel = kernel;
        this.log = kernel?.log || console;
        // Windows Node.js spawn 可能找不到 PATH 中的 python，优先用完整路径
        // 注意：bin/python.exe 是 symlink，spawn 无法跟随；用 pythoncore-3.14-64/python.exe 绕过
        if (process.platform === 'win32') {
            // 按优先级查找：环境变量 > LOCALAPPDATA 下的 pythoncore > PATH 中的 python
            const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
            const pythoncorePath = join(localAppData, 'Python', 'pythoncore-3.14-64', 'python.exe');
            this.pythonPath = process.env.PYTHON_PATH ||
                (existsSync(pythoncorePath) ? pythoncorePath : 'python');
        } else {
            this.pythonPath = process.env.PYTHON_PATH || 'python3';
        }
        // 安全：路径白名单验证
        this.allowedBaseDirs = [
            join(__dirname, '..', '..', '..'),  // hundunos root
            EDICT_BASE,                         // edict workspace
        ];
    }

    async initialize() {
        // 仅在 kernel 提供了明确的 python 路径时才覆盖构造函数中的平台默认值
        if (this.kernel?.env?.python?.path) {
            this.pythonPath = this.kernel.env.python.path;
        }
        this.log.info(`[EdictAdapter] Python: ${this.pythonPath}, EDICT_BASE: ${EDICT_BASE}`);
    }

    /**
     * 安全：验证路径是否在白名单范围内
     */
    _isPathAllowed(targetPath) {
        if (!targetPath) return false;
        const normalized = normalize(resolve(targetPath));
        for (const allowed of this.allowedBaseDirs) {
            if (normalized.startsWith(normalize(allowed))) return true;
        }
        return false;
    }

    /**
     * 执行 edict CLI 命令
     * @param {string} command - CLI 命令（status/submit/list/memorial/test/upgrade-check/refresh）
     * @param {string[]} args - 命令参数
     * @returns {Promise<{code: number, stdout: string, stderr: string}>}
     */
    async runEdict(command = 'status', args = []) {
        // 安全：验证 EDICT_SCRIPTS 在白名单内
        if (!this._isPathAllowed(EDICT_SCRIPTS)) {
            throw new Error(`[EdictAdapter] Security: Scripts path not in whitelist: ${EDICT_SCRIPTS}`);
        }

        // 使用 python -m edict_cli 运行（自动设置 __name__='__main__' + sys.path）
        // cwd=EDICT_SCRIPTS 让 Python 能找到同目录下的其他 .py 模块（upgrade_checker 等）
        const cliArgs = ['-m', 'edict_cli', command, ...args];

        return new Promise((resolve, reject) => {
            // spawn + 参数数组：避免 shell 注入
            // PYTHONPATH：确保 Python 能 import 同目录下的 upgrade_checker 等模块
            const proc = spawn(this.pythonPath, cliArgs, {
                cwd: EDICT_SCRIPTS,
                env: { ...process.env, PYTHONPATH: EDICT_SCRIPTS },
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '', stderr = '';
            proc.stdout.on('data', d => { stdout += d; });
            proc.stderr.on('data', d => { stderr += d; });
            proc.on('close', code => {
                resolve({ code, stdout, stderr });
            });
            proc.on('error', err => {
                this.log.error(`[EdictAdapter] Spawn error: ${err.message}`);
                reject(err);
            });
        });
    }

    /**
     * 快速连接测试
     * @returns {Promise<{connected: boolean, error?: string}>}
     */
    async ping() {
        try {
            // ping → 使用 status 命令，code=0 表示正常
            const result = await this.runEdict('status');
            return { connected: result.code === 0 };
        } catch (e) {
            this.log.warn(`[EdictAdapter] Ping failed: ${e.message}`);
            return { connected: false, error: e.message };
        }
    }

    /**
     * 提交旨意（核心功能）
     * @param {string} message - 用户指令
     * @returns {Promise<{code: number, stdout: string, stderr: string}>}
     */
    async submit(message) {
        if (!message || typeof message !== 'string') {
            throw new Error('[EdictAdapter] submit() requires a non-empty message string');
        }
        // 限制 message 长度，防止异常输入
        const safeMessage = message.slice(0, 10000);
        return this.runEdict('submit', [safeMessage]);
    }

    /**
     * 获取 edict 状态
     * @returns {Promise<{code: number, stdout: string, stderr: string}>}
     */
    async status() {
        return this.runEdict('status');
    }

    /**
     * 列出所有旨意
     * @param {string} [statusFilter] - 按状态过滤
     * @returns {Promise<{code: number, stdout: string, stderr: string}>}
     */
    async list(statusFilter) {
        return this.runEdict('list', statusFilter ? [statusFilter] : []);
    }

    /**
     * 获取适配器状态
     */
    getStatus() {
        const cliPy = join(EDICT_SCRIPTS, 'edict_cli.py');
        return {
            edictBase: EDICT_BASE,
            edictScripts: EDICT_SCRIPTS,
            python: this.pythonPath,
            cliExists: existsSync(cliPy),
        };
    }
}

export default EdictAdapter;
