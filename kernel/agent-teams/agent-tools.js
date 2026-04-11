// hundunos/kernel/agent-teams/agent-tools.js — Agent Team 工具集 v1.0
// 借鉴 Claude Code AgentTool 设计
// 参考: claude-code-best/src/tools/AgentTool/
//
// 提供工具接口：
//   TeamCreateTool  — 创建 Agent Team
//   TeamDeleteTool  — 删除 Agent Team
//   SendMessageTool — Team 成员间通信
//   AgentTool       — 创建子 Agent 执行任务

import { randomUUID } from 'crypto';
import { AgentTeam, TeamRole, TeamMember } from './index.js';

/**
 * 创建 Agent Team
 */
export class TeamCreateTool {
  static name = 'team_create';
  static description = 'Create a multi-agent collaboration team';

  static inputSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Team name' },
      roles: {
        type: 'array',
        description: 'Team roles',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            role: { type: 'string', enum: Object.values(TeamRole) },
            capabilities: { type: 'array', items: { type: 'string' } },
          }
        }
      },
      maxParallel: { type: 'number', default: 3 },
      timeout: { type: 'number', default: 300000 },
      isolation: {
        type: 'string',
        enum: ['worktree', 'fork', 'simulate'],
        default: 'worktree'
      },
    },
    required: ['name']
  };

  async call(args, context) {
    const team = new AgentTeam({
      name: args.name,
      maxParallel: args.maxParallel || 3,
      timeout: args.timeout || 300000,
      isolation: args.isolation || 'worktree',
    });

    if (args.roles) {
      for (const roleConfig of args.roles) {
        team.addMember(new TeamMember(roleConfig));
      }
    } else {
      team.addMember(new TeamMember({ name: 'leader', role: TeamRole.LEADER }));
      team.addMember(new TeamMember({ name: 'executor', role: TeamRole.EXECUTOR }));
    }

    context.kernel.agentTeams?.register(team);

    return {
      success: true,
      teamId: team.id,
      teamName: team.name,
      members: team.listMembers().map(m => m.toConfig()),
    };
  }
}

export class TeamDeleteTool {
  static name = 'team_delete';
  static description = 'Delete an agent team';

  static inputSchema = {
    type: 'object',
    properties: {
      teamId: { type: 'string' },
      force: { type: 'boolean', default: false },
    },
    required: ['teamId']
  };

  async call(args, context) {
    const result = context.kernel.agentTeams?.unregister(args.teamId, args.force);
    return result || { success: false, error: 'Team not found' };
  }
}

export class SendMessageTool {
  static name = 'send_message';
  static description = 'Send a message to a team member or broadcast';

  static inputSchema = {
    type: 'object',
    properties: {
      teamId: { type: 'string' },
      to: { type: 'string', description: 'Target member ID (or "all" for broadcast)' },
      message: { type: 'string' },
      type: { type: 'string', enum: ['task', 'status', 'result', 'error'], default: 'task' },
      metadata: { type: 'object' },
    },
    required: ['teamId', 'message']
  };

  async call(args, context) {
    const team = context.kernel.agentTeams?.getTeam(args.teamId);
    if (!team) return { success: false, error: 'Team not found' };

    const result = await team.sendMessage({
      from: 'coordinator',
      to: args.to || 'all',
      content: args.message,
      type: args.type || 'task',
      metadata: args.metadata || {},
    });
    return result;
  }
}

export class AgentTool {
  static name = 'agent';
  static description = 'Spawn a sub-agent to perform a task with optional isolation';

  static inputSchema = {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'Task description for the agent' },
      model: { type: 'string' },
      isolation: { type: 'string', enum: ['none', 'worktree', 'process'], default: 'none' },
      waitForResult: { type: 'boolean', default: true },
      timeout: { type: 'number', default: 120000 },
      capabilities: { type: 'array', items: { type: 'string' } },
    },
    required: ['task']
  };

  async call(args, context) {
    const agentId = `agent_${randomUUID()}`;
    const agentResult = await context.kernel.spawnAgent({
      id: agentId,
      task: args.task,
      model: args.model,
      isolation: args.isolation || 'process',
      waitForResult: args.waitForResult !== false,
      timeout: args.timeout || 120000,
      capabilities: args.capabilities || [],
    });
    return { agentId, status: 'spawned', result: agentResult };
  }
}

export function registerAgentTeamTools(toolBridge) {
  const tools = [TeamCreateTool, TeamDeleteTool, SendMessageTool, AgentTool];
  for (const Tool of tools) {
    toolBridge.registerTool(Tool.name, Tool);
  }
  return tools.length;
}
