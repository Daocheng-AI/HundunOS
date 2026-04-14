// hundunos/kernel/citation-processor.js — Citation Processor v1.0
// 参考 Onyx chat/citation_processor.py 实现的引用处理系统
// 核心职责：将外部知识来源编号，融合到 LLM 回答中

export class CitationProcessor {
    constructor() {
        // citation_num → {url, title, snippet, doc_id}
        this.mapping = new Map();
        this.nextCitationNum = 1;
        // 引用块大小（每 N 个引用预分配号段，避免冲突）
        this.CITATION_BLOCK_SIZE = 100;
    }

    // ================================================================
    // 引用注册（搜索工具调用时）
    // ================================================================

    /**
     * 注册新的引用来源
     * @param {Object} source - {url, title, snippet, doc_id}
     * @returns {number} citation_num
     */
    registerSource(source) {
        // 检查是否已有相同 URL 的引用
        for (const [num, existing] of this.mapping.entries()) {
            if (existing.url === source.url) return num;
        }

        const num = this.nextCitationNum++;
        this.mapping.set(num, {
            url: source.url || '',
            title: source.title || '',
            snippet: source.snippet || '',
            doc_id: source.doc_id || null,
            cited_at: Date.now(),
        });
        return num;
    }

    /**
     * 批量注册引用（用于搜索结果）
     * 返回旧编号→新编号的映射（用于合并冲突）
     */
    registerSources(sources) {
        const results = new Map();
        for (const source of sources) {
            const num = this.registerSource(source);
            results.set(source.url || source.doc_id, num);
        }
        return results;
    }

    // ================================================================
    // 引用融合（将编号替换为来源信息）
    // ================================================================

    /**
     * 将文本中的引用编号替换为完整来源信息
     * 输入："根据[1]和[2]的研究..."
     * 输出："根据[1](来源: URL1) 和[2](来源: URL2)的研究..."
     */
    fuseCitations(text, options = {}) {
        if (!text) return text;

        const { format = 'inline', includeSnippet = false } = options;
        let result = text;

        // 匹配 [数字] 格式的引用
        const pattern = /\[(\d+)\]/g;
        const seen = new Set();

        result = result.replace(pattern, (match, numStr) => {
            const num = parseInt(numStr);
            if (seen.has(num)) return match;
            seen.add(num);

            const citation = this.mapping.get(num);
            if (!citation) return match;

            if (format === 'inline') {
                const label = citation.title
                    ? `[${num}] ${citation.title}`
                    : `[${num}] ${citation.url}`;
                return label;
            }

            if (format === 'hover') {
                const tooltip = includeSnippet && citation.snippet
                    ? `${citation.title || citation.url}\n"${citation.snippet.slice(0, 100)}"`
                    : (citation.title || citation.url);
                return `[${num}]`;
            }

            return match;
        });

        return result;
    }

    /**
     * 为文本添加上标样式的引用
     * "[1]" → "<sup>[1]</sup>" 并在末尾添加参考文献
     */
    fuseWithReferences(text, options = {}) {
        if (!text) return { text, references: [] };

        const usedNums = [];
        const pattern = /\[(\d+)\]/g;
        let match;

        while ((match = pattern.exec(text)) !== null) {
            const num = parseInt(match[1]);
            if (this.mapping.has(num) && !usedNums.includes(num)) {
                usedNums.push(num);
            }
        }

        // 添加上标
        let result = text.replace(/\[(\d+)\]/g, '<sup>[$1]</sup>');

        // 生成参考文献列表
        const references = usedNums
            .sort((a, b) => a - b)
            .map(num => {
                const c = this.mapping.get(num);
                return `[${num}] ${c.title ? c.title + ' — ' : ''}${c.url}`;
            });

        return { text: result, references };
    }

    // ================================================================
    // 工具响应处理（搜索工具返回结果时）
    // ================================================================

    /**
     * 处理搜索工具的响应，自动提取和注册引用
     * @param {string} toolResponse - 工具原始输出
     * @param {Array} sources - 来源列表 [{url, title, snippet}]
     * @returns {Object} {processed_response, registered_citations}
     */
    processToolResponse(toolResponse, sources = []) {
        if (!toolResponse) return { processed_response: toolResponse, registered_citations: 0 };

        // 注册来源并获取编号映射
        const numMapping = this.registerSources(sources);

        // 替换工具输出中的 URL 为引用编号
        let processed = toolResponse;
        for (const [url, num] of numMapping.entries()) {
            processed = processed.replace(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), `[${num}]`);
        }

        return {
            processed_response: processed,
            registered_citations: numMapping.size,
            citation_nums: Array.from(numMapping.values()),
        };
    }

    /**
     * 处理 LLM 回答，在其中嵌入引用来源
     */
    processAnswer(answer, options = {}) {
        const { citationMode = 'inline' } = options;

        if (citationMode === 'with_references') {
            const { text, references } = this.fuseWithReferences(answer, { includeSnippet: true });
            return { answer: text, references, citation_count: references.length };
        }

        return {
            answer: this.fuseCitations(answer, { format: 'inline' }),
            references: Array.from(this.mapping.entries()).map(([num, c]) => ({
                num, url: c.url, title: c.title, snippet: c.snippet,
            })),
            citation_count: this.mapping.size,
        };
    }

    // ================================================================
    // 状态管理
    // ================================================================

    /** 序列化（用于持久化） */
    serialize() {
        return {
            mapping: Array.from(this.mapping.entries()),
            nextCitationNum: this.nextCitationNum,
        };
    }

    /** 反序列化（从持久化恢复） */
    restore(data) {
        if (!data) return;
        if (data.mapping) this.mapping = new Map(data.mapping);
        if (data.nextCitationNum) this.nextCitationNum = data.nextCitationNum;
    }

    /** 重置 */
    reset() {
        this.mapping.clear();
        this.nextCitationNum = 1;
    }

    /** 获取统计 */
    getStats() {
        return {
            totalCitations: this.mapping.size,
            nextCitationNum: this.nextCitationNum,
            sources: Array.from(this.mapping.values()).map(c => ({
                url: c.url,
                title: c.title,
                snippet: c.snippet?.slice(0, 80),
            })),
        };
    }
}
