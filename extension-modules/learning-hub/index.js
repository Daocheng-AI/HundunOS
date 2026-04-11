// hundunos/extension-modules/learning-hub/index.js — Learning Activity System
// 功能: 学习活动组织、进度追踪、成就系统
// 状态: 新增

import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const ActivityType = {
    TUTORIAL: 'tutorial',           // 教程
    COURSE: 'course',               // 课程
    CHALLENGE: 'challenge',         // 挑战
    WORKSHOP: 'workshop',           // 工作坊
    MEETUP: 'meetup',               // 聚会
    CERTIFICATION: 'certification'  // 认证
};

export const ActivityStatus = {
    DRAFT: 'draft',
    PUBLISHED: 'published',
    ACTIVE: 'active',
    COMPLETED: 'completed',
    ARCHIVED: 'archived'
};

export class LearningHub {
    constructor(kernel) {
        this.kernel = kernel;
        this.activities = new Map();
        this.enrollments = new Map();
        this.achievements = new Map();
        
        this.config = {
            dataDir: join(__dirname, '..', '..', 'data', 'learning'),
            xpPerCompletion: 100,
            achievementThreshold: 1000
        };
        
        this.stats = {
            activitiesCreated: 0,
            enrollments: 0,
            completions: 0,
            achievementsEarned: 0
        };
    }

    async initialize() {
        mkdirSync(this.config.dataDir, { recursive: true });
        
        // 加载数据
        await this._loadData();
        
        // review: removed // review: removed console.log('[LearningHub] Initialized');
    }

    /**
     * 创建学习活动
     */
    createActivity(activityData) {
        const activityId = activityData.id || `activity_${randomUUID()}`;
        
        const activity = {
            id: activityId,
            type: activityData.type || ActivityType.COURSE,
            title: activityData.title,
            description: activityData.description,
            
            // 内容
            content: activityData.content || [],
            modules: activityData.modules || [],
            duration: activityData.duration || 0,  // 分钟
            difficulty: activityData.difficulty || 'beginner',  // beginner, intermediate, advanced
            
            // 元数据
            author: activityData.author || 'system',
            tags: activityData.tags || [],
            status: ActivityStatus.DRAFT,
            
            // 时间
            createdAt: Date.now(),
            publishedAt: null,
            startDate: activityData.startDate,
            endDate: activityData.endDate,
            
            // 统计
            enrolledCount: 0,
            completedCount: 0,
            rating: 0,
            
            // 奖励
            xp: activityData.xp || this.config.xpPerCompletion,
            certificate: activityData.certificate || false,
            badge: activityData.badge || null
        };
        
        this.activities.set(activityId, activity);
        this.stats.activitiesCreated++;
        
        this._saveActivity(activity);
        
        // review: removed // review: removed console.log(`[LearningHub] Created activity: ${activity.title}`);
        
        return { success: true, activityId };
    }

    /**
     * 发布活动
     */
    publish(activityId) {
        const activity = this.activities.get(activityId);
        if (!activity) {
            return { success: false, error: 'Activity not found' };
        }
        
        activity.status = ActivityStatus.PUBLISHED;
        activity.publishedAt = Date.now();
        
        this._saveActivity(activity);
        
        return { success: true };
    }

    /**
     * 报名活动
     */
    enroll(activityId, userId) {
        const activity = this.activities.get(activityId);
        if (!activity) {
            return { success: false, error: 'Activity not found' };
        }
        
        if (activity.status !== ActivityStatus.PUBLISHED) {
            return { success: false, error: 'Activity not available' };
        }
        
        const enrollmentId = `enroll_${randomUUID()}`;
        
        const enrollment = {
            id: enrollmentId,
            activityId,
            userId,
            enrolledAt: Date.now(),
            progress: 0,
            completedModules: [],
            status: 'in_progress',
            startedAt: Date.now(),
            completedAt: null,
            xpEarned: 0
        };
        
        this.enrollments.set(enrollmentId, enrollment);
        activity.enrolledCount++;
        
        this._saveActivity(activity);
        this._saveEnrollment(enrollment);
        
        this.stats.enrollments++;
        
        return { success: true, enrollmentId };
    }

    /**
     * 更新进度
     */
    updateProgress(enrollmentId, moduleId, completed = false) {
        const enrollment = this.enrollments.get(enrollmentId);
        if (!enrollment) {
            return { success: false, error: 'Enrollment not found' };
        }
        
        const activity = this.activities.get(enrollment.activityId);
        
        if (completed) {
            if (!enrollment.completedModules.includes(moduleId)) {
                enrollment.completedModules.push(moduleId);
            }
            
            // 计算进度
            const totalModules = activity.modules.length || 1;
            enrollment.progress = Math.round((enrollment.completedModules.length / totalModules) * 100);
            
            // 检查是否完成
            if (enrollment.progress === 100) {
                enrollment.status = 'completed';
                enrollment.completedAt = Date.now();
                enrollment.xpEarned = activity.xp;
                
                this.stats.completions++;
                
                // 授予成就
                this._awardAchievement(enrollment.userId, activity);
            }
        }
        
        enrollment.updatedAt = Date.now();
        
        this._saveEnrollment(enrollment);
        
        return { success: true, progress: enrollment.progress };
    }

    /**
     * 授予成就
     */
    _awardAchievement(userId, activity) {
        const userAchievements = this.achievements.get(userId) || {
            xp: 0,
            badges: [],
            activities: [],
            level: 1
        };
        
        // 增加XP
        userAchievements.xp += activity.xp;
        
        // 记录完成的活动
        userAchievements.activities.push({
            id: activity.id,
            title: activity.title,
            completedAt: Date.now()
        });
        
        // 检查等级升级
        const newLevel = Math.floor(userAchievements.xp / this.config.achievementThreshold) + 1;
        if (newLevel > userAchievements.level) {
            userAchievements.level = newLevel;
        }
        
        // 授予徽章
        if (activity.badge && !userAchievements.badges.includes(activity.badge)) {
            userAchievements.badges.push(activity.badge);
            this.stats.achievementsEarned++;
        }
        
        this.achievements.set(userId, userAchievements);
        
        // 检查全局成就
        this._checkGlobalAchievements(userId);
    }

    /**
     * 检查全局成就
     */
    _checkGlobalAchievements(userId) {
        const userAchievements = this.achievements.get(userId);
        if (!userAchievements) return;
        
        const globalAchievements = [
            { id: 'first_activity', condition: () => userAchievements.activities.length >= 1 },
            { id: 'ten_activities', condition: () => userAchievements.activities.length >= 10 },
            { id: 'xp_1000', condition: () => userAchievements.xp >= 1000 },
            { id: 'xp_5000', condition: () => userAchievements.xp >= 5000 },
            { id: 'level_5', condition: () => userAchievements.level >= 5 }
        ];
        
        for (const achievement of globalAchievements) {
            const hasIt = userAchievements.badges.includes(achievement.id);
            if (!hasIt && achievement.condition()) {
                userAchievements.badges.push(achievement.id);
                this.stats.achievementsEarned++;
                // review: removed // review: removed console.log(`[LearningHub] Achievement unlocked: ${achievement.id} for ${userId}`);
            }
        }
        
        this._saveUserAchievements(userId, userAchievements);
    }

    /**
     * 获取活动列表
     */
    listActivities(filters = {}) {
        let results = Array.from(this.activities.values());
        
        // 过滤
        if (filters.type) {
            results = results.filter(a => a.type === filters.type);
        }
        if (filters.status) {
            results = results.filter(a => a.status === filters.status);
        }
        if (filters.difficulty) {
            results = results.filter(a => a.difficulty === filters.difficulty);
        }
        
        // 排序
        results.sort((a, b) => b.createdAt - a.createdAt);
        
        // 格式化输出
        return results.map(a => ({
            id: a.id,
            type: a.type,
            title: a.title,
            description: a.description?.slice(0, 100),
            difficulty: a.difficulty,
            duration: a.duration,
            enrolledCount: a.enrolledCount,
            rating: a.rating,
            xp: a.xp
        }));
    }

    /**
     * 获取用户学习进度
     */
    getUserProgress(userId) {
        const userEnrollments = [];
        
        for (const enrollment of this.enrollments.values()) {
            if (enrollment.userId === userId) {
                const activity = this.activities.get(enrollment.activityId);
                userEnrollments.push({
                    enrollmentId: enrollment.id,
                    activity: {
                        id: activity.id,
                        title: activity.title,
                        type: activity.type
                    },
                    progress: enrollment.progress,
                    status: enrollment.status,
                    completedModules: enrollment.completedModules.length,
                    totalModules: activity.modules.length,
                    xpEarned: enrollment.xpEarned
                });
            }
        }
        
        const achievements = this.achievements.get(userId) || {
            xp: 0,
            badges: [],
            level: 1
        };
        
        return {
            enrollments: userEnrollments,
            achievements
        };
    }

    /**
     * 获取排行榜
     */
    getLeaderboard(limit = 10) {
        const leaderboard = [];
        
        for (const [userId, achievements] of this.achievements) {
            leaderboard.push({
                userId,
                xp: achievements.xp,
                level: achievements.level,
                completedActivities: achievements.activities.length,
                badges: achievements.badges.length
            });
        }
        
        leaderboard.sort((a, b) => b.xp - a.xp);
        
        return leaderboard.slice(0, limit);
    }

    /**
     * 获取统计
     */
    getStats() {
        return {
            activities: this.activities.size,
            enrollments: this.stats.enrollments,
            completions: this.stats.completions,
            achievements: this.stats.achievementsEarned
        };
    }

    /**
     * 持久化
     */
    _saveActivity(activity) {
        const file = join(this.config.dataDir, 'activities', `${activity.id}.json`);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify(activity, null, 2), 'utf8');
    }

    _saveEnrollment(enrollment) {
        const file = join(this.config.dataDir, 'enrollments', `${enrollment.id}.json`);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify(enrollment, null, 2), 'utf8');
    }

    _saveUserAchievements(userId, achievements) {
        const file = join(this.config.dataDir, 'achievements', `${userId}.json`);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify(achievements, null, 2), 'utf8');
    }

    async _loadData() {
        // 简化实现
    }
}

export function getLearningHub(kernel) {
    return new LearningHub(kernel);
}