/**
 * HundunOS v4.3 - Todo 工具定义
 * 参考 learn-claude-code s03 Todo / Planning
 */

export const todoTools = [
  {
    name: 'todo',
    description: 'Rewrite the current session plan for multi-step work.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string' },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed'],
              },
              activeForm: {
                type: 'string',
                description: 'Optional present-continuous label.',
              },
            },
            required: ['content', 'status'],
          },
        },
      },
      required: ['items'],
    },
  },
];
