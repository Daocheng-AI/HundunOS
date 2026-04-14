// hundunos/kernel/deep-research.js — Deep Research Orchestrator v1.0
// 参考 Onyx deep_research/dr_loop.py 实现的深度研究编排器
// 核心模式：Orchestrator（计划）→ Research（执行）→ Think（推理）→ Final Report

export class DeepResearchOrchestrator {
    constructor(kernel, modelRouter) {
        this.kernel = kernel;
        this.modelRouter = modelRouter;
        this.config = {
            maxCycles: 8,
            maxConcurrentSearch: 3,
            thinkTokenBudget: 4096,
            reportTokenBudget: 8192,
            timeoutMs: 30 * 60 * 1000, // 30min
            ...kernel?.config?.system?.deepResearch,
        };
        this.tracing = kernel?.tracing || null;
    }

    // ================================================================
    // 核心入口：执行深度研究
    // ================================================================

    /**
     * 主流程：接收用户问题，执行多轮研究循环，最终生成报告
     * Onyx 流程：clarification → plan → research cycles → final report
     */
    async research(query, session) {
        const start = Date.now();
        const context = {
            query,
            cycles: [],
            citations: new Map(),     // citation_num → {url, snippet}
            gatheredKnowledge: [],    // 收集的知识片段
            plan: null,
            status: 'running',
        };

        try {
            // === Phase 1: Clarification（如果需要澄清）===
            const clarified = await this._maybeClarify(query, session, context);
            const refinedQuery = clarified.refinedQuery || query;

            // === Phase 2: 制定研究计划 ===
            context.plan = await this._createResearchPlan(refinedQuery, session, context);

            // === Phase 3: 执行研究循环（最多 maxCycles 轮）===
            for (let i = 0; i < this.config.maxCycles; i++) {
                const cycleResult = await this._runResearchCycle(i, refinedQuery, session, context);
                context.cycles.push(cycleResult);
                context.gatheredKnowledge.push(...(cycleResult.knowledge || []));

                if (cycleResult.done) {
                    // console.log(`[DeepResearch] Cycle ${i + 1}: complete (${cycleResult.reason})`);
                    break;
                }
                // console.log(`[DeepResearch] Cycle ${i + 1}: ${cycleResult.summary}`);
            }

            // === Phase 4: 生成最终报告 ===
            const report = await this._generateFinalReport(refinedQuery, session, context);

            context.status = 'complete';
            context.latencyMs = Date.now() - start;
            context.report = report;

            return {
                success: true,
                query: refinedQuery,
                plan: context.plan,
                cycles: context.cycles.length,
                knowledge: context.gatheredKnowledge,
                citations: Object.fromEntries(context.citations),
                report,
                latencyMs: context.latencyMs,
            };
        } catch (err) {
            context.status = 'error';
            context.error = err.message;
            context.latencyMs = Date.now() - start;
            return {
                success: false,
                error: err.message,
                cycles: context.cycles.length,
                partialReport: context.gatheredKnowledge.length > 0
                    ? await this._generateFinalReport(query, session, context).catch(() => '（报告生成失败）')
                    : null,
                latencyMs: context.latencyMs,
            };
        }
    }

    // ================================================================
    // Phase 1: Clarification（澄清阶段）
    // ================================================================

    /**
     * 检查是否需要澄清：如果问题过于宽泛，询问用户以明确范围
     * Onyx: SKIP_DEEP_RESEARCH_CLARIFICATION / CLARIFICATION_PROMPT
     */
    async _maybeClarify(query, session, context) {
        const clarificationPrompt = `用户提出了一个深度研究请求：
"${query}"

请判断：
1. 如果问题清晰明确，研究范围清楚 → 直接返回 {clarify: false}
2. 如果问题过于宽泛、需要多角度探索、或者缺乏关键信息 → 返回 {clarify: true, questions: ["具体问题1", "具体问题2"]}

JSON格式回复：`;

        const result = await this._callModel(clarificationPrompt, {
            systemPrompt: '你是深度研究助手。你只需要输出 JSON，不能输出其他内容。',
            maxTokens: 512,
            temperature: 0.3,
        });

        try {
            const parsed = JSON.parse(result.content || '{}');
            if (parsed.clarify && Array.isArray(parsed.questions)) {
                return {
                    clarified: true,
                    questions: parsed.questions,
                    refinedQuery: query,
                };
            }
        } catch {}

        return { clarified: false, refinedQuery: query };
    }

    // ================================================================
    // Phase 2: 研究计划制定
    // ================================================================

    /**
     * Orchestrator 生成研究计划
     * Onyx: RESEARCH_PLAN_PROMPT — 将问题分解为可执行的子任务
     */
    async _createResearchPlan(query, session, context) {
        const prompt = `用户需要深度研究以下问题：
"${query}"

请制定研究计划，将此问题分解为具体的子任务。每个子任务应该：
- 聚焦一个具体方面
- 可以通过搜索/阅读/推理来回答
- 有明确的预期输出

请以 JSON 格式返回：
{
  "goal": "整体研究目标",
  "tasks": [
    { "id": 1, "aspect": "子任务聚焦的方面", "search_queries": ["查询1", "查询2"], "priority": "high|medium" }
  ],
  "estimated_cycles": 3
}

只输出 JSON，不要其他内容：`;

        const result = await this._callModel(prompt, {
            systemPrompt: '你是深度研究规划专家。',
            maxTokens: 1024,
            temperature: 0.5,
        });

        try {
            const plan = JSON.parse(result.content || '{}');
            context.plan = plan;
            return plan;
        } catch (e) {
            console.warn('[DeepResearch] Failed to parse research plan:', e.message);
            // 降级：生成简单计划
            return {
                goal: query,
                tasks: [{ id: 1, aspect: '全面搜索', search_queries: [query], priority: 'high' }],
                estimated_cycles: 3,
            };
        }
    }

    // ================================================================
    // Phase 3: 研究循环
    // ================================================================

    /**
     * 单轮研究循环（Onyx 核心）
     * 流程：
     *   1. 决定下一步行动（基于已完成的任务）
     *   2. 执行搜索/阅读/推理
     *   3. 整合知识
     *   4. 判断是否完成
     */
    async _runResearchCycle(cycleIndex, query, session, context) {
        const plan = context.plan || { tasks: [] };
        const completedTaskIds = new Set(context.cycles.map(c => c.taskId).filter(Boolean));

        // 找到下一个待执行的高优先级任务
        const nextTask = plan.tasks?.find(t =>
            t.priority === 'high' && !completedTaskIds.has(t.id)
        ) || plan.tasks?.find(t => !completedTaskIds.has(t.id));

        if (!nextTask) {
            return { done: true, reason: 'all_tasks_completed', cycleIndex };
        }

        const cycleContext = {
            cycleIndex,
            task: nextTask,
            knowledge: [],
            actions: [],
        };

        // === 执行搜索查询 ===
        const queries = nextTask.search_queries || [nextTask.aspect];
        for (const q of queries.slice(0, this.config.maxConcurrentSearch)) {
            const searchResult = await this._executeSearch(q, session, context);
            cycleContext.actions.push({ type: 'search', query: q, results: searchResult.results });
            cycleContext.knowledge.push(...searchResult.knowledge);
        }

        // === Think Tool：深度推理 ===
        const thinkResult = await this._thinkAboutKnowledge(
            query, nextTask.aspect, cycleContext.knowledge, session
        );
        if (thinkResult.content) {
            cycleContext.actions.push({ type: 'think', content: thinkResult.content });
            cycleContext.knowledge.push({ type: 'insight', content: thinkResult.content, source: 'reasoning' });
        }

        // === Citation Processing ===
        const citedKnowledge = this._processCitations(cycleContext.knowledge, context);

        return {
            taskId: nextTask.id,
            aspect: nextTask.aspect,
            done: nextTask.priority !== 'high' || cycleIndex >= this.config.maxCycles - 1,
            reason: cycleIndex >= this.config.maxCycles - 1 ? 'max_cycles_reached' : null,
            knowledge: citedKnowledge,
            actions: cycleContext.actions,
            summary: `${nextTask.aspect}: 找到 ${cycleContext.knowledge.length} 条知识`,
        };
    }

    /**
     * 执行搜索（调用搜索引擎或工具）
     * 参考 Onyx SearchTool / WebSearchTool
     */
    async _executeSearch(query, session, context) {
        // 优先使用 kernel 的工具桥接器
        if (this.kernel?.toolBridge) {
            try {
                const result = await this.kernel.toolBridge.execute('web_search', query);
                if (result.success) {
                    return this._parseSearchResult(result.stdout || '', query);
                }
            } catch {}
        }

        // 降级：调用 LLM 总结知识（无外部搜索时）
        const summaryResult = await this._callModel(
            `请搜索并总结关于"${query}"的关键信息，包括：核心概念、重要事实、争议点和最新进展。`,
            { systemPrompt: '你是一个信息收集助手。请基于你的知识给出全面、准确的总结。', maxTokens: 512 }
        );

        return {
            results: [{ content: summaryResult.content || '', source: 'llm_fallback' }],
            knowledge: [{ type: 'summary', content: summaryResult.content || '', source: query }],
        };
    }

    _parseSearchResult(raw, query) {
        // 简单解析搜索结果文本
        const lines = (raw || '').split('\n').filter(l => l.trim().length > 10);
        const knowledge = lines.slice(0, 5).map(l => ({
            type: 'search_result',
            content: l.trim(),
            source: query,
        }));
        return { results: lines, knowledge };
    }

    /**
     * Think Tool（Onyx THINK_TOOL_RESPONSE_MESSAGE）
     * 用于深度推理：让模型思考收集到的知识，生成洞见
     */
    async _thinkAboutKnowledge(query, aspect, knowledge, session) {
        const knowledgeText = knowledge
            .map((k, i) => `[${i + 1}] ${k.content}`)
            .join('\n');

        const prompt = `研究主题：${query}
当前方面：${aspect}

已收集的知识：
${knowledgeText}

请深入思考这些知识：
1. 这些信息对回答研究主题有什么帮助？
2. 哪些信息之间存在矛盾或需要进一步验证？
3. 研究主题中哪些方面还没有被充分覆盖？
4. 你形成了什么新的见解或假设？

请用中文详细分析，输出你的深度思考过程和结论：`;

        return await this._callModel(prompt, {
            systemPrompt: '你是一个深度思考专家。你需要仔细分析收集到的信息，形成有价值的洞见。',
            maxTokens: this.config.thinkTokenBudget,
            temperature: 0.7,
        });
    }

    /**
     * Citation Processing（参考 Onyx DynamicCitationProcessor）
     * 将引用编号替换为来源信息，融合到知识中
     */
    _processCitations(knowledge, context) {
        const citationMap = context.citations;
        return knowledge.map(k => {
            // 查找 [1], [2] 等引用格式
            const citationPattern = /\[(\d+)\]/g;
            let content = k.content || '';
            let match;
            let hasCitations = false;

            while ((match = citationPattern.exec(content)) !== null) {
                hasCitations = true;
                const num = parseInt(match[1]);
                const citation = citationMap.get(num);
                if (citation) {
                    content = content.replace(
                        match[0],
                        ` [来源${num}: ${citation.url || '未知来源'}]`
                    );
                }
            }

            return hasCitations ? { ...k, content, hasCitations: true } : k;
        });
    }

    // ================================================================
    // Phase 4: 最终报告生成
    // ================================================================

    /**
     * 基于所有研究轮次收集的知识生成最终报告
     * Onyx: FINAL_REPORT_PROMPT
     */
    async _generateFinalReport(query, session, context) {
        const allKnowledge = context.gatheredKnowledge || [];

        // 按来源分组知识
        const knowledgeByType = {};
        for (const k of allKnowledge) {
            const type = k.type || 'other';
            if (!knowledgeByType[type]) knowledgeByType[type] = [];
            knowledgeByType[type].push(k);
        }

        const knowledgeText = Object.entries(knowledgeByType)
            .map(([type, items]) => `[${type}]\n${items.map(k => `  - ${k.content}`).join('\n')}`)
            .join('\n\n');

        const citations = Array.from(context.citations.entries())
            .map(([num, cite]) => `[${num}] ${cite.url || '来源'}: ${cite.snippet || ''}`)
            .join('\n');

        const prompt = `# 研究报告

## 研究主题
${query}

## 研究计划
目标：${context.plan?.goal || '深入分析该主题'}
已完成：${context.cycles.length} 轮研究

## 收集到的知识

${knowledgeText}

## 引用来源
${citations || '（无外部引用）'}

## 报告要求

请根据以上研究资料，撰写一份完整、深入、结构清晰的研究报告：
- 开篇概述研究主题的核心发现
- 按逻辑章节展开分析
- 每个论点需有知识来源支撑
- 明确标注引用来源（如有）
- 指出研究的局限性或未解决的问题
- 用中文撰写

报告内容：`;

        const result = await this._callModel(prompt, {
            systemPrompt: '你是一个专业的研究报告撰写专家。请基于研究资料撰写全面、客观、有深度的报告。',
            maxTokens: this.config.reportTokenBudget,
            temperature: 0.5,
        });

        return result.content || '（报告生成失败）';
    }

    // ================================================================
    // 工具方法
    // ================================================================

    /**
     * 调用模型（通过 modelRouter）
     */
    async _callModel(prompt, options = {}) {
        const modelId = options.modelId || 'ollama_local';
        const messages = [
            { role: 'system', content: options.systemPrompt || '你是一个有帮助的AI助手。' },
            { role: 'user', content: prompt },
        ];

        const result = await this.modelRouter.callModel(modelId, messages, {
            maxTokens: options.maxTokens || 4096,
            temperature: options.temperature ?? 0.7,
        });

        return result;
    }

    // ================================================================
    // 流式输出支持（供 HUD 实时显示）
    // ================================================================

    /**
     * 流式研究（事件驱动，逐块输出）
     * 使用 kernel event emitter 推送进度
     */
    async *researchStream(query, session) {
        const context = {
            query,
            cycles: [],
            citations: new Map(),
            gatheredKnowledge: [],
            status: 'running',
        };

        yield { type: 'status', phase: 'clarification', message: '正在分析问题...' };

        const clarified = await this._maybeClarify(query, session, context);
        yield { type: 'clarification', result: clarified };

        yield { type: 'status', phase: 'planning', message: '正在制定研究计划...' };
        const plan = await this._createResearchPlan(clarified.refinedQuery || query, session, context);
        yield { type: 'plan', plan };

        for (let i = 0; i < this.config.maxCycles; i++) {
            yield { type: 'status', phase: 'research_cycle', cycle: i + 1, total: this.config.maxCycles };

            const cycleResult = await this._runResearchCycle(i, clarified.refinedQuery || query, session, context);
            context.cycles.push(cycleResult);
            context.gatheredKnowledge.push(...(cycleResult.knowledge || []));

            yield { type: 'cycle_complete', cycle: i + 1, result: cycleResult };

            if (cycleResult.done) break;
        }

        yield { type: 'status', phase: 'final_report', message: '正在生成最终报告...' };
        const report = await this._generateFinalReport(clarified.refinedQuery || query, session, context);
        yield { type: 'report', content: report };

        yield { type: 'complete', cycles: context.cycles.length, latencyMs: Date.now() };
    }
}
