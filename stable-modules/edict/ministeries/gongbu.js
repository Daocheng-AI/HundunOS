/**
 * HundunOS v3.0 - 六部执行器
 * 工部：执行操作与系统任务
 * 
 * 升级特性：
 * - 更丰富的关键词匹配
 * - 任务类型特定处理逻辑
 * - 错误处理和超时
 */

import { createMinistry, safetyCheck } from './base.js';

// 配置
const GONGBU_CONFIG = {
    id: 'gongbu',
    name: '工部',
    description: '执行操作与系统任务',
    keywords: [
        // 核心关键词
        '整理', '清理', '执行', '操作', '文件', '桌面', '移动', '复制',
        '删除', '重命名', '创建', '目录', '文件夹',
        // 文件操作
        '压缩', '解压', '导出', '导入', '备份',
        // 系统操作
        '系统', '设置', '配置', '安装', '卸载',
        // 搜索相关
        '搜索', '查找', '定位', '批量'
    ],
    tags: ['file', 'operation', 'system', 'desktop', 'cleanup'],
    maxTokens: 800,
    temperature: 0.3,
    parallelLimit: 2,
    systemPrompt: `你扮演「工部」，职责是执行操作和系统任务。

你的能力包括：
- 文件整理和操作（移动、复制、删除、重命名）
- 桌面清理和整理
- 批量文件处理
- 系统维护任务
- 文件搜索和定位

请给出清晰的操作步骤或执行结果。`
};

// 任务类型处理
const TASK_HANDLERS = {
    // 桌面整理
    desktop_cleanup: {
        keywords: ['桌面', '整理桌面', '清理桌面', '图标'],
        process: async (message, ministry) => {
            return {
                action: 'desktop_cleanup',
                suggestions: ['扫描桌面文件', '按类型分类', '创建整理方案']
            };
        }
    },
    // 文件整理
    file_organization: {
        keywords: ['文件', '整理', '文件夹', '目录'],
        process: async (message, ministry) => {
            return {
                action: 'file_organization',
                suggestions: ['分析文件结构', '按类型分类', '创建整理规则']
            };
        }
    },
    // 批量操作
    batch_operation: {
        keywords: ['批量', '多个', '批量重命名', '批量移动'],
        process: async (message, ministry) => {
            return {
                action: 'batch_operation',
                suggestions: ['选择目标文件', '定义操作规则', '执行批量操作']
            };
        }
    },
    // 搜索
    search: {
        keywords: ['搜索', '查找', '找文件', '定位'],
        process: async (message, ministry) => {
            return {
                action: 'file_search',
                suggestions: ['定义搜索条件', '执行搜索', '展示结果']
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

// 创建工部实例
export const gongbu = createMinistry(GONGBU_CONFIG);

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
    const matchScore = gongbu.getMatchScore(message);

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
        return gongbu.execute(message, tasks);
    }

    try {
        return await taskType.handler.process(message, gongbu, tasks);
    } catch (error) {
        return {
            success: false,
            error: error.message,
            fallback: 'default_execute'
        };
    }
}

/**
 * 获取操作建议
 */
export function getSuggestions(message) {
    const taskType = identifyTaskType(message);
    const suggestions = taskType.handler?.suggestions || [
        '请说明具体的操作需求',
        '指定目标位置（如有）',
        '说明文件类型或数量'
    ];
    
    return {
        taskType: taskType.type,
        suggestions,
        keywords: gongbu.keywords.slice(0, 10)
    };
}

export default gongbu;