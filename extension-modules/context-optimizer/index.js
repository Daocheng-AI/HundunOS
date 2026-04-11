// hundunos/extension-modules/context-optimizer/index.js — 上下文优化器
// 参考: volcengine/OpenViking, bytedance/deer-flow
// 功能: 智能上下文压缩与优化

export class ContextOptimizer {
    constructor(kernel) {
        this.kernel = kernel;
        this.maxTokens = 4000;  // 默认最大 token 数
        this.compressionRatio = 0.3;  // 压缩比例
    }

    /**
     * 优化上下文
     */
    optimize(context, options = {}) {
        const maxTokens = options.maxTokens || this.maxTokens;
        
        // 分析上下文
        const analysis = this._analyze(context);
        
        // 如果未超限，直接返回
        if (analysis.tokenCount <= maxTokens) {
            return { optimized: false, context, analysis };
        }
        
        // 压缩上下文
        const compressed = this._compress(context, analysis, maxTokens);
        
        return {
            optimized: true,
            original: context,
            compressed,
            analysis,
            savings: analysis.tokenCount - compressed.tokenCount
        };
    }

    /**
     * 分析上下文
     */
    _analyze(context) {
        const analysis = {
            tokenCount: 0,
            messageCount: 0,
            keyEntities: [],
            redundantPatterns: [],
            importance: []
        };
        
        if (Array.isArray(context.messages)) {
            analysis.messageCount = context.messages.length;
            
            for (const msg of context.messages) {
                const tokens = this._estimateTokens(msg.content || '');
                analysis.tokenCount += tokens;
                
                // 提取关键实体
                const entities = this._extractEntities(msg.content);
                analysis.keyEntities.push(...entities);
                
                // 评估重要性
                const importance = this._evaluateImportance(msg);
                analysis.importance.push({ index: msg.index, importance });
            }
        }
        
        // 去重实体
        analysis.keyEntities = [...new Set(analysis.keyEntities)];
        
        return analysis;
    }

    /**
     * 压缩上下文
     */
    _compress(context, analysis, maxTokens) {
        const targetTokens = maxTokens * (1 - this.compressionRatio);
        const messages = [...context.messages];
        
        // 按重要性排序
        const importanceMap = new Map(analysis.importance.map(i => [i.index, i.importance]));
        messages.sort((a, b) => {
            const impA = importanceMap.get(a.index) || 0;
            const impB = importanceMap.get(b.index) || 0;
            return impB - impA;
        });
        
        // 保留最重要的消息直到满足 token 限制
        const kept = [];
        let currentTokens = 0;
        
        for (const msg of messages) {
            const tokens = this._estimateTokens(msg.content || '');
            if (currentTokens + tokens <= targetTokens) {
                kept.push(msg);
                currentTokens += tokens;
            }
        }
        
        // 按原始顺序排序
        kept.sort((a, b) => a.index - b.index);
        
        return {
            messages: kept,
            tokenCount: currentTokens,
            compressionRatio: currentTokens / analysis.tokenCount
        };
    }

    /**
     * 估算 token 数
     */
    _estimateTokens(text) {
        if (!text) return 0;
        
        // 简单估算: 英文约 4 字符 = 1 token, 中文约 1.5 字符 = 1 token
        const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        const english = text.length - chinese;
        
        return Math.ceil(chinese / 1.5 + english / 4);
    }

    /**
     * 提取关键实体
     */
    _extractEntities(text) {
        const entities = [];
        
        if (!text) return entities;
        
        // 提取 URL
        const urlRegex = /https?:\/\/[^\s]+/g;
        const urls = text.match(urlRegex) || [];
        entities.push(...urls);
        
        // 提取邮箱
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
        const emails = text.match(emailRegex) || [];
        entities.push(...emails);
        
        // 提取文件路径
        const pathRegex = /(?:\/[\w.-]+)+|(?:(?:[A-Za-z]:)?\\[\w.-]+)+/g;
        const paths = text.match(pathRegex) || [];
        entities.push(...paths);
        
        // 提取代码块中的函数名
        const funcRegex = /(?:function|def|fn|func)\s+(\w+)/g;
        let match;
        while ((match = funcRegex.exec(text)) !== null) {
            entities.push(match[1]);
        }
        
        return entities;
    }

    /**
     * 评估消息重要性
     */
    _evaluateImportance(message) {
        let score = 0;
        const content = message.content || '';
        
        // 用户消息更重要
        if (message.role === 'user') score += 0.3;
        
        // 包含决策
        if (/决定|选择|确认|确定/.test(content)) score += 0.2;
        
        // 包含问题
        if (/\?|？|如何|怎么|什么/.test(content)) score += 0.1;
        
        // 包含代码
        if (/```/.test(content)) score += 0.15;
        
        // 包含错误
        if (/错误|error|exception|失败/.test(content)) score += 0.15;
        
        // 最近的消息更重要
        if (message.index !== undefined) {
            const recency = 1 / (message.index + 1);
            score += recency * 0.1;
        }
        
        return Math.min(score, 1);
    }

    /**
     * 摘要生成
     */
    summarize(messages) {
        const summary = {
            totalMessages: messages.length,
            keyTopics: [],
            decisions: [],
            actionItems: []
        };
        
        for (const msg of messages) {
            const content = msg.content || '';
            
            // 提取主题
            const topicMatch = content.match(/关于(.{2,10})[，。]/);
            if (topicMatch) {
                summary.keyTopics.push(topicMatch[1]);
            }
            
            // 提取决策
            const decisionMatch = content.match(/决定[：:]\s*(.+)/);
            if (decisionMatch) {
                summary.decisions.push(decisionMatch[1]);
            }
            
            // 提取行动项
            const actionMatch = content.match(/(?:需要|要|应该)(.+)/);
            if (actionMatch) {
                summary.actionItems.push(actionMatch[1]);
            }
        }
        
        return summary;
    }

    /**
     * 分层上下文管理
     */
    getLayeredContext(sessionId, projectId, userId) {
        return {
            session: {
                id: sessionId,
                ttl: 3600000,  // 1小时
                priority: 1
            },
            project: {
                id: projectId,
                ttl: 86400000,  // 24小时
                priority: 2
            },
            user: {
                id: userId,
                ttl: 604800000,  // 7天
                priority: 3
            },
            global: {
                ttl: Infinity,
                priority: 4
            }
        };
    }
}

export function getContextOptimizer(kernel) {
    return new ContextOptimizer(kernel);
}
