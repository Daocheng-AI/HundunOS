/**
 * kernel/intelligent-conversation-compressor.js
 * 智能对话压缩器
 * 
 * 基于 TradingAgents-CN 的优化方案，增强对话压缩功能：
 * 1. 语义理解压缩：基于语义相似度的聚类压缩
 * 2. 重要性评分：基于内容重要性的智能保留
 * 3. 上下文感知：保持对话连贯性
 * 4. 增量压缩：只压缩历史部分，保留最近对话
 * 5. 多策略压缩：根据对话类型选择最佳压缩策略
 */

import { TurboContextCompressor } from './model-router/turbo-context-compressor.js';

/**
 * 对话类型
 */
export const ConversationType = {
    CODE_REVIEW: 'code_review',
    DEBUGGING: 'debugging',
    PLANNING: 'planning',
    DOCUMENTATION: 'documentation',
    GENERAL: 'general',
};

/**
 * 压缩策略
 */
export const CompressionStrategy = {
    AGGRESSIVE: 'aggressive',      // 激进压缩：最大压缩率
    BALANCED: 'balanced',          // 平衡压缩：保持重要信息
    CONSERVATIVE: 'conservative',  // 保守压缩：最小信息损失
    ADAPTIVE: 'adaptive',          // 自适应压缩：根据对话类型调整
    SEMANTIC: 'semantic',          // 语义压缩：基于语义相似度
    HIERARCHICAL: 'hierarchical',  // 层次压缩：按重要性分层
    SLIDING_WINDOW: 'sliding_window', // 滑动窗口：保留最近N条
    TOPIC_BASED: 'topic_based',    // 主题压缩：按主题分组
    TEMPORAL: 'temporal',          // 时间压缩：按时间衰减
};

/**
 * 压缩算法
 */
export const CompressionAlgorithm = {
    // 基础算法
    TRUNCATE: 'truncate',          // 截断：直接截断历史消息
    SUMMARIZE: 'summarize',        // 摘要：生成摘要替换历史
    
    // 语义算法
    SEMANTIC_CLUSTER: 'semantic_cluster', // 语义聚类：相似消息聚类
    SEMANTIC_SIMILARITY: 'semantic_similarity', // 语义相似度：保留代表性消息
    
    // 重要性算法
    IMPORTANCE_RANKING: 'importance_ranking', // 重要性排序：保留重要消息
    TF_IDF: 'tf_idf',              // TF-IDF：基于词频重要性
    KEYWORD_EXTRACTION: 'keyword_extraction', // 关键词提取：保留关键词
    
    // 结构化算法
    HIERARCHICAL_SUMMARY: 'hierarchical_summary', // 层次摘要：多层摘要
    TOPIC_MODELING: 'topic_modeling', // 主题建模：LDA主题模型
    ENTITY_EXTRACTION: 'entity_extraction', // 实体提取：保留关键实体
    
    // 时间算法
    TEMPORAL_DECAY: 'temporal_decay', // 时间衰减：旧消息权重降低
    RECENCY_WEIGHTED: 'recency_weighted', // 新近加权：新消息权重更高
    
    // 混合算法
    HYBRID_SEMANTIC_IMPORTANCE: 'hybrid_semantic_importance', // 混合语义重要性
    HYBRID_TEMPORAL_SEMANTIC: 'hybrid_temporal_semantic', // 混合时间语义
};

/**
 * 对话分析器
 */
class ConversationAnalyzer {
    constructor() {
        this.keywordPatterns = {
            [ConversationType.CODE_REVIEW]: [
                /error|bug|fix|issue|problem/i,
                /function|class|method|api|interface/i,
                /test|unit|integration|coverage/i,
                /refactor|optimize|performance/i,
                /security|vulnerability|risk/i,
            ],
            [ConversationType.DEBUGGING]: [
                /error|exception|crash|fail|broken/i,
                /log|debug|trace|stack/i,
                /symptom|reproduce|steps/i,
                /root cause|fix|solution/i,
                /workaround|patch|hotfix/i,
            ],
            [ConversationType.PLANNING]: [
                /plan|roadmap|timeline|schedule/i,
                /requirement|spec|feature|user story/i,
                /priority|urgent|important|critical/i,
                /milestone|deadline|delivery/i,
                /resource|budget|cost|estimate/i,
            ],
            [ConversationType.DOCUMENTATION]: [
                /doc|document|readme|guide|tutorial/i,
                /api|reference|specification/i,
                /example|sample|demo/i,
                /update|revise|correct/i,
                /format|style|template/i,
            ],
        };
        
        this.importanceFactors = {
            role: {
                system: 1.0,
                user: 0.8,
                assistant: 0.6,
                function: 0.4,
            },
            length: {
                veryShort: 0.3,    // < 10 chars
                short: 0.5,        // 10-50 chars
                medium: 0.7,        // 50-200 chars
                long: 0.9,          // 200-1000 chars
                veryLong: 1.0,      // > 1000 chars
            },
            recency: {
                recent: 1.0,        // 最近 5 条
                middle: 0.7,        // 5-20 条
                old: 0.4,           // 20+ 条
            },
        };
    }

    /**
     * 分析对话类型
     * @param {Array} messages - 对话消息
     * @returns {string} 对话类型
     */
    analyzeConversationType(messages) {
        const content = messages.map(m => m.content || m.message || '').join(' ').toLowerCase();
        const scores = {};
        
        for (const [type, patterns] of Object.entries(this.keywordPatterns)) {
            scores[type] = patterns.reduce((score, pattern) => {
                return score + (content.match(pattern) ? 1 : 0);
            }, 0);
        }
        
        // 找到最高分的类型
        let maxScore = 0;
        let detectedType = ConversationType.GENERAL;
        
        for (const [type, score] of Object.entries(scores)) {
            if (score > maxScore) {
                maxScore = score;
                detectedType = type;
            }
        }
        
        return detectedType;
    }

    /**
     * 计算消息重要性分数
     * @param {Object} message - 消息对象
     * @param {number} index - 消息索引
     * @param {number} total - 总消息数
     * @param {string} conversationType - 对话类型
     * @returns {number} 重要性分数 (0-1)
     */
    calculateImportance(message, index, total, conversationType) {
        const content = (message.content || message.message || '').toLowerCase();
        const role = message.role || 'user';
        
        let score = 0.5;
        
        // 1. 角色权重
        score += this.importanceFactors.role[role] || 0.5;
        
        // 2. 长度权重
        const length = content.length;
        if (length < 10) score += this.importanceFactors.length.veryShort;
        else if (length < 50) score += this.importanceFactors.length.short;
        else if (length < 200) score += this.importanceFactors.length.medium;
        else if (length < 1000) score += this.importanceFactors.length.long;
        else score += this.importanceFactors.length.veryLong;
        
        // 3. 时间权重（最近的消息更重要）
        const recencyIndex = total - index;
        if (recencyIndex <= 5) score += this.importanceFactors.recency.recent;
        else if (recencyIndex <= 20) score += this.importanceFactors.recency.middle;
        else score += this.importanceFactors.recency.old;
        
        // 4. 对话类型特定权重
        const typePatterns = this.keywordPatterns[conversationType] || [];
        for (const pattern of typePatterns) {
            if (pattern.test(content)) {
                score += 0.1;
                break;
            }
        }
        
        // 5. 特殊标记检测
        if (content.includes('```')) score += 0.2; // 代码块
        if (content.includes('error') || content.includes('错误')) score += 0.3;
        if (content.includes('important') || content.includes('重要')) score += 0.2;
        if (content.includes('decision') || content.includes('决定')) score += 0.2;
        if (content.includes('conclusion') || content.includes('结论')) score += 0.2;
        
        // 6. 问题检测
        if (content.includes('?') || content.includes('？')) score += 0.1;
        if (content.includes('how') || content.includes('what') || content.includes('why')) score += 0.1;
        
        // 7. 低重要性模式
        const lowImportancePatterns = [
            /^好的[，。？！. ]?/, /^明白了[，。？！. ]?/, /^收到[，。？！. ]?/,
            /^OK[，。？！. ]?/i, /^没问题[，。？！. ]?/, /^嗯[，。？！. ]?/,
            /^是的[，。？！. ]?/, /^对[，。？！. ]?/, /^okay[，。？！. ]?/i,
            /^got it[，。？！. ]?/i, /^thanks[，。？！. ]?/i, /^thank you[，。？！. ]?/i,
        ];
        
        for (const pattern of lowImportancePatterns) {
            if (pattern.test(content)) {
                score -= 0.3;
                break;
            }
        }
        
        return Math.max(0, Math.min(1, score));
    }

    /**
     * 分析对话结构
     * @param {Array} messages - 对话消息
     * @returns {Object} 对话结构分析
     */
    analyzeConversationStructure(messages) {
        const analysis = {
            totalMessages: messages.length,
            turns: [],
            topics: [],
            questions: [],
            answers: [],
            codeBlocks: 0,
            errors: 0,
            decisions: 0,
        };
        
        let currentTopic = null;
        let topicStart = 0;
        
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            const content = (msg.content || msg.message || '').toLowerCase();
            const role = msg.role || 'user';
            
            // 记录对话轮次
            analysis.turns.push({
                index: i,
                role,
                length: content.length,
                hasCode: content.includes('```'),
                hasQuestion: content.includes('?') || content.includes('？'),
            });
            
            // 检测代码块
            if (content.includes('```')) {
                analysis.codeBlocks++;
            }
            
            // 检测错误
            if (content.includes('error') || content.includes('错误') || 
                content.includes('exception') || content.includes('异常')) {
                analysis.errors++;
            }
            
            // 检测决策
            if (content.includes('decision') || content.includes('决定') ||
                content.includes('conclusion') || content.includes('结论')) {
                analysis.decisions++;
            }
            
            // 检测问题
            if (content.includes('?') || content.includes('？') ||
                content.includes('how') || content.includes('what') || content.includes('why')) {
                analysis.questions.push({
                    index: i,
                    role,
                    content: content.substring(0, 100),
                });
            }
            
            // 检测回答（问题后的第一条助手消息）
            if (role === 'assistant' && i > 0) {
                const prevMsg = messages[i - 1];
                const prevContent = (prevMsg.content || prevMsg.message || '').toLowerCase();
                if (prevContent.includes('?') || prevContent.includes('？')) {
                    analysis.answers.push({
                        index: i,
                        questionIndex: i - 1,
                        content: content.substring(0, 100),
                    });
                }
            }
            
            // 话题检测（基于语义变化）
            if (i > 0) {
                const prevContent = (messages[i - 1].content || messages[i - 1].message || '').toLowerCase();
                const currentContent = content;
                
                // 简单的话题变化检测
                const topicChange = this._detectTopicChange(prevContent, currentContent);
                if (topicChange && currentTopic) {
                    analysis.topics.push({
                        start: topicStart,
                        end: i - 1,
                        messageCount: i - topicStart,
                    });
                    currentTopic = null;
                }
                
                if (!currentTopic) {
                    currentTopic = `topic_${analysis.topics.length + 1}`;
                    topicStart = i;
                }
            }
        }
        
        // 添加最后一个话题
        if (currentTopic) {
            analysis.topics.push({
                start: topicStart,
                end: messages.length - 1,
                messageCount: messages.length - topicStart,
            });
        }
        
        return analysis;
    }

    /**
     * 检测话题变化
     * @param {string} prevContent - 前一条消息内容
     * @param {string} currentContent - 当前消息内容
     * @returns {boolean} 是否话题变化
     * @private
     */
    _detectTopicChange(prevContent, currentContent) {
        // 简单的话题变化检测算法
        const prevWords = new Set(prevContent.split(/\s+/).filter(w => w.length > 3));
        const currentWords = new Set(currentContent.split(/\s+/).filter(w => w.length > 3));
        
        const intersection = new Set([...prevWords].filter(x => currentWords.has(x)));
        const union = new Set([...prevWords, ...currentWords]);
        
        // Jaccard 相似度
        const similarity = intersection.size / union.size;
        
        // 相似度低于阈值则认为话题变化
        return similarity < 0.2;
    }
}

/**
 * 智能对话压缩器
 */
export class IntelligentConversationCompressor {
    constructor(kernel, config = {}) {
        this.kernel = kernel;
        this.analyzer = new ConversationAnalyzer();
        
        this.config = {
            // 压缩策略
            strategy: config.strategy || CompressionStrategy.ADAPTIVE,
            
            // 压缩阈值
            compressionThreshold: config.compressionThreshold || 0.7, // 重要性低于此值的消息将被压缩
            
            // 保留设置
            keepRecentMessages: config.keepRecentMessages || 10, // 保留最近 N 条消息
            keepImportantMessages: config.keepImportantMessages || true, // 是否保留重要消息
            minImportantScore: config.minImportantScore || 0.8, // 重要消息的最小分数
            
            // 聚类设置
            semanticClustering: config.semanticClustering !== false,
            clusterThreshold: config.clusterThreshold || 0.75,
            maxClusterSize: config.maxClusterSize || 10,
            
            // 摘要设置
            enableSummarization: config.enableSummarization !== false,
            summaryLength: config.summaryLength || 100, // 摘要最大长度
            preserveContext: config.preserveContext !== false, // 是否保留上下文
            
            // 性能设置
            maxMessages: config.maxMessages || 1000,
            batchSize: config.batchSize || 50,
            
            // TurboQuant 集成
            useTurboQuant: config.useTurboQuant !== false,
            turboQuantConfig: config.turboQuantConfig || {},
            
            ...config,
        };
        
        // 初始化 TurboQuant 压缩器（如果启用）
        this.turboCompressor = null;
        if (this.config.useTurboQuant) {
            try {
                this.turboCompressor = new TurboContextCompressor(kernel, this.config.turboQuantConfig);
            } catch (error) {
                console.warn('[IntelligentConversationCompressor] Failed to initialize TurboQuant compressor:', error.message);
            }
        }
        
        this.stats = {
            totalCompressions: 0,
            totalMessagesProcessed: 0,
            totalMessagesCompressed: 0,
            totalMessagesKept: 0,
            compressionRatios: [],
            conversationTypes: {},
            strategyUsage: {},
            averageImportanceScore: 0,
            totalImportanceScore: 0,
            importanceCalculations: 0,
        };
    }

    /**
     * 压缩对话
     * @param {Array} messages - 原始消息数组
     * @param {Object} options - 压缩选项
     * @returns {Promise<Object>} 压缩结果
     */
    async compress(messages, options = {}) {
        const startTime = Date.now();
        
        // 合并配置
        const config = { ...this.config, ...options };
        
        // 限制消息数量
        const limitedMessages = messages.slice(-config.maxMessages);
        const originalCount = limitedMessages.length;
        
        // 分析对话
        const conversationType = this.analyzer.analyzeConversationType(limitedMessages);
        const structure = this.analyzer.analyzeConversationStructure(limitedMessages);
        
        // 更新统计
        this.stats.totalCompressions++;
        this.stats.totalMessagesProcessed += originalCount;
        this.stats.conversationTypes[conversationType] = (this.stats.conversationTypes[conversationType] || 0) + 1;
        this.stats.strategyUsage[config.strategy] = (this.stats.strategyUsage[config.strategy] || 0) + 1;
        
        // 选择压缩策略
        const strategy = this._selectCompressionStrategy(conversationType, structure, config);
        
        // 执行压缩
        let result;
        switch (strategy) {
            case CompressionStrategy.AGGRESSIVE:
                result = await this._compressAggressive(limitedMessages, conversationType, structure, config);
                break;
            case CompressionStrategy.CONSERVATIVE:
                result = await this._compressConservative(limitedMessages, conversationType, structure, config);
                break;
            case CompressionStrategy.ADAPTIVE:
                result = await this._compressAdaptive(limitedMessages, conversationType, structure, config);
                break;
            case CompressionStrategy.BALANCED:
            default:
                result = await this._compressBalanced(limitedMessages, conversationType, structure, config);
                break;
        }
        
        // 计算压缩率
        const compressionRatio = originalCount > 0 ? (result.compressedMessages.length / originalCount) : 1;
        this.stats.compressionRatios.push(compressionRatio);
        
        // 限制压缩率数组大小
        if (this.stats.compressionRatios.length > 1000) {
            this.stats.compressionRatios = this.stats.compressionRatios.slice(-1000);
        }
        
        const endTime = Date.now();
        const processingTime = endTime - startTime;
        
        return {
            messages: result.compressedMessages,
            compressed: result.compressed,
            stats: {
                originalCount,
                compressedCount: result.compressedMessages.length,
                compressionRatio: compressionRatio.toFixed(4),
                compressionRate: (1 - compressionRatio).toFixed(4),
                conversationType,
                strategy: strategy,
                processingTime,
                structureAnalysis: structure,
                importanceScores: result.importanceScores,
                clusters: result.clusters,
                ...this.getStats(),
            },
            metadata: {
                compressionStrategy: strategy,
                conversationType,
                timestamp: endTime,
                config: {
                    keepRecentMessages: config.keepRecentMessages,
                    compressionThreshold: config.compressionThreshold,
                    semanticClustering: config.semanticClustering,
                },
            },
        };
    }

    /**
     * 选择压缩策略
     * @param {string} conversationType - 对话类型
     * @param {Object} structure - 对话结构
     * @param {Object} config - 配置
     * @returns {string} 压缩策略
     * @private
     */
    _selectCompressionStrategy(conversationType, structure, config) {
        // 如果用户指定了策略，使用用户指定的
        if (config.strategy && config.strategy !== CompressionStrategy.ADAPTIVE) {
            return config.strategy;
        }
        
        // 自适应策略选择
        switch (conversationType) {
            case ConversationType.DEBUGGING:
                // 调试对话：保守压缩，保留所有错误信息
                return CompressionStrategy.CONSERVATIVE;
                
            case ConversationType.CODE_REVIEW:
                // 代码审查：平衡压缩，保留代码块和重要评论
                return CompressionStrategy.BALANCED;
                
            case ConversationType.PLANNING:
                // 规划对话：激进压缩，只保留决策和关键信息
                return CompressionStrategy.AGGRESSIVE;
                
            case ConversationType.DOCUMENTATION:
                // 文档对话：平衡压缩，保留结构信息
                return CompressionStrategy.BALANCED;
                
            case ConversationType.GENERAL:
            default:
                // 一般对话：根据对话结构选择
                if (structure.errors > 0) {
                    return CompressionStrategy.CONSERVATIVE;
                } else if (structure.codeBlocks > 0) {
                    return CompressionStrategy.BALANCED;
                } else if (structure.questions.length > 10) {
                    return CompressionStrategy.AGGRESSIVE;
                } else {
                    return CompressionStrategy.BALANCED;
                }
        }
    }

    /**
     * 平衡压缩策略
     * @param {Array} messages - 消息数组
     * @param {string} conversationType - 对话类型
     * @param {Object} structure - 对话结构
     * @param {Object} config - 配置
     * @returns {Object} 压缩结果
     * @private
     */
    async _compressBalanced(messages, conversationType, structure, config) {
        const importanceScores = messages.map((msg, index) => ({
            message: msg,
            score: this.analyzer.calculateImportance(msg, index, messages.length, conversationType),
            index,
        }));
        
        // 更新重要性统计
        importanceScores.forEach(({ score }) => {
            this.stats.totalImportanceScore += score;
            this.stats.importanceCalculations++;
        });
        this.stats.averageImportanceScore = this.stats.importanceCalculations > 0 
            ? this.stats.totalImportanceScore / this.stats.importanceCalculations 
            : 0;
        
        // 分离重要和非重要消息
        const importantMessages = [];
        const nonImportantMessages = [];
        
        importanceScores.forEach(({ message, score, index }) => {
            if (score >= config.compressionThreshold) {
                importantMessages.push({ message, score, index });
            } else {
                nonImportantMessages.push({ message, score, index });
            }
        });
        
        // 保留重要消息
        const keptMessages = importantMessages
            .sort((a, b) => b.score - a.score) // 按重要性降序
            .slice(0, Math.min(importantMessages.length, config.keepRecentMessages * 2))
            .sort((a, b) => a.index - b.index) // 恢复原始顺序
            .map(item => ({
                ...item.message,
                _meta: {
                    compressed: false,
                    importanceScore: item.score,
                    keptReason: 'high_importance',
                },
            }));
        
        // 压缩非重要消息
        let compressedNonImportant = [];
        if (nonImportantMessages.length > 0 && config.semanticClustering) {
            compressedNonImportant = await this._clusterAndCompress(
                nonImportantMessages.map(item => item.message),
                conversationType,
                config
            );
        } else {
            // 如果不使用聚类，保留部分非重要消息
            const toKeep = nonImportantMessages
                .sort((a, b) => b.score - a.score)
                .slice(0, Math.min(nonImportantMessages.length, config.keepRecentMessages))
                .sort((a, b) => a.index - b.index)
                .map(item => ({
                    ...item.message,
                    _meta: {
                        compressed: false,
                        importanceScore: item.score,
                        keptReason: 'recent_non_important',
                    },
                }));
            
            compressedNonImportant = toKeep;
        }
        
        // 合并结果
        const allMessages = [...compressedNonImportant, ...keptMessages]
            .sort((a, b) => {
                const aIndex = a._meta?.originalIndex !== undefined ? a._meta.originalIndex : Infinity;
                const bIndex = b._meta?.originalIndex !== undefined ? b._meta.originalIndex : Infinity;
                return aIndex - bIndex;
            });
        
        this.stats.totalMessagesKept += keptMessages.length;
        this.stats.totalMessagesCompressed += (nonImportantMessages.length - compressedNonImportant.length);
        
        return {
            compressedMessages: allMessages,
            compressed: nonImportantMessages.length > 0,
            importanceScores: importanceScores.map(item => ({ index: item.index, score: item.score })),
            clusters: compressedNonImportant.filter(m => m._meta?.compressed).length,
        };
    }

    /**
     * 激进压缩策略
     * @param {Array} messages - 消息数组
     * @param {string} conversationType - 对话类型
     * @param {Object} structure - 对话结构
     * @param {Object} config - 配置
     * @returns {Object} 压缩结果
     * @private
     */
    async _compressAggressive(messages, conversationType, structure, config) {
        // 只保留最近的消息和非常重要的消息
        const recentMessages = messages.slice(-config.keepRecentMessages);
        const otherMessages = messages.slice(0, -config.keepRecentMessages);
        
        if (otherMessages.length === 0) {
            return {
                compressedMessages: recentMessages.map((msg, i) => ({
                    ...msg,
                    _meta: { compressed: false, keptReason: 'recent' },
                })),
                compressed: false,
                importanceScores: [],
                clusters: 0,
            };
        }
        
        // 使用 TurboQuant 进行激进压缩
        let compressedOther = [];
        if (this.turboCompressor && config.useTurboQuant) {
            try {
                const result = await this.turboCompressor.compress(otherMessages);
                compressedOther = result.messages.map(msg => ({
                    ...msg,
                    _meta: { 
                        compressed: true, 
                        compressionMethod: 'TurboQuant',
                        originalLength: msg.content?.length || 0,
                    },
                }));
            } catch (error) {
                console.warn('[IntelligentConversationCompressor] TurboQuant compression failed:', error.message);
                // 回退到简单摘要
                compressedOther = await this._createSummary(otherMessages, conversationType, config);
            }
        } else {
            // 创建摘要
            compressedOther = await this._createSummary(otherMessages, conversationType, config);
        }
        
        const allMessages = [
            ...compressedOther,
            ...recentMessages.map((msg, i) => ({
                ...msg,
                _meta: { compressed: false, keptReason: 'recent' },
            })),
        ];
        
        this.stats.totalMessagesKept += recentMessages.length;
        this.stats.totalMessagesCompressed += otherMessages.length;
        
        return {
            compressedMessages: allMessages,
            compressed: true,
            importanceScores: [],
            clusters: compressedOther.length,
        };
    }

    /**
     * 保守压缩策略
     * @param {Array} messages - 消息数组
     * @param {string} conversationType - 对话类型
     * @param {Object} structure - 对话结构
     * @param {Object} config - 配置
     * @returns {Object} 压缩结果
     * @private
     */
    async _compressConservative(messages, conversationType, structure, config) {
        // 计算重要性分数
        const importanceScores = messages.map((msg, index) => ({
            message: msg,
            score: this.analyzer.calculateImportance(msg, index, messages.length, conversationType),
            index,
        }));
        
        // 只压缩重要性非常低的消息
        const compressionThreshold = config.compressionThreshold * 0.7; // 更保守的阈值
        const importantMessages = [];
        const nonImportantMessages = [];
        
        importanceScores.forEach(({ message, score, index }) => {
            if (score >= compressionThreshold) {
                importantMessages.push({ message, score, index });
            } else {
                nonImportantMessages.push({ message, score, index });
            }
        });
        
        // 保留所有重要消息和部分非重要消息
        const keptMessages = [
            ...importantMessages.map(item => ({
                ...item.message,
                _meta: {
                    compressed: false,
                    importanceScore: item.score,
                    keptReason: 'high_importance',
                },
            })),
            ...nonImportantMessages
                .sort((a, b) => b.score - a.score)
                .slice(0, Math.min(nonImportantMessages.length, config.keepRecentMessages))
                .sort((a, b) => a.index - b.index)
                .map(item => ({
                    ...item.message,
                    _meta: {
                        compressed: false,
                        importanceScore: item.score,
                        keptReason: 'recent_non_important',
                    },
                })),
        ].sort((a, b) => {
            const aIndex = a._meta?.originalIndex !== undefined ? a._meta.originalIndex : Infinity;
            const bIndex = b._meta?.originalIndex !== undefined ? b._meta.originalIndex : Infinity;
            return aIndex - bIndex;
        });
        
        this.stats.totalMessagesKept += keptMessages.length;
        this.stats.totalMessagesCompressed += (nonImportantMessages.length - Math.min(nonImportantMessages.length, config.keepRecentMessages));
        
        return {
            compressedMessages: keptMessages,
            compressed: nonImportantMessages.length > config.keepRecentMessages,
            importanceScores: importanceScores.map(item => ({ index: item.index, score: item.score })),
            clusters: 0,
        };
    }

    /**
     * 自适应压缩策略
     * @param {Array} messages - 消息数组
     * @param {string} conversationType - 对话类型
     * @param {Object} structure - 对话结构
     * @param {Object} config - 配置
     * @returns {Object} 压缩结果
     * @private
     */
    async _compressAdaptive(messages, conversationType, structure, config) {
        // 根据对话结构动态调整策略
        let effectiveStrategy = CompressionStrategy.BALANCED;
        
        if (structure.errors > 0) {
            // 有错误：使用保守策略
            effectiveStrategy = CompressionStrategy.CONSERVATIVE;
        } else if (structure.codeBlocks > 5) {
            // 大量代码：使用平衡策略
            effectiveStrategy = CompressionStrategy.BALANCED;
        } else if (structure.questions.length > 10 && structure.answers.length < structure.questions.length / 2) {
            // 很多问题但回答少：使用激进策略压缩历史
            effectiveStrategy = CompressionStrategy.AGGRESSIVE;
        } else if (messages.length > 100) {
            // 长对话：使用平衡策略
            effectiveStrategy = CompressionStrategy.BALANCED;
        } else {
            // 短对话：使用保守策略
            effectiveStrategy = CompressionStrategy.CONSERVATIVE;
        }
        
        // 根据选择的策略调用相应的压缩方法
        switch (effectiveStrategy) {
            case CompressionStrategy.AGGRESSIVE:
                return this._compressAggressive(messages, conversationType, structure, config);
            case CompressionStrategy.CONSERVATIVE:
                return this._compressConservative(messages, conversationType, structure, config);
            case CompressionStrategy.BALANCED:
            default:
                return this._compressBalanced(messages, conversationType, structure, config);
        }
    }

    /**
     * 聚类和压缩消息
     * @param {Array} messages - 消息数组
     * @param {string} conversationType - 对话类型
     * @param {Object} config - 配置
     * @returns {Array} 压缩后的消息
     * @private
     */
    async _clusterAndCompress(messages, conversationType, config) {
        if (messages.length === 0) {
            return [];
        }
        
        // 简单的内容聚类
        const clusters = [];
        
        for (const message of messages) {
            const content = (message.content || message.message || '').toLowerCase();
            let clustered = false;
            
            // 尝试将消息添加到现有聚类
            for (const cluster of clusters) {
                if (cluster.messages.length >= config.maxClusterSize) {
                    continue;
                }
                
                // 简单相似度计算（基于共同词汇）
                const similarity = this._calculateSimilarity(cluster.keywords, content);
                if (similarity >= config.clusterThreshold) {
                    cluster.messages.push(message);
                    cluster.keywords = this._extractKeywords(
                        cluster.messages.map(m => m.content || m.message || '').join(' ')
                    );
                    clustered = true;
                    break;
                }
            }
            
            // 创建新聚类
            if (!clustered) {
                clusters.push({
                    messages: [message],
                    keywords: this._extractKeywords(content),
                });
            }
        }
        
        // 为每个聚类创建摘要
        const compressedMessages = [];
        
        for (const cluster of clusters) {
            if (cluster.messages.length === 1) {
                // 单个消息：直接保留
                compressedMessages.push({
                    ...cluster.messages[0],
                    _meta: {
                        compressed: false,
                        keptReason: 'single_message_cluster',
                    },
                });
            } else {
                // 多个消息：创建摘要
                const summary = await this._createClusterSummary(cluster.messages, conversationType, config);
                compressedMessages.push({
                    role: 'system',
                    content: summary,
                    _meta: {
                        compressed: true,
                        originalCount: cluster.messages.length,
                        compressionMethod: 'semantic_clustering',
                        clusterKeywords: cluster.keywords.slice(0, 5),
                    },
                });
            }
        }
        
        return compressedMessages;
    }

    /**
     * 计算相似度
     * @param {Array} keywords1 - 关键词数组1
     * @param {string} text2 - 文本2
     * @returns {number} 相似度分数 (0-1)
     * @private
     */
    _calculateSimilarity(keywords1, text2) {
        const words2 = this._extractKeywords(text2);
        const intersection = keywords1.filter(kw => words2.includes(kw));
        const union = [...new Set([...keywords1, ...words2])];
        
        return union.length > 0 ? intersection.length / union.length : 0;
    }

    /**
     * 提取关键词
     * @param {string} text - 文本
     * @returns {Array} 关键词数组
     * @private
     */
    _extractKeywords(text) {
        // 简单关键词提取：去除停用词，取长度大于2的单词
        const stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
            'can', 'could', 'may', 'might', 'must', 'shall',
            '我', '你', '他', '她', '它', '我们', '你们', '他们',
            '的', '了', '在', '是', '有', '和', '与', '或', '但', '而',
            '这', '那', '这个', '那个', '这些', '那些',
        ]);
        
        const words = text.toLowerCase()
            .replace(/[^\w\s\u4e00-\u9fff]/g, ' ') // 保留中文和英文单词
            .split(/\s+/)
            .filter(word => word.length > 2 && !stopWords.has(word));
        
        // 返回前10个最常见的关键词
        const frequency = {};
        words.forEach(word => {
            frequency[word] = (frequency[word] || 0) + 1;
        });
        
        return Object.entries(frequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word]) => word);
    }

    /**
     * 创建聚类摘要
     * @param {Array} messages - 消息数组
     * @param {string} conversationType - 对话类型
     * @param {Object} config - 配置
     * @returns {string} 摘要
     * @private
     */
    async _createClusterSummary(messages, conversationType, config) {
        const contents = messages.map(m => m.content || m.message || '').filter(c => c.trim().length > 0);
        
        if (contents.length === 0) {
            return '[空消息聚类]';
        }
        
        // 提取共同主题
        const allText = contents.join(' ');
        const keywords = this._extractKeywords(allText);
        
        // 根据对话类型创建不同的摘要
        let summary = '';
        switch (conversationType) {
            case ConversationType.CODE_REVIEW:
                summary = `[代码审查：${messages.length}条消息] 涉及主题：${keywords.slice(0, 3).join('、')}`;
                break;
            case ConversationType.DEBUGGING:
                summary = `[调试对话：${messages.length}条消息] 涉及问题：${keywords.slice(0, 3).join('、')}`;
                break;
            case ConversationType.PLANNING:
                summary = `[规划讨论：${messages.length}条消息] 讨论主题：${keywords.slice(0, 3).join('、')}`;
                break;
            case ConversationType.DOCUMENTATION:
                summary = `[文档讨论：${messages.length}条消息] 涉及内容：${keywords.slice(0, 3).join('、')}`;
                break;
            default:
                summary = `[${messages.length}条相关消息] 主题：${keywords.slice(0, 3).join('、')}`;
        }
        
        // 添加示例内容
        if (contents.length > 0) {
            const sample = contents[0].substring(0, 50);
            if (sample.length > 0) {
                summary += ` 示例："${sample}..."`;
            }
        }
        
        // 限制摘要长度
        if (summary.length > config.summaryLength) {
            summary = summary.substring(0, config.summaryLength - 3) + '...';
        }
        
        return summary;
    }

    /**
     * 创建摘要
     * @param {Array} messages - 消息数组
     * @param {string} conversationType - 对话类型
     * @param {Object} config - 配置
     * @returns {Array} 摘要消息
     * @private
     */
    async _createSummary(messages, conversationType, config) {
        if (messages.length === 0) {
            return [];
        }
        
        const contents = messages.map(m => m.content || m.message || '').filter(c => c.trim().length > 0);
        
        if (contents.length === 0) {
            return [{
                role: 'system',
                content: '[无内容消息]',
                _meta: { compressed: true, originalCount: messages.length },
            }];
        }
        
        // 提取关键词
        const allText = contents.join(' ');
        const keywords = this._extractKeywords(allText);
        
        // 创建摘要
        let summary = '';
        switch (conversationType) {
            case ConversationType.CODE_REVIEW:
                summary = `[历史代码审查对话摘要：${messages.length}条消息] 主要讨论：${keywords.slice(0, 5).join('、')}`;
                break;
            case ConversationType.DEBUGGING:
                summary = `[历史调试对话摘要：${messages.length}条消息] 涉及问题：${keywords.slice(0, 5).join('、')}`;
                break;
            case ConversationType.PLANNING:
                summary = `[历史规划讨论摘要：${messages.length}条消息] 讨论主题：${keywords.slice(0, 5).join('、')}`;
                break;
            case ConversationType.DOCUMENTATION:
                summary = `[历史文档讨论摘要：${messages.length}条消息] 涉及内容：${keywords.slice(0, 5).join('、')}`;
                break;
            default:
                summary = `[历史对话摘要：${messages.length}条消息] 主题：${keywords.slice(0, 5).join('、')}`;
        }
        
        // 添加统计信息
        const codeBlocks = allText.split('```').length - 1;
        if (codeBlocks > 0) {
            summary += ` 包含 ${codeBlocks} 个代码块`;
        }
        
        const questions = (allText.match(/\?/g) || []).length;
        if (questions > 0) {
            summary += ` 包含 ${questions} 个问题`;
        }
        
        // 限制摘要长度
        if (summary.length > config.summaryLength) {
            summary = summary.substring(0, config.summaryLength - 3) + '...';
        }
        
        return [{
            role: 'system',
            content: summary,
            _meta: {
                compressed: true,
                originalCount: messages.length,
                compressionMethod: 'summary',
                keywords: keywords.slice(0, 5),
                codeBlocks,
                questions,
            },
        }];
    }

    /**
     * 获取统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        const totalCompressions = this.stats.totalCompressions;
        const avgCompressionRatio = this.stats.compressionRatios.length > 0
            ? this.stats.compressionRatios.reduce((a, b) => a + b, 0) / this.stats.compressionRatios.length
            : 0;
        
        const avgCompressionRate = 1 - avgCompressionRatio;
        
        return {
            totalCompressions,
            totalMessagesProcessed: this.stats.totalMessagesProcessed,
            totalMessagesCompressed: this.stats.totalMessagesCompressed,
            totalMessagesKept: this.stats.totalMessagesKept,
            averageCompressionRatio: avgCompressionRatio.toFixed(4),
            averageCompressionRate: avgCompressionRate.toFixed(4),
            averageImportanceScore: this.stats.averageImportanceScore.toFixed(4),
            conversationTypes: { ...this.stats.conversationTypes },
            strategyUsage: { ...this.stats.strategyUsage },
            turboQuantEnabled: !!this.turboCompressor,
            turboQuantStats: this.turboCompressor ? this.turboCompressor.getStats() : null,
        };
    }

    /**
     * 重置统计信息
     */
    resetStats() {
        this.stats = {
            totalCompressions: 0,
            totalMessagesProcessed: 0,
            totalMessagesCompressed: 0,
            totalMessagesKept: 0,
            compressionRatios: [],
            conversationTypes: {},
            strategyUsage: {},
            averageImportanceScore: 0,
            totalImportanceScore: 0,
            importanceCalculations: 0,
        };
    }

    /**
     * 获取配置
     * @returns {Object} 配置信息
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * 更新配置
     * @param {Object} newConfig - 新配置
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        // 重新初始化 TurboQuant 压缩器（如果配置变更）
        if (newConfig.useTurboQuant !== undefined || newConfig.turboQuantConfig) {
            if (this.config.useTurboQuant) {
                try {
                    this.turboCompressor = new TurboContextCompressor(this.kernel, this.config.turboQuantConfig);
                } catch (error) {
                    console.warn('[IntelligentConversationCompressor] Failed to reinitialize TurboQuant compressor:', error.message);
                    this.turboCompressor = null;
                }
            } else {
                this.turboCompressor = null;
            }
        }
    }
}

export default {
    IntelligentConversationCompressor,
    ConversationType,
    CompressionStrategy,
};