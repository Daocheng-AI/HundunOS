/**
 * HundunOS v4.3 - Task 工具定义
 * 参考 learn-claude-code s12 Task System
 */

export const taskTools = [
  {
    name: 'task_create',
    description: 'Create a new task.',
    input_schema: {
      type: 'object',
      properties: {
        subject: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['subject'],
    },
  },
  {
    name: 'task_update',
    description: 'Update a task status, owner, or dependencies.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'integer' },
        status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'completed', 'deleted'],
        },
        owner: { type: 'string', description: 'Set when a teammate claims the task' },
        addBlockedBy: { type: 'array', items: { type: 'integer' } },
        addBlocks: { type: 'array', items: { type: 'integer' } },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'task_list',
    description: 'List all tasks with status summary.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'task_get',
    description: 'Get full details of a task by ID.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'integer' },
      },
      required: ['task_id'],
    },
  },
];
