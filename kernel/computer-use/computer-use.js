// hundunos/kernel/computer-use/computer-use.js — Computer Use 操控系统 v1.0
// 借鉴 Claude Code Computer Use 设计
// 参考: claude-code-best/packages/@ant/computer-use-*/
//
// 跨平台 GUI 操控能力
// 支持：Windows / macOS（Linux 后端待完成）

import { spawn, execSync } from 'child_process';
import { feature } from '../feature-flags.js';

/**
 * 操作类型
 */
export const ActionType = {
  MOVE_MOUSE: 'move_mouse',
  CLICK: 'click',
  RIGHT_CLICK: 'right_click',
  DOUBLE_CLICK: 'double_click',
  TYPE_TEXT: 'type_text',
  PRESS_KEY: 'press_key',
  SCREENSHOT: 'screenshot',
  GET_CLIPBOARD: 'get_clipboard',
  SET_CLIPBOARD: 'set_clipboard',
  WINDOW_LIST: 'window_list',
  WINDOW_FOCUS: 'window_focus',
  WINDOW_CLOSE: 'window_close',
};

/**
 * 操作结果
 */
export class ComputerActionResult {
  constructor(success, type, data = null, error = null) {
    this.success = success;
    this.type = type;
    this.data = data;
    this.error = error;
    this.timestamp = Date.now();
  }
}

/**
 * 基础 ComputerUse 后端接口
 */
class ComputerBackend {
  async screenshot() { throw new Error('Not implemented'); }
  async moveMouse(x, y) { throw new Error('Not implemented'); }
  async click(button = 'left') { throw new Error('Not implemented'); }
  async doubleClick() { throw new Error('Not implemented'); }
  async typeText(text) { throw new Error('Not implemented'); }
  async pressKey(key) { throw new Error('Not implemented'); }
  async getClipboard() { throw new Error('Not implemented'); }
  async setClipboard(text) { throw new Error('Not implemented'); }
  async windowList() { throw new Error('Not implemented'); }
}

/**
 * Windows 后端（PowerShell 实现）
 */
class WindowsBackend extends ComputerBackend {
  constructor() {
    super();
    this.platform = 'win32';
  }

  _runPs(script) {
    try {
      return execSync(`powershell -Command "${script.replace(/"/g, '\\"')}"`, {
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 4 * 1024 * 1024,
      }).trim();
    } catch (err) {
      return null;
    }
  }

  async screenshot() {
    const { execSync } = await import('child_process');
    const path = `C:\\Users\\${process.env.USERNAME || 'User'}\\AppData\\Local\\Temp\\hundunos_screenshot_${Date.now()}.png`;
    const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen | ForEach-Object { $bmp = New-Object System.Drawing.Bitmap($_.Bounds.Width, $_.Bounds.Height); $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($_.Bounds.Location, [System.Drawing.Point]::Empty, $_.Bounds.Size); $bmp.Save('${path.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose(); $g.Dispose() }`;
    const result = this._runPs(ps);
    return {
      success: !!result,
      path: result ? path : null,
      data: result ? `Screenshot saved: ${path}` : 'Screenshot failed',
    };
  }

  async moveMouse(x, y) {
    const ps = `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})`;
    const result = this._runPs(ps);
    return { success: !!result };
  }

  async click(button = 'left') {
    const btn = button === 'right' ? 'Right' : 'Left';
    const ps1 = `[System.Windows.Forms.MouseButtons]::${btn}Button | Out-Null`;
    const ps2 = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = [System.Windows.Forms.Cursor]::Position`;
    this._runPs(ps1);
    return { success: true };
  }

  async typeText(text) {
    // 简化：使用 PowerShell SendKeys
    const escaped = text.replace(/[{}+^~()]/g, c => `{${c}}`);
    const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped}')`;
    const result = this._runPs(ps);
    return { success: !!result };
  }

  async pressKey(key) {
    const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{${key}}')`;
    const result = this._runPs(ps);
    return { success: !!result };
  }

  async getClipboard() {
    const ps = `Get-Clipboard -Format Text`;
    const result = this._runPs(ps);
    return { success: true, text: result || '' };
  }

  async setClipboard(text) {
    const escaped = text.replace(/'/g, "''");
    const ps = `Set-Clipboard -Value '${escaped}'`;
    const result = this._runPs(ps);
    return { success: !!result };
  }

  async windowList() {
    const ps = `Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object Id, ProcessName, MainWindowTitle | ConvertTo-Json -Compress`;
    const result = this._runPs(ps);
    try {
      const parsed = JSON.parse(result || '[]');
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      return { success: true, windows: arr.map(w => ({ pid: w.Id, name: w.ProcessName, title: w.MainWindowTitle })) };
    } catch {
      return { success: true, windows: [] };
    }
  }

  async windowFocus(pid) {
    const ps = `(Get-Process -Id ${pid}).MainWindowHandle | Set-Focus`;
    const result = this._runPs(ps);
    return { success: !!result };
  }
}

/**
 * macOS 后端（screencapture + cliclick）
 */
class DarwinBackend extends ComputerBackend {
  constructor() {
    super();
    this.platform = 'darwin';
  }

  async screenshot() {
    const path = `/tmp/hundunos_screenshot_${Date.now()}.png`;
    try {
      execSync(`screencapture ${path}`, { timeout: 5000 });
      return { success: true, path };
    } catch {
      return { success: false };
    }
  }

  async moveMouse(x, y) {
    try {
      execSync(`cliclick m:${x},${y}`, { timeout: 2000 });
      return { success: true };
    } catch { return { success: false }; }
  }

  async click(button = 'left') {
    const btn = button === 'right' ? 'r' : 'c';
    try {
      execSync(`cliclick ${btn}:`, { timeout: 2000 });
      return { success: true };
    } catch { return { success: false }; }
  }

  async typeText(text) {
    try {
      execSync(`cliclick t:'${text.replace(/'/g, "'\\''")}'`, { timeout: 2000 });
      return { success: true };
    } catch { return { success: false }; }
  }
}

/**
 * ComputerUse 核心类
 */
export class ComputerUse {
  constructor(kernel) {
    this.kernel = kernel;
    this.backend = this._createBackend();
    this.enabled = feature('COMPUTER_USE');
    this._history = [];
  }

  _createBackend() {
    switch (process.platform) {
      case 'win32': return new WindowsBackend();
      case 'darwin': return new DarwinBackend();
      default: return new ComputerBackend(); // Linux: 未实现
    }
  }

  /**
   * 执行一个操控动作
   */
  async execute(action) {
    if (!this.enabled) {
      return new ComputerActionResult(false, action.type, null, 'COMPUTER_USE feature disabled');
    }

    const start = Date.now();
    try {
      let data = null;

      switch (action.type) {
        case ActionType.SCREENSHOT:
          data = await this.backend.screenshot();
          break;
        case ActionType.MOVE_MOUSE:
          data = await this.backend.moveMouse(action.x, action.y);
          break;
        case ActionType.CLICK:
          data = await this.backend.click(action.button || 'left');
          break;
        case ActionType.DOUBLE_CLICK:
          data = await this.backend.doubleClick();
          break;
        case ActionType.TYPE_TEXT:
          data = await this.backend.typeText(action.text);
          break;
        case ActionType.PRESS_KEY:
          data = await this.backend.pressKey(action.key);
          break;
        case ActionType.GET_CLIPBOARD:
          data = await this.backend.getClipboard();
          break;
        case ActionType.SET_CLIPBOARD:
          data = await this.backend.setClipboard(action.text);
          break;
        case ActionType.WINDOW_LIST:
          data = await this.backend.windowList();
          break;
        case ActionType.WINDOW_FOCUS:
          data = await this.backend.windowFocus(action.pid);
          break;
        default:
          return new ComputerActionResult(false, action.type, null, `Unknown action: ${action.type}`);
      }

      const result = new ComputerActionResult(true, action.type, data);
      this._history.push({ action, duration: Date.now() - start, success: true });
      return result;

    } catch (err) {
      const result = new ComputerActionResult(false, action.type, null, err.message);
      this._history.push({ action, duration: Date.now() - start, success: false });
      return result;
    }
  }

  /**
   * 批量执行动作序列
   */
  async executeSequence(actions) {
    const results = [];
    for (const action of actions) {
      const result = await this.execute(action);
      results.push(result);
      if (!result.success) break; // 失败时停止
    }
    return results;
  }

  /**
   * 获取执行历史
   */
  getHistory() {
    return this._history;
  }

  /**
   * 获取工具定义（供 Agent 使用）
   */
  static getToolDefs() {
    return [
      {
        name: 'computer_screenshot',
        description: 'Take a screenshot of the screen',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'computer_move_mouse',
        description: 'Move mouse cursor to absolute screen position',
        inputSchema: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' } },
          required: ['x', 'y'],
        },
      },
      {
        name: 'computer_click',
        description: 'Click mouse at current position',
        inputSchema: {
          type: 'object',
          properties: { button: { type: 'string', enum: ['left', 'right'], default: 'left' } },
        },
      },
      {
        name: 'computer_type',
        description: 'Type text at current cursor position',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
        },
      },
      {
        name: 'computer_press_key',
        description: 'Press a keyboard key',
        inputSchema: {
          type: 'object',
          properties: { key: { type: 'string' } },
          required: ['key'],
        },
      },
      {
        name: 'computer_clipboard',
        description: 'Get or set clipboard contents',
        inputSchema: {
          type: 'object',
          properties: { action: { type: 'string', enum: ['get', 'set'] }, text: { type: 'string' } },
          required: ['action'],
        },
      },
    ];
  }
}

export default ComputerUse;
