/**
 * HundunOS v3.0 - Multi-Role Review
 * 多角色评估系统
 * 
 * 功能:
 * - 10种角色视角评估
 * - 27维度评分
 * - 改进建议生成
 */

import { EventEmitter } from 'events';

// ============================================================================
// 角色定义
// ============================================================================

export const Role = {
    NORMAL_USER:    'normal_user',
    PROGRAMMER:     'programmer',
    FRONTEND:       'frontend',
    ALGORITHM:      'algorithm',
    PRODUCT_MANAGER: 'product_manager',
    ARCHITECT:      'architect',
    AI_TRAINER:     'ai_trainer',
    TEACHER:        'teacher',
    PHILOSOPHER:    'philosopher',
    ECONOMIST:      'economist'
};

/**
 * 角色配置
 */
const ROLE_CONFIGS = {
    [Role.NORMAL_USER]: {
        name: '普通用户',
        focus: ['易用性', '响应速度', '错误提示'],
        weights: { usability: 0.5, performance: 0.3, reliability: 0.2 }
    },
    [Role.PROGRAMMER]: {
        name: '程序员',
        focus: ['代码质量', '可维护性', '文档'],
        weights: { codeQuality: 0.4, maintainability: 0.3, documentation: 0.3 }
    },
    [Role.FRONTEND]: {
        name: '前端工程师',
        focus: ['UI设计', '交互体验', '性能'],
        weights: { uiDesign: 0.4, interaction: 0.3, performance: 0.3 }
    },
    [Role.ALGORITHM]: {
        name: '算法工程师',
        focus: ['算法效率', '准确率', '可扩展性'],
        weights: { efficiency: 0.4, accuracy: 0.4, scalability: 0.2 }
    },
    [Role.PRODUCT_MANAGER]: {
        name: '产品经理',
        focus: ['功能完整性', '用户体验', '商业价值'],
        weights: { features: 0.4, ux: 0.3, value: 0.3 }
    },
    [Role.ARCHITECT]: {
        name: '系统架构师',
        focus: ['架构设计', '可扩展性', '安全性'],
        weights: { architecture: 0.4, scalability: 0.3, security: 0.3 }
    },
    [Role.AI_TRAINER]: {
        name: 'AI训练师',
        focus: ['模型性能', '数据质量', '可训练性'],
        weights: { modelPerformance: 0.4, dataQuality: 0.3, trainability: 0.3 }
    },
    [Role.TEACHER]: {
        name: '教师',
        focus: ['教学内容', '易理解性', '互动性'],
        weights: { content: 0.4, clarity: 0.4, engagement: 0.2 }
    },
    [Role.PHILOSOPHER]: {
        name: '哲学家',
        focus: ['伦理考量', '社会影响', '思想深度'],
        weights: { ethics: 0.4, socialImpact: 0.3, depth: 0.3 }
    },
    [Role.ECONOMIST]: {
        name: '经济学家',
        focus: ['成本效益', '资源分配', '市场影响'],
        weights: { costBenefit: 0.4, resourceAllocation: 0.3, marketImpact: 0.3 }
    }
};

// ============================================================================
// 评估维度
// ============================================================================

export const Dimension = {
    // 通用
    USABILITY:           'usability',
    PERFORMANCE:         'performance',
    RELIABILITY:         'reliability',
    
    // 技术质量
    CODE_QUALITY:        'codeQuality',
    MAINTAINABILITY:     'maintainability',
    DOCUMENTATION:       'documentation',
    TEST_COVERAGE:       'testCoverage',
    
    // 架构
    ARCHITECTURE:        'architecture',
    SCALABILITY:         'scalability',
    SECURITY:            'security',
    
    // 用户体验
    UI_DESIGN:           'uiDesign',
    INTERACTION:         'interaction',
    ACCESSIBILITY:       'accessibility',
    
    // 产品
    FEATURES:            'features',
    UX:                  'ux',
    VALUE:               'value',
    
    // 算法
    EFFICIENCY:          'efficiency',
    ACCURACY:            'accuracy',
    
    // AI
    MODEL_PERFORMANCE:   'modelPerformance',
    DATA_QUALITY:        'dataQuality',
    TRAINABILITY:        'trainability',
    
    // 内容
    CONTENT:             'content',
    CLARITY:             'clarity',
    ENGAGEMENT:          'engagement',
    
    // 其他
    ETHICS:              'ethics',
    SOCIAL_IMPACT:       'socialImpact',
    COST_BENEFIT:        'costBenefit'
};

// ============================================================================
// Multi-Role Reviewer
// ============================================================================

export class MultiRoleReviewer extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            enabledRoles: config.enabledRoles || Object.values(Role),
            weights: config.weights || {},
            ...config
        };

        this.history = [];
        this.aggregateStats = {
            totalReviews: 0,
            averageScore: 0,
            byRole: {}
        };

        console.log('[MultiRoleReview] Initialized with', this.config.enabledRoles.length, 'roles');
    }

    // ========================================================================
    // 评估执行
    // ========================================================================

    /**
     * 执行评估
     */
    async review(scores, context = {}) {
        const results = {
            timestamp: new Date().toISOString(),
            context,
            byRole: {},
            overall: 0,
            recommendations: []
        };

        // 按角色评估
        for (const role of this.config.enabledRoles) {
            const roleResult = this._evaluateRole(role, scores);
            results.byRole[role] = roleResult;
        }

        // 计算总分
        results.overall = this._calculateOverall(results.byRole);

        // 生成建议
        results.recommendations = this._generateRecommendations(results);

        // 更新统计
        this._updateStats(results);

        // 记录历史
        this.history.push(results);

        this.emit('review_complete', results);

        return results;
    }

    /**
     * 获取角色视角的评估
     */
    _evaluateRole(role, scores) {
        const config = ROLE_CONFIGS[role];
        if (!config) {
            return { score: 0, dimensions: {} };
        }

        const dimensions = {};
        let totalWeight = 0;
        let weightedScore = 0;

        for (const [dim, weight] of Object.entries(config.weights)) {
            const score = scores[dim] || 50; // 默认50分
            dimensions[dim] = score;
            weightedScore += score * weight;
            totalWeight += weight;
        }

        return {
            role,
            name: config.name,
            score: totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0,
            dimensions,
            focus: config.focus
        };
    }

    /**
     * 计算总分
     */
    _calculateOverall(byRole) {
        const scores = Object.values(byRole).map(r => r.score);
        return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    }

    /**
     * 生成建议
     */
    _generateRecommendations(results) {
        const recommendations = [];

        // 找出薄弱维度
        for (const [role, data] of Object.entries(results.byRole)) {
            for (const [dim, score] of Object.entries(data.dimensions)) {
                if (score < 60) {
                    recommendations.push({
                        priority: 'high',
                        role,
                        dimension: dim,
                        currentScore: score,
                        suggestion: `需要提升 ${dim} 维度（当前 ${score} 分）`
                    });
                } else if (score < 80) {
                    recommendations.push({
                        priority: 'medium',
                        role,
                        dimension: dim,
                        currentScore: score,
                        suggestion: `建议改进 ${dim} 维度（当前 ${score} 分）`
                    });
                }
            }
        }

        // 按优先级排序
        return recommendations.sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority === 'high' ? -1 : 1;
            }
            return a.currentScore - b.currentScore;
        }).slice(0, 10);
    }

    // ========================================================================
    // 查询接口
    // ========================================================================

    /**
     * 获取历史
     */
    getHistory(limit = 10) {
        return this.history.slice(-limit);
    }

    /**
     * 获取统计
     */
    getStats() {
        return this.aggregateStats;
    }

    /**
     * 获取角色配置
     */
    getRoleConfig(role) {
        return ROLE_CONFIGS[role];
    }

    // ========================================================================
    // 内部方法
    // ========================================================================

    _updateStats(results) {
        this.aggregateStats.totalReviews++;
        
        // 更新平均分
        const total = this.aggregateStats.totalReviews;
        const prevAvg = this.aggregateStats.averageScore;
        this.aggregateStats.averageScore = Math.round(
            (prevAvg * (total - 1) + results.overall) / total
        );

        // 更新角色统计
        for (const [role, data] of Object.entries(results.byRole)) {
            if (!this.aggregateStats.byRole[role]) {
                this.aggregateStats.byRole[role] = {
                    count: 0,
                    averageScore: 0
                };
            }
            const roleStats = this.aggregateStats.byRole[role];
            roleStats.count++;
            roleStats.averageScore = Math.round(
                (roleStats.averageScore * (roleStats.count - 1) + data.score) / roleStats.count
            );
        }
    }
}

// ============================================================================
// 单例
// ============================================================================

let instance = null;

export function getMultiRoleReviewer() {
    if (!instance) {
        instance = new MultiRoleReviewer();
    }
    return instance;
}

export default {
    MultiRoleReviewer,
    getMultiRoleReviewer,
    Role,
    Dimension
};
