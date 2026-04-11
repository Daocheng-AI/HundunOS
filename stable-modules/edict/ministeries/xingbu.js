/**
 * HundunOS v3.0 - 六部执行器
 * 刑部：审核检查与代码审查
 * 
 * 升级特性：
 * - 更丰富的关键词匹配
 * - 任务类型特定处理逻辑
 * - 错误处理和超时
 */

import { createMinistry, safetyCheck } from './base.js';

// 配置
const XINGBU_CONFIG = {
    id: 'xingbu',
    name: '刑部',
    description: '审核检查与代码审查',
    keywords: [
        // 核心关键词
        '检查', '审查', '审核', 'review', '测试', '验证', '看', '看看',
        // 代码审查
        '代码审查', 'review代码', '代码检查', '静态分析', 'lint',
        // 质量检查
        '质量', '规范', '风格', '格式', '最佳实践',
        // 问题发现
        '问题', 'bug', '漏洞', '风险', '安全隐患'
    ],
    tags: ['review', 'audit', 'quality', 'security', 'testing'],
    maxTokens: 1200,
    temperature: 0.2,
    parallelLimit: 2,
    systemPrompt: `你扮演「刑部」，职责是审核检查和代码审查。

你的能力包括：
- 代码审查和质量检查
- 安全漏洞检测
- 代码风格规范检查
- 逻辑错误发现
- 性能问题诊断
- 测试覆盖率评估

请仔细检查，指出问题和改进建议。输出要具体、可操作。`
};

// 任务类型处理
const TASK_HANDLERS = {
    // 代码审查
    code_review: {
        keywords: ['代码审查', 'review代码', '代码检查', 'review code', '检查代码'],
        process: async (message, ministry) => {
            return {
                action: 'code_review',
                suggestions: ['读取代码', '分析代码结构', '检查潜在问题', '给出改进建议']
            };
        }
    },
    // 安全检查
    security_audit: {
        keywords: ['安全', '漏洞', 'security', 'hack', '注入', 'xss'],
        process: async (message, ministry) => {
            return {
                action: 'security_audit',
                suggestions: ['检查输入验证', '检查认证授权', '检查数据加密', '检查敏感信息']
            };
        }
    },
    // 代码规范
    code_style: {
        keywords: ['规范', '风格', 'format', 'lint', '格式化'],
        process: async (message, ministry) => {
            return {
                action: 'code_style_check',
                suggestions: ['检查命名规范', '检查代码格式', '检查注释', '检查复杂度']
            };
        }
    },
    // 逻辑审查
    logic_review: {
        keywords: ['逻辑', '算法', '流程', '判断'],
        process: async (message, ministry) => {
            return {
                action: 'logic_review',
                suggestions: ['分析逻辑流程', '检查边界条件', '识别潜在问题']
            };
        }
    },
    // 测试验证
    testing: {
        keywords: ['测试', 'test', '验证', '单元测试', '集成测试'],
        process: async (message, ministry) => {
            return {
                action: 'testing_review',
                suggestions: ['评估测试覆盖', '检查测试用例', '验证测试结果']
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

// 创建刑部实例
export const xingbu = createMinistry(XINGBU_CONFIG);

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
    const matchScore = xingbu.getMatchScore(message);

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
        return xingbu.execute(message, tasks);
    }

    try {
        return await taskType.handler.process(message, xingbu, tasks);
    } catch (error) {
        return {
            success: false,
            error: error.message,
            fallback: 'default_execute'
        };
    }
}

/**
 * 获取审查建议
 */
export function getSuggestions(message) {
    const taskType = identifyTaskType(message);
    const suggestions = taskType.handler?.suggestions || [
        '请提供需要审查的代码',
        '说明审查的重点（如安全、性能、风格）',
        '指定审查范围'
    ];
    
    return {
        taskType: taskType.type,
        suggestions,
        keywords: xingbu.keywords.slice(0, 10)
    };
}

export default xingbu;