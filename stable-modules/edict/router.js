/**
 * HundunOS v3.0 - edict 路由模块
 * 统一路由器：判断是否用 edict，以及是否需要 Task Hub
 * 
 * 升级特性：
 * - 基于白名单优先匹配
 * - 复杂任务识别（多维度规则）
 * - Task Hub 判断（多阶段项目）
 * - 与状态机集成的路由决策
 * 
 * 迁移自: edict/scripts/edict_router.py
 */

import { loadConfig, matchWhitelist } from './core/index.js';
import { AgentState } from './agents/index.js';

// ============================================================================
// 配置
// ============================================================================

const ROUTER_CONFIG = {
    // 简单查询阈值
    SIMPLE_QUERY_MAX_LENGTH: 30,
    // 复杂任务阈值
    COMPLEX_TASK_MIN_LENGTH: 100,
    // 多句子阈值
    MULTI_SENTENCE_MIN_LENGTH: 50,
    // 阶段识别最小关键词数
    STAGE_MIN_KEYWORDS: 2,
};

// ============================================================================
// 复杂任务识别规则（多维度）
// ============================================================================

// 阶段关键词 - 多阶段任务的标识
const STAGE_KEYWORDS = [
    /分[三四五六七八九十\d]+步/,
    /分(成|为|解)\s*[三四五六七八九十\d]+/,
    /[一二三四五六七八九十\d]+个阶段/,
    /(阶段|step|phase)\s*[三四五六七八九十\d]?/i,
    /第[一二三四五六七八九十\d]+[阶段步期]/,
];

// 项目关键词 - 长期/复杂项目的标识
const PROJECT_KEYWORDS = [
    /运营.*账号/,
    /搭建.*系统/,
    /规划.*(一年|半年|季度|月度)/,
    /持续.*(更新|迭代|执行)/,
    /建立.*知识库/,
    /管理.*项目/,
    /写书|写.*章节/,
    /长期.*任务/,
    /完成这个项目/,
    /帮我做.*规划/,
    /从零开始/,
    /完整的.*方案/,
    /创建任务/,
    /多阶段/,
    /分步.*执行/,
    /任务管理/,
    /系列.*内容/,
    /批量.*处理/,
];

// 操作类关键词 - 需要执行的操作
const ACTION_KEYWORDS = [
    /整理.*桌面/,
    /整理.*文件/,
    /清理.*缓存/,
    /批量.*重命名/,
    /导出.*数据/,
    /导入.*数据/,
];

// ============================================================================
// 任务类型识别（扩展版）
// ============================================================================

const TASK_TYPE_HINTS = {
    media_operation: {
        keywords: ['抖音', '快手', '小红书', '公众号', '新媒体', '内容运营', '发布', '短视频', '笔记', '种草'],
        weight: 1.2
    },
    knowledge_system: {
        keywords: ['知识库', '笔记', '知识管理', '资料库', '整理', '归档', '分类'],
        weight: 1.1
    },
    document: {
        keywords: ['写', '文档', '报告', '文章', '书', '章节', '总结', '方案'],
        weight: 1.0
    },
    code_project: {
        keywords: ['代码', 'python', '脚本', '程序', '开发', '实现', '编程', '调试'],
        weight: 1.1
    },
    data_analysis: {
        keywords: ['分析', '统计', '报表', 'excel', 'csv', '数据', '可视化'],
        weight: 1.2
    },
    system_operation: {
        keywords: ['整理', '清理', '桌面', '文件', '操作', '执行', '移动', '复制'],
        weight: 1.3
    },
    review: {
        keywords: ['检查', '审查', '审核', 'review', '测试', '验证', '看看'],
        weight: 1.0
    }
};

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 检查是否包含阶段关键词
 */
function hasStageKeywords(message) {
    return STAGE_KEYWORDS.some(kw => kw.test(message));
}

/**
 * 检查是否包含项目关键词
 */
function hasProjectKeywords(message) {
    return PROJECT_KEYWORDS.some(kw => kw.test(message));
}

/**
 * 检查是否包含操作关键词
 */
function hasActionKeywords(message) {
    return ACTION_KEYWORDS.some(kw => kw.test(message));
}

/**
 * 识别消息复杂度（多维度）
 */
function analyzeComplexity(message) {
    const result = {
        isComplex: false,
        reasons: [],
        score: 0
    };

    // 长度维度
    if (message.length > ROUTER_CONFIG.COMPLEX_TASK_MIN_LENGTH) {
        result.score += 3;
        result.reasons.push('long_message');
    } else if (message.length > ROUTER_CONFIG.MULTI_SENTENCE_MIN_LENGTH) {
        result.score += 1;
    }

    // 阶段关键词
    if (hasStageKeywords(message)) {
        result.score += 4;
        result.reasons.push('stage_keywords');
    }

    // 项目关键词
    if (hasProjectKeywords(message)) {
        result.score += 3;
        result.reasons.push('project_keywords');
    }

    // 操作关键词
    if (hasActionKeywords(message)) {
        result.score += 2;
        result.reasons.push('action_keywords');
    }

    // 多句子检查
    const sentences = message.split(/[。！？\n]/).filter(s => s.trim().length > 0);
    if (sentences.length >= 3) {
        result.score += 2;
        result.reasons.push('multi_sentence');
    }

    // 问号数量（表示需要多步骤解答）
    const questionCount = (message.match(/[？?]/g) || []).length;
    if (questionCount >= 2) {
        result.score += 1;
        result.reasons.push('multi_question');
    }

    result.isComplex = result.score >= 3;

    return result;
}

/**
 * 猜测任务类型（带权重）
 */
function guessTaskType(message) {
    const msg = message.toLowerCase();
    let bestType = 'general';
    let bestScore = 0;

    for (const [type, config] of Object.entries(TASK_TYPE_HINTS)) {
        const matchCount = config.keywords.filter(kw => 
            msg.includes(kw.toLowerCase())
        ).length;
        
        if (matchCount > 0) {
            const score = matchCount * (config.weight || 1.0);
            if (score > bestScore) {
                bestScore = score;
                bestType = type;
            }
        }
    }

    return bestType;
}

/**
 * 解析阶段数量
 */
function parseStageCount(message) {
    const numsMap = { 
        '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, 
        '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
        '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
        '6': 6, '7': 7, '8': 8, '9': 9, '10': 10
    };
    
    // 匹配中文数字或阿拉伯数字
    const patterns = [
        /分?([一二三四五六七八九十\d]+)\s*[步个阶段期]/,
        /([一二三四五六七八九十\d]+)\s*[步个阶段期]/,
    ];

    for (const pattern of patterns) {
        const m = message.match(pattern);
        if (m) {
            const raw = m[1];
            if (numsMap[raw] !== undefined) {
                return Math.min(numsMap[raw], 10); // 最多10个阶段
            }
            const parsed = parseInt(raw);
            if (!isNaN(parsed)) {
                return Math.min(parsed, 10);
            }
        }
    }

    return 3; // 默认3个阶段
}

/**
 * 根据任务类型生成默认阶段
 */
function guessStages(taskType, message = '') {
    const count = parseStageCount(message);
    
    const templates = {
        media_operation: ['账号定位', '内容规划', '素材准备', '发布执行', '数据复盘'],
        knowledge_system: ['需求分析', '架构设计', '内容建设', '整理优化', '上线测试'],
        document: ['资料收集', '大纲设计', '内容撰写', '审核校对', '定稿发布'],
        code_project: ['需求分析', '代码实现', '测试验证', '优化部署', '文档编写'],
        data_analysis: ['数据获取', '数据清洗', '分析建模', '可视化', '报告输出'],
        system_operation: ['目标扫描', '方案制定', '执行操作', '结果验证', '清理整理'],
        review: ['内容读取', '问题分析', '建议生成', '报告输出'],
        general: ['规划', '执行', '收尾']
    };

    const names = templates[taskType] || templates.general;
    return names.slice(0, count).map((name, i) => ({
        id: `stage_${i + 1}`,
        name,
        status: 'pending',
        order: i + 1
    }));
}

// ============================================================================
// 状态机集成接口
// ============================================================================

/**
 * 获取状态机状态对应的路由建议
 */
function getStateMachineAdvice(currentState, previousResults = {}) {
    const stateAdvice = {
        [AgentState.IDLE]: { route: 'edict', reason: '空闲状态，可以处理新任务' },
        [AgentState.WORKING]: { route: 'queue', reason: '有进行中的任务' },
        [AgentState.WAITING]: { route: 'edict', reason: '等待状态，可以处理新任务' },
        [AgentState.COMPLETED]: { route: 'edict', reason: '已完成上一任务' },
        [AgentState.FAILED]: { route: 'edict', reason: '可以重试或处理新任务' },
        [AgentState.BLOCKED]: { route: 'taskhub', reason: '任务阻塞，需要Task Hub介入' }
    };

    return stateAdvice[currentState] || stateAdvice[AgentState.IDLE];
}

// ============================================================================
// 路由判断（核心）
// ============================================================================

/**
 * 判断是否使用 edict（三省六部）
 * 
 * 优先级：
 * 1. 白名单匹配（最高优先级）
 * 2. 状态机建议
 * 3. 复杂任务识别
 * 4. 简单查询
 */
export function shouldUseEdict(message, context = {}) {
    // 1. 白名单匹配（最高优先级）
    const whitelistResult = matchWhitelist(message);
    if (whitelistResult) {
        return {
            use: true,
            reason: 'whitelist_match',
            directTo: whitelistResult.directTo,
            skipReview: whitelistResult.skipReview,
            source: 'whitelist'
        };
    }

    // 2. 状态机集成（如有上下文）
    if (context.agentState) {
        const advice = getStateMachineAdvice(context.agentState, context.previousResults);
        if (advice.route === 'queue') {
            return {
                use: false,
                reason: 'agent_busy',
                queueTask: true,
                source: 'state_machine'
            };
        }
    }

    // 3. 复杂度分析
    const complexity = analyzeComplexity(message);
    
    if (complexity.isComplex) {
        return {
            use: true,
            reason: 'complex_task',
            complexity,
            source: 'complexity_analysis'
        };
    }

    // 4. 多句子检查
    if (message.length > ROUTER_CONFIG.MULTI_SENTENCE_MIN_LENGTH) {
        const sentences = message.split(/[。！？\n]/).filter(s => s.trim().length > 0);
        if (sentences.length >= 2) {
            return {
                use: true,
                reason: 'multi_sentence',
                sentenceCount: sentences.length,
                source: 'sentence_analysis'
            };
        }
    }

    // 5. 操作类关键词（即使是短消息）
    if (hasActionKeywords(message)) {
        return {
            use: true,
            reason: 'action_required',
            source: 'action_keywords'
        };
    }

    // 默认：简单查询，不使用 edict
    return {
        use: false,
        reason: 'simple_query',
        source: 'default'
    };
}

/**
 * 判断是否需要 Task Hub（多阶段项目）
 */
export function shouldUseTaskHub(message, context = {}) {
    // 不使用 edict 则不需要 Task Hub
    const edictDecision = shouldUseEdict(message, context);
    if (!edictDecision.use) {
        return {
            use: false,
            reason: 'not_using_edict'
        };
    }

    // 复杂度分析
    const complexity = analyzeComplexity(message);

    // 需要 Task Hub 的条件
    const needsTaskHub = 
        complexity.isComplex || 
        hasStageKeywords(message) || 
        hasProjectKeywords(message) ||
        message.length > 200;

    if (!needsTaskHub) {
        return {
            use: false,
            reason: 'simple_edict_task',
            complexity
        };
    }

    // 识别任务类型和阶段
    const taskType = guessTaskType(message);
    const stages = guessStages(taskType, message);

    return {
        use: true,
        reason: 'complex_project',
        taskType,
        stages,
        complexity,
        estimatedDuration: stages.length * 5, // 估算分钟数
        source: 'task_hub_analysis'
    };
}

/**
 * 路由到 edict 处理
 */
export async function routeToEdict(message, userId = 'user', context = {}) {
    const { processMessage } = await import('./core/index.js');
    return processMessage(userId, message, context);
}

/**
 * 获取路由建议（带详细解释）
 */
export function getRoutingAdvice(message, context = {}) {
    const edictResult = shouldUseEdict(message, context);
    const taskHubResult = shouldUseTaskHub(message, context);
    const taskType = guessTaskType(message);

    return {
        useEdict: edictResult.use,
        useTaskHub: taskHubResult.use,
        edictReason: edictResult.reason,
        taskHubReason: taskHubResult.reason,
        taskType,
        stages: taskHubResult.stages || [],
        details: {
            complexity: analyzeComplexity(message),
            taskTypeInfo: TASK_TYPE_HINTS[taskType] || null,
            whitelistMatch: edictResult.source === 'whitelist'
        }
    };
}

// ============================================================================
// 导出（保持向后兼容）
// ============================================================================

export default {
    shouldUseEdict,
    shouldUseTaskHub,
    routeToEdict,
    getRoutingAdvice,
    // 内部函数也导出，供测试和扩展使用
    analyzeComplexity,
    guessTaskType,
    guessStages,
    parseStageCount,
    hasStageKeywords,
    hasProjectKeywords,
    hasActionKeywords,
    ROUTER_CONFIG
};
