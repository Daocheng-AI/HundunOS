/**
 * HundunOS v3.0 - ModelRouter 策略模块
 * 实现 COST_FIRST / BALANCED / QUALITY_FIRST 三种策略
 */

// 策略类型
export const StrategyType = {
    COST_FIRST: 'COST_FIRST',      // 成本优先：始终选最便宜的
    BALANCED: 'BALANCED',          // 平衡模式：简单任务本地，复杂任务云端
    QUALITY_FIRST: 'QUALITY_FIRST' // 质量优先：始终选最好的
};

// 任务复杂度分类
export const TaskComplexity = {
    SIMPLE: 'SIMPLE',      // 简单：总结、翻译、简单问答
    MODERATE: 'MODERATE',  // 中等：代码、分析、报告
    COMPLEX: 'COMPLEX'     // 复杂：架构设计、多步骤任务
};

/**
 * 策略基类
 */
class Strategy {
    constructor(config = {}) {
        this.config = config;
    }

    /**
     * 选择最佳 provider
     * @param {Array} candidates - 可用 provider 列表
     * @param {Object} taskInfo - 任务信息
     * @returns {Object} 选中的 provider
     */
    select(candidates, taskInfo) {
        throw new Error('Strategy.select() must be implemented');
    }
}

/**
 * 成本优先策略
 * 始终选择成本最低的 provider
 */
export class CostFirstStrategy extends Strategy {
    select(candidates, taskInfo) {
        if (candidates.length === 0) return null;
        
        // 按成本排序，选择最便宜的
        return candidates.sort((a, b) => {
            const costA = a.costPer1M || 0;
            const costB = b.costPer1M || 0;
            return costA - costB;
        })[0];
    }
}

/**
 * 平衡策略
 * 简单任务用本地，复杂任务用云端
 */
export class BalancedStrategy extends Strategy {
    constructor(config = {}) {
        super(config);
        this.localFirst = config.localFirst !== false; // 默认本地优先
    }

    select(candidates, taskInfo) {
        if (candidates.length === 0) return null;

        const complexity = taskInfo.complexity || TaskComplexity.MODERATE;

        // 简单任务：优先本地
        if (complexity === TaskComplexity.SIMPLE || this.localFirst) {
            const local = candidates.find(c => c.type === 'LOCAL');
            if (local) return local;
        }

        // 复杂任务：优先云端（如果有）
        if (complexity === TaskComplexity.COMPLEX) {
            const cloud = candidates.find(c => c.type === 'CLOUD');
            if (cloud) return cloud;
        }

        // 中等任务或降级：按成本选择
        return new CostFirstStrategy().select(candidates, taskInfo);
    }
}

/**
 * 质量优先策略
 * 始终选择能力最强的 provider
 */
export class QualityFirstStrategy extends Strategy {
    select(candidates, taskInfo) {
        if (candidates.length === 0) return null;

        // 按模型能力排序（假设云端模型能力更强）
        const priority = {
            'CLOUD': 100,
            'LOCAL': 50
        };

        return candidates.sort((a, b) => {
            const priA = priority[a.type] || 0;
            const priB = priority[b.type] || 0;
            return priB - priA;
        })[0];
    }
}

/**
 * 策略工厂
 */
export function createStrategy(type, config = {}) {
    switch (type) {
        case StrategyType.COST_FIRST:
            return new CostFirstStrategy(config);
        case StrategyType.BALANCED:
            return new BalancedStrategy(config);
        case StrategyType.QUALITY_FIRST:
            return new QualityFirstStrategy(config);
        default:
            return new BalancedStrategy(config);
    }
}

/**
 * 任务复杂度评估器
 */
export function assessComplexity(content, intent = {}) {
    if (!content) return TaskComplexity.SIMPLE;

    const lowerContent = content.toLowerCase();
    const wordCount = content.split(/\s+/).length;

    // 复杂特征
    const complexKeywords = [
        '架构', '设计', '系统', '完整', '多步骤', '规划',
        '分析报告', '深入研究', '复杂', '详细方案'
    ];

    // 简单特征
    const simpleKeywords = [
        '总结', '翻译', '解释', '什么', '怎么', '查询',
        '搜索', '查找', '简单', '快速'
    ];

    // 检查复杂度
    const hasComplex = complexKeywords.some(kw => lowerContent.includes(kw));
    const hasSimple = simpleKeywords.some(kw => lowerContent.includes(kw));

    // 长度判断
    if (wordCount > 500 || hasComplex) {
        return TaskComplexity.COMPLEX;
    }

    if (wordCount < 50 && hasSimple) {
        return TaskComplexity.SIMPLE;
    }

    return TaskComplexity.MODERATE;
}

export default {
    StrategyType,
    TaskComplexity,
    createStrategy,
    assessComplexity,
    CostFirstStrategy,
    BalancedStrategy,
    QualityFirstStrategy
};
