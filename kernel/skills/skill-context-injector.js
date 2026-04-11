// kernel/skills/skill-context-injector.js
// HundunOS v3.8 — Skill System Prompt 注入器
// 职责：将匹配的 Skill 注入 system prompt，提供工具上下文

/**
 * SkillContextInjector
 * 将 Skill 元数据注入 LLM system prompt，让 Agent 知道有哪些工具可用
 */
export class SkillContextInjector {
    /**
     * @param {import('./skill-registry.js').SkillRegistry} registry
     */
    constructor(registry) {
        this.registry = registry;
        this.injectedSkills = new Set(); // 当前会话注入的 skill names
    }

    /**
     * 为查询生成 Skill 增强的 system prompt
     * @param {string} query — 用户原始查询
     * @param {Object} options — 注入配置
     * @returns {Promise<{systemPrompt: string, injectedSkills: string[], warnings: string[]}>}
     */
    async inject(query, options = {}) {
        const {
            includeSystemPrompt = true,
            includeToolList = true,
            includeExamples = false,
            maxSkills = 5,
        } = options;

        const matches = await this.registry.match(query, { limit: maxSkills });
        const warnings = [];
        const parts = [];

        if (!matches.length) {
            return { systemPrompt: '', injectedSkills: [], warnings };
        }

        // 注入 Skill system_prompt
        if (includeSystemPrompt) {
            const prompts = [];
            for (const m of matches) {
                const skill = this.registry.get(m.name);
                if (skill?.system_prompt) {
                    prompts.push(`\n=== ${skill.name} v${skill.version} ===\n${skill.system_prompt.trim()}`);
                    this.injectedSkills.add(m.name);
                }
            }
            if (prompts.length) {
                parts.push(`你已激活以下专业技能，可按需调用：\n${prompts.join('\n')}`);
            }
        }

        // 注入工具列表
        if (includeToolList) {
            const toolList = [];
            for (const m of matches) {
                const skill = this.registry.get(m.name);
                if (skill?.tools) {
                    for (const t of skill.tools) {
                        if (typeof t === 'object' && t.id) {
                            toolList.push(`  [${skill.name}] ${t.id}: ${t.description || t.type}`);
                        }
                    }
                }
            }
            if (toolList.length) {
                parts.push(`\n可用工具：\n${toolList.join('\n')}`);
            }
        }

        // 示例注入
        if (includeExamples) {
            const examples = [];
            for (const m of matches) {
                const skill = this.registry.get(m.name);
                if (skill?.examples) {
                    examples.push(`\n${skill.name} 示例：\n${skill.examples.map(e => `Q: ${e.input}\nA: ${e.output}`).join('\n')}`);
                }
            }
            if (examples.length) {
                parts.push(`\n使用示例：${examples.join('\n')}`);
            }
        }

        return {
            systemPrompt: parts.join('\n'),
            injectedSkills: matches.map(m => m.name),
            warnings,
        };
    }

    /** 获取当前会话已注入的 Skill 列表 */
    getInjectedSkills() {
        return Array.from(this.injectedSkills);
    }

    /** 清除当前会话注入记录 */
    clear() {
        this.injectedSkills.clear();
    }

    /** 为 Skill 生成专用的用户提示词（用于工具调用后的自然语言生成） */
    formatToolResult(skillName, toolId, result) {
        const skill = this.registry.get(skillName);
        if (!skill) return `工具 ${toolId} 执行完成`;

        // 可自定义格式化
        return `【${skillName} › ${toolId}】\n${JSON.stringify(result, null, 2)}`;
    }
}

export default SkillContextInjector;
