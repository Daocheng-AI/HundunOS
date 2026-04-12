/**
 * kernel/agent-debate.js
 * 辩论团队架构基础框架
 * 
 * 借鉴 TradingAgents-CN 的多智能体辩论架构
 * 支持：分析师、研究员、交易员、风险经理的协作辩论
 */

import { randomUUID } from 'crypto';

/**
 * 辩论角色类型
 */
export const DebateRole = {
    ANALYST: 'analyst',      // 分析师：分析市场数据
    RESEARCHER: 'researcher', // 研究员：收集和研究信息
    TRADER: 'trader',        // 交易员：执行交易决策
    RISK_MANAGER: 'risk_manager', // 风险经理：评估和管理风险
    MODERATOR: 'moderator',  // 主持人：协调辩论，总结结论
};

/**
 * 辩论回合状态
 */
export const DebateRoundState = {
    INITIAL: 'initial',      // 初始状态
    ANALYZING: 'analyzing',   // 分析阶段
    DEBATING: 'debating',    // 辩论阶段
    VOTING: 'voting',        // 投票阶段
    CONCLUDING: 'concluding', // 结论阶段
    COMPLETED: 'completed',  // 完成
};

/**
 * 辩论团队成员
 */
export class DebateMember {
    constructor(config = {}) {
        this.id = config.id || randomUUID();
        this.name = config.name || 'debate_member';
        this.role = config.role || DebateRole.ANALYST;
        this.capabilities = config.capabilities || [];
        this.persona = config.persona || this._getDefaultPersona(config.role);
        this.confidence = config.confidence || 0.7; // 自信度 0-1
        this.aggressiveness = config.aggressiveness || 0.5; // 攻击性 0-1
        this.reasoningDepth = config.reasoningDepth || 3; // 推理深度
    }

    _getDefaultPersona(role) {
        const personas = {
            [DebateRole.ANALYST]: `你是一位经验丰富的市场分析师，擅长数据分析和模式识别。
你的特点是：
1. 严谨、客观，基于数据说话
2. 擅长发现趋势和异常
3. 关注技术指标和基本面分析
4. 提供数据驱动的见解和建议`,

            [DebateRole.RESEARCHER]: `你是一位细致的研究员，擅长信息收集和深度研究。
你的特点是：
1. 好奇心强，喜欢探索未知
2. 擅长从多个来源收集信息
3. 注重事实和证据
4. 提供全面、深入的研究报告`,

            [DebateRole.TRADER]: `你是一位果断的交易员，擅长执行交易决策。
你的特点是：
1. 行动迅速，决策果断
2. 关注市场时机和流动性
3. 有丰富的实战经验
4. 注重风险回报比和执行力`,

            [DebateRole.RISK_MANAGER]: `你是一位谨慎的风险经理，擅长风险评估和管理。
你的特点是：
1. 保守、谨慎，注重风险控制
2. 擅长识别潜在风险
3. 关注最大回撤和波动率
4. 提供风险缓解建议`,

            [DebateRole.MODERATOR]: `你是一位公正的主持人，负责协调辩论和总结结论。
你的特点是：
1. 公正、中立，不偏袒任何一方
2. 擅长引导讨论和总结要点
3. 关注共识和决策质量
4. 确保辩论有序进行`
        };

        return personas[role] || personas[DebateRole.ANALYST];
    }

    toConfig() {
        return {
            id: this.id,
            name: this.name,
            role: this.role,
            capabilities: this.capabilities,
            confidence: this.confidence,
            aggressiveness: this.aggressiveness,
            reasoningDepth: this.reasoningDepth,
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