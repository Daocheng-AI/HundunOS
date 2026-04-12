/**
 * Supermemory ContextEnhancer 集成
 *
 * 将 Supermemory 的用户画像和相关记忆集成到 ContextEnhancer 中，
 * 增强 AI 上下文构建能力。
 */

/**
 * Supermemory ContextEnhancer 集成类
 */
class SupermemoryContextEnhancerIntegration {
  /**
   * 创建集成实例
   * @param {Object} kernel - HundunOS 内核实例
   */
  constructor(kernel) {
    this.kernel = kernel;
    this.supermemory = kernel._modules.supermemory;
    this.enabled = false;
    this.config = {
      injectUserProfile: true,
      injectRelevantMemories: true,
      maxMemories: 5,
      cacheEnabled: true
    };
  }

  /**
   * 初始化集成
   * @returns {Promise<void>}
   */
  async initialize() {
    if (!this.supermemory) {
      console.warn('[SupermemoryContextEnhancer] Supermemory 未初始化，跳过集成');
      return;
    }

    this.enabled = true;
    console.info('[SupermemoryContextEnhancer] 初始化成功');
  }

  /**
   * 构建增强的上下文
   * @param {Object} options - 上下文选项
   * @param {string} [options.containerTag] - 容器标签
   * @param {string} [options.query] - 查询字符串
   * @param {number} [options.maxMemories] - 最大记忆数量
   * @returns {Promise<Object>} 增强的上下文
   */
  async buildEnhancedContext(options = {}) {
    if (!this.enabled || !this.supermemory) {
      return {
        userProfile: null,
        relevantMemories: [],
        metadata: {
          enabled: false,
          error: 'Supermemory not available'
        }
      };
    }

    const startTime = Date.now();
    const containerTag = options.containerTag || this.supermemory.getCurrentContainerTag();
    const maxMemories = options.maxMemories || this.config.maxMemories;

    try {
      // 获取用户画像
      const userProfile = await this.getUserProfile(containerTag);

      // 获取相关记忆
      let relevantMemories = [];
      if (options.query) {
        relevantMemories = await this.getRelevantMemories(options.query, containerTag, maxMemories);
      }

      return {
        userProfile,
        relevantMemories,
        metadata: {
          enabled: true,
          cacheHit: false,
          responseTime: Date.now() - startTime,
          containerTag
        }
      };
    } catch (error) {
      console.warn('[SupermemoryContextEnhancer] 构建增强上下文失败:', error.message);

      return {
        userProfile: null,
        relevantMemories: [],
        metadata: {
          enabled: true,
          error: error.message,
          responseTime: Date.now() - startTime,
          fallback: true
        }
      };
    }
  }

  /**
   * 获取用户画像
   * @param {string} [containerTag] - 容器标签
   * @returns {Promise<Object>} 用户画像
   */
  async getUserProfile(containerTag) {
    if (!this.config.injectUserProfile) {
      return null;
    }

    try {
      const profile = await this.supermemory.getUserProfile(containerTag);
      return profile;
    } catch (error) {
      console.warn('[SupermemoryContextEnhancer] 获取用户画像失败:', error.message);
      return null;
    }
  }

  /**
   * 获取相关记忆
   * @param {string} query - 查询字符串
   * @param {string} [containerTag] - 容器标签
   * @param {number} [limit] - 结果数量限制
   * @returns {Promise<Array>} 相关记忆列表
   */
  async getRelevantMemories(query, containerTag, limit = 5) {
    if (!this.config.injectRelevantMemories) {
      return [];
    }

    try {
      const results = await this.supermemory.searchMemories(query, {
        containerTag,
        searchMode: 'memories',
        limit
      });

      return results.memories || [];
    } catch (error) {
      console.warn('[SupermemoryContextEnhancer] 获取相关记忆失败:', error.message);
      return [];
    }
  }

  /**
   * 注入用户画像到上下文
   * @param {string} context - 原始上下文
   * @param {Object} userProfile - 用户画像
   * @returns {string} 增强后的上下文
   */
  injectUserProfile(context, userProfile) {
    if (!userProfile || (!userProfile.static?.length && !userProfile.dynamic?.length)) {
      return context;
    }

    const profileSection = this._buildUserProfileSection(userProfile);
    return `${context}\n\n${profileSection}`;
  }

  /**
   * 注入相关记忆到上下文
   * @param {string} context - 原始上下文
   * @param {Array} memories - 相关记忆列表
   * @returns {string} 增强后的上下文
   */
  injectRelevantMemories(context, memories) {
    if (!memories || memories.length === 0) {
      return context;
    }

    const memoriesSection = this._buildMemoriesSection(memories);
    return `${context}\n\n${memoriesSection}`;
  }

  /**
   * 构建用户画像部分
   * @param {Object} userProfile - 用户画像
   * @returns {string} 用户画像部分
   */
  _buildUserProfileSection(userProfile) {
    const lines = ['## 用户画像'];

    if (userProfile.static && userProfile.static.length > 0) {
      lines.push('\n### 长期偏好');
      userProfile.static.forEach(fact => {
        lines.push(`- ${fact}`);
      });
    }

    if (userProfile.dynamic && userProfile.dynamic.length > 0) {
      lines.push('\n### 最近活动');
      userProfile.dynamic.forEach(activity => {
        lines.push(`- ${activity}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * 构建记忆部分
   * @param {Array} memories - 记忆列表
   * @returns {string} 记忆部分
   */
  _buildMemoriesSection(memories) {
    const lines = ['## 相关记忆'];

    memories.forEach((memory, index) => {
      const content = memory.snippet || memory.memory?.content || memory.content;
      lines.push(`${index + 1}. ${content}`);
    });

    return lines.join('\n');
  }

  /**
   * 控制上下文长度
   * @param {string} context - 上下文
   * @param {number} maxLength - 最大长度（token 数）
   * @returns {string} 长度控制后的上下文
   */
  controlContextLength(context, maxLength = 8000) {
    const estimatedTokens = this._estimateTokens(context);

    if (estimatedTokens <= maxLength) {
      return context;
    }

    // 按优先级排序各部分
    const sections = this._splitContextSections(context);
    const prioritizedSections = this._prioritizeSections(sections);

    // 从低优先级开始截断
    let trimmedContext = '';
    let currentTokens = 0;

    for (const section of prioritizedSections) {
      const sectionTokens = this._estimateTokens(section.content);

      if (currentTokens + sectionTokens <= maxLength) {
        trimmedContext += section.content + '\n\n';
        currentTokens += sectionTokens;
      } else {
        // 部分截断
        const remainingTokens = maxLength - currentTokens;
        const trimmedContent = this._trimToTokens(section.content, remainingTokens);
        trimmedContext += trimmedContent;
        break;
      }
    }

    return trimmedContext.trim();
  }

  /**
   * 估算 token 数
   * @param {string} text - 文本
   * @returns {number} 估算的 token 数
   */
  _estimateTokens(text) {
    // 粗略估算：1 token ≈ 4 字符（英文）或 2 字符（中文）
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 2 + otherChars / 4);
  }

  /**
   * 分割上下文为多个部分
   * @param {string} context - 上下文
   * @returns {Array} 上下文部分列表
   */
  _splitContextSections(context) {
    const sections = [];

    // 按标题分割
    const lines = context.split('\n');
    let currentSection = { type: 'other', content: '' };

    for (const line of lines) {
      if (line.startsWith('## ')) {
        // 保存当前部分
        if (currentSection.content.trim()) {
          sections.push(currentSection);
        }

        // 开始新部分
        const title = line.substring(3).trim();
        currentSection = {
          type: this._classifySection(title),
          title,
          content: line + '\n'
        };
      } else {
        currentSection.content += line + '\n';
      }
    }

    // 添加最后一部分
    if (currentSection.content.trim()) {
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * 分类上下文部分
   * @param {string} title - 标题
   * @returns {string} 类型
   */
  _classifySection(title) {
    const lowerTitle = title.toLowerCase();

    if (lowerTitle.includes('system') || lowerTitle.includes('kernel')) {
      return 'system';
    } else if (lowerTitle.includes('用户画像') || lowerTitle.includes('user profile')) {
      return 'userProfile';
    } else if (lowerTitle.includes('相关记忆') || lowerTitle.includes('relevant memory')) {
      return 'relevantMemories';
    } else if (lowerTitle.includes('git')) {
      return 'git';
    } else if (lowerTitle.includes('memory')) {
      return 'memory';
    } else {
      return 'other';
    }
  }

  /**
   * 优先级排序
   * @param {Array} sections - 上下文部分列表
   * @returns {Array} 排序后的部分列表
   */
  _prioritizeSections(sections) {
    const priorityOrder = {
      'system': 1,
      'userProfile': 2,
      'relevantMemories': 3,
      'git': 4,
      'memory': 5,
      'other': 6
    };

    return sections.sort((a, b) => {
      const priorityA = priorityOrder[a.type] || 99;
      const priorityB = priorityOrder[b.type] || 99;
      return priorityA - priorityB;
    });
  }

  /**
   * 截断到指定 token 数
   * @param {string} text - 文本
   * @param {number} maxTokens - 最大 token 数
   * @returns {string} 截断后的文本
   */
  _trimToTokens(text, maxTokens) {
    const estimatedTokens = this._estimateTokens(text);

    if (estimatedTokens <= maxTokens) {
      return text;
    }

    // 按比例截断
    const ratio = maxTokens / estimatedTokens;
    const maxLength = Math.floor(text.length * ratio);
    return text.substring(0, maxLength) + '\n... (truncated)';
  }

  /**
   * 配置集成
   * @param {Object} config - 配置选项
   */
  configure(config) {
    this.config = {
      ...this.config,
      ...config
    };
  }

  /**
   * 禁用集成
   */
  disable() {
    this.enabled = false;
    console.info('[SupermemoryContextEnhancer] 已禁用');
  }

  /**
   * 启用集成
   */
  enable() {
    this.enabled = true;
    console.info('[SupermemoryContextEnhancer] 已启用');
  }

  /**
   * 检查是否启用
   * @returns {boolean} 是否启用
   */
  isEnabled() {
    return this.enabled;
  }
}

module.exports = { SupermemoryContextEnhancerIntegration };
