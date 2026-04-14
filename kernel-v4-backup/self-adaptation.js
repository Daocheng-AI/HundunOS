/**
 * HundunOS v3.0 - Self-Adaptation 自适应模块
 * 检测行为模式并自动调整系统参数
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADAPTATION_FILE = path.join(__dirname, '../../../data/adaptation_state.json');

/**
 * 行为模式
 */
export const BehaviorPattern = {
    HEAVY_CODING: 'heavy_coding',       // 大量编码任务
    HEAVY_ANALYSIS: 'heavy_analysis',   // 大量分析任务
    LIGHT_USAGE: 'light_usage',          // 轻度使用
    BURST_ACTIVITY: 'burst_activity',    // 突发活动
    STEADY_STREAM: 'steady_stream'       // 稳定流
};

/**
 * 自适应调整策略
 */
const ADAPTATION_RULES = {
    [BehaviorPattern.HEAVY_CODING]: {
        modelStrategy: 'COST_FIRST',
        autoSnapshotInterval: 30000,
        contextWindow: 16000,
        description: '编码密集：本地优先，频繁快照'
    },
    [BehaviorPattern.HEAVY_ANALYSIS]: {
        modelStrategy: 'BALANCED',
        autoSnapshotInterval: 60000,
        contextWindow: 32000,
        description: '分析密集：平衡模式，标准快照'
    },
    [BehaviorPattern.LIGHT_USAGE]: {
        modelStrategy: 'COST_FIRST',
        autoSnapshotInterval: 120000,
        contextWindow: 8000,
        description: '轻度使用：节省资源'
    },
    [BehaviorPattern.BURST_ACTIVITY]: {
        modelStrategy: 'QUALITY_FIRST',
        autoSnapshotInterval: 15000,
        contextWindow: 32000,
        description: '突发活动：质量优先，快速快照'
    },
    [BehaviorPattern.STEADY_STREAM]: {
        modelStrategy: 'BALANCED',
        autoSnapshotInterval: 60000,
        contextWindow: 16000,
        description: '稳定流：平衡配置'
    }
};

/**
 * Self-Adaptation 主类
 */
export class SelfAdaptation {
    constructor(kernel, config = {}) {
        this.kernel = kernel;
        this.config = {
            observationWindow: config.observationWindow || 3600000, // 1小时
            minSamples: config.minSamples || 10,
            adaptationThreshold: config.adaptationThreshold || 0.7
        };

        this.observationBuffer = [];
        this.currentPattern = BehaviorPattern.STEADY_STREAM;
        this.adaptationHistory = [];
        this.lastAdaptation = null;
    }

    /**
     * 初始化
     */
    async initialize() {
        await this._loadState();
        this._startObservation();
        // console.log(`[SelfAdaptation] Initialized with pattern: ${this.currentPattern}`);
        return this;
    }

    // ========================================
    // 行为观察
    // ========================================

    /**
     * 记录一次任务
     */
    recordTask(taskInfo) {
        const record = {
            timestamp: Date.now(),
            type: taskInfo.type || 'unknown',
            complexity: taskInfo.complexity || 'moderate',
            duration: taskInfo.duration || 0,
            success: taskInfo.success !== false,
            modelUsed: taskInfo.modelUsed,
            tokensUsed: taskInfo.tokensUsed || 0
        };

        this.observationBuffer.push(record);

        // 清理旧记录
        const cutoff = Date.now() - this.config.observationWindow;
        this.observationBuffer = this.observationBuffer.filter(r => r.timestamp > cutoff);

        // 检测模式变化
        this._checkPatternChange();
    }

    /**
     * 检测当前行为模式
     */
    detectPattern() {
        if (this.observationBuffer.length < this.config.minSamples) {
            return this.currentPattern;
        }

        const recent = this.observationBuffer.slice(-50);
        const stats = this._analyzeRecentActivity(recent);

        // 模式匹配
        if (stats.codingRatio > 0.5) {
            return BehaviorPattern.HEAVY_CODING;
        }

        if (stats.analysisRatio > 0.4) {
            return BehaviorPattern.HEAVY_ANALYSIS;
        }

        if (stats.taskRate < 0.5) { // 每分钟 < 0.5 任务
            return BehaviorPattern.LIGHT_USAGE;
        }

        if (stats.burstiness > 2.0) {
            return BehaviorPattern.BURST_ACTIVITY;
        }

        return BehaviorPattern.STEADY_STREAM;
    }

    /**
     * 分析近期活动
     */
    _analyzeRecentActivity(records) {
        const total = records.length;
        const now = Date.now();
        const oneMinuteAgo = now - 60000;

        const codingTasks = records.filter(r =>
            r.type === 'code' || r.type === 'coding' || r.type === 'script'
        ).length;

        const analysisTasks = records.filter(r =>
            r.type === 'analysis' || r.type === 'report' || r.type === 'data'
        ).length;

        const recentTasks = records.filter(r => r.timestamp > oneMinuteAgo).length;

        // 计算突发性（任务间隔的标准差）
        const intervals = [];
        for (let i = 1; i < records.length; i++) {
            intervals.push(records[i].timestamp - records[i-1].timestamp);
        }
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length || 0;
        const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;
        const burstiness = Math.sqrt(variance) / avgInterval || 0;

        return {
            total,
            codingRatio: codingTasks / total,
            analysisRatio: analysisTasks / total,
            taskRate: recentTasks,
            burstiness,
            avgInterval
        };
    }

    // ========================================
    // 自适应调整
    // ========================================

    /**
     * 执行自适应调整
     */
    async adapt() {
        const newPattern = this.detectPattern();

        if (newPattern === this.currentPattern) {
            return { adapted: false, reason: 'pattern_unchanged' };
        }

        const rules = ADAPTATION_RULES[newPattern];
        if (!rules) {
            return { adapted: false, reason: 'no_rules' };
        }

        // 应用调整
        await this._applyRules(rules);

        // 记录历史
        this.adaptationHistory.push({
            timestamp: Date.now(),
            from: this.currentPattern,
            to: newPattern,
            rules
        });

        this.currentPattern = newPattern;
        this.lastAdaptation = Date.now();

        await this._saveState();

        // console.log(`[SelfAdaptation] Adapted to ${newPattern}: ${rules.description}`);
        return {
            adapted: true,
            pattern: newPattern,
            rules
        };
    }

    /**
     * 应用调整规则
     */
    async _applyRules(rules) {
        // 调整模型策略
        if (this.kernel.modelRouter && rules.modelStrategy) {
            this.kernel.modelRouter.strategy = rules.modelStrategy;
        }

        // 调整快照间隔
        if (this.kernel.recoverableMemory && rules.autoSnapshotInterval) {
            this.kernel.recoverableMemory.config.autoInterval = rules.autoSnapshotInterval;
        }

        // 调整上下文窗口
        if (rules.contextWindow) {
            this.kernel.config.contextWindow = rules.contextWindow;
        }
    }

    /**
     * 检查模式变化
     */
    _checkPatternChange() {
        if (this.observationBuffer.length < this.config.minSamples) {
            return;
        }

        const newPattern = this.detectPattern();
        if (newPattern !== this.currentPattern) {
            // 自动适应（可选）
            // this.adapt();
        }
    }

    // ========================================
    // 观察循环
    // ========================================

    _startObservation() {
        // 定期检查（保存 timer 引用以便清理）
        this._observationTimer = setInterval(() => {
            this._checkPatternChange();
        }, 60000); // 每分钟检查一次
    }

    /**
     * 停止观察（清理定时器）
     */
    stopObservation() {
        if (this._observationTimer) {
            clearInterval(this._observationTimer);
            this._observationTimer = null;
        }
    }

    /**
     * 关闭模块
     */
    async shutdown() {
        this.stopObservation();
        await this._saveState();
        // console.log('[SelfAdaptation] Shutdown complete');
    }

    // ========================================
    // 持久化
    // ========================================

    async _loadState() {
        try {
            if (fs.existsSync(ADAPTATION_FILE)) {
                const data = JSON.parse(fs.readFileSync(ADAPTATION_FILE, 'utf-8'));
                this.currentPattern = data.currentPattern || BehaviorPattern.STEADY_STREAM;
                this.adaptationHistory = data.adaptationHistory || [];
            }
        } catch (e) {
            console.warn('[SelfAdaptation] Failed to load state:', e.message);
        }
    }

    async _saveState() {
        try {
            const data = {
                currentPattern: this.currentPattern,
                adaptationHistory: this.adaptationHistory.slice(-100),
                lastAdaptation: this.lastAdaptation,
                updatedAt: Date.now()
            };
            fs.writeFileSync(ADAPTATION_FILE, JSON.stringify(data, null, 2), 'utf-8');
        } catch (e) {
            console.warn('[SelfAdaptation] Failed to save state:', e.message);
        }
    }

    // ========================================
    // 查询接口
    // ========================================

    getCurrentPattern() {
        return this.currentPattern;
    }

    getCurrentRules() {
        return ADAPTATION_RULES[this.currentPattern];
    }

    getStats() {
        return {
            currentPattern: this.currentPattern,
            currentRules: this.getCurrentRules(),
            observationCount: this.observationBuffer.length,
            adaptationCount: this.adaptationHistory.length,
            lastAdaptation: this.lastAdaptation
        };
    }
}

export default SelfAdaptation;
