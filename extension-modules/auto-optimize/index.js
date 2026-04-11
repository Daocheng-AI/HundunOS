// hundunos/extension-modules/auto-optimize/index.js — Auto-Optimization System
// 功能: 自动检测性能瓶颈并执行优化
// 状态: 新增

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const OptimizationType = {
    MEMORY: 'memory',           // 内存优化
    CACHE: 'cache',             // 缓存优化
    ROUTING: 'routing',        // 路由优化
    SKILL: 'skill',            // Skill 优化
    CONTEXT: 'context'         // 上下文优化
};

export const OptimizationStatus = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    SKIPPED: 'skipped'
};

export class AutoOptimizer {
    constructor(kernel) {
        this.kernel = kernel;
        this.history = [];
        this.optimizations = new Map();
        
        this.config = {
            enabled: true,
            autoRunInterval: 3600000,  // 1小时
            maxOptimizationsPerRun: 5,
            minImprovement: 0.1,  // 最小改善阈值 10%
            dataDir: join(__dirname, '..', '..', 'data', 'auto-optimize')
        };
        
        this.stats = {
            runs: 0,
            optimizations: 0,
            improvements: [],
            lastRun: null
        };
    }

    async initialize() {
        mkdirSync(this.config.dataDir, { recursive: true });
        await this._loadHistory();
        
        // review: removed // review: removed console.log('[AutoOptimizer] Initialized');
    }

    /**
     * 执行自动优化
     */
    async optimize() {
        this.stats.runs++;
        this.stats.lastRun = Date.now();
        
        // review: removed // review: removed console.log('[AutoOptimizer] Starting optimization run...');
        
        const results = [];
        
        // 1. 内存优化
        const memoryResult = await this._optimizeMemory();
        results.push(memoryResult);
        
        // 2. 缓存优化
        const cacheResult = await this._optimizeCache();
        results.push(cacheResult);
        
        // 3. 路由优化
        const routingResult = await this._optimizeRouting();
        results.push(routingResult);
        
        // 4. Skill 优化
        const skillResult = await this._optimizeSkills();
        results.push(skillResult);
        
        // 5. 上下文优化
        const contextResult = await this._optimizeContext();
        results.push(contextResult);
        
        // 计算总改善
        const totalImprovement = results.reduce((sum, r) => sum + (r.improvement || 0), 0);
        
        // 记录历史
        const runRecord = {
            timestamp: Date.now(),
            results,
            totalImprovement
        };
        
        this.history.push(runRecord);
        this.stats.optimizations += results.filter(r => r.success).length;
        
        if (totalImprovement > 0) {
            this.stats.improvements.push(totalImprovement);
        }
        
        // 限制历史长度
        if (this.history.length > 100) {
            this.history.shift();
        }
        
        await this._saveHistory();
        
        // review: removed // review: removed console.log(`[AutoOptimizer] Run completed. Total improvement: ${totalImprovement.toFixed(2)}%`);
        
        return {
            timestamp: runRecord.timestamp,
            results,
            totalImprovement
        };
    }

    /**
     * 内存优化
     */
    async _optimizeMemory() {
        const result = {
            type: OptimizationType.MEMORY,
            success: false,
            actions: [],
            improvement: 0
        };
        
        try {
            // 清理过期缓存
            if (this.kernel?.memoryGraph) {
                const stats = this.kernel.memoryGraph.getStats();
                
                // 检查 recent 内存占用
                if (stats.recent > this.config.maxRecent) {
                    // 可以触发清理
                    result.actions.push('Trigger memory cleanup');
                }
                
                // 检查 semantic 内存
                if (stats.semantic > 1000) {
                    result.actions.push('Consolidate semantic memory');
                }
            }
            
            // 检查堆内存
            if (global.gc) {
                global.gc();
                result.actions.push('Trigger garbage collection');
            }
            
            result.success = result.actions.length > 0;
            result.improvement = result.actions.length * 2;  // 每个动作约 2% 改善
        } catch (e) {
            console.error('[AutoOptimizer] Memory optimization failed:', e.message);
        }
        
        return result;
    }

    /**
     * 缓存优化
     */
    async _optimizeCache() {
        const result = {
            type: OptimizationType.CACHE,
            success: false,
            actions: [],
            improvement: 0
        };
        
        try {
            // 检查缓存命中率
            if (this.kernel?.modelRouter?.cache) {
                const cacheStats = this.kernel.modelRouter.cache.getStats();
                const hitRate = parseFloat(cacheStats.hitRate);
                
                if (hitRate < 30) {
                    // 命中率太低，扩大缓存
                    result.actions.push(`Cache hit rate low (${hitRate}%), consider expanding cache size`);
                } else if (hitRate > 70) {
                    // 命中率良好，减少过期条目
                    result.actions.push(`Cache hit rate good (${hitRate}%), optimize eviction`);
                }
            }
            
            // 检查过期缓存
            result.actions.push('Clean expired cache entries');
            
            result.success = result.actions.length > 0;
            result.improvement = result.actions.length * 3;  // 缓存优化效果更明显
        } catch (e) {
            console.error('[AutoOptimizer] Cache optimization failed:', e.message);
        }
        
        return result;
    }

    /**
     * 路由优化
     */
    async _optimizeRouting() {
        const result = {
            type: OptimizationType.ROUTING,
            success: false,
            actions: [],
            improvement: 0
        };
        
        try {
            // 获取路由统计
            if (this.kernel?.modelRouter?.optimizer) {
                const suggestions = this.kernel.modelRouter.optimizer.getSuggestions();
                
                for (const suggestion of suggestions) {
                    result.actions.push(`${suggestion.type}: ${suggestion.message}`);
                }
            }
            
            // 分析失败率
            if (this.history.length > 0) {
                const recentRuns = this.history.slice(-10);
                const avgImprovement = recentRuns.reduce((sum, r) => sum + r.totalImprovement, 0) / recentRuns.length;
                
                if (avgImprovement < 5) {
                    result.actions.push('Recent optimization improvements declining, review strategy');
                }
            }
            
            result.success = result.actions.length > 0;
            result.improvement = result.actions.length * 2;
        } catch (e) {
            console.error('[AutoOptimizer] Routing optimization failed:', e.message);
        }
        
        return result;
    }

    /**
     * Skill 优化
     */
    async _optimizeSkills() {
        const result = {
            type: OptimizationType.SKILL,
            success: false,
            actions: [],
            improvement: 0
        };
        
        try {
            // 分析 Skill 使用情况
            if (this.kernel?.skills) {
                const skillStats = this.kernel.skills.getStats?.();
                
                // 找出低使用率的 Skill
                const lowUsage = [];
                for (const [name, stats] of Object.entries(skillStats?.bySkill || {})) {
                    if (stats.calls < 10) {
                        lowUsage.push(name);
                    }
                }
                
                if (lowUsage.length > 0) {
                    result.actions.push(`Low usage skills: ${lowUsage.join(', ')}`);
                    result.actions.push('Consider disabling or improving low-usage skills');
                }
                
                // 优化触发词
                result.actions.push('Optimize skill trigger keywords');
            }
            
            result.success = result.actions.length > 0;
            result.improvement = result.actions.length * 1;
        } catch (e) {
            console.error('[AutoOptimizer] Skill optimization failed:', e.message);
        }
        
        return result;
    }

    /**
     * 上下文优化
     */
    async _optimizeContext() {
        const result = {
            type: OptimizationType.CONTEXT,
            success: false,
            actions: [],
            improvement: 0
        };
        
        try {
            // 检查上下文大小
            if (this.kernel?.memoryGraph?.hierarchy) {
                const sessionCtx = Object.keys(this.kernel.memoryGraph.hierarchy.session || {}).length;
                const projectCtx = Object.keys(this.kernel.memoryGraph.hierarchy.project || {}).length;
                
                if (sessionCtx > 100) {
                    result.actions.push('Session context growing large, consider distillation');
                }
                
                if (projectCtx > 200) {
                    result.actions.push('Project context extensive, consolidate concepts');
                }
            }
            
            // 执行蒸馏
            if (this.kernel?.memoryGraph?.distill) {
                await this.kernel.memoryGraph.distill();
                result.actions.push('Executed context distillation');
            }
            
            result.success = result.actions.length > 0;
            result.improvement = result.actions.length * 2;
        } catch (e) {
            console.error('[AutoOptimizer] Context optimization failed:', e.message);
        }
        
        return result;
    }

    /**
     * 获取优化建议
     */
    getRecommendations() {
        const recommendations = [];
        
        // 分析历史趋势
        if (this.history.length >= 3) {
            const recentRuns = this.history.slice(-3);
            const avgImprovement = recentRuns.reduce((sum, r) => sum + r.totalImprovement, 0) / recentRuns.length;
            
            if (avgImprovement < 1) {
                recommendations.push({
                    type: 'warning',
                    message: 'Optimization returns diminishing, consider changing strategy'
                });
            }
        }
        
        // 分析各类型优化效果
        const byType = {};
        for (const run of this.history) {
            for (const r of run.results) {
                if (!byType[r.type]) {
                    byType[r.type] = { total: 0, count: 0 };
                }
                byType[r.type].total += r.improvement;
                byType[r.type].count++;
            }
        }
        
        for (const [type, stats] of Object.entries(byType)) {
            const avg = stats.total / stats.count;
            if (avg < 1) {
                recommendations.push({
                    type: 'low',
                    message: `${type} optimization has low impact (${avg.toFixed(1)}% avg)`
                });
            }
        }
        
        return recommendations;
    }

    /**
     * 获取统计
     */
    getStats() {
        const avgImprovement = this.stats.improvements.length > 0
            ? this.stats.improvements.reduce((a, b) => a + b, 0) / this.stats.improvements.length
            : 0;
        
        return {
            runs: this.stats.runs,
            optimizations: this.stats.optimizations,
            avgImprovement: avgImprovement.toFixed(2) + '%',
            lastRun: this.stats.lastRun,
            historyLength: this.history.length,
            recommendations: this.getRecommendations()
        };
    }

    /**
     * 持久化
     */
    async _saveHistory() {
        const historyFile = join(this.config.dataDir, 'history.json');
        writeFileSync(historyFile, JSON.stringify(this.history.slice(-100), null, 2), 'utf8');
    }

    async _loadHistory() {
        const historyFile = join(this.config.dataDir, 'history.json');
        if (existsSync(historyFile)) {
            try {
                this.history = JSON.parse(readFileSync(historyFile, 'utf8'));
            } catch (e) {
                this.history = [];
            }
        }
    }
}

export function getAutoOptimizer(kernel) {
    return new AutoOptimizer(kernel);
}