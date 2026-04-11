// hundunos/extension-modules/tutorial-system/index.js — Interactive Tutorial System
// 功能: 交互式教程系统，帮助用户学习 HundunOS
// 参考: luongnv89/claude-howto 设计
// 状态: 新增

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 教程课程定义
const CURRICULUM = {
    beginner: [
        {
            id: 'intro',
            title: 'HundunOS 简介',
            description: '了解 HundunOS 是什么，能做什么',
            duration: '5 分钟',
            steps: [
                {
                    title: '什么是 HundunOS',
                    content: 'HundunOS 是一个微内核架构的 AI 助手系统，支持多Agent协作、技能扩展、记忆管理等功能。',
                    interactive: false
                },
                {
                    title: '核心特性',
                    content: '• 微内核架构\n• Rust 高性能模块\n• Policy Engine 安全控制\n• Memory Graph 上下文管理',
                    interactive: false
                },
                {
                    title: '快速体验',
                    content: '试试输入: "你好，介绍一下你自己"',
                    interactive: true,
                    expectedInput: /你好|介绍/
                }
            ]
        },
        {
            id: 'basic-commands',
            title: '基础命令',
            description: '学习 HundunOS 的基础命令',
            duration: '10 分钟',
            steps: [
                {
                    title: '帮助命令',
                    content: '输入 /help 查看所有可用命令',
                    interactive: true,
                    expectedInput: /\/help/
                },
                {
                    title: '状态查看',
                    content: '输入 /status 查看系统状态',
                    interactive: true,
                    expectedInput: /\/status/
                },
                {
                    title: '记忆管理',
                    content: '输入 "记住: 我叫小明" 让系统记住信息',
                    interactive: true,
                    expectedInput: /记住/
                }
            ]
        },
        {
            id: 'skills',
            title: '技能系统',
            description: '了解如何使用和管理技能',
            duration: '15 分钟',
            steps: [
                {
                    title: '查看已安装技能',
                    content: '输入 /skills 查看当前可用技能',
                    interactive: true,
                    expectedInput: /\/skills/
                },
                {
                    title: '技能执行',
                    content: '某些技能会根据对话自动触发，比如天气查询、新闻摘要等',
                    interactive: false
                },
                {
                    title: '安装新技能',
                    content: '可以通过 SkillHub 安装新技能',
                    interactive: false
                }
            ]
        }
    ],
    intermediate: [
        {
            id: 'memory-system',
            title: '记忆系统',
            description: '深入理解 Memory Graph',
            duration: '20 分钟',
            steps: [
                {
                    title: '记忆层级',
                    content: 'Memory Graph 支持多层级记忆:\n• Session - 会话级\n• Project - 项目级\n• Global - 全局级',
                    interactive: false
                },
                {
                    title: '记忆查询',
                    content: '输入 "回忆一下" 查看最近的记忆',
                    interactive: true,
                    expectedInput: /回忆/
                },
                {
                    title: '记忆蒸馏',
                    content: '系统会自动对记忆进行蒸馏，提取重要信息',
                    interactive: false
                }
            ]
        },
        {
            id: 'policy-engine',
            title: '安全策略',
            description: '了解 Policy Engine 如何保护系统',
            duration: '15 分钟',
            steps: [
                {
                    title: '策略文件',
                    content: '策略定义在 config/policies/default.yaml',
                    interactive: false
                },
                {
                    title: '权限检查',
                    content: 'Policy Engine 会检查:\n• 文件访问权限\n• 网络请求权限\n• 工具执行权限',
                    interactive: false
                },
                {
                    title: '自定义策略',
                    content: '可以创建自定义策略文件',
                    interactive: false
                }
            ]
        },
        {
            id: 'rust-modules',
            title: 'Rust 模块',
            description: '了解 Rust 高性能模块',
            duration: '10 分钟',
            steps: [
                {
                    title: '已实现的模块',
                    content: '• Tool Bridge - 命令执行\n• Policy Engine - 安全检查\n• Memory Graph - 记忆管理\n• Model Router - 模型路由',
                    interactive: false
                },
                {
                    title: '性能提升',
                    content: 'Rust 模块比 Node.js 快 3-10 倍',
                    interactive: false
                },
                {
                    title: '自动回退',
                    content: '如果 Rust 模块不可用，会自动回退到 JS 实现',
                    interactive: false
                }
            ]
        }
    ],
    advanced: [
        {
            id: 'custom-skills',
            title: '开发自定义技能',
            description: '学习如何开发自己的技能',
            duration: '30 分钟',
            steps: [
                {
                    title: '技能结构',
                    content: '一个技能包含:\n• SKILL.md - 技能说明\n• index.js - 主要代码\n• config.json - 配置',
                    interactive: false
                },
                {
                    title: '创建技能',
                    content: '在 extension-modules/skills/ 目录下创建新技能',
                    interactive: false
                },
                {
                    title: '注册技能',
                    content: '在 kernel/module-registry.js 中注册',
                    interactive: false
                }
            ]
        },
        {
            id: 'multi-agent',
            title: '多Agent协作',
            description: '实现多Agent协作系统',
            duration: '25 分钟',
            steps: [
                {
                    title: 'Agent 架构',
                    content: 'HundunOS 支持多个 Agent 协作:\n• 主 Agent - 处理用户交互\n• 子 Agent - 执行特定任务',
                    interactive: false
                },
                {
                    title: '任务分配',
                    content: '任务通过 Intent Engine 分配给合适的 Agent',
                    interactive: false
                },
                {
                    title: '结果汇总',
                    content: '所有 Agent 结果汇总后返回给用户',
                    interactive: false
                }
            ]
        },
        {
            id: 'contributing',
            title: '贡献代码',
            description: '如何为 HundunOS 贡献代码',
            duration: '15 分钟',
            steps: [
                {
                    title: '开发环境',
                    content: '需要安装:\n• Node.js 20+\n• Rust (可选)\n• Python 3.10+ (可选)',
                    interactive: false
                },
                {
                    title: '代码规范',
                    content: '遵循 docs/best-practices/ 中的规范',
                    interactive: false
                },
                {
                    title: '提交 PR',
                    content: 'Fork → Branch → Commit → PR',
                    interactive: false
                }
            ]
        }
    ]
};

export class TutorialSystem {
    constructor(kernel) {
        this.kernel = kernel;
        this.currentLesson = null;
        this.currentStep = 0;
        this.completedLessons = new Set();
        this.progress = this._loadProgress();
    }

    async initialize() {
        // review: removed // review: removed console.log('[TutorialSystem] Initializing...');
    }

    /**
     * 获取课程列表
     */
    getCurriculum() {
        return {
            beginner: CURRICULUM.beginner.map(l => ({
                id: l.id,
                title: l.title,
                description: l.description,
                duration: l.duration,
                completed: this.completedLessons.has(l.id)
            })),
            intermediate: CURRICULUM.intermediate.map(l => ({
                id: l.id,
                title: l.title,
                description: l.description,
                duration: l.duration,
                completed: this.completedLessons.has(l.id)
            })),
            advanced: CURRICULUM.advanced.map(l => ({
                id: l.id,
                title: l.title,
                description: l.description,
                duration: l.duration,
                completed: this.completedLessons.has(l.id)
            }))
        };
    }

    /**
     * 开始课程
     */
    startLesson(lessonId) {
        const lesson = this._findLesson(lessonId);
        if (!lesson) {
            return { error: 'Lesson not found' };
        }

        this.currentLesson = lesson;
        this.currentStep = 0;

        return {
            success: true,
            lesson: {
                id: lesson.id,
                title: lesson.title,
                totalSteps: lesson.steps.length
            },
            currentStep: this._getStepContent()
        };
    }

    /**
     * 下一步
     */
    nextStep() {
        if (!this.currentLesson) {
            return { error: 'No active lesson' };
        }

        this.currentStep++;

        if (this.currentStep >= this.currentLesson.steps.length) {
            // 课程完成
            this.completedLessons.add(this.currentLesson.id);
            this._saveProgress();
            
            const result = {
                completed: true,
                lessonId: this.currentLesson.id,
                message: `🎉 恭喜完成 "${this.currentLesson.title}"!`
            };
            
            this.currentLesson = null;
            this.currentStep = 0;
            
            return result;
        }

        return {
            success: true,
            stepNumber: this.currentStep + 1,
            totalSteps: this.currentLesson.steps.length,
            content: this._getStepContent()
        };
    }

    /**
     * 验证交互输入
     */
    validateInput(input) {
        if (!this.currentLesson) {
            return { error: 'No active lesson' };
        }

        const step = this.currentLesson.steps[this.currentStep];
        
        if (!step.interactive || !step.expectedInput) {
            return { 
                valid: true, 
                message: '此步骤无需验证，可以继续下一步' 
            };
        }

        if (step.expectedInput.test(input)) {
            return { 
                valid: true, 
                message: '✅ 正确! 继续下一步' 
            };
        } else {
            return { 
                valid: false, 
                message: '❌ 输入不匹配，请重试',
                hint: `提示: ${step.content}`
            };
        }
    }

    /**
     * 获取当前步骤内容
     */
    _getStepContent() {
        if (!this.currentLesson) return null;

        const step = this.currentLesson.steps[this.currentStep];
        return {
            title: step.title,
            content: step.content,
            interactive: step.interactive,
            stepNumber: this.currentStep + 1,
            totalSteps: this.currentLesson.steps.length
        };
    }

    /**
     * 查找课程
     */
    _findLesson(lessonId) {
        const all = [
            ...CURRICULUM.beginner,
            ...CURRICULUM.intermediate,
            ...CURRICULUM.advanced
        ];
        return all.find(l => l.id === lessonId);
    }

    /**
     * 加载进度
     */
    _loadProgress() {
        // 从存储加载进度
        return {
            completed: Array.from(this.completedLessons),
            lastAccess: new Date().toISOString()
        };
    }

    /**
     * 保存进度
     */
    _saveProgress() {
        // 保存到存储
        this.progress = {
            completed: Array.from(this.completedLessons),
            lastAccess: new Date().toISOString()
        };
    }

    /**
     * 获取学习路径建议
     */
    getLearningPath() {
        const completed = this.completedLessons;
        
        if (completed.size === 0) {
            return {
                level: 'beginner',
                nextLesson: 'intro',
                message: '建议从入门课程开始学习'
            };
        }

        // 检查是否完成所有入门课程
        const beginnerComplete = CURRICULUM.beginner.every(l => completed.has(l.id));
        if (!beginnerComplete) {
            const next = CURRICULUM.beginner.find(l => !completed.has(l.id));
            return {
                level: 'beginner',
                nextLesson: next?.id,
                message: '继续完成入门课程'
            };
        }

        // 检查中级课程
        const intermediateComplete = CURRICULUM.intermediate.every(l => completed.has(l.id));
        if (!intermediateComplete) {
            const next = CURRICULUM.intermediate.find(l => !completed.has(l.id));
            return {
                level: 'intermediate',
                nextLesson: next?.id,
                message: '进入中级课程'
            };
        }

        // 高级课程
        const next = CURRICULUM.advanced.find(l => !completed.has(l.id));
        return {
            level: 'advanced',
            nextLesson: next?.id,
            message: '学习高级内容'
        };
    }

    /**
     * 获取统计
     */
    getStats() {
        const total = CURRICULUM.beginner.length + 
                      CURRICULUM.intermediate.length + 
                      CURRICULUM.advanced.length;
        
        return {
            totalLessons: total,
            completed: this.completedLessons.size,
            percentage: Math.round((this.completedLessons.size / total) * 100),
            currentLesson: this.currentLesson?.id || null,
            currentStep: this.currentStep
        };
    }
}

export function getTutorialSystem(kernel) {
    return new TutorialSystem(kernel);
}
