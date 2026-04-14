/**
 * HundunOS v3.0 - HealthMonitor 健康监控
 * 10维度系统健康检查
 * 
 * 维度: modules / cron / edict / task_hub / workbuddy / mcp / token / errors / skills / security
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// 健康维度定义
// ============================================================================

export const HealthDimension = {
    MODULES:    'modules',     // 模块健康
    CRON:       'cron',        // 定时任务
    EDICT:      'edict',       // 三省六部
    TASK_HUB:   'task_hub',    // 任务中枢
    WORKBUDDY:  'workbuddy',   // WorkBuddy IDE
    MCP:        'mcp',         // MCP Server
    TOKEN:      'token',       // Token 使用
    ERRORS:     'errors',      // 错误状态
    SKILLS:     'skills',      // Skills 评估
    SECURITY:   'security'     // 安全评分
};

/**
 * 维度权重
 */
const DIMENSION_WEIGHTS = {
    [HealthDimension.MODULES]:   10,
    [HealthDimension.CRON]:      10,
    [HealthDimension.EDICT]:     12,
    [HealthDimension.TASK_HUB]:  12,
    [HealthDimension.WORKBUDDY]: 12,
    [HealthDimension.MCP]:       12,
    [HealthDimension.TOKEN]:     8,
    [HealthDimension.ERRORS]:    8,
    [HealthDimension.SKILLS]:    8,
    [HealthDimension.SECURITY]:  8
};

/**
 * 健康状态
 */
export const HealthStatus = {
    HEALTHY:   'healthy',    // 健康 >80
    WARNING:   'warning',    // 警告 60-80
    CRITICAL:  'critical',   // 危险 40-60
    CRITICAL2: 'critical2',  // 严重 <40
    UNKNOWN:   'unknown'     // 未知
};

/**
 * 状态阈值
 */
const STATUS_THRESHOLDS = {
    [HealthStatus.HEALTHY]:  80,
    [HealthStatus.WARNING]:  60,
    [HealthStatus.CRITICAL]: 40
};

// ============================================================================
// 健康检查器
// ============================================================================

export class HealthMonitor extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            checkInterval: config.checkInterval || 60000, // 1分钟
            historySize:   config.historySize || 100,
            alertThreshold: config.alertThreshold || 60,
            ...config
        };

        this.scores = new Map();        // dimension -> score (0-100)
        this.history = [];               // 历史记录
        this.alerts = [];                // 告警队列
        this.lastCheck = null;
        this.checkCount = 0;
        
        this._checkers = new Map();      // dimension -> checker function
        this._interval = null;
        
        // console.log('[HealthMonitor] Initialized with 10 dimensions');
    }

    // ========================================================================
    // 检查器注册
    // ========================================================================

    /**
     * 注册维度检查器
     */
    registerChecker(dimension, checker) {
        if (!Object.values(HealthDimension).includes(dimension)) {
            throw new Error(`Invalid dimension: ${dimension}`);
        }
        this._checkers.set(dimension, checker);
        // console.log(`[HealthMonitor] Registered checker: ${dimension}`);
    }

    /**
     * 批量注册检查器
     */
    registerCheckers(checkers) {
        for (const [dimension, checker] of Object.entries(checkers)) {
            this.registerChecker(dimension, checker);
        }
    }

    // ========================================================================
    // 健康检查
    // ========================================================================

    /**
     * 执行全量健康检查
     */
    async checkAll() {
        const results = {};
        const timestamp = new Date().toISOString();

        for (const dimension of Object.values(HealthDimension)) {
            try {
                const result = await this._checkDimension(dimension);
                results[dimension] = result;
                this.scores.set(dimension, result.score);
            } catch (error) {
                results[dimension] = {
                    score: 0,
                    status: HealthStatus.UNKNOWN,
                    error: error.message
                };
                this.scores.set(dimension, 0);
            }
        }

        // 计算综合评分
        const overall = this._calculateOverall(results);

        // 记录历史
        const record = {
            timestamp,
            overall,
            dimensions: results,
            checkNumber: ++this.checkCount
        };
        this.history.push(record);
        if (this.history.length > this.config.historySize) {
            this.history.shift();
        }

        // 检查告警
        this._checkAlerts(overall, results);

        this.lastCheck = record;
        this.emit('check_complete', record);

        return record;
    }

    /**
     * 检查单个维度
     */
    async checkDimension(dimension) {
        return this._checkDimension(dimension);
    }

    /**
     * 获取维度分数
     */
    getScore(dimension) {
        return this.scores.get(dimension) || 0;
    }

    /**
     * 获取所有分数
     */
    getAllScores() {
        const scores = {};
        for (const [dimension, score] of this.scores) {
            scores[dimension] = score;
        }
        return scores;
    }

    /**
     * 获取综合评分
     */
    getOverallScore() {
        if (this.scores.size === 0) return 0;
        return this._calculateWeightedAverage();
    }

    /**
     * 获取健康状态
     */
    getStatus(score = null) {
        const s = score ?? this.getOverallScore();
        if (s >= STATUS_THRESHOLDS[HealthStatus.HEALTHY]) return HealthStatus.HEALTHY;
        if (s >= STATUS_THRESHOLDS[HealthStatus.WARNING]) return HealthStatus.WARNING;
        if (s >= STATUS_THRESHOLDS[HealthStatus.CRITICAL]) return HealthStatus.CRITICAL;
        return HealthStatus.CRITICAL2;
    }

    // ========================================================================
    // 告警管理
    // ========================================================================

    /**
     * 获取告警列表
     */
    getAlerts(clear = false) {
        const alerts = [...this.alerts];
        if (clear) this.alerts = [];
        return alerts;
    }

    /**
     * 清除告警
     */
    clearAlerts() {
        this.alerts = [];
    }

    // ========================================================================
    // 历史记录
    // ========================================================================

    /**
     * 获取历史记录
     */
    getHistory(limit = 10) {
        return this.history.slice(-limit);
    }

    /**
     * 获取趋势
     */
    getTrend(dimension = null, points = 10) {
        const history = this.getHistory(points);
        if (dimension) {
            return history.map(h => ({
                timestamp: h.timestamp,
                score: h.dimensions[dimension]?.score || 0
            }));
        }
        return history.map(h => ({
            timestamp: h.timestamp,
            overall: h.overall
        }));
    }

    // ========================================================================
    // 启动/停止
    // ========================================================================

    /**
     * 启动定期检查
     */
    start() {
        if (this._interval) return;
        
        this._interval = setInterval(() => {
            this.checkAll().catch(err => {
                console.error('[HealthMonitor] Check failed:', err);
            });
        }, this.config.checkInterval);

        // console.log(`[HealthMonitor] Started, interval: ${this.config.checkInterval}ms`);
        this.emit('started');
    }

    /**
     * 停止定期检查
     */
    stop() {
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }
        // console.log('[HealthMonitor] Stopped');
        this.emit('stopped');
    }

    // ========================================================================
    // 内部方法
    // ========================================================================

    async _checkDimension(dimension) {
        const checker = this._checkers.get(dimension);
        
        if (checker) {
            const result = await checker();
            return {
                score: Math.min(100, Math.max(0, result.score || 0)),
                status: this.getStatus(result.score),
                details: result.details || {},
                timestamp: new Date().toISOString()
            };
        }

        // 默认检查逻辑
        const defaultScore = await this._defaultCheck(dimension);
        return {
            score: defaultScore,
            status: this.getStatus(defaultScore),
            timestamp: new Date().toISOString()
        };
    }

    async _defaultCheck(dimension) {
        switch (dimension) {
            case HealthDimension.MODULES:
                return this._checkModules();
            case HealthDimension.CRON:
                return this._checkCron();
            case HealthDimension.TOKEN:
                return this._checkToken();
            case HealthDimension.ERRORS:
                return this._checkErrors();
            default:
                return 100; // 默认健康
        }
    }

    _checkModules() {
        // 检查模块目录
        try {
            const modulesDir = path.join(__dirname, '..');
            const modules = fs.readdirSync(modulesDir).filter(d => {
                return fs.statSync(path.join(modulesDir, d)).isDirectory();
            });
            return Math.min(100, modules.length * 10);
        } catch {
            return 50;
        }
    }

    _checkCron() {
        // 检查 cron 状态文件
        try {
            const cronFile = path.join(__dirname, '../../../data/cron_status.json');
            if (fs.existsSync(cronFile)) {
                const status = JSON.parse(fs.readFileSync(cronFile, 'utf-8'));
                return status.healthy ? 100 : 50;
            }
            return 100; // 无状态文件视为正常
        } catch {
            return 80;
        }
    }

    _checkToken() {
        // Token 使用率检查（从配置或状态文件读取）
        return 80; // 默认值
    }

    _checkErrors() {
        // 错误率检查
        try {
            const errorsFile = path.join(__dirname, '../../../data/errors.json');
            if (fs.existsSync(errorsFile)) {
                const errors = JSON.parse(fs.readFileSync(errorsFile, 'utf-8'));
                const recent = errors.filter(e => {
                    const age = Date.now() - new Date(e.timestamp).getTime();
                    return age < 3600000; // 1小时内
                });
                return Math.max(0, 100 - recent.length * 10);
            }
            return 100;
        } catch {
            return 90;
        }
    }

    _calculateOverall(results) {
        let totalWeight = 0;
        let weightedSum = 0;

        for (const [dimension, result] of Object.entries(results)) {
            const weight = DIMENSION_WEIGHTS[dimension] || 10;
            weightedSum += (result.score || 0) * weight;
            totalWeight += weight;
        }

        return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
    }

    _calculateWeightedAverage() {
        let totalWeight = 0;
        let weightedSum = 0;

        for (const [dimension, score] of this.scores) {
            const weight = DIMENSION_WEIGHTS[dimension] || 10;
            weightedSum += score * weight;
            totalWeight += weight;
        }

        return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
    }

    _checkAlerts(overall, results) {
        // 综合告警
        if (overall < this.config.alertThreshold) {
            this.alerts.push({
                type: 'overall',
                level: 'warning',
                message: `综合健康评分低于阈值: ${overall} < ${this.config.alertThreshold}`,
                timestamp: new Date().toISOString()
            });
        }

        // 维度告警
        for (const [dimension, result] of Object.entries(results)) {
            if (result.score < STATUS_THRESHOLDS[HealthStatus.WARNING]) {
                this.alerts.push({
                    type: 'dimension',
                    dimension,
                    level: result.status,
                    message: `${dimension} 健康评分异常: ${result.score}`,
                    timestamp: new Date().toISOString()
                });
            }
        }

        // 触发告警事件
        if (this.alerts.length > 0) {
            this.emit('alerts', this.alerts);
        }
    }
}

// ============================================================================
// 单例
// ============================================================================

let instance = null;

export function getHealthMonitor() {
    if (!instance) {
        instance = new HealthMonitor();
    }
    return instance;
}

export default {
    HealthMonitor,
    getHealthMonitor,
    HealthDimension,
    HealthStatus
};
