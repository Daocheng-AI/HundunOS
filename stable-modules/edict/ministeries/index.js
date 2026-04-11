/**
 * HundunOS v3.0 - 六部执行器统一导出
 * 
 * 更新支持：
 * - 多 Provider 配置
 * - 任务类型匹配权重
 * - 并行执行能力
 */

import { createMinistry, calculateMatchScore } from './base.js';
import { hubu } from './hubu.js';
import { bingbu } from './bingbu.js';
import { gongbu } from './gongbu.js';
import { libu } from './libu.js';
import { xingbu } from './xingbu.js';
import { libu_doc } from './libu_doc.js';

// ============================================================================
// 部门注册表
// ============================================================================

export const ministeries = {
    hubu,
    bingbu,
    gongbu,
    libu,
    xingbu,
    libu_doc
};

// ============================================================================
// 部门选择（带权重）
// ============================================================================

/**
 * 根据消息内容选择最匹配的部门（带权重）
 */
export function selectMinistry(message, useWeights = true) {
    let bestMatch = null;
    let bestScore = 0;
    let bestDetails = null;

    for (const [id, ministry] of Object.entries(ministeries)) {
        let score;
        
        if (useWeights) {
            // 使用权重系统
            const result = calculateMatchScore(message, ministry);
            score = result.score;
            bestDetails = result;
        } else {
            // 简单关键词计数
            score = ministry.keywords.filter(kw => 
                message.toLowerCase().includes(kw.toLowerCase())
            ).length;
        }

        if (score > bestScore) {
            bestScore = score;
            bestMatch = ministry;
            bestDetails = bestDetails || { score, matchedKeywords: [] };
        }
    }

    // 如果没有匹配，使用默认兵部
    if (!bestMatch || bestScore === 0) {
        bestMatch = bingbu;
        bestDetails = { score: 0, matchedKeywords: [], reason: 'no_match_use_default' };
    }

    return {
        ministry: bestMatch,
        score: bestScore,
        details: bestDetails
    };
}

/**
 * 获取所有部门的匹配分数
 */
export function getAllMatchScores(message) {
    const results = [];
    
    for (const [id, ministry] of Object.entries(ministeries)) {
        const result = calculateMatchScore(message, ministry);
        results.push({
            id: ministry.id,
            name: ministry.name,
            ...result
        });
    }

    // 按分数排序
    return results.sort((a, b) => b.score - a.score);
}

/**
 * 获取部门列表
 */
export function listMinisteries() {
    return Object.values(ministeries).map(m => ({
        id: m.id,
        name: m.name,
        description: m.description,
        keywords: m.keywords.slice(0, 5),
        tags: m.tags,
        providerType: m.providerType
    }));
}

/**
 * 获取部门实例
 */
export function getMinistry(id) {
    return ministeries[id] || null;
}

/**
 * 获取所有可用部门类型
 */
export function getMinistryTypes() {
    return Object.keys(ministeries);
}

// ============================================================================
// 批量执行
// ============================================================================

/**
 * 批量执行任务
 */
export async function executeBatch(tasks, options = {}) {
    const { parallel = false, maxParallel = 3 } = options;
    
    if (parallel) {
        // 并行执行
        const promises = tasks.map(async (task) => {
            const { ministry } = selectMinistry(task.message);
            return ministry.execute(task.message, task.tasks || [], options);
        });
        
        return Promise.all(promises);
    } else {
        // 串行执行
        const results = [];
        for (const task of tasks) {
            const { ministry } = selectMinistry(task.message);
            const result = await ministry.execute(task.message, task.tasks || [], options);
            results.push(result);
        }
        return results;
    }
}

// ============================================================================
// 配置更新
// ============================================================================

/**
 * 更新部门配置
 */
export function updateMinistryConfig(id, config) {
    const ministry = ministeries[id];
    if (ministry) {
        ministry.updateConfig(config);
        return { success: true, id };
    }
    return { success: false, error: 'Ministry not found' };
}

/**
 * 批量更新配置
 */
export function updateAllMinistryConfigs(config) {
    const results = {};
    for (const [id, ministry] of Object.entries(ministeries)) {
        ministry.updateConfig(config);
        results[id] = 'updated';
    }
    return results;
}

// ============================================================================
// 初始化（支持自定义 Provider）
// ============================================================================

/**
 * 重新初始化指定部门（支持自定义 Provider）
 */
export function reinitMinistry(id, config) {
    const oldMinistry = ministeries[id];
    
    // 创建新的部门实例
    const newMinistry = createMinistry({
        ...oldMinistry.getInfo(),
        ...config
    });
    
    ministeries[id] = newMinistry;
    
    return {
        success: true,
        id,
        oldProvider: oldMinistry.providerType,
        newProvider: newMinistry.providerType
    };
}

// ============================================================================
// 导出
// ============================================================================

export default ministeries;