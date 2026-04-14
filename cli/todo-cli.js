#!/usr/bin/env node
/**
 * HundunOS v4.3 - Todo CLI 工具
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const STORAGE_DIR = process.env.HUNDUNOS_STORAGE || '.hundunos';
const TODO_FILE = join(process.cwd(), STORAGE_DIR, 'todo', 'current.json');

/**
 * 读取 todo
 */
function readTodo() {
  if (!existsSync(TODO_FILE)) {
    return { items: [], roundsSinceUpdate: 0 };
  }

  try {
    return JSON.parse(readFileSync(TODO_FILE, 'utf8'));
  } catch (e) {
    console.error('Failed to read todo:', e.message);
    return { items: [], roundsSinceUpdate: 0 };
  }
}

/**
 * 保存 todo
 */
function saveTodo(todo) {
  const fs = require('fs');
  const dir = join(process.cwd(), STORAGE_DIR, 'todo');
  fs.mkdirSync(dir, { recursive: true });
  writeFileSync(TODO_FILE, JSON.stringify(todo, null, 2), 'utf8');
}

/**
 * 渲染 todo
 */
function renderTodo(todo) {
  if (todo.items.length === 0) {
    return 'No session plan yet.';
  }

  const lines = [];
  for (const item of todo.items) {
    const marker = {
      pending: '[ ]',
      in_progress: '[>]',
      completed: '[x]',
    }[item.status];

    const line = `${marker} ${item.content}`;
    if (item.status === 'in_progress' && item.activeForm) {
      lines.push(`${line} (${item.activeForm})`);
    } else {
      lines.push(line);
    }
  }

  const completed = todo.items.filter(i => i.status === 'completed').length;
  lines.push(`\n(${completed}/${todo.items.length} completed)`);

  return lines.join('\n');
}

/**
 * 更新 todo
 */
function updateTodo(items) {
  if (items.length > 12) {
    console.error('Keep the session plan short (max 12 items)');
    process.exit(1);
  }

  const normalized = [];
  let inProgressCount = 0;

  for (const index of items) {
    const content = items[index]?.content?.trim() || '';
    const status = items[index]?.status?.toLowerCase() || 'pending';
    const activeForm = items[index]?.activeForm?.trim() || '';

    if (!content) {
      console.error(`Item ${index}: content is required`);
      process.exit(1);
    }

    if (!['pending', 'in_progress', 'completed'].includes(status)) {
      console.error(`Item ${index}: invalid status '${status}'`);
      process.exit(1);
    }

    if (status === 'in_progress') {
      inProgressCount++;
    }

    normalized.push({
      content,
      status,
      activeForm,
    });
  }

  if (inProgressCount > 1) {
    console.error('Only one plan item can be in_progress');
    process.exit(1);
  }

  const todo = {
    items: normalized,
    roundsSinceUpdate: 0,
  };

  saveTodo(todo);
  // console.log(renderTodo(todo));
}

/**
 * 查看统计
 */
function getStats() {
  const todo = readTodo();
  const stats = {
    total: todo.items.length,
    pending: todo.items.filter(i => i.status === 'pending').length,
    inProgress: todo.items.filter(i => i.status === 'in_progress').length,
    completed: todo.items.filter(i => i.status === 'completed').length,
    roundsSinceUpdate: todo.roundsSinceUpdate,
  };

  // console.log('\nTodo Statistics:');
  // console.log(`  Total: ${stats.total}`);
  // console.log(`  Pending: ${stats.pending}`);
  // console.log(`  In Progress: ${stats.inProgress}`);
  // console.log(`  Completed: ${stats.completed}`);
  // console.log(`  Rounds since update: ${stats.roundsSinceUpdate}\n`);

  return stats;
}

/**
 * 清空 todo
 */
function clearTodo() {
  saveTodo({ items: [], roundsSinceUpdate: 0 });
  // console.log('Todo cleared');
}

// CLI 入口
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'update': {
    const itemsStr = args[1];
    if (!itemsStr) {
      console.error('Usage: todo-cli update <items-json>');
      process.exit(1);
    }

    try {
      const items = JSON.parse(itemsStr);
      updateTodo(items);
    } catch (e) {
      console.error('Invalid JSON:', e.message);
      process.exit(1);
    }
    break;
  }

  case 'show':
    // console.log(renderTodo(readTodo()));
    break;

  case 'stats':
    getStats();
    break;

  case 'clear':
    clearTodo();
    break;

  default:
    // console.log(`
HundunOS v4.3 Todo CLI

Usage:
  todo-cli update <items-json>     Update todo list
  todo-cli show                    Show current todo
  todo-cli stats                   Show statistics
  todo-cli clear                   Clear todo

Examples:
  todo-cli update '[{"content":"Task 1","status":"pending"},{"content":"Task 2","status":"in_progress","activeForm":"Working on Task 2"}]'
  todo-cli show
  todo-cli stats
  todo-cli clear
`);
    process.exit(1);
}
