/**
 * kernel/hud/index.js
 * HundunOS 实时 HUD 监控界面
 *
 * 借鉴 OMX omx hud --watch 实时多智能体状态监控
 * 使用纯 ANSI 转义序列（跨平台：Windows/macOS/Linux/SSH 通用）
 * 无外部依赖，直接集成到 Node.js 运行时
 *
 * 使用示例：
 *   const hud = new HundunHUD(kernel);
 *   hud.start();           // 启动 HUD
 *   hud.stop();             // 停止 HUD
 *   hud.refresh();          // 强制刷新
 */

import { EventEmitter } from 'events';

// ANSI 转义序列
const CSI = '\x1b[';
const ESC = '\x1b';
const CLEAR_SCREEN    = CSI + '2J';
const CLEAR_EOL       = CSI + 'K';
const CURSOR_HOME     = CSI + 'H';
const CURSOR_SAVE     = ESC + '7';
const CURSOR_RESTORE  = ESC + '8';
const HIDE_CURSOR     = CSI + '?25l';
const SHOW_CURSOR     = CSI + '?25h';
const BOLD            = CSI + '1m';
const DIM             = CSI + '2m';
const RESET           = CSI + '0m';
const UNDERLINE       = CSI + '4m';

// 颜色
const C = {
  RED:     CSI + '31m',
  GREEN:   CSI + '32m',
  YELLOW:  CSI + '33m',
  BLUE:    CSI + '34m',
  MAGENTA: CSI + '35m',
  CYAN:    CSI + '36m',
  WHITE:   CSI + '37m',
  GRAY:    CSI + '90m',
  // 亮色
  BRIGHT_RED:     CSI + '91m',
  BRIGHT_GREEN:   CSI + '92m',
  BRIGHT_YELLOW:  CSI + '93m',
  BRIGHT_BLUE:   CSI + '94m',
  BRIGHT_MAGENTA:CSI + '95m',
  BRIGHT_CYAN:   CSI + '96m',
};

// 特殊字符（Unicode Box Drawing）
const BOX = {
  TL: '┌', TR: '┐', BL: '└', BR: '┘',
  H:  '─', V: '│',
  TT: '├', BT: '┤',
  CROSS: '┼',
};

// 状态图标
const ICON = {
  OK:     '✓',
  ERR:    '✗',
  WARN:   '⚠',
  RUN:    '▶',
  IDLE:   '○',
  DONE:   '●',
  KILL:   '■',
  MEM:    '◆',
  CPU:    '▲',
  NET:    '◇',
};

/**
 * HUD 颜色主题
 */
const THEME = {
  header:   C.BRIGHT_CYAN,
  subhead:  C.CYAN,
  success:  C.GREEN,
  error:    C.RED,
  warning:  C.YELLOW,
  info:     C.BLUE,
  dim:      C.GRAY,
  bright:   C.WHITE,
  accent:   C.MAGENTA,
  box:      C.BRIGHT_BLUE,
  label:    C.BRIGHT_YELLOW,
  value:    C.BRIGHT_GREEN,
};

/**
 * 单行状态行
 */
class StatusLine {
  constructor(label, value = '', color = C.GRAY, icon = '') {
    this.label = label;
    this.value = value;
    this.color = color;
    this.icon = icon;
  }

  toString(width = 40) {
    const label = `${this.icon}${this.label}`;
    const padding = width - this._ansiLen(label) - this._ansiLen(this.value);
    return `${label}${''.padEnd(Math.max(1, padding), ' ')}${this.value}`;
  }

  _ansiLen(str) {
    return str.replace(/\x1b\[[0-9;]*m/g, '').length;
  }
}

/**
 * HundunHUD — 实时 HUD 监控界面
 */
export class HundunHUD extends EventEmitter {
  constructor(kernel, config = {}) {
    super();

    this.kernel = kernel;
    this.config = {
      refreshInterval: config.refreshInterval ?? 1500,  // ms
      width: config.width ?? 100,
      height: config.height ?? 40,
      showWarnings: config.showWarnings ?? true,
      theme: THEME,
      ...config,
    };

    /** HUD 状态快照 */
    this.state = {
      kernel: null,
      workers: [],
      toolCalls: [],
      modelCost: { promptTokens: 0, completionTokens: 0, cost: 0 },
      memory: { used: 0, capacity: 0, hitRate: 0 },
      pipeline: null,
      health: null,
      alerts: [],
      runtime: { startTime: Date.now(), uptime: 0 },
    };

    /** 事件缓冲区（最近 30 条） */
    this._eventBuffer = [];
    this._maxBuffer = 30;

    /** HUD 运行状态 */
    this._running = false;
    this._intervalId = null;
    this._stdout = process.stdout;

    // 绑定内核事件
    this._bindKernelEvents();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 生命周期
  // ─────────────────────────────────────────────────────────────────────────────

  /** 启动 HUD */
  start() {
    if (this._running) return;
    this._running = true;

    // 隐藏光标
    this._write(HIDE_CURSOR);

    // 初始渲染
    this._render();

    // 定时刷新
    this._intervalId = setInterval(() => {
      this._updateSnapshot();
      this._render();
    }, this.config.refreshInterval);

    console.log(`[HUD] Started — ${this.config.refreshInterval}ms refresh`);
  }

  /** 停止 HUD */
  stop() {
    if (!this._running) return;
    this._running = false;

    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }

    // 恢复光标 + 清屏
    this._write(CLEAR_SCREEN + CURSOR_HOME + SHOW_CURSOR);
    console.log('[HUD] Stopped');
  }

  /** 强制刷新 */
  refresh() {
    this._updateSnapshot();
    this._render();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 事件订阅
  // ─────────────────────────────────────────────────────────────────────────────

  _bindKernelEvents() {
    if (!this.kernel?.on) return;

    const on = (event, handler) => {
      this.kernel.on(event, (data) => {
        this._eventBuffer.unshift({ event, data, ts: Date.now() });
        if (this._eventBuffer.length > this._maxBuffer) {
          this._eventBuffer.pop();
        }
        if (typeof handler === 'function') handler(data);
        this.refresh();
      });
    };

    // Kernel 事件
    on('kernel:ready',    d => { this.state.kernel = 'ready'; });
    on('kernel:error',    d => { this.state.kernel = `error: ${d?.message}`; this._alert('Kernel Error', d?.message, 'error'); });

    // 团队事件
    on('team:created',   d => { this.state.workers.push({ name: d?.name, status: 'idle', startedAt: Date.now() }); });
    on('team:task:start', d => { this._workerStatus(d?.member || d?.name, 'running'); });
    on('team:task:complete', d => { this._workerStatus(d?.member || d?.name, 'done'); });
    on('team:task:error', d => { this._workerStatus(d?.member || d?.name, 'error'); this._alert('Worker Error', d?.reason, 'warning'); });

    // Pipeline 事件
    on('pipeline:start',  d => { this.state.pipeline = { status: 'running', id: d?.pipelineId, stage: 0 }; });
    on('stage:start',     d => { if (this.state.pipeline) this.state.pipeline.stage = d?.index; });
    on('stage:complete', d => { if (this.state.pipeline) { this.state.pipeline.lastStage = d?.stage?.name; } });
    on('pipeline:complete', d => {
      if (this.state.pipeline) {
        this.state.pipeline.status = d?.result?.success ? 'success' : 'failed';
      }
    });

    // 工具调用事件
    on('tool:call',  d => {
      this.state.toolCalls.unshift({
        tool: d?.tool_name || d?.name || 'unknown',
        args: d?.args ? JSON.stringify(d.args).slice(0, 60) : '',
        ts: Date.now(),
        status: 'ok',
      });
      if (this.state.toolCalls.length > 20) this.state.toolCalls.pop();
    });

    // 健康检查
    on('health:report', d => { this.state.health = d; });

    // 告警
    on('alert', d => { this._alert(d?.title || 'Alert', d?.message, 'warning'); });
  }

  _workerStatus(name, status) {
    const w = this.state.workers.find(w => w.name === name);
    if (w) w.status = status;
  }

  _alert(title, message, level = 'info') {
    this.state.alerts.unshift({ title, message, level, ts: Date.now() });
    if (this.state.alerts.length > 5) this.state.alerts.pop();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 快照更新
  // ─────────────────────────────────────────────────────────────────────────────

  _updateSnapshot() {
    this.state.runtime.uptime = Math.floor((Date.now() - this.state.runtime.startTime) / 1000);

    // 从 HealthMonitor 读取
    if (this.kernel?.healthMonitor) {
      try {
        const latest = this.kernel.healthMonitor.history?.[0];
        if (latest) this.state.health = latest;
      } catch (_) {}
    }

    // 从 ModelRouter 读取消耗
    if (this.kernel?.modelRouter) {
      try {
        const mr = this.kernel.modelRouter;
        if (mr.stats) {
          this.state.modelCost = {
            promptTokens: mr.stats.totalPromptTokens || 0,
            completionTokens: mr.stats.totalCompletionTokens || 0,
            cost: mr.stats.totalCost || 0,
          };
        }
        if (mr.memory) {
          this.state.memory.used = mr.memory.used || 0;
          this.state.memory.capacity = mr.memory.capacity || 0;
          this.state.memory.hitRate = mr.memory.hitRate || 0;
        }
      } catch (_) {}
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 渲染
  // ─────────────────────────────────────────────────────────────────────────────

  _render() {
    const W = this.config.width;
    const T = this.config.theme;
    const t = (color, text) => `${color}${text}${T.dim}`; // dim 返回默认色

    let out = CLEAR_SCREEN + CURSOR_HOME;

    // ── 顶栏 ──────────────────────────────────────────────────────────────────
    out += this._renderHeader(W, T);

    // ── 左栏：Workers + Pipeline ─────────────────────────────────────────────
    const leftWidth = Math.floor(W * 0.45);
    out += this._renderWorkers(leftWidth, T);

    // ── 右栏：健康 + 资源 + 告警 ─────────────────────────────────────────────
    const rightWidth = W - leftWidth - 1;
    out += this._renderRightPanel(rightWidth, T);

    // ── 底栏：工具调用日志 ───────────────────────────────────────────────────
    out += this._renderToolLog(W, T);

    // ── 底部信息行 ───────────────────────────────────────────────────────────
    out += this._renderFooter(W, T);

    this._write(out + CURSOR_HOME);
  }

  _renderHeader(W, T) {
    const title = ` HundunOS HUD v3.0 `;
    const padding = W - this._ansiLen(title) - this._ansiLen(T.dim) * 2 - 30;
    const border = BOX.TL + BOX.H.repeat(title.length) + BOX.H.repeat(Math.max(0, padding)) + BOX.TR;

    const uptime = this._formatUptime(this.state.runtime.uptime);
    const kernelStatus = this._statusChip(this.state.kernel || 'booting', T);
    const pipelineStatus = this._statusChip(this.state.pipeline?.status || 'idle', T);

    return (
      `${T.header}${BOX.TL}${BOX.H.repeat(W - 2)}${BOX.TR}\n` +
      `${T.header}${BOX.V}${BOLD}${T.header}  HUNDUNOS HUD v3.0  ${T.dim}实时多智能体监控${RESET}${T.header}${BOX.V}${T.dim}uptime: ${T.value}${uptime}${T.dim}${BOX.V}${T.dim}kernel: ${kernelStatus}${T.dim}${BOX.V}${T.dim}pipeline: ${pipelineStatus}${T.dim}${BOX.V}\n` +
      `${T.header}${BOX.TT}${BOX.H.repeat(W - 2)}${BOX.BT}\n`
    );
  }

  _renderWorkers(W, T) {
    const workers = this.state.workers;
    const pipeline = this.state.pipeline;

    let lines = [];
    // Section header
    lines.push(`${T.accent}${BOX.V}${BOLD}  WORKERS / PIPELINE ${RESET}${T.dim.padEnd(W - 24)}${T.accent}${BOX.V}`);

    // Worker 行
    if (workers.length === 0) {
      lines.push(`${T.dim}${BOX.V}  No active workers ${T.dim.padEnd(W - 20)}${BOX.V}`);
    } else {
      for (const w of workers.slice(0, 8)) {
        const icon = w.status === 'running' ? `${T.warning}${ICON.RUN}` :
                     w.status === 'done'    ? `${T.success}${ICON.DONE}` :
                     w.status === 'error'   ? `${T.error}${ICON.ERR}` :
                                              `${T.dim}${ICON.IDLE}`;
        const name = `${T.value}${w.name.padEnd(12)}`;
        const statusText = w.status.padEnd(8);
        const statusColor = w.status === 'running' ? T.warning :
                            w.status === 'done'    ? T.success :
                            w.status === 'error'   ? T.error :
                                                     T.dim;
        const elapsed = w.startedAt ? `+${Math.floor((Date.now() - w.startedAt) / 1000)}s` : '';
        lines.push(
          `${T.accent}${BOX.V}  ${icon} ${name}${T.dim} ${statusColor}${statusText}${T.dim}${elapsed.padEnd(8)}${T.dim.padEnd(W - 42)}${T.accent}${BOX.V}`
        );
      }
    }

    // Pipeline 进度
    if (pipeline) {
      lines.push(`${T.accent}${BOX.V}${T.dim.padEnd(W - 2)}${BOX.V}`);
      const pStatus = pipeline.status === 'running' ? `${T.warning}▶ RUNNING` :
                       pipeline.status === 'success' ? `${T.success}✓ SUCCESS` :
                       pipeline.status === 'failed'  ? `${T.error}✗ FAILED` :
                                                       `${T.dim}○ IDLE`;
      const pStage = pipeline.lastStage ? `stage: ${T.value}${pipeline.lastStage}` : `stage: ${T.warning}${pipeline.stage + 1}`;
      lines.push(`${T.accent}${BOX.V}  Pipeline ${pStatus}${T.dim} ${pStage}${T.dim.padEnd(W - 46)}${BOX.V}`);
    }

    // 填充到固定高度
    while (lines.length < 14) {
      lines.push(`${T.accent}${BOX.V}${T.dim.padEnd(W - 2)}${T.accent}${BOX.V}`);
    }

    return lines.join('\n') + '\n';
  }

  _renderRightPanel(W, T) {
    const health = this.state.health;
    const cost = this.state.modelCost;
    const memory = this.state.memory;
    const alerts = this.state.alerts;

    let lines = [];

    // ── 健康分数 ──
    const score = health?.overall?.score ?? null;
    const scoreColor = score === null ? T.dim :
                       score >= 80    ? T.success :
                       score >= 60    ? T.warning :
                                         T.error;
    const scoreDisplay = score === null ? `${T.dim}--/100` : `${scoreColor}${score}/100`;
    const scoreLabel = score === null ? '' : `${T.dim}overall`;

    lines.push(
      `${T.accent}${BOX.V}  ${T.label}Health Score${T.dim.padEnd(W - 20)}${scoreDisplay}${T.dim}${scoreLabel}${T.accent}${BOX.V}`
    );

    // ── 各维度 ──
    if (health?.dimensions) {
      const dims = Object.entries(health.dimensions).slice(0, 5);
      for (const [name, dim] of dims) {
        const s = dim.status === 'ok' ? `${T.success}${ICON.OK}` :
                  dim.status === 'warn' ? `${T.warning}${ICON.WARN}` :
                                          `${T.error}${ICON.ERR}`;
        const scoreStr = `${T.value}${String(dim.score).padStart(3)}`;
        const label = name.replace(/_/g, ' ').padEnd(14);
        lines.push(
          `${T.accent}${BOX.V}  ${s} ${T.dim}${label}${T.dim} ${scoreStr}${T.dim}/100  ${T.dim}${BOX.V.padStart(Math.max(0, W - 36))}`
        );
      }
    }

    // 填充空白
    while (lines.length < 7) {
      lines.push(`${T.accent}${BOX.V}${T.dim.padEnd(W - 2)}${T.accent}${BOX.V}`);
    }

    // ── 资源消耗 ──
    lines.push(`${T.accent}${BOX.V}${T.dim.padEnd(W - 2)}${BOX.V}`);
    lines.push(`${T.accent}${BOX.V}  ${T.label}Resource Usage${T.dim.padEnd(W - 18)}${T.accent}${BOX.V}`);

    const promptTok = `${T.value}${(cost.promptTokens || 0).toLocaleString()}`;
    const compTok   = `${T.value}${(cost.completionTokens || 0).toLocaleString()}`;
    const costStr   = `${T.warning}$${(cost.cost || 0).toFixed(4)}`;

    lines.push(
      `${T.accent}${BOX.V}  ${T.dim}Prompt tokens    ${T.dim.padEnd(W - 32)}${promptTok}${T.accent}${BOX.V}`
    );
    lines.push(
      `${T.accent}${BOX.V}  ${T.dim}Completion tokens${T.dim.padEnd(W - 32)}${compTok}${T.accent}${BOX.V}`
    );
    lines.push(
      `${T.accent}${BOX.V}  ${T.dim}Est. cost        ${T.dim.padEnd(W - 32)}${costStr}${T.accent}${BOX.V}`
    );

    // 告警
    if (alerts.length > 0) {
      while (lines.length < 14) {
        lines.push(`${T.accent}${BOX.V}${T.dim.padEnd(W - 2)}${T.accent}${BOX.V}`);
      }
      lines.push(`${T.accent}${BOX.V}${T.dim.padEnd(W - 2)}${BOX.V}`);
      for (const a of alerts.slice(0, 3)) {
        const icon = a.level === 'error' ? `${T.error}${ICON.ERR}` : `${T.warning}${ICON.WARN}`;
        const title = a.title.slice(0, 16).padEnd(16);
        const msg   = a.message?.slice(0, W - 26) || '';
        lines.push(
          `${T.accent}${BOX.V} ${icon} ${T.error}${title}${T.dim} ${msg}${T.dim.padEnd(Math.max(0, W - 26 - msg.length))}${T.accent}${BOX.V}`
        );
      }
    }

    // 填充到固定高度
    while (lines.length < 16) {
      lines.push(`${T.accent}${BOX.V}${T.dim.padEnd(W - 2)}${T.accent}${BOX.V}`);
    }

    // 右栏结束
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.replace(BOX.V + '$', BOX.BT);

    return lines.join('\n') + '\n';
  }

  _renderToolLog(W, T) {
    const calls = this.state.toolCalls.slice(0, 6);
    const totalWidth = W - 2;

    let lines = [];

    // Section separator
    lines.push(`${T.info}${BOX.TT}${BOX.H.repeat(totalWidth)}${BOX.BT}`);

    if (calls.length === 0) {
      lines.push(
        `${T.info}${BOX.V}${T.dim}  Tool Call Log (empty) ${T.dim.padEnd(W - 26)}${T.info}${BOX.V}`
      );
    } else {
      for (const call of calls) {
        const time = new Date(call.ts).toLocaleTimeString('zh-CN', { hour12: false });
        const tool = call.tool.slice(0, 20).padEnd(20);
        const args = call.args.slice(0, Math.max(20, W - 42));
        lines.push(
          `${T.info}${BOX.V} ${T.dim}${time}${RESET} ${T.cyan}${tool}${T.dim} ${args}${T.dim.padEnd(Math.max(0, W - 28 - args.length))}${T.info}${BOX.V}`
        );
      }
    }

    return lines.join('\n') + '\n';
  }

  _renderFooter(W, T) {
    const eventCount = this._eventBuffer.length;
    const kernelVer = 'HundunOS v3.0';
    const buf = `[${this._eventBuffer.slice(0, 3).map(e => e.event).join(', ') || 'no events'}]`;

    return (
      `${T.header}${BOX.BL}${BOX.H.repeat(W - 2)}${BOX.BR}\n` +
      `${T.dim}  ${kernelVer}  ${buf.padEnd(Math.max(0, W - 40))}events: ${T.value}${eventCount}${T.dim}  Refresh: ${T.value}${this.config.refreshInterval}ms${T.dim}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 工具方法
  // ─────────────────────────────────────────────────────────────────────────────

  _write(str) {
    try {
      this._stdout.write(str);
    } catch (_) {}
  }

  _ansiLen(str) {
    return str.replace(/\x1b\[[0-9;]*m/g, '').length;
  }

  _statusChip(status, T) {
    const map = {
      ready:   { text: 'ready',   color: T.success },
      booting: { text: 'booting', color: T.warning },
      running: { text: 'running',  color: T.warning },
      idle:    { text: 'idle',    color: T.dim },
      success: { text: 'success', color: T.success },
      failed:  { text: 'failed',  color: T.error },
      error:   { text: 'error',   color: T.error },
    };
    const chip = map[String(status)] || { text: String(status), color: T.dim };
    return `${chip.color}[${chip.text}]${T.dim}`;
  }

  _formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  }
}

/**
 * 便捷入口：kernel.hud.start() / kernel.hud.stop()
 */
export function createHUD(kernel, config) {
  return new HundunHUD(kernel, config);
}
