/**
 * HundunOS v3.0 - 六部执行器
 * 兵部：技术实现与编码
 * 
 * 升级特性：
 * - 更丰富的关键词匹配
 * - 任务类型特定处理逻辑
 * - 错误处理和超时
 */

import { createMinistry, safetyCheck } from './base.js';

// 配置
const BINGBU_CONFIG = {
    id: 'bingbu',
    name: '兵部',
    description: '技术实现与编码',
    keywords: [
        // 核心关键词
        '代码', '写', '编程', '开发', '实现', '脚本',
        // 语言相关
        'python', 'javascript', 'js', 'typescript', 'java', 'go', 'rust', 'c++',
        // 开发相关
        '函数', '类', '模块', '接口', 'api', '算法', '数据结构',
        '调试', 'debug', '测试', 'bug',
        // 项目相关
        '项目', '框架', '库', 'package', '依赖', '安装'
    ],
    tags: ['code', 'programming', 'development', 'python', 'javascript'],
    maxTokens: 1500,
    temperature: 0.2,
    parallelLimit: 2,
    systemPrompt: `你扮演「兵部」，职责是技术实现、编写代码和脚本。

你的能力包括：
- Python/JavaScript/TypeScript代码编写
- 算法实现和数据结构
- API设计和集成
- 脚本开发和自动化
- 代码调试和优化
- 技术方案设计

请输出可执行的代码或清晰的技术方案。代码要有注释，逻辑清晰，包含必要的错误处理。`
};

// 任务类型处理
const TASK_HANDLERS = {
    // Python任务
    python: {
        keywords: ['python', 'py文件', 'django', 'flask', 'pandas', 'numpy'],
        process: async (message, ministry) => {
            return {
                action: 'python_development',
                language: 'python',
                suggestions: ['编写Python脚本', '使用pandas处理数据', 'Flask/Django Web开发']
            };
        }
    },
    // JavaScript任务
    javascript: {
        keywords: ['javascript', 'js', 'node', '前端', 'react', 'vue', 'typescript'],
        process: async (message, ministry) => {
            return {
                action: 'javascript_development',
                language: 'javascript',
                suggestions: ['编写JS脚本', 'Node.js后端开发', '前端页面开发']
            };
        }
    },
    // 算法实现
    algorithm: {
        keywords: ['算法', '排序', '查找', '二叉树', '图', '动态规划', '贪心'],
        process: async (message, ministry) => {
            return {
                action: 'algorithm_implementation',
                suggestions: ['选择合适算法', '分析复杂度', '实现代码']
            };
        }
    },
    // 调试
    debug: {
        keywords: ['调试', 'debug', '报错', '错误', '修复', 'bug', '问题'],
        process: async (message, ministry) => {
            return {
                action: 'code_debugging',
                suggestions: ['分析错误信息', '定位问题', '修复代码']
            };
        }
    },
    // API开发
    api: {
        keywords: ['api', '接口', 'rest', 'http', '请求', '响应', 'json'],
        process: async (message, ministry) => {
            return {
                action: 'api_development',
                suggestions: ['设计API接口', '实现RESTful', '编写文档']
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

// 创建兵部实例
export const bingbu = createMinistry(BINGBU_CONFIG);

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
    const matchScore = bingbu.getMatchScore(message);

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
        return bingbu.execute(message, tasks);
    }

    try {
        return await taskType.handler.process(message, bingbu, tasks);
    } catch (error) {
        return {
            success: false,
            error: error.message,
            fallback: 'default_execute'
        };
    }
}

/**
 * 获取编码建议
 */
export function getSuggestions(message) {
    const taskType = identifyTaskType(message);
    const suggestions = taskType.handler?.suggestions || [
        '请说明需要实现的具体功能',
        '指定编程语言（如有偏好）',
        '说明输入输出要求'
    ];
    
    return {
        taskType: taskType.type,
        suggestions,
        language: taskType.handler?.language,
        keywords: bingbu.keywords.slice(0, 10)
    };
}

export default bingbu;