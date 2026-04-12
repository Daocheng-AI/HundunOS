/**
 * HundunOS v4.3 - PromptParts 模块化组装
 * 参考 learn-claude-code s10 System Prompt Pipeline
 * 提供模块化的 prompt 组装能力
 */

/**
 * PromptParts 数据结构
 * v4.3: 参考 learn-claude-code s10
 */
export class PromptParts {
  constructor() {
    this.coreIdentity = '';
    this.memorySection = '';
    this.skillSection = '';
    this.taskContext = '';
    this.toolGuidance = '';
  }

  setCoreIdentity(text) {
    this.coreIdentity = text;
    return this;
  }

  setMemorySection(text) {
    this.memorySection = text;
    return this;
  }

  setSkillSection(text) {
    this.skillSection = text;
    return this;
  }

  setTaskContext(text) {
    this.taskContext = text;
    return this;
  }

  setToolGuidance(text) {
    this.toolGuidance = text;
    return this;
  }

  build() {
    const parts = [
      this.coreIdentity,
      this.memorySection,
      this.skillSection,
      this.taskContext,
      this.toolGuidance,
    ].filter(Boolean);

    return parts.join('\n\n');
  }
}

/**
 * 默认核心身份
 */
const DEFAULT_CORE_IDENTITY = `You are HundunOS, an AI assistant that helps users with code and development tasks.

Your core capabilities:
- Write, read, and edit files
- Run shell commands
- Search and navigate codebases
- Execute tests and debugging
- Provide code suggestions and refactoring

Always be helpful, accurate, and concise.`;

/**
 * 默认工具指导
 */
const DEFAULT_TOOL_GUIDANCE = `Tools available:
- bash: Run shell commands
- read_file: Read file contents
- write_file: Write content to files
- edit_file: Replace exact text in files

Use tools to accomplish tasks. Think step by step.`;

/**
 * 构建系统提示
 * v4.3: 参考 learn-claude-code s10
 * @param {Object} kernel - HundunOS kernel 实例
 * @param {Object} options - { taskContext, includeMemory, includeSkills, includeToolList }
 * @returns {Promise<string>} 系统提示
 */
export async buildSystemPrompt(kernel, options = {}) {
  const {
    taskContext = '',
    includeMemory = true,
    includeSkills = true,
    includeToolList = true,
    maxSkills = 5,
  } = options;

  const parts = new PromptParts();

  // 1. Core Identity
  parts.setCoreIdentity(DEFAULT_CORE_IDENTITY);

  // 2. Memory Section
  if (includeMemory && kernel?.memoryGraph) {
    const memories = await kernel.memoryGraph.recall('', { 
      type: 'user', 
      limit: 5 
    });

    if (memories.recent?.length || memories.semantic?.length) {
      const memoryItems = [
        ...memories.recent.map(m => `- ${m.message?.slice(0, 80)}...`),
        ...memories.semantic.map(m => `- ${m.key}: ${m.description?.slice(0, 80)}...`),
      ];
      parts.setMemorySection(`Key memories:\n${memoryItems.join('\n')}`);
    }
  }

  // 3. Skill Section
  if (includeSkills && kernel?.skills?.injector) {
    const skillContext = await kernel.skills.injector.inject('', {
      includeSystemPrompt: true,
      includeToolList,
      maxSkills,
    });

    if (skillContext?.injectedSkills?.length) {
      const skillItems = skillContext.injectedSkills.map(name => `- ${name}`);
      parts.setSkillSection(`Available skills:\n${skillItems.join('\n')}`);
    }
  }

  // 4. Task Context
  if (taskContext) {
    parts.setTaskContext(taskContext);
  }

  // 5. Tool Guidance
  parts.setToolGuidance(DEFAULT_TOOL_GUIDANCE);

  return parts.build();
}
