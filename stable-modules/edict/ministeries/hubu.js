/**
 * HundunOS v3.0 - 六部执行器
 * 户部：数据处理与分析
 * 
 * 升级特性：
 * - 更丰富的关键词匹配
 * - 任务类型特定处理逻辑
 * - 错误处理和超时
 */

import { createMinistry, safetyCheck } from './base.js';

// 配置
const HUBU_CONFIG = {
    id: 'hubu',
    name: '户部',
    description: '数据处理与分析',
    keywords: [
        // 核心关键词
        '数据', '分析', '统计', '报表', 'excel', 'csv', '表格', '处理',
        // 高级分析
        '可视化', '图表', 'dashboard', '趋势', '预测', '建模',
        // 数据操作
        '清洗', '转换', '导出', '导入', '整理',
        // 工具相关
        'python', 'pandas', 'numpy', '数据分析', '数据处理'
    ],
    tags: ['data', 'analysis', 'excel', 'statistics'],
    maxTokens: 1200,
    temperature: 0.3,
    parallelLimit: 3,
    systemPrompt: `你扮演「户部」，职责是处理数据、生成报表和统计分析。

你的能力包括：
- 数据清洗和转换（Excel、CSV、JSON等格式）
- 统计分析和报表生成
- 数据可视化建议（图表、仪表盘）
- 趋势分析和预测
- Python数据分析（pandas、numpy）

请用专业但易懂的语言回答，输出结构化的结果。对于代码，需要包含完整的可运行代码。`
};

// 任务类型处理
const TASK_HANDLERS = {
    // Excel操作
    excel: {
        keywords: ['excel', 'xlsx', '表格', 'sheet'],
        process: async (message, ministry) => {
            return {
                action: 'excel_operation',
                suggestions: ['读取Excel数据', '数据清洗', '生成报表', '导出结果']
            };
        }
    },
    // 统计分析
    statistics: {
        keywords: ['统计', '分析', '均值', '中位数', '方差', '标准差'],
        process: async (message, ministry) => {
            return {
                action: 'statistical_analysis',
                suggestions: ['描述性统计', '相关性分析', '回归分析']
            };
        }
    },
    // 数据可视化
    visualization: {
        keywords: ['可视化', '图表', '画图', 'dashboard', '折线图', '柱状图', '饼图'],
        process: async (message, ministry) => {
            return {
                action: 'data_visualization',
                suggestions: ['选择图表类型', '绑定数据', '生成图表代码']
            };
        }
    },
    // 数据清洗
    cleaning: {
        keywords: ['清洗', '清理', '去重', '缺失值', '空值', '异常值'],
        process: async (message, ministry) => {
            return {
                action: 'data_cleaning',
                suggestions: ['检测缺失值', '处理异常值', '去重', '数据类型转换']
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

// 创建户部实例
export const hubu = createMinistry(HUBU_CONFIG);

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
    const matchScore = hubu.getMatchScore(message);

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
        return hubu.execute(message, tasks);
    }

    try {
        return await taskType.handler.process(message, hubu, tasks);
    } catch (error) {
        return {
            success: false,
            error: error.message,
            fallback: 'default_execute'
        };
    }
}

/**
 * 获取数据处理建议
 */
export function getSuggestions(message) {
    const taskType = identifyTaskType(message);
    const suggestions = taskType.handler?.suggestions || [
        '请提供具体的数据或文件',
        '说明需要进行的分析类型',
        '明确输出格式要求'
    ];
    
    return {
        taskType: taskType.type,
        suggestions,
        keywords: hubu.keywords.slice(0, 10)
    };
}

export default hubu;
