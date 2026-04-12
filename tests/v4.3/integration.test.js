/**
 * HundunOS v4.3 - 集成测试
 * 验证完整流程
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CoreKernelV4 } from '../../kernel/core.v4.js';
import { rmSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('HundunOS v4.3 Integration Tests', () => {
  let kernel;
  const storageDir = '.hundunos/test-integration';

  beforeEach(async () => {
    mkdirSync(storageDir, { recursive: true });
    
    kernel = new CoreKernelV4({
      projectRoot: process.cwd(),
      storageDir,
      system: {
        compact: {
          enabled: true,
          contextWindowThreshold: 8000,
          summaryModel: 'gpt-4o-mini',
          maxSummaryTokens: 500,
          microCompactEnabled: true,
          keepRecentToolResults: 3,
          maxHistoryRounds: 10,
        },
        todo: {
          enabled: true,
          planReminderInterval: 3,
          maxItems: 12,
        },
        taskGraph: {
          enabled: true,
          storageDir: join(storageDir, 'tasks'),
        },
        autonomousAgents: {
          enabled: true,
          pollInterval: 5000,
          maxConcurrency: 5,
        },
      },
    });

    // Mock modelRouter
    kernel.modelRouter = {
      route: vi.fn().mockResolvedValue({
        success: true,
        content: [{ text: 'Response' }],
      }),
    };

    await kernel.initialize();
  });

  afterEach(async () => {
    if (kernel) {
      await kernel.shutdown?.();
    }
    rmSync(storageDir, { recursive: true, force: true });
  });

  describe('Todo 工具集成', () => {
    it('should create and update todo list', async () => {
      const result = await kernel.toolBridge.execute('todo', JSON.stringify({
        items: [
          { content: 'Task 1', status: 'pending' },
          { content: 'Task 2', status: 'in_progress', activeForm: 'Working on Task 2' },
          { content: 'Task 3', status: 'completed' },
        ],
      }));

      expect(result.success).toBe(true);
      expect(result.output).toContain('[ ] Task 1');
      expect(result.output).toContain('[>] Task 2 (Working on Task 2)');
      expect(result.output).toContain('[x] Task 3');
      expect(result.output).toContain('(1/3 completed)');
    });

    it('should trigger reminder after 3 rounds without update', async () => {
      // Create todo
      await kernel.toolBridge.execute('todo', JSON.stringify({
        items: [{ content: 'Task 1', status: 'pending' }],
      }));

      // Simulate 3 rounds without update
      kernel.todoManager.noteRoundWithoutUpdate();
      kernel.todoManager.noteRoundWithoutUpdate();
      kernel.todoManager.noteRoundWithoutUpdate();

      const reminder = kernel.todoManager.reminder();
      expect(reminder).toContain('<reminder>Refresh your current plan before continuing.</reminder>');
    });
  });

  describe('Task 工具集成', () => {
    it('should create, update and list tasks', async () => {
      // Create task
      const createResult = await kernel.toolBridge.execute('task_create', JSON.stringify({
        subject: 'Fix bug',
        description: 'Fix the critical bug in auth module',
      }));
      expect(createResult.success).toBe(true);
      expect(createResult.output).toContain('Created task 1');

      // Update task
      const updateResult = await kernel.toolBridge.execute('task_update', JSON.stringify({
        task_id: 1,
        status: 'in_progress',
        owner: 'agent-1',
      }));
      expect(updateResult.success).toBe(true);
      expect(updateResult.output).toContain('Updated task 1');

      // List tasks
      const listResult = await kernel.toolBridge.execute('task_list', '{}');
      expect(listResult.success).toBe(true);
      expect(listResult.output).toContain('[in_progress] Fix bug (owner: agent-1)');

      // Get task details
      const getResult = await kernel.toolBridge.execute('task_get', JSON.stringify({
        task_id: 1,
      }));
      expect(getResult.success).toBe(true);
      expect(getResult.output).toContain('Fix bug');
      expect(getResult.output).toContain('Owner: agent-1');
    });

    it('should handle task dependencies', async () => {
      // Create tasks
      await kernel.toolBridge.execute('task_create', JSON.stringify({
        subject: 'Task 1',
      }));
      await kernel.toolBridge.execute('task_create', JSON.stringify({
        subject: 'Task 2',
      }));

      // Add dependency
      await kernel.toolBridge.execute('task_update', JSON.stringify({
        task_id: 2,
        addBlockedBy: [1],
      }));

      // Verify dependency
      const getResult = await kernel.toolBridge.execute('task_get', JSON.stringify({
        task_id: 2,
      }));
      expect(getResult.output).toContain('Blocked by: [1]');
    });
  });

  describe('Autonomous Agents 集成', () => {
    it('should register agent and submit task', async () => {
      const agentManager = kernel.autonomousAgentManager;

      // Register agent
      const agentId = agentManager.registerAgent({
        name: 'code-reviewer',
        capabilities: ['code', 'review'],
      });
      expect(agentId).toBeDefined();

      // Submit task
      const taskId = agentManager.submitTask({
        subject: 'Review PR #123',
        description: 'Review the pull request for bug fix',
        priority: 'high',
        requiredCapabilities: ['code', 'review'],
      });
      expect(taskId).toBeDefined();

      // Check stats
      const stats = agentManager.getStats();
      expect(stats.totalAgents).toBe(1);
      expect(stats.pendingTasks).toBe(1);
    });

    it('should match agent capabilities with task requirements', async () => {
      const agentManager = kernel.autonomousAgentManager;

      // Register agents
      agentManager.registerAgent({
        name: 'code-reviewer',
        capabilities: ['code', 'review'],
      });
      agentManager.registerAgent({
        name: 'writer',
        capabilities: ['write', 'documentation'],
      });

      // Submit tasks
      agentManager.submitTask({
        subject: 'Review code',
        requiredCapabilities: ['code', 'review'],
      });
      agentManager.submitTask({
        subject: 'Write docs',
        requiredCapabilities: ['write', 'documentation'],
      });

      const stats = agentManager.getStats();
      expect(stats.totalAgents).toBe(2);
      expect(stats.pendingTasks).toBe(2);
    });
  });

  describe('Worktree 任务绑定集成', () => {
    it('should bind task to worktree', async () => {
      // Create task
      await kernel.toolBridge.execute('task_create', JSON.stringify({
        subject: 'Implement feature X',
      }));

      const binding = kernel.agentTeams.worktreeTaskBinding;
      
      // Bind task to worktree
      await binding.bindTaskToWorktree('task_1', 'team-abc/worker-executor');

      // Get binding status
      const status = await binding.getBindingStatus('team-abc/worker-executor');
      expect(status.task).toBeDefined();
      expect(status.worktree).toBeDefined();
      expect(status.binding).toBeDefined();
    });

    it('should close worktree and complete task', async () => {
      const binding = kernel.agentTeams.worktreeTaskBinding;

      // Close worktree
      await binding.worktreeCloseout(
        'team-abc/worker-executor',
        'merge',
        'Task completed successfully',
        true
      );

      const status = await binding.getBindingStatus('team-abc/worker-executor');
      expect(status.binding.status).toBe('completed');
    });
  });

  describe('Plan Approval 协议集成', () => {
    it('should request and respond to approval', async () => {
      const approvalManager = kernel.agentTeams.planApprovalManager;

      // Request approval
      const requestId = await approvalManager.requestApproval('worker-executor', {
        subject: 'Implement feature X',
        steps: ['Step 1', 'Step 2', 'Step 3'],
      });
      expect(requestId).toBeDefined();

      // Get pending requests
      const pending = approvalManager.getPendingRequests('worker-executor');
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(requestId);

      // Respond to approval
      const response = await approvalManager.respond(requestId, 'approve', 'Plan looks good');
      expect(response.status).toBe('approved');
      expect(response.decision).toBe('approve');
    });

    it('should get approval stats', async () => {
      const approvalManager = kernel.agentTeams.planApprovalManager;

      const requestId1 = await approvalManager.requestApproval('worker-executor', {
        subject: 'Task 1',
      });
      await approvalManager.respond(requestId1, 'approve', 'OK');

      const requestId2 = await approvalManager.requestApproval('worker-executor', {
        subject: 'Task 2',
      });
      await approvalManager.respond(requestId2, 'reject', 'Not OK');

      const stats = approvalManager.getStats();
      expect(stats.total).toBe(0); // Completed requests are removed
      expect(stats.approved).toBe(0);
      expect(stats.rejected).toBe(0);
    });
  });

  describe('MessageBus 集成', () => {
    it('should send and receive messages', async () => {
      const messageBus = kernel.agentTeams.messageBus;

      // Send message
      const result = messageBus.send('worker-executor', 'lead', 'Task completed', 'message');
      expect(result).toContain('Sent message to lead');

      // Read inbox
      const messages = messageBus.readInbox('lead');
      expect(messages).toHaveLength(1);
      expect(messages[0].from).toBe('worker-executor');
      expect(messages[0].to).toBe('lead');
      expect(messages[0].content).toBe('Task completed');
      expect(messages[0].type).toBe('message');
    });

    it('should broadcast messages', async () => {
      const messageBus = kernel.agentTeams.messageBus;

      // Broadcast message
      const result = messageBus.broadcast('lead', 'Team meeting at 3 PM', [
        'worker-executor',
        'worker-reviewer',
        'worker-researcher',
      ]);
      expect(result).toContain('Broadcast to 3 teammates');

      // Read inboxes
      const executorMessages = messageBus.readInbox('worker-executor');
      const reviewerMessages = messageBus.readInbox('worker-reviewer');
      const researcherMessages = messageBus.readInbox('worker-researcher');

      expect(executorMessages).toHaveLength(1);
      expect(reviewerMessages).toHaveLength(1);
      expect(researcherMessages).toHaveLength(1);
    });

    it('should handle plan approval messages', async () => {
      const messageBus = kernel.agentTeams.messageBus;
      const approvalManager = kernel.agentTeams.planApprovalManager;

      // Request approval
      const requestId = await approvalManager.requestApproval('worker-executor', {
        subject: 'Task 1',
      });

      // Read lead's inbox
      const messages = messageBus.readInbox('lead');
      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('plan_approval_request');
      expect(messages[0].extra.requestId).toBe(requestId);

      // Respond to approval
      await approvalManager.respond(requestId, 'approve', 'OK');

      // Read worker's inbox
      const workerMessages = messageBus.readInbox('worker-executor');
      expect(workerMessages).toHaveLength(1);
      expect(workerMessages[0].type).toBe('plan_approval_response');
      expect(workerMessages[0].extra.decision).toBe('approve');
    });
  });

  describe('Compact 三层压缩集成', () => {
    it('should apply microcompact to tool results', async () => {
      const { microcompact } = await import('../../kernel/mixins/ProcessMixin.js');

      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: [ { tool_use_id: '1', name: 'Bash', input: 'echo "tool1"' } ] },
        { role: 'tool', content: 'tool1 result' },
        { role: 'user', content: [ { tool_use_id: '2', name: 'Bash', input: 'echo "tool2"' } ] },
        { role: 'tool', content: 'tool2 result' },
        { role: 'user', content: [ { tool_use_id: '3', name: 'Bash', input: 'echo "tool3"' } ] },
        { role: 'tool', content: 'tool3 result' },
        { role: 'user', content: [ { tool_use_id: '4', name: 'Bash', input: 'echo "tool4"' } ] },
        { role: 'tool', content: 'tool4 result' },
        { role: 'user', content: [ { tool_use_id: '5', name: 'Bash', input: 'echo "tool5"' } ] },
        { role: 'tool', content: 'tool5 result' },
      ];

      const compacted = microcompact(messages);

      // Should keep recent 3 tool results
      const toolResults = compacted.filter(m => m.role === 'tool' || (m.role === 'user' && Array.isArray(m.content)));
      expect(toolResults.length).toBe(6); // 3 tool calls + 3 tool results

      // Old tool results should be replaced with summaries
      const summaries = compacted.filter(m => m._microcompacted);
      expect(summaries.length).toBe(2);
    });
  });

  describe('Recovery 集成', () => {
    it('should handle max_tokens error with CONTINUE action', async () => {
      const recovery = kernel.recovery;

      const event = {
        type: 'agent_error',
        error: 'max_tokens',
        context: { sessionId: 'test-session' },
      };

      // Create session
      kernel.state.sessions.set('test-session', {
        id: 'test-session',
        messages: [],
      });

      const result = await recovery.handle(event);
      expect(result.ok).toBe(true);
      expect(result.message).toContain('已注入续写提示');

      const session = kernel.state.sessions.get('test-session');
      expect(session.messages).toHaveLength(1);
      expect(session.messages[0].content).toContain('Please continue from where you left off');
    });

    it('should handle context exceeded error with COMPACT_AND_RETRY action', async () => {
      const recovery = kernel.recovery;

      const event = {
        type: 'agent_error',
        error: 'context_length_exceeded',
        context: { sessionId: 'test-session' },
      };

      // Create session with messages
      kernel.state.sessions.set('test-session', {
        id: 'test-session',
        messages: [
          { role: 'user', content: 'Message 1' },
          { role: 'assistant', content: 'Response 1' },
          { role: 'user', content: 'Message 2' },
          { role: 'assistant', content: 'Response 2' },
        ],
      });

      // Mock compactor
      kernel.compactor = {
        compact: vi.fn().mockResolvedValue({
          summary: { role: 'user', content: 'Summary' },
          preservedMessages: [],
          recent: [],
          stats: { originalCount: 4, compressedCount: 1 },
        }),
      };

      const result = await recovery.handle(event);
      expect(result.ok).toBe(true);
      expect(result.message).toContain('已压缩消息');
    });
  });

  describe('Memory Frontmatter 集成', () => {
    it('should parse and validate memory frontmatter', async () => {
      const { parseMemoryFile, MemoryFrontmatterSchema } = await import('../../kernel/memory/memory-schema.js');

      const content = `---
name: "User prefers dark mode"
description: "User consistently chooses dark theme in UI settings"
type: "user"
scope: "private"
tags: ["preference", "ui"]
createdAt: "2025-01-15T10:30:00Z"
updatedAt: "2025-01-15T10:30:00Z"
---

User preferred dark mode in the last 3 sessions.`;

      const parsed = parseMemoryFile(content);
      expect(parsed.frontmatter).toMatchObject({
        name: 'User prefers dark mode',
        type: 'user',
        scope: 'private',
      });
      expect(parsed.body).toBe('User preferred dark mode in the last 3 sessions.');
    });

    it('should filter memories by type and scope', async () => {
      // Create test memories
      await kernel.memoryGraph.record(
        { content: 'User prefers dark mode' },
        { type: 'user', scope: 'private' },
        { success: true }
      );
      await kernel.memoryGraph.record(
        { content: 'Project uses TypeScript' },
        { type: 'project', scope: 'team' },
        { success: true }
      );

      // Recall with filters
      const userMemories = await kernel.memoryGraph.recall('preferences', {
        type: 'user',
        scope: 'private',
      });

      expect(userMemories).toBeDefined();
    });
  });

  describe('PromptParts 集成', () => {
    it('should build system prompt with PromptParts', async () => {
      const { PromptParts, buildSystemPrompt } = await import('../../kernel/prompts/prompt-parts.js');

      const parts = new PromptParts()
        .setCoreIdentity('You are a helpful coding assistant.')
        .setMemorySection('User prefers dark mode.')
        .setSkillSection('code, review')
        .setTaskContext('Fix the bug in auth module')
        .setToolGuidance('Use Bash for file operations');

      const systemPrompt = parts.build();
      expect(systemPrompt).toContain('You are a helpful coding assistant');
      expect(systemPrompt).toContain('User prefers dark mode');
      expect(systemPrompt).toContain('Fix the bug in auth module');
      expect(systemPrompt).toContain('Use Bash for file operations');
    });
  });

  describe('端到端流程', () => {
    it('should complete full workflow: todo -> task -> agent -> approval', async () => {
      // 1. Create todo
      await kernel.toolBridge.execute('todo', JSON.stringify({
        items: [
          { content: 'Create task', status: 'completed' },
          { content: 'Assign to agent', status: 'in_progress' },
          { content: 'Request approval', status: 'pending' },
        ],
      }));

      // 2. Create task
      await kernel.toolBridge.execute('task_create', JSON.stringify({
        subject: 'Implement feature X',
        description: 'Implement the new feature for auth module',
      }));

      // 3. Register agent
      const agentId = kernel.autonomousAgentManager.registerAgent({
        name: 'feature-developer',
        capabilities: ['code', 'feature'],
      });

      // 4. Submit task to agent
      const taskId = kernel.autonomousAgentManager.submitTask({
        subject: 'Implement feature X',
        requiredCapabilities: ['code', 'feature'],
      });

      // 5. Request approval
      const requestId = await kernel.agentTeams.planApprovalManager.requestApproval(
        'feature-developer',
        {
          subject: 'Implement feature X',
          steps: ['Step 1', 'Step 2', 'Step 3'],
        }
      );

      // 6. Respond to approval
      await kernel.agentTeams.planApprovalManager.respond(requestId, 'approve', 'Plan approved');

      // 7. Update todo
      await kernel.toolBridge.execute('todo', JSON.stringify({
        items: [
          { content: 'Create task', status: 'completed' },
          { content: 'Assign to agent', status: 'completed' },
          { content: 'Request approval', status: 'completed' },
        ],
      }));

      // Verify final state
      const todoStats = kernel.todoManager.getStats();
      expect(todoStats.completed).toBe(3);

      const taskStats = await kernel.taskGraph.getStats();
      expect(taskStats.total).toBe(1);

      const agentStats = kernel.autonomousAgentManager.getStats();
      expect(agentStats.totalAgents).toBe(1);
    });
  });
});
