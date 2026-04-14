// kernel/skills/skill-generator.js
// HundunOS v3.9 — AI Skill 自动生成器
// 
// 用法：
//   import { generateSkill } from './skill-generator.js';
//   
//   const result = await generateSkill('Notion database operations', {
//     llmClient: openai,
//     tools: ['create_database', 'query', 'update', 'delete'],
//   });

/**
 * Skill Generator - AI 自动生成 Skill 定义
 */
export class SkillGenerator {
    constructor(options = {}) {
        this.llmClient = options.llmClient;
        this.defaultModel = options.defaultModel || 'gpt-4';
    }
    
    /**
     * 生成 Skill 定义
     * 
     * @param {string} description - Skill 描述
     * @param {Object} options - 选项
     * @returns {Promise<Object>} - 生成的 Skill 定义
     */
    async generate(description, options = {}) {
        const {
            name = null,
            tools = [],
            triggers = [],
            tags = [],
            model = this.defaultModel,
        } = options;
        
        // 构建 prompt
        const prompt = this._buildPrompt(description, { name, tools, triggers, tags });
        
        // 调用 LLM
        const response = await this._callLLM(prompt, model);
        
        // 解析响应
        const skill = this._parseResponse(response);
        
        // 验证生成的 Skill
        const validation = this._validate(skill);
        
        return {
            success: validation.valid,
            skill,
            validation,
            raw: response,
        };
    }
    
    /**
     * 从自然语言生成 Skill
     */
    async fromNaturalLanguage(input, options = {}) {
        // 分析意图
        const intent = await this._analyzeIntent(input, options.model);
        
        // 生成 Skill
        return this.generate(intent.description, {
            name: intent.suggestedName,
            tools: intent.suggestedTools,
            triggers: intent.triggers,
            ...options,
        });
    }
    
    /**
     * 优化现有 Skill
     */
    async optimize(skillDef, options = {}) {
        const prompt = `Optimize this skill definition for better clarity and performance:

Current Skill:
\`\`\`yaml
${this._toYaml(skillDef)}
\`\`\`

Please improve:
1. Make triggers more specific and comprehensive
2. Refine the system_prompt for better AI understanding
3. Add helpful tags for discoverability
4. Ensure tool definitions are complete

Output the optimized YAML:`;

        const response = await this._callLLM(prompt, options.model);
        const optimized = this._parseResponse(response);
        
        return {
            success: true,
            skill: optimized,
            changes: this._diffSkills(skillDef, optimized),
        };
    }
    
    /**
     * 从代码生成 Skill
     */
    async fromCode(code, language, options = {}) {
        const prompt = `Analyze this ${language} code and generate a skill definition:

\`\`\`${language}
${code}
\`\`\`

Generate a skill that:
1. Describes what this code does
2. Lists the tools/functions it provides
3. Suggests appropriate triggers
4. Includes relevant tags

Output YAML format:`;

        const response = await this._callLLM(prompt, options.model);
        const skill = this._parseResponse(response);
        
        return {
            success: true,
            skill,
            code,
        };
    }
    
    /**
     * 构建生成 Prompt
     */
    _buildPrompt(description, hints) {
        let prompt = `Generate a HundunOS skill definition in YAML format for the following:

Description: ${description}

Requirements:
1. Use kebab-case for skill name (lowercase letters, numbers, single hyphens)
2. Include specific triggers that will activate this skill
3. List all tools this skill needs access to
4. Write a clear, comprehensive system_prompt
5. Add relevant tags for discoverability
6. Set version to "1.0.0"

Format:
\`\`\`yaml
name: skill-name
version: "1.0.0"
description: Clear description
triggers: [trigger1, trigger2]
tools: [tool1, tool2]
tags: [tag1, tag2]
system_prompt: |
  Detailed instructions for the AI assistant...
\`\`\``;

        if (hints.name) {
            prompt += `\n\nSuggested name: ${hints.name}`;
        }
        
        if (hints.tools.length > 0) {
            prompt += `\n\nRequired tools: ${hints.tools.join(', ')}`;
        }
        
        if (hints.triggers.length > 0) {
            prompt += `\n\nSuggested triggers: ${hints.triggers.join(', ')}`;
        }
        
        if (hints.tags.length > 0) {
            prompt += `\n\nSuggested tags: ${hints.tags.join(', ')}`;
        }
        
        return prompt;
    }
    
    /**
     * 调用 LLM
     */
    async _callLLM(prompt, model) {
        if (!this.llmClient) {
            // 返回模拟响应（用于测试）
            return this._mockResponse(prompt);
        }
        
        const response = await this.llmClient.chat.completions.create({
            model,
            messages: [
                {
                    role: 'system',
                    content: 'You are a skill definition generator for HundunOS AI assistant framework. Output only valid YAML.',
                },
                { role: 'user', content: prompt },
            ],
            temperature: 0.7,
        });
        
        return response.choices[0].message.content;
    }
    
    /**
     * 模拟响应（测试用）
     */
    _mockResponse(prompt) {
        // 从 prompt 提取信息
        const descMatch = prompt.match(/Description: (.+)/);
        const description = descMatch ? descMatch[1] : 'Generated skill';
        
        // 生成名称
        const nameHint = prompt.match(/Suggested name: (\S+)/);
        const name = nameHint ? nameHint[1] : description.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 32);
        
        return `\`\`\`yaml
name: ${name}
version: "1.0.0"
description: ${description}
triggers: [${name}]
tools: []
tags: [generated, auto]
system_prompt: |
  You are a helpful assistant specialized in ${description}.
  Your task is to help users with ${description}-related queries.
  
  Always be helpful, accurate, and concise in your responses.
\`\`\``;
    }
    
    /**
     * 解析 LLM 响应
     */
    _parseResponse(response) {
        // 提取 YAML 代码块
        const yamlMatch = response.match(/```yaml\n([\s\S]*?)\n```/);
        if (!yamlMatch) {
            // 尝试直接解析
            return this._parseYaml(response);
        }
        
        return this._parseYaml(yamlMatch[1]);
    }
    
    /**
     * 简单 YAML 解析
     */
    _parseYaml(yaml) {
        const skill = {
            name: '',
            version: '1.0.0',
            description: '',
            triggers: [],
            tools: [],
            tags: [],
            system_prompt: '',
        };
        
        const lines = yaml.split('\n');
        let currentKey = null;
        let currentValue = [];
        
        for (const line of lines) {
            // 检测多行值
            if (line.startsWith('  ') && currentKey === 'system_prompt') {
                currentValue.push(line.slice(2));
                continue;
            }
            
            // 保存之前的多行值
            if (currentKey && currentValue.length > 0) {
                skill[currentKey] = currentValue.join('\n').trim();
                currentValue = [];
            }
            
            const colonPos = line.indexOf(':');
            if (colonPos === -1) continue;
            
            const key = line.slice(0, colonPos).trim();
            const value = line.slice(colonPos + 1).trim();
            
            if (key === 'system_prompt') {
                currentKey = 'system_prompt';
                currentValue = [];
                if (value && value !== '|') {
                    currentValue.push(value);
                }
                continue;
            }
            
            currentKey = null;
            
            switch (key) {
                case 'name':
                    skill.name = value.replace(/"/g, '');
                    break;
                case 'version':
                    skill.version = value.replace(/"/g, '');
                    break;
                case 'description':
                    skill.description = value;
                    break;
                case 'triggers':
                    skill.triggers = this._parseArray(value);
                    break;
                case 'tools':
                    skill.tools = this._parseArray(value);
                    break;
                case 'tags':
                    skill.tags = this._parseArray(value);
                    break;
            }
        }
        
        // 保存最后的多行值
        if (currentKey && currentValue.length > 0) {
            skill[currentKey] = currentValue.join('\n').trim();
        }
        
        return skill;
    }
    
    /**
     * 解析数组值
     */
    _parseArray(value) {
        if (value.startsWith('[') && value.endsWith(']')) {
            return value
                .slice(1, -1)
                .split(',')
                .map(s => s.trim().replace(/"/g, ''))
                .filter(s => s);
        }
        return [value];
    }
    
    /**
     * 验证 Skill
     */
    _validate(skill) {
        const errors = [];
        const warnings = [];
        
        // 名称验证
        if (!skill.name) {
            errors.push('Missing skill name');
        } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skill.name)) {
            errors.push('Invalid skill name format (must be kebab-case)');
        }
        
        // 版本验证
        if (!skill.version) {
            warnings.push('Missing version, defaulting to 1.0.0');
        }
        
        // 描述验证
        if (!skill.description) {
            warnings.push('Missing description');
        }
        
        // 触发器验证
        if (!skill.triggers || skill.triggers.length === 0) {
            warnings.push('No triggers defined');
        }
        
        // 系统提示验证
        if (!skill.system_prompt) {
            errors.push('Missing system_prompt');
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }
    
    /**
     * 分析意图
     */
    async _analyzeIntent(input, model) {
        // 简单关键词提取
        const words = input.toLowerCase().split(/\s+/);
        
        // 推断名称
        const nameWords = words.slice(0, 3)
            .filter(w => w.length > 2)
            .join('-');
        
        // 推断工具
        const toolKeywords = {
            'database': ['query', 'create', 'update', 'delete'],
            'api': ['fetch', 'post', 'put', 'delete'],
            'file': ['read', 'write', 'delete', 'list'],
            'email': ['send', 'read', 'list'],
            'calendar': ['create', 'list', 'update', 'delete'],
            'github': ['create_issue', 'create_pr', 'list_repos'],
            'slack': ['send_message', 'list_channels'],
        };
        
        const suggestedTools = [];
        for (const [keyword, tools] of Object.entries(toolKeywords)) {
            if (input.toLowerCase().includes(keyword)) {
                suggestedTools.push(...tools);
            }
        }
        
        return {
            description: input,
            suggestedName: nameWords || 'generated-skill',
            suggestedTools,
            triggers: [nameWords],
        };
    }
    
    /**
     * 比较 Skill 差异
     */
    _diffSkills(oldSkill, newSkill) {
        const changes = [];
        
        if (oldSkill.name !== newSkill.name) {
            changes.push(`name: ${oldSkill.name} → ${newSkill.name}`);
        }
        
        const addedTriggers = newSkill.triggers.filter(t => !oldSkill.triggers.includes(t));
        const removedTriggers = oldSkill.triggers.filter(t => !newSkill.triggers.includes(t));
        
        if (addedTriggers.length > 0) {
            changes.push(`triggers added: ${addedTriggers.join(', ')}`);
        }
        if (removedTriggers.length > 0) {
            changes.push(`triggers removed: ${removedTriggers.join(', ')}`);
        }
        
        if (oldSkill.system_prompt !== newSkill.system_prompt) {
            changes.push('system_prompt updated');
        }
        
        return changes;
    }
    
    /**
     * 转换为 YAML
     */
    _toYaml(obj) {
        let yaml = '';
        for (const [key, value] of Object.entries(obj)) {
            if (Array.isArray(value)) {
                yaml += `${key}: [${value.join(', ')}]\n`;
            } else if (typeof value === 'string' && value.includes('\n')) {
                yaml += `${key}: |\n  ${value.replace(/\n/g, '\n  ')}\n`;
            } else {
                yaml += `${key}: ${value}\n`;
            }
        }
        return yaml;
    }
}

/**
 * 便捷函数：生成 Skill
 */
export async function generateSkill(description, options = {}) {
    const generator = new SkillGenerator(options);
    return generator.generate(description, options);
}

/**
 * 便捷函数：从自然语言生成
 */
export async function generateFromNL(input, options = {}) {
    const generator = new SkillGenerator(options);
    return generator.fromNaturalLanguage(input, options);
}

export default SkillGenerator;
