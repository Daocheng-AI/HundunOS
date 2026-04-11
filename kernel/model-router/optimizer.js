// hundunos/kernel/model-router/optimizer.js — Smart Routing Optimizer
// 功能: 基于历史数据智能优化路由策略
// 状态: 新增

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class RouterOptimizer {
    constructor(kernel) {
        this.kernel = kernel;
        this.history = [];
        this.patterns = new Map();
        
        this.config = {
            historyDir: join(__dirname, '..', 'data'),
            minSamples: 10,
            learningRate: 0.1
        };
        
        this._loadHistory();
    }

    _loadHistory() {
        const historyFile = join(this.config.historyDir, 'routing_history.json');
        if (existsSync(historyFile)) {
            try {
                this.history = JSON.parse(readFileSync(historyFile, 'utf8'));
            } catch (e) {
                this.history = [];
            }
        }
    }

    _saveHistory() {
        const historyFile = join(this.config.historyDir, 'routing_history.json');
        mkdirSync(dirname(historyFile), { recursive: true });
        writeFileSync(historyFile, JSON.stringify(this.history.slice(-1000), null, 2), 'utf8');
    }

    /**
     * 记录一次路由决策
     */
    record(intent, selectedProvider, result) {
        this.history.push({
            timestamp: Date.now(),
            intentType: intent.type,
            intentAction: intent.action,
            content: intent.content?.slice(0, 100) || '',
            selectedProvider,
            success: result.success,
            latency: result.latency,
            tokens: result.usage?.total || 0
        });
        
        if (this.history.length > 1000) {
            this.history.shift();
        }
        
        this._saveHistory();
        this._learn();
    }

    /**
     * 从历史中学习模式
     */
    _learn() {
        if (this.history.length < this.config.minSamples) return;
        
        // 按意图类型分组统计
        const byType = {};
        for (const h of this.history) {
            const key = `${h.intentType}:${h.intentAction}`;
            if (!byType[key]) {
                byType[key] = { success: 0, fail: 0, providers: {} };
            }
            if (h.success) {
                byType[key].success++;
            } else {
                byType[key].fail++;
            }
            byType[key].providers[h.selectedProvider] = 
                (byType[key].providers[h.selectedProvider] || 0) + 1;
        }
        
        this.patterns = byType;
    }

    /**
     * 为当前意图推荐最佳Provider
     */
    recommend(intent) {
        const key = `${intent.type}:${intent.action}`;
        const pattern = this.patterns[key];
        
        if (!pattern || pattern.success + pattern.fail < 5) {
            return null;  // 样本不足
        }
        
        // 找出成功率最高的Provider
        let bestProvider = null;
        let bestScore = 0;
        
        for (const [provider, count] of Object.entries(pattern.providers)) {
            const successRate = pattern.success / (pattern.success + pattern.fail);
            const score = successRate * (count / this.history.length);
            
            if (score > bestScore) {
                bestScore = score;
                bestProvider = provider;
            }
        }
        
        return {
            provider: bestProvider,
            confidence: bestScore.toFixed(2),
            sampleSize: pattern.success + pattern.fail
        };
    }

    /**
     * 获取优化建议
     */
    getSuggestions() {
        if (this.history.length < this.config.minSamples) {
            return [{ type: 'insufficient_data', message: '需要更多样本才能提供优化建议' }];
        }
        
        const suggestions = [];
        
        // 分析失败率
        const failRate = this.history.filter(h => !h.success).length / this.history.length;
        if (failRate > 0.3) {
            suggestions.push({
                type: 'high_fail_rate',
                message: `失败率 ${(failRate * 100).toFixed(1)}% 偏高，建议检查 Provider 配置`
            });
        }
        
        // 分析延迟
        const avgLatency = this.history.reduce((sum, h) => sum + (h.latency || 0), 0) / this.history.length;
        if (avgLatency > 10000) {
            suggestions.push({
                type: 'high_latency',
                message: `平均延迟 ${(avgLatency / 1000).toFixed(1)}s 偏高，考虑切换到更快的模型`
            });
        }
        
        // 计算潜在的Token节省
        const localCalls = this.history.filter(h => h.selectedProvider.includes('ollama') || h.selectedProvider.includes('local'));
        const cloudCalls = this.history.filter(h => !h.selectedProvider.includes('ollama') && !h.selectedProvider.includes('local'));
        
        if (cloudCalls.length > localCalls.length * 2) {
            suggestions.push({
                type: 'token_optimization',
                message: `云端调用占比 ${(cloudCalls.length / this.history.length * 100).toFixed(1)}%，可考虑增加本地模型使用`
            });
        }
        
        return suggestions;
    }

    /**
     * 获取统计
     */
    getStats() {
        const total = this.history.length;
        const success = this.history.filter(h => h.success).length;
        
        return {
            totalCalls: total,
            successRate: total > 0 ? (success / total * 100).toFixed(1) + '%' : '0%',
            patterns: Object.keys(this.patterns).length,
            suggestions: this.getSuggestions()
        };
    }
}

export function getRouterOptimizer(kernel) {
    return new RouterOptimizer(kernel);
}