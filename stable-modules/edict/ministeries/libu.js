/**
 * HundunOS v3.0 - 六部执行器
 * 吏部：资源调度与任务分配
 * 
 * 升级特性：
 * - 更丰富的关键词匹配
 * - 任务类型特定处理逻辑
 * - 错误处理和超时
 */

import { createMinistry, safetyCheck } from './base.js';

// 配置
const LIBU_CONFIG = {
    id: 'libu',
    name: '吏部',
    description: '资源调度与任务分配',
    keywords: [
        // 核心关键词
        '安排', '分配', '调度', '计划', '规划', '协调', '组织',
        // 资源相关
        '资源', '人员', '时间', '优先级', '排期',
        // 项目管理
        '项目', '任务', '进度', '里程碑', 'deadline', '截止',
        // 团队协作
        '协作', '分工', '对接', '沟通', '同步'
    ],
    tags: ['schedule', 'resource', 'coordination', 'planning'],
    maxTokens: 1000,
    temperature: 0.4,
    parallelLimit: 2,
    systemPrompt: `你扮演「吏部」，职责是资源调度和任务分配。

你的能力包括：
- 任务分解和分配
- 资源协调和调度
- 进度规划和排期
- 优先级排序
- 团队协作建议
- 时间管理方案

请给出结构化的计划和建议。`
};

// 任务类型处理
const TASK_HANDLERS = {
    // 任务分配
    task_assignment: {
        keywords: ['分配', '分工', '安排任务', '指派'],
        process: async (message, ministry) => {
            return {
                action: 'task_assignment',
                suggestions: ['列出待分配任务', '评估人员能力', '确定分配方案']
            };
        }
    },
    // 进度规划
    scheduling: {
        keywords: ['计划', '规划', '排期', '进度', '时间线', 'timeline'],
        process: async (message, ministry) => {
            return {
                action: 'scheduling',
                suggestions: ['确定任务列表', '评估工时', '安排时间线', '设置里程碑']
            };
        }
    },
    // 资源协调
    resource_coordination: {
        keywords: ['资源', '协调', '调度', '冲突'],
        process: async (message, ministry) => {
            return {
                action: 'resource_coordination',
                suggestions: ['分析资源需求', '识别冲突', '提出协调方案']
            };
        }
    },
    // 优先级排序
    prioritization: {
        keywords: ['优先级', '排序', '重要', '紧急', '先后'],
        process: async (message, ministry) => {
            return {
                action: 'prioritization',
                suggestions: ['评估任务重要性', '判断紧急程度', '给出优先级排序']
            };
        }
    }
};

// 识别任务类型
function identifyTaskType(message) {
    const lowerMsg = message.toLowerCase();
    let bestMatch = { type: 'general', score: 0 };

    for (const [type, handler] of Object.entries(TASK_HANDLERS)) {
        const matchCount = handler.keywords.filter(kw => 
            lowerMsg.includes(kw.toLowerCase())
        ).length;
        
        if (matchCount > bestMatch.score) {
            bestMatch = { type, score: matchCount, handler };
        }
    }

    return bestMatch;
}

// 创建吏部实例
export const libu = createMinistry(LIBU_CONFIG);

/**
 * 预处理任务
 */
export async function preprocess(message, tasks = []) {
    // 安全检查
    const safetyResult = safetyCheck(message);
    if (!safetyResult.passed) {
        return {
            success: false,
            error: safetyResult.reason,
            blocked: true
        };
    }

    // 识别任务类型
    const taskType = identifyTaskType(message);
    
    // 获取匹配分数
    const matchScore = libu.getMatchScore(message);

    return {
        success: true,
        taskType: taskType.type,
        matchScore,
        handler: taskType.handler
    };
}

/**
 * 执行特定类型任务
 */
export async function executeTaskType(message, taskType, tasks = []) {
    if (!taskType.handler) {
        return libu.execute(message, tasks);
    }

    try {
        return await taskType.handler.process(message, libu, tasks);
    } catch (error) {
        return {
            success: false,
            error: error.message,
            fallback: 'default_execute'
        };
    }
}

/**
 * 获取调度建议
 */
export function getSuggestions(message) {
    const taskType = identifyTaskType(message);
    const suggestions = taskType.handler?.suggestions || [
        '请说明需要调度的资源类型',
        '列出待安排的任务',
        '说明时间或优先级要求'
    ];
    
    return {
        taskType: taskType.type,
        suggestions,
        keywords: libu.keywords.slice(0, 10)
    };
}

export default libu;