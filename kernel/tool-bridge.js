// hundunos/kernel/tool-bridge.js — Tool Bridge v3.8
// 将现有 131 个 Python 工具脚本注册为 HundunOS 模块
// v3.8: MemOS v2.0 Stardust 优化移植 — ToolTrajectoryMemory 工具轨迹记忆
// v3.7 Phase 4: 集成 adapters/rust-modules/tool-bridge.js（hundunos-core daemon）
//   - kernel.rustTool 作为主 Rust 后端（TCP:38082，~0ms）
//   - kernel.rustTool 不可用时降级到子进程模式（向后兼容）
//   - Python 工具始终可用（execute() 走 Python，executeRust() 走 Rust）

import { spawn } from 'child_process';
import { join, dirname, isAbsolute, normalize } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class ToolBridge {
    constructor(kernel) {
        this.kernel = kernel;
        this.tools = new Map();    // tool_id -> tool_def
        this.categories = new Map(); // category -> tool_ids[]
        this.projectRoot = kernel?.config?.projectRoot || join(__dirname, '..');
        this.timeout = kernel?.config?.system?.toolBridge?.timeout || 30000;
        this.pythonPath = process.env.HUNDUNOS_PYTHON || kernel?.config?.system?.platform?.pythonPath || 'python';

        // 支持环境变量和 system.json 配置工具路径
        this.toolsDir = this._resolveToolsDir(
            process.env.HUNDUNOS_TOOLS_DIR || kernel?.config?.system?.toolBridge?.toolsDir
        );

        // v3.7 Phase 4: Rust 工具执行后端
        // Phase 3 adapters/rust-modules/tool-bridge.js（优先，TCP:38082）
        // Legacy 子进程 bridge（降级方案，仅 kernel.rustTool 不可用时使用）
        this.rustAdapter = kernel?.rustTool || null;  // 统一适配器（Phase 3）
        this.rustBridge = null;                         // Legacy 子进程 bridge
        this._rustPending = new Map();
        this._rustCmdSeq = 0;
        // 启用条件：env 显式开启 OR config 开启 OR 统一适配器可用
        this._rustEnabled = process.env.HUNDUNOS_RUST_BRIDGE === '1' ||
                            kernel?.config?.system?.toolBridge?.useRust === true ||
                            !!this.rustAdapter;

        // v3.8: ToolTrajectoryMemory — 工具使用轨迹记忆
        this.trajectoryMemory = new ToolTrajectoryMemory({
            maxSize: kernel?.config?.system?.toolBridge?.trajectorySize || 500,
        });
    }

    /**
     * P0 修复：工具目录白名单验证
     * 仅允许 toolsDir 在已知安全路径范围内，防止 env var 注入任意路径
     */
    _isToolsDirAllowed(dir) {
        if (!dir || !existsSync(dir)) return false;
        const normalized = normalize(dir);
        for (const allowed of this._allowedToolsBaseDirs()) {
            if (normalized.startsWith(normalize(allowed))) return true;
        }
        return false;
    }

    _allowedToolsBaseDirs() {
        const workspaceRoot = this.kernel?.config?.workspace || this.projectRoot;
        // 统一使用项目根目录下的 scripts/tools
        return [
            join(this.projectRoot, 'scripts', 'tools'),
            join(this.projectRoot, 'tools'),
            join(workspaceRoot, 'scripts', 'tools'),
            join(workspaceRoot, 'tools'),
        ];
    }

    async initialize() {
        // v3.1: 合并注册 — 硬编码工具 + 文件级发现
        this._registerHardcodedTools();
        this._discoverTools(); // 文件级发现（Hermes 模式）
        if (!existsSync(this.toolsDir)) {
            console.warn('[ToolBridge] Tools directory not found:', this.toolsDir);
        }
        const available = Array.from(this.tools.values()).filter(t => t.available).length;
        console.log(`[ToolBridge] ${this.tools.size} tools (${available} available) in ${this.categories.size} categories`);

        // Phase 4: Rust 执行后端状态
        if (this.rustAdapter) {
            console.log('[ToolBridge] Rust backend: ✅ adapters/rust-modules/tool (hundunos-core daemon)');
        } else if (this._rustEnabled) {
            console.log('[ToolBridge] Rust backend: ⚠️  legacy subprocess mode (no daemon)');
        } else {
            console.log('[ToolBridge] Rust backend: disabled');
        }
    }

    // ================================================================
    // v3.1: 文件级工具自动发现（参考 Hermes tools/registry.py）
    // 扫描 scripts/tools/*.py，从 docstring 解析 YAML frontmatter 元数据
    // ================================================================

    /**
     * 扫描 toolsDir 下所有 .py 文件，自动注册为工具
     * Hermes 模式：文件即工具，metadata 在 docstring 中
     */
    _discoverTools() {
        if (!existsSync(this.toolsDir)) return;

        const files = readdirSync(this.toolsDir).filter(f => f.endsWith('.py') && f !== '__init__.py');
        let discovered = 0;

        for (const file of files) {
            const meta = this._readToolMeta(file);
            if (!meta) continue;

            const toolId = meta.id || file.replace('.py', '');
            // 跳过已硬编码的工具（不重复注册）
            if (this.tools.has(toolId)) continue;

            const tool = {
                id: toolId,
                category: meta.category || 'auto',
                script: file,
                path: this._getToolPath(file),
                available: existsSync(this._getToolPath(file)),
                desc: meta.description || meta.desc || `Auto-discovered: ${file}`,
                args: meta.args || '',
                timeout: meta.timeout || this.timeout,
                // v3.1: 来源标记
                source: 'file',
                metadata: meta,
            };

            this.tools.set(toolId, tool);
            if (!this.categories.has(meta.category || 'auto')) {
                this.categories.set(meta.category || 'auto', []);
            }
            this.categories.get(meta.category || 'auto').push(toolId);
            discovered++;
        }

        if (discovered > 0) {
            console.log(`[ToolBridge] File-level discovery: ${discovered} tools registered from ${this.toolsDir}`);
        }
    }

    /**
     * 解析 Python 文件的 docstring 中的 YAML frontmatter 元数据
     * Hermes 工具注册格式：
     * """HundunOS Tool Name
     * ---
     * id: tool_id
     * category: monitor
     * timeout: 5000
     * ---
     * """
     *
     * 同时支持简化格式：
     * """HundunOS Tool Name
     * Category: monitor
     * Timeout: 5000
     * """
     */
    _readToolMeta(file) {
        try {
            const content = readFileSync(join(this.toolsDir, file), 'utf8');
            const lines = content.split('\n');
            
            // 找 docstring 开始
            const startIdx = lines.findIndex(l => l.trim().startsWith('"""') || l.trim().startsWith("'''"));
            if (startIdx === -1) return null;

            const quoteChar = lines[startIdx].trim().startsWith('"""') ? '"""' : "'''";
            const endIdx = lines.findIndex((l, i) => i > startIdx && l.trim().includes(quoteChar));
            if (endIdx === -1) return null;

            // 提取 docstring 内容
            const docContent = lines.slice(startIdx + 1, endIdx).join('\n');

            // 策略1: YAML frontmatter（--- ... ---）
            const yamlMatch = docContent.match(/^---\n([\s\S]*?)\n---/);
            if (yamlMatch) {
                return this._parseYamlLike(yamlMatch[1]);
            }

            // 策略2: 简化 Key: Value 格式
            const simple = this._parseSimpleFormat(docContent);
            if (simple) return simple;

            // 策略3: 从文件名和首行推断
            return this._inferFromFilename(file, docContent);
        } catch {
            return null;
        }
    }

    /**
     * 解析 YAML-like 格式
     */
    _parseYamlLike(text) {
        const result = {};
        for (const line of text.split('\n')) {
            const m = line.match(/^(\w+):\s*(.*)$/);
            if (m) {
                const key = m[1].toLowerCase();
                const val = m[2].trim();
                if (key === 'timeout') result[key] = parseInt(val) || undefined;
                else result[key] = val || undefined;
            }
        }
        return Object.keys(result).length > 0 ? result : null;
    }

    /**
     * 解析简化格式：Category: xxx / Timeout: xxx
     */
    _parseSimpleFormat(text) {
        const map = {
            'category': 'category', 'cat': 'category',
            'description': 'description', 'desc': 'description',
            'timeout': 'timeout', 'id': 'id',
            'args': 'args',
        };
        const result = {};
        for (const [pattern, key] of Object.entries(map)) {
            const re = new RegExp(`${pattern}:\\s*(.+)`, 'i');
            const m = text.match(re);
            if (m) {
                const val = m[1].trim();
                result[key] = key === 'timeout' ? parseInt(val) : val;
            }
        }
        return Object.keys(result).length > 0 ? result : null;
    }

    /**
     * 从文件名和 docstring 首行推断元数据
     */
    _inferFromFilename(file, docContent) {
        const id = file.replace('.py', '');
        // 从首行提取描述
        const firstLine = docContent.split('\n')[0]?.trim() || id;
        const desc = firstLine.replace(/^HundunOS\s*/i, '').trim() || id;

        // 从文件名推断分类
        let category = 'auto';
        if (id.includes('health') || id.includes('check')) category = 'monitor';
        else if (id.includes('cron') || id.includes('schedule')) category = 'scheduler';
        else if (id.includes('report')) category = 'report';
        else if (id.includes('tool') || id.includes('hub')) category = 'tools';
        else if (id.includes('evolution') || id.includes('evo')) category = 'evolution';
        else if (id.includes('worker') || id.includes('tianwen')) category = 'data';

        return { id, category, description: desc };
    }

    /**
     * v3.1: 硬编码工具注册（保持现有工具的精确控制）
     * 与 _discoverTools() 并行运行，合并到同一 Map
     */
    _registerHardcodedTools() {
        // 核心工具映射表（已有工具不受文件发现影响）
        const toolDefs = [
            // 进化中枢
            { id: 'evolution_hub', category: 'evolution', 
              script: 'intelligence_evolution_hub.py', 
              desc: '智能进化中枢',
              args: '--status',
              source: 'hardcoded' },
            { id: 'auto_evolution', category: 'evolution',
              script: 'auto_evolution.py',
              desc: '自动进化循环',
              args: '',
              source: 'hardcoded' },
              
            // 系统监控
            { id: 'cron_monitor', category: 'monitor',
              script: 'cron_monitor.py',
              desc: '定时任务监控',
              args: '',
              source: 'hardcoded' },
            { id: 'health_check', category: 'monitor',
              script: 'health_check.py',
              desc: '健康检查',
              args: '',
              source: 'hardcoded' },
            { id: 'heartbeat', category: 'monitor',
              script: 'heartbeat_enhanced.py',
              desc: '心跳检测',
              args: '',
              source: 'hardcoded' },
              
            // 工具管理
            { id: 'workbuddy', category: 'tools',
              script: 'workbuddy_launcher.py',
              desc: 'WorkBuddy IDE 启动器',
              args: 'status',
              source: 'hardcoded' },
            { id: 'toolhub', category: 'tools',
              script: 'tool_hub.py',
              desc: '工具调度中枢',
              args: 'list',
              source: 'hardcoded' },
              
            // 报告生成
            { id: 'daily_report', category: 'report',
              script: 'daily_report.py',
              desc: '每日报告',
              args: '',
              source: 'hardcoded' },
            { id: 'weekly_report', category: 'report',
              script: 'weekly_report.py',
              desc: '每周报告',
              args: '',
              source: 'hardcoded' },
              
            // 数据处理
            { id: 'local_worker', category: 'data',
              script: 'local_worker.py',
              desc: '本地工作器',
              args: '',
              source: 'hardcoded' },
            { id: 'tianwen_core', category: 'data',
              script: 'tianwen_core.py',
              desc: '天问核心',
              args: '--status',
              source: 'hardcoded' },
        ];

        for (const def of toolDefs) {
            const tool = {
                ...def,
                path: this._getToolPath(def.script),
                available: this._checkToolExists(def.script)
            };
            this.tools.set(def.id, tool);
            
            if (!this.categories.has(def.category)) {
                this.categories.set(def.category, []);
            }
            this.categories.get(def.category).push(def.id);
        }
    }

    _resolveToolsDir(configuredDir) {
        const workspaceRoot = this.kernel?.config?.workspace || this.projectRoot;
        const candidates = [
            configuredDir,
            join(this.projectRoot, 'scripts', 'tools'),
            join(this.projectRoot, '..', 'scripts', 'tools'),
            join(workspaceRoot, 'scripts', 'tools')
        ]
            .filter(Boolean)
            .map(dir => isAbsolute(dir) ? dir : join(this.projectRoot, dir));

        const resolved = candidates.find(dir => existsSync(dir)) || candidates[0];
        // P0 修复：白名单验证，超出范围的路径强制拒绝
        if (!this._isToolsDirAllowed(resolved)) {
            console.warn(`[ToolBridge] toolsDir "${resolved}" not in whitelist — falling back to first allowed base dir`);
            return this._allowedToolsBaseDirs()[0] || join(this.projectRoot, 'scripts', 'tools');
        }
        return resolved;
    }

    _getToolPath(script) {
        // 禁止 script 包含路径成分，防止 ../ traversal
        if (script && (script.includes('/') || script.includes('\\') || script.startsWith('.'))) {
            throw new Error(`[ToolBridge] Script name with path components rejected: ${script}`);
        }
        const raw = join(this.toolsDir, script);
        // P0: 最终路径必须在 toolsDir 内，防止符号链接绕过
        const resolved = normalize(raw);
        const toolsDirNorm = normalize(this.toolsDir);
        const sep = process.platform === 'win32' ? '\\' : '/';
        if (!resolved.startsWith(toolsDirNorm + sep) && resolved !== toolsDirNorm) {
            throw new Error(`[ToolBridge] Path traversal blocked for script: ${script}`);
        }
        return resolved;
    }

    _checkToolExists(script) {
        try {
            return existsSync(this._getToolPath(script));
        } catch {
            return false;
        }
    }

    // 安全参数解析（替代 split(' ')）
    _parseArgs(args) {
        if (!args) return [];
        if (Array.isArray(args)) return args;
        // 使用引号保护的解析，避免命令注入
        const result = [];
        const match = args.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
        for (const token of match) {
            // 去除首尾引号
            result.push(token.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1'));
        }
        return result;
    }

    // 执行工具
    async execute(toolId, args = '') {
        const tool = this.tools.get(toolId);
        if (!tool) return { success: false, error: `Tool not found: ${toolId}` };
        if (!tool.available) return { success: false, error: `Tool not available: ${toolId}` };

        const pythonPath = this.kernel?.env?.python?.path || this.pythonPath;

        return new Promise((resolve) => {
        const start = Date.now();
        const procArgs = [tool.path];
        const safeArgs = this._parseArgs(args);
        if (safeArgs.length > 0) procArgs.push(...safeArgs);

        const proc = spawn(pythonPath, procArgs, {
            cwd: existsSync(this.toolsDir) ? this.toolsDir : this.projectRoot
        });

        let stdout = '', stderr = '';
        proc.stdout.on('data', d => stdout += d);
        proc.stderr.on('data', d => stderr += d);

        // S-11: Node.js spawn() 不支持 timeout 参数，必须手动管理
        // 用 setTimeout + proc.kill() 实现强制超时，防止僵尸进程
        let settled = false;
        const settle = (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            // v3.8: 记录工具轨迹
            this.trajectoryMemory.record({
                toolId,
                toolName: tool.id,
                args: args || '',
                success: result.success,
                duration: result.latency || Date.now() - start,
                error: result.error || null,
                timestamp: Date.now(),
            });
            resolve(result);
        };
        const timer = setTimeout(() => {
            proc.kill('SIGTERM');
            // 给予短暂宽限后强制 SIGKILL
            setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 500);
            settle({
                success: false,
                error: `Tool execution timed out after ${this.timeout}ms`,
                stdout: stdout.slice(0, 2000),
                stderr: stderr.slice(0, 500),
                exitCode: -1,
                latency: this.timeout
            });
        }, this.timeout);

        proc.on('close', code => {
            settle({
                success: code === 0,
                stdout: stdout.slice(0, 2000),
                stderr: stderr.slice(0, 500),
                exitCode: code,
                latency: Date.now() - start
            });
        });

        });
    };

    /**
     * v3.5: 工具并行执行（参考 Onyx tool_runner.py run_tool_calls）
     * 允许多个工具同时运行，显著减少总延迟
     * @param {Array<{toolId: string, args: string, callId: string}>} calls
     * @returns {Promise<Array<{callId, success, result, latency}>>}
     */
    async executeParallel(calls) {
        if (!calls || calls.length === 0) return [];
        if (calls.length === 1) {
            const r = await this.execute(calls[0].toolId, calls[0].args);
            return [{ callId: calls[0].callId || calls[0].toolId, success: r.success, result: r, latency: r.latency }];
        }

        const pythonPath = this.kernel?.env?.python?.path || this.pythonPath;
        const settled = new Map();

        const runOne = async (call) => {
            const tool = this.tools.get(call.toolId);
            if (!tool || !tool.available) {
                return { callId: call.callId || call.toolId, success: false,
                    result: { success: false, error: `Tool not found or unavailable: ${call.toolId}` }, latency: 0 };
            }

            return new Promise((resolve) => {
                const start = Date.now();
                const procArgs = [tool.path];
                const safeArgs = this._parseArgs(call.args);
                if (safeArgs.length > 0) procArgs.push(...safeArgs);

                const proc = spawn(pythonPath, procArgs, {
                    cwd: existsSync(this.toolsDir) ? this.toolsDir : this.projectRoot
                });

                let stdout = '', stderr = '';
                proc.stdout.on('data', d => stdout += d);
                proc.stderr.on('data', d => stderr += d);

                let done = false;
                const settle = (result) => {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    // v3.8: 记录工具轨迹
                    recordToolCall(call, result.latency, result.success, result.result?.error);
                    resolve(result);
                };
                const timer = setTimeout(() => {
                    proc.kill('SIGTERM');
                    setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 500);
                    settle({ callId: call.callId || call.toolId, success: false,
                        result: { success: false, error: `Tool timed out after ${this.timeout}ms`,
                            stdout: stdout.slice(0, 2000), stderr: stderr.slice(0, 500), exitCode: -1 },
                        latency: this.timeout });
                }, this.timeout);

                proc.on('close', code => {
                    settle({ callId: call.callId || call.toolId, success: code === 0,
                        result: { success: code === 0, stdout: stdout.slice(0, 2000),
                            stderr: stderr.slice(0, 500), exitCode: code },
                        latency: Date.now() - start });
                });
                proc.on('error', e => {
                    settle({ callId: call.callId || call.toolId, success: false,
                        result: { success: false, error: e.message }, latency: Date.now() - start });
                });
            });
        };

        // v3.8: 工具轨迹记录（工具执行前记录，等待结果更新）
        const recordToolCall = (call, latency, success, error) => {
            this.trajectoryMemory.record({
                toolId: call.toolId,
                toolName: call.toolId,
                args: call.args || '',
                success,
                duration: latency,
                error: error || null,
                timestamp: Date.now(),
                parallel: true,
            });
        };
    }

    // v3.8: 限制并发数执行（防止同时启动过多 Python 进程压垮系统）
    async execute(calls) {
        const MAX_CONCURRENT = this.kernel?.config?.system?.toolBridge?.maxConcurrent || 4;
        const results = [];
        for (let i = 0; i < calls.length; i += MAX_CONCURRENT) {
            const batch = calls.slice(i, i + MAX_CONCURRENT);
            const batchResults = await Promise.all(batch.map(runOne));
            results.push(...batchResults);
        }
        return results;
    }

    // 列出工具
    list(category = null) {
        if (category) {
            const ids = this.categories.get(category) || [];
            return ids.map(id => this.tools.get(id));
        }
        return Array.from(this.tools.values());
    }

    // 获取统计
    getStats() {
        return {
            total: this.tools.size,
            available: Array.from(this.tools.values()).filter(t => t.available).length,
            categories: this.categories.size,
            // v3.6: Rust Bridge 统计
            rustBridge: this._rustEnabled ? {
                connected: this.rustBridge !== null,
                binary: this._rustBinaryPath(),
            } : { enabled: false },
            // v3.8: 工具轨迹记忆统计
            trajectory: this.trajectoryMemory.getStats(),
        };
    }

    // ================================================================
    // v3.6: hundunos-rust Tool Bridge 集成
    // 三层命令系统：Shortcuts (+) → API Commands (.) → Raw API
    // 通过 JSON-RPC over stdin/stdout 与 Rust 进程通信
    // ================================================================

    _rustBinaryPath() {
        const candidates = [
            process.env.HUNDUNOS_RUST_BINARY,
            this.kernel?.config?.system?.toolBridge?.rustBinary,
            join(this.projectRoot, '..', 'hundunos-rust', 'target', 'release', 'tool-bridge.exe'),
            join(this.projectRoot, '..', 'hundunos-rust', 'target', 'debug', 'tool-bridge.exe'),
        ];
        for (const p of candidates.filter(Boolean)) {
            if (existsSync(p)) return p;
        }
        return candidates[2]; // 返回默认路径
    }

    async _initRustBridge() {
        if (!this._rustEnabled) return;
        const binaryPath = this._rustBinaryPath();

        // 检查二进制是否存在
        if (!existsSync(binaryPath)) {
            console.warn(`[ToolBridge/Rust] Binary not found at: ${binaryPath}`);
            console.warn('[ToolBridge/Rust] Set HUNDUNOS_RUST_BINARY or build: cargo build --release');
            return;
        }

        return new Promise((resolve, reject) => {
            this.rustBridge = spawn(binaryPath, [], {
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
            });

            let buf = '';
            this.rustBridge.stdout.on('data', (chunk) => {
                buf += chunk.toString();
                let newline;
                while ((newline = buf.indexOf('\n')) !== -1) {
                    const line = buf.slice(0, newline).trim();
                    buf = buf.slice(newline + 1);
                    if (!line) continue;
                    try {
                        const resp = JSON.parse(line);
                        const pending = this._rustPending.get(resp.id);
                        if (pending) {
                            this._rustPending.delete(resp.id);
                            pending.resolve(resp.result || resp);
                        }
                    } catch {}
                }
            });

            this.rustBridge.stderr.on('data', (d) => {
                console.warn(`[ToolBridge/Rust] ${d.toString().trim()}`);
            });

            this.rustBridge.on('error', (e) => {
                console.warn(`[ToolBridge/Rust] Failed to start: ${e.message}`);
                this.rustBridge = null;
                resolve();
            });

            this.rustBridge.on('close', (code) => {
                console.log(`[ToolBridge/Rust] Process exited (code ${code})`);
                this.rustBridge = null;
            });

            // 发送握手
            const id = ++this._rustCmdSeq;
            this._rustPending.set(id, {
                resolve: () => console.log('[ToolBridge/Rust] Connected'),
                reject: (e) => console.warn('[ToolBridge/Rust] Init error:', e),
            });
            this.rustBridge.stdin.write(JSON.stringify({ id, action: 'GetStats' }) + '\n');
            resolve();
        });
    }

    /**
     * v3.7 Phase 4: 通过 Rust bridge 执行命令（支持三层命令解析）
     * 优先使用 kernel.rustTool（Phase 3 adapters/rust-modules），
     * 降级使用 legacy 子进程模式。
     * @param {string} command - 命令（支持 +shortcut / .api_cmd / raw）
     * @param {object} options - { cwd, timeout_ms, env, dry_run }
     */
    async executeRust(command, options = {}) {
        // Phase 4: 优先使用统一适配器（hundunos-core daemon，TCP:38082）
        if (this.rustAdapter) {
            try {
                const result = await this.rustAdapter.execute(command, {
                    cwd: options.cwd || this.projectRoot,
                    timeout: options.timeout_ms || this.timeout,
                    env: options.env,
                    dry_run: options.dry_run || false,
                });
                return {
                    success: result.success ?? true,
                    stdout: result.stdout || result.data?.stdout || '',
                    stderr: result.stderr || '',
                    exit_code: result.exit_code ?? 0,
                    duration_ms: result.duration_ms ?? 0,
                    layer: 'daemon',
                    expanded_command: result.expanded_command || null,
                    side_effects_warning: result.side_effects_warning || null,
                };
            } catch (e) {
                // 适配器失败，降级到 legacy 子进程
                console.warn('[ToolBridge/Rust] Adapter failed, falling back to subprocess:', e.message);
            }
        }

        // Legacy 子进程模式（kernel.rustTool 不可用时的降级方案）
        if (!this.rustBridge) {
            await this._initRustBridge();
            if (!this.rustBridge) {
                return { success: false, error: 'Rust bridge not available (daemon + subprocess both failed)' };
            }
        }

        return new Promise((resolve) => {
            const id = ++this._rustCmdSeq;
            const timeoutMs = options.timeout_ms || this.timeout;

            const timer = setTimeout(() => {
                if (this._rustPending.has(id)) {
                    this._rustPending.delete(id);
                    resolve({ success: false, error: `Rust bridge timeout after ${timeoutMs}ms` });
                }
            }, timeoutMs);

            this._rustPending.set(id, {
                resolve: (result) => {
                    clearTimeout(timer);
                    resolve({
                        success: result.success ?? false,
                        stdout: result.stdout || '',
                        stderr: result.stderr || '',
                        exit_code: result.exit_code ?? -1,
                        duration_ms: result.duration_ms ?? 0,
                        error: result.error || null,
                        truncated: result.truncated ?? false,
                        layer: result.layer || null,
                        expanded_command: result.expanded_command || null,
                        side_effects_warning: result.side_effects_warning || null,
                    });
                },
                reject: (e) => {
                    clearTimeout(timer);
                    resolve({ success: false, error: e.message });
                },
            });

            this.rustBridge.stdin.write(JSON.stringify({
                id,
                action: 'Execute',
                request: {
                    command,
                    cwd: options.cwd || this.projectRoot,
                    timeout_ms: timeoutMs,
                    env: options.env || null,
                    dry_run: options.dry_run || false,
                },
            }) + '\n');
        });
    }

    /**
     * v3.6: Rust bridge dry-run（预览命令解析，不执行）
     */
    async dryRun(command) {
        return this.executeRust(command, { dry_run: true });
    }

    /**
     * v3.7 Phase 4: 获取 Rust 执行统计（优先适配器，降级子进程）
     */
    async rustStats() {
        // Phase 4: 优先统一适配器
        if (this.rustAdapter) {
            try {
                return await this.rustAdapter.getStats();
            } catch (e) {
                console.warn('[ToolBridge/Rust] Stats via adapter failed:', e.message);
            }
        }
        if (!this.rustBridge) return null;
        return new Promise((resolve) => {
            const id = ++this._rustCmdSeq;
            const timer = setTimeout(() => {
                this._rustPending.delete(id);
                resolve(null);
            }, 3000);
            this._rustPending.set(id, { resolve: (r) => { clearTimeout(timer); resolve(r); }, reject: () => resolve(null) });
            this.rustBridge.stdin.write(JSON.stringify({ id, action: 'GetStats' }) + '\n');
        });
    }

    /**
     * 注册工具（供 agent-teams 等模块使用）
     * @param {string} name - 工具名称
     * @param {Object} tool - 工具定义（包含 name, description, call 方法等）
     */
    registerTool(name, tool) {
        if (!name || !tool) return false;
        const id = `agent_${name}`;
        this.tools.set(id, {
            id,
            name: tool.name || name,
            description: tool.description || '',
            category: 'agent',
            available: true,
            handler: tool.call?.bind(tool) || tool.execute?.bind(tool),
            inputSchema: tool.inputSchema || tool.constructor?.inputSchema || null,
        });
        if (!this.categories.has('agent')) {
            this.categories.set('agent', []);
        }
        this.categories.get('agent').push(id);
        return true;
    }
}


// ================================================================
// v3.8: ToolTrajectoryMemory — 工具使用轨迹记忆
// 参考: MemOS/src/memos/memories/textual/tree_text_memory/specialized/tool_trajectory_memory.py
// ================================================================

class ToolTrajectoryMemory {
    constructor(options = {}) {
        this.maxSize = options.maxSize || 500;
        this.trajectories = [];      // 有序数组（最新在末尾）
        this.frequencyMap = new Map(); // toolId → count
        this.successMap = new Map();   // toolId → { success, total }
    }

    /**
     * 记录一次工具调用
     * @param {object} call - { toolId, toolName, args, success, duration, error, timestamp }
     */
    record(call) {
        const entry = {
            id: `traj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            toolId: call.toolId || call.toolName,
            toolName: call.toolName || call.toolId,
            args: call.args || '',
            success: call.success !== false,
            duration: call.duration || 0,
            error: call.error || null,
            timestamp: call.timestamp || Date.now(),
            parallel: call.parallel || false,
        };

        this.trajectories.push(entry);

        // 频率统计
        this.frequencyMap.set(entry.toolId, (this.frequencyMap.get(entry.toolId) || 0) + 1);

        // 成功率统计
        const prev = this.successMap.get(entry.toolId) || { success: 0, total: 0 };
        prev.total++;
        if (entry.success) prev.success++;
        this.successMap.set(entry.toolId, prev);

        // LRU 淘汰
        if (this.trajectories.length > this.maxSize) {
            const evicted = this.trajectories.shift();
            const count = this.frequencyMap.get(evicted.toolId) || 1;
            if (count <= 1) this.frequencyMap.delete(evicted.toolId);
            else this.frequencyMap.set(evicted.toolId, count - 1);
        }
    }

    /** 检索最相似的工具使用轨迹 */
    retrieve(query, topK = 5) {
        const q = query.toLowerCase();
        return this.trajectories
            .slice() // 不修改原数组
            .reverse() // 最新优先
            .filter(t =>
                t.toolId.toLowerCase().includes(q) ||
                (t.args || '').toLowerCase().includes(q) ||
                (t.error || '').toLowerCase().includes(q)
            )
            .slice(0, topK)
            .map(t => ({ ...t }));
    }

    /** 获取最近的轨迹 */
    getRecent(limit = 20) {
        return this.trajectories.slice(-limit);
    }

    /** 获取工具使用频率排行 */
    getFrequencyRanked(topK = 10) {
        return [...this.frequencyMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, topK)
            .map(([toolId, count]) => {
                const stats = this.successMap.get(toolId) || { success: 0, total: 0 };
                return {
                    toolId,
                    count,
                    successRate: stats.total > 0 ? stats.success / stats.total : 0,
                };
            });
    }

    /** 推荐最常用的工具 */
    recommendTools(context, topK = 3) {
        // 基于上下文关键词推荐
        const q = (context || '').toLowerCase();
        const ranked = this.getFrequencyRanked(topK * 2);
        return ranked
            .filter(r => r.successRate > 0.5) // 只推荐成功率 > 50% 的
            .slice(0, topK)
            .map(r => ({
                toolId: r.toolId,
                count: r.count,
                successRate: Math.round(r.successRate * 100) + '%',
                reason: `used ${r.count}x with ${Math.round(r.successRate * 100)}% success`,
            }));
    }

    /** 获取统计 */
    getStats() {
        return {
            total: this.trajectories.length,
            maxSize: this.maxSize,
            uniqueTools: this.frequencyMap.size,
            overallSuccessRate: this._calcOverallSuccessRate(),
        };
    }

    _calcOverallSuccessRate() {
        if (this.trajectories.length === 0) return 0;
        const success = this.trajectories.filter(t => t.success).length;
        return Math.round(success / this.trajectories.length * 100) + '%';
    }
}