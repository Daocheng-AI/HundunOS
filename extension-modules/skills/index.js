/**
 * HundunOS v3.0 - Skills Extension
 * 技能管理扩展模块
 * 
 * 功能:
 * - 技能注册与发现
 * - 技能执行
 * - 技能市场集成
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// 技能状态
// ============================================================================

export const SkillState = {
    REGISTERED: 'registered',
    LOADED:     'loaded',
    ACTIVE:     'active',
    ERROR:      'error',
    DISABLED:   'disabled'
};

/**
 * 技能定义
 */
export class Skill {
    constructor(config) {
        this.id = config.id || config.name;
        this.name = config.name;
        this.version = config.version || '1.0.0';
        this.description = config.description || '';
        this.keywords = config.keywords || [];
        this.handler = config.handler;
        this.metadata = config.metadata || {};
        this.state = SkillState.REGISTERED;
        this.usageCount = 0;
        this.lastUsed = null;
        this.errorCount = 0;
    }

    /**
     * 执行技能
     */
    async execute(context) {
        if (this.state === SkillState.DISABLED) {
            throw new Error(`Skill ${this.name} is disabled`);
        }

        try {
            const result = await this.handler(context);
            this.usageCount++;
            this.lastUsed = new Date().toISOString();
            return result;
        } catch (error) {
            this.errorCount++;
            throw error;
        }
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            version: this.version,
            description: this.description,
            keywords: this.keywords,
            state: this.state,
            usageCount: this.usageCount,
            errorCount: this.errorCount
        };
    }
}

// ============================================================================
// Skills Extension
// ============================================================================

export class SkillsExtension extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            skillsDir: config.skillsDir || path.join(__dirname, '../../../data/skills'),
            autoLoad: config.autoLoad !== false,
            marketUrl: config.marketUrl || 'https://clawhub.com',
            ...config
        };

        this.skills = new Map();      // id -> Skill
        this.categories = new Map();  // category -> [skillIds]
        this.hooks = new Map();       // event -> [handlers]

        this._loadSkills();

        // console.log('[Skills] Extension initialized');
    }

    // ========================================================================
    // 技能注册
    // ========================================================================

    /**
     * 注册技能
     */
    register(config) {
        const skill = config instanceof Skill ? config : new Skill(config);

        if (this.skills.has(skill.id)) {
            console.warn(`[Skills] Skill ${skill.id} already registered, updating`);
        }

        this.skills.set(skill.id, skill);
        skill.state = SkillState.REGISTERED;

        // 分类
        const category = skill.metadata.category || 'general';
        if (!this.categories.has(category)) {
            this.categories.set(category, []);
        }
        this.categories.get(category).push(skill.id);

        // console.log(`[Skills] Registered: ${skill.id}`);
        this.emit('skill_registered', { skill });

        return skill;
    }

    /**
     * 注销技能
     */
    unregister(skillId) {
        const skill = this.skills.get(skillId);
        if (!skill) return false;

        this.skills.delete(skillId);

        // 从分类中移除
        for (const [cat, ids] of this.categories) {
            const idx = ids.indexOf(skillId);
            if (idx >= 0) ids.splice(idx, 1);
        }

        // console.log(`[Skills] Unregistered: ${skillId}`);
        this.emit('skill_unregistered', { skillId });

        return true;
    }

    // ========================================================================
    // 技能发现
    // ========================================================================

    /**
     * 根据关键词查找技能
     */
    findByKeywords(keywords) {
        const results = [];

        for (const skill of this.skills.values()) {
            const matchScore = this._calculateKeywordMatch(skill.keywords, keywords);
            if (matchScore > 0) {
                results.push({ skill, score: matchScore });
            }
        }

        return results.sort((a, b) => b.score - a.score);
    }

    /**
     * 根据分类获取技能
     */
    findByCategory(category) {
        const ids = this.categories.get(category) || [];
        return ids.map(id => this.skills.get(id)).filter(Boolean);
    }

    /**
     * 获取所有技能
     */
    listSkills() {
        return Array.from(this.skills.values());
    }

    /**
     * 获取技能详情
     */
    getSkill(skillId) {
        return this.skills.get(skillId);
    }

    // ========================================================================
    // 技能执行
    // ========================================================================

    /**
     * 执行技能
     */
    async execute(skillId, context = {}) {
        const skill = this.skills.get(skillId);
        if (!skill) {
            throw new Error(`Skill not found: ${skillId}`);
        }

        // console.log(`[Skills] Executing: ${skillId}`);
        this.emit('skill_execute_start', { skillId, context });

        try {
            const result = await skill.execute(context);

            // console.log(`[Skills] Completed: ${skillId}`);
            this.emit('skill_execute_complete', { skillId, result });

            return result;
        } catch (error) {
            console.error(`[Skills] Failed: ${skillId}`, error.message);
            this.emit('skill_execute_error', { skillId, error });
            throw error;
        }
    }

    /**
     * 自动匹配并执行
     */
    async autoExecute(query, context = {}) {
        const keywords = query.toLowerCase().split(/\s+/);
        const matches = this.findByKeywords(keywords);

        if (matches.length === 0) {
            return { matched: false, reason: 'No matching skill found' };
        }

        const best = matches[0];
        return {
            matched: true,
            skill: best.skill.toJSON(),
            result: await this.execute(best.skill.id, context)
        };
    }

    // ========================================================================
    // 钩子系统
    // ========================================================================

    /**
     * 注册钩子
     */
    onSkillEvent(event, handler) {
        if (!this.hooks.has(event)) {
            this.hooks.set(event, []);
        }
        this.hooks.get(event).push(handler);
    }

    // ========================================================================
    // 统计
    // ========================================================================

    /**
     * 获取统计
     */
    getStats() {
        const stats = {
            total: this.skills.size,
            byState: {},
            byCategory: {},
            topUsed: []
        };

        for (const skill of this.skills.values()) {
            stats.byState[skill.state] = (stats.byState[skill.state] || 0) + 1;
        }

        for (const [cat, ids] of this.categories) {
            stats.byCategory[cat] = ids.length;
        }

        stats.topUsed = this.listSkills()
            .sort((a, b) => b.usageCount - a.usageCount)
            .slice(0, 10)
            .map(s => ({ id: s.id, usageCount: s.usageCount }));

        return stats;
    }

    // ========================================================================
    // 内部方法
    // ========================================================================

    _loadSkills() {
        try {
            if (!fs.existsSync(this.config.skillsDir)) return;

            const files = fs.readdirSync(this.config.skillsDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const config = JSON.parse(
                            fs.readFileSync(path.join(this.config.skillsDir, file), 'utf-8')
                        );
                        this.register(config);
                    } catch (e) {
                        console.error(`[Skills] Failed to load ${file}:`, e.message);
                    }
                }
            }
        } catch (e) {
            console.error('[Skills] Failed to load skills:', e.message);
        }
    }

    _calculateKeywordMatch(skillKeywords, inputKeywords) {
        let score = 0;
        for (const kw of inputKeywords) {
            for (const skillKw of skillKeywords) {
                if (skillKw.toLowerCase().includes(kw) || kw.includes(skillKw.toLowerCase())) {
                    score++;
                }
            }
        }
        return score;
    }
}

// ============================================================================
// 单例
// ============================================================================

let instance = null;

export function getSkillsExtension() {
    if (!instance) {
        instance = new SkillsExtension();
    }
    return instance;
}

export default {
    SkillsExtension,
    getSkillsExtension,
    Skill,
    SkillState
};
