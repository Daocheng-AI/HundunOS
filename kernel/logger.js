// hundunos/kernel/logger.js — 统一日志系统
// 替代 console.log/error/warn，支持日志级别和格式化

/**
 * 日志级别
 */
export const LogLevel = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    FATAL: 4,
};

/**
 * 日志级别名称
 */
const LOG_LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

/**
 * 日志颜色（终端）
 */
const LOG_COLORS = {
    DEBUG: '\x1b[36m',  // 青色
    INFO: '\x1b[32m',   // 绿色
    WARN: '\x1b[33m',   // 黄色
    ERROR: '\x1b[31m',  // 红色
    FATAL: '\x1b[35m',  // 紫色
    RESET: '\x1b[0m',
};

/**
 * Logger 类 — 统一日志管理
 */
export class Logger {
    constructor(options = {}) {
        this.name = options.name || 'HundunOS';
        this.level = options.level ?? LogLevel.INFO;
        this.enableColor = options.enableColor ?? true;
        this.enableTimestamp = options.enableTimestamp ?? true;
        this.enablePrefix = options.enablePrefix ?? true;
        this.outputs = options.outputs || [console];
        this.errorHandler = options.errorHandler || null;
    }

    /**
     * 设置日志级别
     * @param {number} level - 日志级别
     */
    setLevel(level) {
        this.level = level;
    }

    /**
     * 格式化日志消息
     * @param {number} level - 日志级别
     * @param {string} message - 消息
     * @param {Object} meta - 元数据
     * @returns {string} 格式化后的消息
     */
    _format(level, message, meta = {}) {
        const parts = [];

        // 时间戳
        if (this.enableTimestamp) {
            parts.push(new Date().toISOString());
        }

        // 日志级别
        const levelName = LOG_LEVEL_NAMES[level];
        if (this.enableColor && this.outputs[0] === console) {
            parts.push(`${LOG_COLORS[levelName]}[${levelName}]${LOG_COLORS.RESET}`);
        } else {
            parts.push(`[${levelName}]`);
        }

        // 模块名
        if (this.enablePrefix) {
            parts.push(`[${this.name}]`);
        }

        // 消息
        parts.push(message);

        // 元数据
        if (Object.keys(meta).length > 0) {
            try {
                parts.push(JSON.stringify(meta));
            } catch (e) {
                parts.push('[Meta: circular]');
            }
        }

        return parts.join(' ');
    }

    /**
     * 输出日志
     * @param {number} level - 日志级别
     * @param {string} message - 消息
     * @param {Object} meta - 元数据
     */
    _log(level, message, meta = {}) {
        if (level < this.level) return;

        const formatted = this._format(level, message, meta);
        const levelName = LOG_LEVEL_NAMES[level];

        for (const output of this.outputs) {
            switch (levelName) {
                case 'DEBUG':
                case 'INFO':
                    output.log(formatted);
                    break;
                case 'WARN':
                    output.warn(formatted);
                    break;
                case 'ERROR':
                case 'FATAL':
                    output.error(formatted);
                    break;
            }
        }

        // 错误处理回调
        if (level >= LogLevel.ERROR && this.errorHandler) {
            this.errorHandler(level, message, meta);
        }
    }

    /**
     * DEBUG 级别日志
     */
    debug(message, meta = {}) {
        this._log(LogLevel.DEBUG, message, meta);
    }

    /**
     * INFO 级别日志
     */
    info(message, meta = {}) {
        this._log(LogLevel.INFO, message, meta);
    }

    /**
     * WARN 级别日志
     */
    warn(message, meta = {}) {
        this._log(LogLevel.WARN, message, meta);
    }

    /**
     * ERROR 级别日志
     */
    error(message, meta = {}) {
        this._log(LogLevel.ERROR, message, meta);
    }

    /**
     * FATAL 级别日志
     */
    fatal(message, meta = {}) {
        this._log(LogLevel.FATAL, message, meta);
    }

    /**
     * 创建子日志器
     * @param {string} name - 子模块名
     * @returns {Logger} 子日志器
     */
    child(name) {
        return new Logger({
            name: `${this.name}:${name}`,
            level: this.level,
            enableColor: this.enableColor,
            enableTimestamp: this.enableTimestamp,
            enablePrefix: this.enablePrefix,
            outputs: this.outputs,
            errorHandler: this.errorHandler,
        });
    }

    /**
     * 获取统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        return {
            name: this.name,
            level: LOG_LEVEL_NAMES[this.level],
            outputs: this.outputs.length,
        };
    }
}

// ─── 全局日志器 ────────────────────────────────────────────────────────

let globalLogger = null;

/**
 * 获取全局日志器
 * @param {Object} options - 配置选项
 * @returns {Logger} 全局日志器
 */
export function getLogger(options = {}) {
    if (!globalLogger) {
        globalLogger = new Logger(options);
    }
    return globalLogger;
}

/**
 * 设置全局日志器
 * @param {Logger} logger - 日志器实例
 */
export function setLogger(logger) {
    globalLogger = logger;
}

/**
 * 创建模块日志器
 * @param {string} name - 模块名
 * @returns {Logger} 模块日志器
 */
export function createLogger(name) {
    return getLogger().child(name);
}

export default Logger;
