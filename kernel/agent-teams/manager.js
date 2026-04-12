// hundunos/kernel/agent-teams/manager.js — Agent Team Manager v1.0
// 多 Team 生命周期管理

import { AgentTeam } from './index.js';
import { MessageBus } from './message-bus.js';
import { PlanApprovalManager } from './plan-approval.js';

export class AgentTeamManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.teams = new Map(); // teamId -> AgentTeam
    
    // v4.3: 消息总线和计划审批管理器
    this.messageBus = new MessageBus(kernel);
    this.planApprovalManager = new PlanApprovalManager(kernel);
  }

  async initialize() {
    // review: removed // review: removed console.log('[AgentTeamManager] Initialized');
  }

  register(team) {
    this.teams.set(team.id, team);
    return team;
  }

  unregister(teamId, force = false) {
    const team = this.teams.get(teamId);
    if (!team) return { success: false, error: 'Team not found' };

    // 尝试优雅关闭
    if (!force) {
      team.shutdown?.();
    }

    this.teams.delete(teamId);
    return { success: true, teamId };
  }

  getTeam(teamId) {
    return this.teams.get(teamId);
  }

  list() {
    return Array.from(this.teams.values());
  }

  stats() {
    return {
      totalTeams: this.teams.size,
      totalMembers: Array.from(this.teams.values()).reduce((sum, t) => sum + (t.members?.size || 0), 0),
    };
  }
}

export default AgentTeamManager;
