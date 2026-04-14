/**
 * kernel/agent-debate.js
 * 辩论团队架构基础框架（普适设计）
 * 
 * 借鉴 TradingAgents-CN 的多智能体辩论架构
 * 支持多种领域的协作辩论，不局限于金融
 */

import { randomUUID } from 'crypto';

/**
 * 辩论角色类型（普适设计）
 */
export const DebateRole = {
    // 核心角色
    ANALYST: 'analyst',           // 分析师：分析数据和问题
    RESEARCHER: 'researcher',     // 研究员：收集和研究信息
    CRITIC: 'critic',             // 批评家：提出质疑和反驳
    SUPPORTER: 'supporter',       // 支持者：提供支持和论证
    MODERATOR: 'moderator',       // 主持人：协调辩论，总结结论
    
    // 专业角色
    EXPERT: 'expert',             // 专家：提供专业见解
    SKEPTIC: 'skeptic',           // 怀疑者：质疑假设和结论
    OPTIMIST: 'optimist',         // 乐观者：寻找积极面
    PESSIMIST: 'pessimist',       // 悲观者：识别潜在问题
    PRAGMATIST: 'pragmatist',     // 实用主义者：关注可行性
    
    // 领域特定角色（可扩展）
    TECHNICAL: 'technical',       // 技术专家：技术角度分析
    CREATIVE: 'creative',         // 创意专家：提供创新视角
    ETHICAL: 'ethical',           // 伦理专家：道德和伦理角度
    LEGAL: 'legal',               // 法律专家：合规和法律角度
    FINANCIAL: 'financial',       // 财务专家：成本和收益角度
};

/**
 * 辩论领域类型
 */
export const DebateDomain = {
    GENERAL: 'general',           // 通用领域
    TECHNICAL: 'technical',       // 技术领域
    BUSINESS: 'business',         // 商业领域
    ACADEMIC: 'academic',         // 学术领域
    CREATIVE: 'creative',         // 创意领域
    POLICY: 'policy',             // 政策领域
    ETHICAL: 'ethical',           // 伦理领域
    SCIENTIFIC: 'scientific',     // 科学领域
};

/**
 * 辩论策略类型
 */
export const DebateStrategy = {
    ADVERSARIAL: 'adversarial',   // 对抗式：正反方辩论
    COLLABORATIVE: 'collaborative', // 协作式：共同探索
    DIALECTICAL: 'dialectical',   // 辩证式：正反合
    EXPLORATORY: 'exploratory',   // 探索式：发散思维
    STRUCTURED: 'structured',     // 结构化：按步骤进行
};

/**
 * 辩论回合状态
 */
export const DebateRoundState = {
    INITIAL: 'initial',           // 初始状态
    ANALYZING: 'analyzing',       // 分析阶段
    DEBATING: 'debating',         // 辩论阶段
    VOTING: 'voting',             // 投票阶段
    CONCLUDING: 'concluding',     // 结论阶段
    COMPLETED: 'completed',       // 完成
};

/**
 * 辩论团队成员（普适设计）
 */
export class DebateMember {
    constructor(config = {}) {
        this.id = config.id || randomUUID();
        this.name = config.name || 'debate_member';
        this.role = config.role || DebateRole.ANALYST;
        this.domain = config.domain || DebateDomain.GENERAL;
        this.capabilities = config.capabilities || [];
        this.persona = config.persona || this._getDefaultPersona(config.role, config.domain);
        this.confidence = config.confidence || 0.7; // 自信度 0-1
        this.aggressiveness = config.aggressiveness || 0.5; // 攻击性 0-1
        this.reasoningDepth = config.reasoningDepth || 3; // 推理深度
        this.expertise = config.expertise || []; // 专业领域
        this.bias = config.bias || 'neutral'; // 倾向性：neutral, optimistic, pessimistic, critical
    }

    _getDefaultPersona(role, domain = DebateDomain.GENERAL) {
        // 通用角色人格
        const generalPersonas = {
            [DebateRole.ANALYST]: `你是一位经验丰富的分析师，擅长数据分析和问题诊断。
你的特点是：
1. 严谨、客观，基于事实和数据说话
2. 擅长发现模式、趋势和异常
3. 关注细节和逻辑一致性
4. 提供数据驱动的见解和建议`,

            [DebateRole.RESEARCHER]: `你是一位细致的研究员，擅长信息收集和深度研究。
你的特点是：
1. 好奇心强，喜欢探索未知
2. 擅长从多个来源收集和验证信息
3. 注重事实、证据和可靠性
4. 提供全面、深入的研究报告`,

            [DebateRole.CRITIC]: `你是一位敏锐的批评家，擅长发现问题和提出质疑。
你的特点是：
1. 批判性思维强，不轻易接受结论
2. 擅长发现逻辑漏洞和潜在问题
3. 关注假设的合理性和证据的充分性
4. 提出建设性的批评和改进建议`,

            [DebateRole.SUPPORTER]: `你是一位积极的支持者，擅长提供论证和支持。
你的特点是：
1. 建设性思维，寻找解决方案
2. 擅长提供支持证据和论证
3. 关注优点和可行性
4. 提供积极的建议和替代方案`,

            [DebateRole.MODERATOR]: `你是一位公正的主持人，负责协调辩论和总结结论。
你的特点是：
1. 公正、中立，不偏袒任何一方
2. 擅长引导讨论、平衡观点和总结要点
3. 关注共识、决策质量和时间效率
4. 确保辩论有序、高效进行`,

            [DebateRole.EXPERT]: `你是一位领域专家，提供专业见解和深度分析。
你的特点是：
1. 专业知识深厚，经验丰富
2. 擅长从专业角度分析问题
3. 关注行业最佳实践和专业标准
4. 提供权威的专业意见`,

            [DebateRole.SKEPTIC]: `你是一位怀疑者，质疑假设和结论。
你的特点是：
1. 怀疑精神强，不盲从权威
2. 擅长挑战常规思维和既有假设
3. 关注证据的充分性和逻辑的严密性
4. 提出质疑和反例`,

            [DebateRole.OPTIMIST]: `你是一位乐观者，寻找积极面和机会。
你的特点是：
1. 积极乐观，看到可能性
2. 擅长发现机会和优势
3. 关注潜在收益和正面影响
4. 提供乐观的视角和建议`,

            [DebateRole.PESSIMIST]: `你是一位悲观者，识别潜在问题和风险。
你的特点是：
1. 谨慎保守，关注风险
2. 擅长发现潜在问题和隐患
3. 关注最坏情况和负面影响
4. 提供风险警示和预防建议`,

            [DebateRole.PRAGMATIST]: `你是一位实用主义者，关注可行性和实用性。
你的特点是：
1. 务实、实际，关注落地
2. 擅长评估可行性和资源需求
3. 关注成本效益和实施难度
4. 提供切实可行的建议`,
        };

        // 领域特定人格扩展
        const domainExtensions = {
            [DebateDomain.TECHNICAL]: {
                [DebateRole.TECHNICAL]: `你是一位技术专家，从技术角度分析问题。
你的特点是：
1. 技术功底深厚，熟悉技术栈
2. 擅长技术方案设计和架构分析
3. 关注技术可行性、性能和可维护性
4. 提供技术实现建议和最佳实践`,
            },
            [DebateDomain.CREATIVE]: {
                [DebateRole.CREATIVE]: `你是一位创意专家，提供创新视角和想法。
你的特点是：
1. 创意丰富，思维活跃
2. 擅长跳出框架思考和创新
3. 关注新颖性、独特性和用户体验
4. 提供创新方案和设计建议`,
            },
            [DebateDomain.ETHICAL]: {
                [DebateRole.ETHICAL]: `你是一位伦理专家，从道德和伦理角度分析。
你的特点是：
1. 道德敏感性强，关注伦理问题
2. 擅长识别伦理风险和道德困境
3. 关注社会责任和价值观
4. 提供伦理评估和建议`,
            },
        };

        // 合并通用和领域特定人格
        let persona = generalPersonas[role] || generalPersonas[DebateRole.ANALYST];
        
        if (domainExtensions[domain] && domainExtensions[domain][role]) {
            persona = domainExtensions[domain][role];
        }

        return persona;
    }

    toConfig() {
        return {
            id: this.id,
            name: this.name,
            role: this.role,
            domain: this.domain,
            capabilities: this.capabilities,
            confidence: this.confidence,
            aggressiveness: this.aggressiveness,
            reasoningDepth: this.reasoningDepth,
            expertise: this.expertise,
            bias: this.bias,
        };
    }
}

/**
 * 辩论论点
 */
export class DebateArgument {
    constructor(config = {}) {
        this.id = config.id || randomUUID();
        this.memberId = config.memberId;
        this.memberName = config.memberName;
        this.role = config.role;
        this.content = config.content || '';
        this.evidence = config.evidence || []; // 证据列表
        this.confidence = config.confidence || 0.5;
        this.timestamp = config.timestamp || Date.now();
        this.rebuttals = config.rebuttals || []; // 反驳列表
        this.votes = config.votes || { for: 0, against: 0, abstain: 0 };
    }

    addRebuttal(rebuttal) {
        this.rebuttals.push(rebuttal);
    }

    addVote(vote) {
        if (vote === 'for') this.votes.for++;
        else if (vote === 'against') this.votes.against++;
        else if (vote === 'abstain') this.votes.abstain++;
    }

    getScore() {
        // 论点得分 = 自信度 * (支持票 - 反对票)
        return this.confidence * (this.votes.for - this.votes.against);
    }
}

/**
 * 辩论回合
 */
export class DebateRound {
    constructor(config = {}) {
        this.id = config.id || randomUUID();
        this.topic = config.topic || '';
        this.state = config.state || DebateRoundState.INITIAL;
        this.arguments = config.arguments || []; // DebateArgument 数组
        this.participants = config.participants || []; // 参与者ID列表
        this.maxRounds = config.maxRounds || 3; // 最大辩论轮数
        this.currentRound = config.currentRound || 0;
        this.consensus = config.consensus || null; // 共识结论
        this.createdAt = config.createdAt || Date.now();
        this.updatedAt = config.updatedAt || Date.now();
    }

    addArgument(argument) {
        this.arguments.push(argument);
        this.updatedAt = Date.now();
    }

    getArgumentsByMember(memberId) {
        return this.arguments.filter(arg => arg.memberId === memberId);
    }

    getArgumentsByRole(role) {
        return this.arguments.filter(arg => arg.role === role);
    }

    getTopArguments(limit = 5) {
        return this.arguments
            .sort((a, b) => b.getScore() - a.getScore())
            .slice(0, limit);
    }

    transitionTo(state) {
        this.state = state;
        this.updatedAt = Date.now();
    }

    isComplete() {
        return this.state === DebateRoundState.COMPLETED || 
               this.currentRound >= this.maxRounds;
    }
}

/**
 * 辩论团队 - 基于 TradingAgents-CN 的多智能体辩论架构
 */
export class DebateTeam {
    constructor(config = {}) {
        this.id = config.id || randomUUID();
        this.name = config.name || 'debate_team';
        this.members = new Map(); // name -> DebateMember
        this.rounds = config.rounds || []; // DebateRound 数组
        this.maxParallelDebates = config.maxParallelDebates || 2;
        this.debateTimeout = config.debateTimeout || 300000; // 5分钟
        this.consensusThreshold = config.consensusThreshold || 0.7; // 共识阈值
        this.kernel = config.kernel; // HundunOS kernel 引用

        // 注册默认辩论团队
        this._registerDefaultMembers();
    }

    /**
     * 注册默认辩论团队成员
     */
    _registerDefaultMembers() {
        // 分析师
        this.addMember(new DebateMember({
            name: 'analyst',
            role: DebateRole.ANALYST,
            capabilities: ['data_analysis', 'trend_identification', 'technical_analysis', 'fundamental_analysis'],
            confidence: 0.8,
            aggressiveness: 0.3,
            reasoningDepth: 4,
        }));

        // 研究员
        this.addMember(new DebateMember({
            name: 'researcher',
            role: DebateRole.RESEARCHER,
            capabilities: ['information_gathering', 'deep_research', 'fact_checking', 'source_verification'],
            confidence: 0.7,
            aggressiveness: 0.2,
            reasoningDepth: 5,
        }));

        // 交易员
        this.addMember(new DebateMember({
            name: 'trader',
            role: DebateRole.TRADER,
            capabilities: ['execution', 'timing', 'liquidity_analysis', 'risk_reward_assessment'],
            confidence: 0.9,
            aggressiveness: 0.7,
            reasoningDepth: 3,
        }));

        // 风险经理
        this.addMember(new DebateMember({
            name: 'risk_manager',
            role: DebateRole.RISK_MANAGER,
            capabilities: ['risk_assessment', 'risk_mitigation', 'drawdown_analysis', 'volatility_management'],
            confidence: 0.6,
            aggressiveness: 0.1,
            reasoningDepth: 4,
        }));

        // 主持人
        this.addMember(new DebateMember({
            name: 'moderator',
            role: DebateRole.MODERATOR,
            capabilities: ['facilitation', 'summarization', 'consensus_building', 'conflict_resolution'],
            confidence: 0.5,
            aggressiveness: 0.0,
            reasoningDepth: 3,
        }));
    }

    /**
     * 添加团队成员
     */
    addMember(member) {
        this.members.set(member.name, member);
        return this;
    }

    /**
     * 获取成员
     */
    getMember(name) {
        return this.members.get(name);
    }

    /**
     * 获取特定角色的成员
     */
    getMembersByRole(role) {
        return Array.from(this.members.values()).filter(m => m.role === role);
    }

    /**
     * 发起辩论
     */
    async startDebate(topic, options = {}) {
        const round = new DebateRound({
            topic,
            maxRounds: options.maxRounds || 3,
            participants: options.participants || Array.from(this.members.keys()),
        });

        this.rounds.push(round);
        round.transitionTo(DebateRoundState.ANALYZING);

        // 1. 分析阶段：各成员独立分析
        const analysisResults = await this._performAnalysis(round);
        
        // 2. 辩论阶段：多轮辩论
        const debateResults = await this._performDebate(round, analysisResults);
        
        // 3. 投票阶段：成员投票
        const voteResults = await this._performVoting(round, debateResults);
        
        // 4. 结论阶段：形成共识
        const conclusion = await this._formConclusion(round, voteResults);

        round.consensus = conclusion;
        round.transitionTo(DebateRoundState.COMPLETED);

        return {
            roundId: round.id,
            topic,
            analysis: analysisResults,
            debate: debateResults,
            voting: voteResults,
            conclusion,
            duration: Date.now() - round.createdAt,
        };
    }

    /**
     * 执行分析阶段
     */
    async _performAnalysis(round) {
        const results = {};
        const participants = round.participants;

        // 并行分析
        const analysisPromises = participants.map(async (memberName) => {
            const member = this.getMember(memberName);
            if (!member) return null;

            try {
                const analysis = await this._generateAnalysis(member, round.topic);
                const argument = new DebateArgument({
                    memberId: member.id,
                    memberName: member.name,
                    role: member.role,
                    content: analysis.content,
                    evidence: analysis.evidence || [],
                    confidence: analysis.confidence || member.confidence,
                });

                round.addArgument(argument);
                return { member: member.name, argument };
            } catch (error) {
                console.error(`[DebateTeam] Analysis failed for ${memberName}:`, error.message);
                return { member: member.name, error: error.message };
            }
        });

        const settled = await Promise.allSettled(analysisPromises);
        settled.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                results[participants[index]] = result.value;
            }
        });

        round.transitionTo(DebateRoundState.DEBATING);
        return results;
    }

    /**
     * 执行辩论阶段
     */
    async _performDebate(round, analysisResults) {
        const debateLog = [];
        const maxRounds = round.maxRounds;

        for (let currentRound = 1; currentRound <= maxRounds; currentRound++) {
            round.currentRound = currentRound;
            
            const roundArguments = [];
            const participants = round.participants;

            // 每轮辩论：每个参与者对其他人的论点进行反驳
            for (const participantName of participants) {
                const member = this.getMember(participantName);
                if (!member) continue;

                // 获取其他参与者的论点
                const otherArguments = round.arguments.filter(arg => 
                    arg.memberName !== participantName
                );

                if (otherArguments.length === 0) continue;

                // 生成反驳
                try {
                    const rebuttal = await this._generateRebuttal(
                        member, 
                        round.topic, 
                        otherArguments
                    );

                    const argument = new DebateArgument({
                        memberId: member.id,
                        memberName: member.name,
                        role: member.role,
                        content: rebuttal.content,
                        evidence: rebuttal.evidence || [],
                        confidence: rebuttal.confidence || member.confidence,
                    });

                    round.addArgument(argument);
                    roundArguments.push({
                        round: currentRound,
                        member: member.name,
                        argument,
                    });

                    // 记录反驳关系
                    otherArguments.forEach(otherArg => {
                        otherArg.addRebuttal({
                            from: member.name,
                            content: rebuttal.content,
                            timestamp: Date.now(),
                        });
                    });
                } catch (error) {
                    console.error(`[DebateTeam] Rebuttal failed for ${member.name}:`, error.message);
                }
            }

            debateLog.push({
                round: currentRound,
                arguments: roundArguments,
            });

            // 检查是否达成共识
            if (this._checkConsensus(round)) {
                break;
            }
        }

        round.transitionTo(DebateRoundState.VOTING);
        return debateLog;
    }

    /**
     * 执行投票阶段
     */
    async _performVoting(round, debateResults) {
        const votes = {};
        const participants = round.participants;

        // 每个参与者对所有论点投票
        for (const participantName of participants) {
            const member = this.getMember(participantName);
            if (!member) continue;

            const memberVotes = {};
            for (const argument of round.arguments) {
                if (argument.memberName === participantName) {
                    // 不给自己投票
                    continue;
                }

                // 根据角色和论点内容投票
                const vote = await this._generateVote(member, argument);
                argument.addVote(vote);
                memberVotes[argument.id] = vote;
            }

            votes[participantName] = memberVotes;
        }

        round.transitionTo(DebateRoundState.CONCLUDING);
        return votes;
    }

    /**
     * 形成结论
     */
    async _formConclusion(round, voteResults) {
        const moderator = this.getMember('moderator');
        if (!moderator) {
            // 如果没有主持人，使用简单多数投票
            return this._simpleMajorityConclusion(round);
        }

        // 使用主持人总结辩论
        try {
            const conclusion = await this._generateConclusion(moderator, round);
            return {
                type: 'moderated',
                content: conclusion.content,
                confidence: conclusion.confidence || 0.5,
                supportingArguments: round.getTopArguments(3),
                voteSummary: this._summarizeVotes(round),
            };
        } catch (error) {
            console.error('[DebateTeam] Conclusion generation failed:', error.message);
            return this._simpleMajorityConclusion(round);
        }
    }

    /**
     * 简单多数投票结论
     */
    _simpleMajorityConclusion(round) {
        const topArguments = round.getTopArguments(3);
        const voteSummary = this._summarizeVotes(round);

        return {
            type: 'majority',
            content: `经过 ${round.currentRound} 轮辩论，${topArguments.length} 个主要论点获得多数支持。`,
            confidence: voteSummary.confidence || 0.5,
            topArguments,
            voteSummary,
        };
    }

    /**
     * 总结投票结果
     */
    _summarizeVotes(round) {
        let totalFor = 0;
        let totalAgainst = 0;
        let totalAbstain = 0;
        let totalVotes = 0;

        for (const argument of round.arguments) {
            totalFor += argument.votes.for;
            totalAgainst += argument.votes.against;
            totalAbstain += argument.votes.abstain;
            totalVotes += argument.votes.for + argument.votes.against + argument.votes.abstain;
        }

        const confidence = totalVotes > 0 ? totalFor / totalVotes : 0;

        return {
            totalFor,
            totalAgainst,
            totalAbstain,
            totalVotes,
            confidence,
            consensus: confidence >= this.consensusThreshold,
        };
    }

    /**
     * 检查是否达成共识
     */
    _checkConsensus(round) {
        const summary = this._summarizeVotes(round);
        return summary.consensus;
    }

    /**
     * 生成分析（模拟 - 实际应调用 LLM）
     */
    async _generateAnalysis(member, topic) {
        // 这里应该调用 LLM 生成分析
        // 暂时返回模拟数据
        return {
            content: `[${member.role.toUpperCase()}] 分析 ${topic}: 基于我的专业领域，我认为...`,
            evidence: ['数据点1', '数据点2', '数据点3'],
            confidence: member.confidence,
        };
    }

    /**
     * 生成反驳（模拟 - 实际应调用 LLM）
     */
    async _generateRebuttal(member, topic, otherArguments) {
        // 这里应该调用 LLM 生成反驳
        const otherArgsText = otherArguments
            .map(arg => `[${arg.role}] ${arg.memberName}: ${arg.content.substring(0, 100)}...`)
            .join('\n');

        return {
            content: `[${member.role.toUpperCase()}] 反驳观点:\n针对以下论点：\n${otherArgsText}\n我的回应是...`,
            evidence: ['反驳证据1', '反驳证据2'],
            confidence: member.confidence * (1 - member.aggressiveness * 0.3), // 攻击性越高，自信度略降
        };
    }

    /**
     * 生成投票（模拟 - 实际应调用 LLM）
     */
    async _generateVote(member, argument) {
        // 简单模拟：根据角色和自信度投票
        const roleCompatibility = {
            [DebateRole.ANALYST]: { [DebateRole.RESEARCHER]: 0.8, [DebateRole.TRADER]: 0.6, [DebateRole.RISK_MANAGER]: 0.7 },
            [DebateRole.RESEARCHER]: { [DebateRole.ANALYST]: 0.8, [DebateRole.TRADER]: 0.5, [DebateRole.RISK_MANAGER]: 0.9 },
            [DebateRole.TRADER]: { [DebateRole.ANALYST]: 0.6, [DebateRole.RESEARCHER]: 0.5, [DebateRole.RISK_MANAGER]: 0.4 },
            [DebateRole.RISK_MANAGER]: { [DebateRole.ANALYST]: 0.7, [DebateRole.RESEARCHER]: 0.9, [DebateRole.TRADER]: 0.4 },
            [DebateRole.MODERATOR]: { [DebateRole.ANALYST]: 0.5, [DebateRole.RESEARCHER]: 0.5, [DebateRole.TRADER]: 0.5, [DebateRole.RISK_MANAGER]: 0.5 },
        };

        const compatibility = roleCompatibility[member.role]?.[argument.role] || 0.5;
        const voteThreshold = 0.5 + (member.confidence - 0.5) * 0.3;

        if (compatibility > voteThreshold) {
            return 'for';
        } else if (compatibility < 0.5) {
            return 'against';
        } else {
            return 'abstain';
        }
    }

    /**
     * 生成结论（模拟 - 实际应调用 LLM）
     */
    async _generateConclusion(moderator, round) {
        const topArguments = round.getTopArguments(3);
        const voteSummary = this._summarizeVotes(round);

        const argumentsText = topArguments
            .map((arg, i) => `${i + 1}. [${arg.role}] ${arg.memberName}: ${arg.content.substring(0, 50)}...`)
            .join('\n');

        return {
            content: `[主持人总结]\n经过 ${round.currentRound} 轮辩论，达成${voteSummary.consensus ? '共识' : '部分共识'}。\n主要论点：\n${argumentsText}\n结论：基于辩论结果，建议...`,
            confidence: voteSummary.confidence,
        };
    }

    /**
     * 获取团队状态
     */
    getStatus() {
        return {
            id: this.id,
            name: this.name,
            memberCount: this.members.size,
            members: Array.from(this.members.values()).map(m => m.toConfig()),
            activeRounds: this.rounds.filter(r => !r.isComplete()).length,
            completedRounds: this.rounds.filter(r => r.isComplete()).length,
            consensusThreshold: this.consensusThreshold,
        };
    }

    /**
     * 获取辩论历史
     */
    getDebateHistory() {
        return this.rounds.map(round => ({
            id: round.id,
            topic: round.topic,
            state: round.state,
            currentRound: round.currentRound,
            maxRounds: round.maxRounds,
            argumentCount: round.arguments.length,
            consensus: round.consensus,
            createdAt: new Date(round.createdAt).toISOString(),
            updatedAt: new Date(round.updatedAt).toISOString(),
        }));
    }
}

/**
 * 辩论团队管理器
 */
export class DebateTeamManager {
    constructor(kernel) {
        this.kernel = kernel;
        this.teams = new Map(); // teamId -> DebateTeam
        this.activeDebates = new Map(); // debateId -> { teamId, roundId, startTime, status }
    }

    /**
     * 创建辩论团队
     */
    createTeam(config = {}) {
        const team = new DebateTeam({
            ...config,
            kernel: this.kernel,
        });
        this.teams.set(team.id, team);
        return team;
    }

    /**
     * 获取团队
     */
    getTeam(teamId) {
        return this.teams.get(teamId);
    }

    /**
     * 发起辩论
     */
    async startDebate(teamId, topic, options = {}) {
        const team = this.getTeam(teamId);
        if (!team) {
            throw new Error(`Team not found: ${teamId}`);
        }

        const debateId = randomUUID();
        this.activeDebates.set(debateId, {
            teamId,
            topic,
            startTime: Date.now(),
            status: 'starting',
        });

        try {
            const result = await team.startDebate(topic, options);
            
            this.activeDebates.set(debateId, {
                ...this.activeDebates.get(debateId),
                status: 'completed',
                result,
                endTime: Date.now(),
            });

            return {
                debateId,
                teamId,
                ...result,
            };
        } catch (error) {
            this.activeDebates.set(debateId, {
                ...this.activeDebates.get(debateId),
                status: 'failed',
                error: error.message,
                endTime: Date.now(),
            });
            throw error;
        }
    }

    /**
     * 获取团队列表
     */
    getTeams() {
        return Array.from(this.teams.values()).map(t => t.getStatus());
    }

    /**
     * 获取活跃辩论
     */
    getActiveDebates() {
        return Array.from(this.activeDebates.values())
            .filter(d => d.status === 'starting' || d.status === 'running')
            .map(d => ({
                debateId: d.debateId,
                teamId: d.teamId,
                topic: d.topic,
                status: d.status,
                duration: Date.now() - d.startTime,
            }));
    }

    /**
     * 获取辩论历史
     */
    getDebateHistory(teamId = null) {
        const teams = teamId ? [this.getTeam(teamId)] : Array.from(this.teams.values());
        const history = [];

        for (const team of teams) {
            if (team) {
                history.push({
                    teamId: team.id,
                    teamName: team.name,
                    debates: team.getDebateHistory(),
                });
            }
        }

        return history;
    }
}

export default {
    DebateTeam,
    DebateMember,
    DebateRound,
    DebateArgument,
    DebateTeamManager,
    DebateRole,
    DebateRoundState,
};