/**
 * HundunOS v3.0 - Evolution Extension
 * 智能进化扩展模块
 * 
 * 功能:
 * - 自我改进机制
 * - 学习记录
 * - GEP 协议集成
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// 进化类型
// ============================================================================

export const EvolutionType = {
    REPAIR:    'repair',    // 修复
    OPTIMIZE:  'optimize',  // 优化
    INNOVATE:  'innovate',  // 创新
    HARDEN:    'harden'     // 加固
};

/**
 * 进化事件
 */
export class EvolutionEvent {
    constructor(type, data) {
        this.id = `evo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        this.type = type;
        this.data = data;
        this.timestamp = new Date().toISOString();
        this.status = 'pending';
        this.result = null;
    }
}

// ============================================================================
// Evolution Extension
// ============================================================================

export class EvolutionExtension extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            dataDir: config.dataDir || path.join(__dirname, '../../../data/evolution'),
            autoEvolve: config.autoEvolve !== false,
            maxEvents: config.maxEvents || 1000,
            ...config
        };

        this.events = [];
        this.genes = new Map();
        this.stats = {
            total: 0,
            byType: {},
            successRate: 0
        };

        this._loadEvents();
        this._registerDefaultGenes();

        // console.log('[Evolution] Extension initialized');
    }

    // ========================================================================
    // 基因管理
    // ========================================================================

    /**
     * 注册进化基因
     */
    registerGene(gene) {
        this.genes.set(gene.id, gene);
        // console.log(`[Evolution] Gene registered: ${gene.id}`);
        return gene;
    }

    /**
     * 匹配基因
     */
    matchGene(signals) {
        let bestMatch = null;
        let bestScore = 0;

        for (const [id, gene] of this.genes) {
            const score = this._calculateMatchScore(gene.signals, signals);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = gene;
            }
        }

        return bestMatch;
    }

    // ========================================================================
    // 进化执行
    // ========================================================================

    /**
     * 触发进化
     */
    async evolve(type, data) {
        const event = new EvolutionEvent(type, data);
        this.events.push(event);
        this.stats.total++;

        // console.log(`[Evolution] Event triggered: ${type}`);
        this.emit('evolution_start', { event });

        // 匹配基因
        const gene = this.matchGene(data.signals || [type]);

        if (!gene) {
            event.status = 'no_match';
            this.emit('evolution_skip', { event });
            return event;
        }

        try {
            // 执行策略
            const result = await this._executeStrategy(gene, data);

            event.status = 'success';
            event.result = result;
            this.stats.byType[type] = (this.stats.byType[type] || 0) + 1;

            // console.log(`[Evolution] Event completed: ${type}`);
            this.emit('evolution_complete', { event, result });
        } catch (error) {
            event.status = 'failed';
            event.result = { error: error.message };

            console.error(`[Evolution] Event failed: ${type}`, error.message);
            this.emit('evolution_failed', { event, error });
        }

        this._saveEvents();
        this._updateStats();

        return event;
    }

    /**
     * 获取进化历史
     */
    getHistory(limit = 50) {
        return this.events.slice(-limit);
    }

    /**
     * 获取统计
     */
    getStats() {
        return this.stats;
    }

    // ========================================================================
    // 内部方法
    // ========================================================================

    _registerDefaultGenes() {
        // 修复基因
        this.registerGene({
            id: 'gene_repair_from_errors',
            type: EvolutionType.REPAIR,
            signals: ['error', 'exception', 'failed', 'unstable'],
            strategy: ['analyze', 'identify_root_cause', 'apply_fix', 'verify'],
            constraints: { maxFiles: 5, forbiddenPaths: ['node_modules', '.git'] }
        });

        // 优化基因
        this.registerGene({
            id: 'gene_optimize_performance',
            type: EvolutionType.OPTIMIZE,
            signals: ['optimize', 'improve', 'refactor', 'performance'],
            strategy: ['benchmark', 'identify_bottleneck', 'optimize', 'verify_improvement'],
            constraints: { maxFiles: 10, requiresTests: true }
        });

        // 创新基因
        this.registerGene({
            id: 'gene_innovate_capability',
            type: EvolutionType.INNOVATE,
            signals: ['feature_request', 'capability_gap', 'new_feature'],
            strategy: ['research', 'design', 'implement', 'integrate'],
            constraints: { maxFiles: 20, requiresReview: true }
        });

        // 加固基因
        this.registerGene({
            id: 'gene_harden_security',
            type: EvolutionType.HARDEN,
            signals: ['security', 'vulnerability', 'cve', 'exploit'],
            strategy: ['audit', 'identify_vulnerabilities', 'apply_patches', 'verify_security'],
            constraints: { requiresApproval: true }
        });
    }

    async _executeStrategy(gene, data) {
        const results = [];

        for (const step of gene.strategy) {
            const result = await this._executeStep(step, data);
            results.push({ step, result });
        }

        return { gene: gene.id, results };
    }

    async _executeStep(step, data) {
        // 简化的步骤执行
        return {
            step,
            status: 'completed',
            timestamp: new Date().toISOString()
        };
    }

    _calculateMatchScore(geneSignals, inputSignals) {
        let score = 0;
        for (const signal of inputSignals) {
            if (geneSignals.includes(signal)) {
                score++;
            }
        }
        return score / geneSignals.length;
    }

    _loadEvents() {
        try {
            const filePath = path.join(this.config.dataDir, 'evolution_events.json');
            if (fs.existsSync(filePath)) {
                this.events = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            }
        } catch (e) {
            console.error('[Evolution] Failed to load events:', e.message);
        }
    }

    _saveEvents() {
        try {
            const filePath = path.join(this.config.dataDir, 'evolution_events.json');
            if (!fs.existsSync(this.config.dataDir)) {
                fs.mkdirSync(this.config.dataDir, { recursive: true });
            }
            fs.writeFileSync(filePath, JSON.stringify(this.events.slice(-this.config.maxEvents), null, 2));
        } catch (e) {
            console.error('[Evolution] Failed to save events:', e.message);
        }
    }

    _updateStats() {
        const successCount = this.events.filter(e => e.status === 'success').length;
        this.stats.successRate = this.events.length > 0
            ? Math.round(successCount / this.events.length * 100)
            : 0;
    }
}

// ============================================================================
// 单例
// ============================================================================

let instance = null;

export function getEvolutionExtension() {
    if (!instance) {
        instance = new EvolutionExtension();
    }
    return instance;
}

export default {
    EvolutionExtension,
    getEvolutionExtension,
    EvolutionType,
    EvolutionEvent
};
