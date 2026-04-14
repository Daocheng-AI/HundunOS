/**
 * HundunOS v3.0 - Token 使用统计模块
 * 追踪各 provider 的 token 使用量和成本
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATS_FILE = path.join(__dirname, '../../../data/modelrouter_stats.json');

/**
 * Token 统计器
 */
export class UsageStats {
    constructor() {
        this.stats = this._loadStats();
    }

    _loadStats() {
        if (fs.existsSync(STATS_FILE)) {
            try {
                return JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
            } catch (e) {
                return this._getDefaultStats();
            }
        }
        return this._getDefaultStats();
    }

    _getDefaultStats() {
        return {
            totalTokens: 0,
            totalCost: 0,
            savedByLocal: 0,       // 使用本地模型节省的成本
            byProvider: {},
            byTaskType: {},
            history: [],
            lastUpdated: null
        };
    }

    /**
     * 记录一次调用
     */
    record(providerId, result, taskType = 'general') {
        const tokens = result.usage?.total || result.tokens || 0;
        const costPer1M = result.costPer1M || 0;
        const cost = tokens * costPer1M / 1e6;

        // 更新总计
        this.stats.totalTokens += tokens;
        this.stats.totalCost += cost;

        // 更新 provider 统计
        if (!this.stats.byProvider[providerId]) {
            this.stats.byProvider[providerId] = {
                calls: 0,
                tokens: 0,
                cost: 0
            };
        }
        this.stats.byProvider[providerId].calls++;
        this.stats.byProvider[providerId].tokens += tokens;
        this.stats.byProvider[providerId].cost += cost;

        // 更新任务类型统计
        if (!this.stats.byTaskType[taskType]) {
            this.stats.byTaskType[taskType] = { calls: 0, tokens: 0 };
        }
        this.stats.byTaskType[taskType].calls++;
        this.stats.byTaskType[taskType].tokens += tokens;

        // 本地模型节省计算
        if (providerId.includes('ollama') || providerId.includes('local')) {
            // 假设同等调用云端成本
            const cloudCost = tokens * 3.0 / 1e6; // $3/1M tokens
            this.stats.savedByLocal += cloudCost - cost;
        }

        // 历史记录（最近100条）
        this.stats.history.push({
            timestamp: Date.now(),
            provider: providerId,
            tokens,
            cost,
            taskType
        });
        if (this.stats.history.length > 100) {
            this.stats.history.shift();
        }

        this.stats.lastUpdated = new Date().toISOString();
        this._saveStats();

        return { tokens, cost };
    }

    _saveStats() {
        const dir = path.dirname(STATS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(STATS_FILE, JSON.stringify(this.stats, null, 2), 'utf-8');
    }

    /**
     * 获取统计摘要
     */
    getSummary() {
        return {
            totalTokens: this.stats.totalTokens,
            totalCost: this.stats.totalCost.toFixed(4),
            savedByLocal: this.stats.savedByLocal.toFixed(4),
            savingsRate: this.stats.totalCost > 0
                ? (this.stats.savedByLocal / (this.stats.totalCost + this.stats.savedByLocal) * 100).toFixed(1)
                : '0',
            providers: Object.keys(this.stats.byProvider),
            callCount: Object.values(this.stats.byProvider).reduce((sum, p) => sum + p.calls, 0)
        };
    }

    /**
     * 获取详细统计
     */
    getDetails() {
        return {
            summary: this.getSummary(),
            byProvider: this.stats.byProvider,
            byTaskType: this.stats.byTaskType,
            recentHistory: this.stats.history.slice(-10)
        };
    }

    /**
     * 重置统计
     */
    reset() {
        this.stats = this._getDefaultStats();
        this._saveStats();
    }
}

// 单例
let instance = null;

export function getUsageStats() {
    if (!instance) {
        instance = new UsageStats();
    }
    return instance;
}

export default UsageStats;
