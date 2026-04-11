/**
 * HundunOS v3.0 - 六部执行器
 * 礼部：文档撰写与报告
 * 
 * 升级特性：
 * - 更丰富的关键词匹配
 * - 任务类型特定处理逻辑
 * - 错误处理和超时
 */

import { createMinistry, safetyCheck } from './base.js';

// 配置
const LIBU_DOC_CONFIG = {
    id: 'libu_doc',
    name: '礼部',
    description: '文档撰写与报告',
    keywords: [
        // 核心关键词
        '写', '写文档', '写报告', '文档', '报告', '说明', '总结', '撰写',
        // 文档类型
        '公文', '方案', '计划', '记录', '笔记', '文章', '论文', '教程',
        // 格式化
        '格式', '排版', '目录', '大纲', '章节',
        // 内容类型
        '技术文档', '用户手册', 'API文档', 'README', ' changelog'
    ],
    tags: ['document', 'writing', 'report', 'article', 'documentation'],
    maxTokens: 1500,
    temperature: 0.4,
    parallelLimit: 2,
    systemPrompt: `你扮演「礼部」，职责是文档撰写和报告。

你的能力包括：
- 公文写作
- 技术文档撰写
- 报告和方案编写
- 会议记录和总结
- 说明文档
- 文章和教程

请输出规范、专业的文档内容。格式清晰，内容完整。`
};

// 任务类型处理
const TASK_HANDLERS = {
    // 公文写作
    official_document: {
        keywords: ['公文', '红头文件', '通知', '公告', '批复'],
        process: async (message, ministry) => {
            return {
                action: 'official_document_writing',
                suggestions: ['确定公文类型', '按照公文格式', '使用规范用语']
            };
        }
    },
    // 技术文档
    technical_doc: {
        keywords: ['技术文档', '文档', 'README', 'API', '接口', '手册'],
        process: async (message, ministry) => {
            return {
                action: 'technical_documentation',
                suggestions: ['结构化编写', '包含示例代码', '添加使用说明']
            };
        }
    },
    // 报告
    report: {
        keywords: ['报告', '总结', '汇报', '分析报告', '调研报告'],
        process: async (message, ministry) => {
            return {
                action: 'report_writing',
                suggestions: ['明确报告目的', '收集数据资料', '分析归纳', '给出结论']
            };
        }
    },
    // 方案
    proposal: {
        keywords: ['方案', '计划', '规划', '建议', '提案'],
        process: async (message, ministry) => {
            return {
                action: 'proposal_writing',
                suggestions: ['分析背景', '明确目标', '制定措施', '规划时间']
            };
        }
    },
    // 文章
    article: {
        keywords: ['文章', '教程', '博客', '笔记', '分享'],
        process: async (message, ministry) => {
            return {
                action: 'article_writing',
                suggestions: ['确定主题', '组织结构', '丰富内容', '添加图示']
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

// 创建礼部实例
export const libu_doc = createMinistry(LIBU_DOC_CONFIG);

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
    const matchScore = libu_doc.getMatchScore(message);

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
        return libu_doc.execute(message, tasks);
    }

    try {
        return await taskType.handler.process(message, libu_doc, tasks);
    } catch (error) {
        return {
            success: false,
            error: error.message,
            fallback: 'default_execute'
        };
    }
}

/**
 * 获取写作建议
 */
export function getSuggestions(message) {
    const taskType = identifyTaskType(message);
    const suggestions = taskType.handler?.suggestions || [
        '请说明文档类型和用途',
        '明确文档的主要内容',
        '指定格式要求（如有）'
    ];
    
    return {
        taskType: taskType.type,
        suggestions,
        keywords: libu_doc.keywords.slice(0, 10)
    };
}

export default libu_doc;