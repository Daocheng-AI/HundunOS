// hundunos/extension-modules/feedback/index.js — Feedback Collection System
// 功能: 反馈收集、处理、分析、响应
// 状态: 新增

import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const FeedbackType = {
    BUG_REPORT: 'bug_report',        // Bug报告
    FEATURE_REQUEST: 'feature_request', // 功能请求
    IMPROVEMENT: 'improvement',      // 改进建议
    COMPLAINT: 'complaint',          // 投诉
    COMPLAIMENT: 'compliment',       // 表扬
    QUESTION: 'question',            // 问题
    OTHER: 'other'
};

export const FeedbackStatus = {
    NEW: 'new',                      // 新提交
    triAGED: 'triaged',              // 已分类
    IN_PROGRESS: 'in_progress',      // 处理中
    RESOLVED: 'resolved',            // 已解决
    CLOSED: 'closed',                // 已关闭
    REJECTED: 'rejected'             // 已拒绝
};

export const FeedbackPriority = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical'
};

export class FeedbackSystem {
    constructor(kernel) {
        this.kernel = kernel;
        this.feedbackList = new Map();
        this.anonymousStats = { total: 0, byType: {}, byPriority: {} };
        
        this.config = {
            feedbackDir: join(__dirname, '..', '..', 'data', 'feedback'),
            autoTriage: true,
            sentimentThreshold: 0.3  // 负面情感阈值
        };
        
        this.stats = {
            submitted: 0,
            resolved: 0,
            avgResolutionTime: 0,
            satisfaction: 0
        };
    }

    async initialize() {
        mkdirSync(this.config.feedbackDir, { recursive: true });
        
        // 加载历史反馈
        await this._loadFeedback();
        
        console.log('[Feedback] Initialized with', this.feedbackList.size, 'feedbacks');
    }

    /**
     * 提交反馈
     */
    submit(feedbackData) {
        const feedbackId = feedbackData.id || `fb_${randomUUID()}`;
        
        const feedback = {
            id: feedbackId,
            
            // 内容
            type: feedbackData.type || FeedbackType.OTHER,
            title: feedbackData.title,
            description: feedbackData.description,
            attachments: feedbackData.attachments || [],
            
            // 来源
            userId: feedbackData.userId || 'anonymous',
            sessionId: feedbackData.sessionId,
            userAgent: feedbackData.userAgent,
            
            // 元数据
            createdAt: Date.now(),
            updatedAt: Date.now(),
            status: FeedbackStatus.NEW,
            priority: FeedbackPriority.MEDIUM,
            tags: feedbackData.tags || [],
            
            // 处理
            assignee: null,
            resolution: null,
            response: null,
            satisfaction: null,
            
            // 分析
            sentiment: feedbackData.sentiment,  // 情感分析结果
            category: null,                     // 自动分类
            relatedIssues: []                   // 关联的问题
        };
        
        // 自动分类
        if (this.config.autoTriage) {
            this._autoTriage(feedback);
        }
        
        this.feedbackList.set(feedbackId, feedback);
        this._saveFeedback(feedback);
        
        this.stats.submitted++;
        this._updateAnonymousStats(feedback);
        
        console.log(`[Feedback] Submitted: ${feedbackId} (${feedback.type})`);
        
        return {
            success: true,
            feedbackId,
            status: feedback.status,
            priority: feedback.priority
        };
    }

    /**
     * 自动分类反馈
     */
    _autoTriage(feedback) {
        const desc = feedback.description.toLowerCase();
        
        // 类型识别
        if (desc.includes('bug') || desc.includes('错误') || desc.includes('崩溃')) {
            feedback.type = FeedbackType.BUG_REPORT;
            feedback.priority = FeedbackPriority.HIGH;
        } else if (desc.includes('希望') || desc.includes('想要') || desc.includes('建议')) {
            feedback.type = FeedbackType.FEATURE_REQUEST;
        } else if (desc.includes('不好') || desc.includes('差') || desc.includes('失望')) {
            feedback.type = FeedbackType.COMPLAINT;
            feedback.priority = FeedbackPriority.HIGH;
        } else if (desc.includes('好') || desc.includes('棒') || desc.includes('喜欢')) {
            feedback.type = FeedbackType.COMPLAIMENT;
        }
        
        // 关键词标签
        const keywords = ['性能', '功能', '界面', '文档', '稳定性', '兼容性'];
        for (const kw of keywords) {
            if (desc.includes(kw)) {
                feedback.tags.push(kw);
            }
        }
        
        feedback.status = FeedbackStatus.TRIAGED;
    }

    /**
     * 更新状态
     */
    updateStatus(feedbackId, status, notes = {}) {
        const feedback = this.feedbackList.get(feedbackId);
        if (!feedback) {
            return { success: false, error: 'Feedback not found' };
        }
        
        feedback.status = status;
        feedback.updatedAt = Date.now();
        
        if (notes.assignee) feedback.assignee = notes.assignee;
        if (notes.priority) feedback.priority = notes.priority;
        if (notes.tags) feedback.tags = [...new Set([...feedback.tags, ...notes.tags])];
        
        this._saveFeedback(feedback);
        
        // 更新解决统计
        if (status === FeedbackStatus.RESOLVED) {
            this.stats.resolved++;
            const resolutionTime = feedback.updatedAt - feedback.createdAt;
            this.stats.avgResolutionTime = 
                (this.stats.avgResolutionTime * (this.stats.resolved - 1) + resolutionTime) 
                / this.stats.resolved;
        }
        
        return { success: true, feedback };
    }

    /**
     * 响应反馈
     */
    respond(feedbackId, response, resolver = 'system') {
        const feedback = this.feedbackList.get(feedbackId);
        if (!feedback) {
            return { success: false, error: 'Feedback not found' };
        }
        
        feedback.response = {
            message: response,
            responder: resolver,
            respondedAt: Date.now()
        };
        feedback.updatedAt = Date.now();
        
        this._saveFeedback(feedback);
        
        return { success: true };
    }

    /**
     * 解决反馈
     */
    resolve(feedbackId, resolution, satisfaction = null) {
        const feedback = this.feedbackList.get(feedbackId);
        if (!feedback) {
            return { success: false, error: 'Feedback not found' };
        }
        
        feedback.status = FeedbackStatus.RESOLVED;
        feedback.resolution = {
            ...resolution,
            resolvedAt: Date.now()
        };
        feedback.satisfaction = satisfaction;
        feedback.updatedAt = Date.now();
        
        this._saveFeedback(feedback);
        
        // 更新满意度统计
        if (satisfaction !== null) {
            const satisfactions = [feedback];
            for (const fb of this.feedbackList.values()) {
                if (fb.satisfaction !== null) {
                    satisfactions.push(fb);
                }
            }
            const avgSat = satisfactions.reduce((sum, fb) => sum + fb.satisfaction, 0) / satisfactions.length;
            this.stats.satisfaction = Math.round(avgSat * 100);
        }
        
        this.stats.resolved++;
        
        return { success: true };
    }

    /**
     * 获取反馈列表
     */
    listFeedback(filters = {}) {
        let results = Array.from(this.feedbackList.values());
        
        // 过滤
        if (filters.type) {
            results = results.filter(f => f.type === filters.type);
        }
        if (filters.status) {
            results = results.filter(f => f.status === filters.status);
        }
        if (filters.priority) {
            results = results.filter(f => f.priority === filters.priority);
        }
        if (filters.userId) {
            results = results.filter(f => f.userId === filters.userId);
        }
        
        // 排序
        results.sort((a, b) => b.createdAt - a.createdAt);
        
        // 分页
        const offset = filters.offset || 0;
        const limit = filters.limit || 20;
        
        return {
            total: results.length,
            results: results.slice(offset, offset + limit)
        };
    }

    /**
     * 获取反馈详情
     */
    getFeedback(feedbackId) {
        return this.feedbackList.get(feedbackId) || null;
    }

    /**
     * 获取统计报告
     */
    getReport() {
        const now = Date.now();
        const last7Days = now - 7 * 24 * 60 * 60 * 1000;
        const last30Days = now - 30 * 24 * 60 * 60 * 1000;
        
        const recent = Array.from(this.feedbackList.values()).filter(f => f.createdAt > last7Days);
        const monthly = Array.from(this.feedbackList.values()).filter(f => f.createdAt > last30Days);
        
        // 按类型统计
        const byType = {};
        for (const fb of this.feedbackList.values()) {
            byType[fb.type] = (byType[fb.type] || 0) + 1;
        }
        
        // 按状态统计
        const byStatus = {};
        for (const fb of this.feedbackList.values()) {
            byStatus[fb.status] = (byStatus[fb.status] || 0) + 1;
        }
        
        // 按优先级统计
        const byPriority = {};
        for (const fb of this.feedbackList.values()) {
            byPriority[fb.priority] = (byPriority[fb.priority] || 0) + 1;
        }
        
        return {
            total: this.feedbackList.size,
            recentCount: recent.length,
            monthlyCount: monthly.length,
            resolved: this.stats.resolved,
            resolutionRate: this.stats.submitted > 0 
                ? (this.stats.resolved / this.stats.submitted * 100).toFixed(1) + '%'
                : '0%',
            avgResolutionTime: Math.round(this.stats.avgResolutionTime / 1000 / 60) + ' min',
            satisfaction: this.stats.satisfaction + '%',
            byType,
            byStatus,
            byPriority
        };
    }

    /**
     * 持久化
     */
    _saveFeedback(feedback) {
        const feedbackFile = join(this.config.feedbackDir, `${feedback.id}.json`);
        writeFileSync(feedbackFile, JSON.stringify(feedback, null, 2), 'utf8');
    }

    /**
     * 加载反馈
     */
    async _loadFeedback() {
        try {
            const files = require('fs').readdirSync(this.config.feedbackDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const feedback = JSON.parse(
                        readFileSync(join(this.config.feedbackDir, file), 'utf8')
                    );
                    this.feedbackList.set(feedback.id, feedback);
                }
            }
        } catch (e) {
            console.log('[Feedback] No existing feedback');
        }
    }

    /**
     * 更新匿名统计
     */
    _updateAnonymousStats(feedback) {
        this.anonymousStats.total++;
        this.anonymousStats.byType[feedback.type] = 
            (this.anonymousStats.byType[feedback.type] || 0) + 1;
        this.anonymousStats.byPriority[feedback.priority] = 
            (this.anonymousStats.byPriority[feedback.priority] || 0) + 1;
    }
}

export function getFeedbackSystem(kernel) {
    return new FeedbackSystem(kernel);
}