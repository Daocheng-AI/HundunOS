// hundunos/extension-modules/skill-market/index.js — Skill Marketplace System
// 功能: 技能市场，支持技能发布、发现、评分、推荐
// 状态: 新增

import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const SkillCategory = {
    PRODUCTIVITY: 'productivity',      // 效率工具
    DEVELOPMENT: 'development',        // 开发相关
    DATA_ANALYSIS: 'data_analysis',   // 数据分析
    CREATIVE: 'creative',              // 创意设计
    UTILITY: 'utility',                // 实用工具
    AUTOMATION: 'automation',           // 自动化
    INTEGRATION: 'integration'         // 集成对接
};

export class SkillMarket {
    constructor(kernel) {
        this.kernel = kernel;
        this.skills = new Map();
        this.categories = new Map();
        
        this.config = {
            marketDir: join(__dirname, '..', '..', 'data', 'market'),
            maxSkills: 1000,
            featuredCount: 10
        };
        
        this.stats = {
            published: 0,
            downloaded: 0,
            rated: 0,
            views: 0
        };
    }

    async initialize() {
        mkdirSync(this.config.marketDir, { recursive: true });
        
        // 初始化分类
        for (const cat of Object.values(SkillCategory)) {
            this.categories.set(cat, []);
        }
        
        // 加载已有技能
        await this._loadSkills();
        
        // review: removed // review: removed console.log('[SkillMarket] Initialized with', this.skills.size, 'skills');
    }

    /**
     * 发布技能到市场
     */
    publish(skillData) {
        const skillId = skillData.id || `skill_${randomUUID()}`;
        
        const skill = {
            id: skillId,
            name: skillData.name,
            version: skillData.version || '1.0.0',
            description: skillData.description,
            author: skillData.author || 'anonymous',
            category: skillData.category || SkillCategory.UTILITY,
            tags: skillData.tags || [],
            
            // 元数据
            publishedAt: Date.now(),
            updatedAt: Date.now(),
            downloads: 0,
            rating: 0,
            ratingCount: 0,
            views: 0,
            
            // 内容
            manifest: skillData.manifest || {},
            files: skillData.files || [],
            
            // 状态
            status: 'published',  // published, draft, archived
            featured: false,
            verified: false
        };
        
        // 检查重名
        for (const existing of this.skills.values()) {
            if (existing.name === skill.name) {
                return { success: false, error: 'Skill name already exists' };
            }
        }
        
        this.skills.set(skillId, skill);
        
        // 添加到分类
        const catSkills = this.categories.get(skill.category) || [];
        catSkills.push(skillId);
        this.categories.set(skill.category, catSkills);
        
        // 持久化
        this._saveSkill(skill);
        
        this.stats.published++;
        // review: removed // review: removed console.log(`[SkillMarket] Published: ${skill.name} (${skillId})`);
        
        return { success: true, skillId };
    }

    /**
     * 搜索技能
     */
    search(query, options = {}) {
        const results = [];
        const q = query.toLowerCase();
        
        for (const skill of this.skills.values()) {
            // 过滤状态
            if (options.status && skill.status !== options.status) continue;
            
            // 过滤分类
            if (options.category && skill.category !== options.category) continue;
            
            // 搜索匹配
            const matches = 
                skill.name.toLowerCase().includes(q) ||
                skill.description.toLowerCase().includes(q) ||
                skill.tags.some(t => t.toLowerCase().includes(q));
            
            if (matches) {
                results.push(this._formatSkill(skill));
            }
        }
        
        // 排序
        if (options.sort === 'downloads') {
            results.sort((a, b) => b.downloads - a.downloads);
        } else if (options.sort === 'rating') {
            results.sort((a, b) => b.rating - a.rating);
        } else {
            results.sort((a, b) => b.publishedAt - a.publishedAt);
        }
        
        // 分页
        const offset = options.offset || 0;
        const limit = options.limit || 20;
        
        return {
            total: results.length,
            results: results.slice(offset, offset + limit)
        };
    }

    /**
     * 获取推荐技能
     */
    getRecommendations(userId, limit = 10) {
        // 简单推荐算法：基于下载量和评分
        const all = Array.from(this.skills.values());
        
        // 计算得分
        const scored = all.map(s => ({
            ...this._formatSkill(s),
            score: (s.downloads * 0.3) + (s.rating * s.ratingCount * 10)
        }));
        
        // 排序并返回
        scored.sort((a, b) => b.score - a.score);
        
        return scored.slice(0, limit);
    }

    /**
     * 获取热门技能
     */
    getTrending(limit = 10) {
        const all = Array.from(this.skills.values());
        
        // 最近7天下载量
        const now = Date.now();
        const trending = all
            .filter(s => now - s.publishedAt < 7 * 24 * 60 * 60 * 1000)
            .sort((a, b) => b.downloads - a.downloads)
            .slice(0, limit)
            .map(s => this._formatSkill(s));
        
        return trending;
    }

    /**
     * 获取精选技能
     */
    getFeatured() {
        return Array.from(this.skills.values())
            .filter(s => s.featured)
            .map(s => this._formatSkill(s));
    }

    /**
     * 技能评分
     */
    rate(skillId, userId, rating) {
        const skill = this.skills.get(skillId);
        if (!skill) {
            return { success: false, error: 'Skill not found' };
        }
        
        // 更新评分
        const newCount = skill.ratingCount + 1;
        const newRating = ((skill.rating * skill.ratingCount) + rating) / newCount;
        
        skill.rating = Math.round(newRating * 10) / 10;
        skill.ratingCount = newCount;
        skill.updatedAt = Date.now();
        
        this._saveSkill(skill);
        this.stats.rated++;
        
        return { success: true, rating: skill.rating };
    }

    /**
     * 下载技能
     */
    download(skillId, userId) {
        const skill = this.skills.get(skillId);
        if (!skill) {
            return { success: false, error: 'Skill not found' };
        }
        
        skill.downloads++;
        skill.updatedAt = Date.now();
        
        this._saveSkill(skill);
        this.stats.downloaded++;
        
        return {
            success: true,
            downloadUrl: `/market/downloads/${skillId}`,
            files: skill.files
        };
    }

    /**
     * 获取技能详情
     */
    getSkill(skillId) {
        const skill = this.skills.get(skillId);
        if (!skill) return null;
        
        skill.views++;
        this.stats.views++;
        
        return this._formatSkill(skill);
    }

    /**
     * 格式化技能输出
     */
    _formatSkill(skill) {
        return {
            id: skill.id,
            name: skill.name,
            version: skill.version,
            description: skill.description,
            author: skill.author,
            category: skill.category,
            tags: skill.tags,
            publishedAt: skill.publishedAt,
            downloads: skill.downloads,
            rating: skill.rating,
            ratingCount: skill.ratingCount,
            featured: skill.featured,
            verified: skill.verified
        };
    }

    /**
     * 持久化技能
     */
    _saveSkill(skill) {
        const skillFile = join(this.config.marketDir, `${skill.id}.json`);
        writeFileSync(skillFile, JSON.stringify(skill, null, 2), 'utf8');
    }

    /**
     * 加载技能
     */
    async _loadSkills() {
        try {
            const files = readdirSync(this.config.marketDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const skill = JSON.parse(
                        readFileSync(join(this.config.marketDir, file), 'utf8')
                    );
                    this.skills.set(skill.id, skill);
                    
                    // 添加到分类
                    const catSkills = this.categories.get(skill.category) || [];
                    if (!catSkills.includes(skill.id)) {
                        catSkills.push(skill.id);
                        this.categories.set(skill.category, catSkills);
                    }
                }
            }
        } catch (e) {
            // review: removed // review: removed console.log('[SkillMarket] No existing skills');
        }
    }

    /**
     * 获取统计
     */
    getStats() {
        return {
            total: this.skills.size,
            byCategory: Object.fromEntries(
                this.categories.map((v, k) => [k, v.length])
            ),
            ...this.stats
        };
    }

    /**
     * 获取分类列表
     */
    getCategories() {
        return Object.values(SkillCategory);
    }
}

export function getSkillMarket(kernel) {
    return new SkillMarket(kernel);
}