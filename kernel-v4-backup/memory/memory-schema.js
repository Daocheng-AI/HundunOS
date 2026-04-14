/**
 * HundunOS v4.3 - Memory Frontmatter Schema
 * 参考 learn-claude-code s09 Memory System
 * 定义本地 memory 文件的 YAML Frontmatter 规范
 */

import { z } from 'zod';

/**
 * Memory Frontmatter Schema
 * v4.3: 参考 learn-claude-code s09
 */
export const MemoryFrontmatterSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().min(1).max(256),
  type: z.enum(['user', 'feedback', 'project', 'reference']),
  scope: z.enum(['private', 'team']).default('private'),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

/**
 * Memory Entry Schema
 */
export const MemoryEntrySchema = z.object({
  frontmatter: MemoryFrontmatterSchema,
  content: z.string().max(10000),
});

/**
 * 解析 Memory 文件内容
 * @param {string} content - 文件内容（包含 YAML frontmatter）
 * @returns {Object} { frontmatter, content }
 */
export function parseMemoryFile(content) {
  const lines = content.split('\n');
  
  // 检查是否有 YAML frontmatter
  if (!lines[0]?.trim().startsWith('---')) {
    // 没有 frontmatter，使用默认值
    return {
      frontmatter: {
        name: 'untitled',
        description: content.slice(0, 100),
        type: 'user',
        scope: 'private',
        tags: [],
      },
      content: content.trim(),
    };
  }

  // 找到 frontmatter 结束位置
  const endIdx = lines.findIndex((l, i) => i > 0 && l.trim().startsWith('---'));
  if (endIdx === -1) {
    throw new Error('Invalid YAML frontmatter: no closing ---');
  }

  const frontmatterLines = lines.slice(1, endIdx);
  const contentLines = lines.slice(endIdx + 1);

  // 解析 YAML frontmatter
  const frontmatter = {};
  for (const line of frontmatterLines) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      const key = match[1];
      let value = match[2].trim();

      // 去除首尾引号（支持单引号和双引号）
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // 解析数组
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(v => v.trim().replace(/^['"]|['"]$/g, ''));
      }

      frontmatter[key] = value;
    }
  }

  // 验证并设置默认值
  const validated = {
    name: frontmatter.name || 'untitled',
    description: frontmatter.description || frontmatter.desc || '',
    type: frontmatter.type || 'user',
    scope: frontmatter.scope || 'private',
    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
    createdAt: frontmatter.createdAt,
    updatedAt: frontmatter.updatedAt,
  };

  // 验证 type
  if (!['user', 'feedback', 'project', 'reference'].includes(validated.type)) {
    validated.type = 'user';
  }

  // 验证 scope
  if (!['private', 'team'].includes(validated.scope)) {
    validated.scope = 'private';
  }

  return {
    frontmatter: validated,
    content: contentLines.join('\n').trim(),
  };
}

/**
 * 生成 Memory 文件内容
 * @param {Object} options - { name, description, type, scope, tags, content }
 * @returns {string} Markdown 文件内容
 */
export function generateMemoryFile(options) {
  const {
    name,
    description,
    type = 'user',
    scope = 'private',
    tags = [],
    content = '',
  } = options;

  const frontmatter = {
    name,
    description,
    type,
    scope,
    tags,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const frontmatterStr = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        return `${k}: [${v.map(vv => `'${vv}'`).join(', ')}]`;
      }
      return `${k}: ${typeof v === 'string' ? `'${v}'` : v}`;
    })
    .join('\n');

  return `---
${frontmatterStr}
---

${content}`;
}
