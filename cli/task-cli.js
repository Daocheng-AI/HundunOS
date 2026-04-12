#!/usr/bin/env node
/**
 * HundunOS v4.3 - Task CLI 工具
 * 管理持久任务图
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = process.env.HUNDUNOS_STORAGE || '.hundunos';
const TASKS_DIR = join(process.cwd(), STORAGE_DIR, 'tasks');

// 确保任务目录存在
if (!existsSync(TASKS_DIR)) {
  mkdirSync(TASKS_DIR, { recursive: true });
}

/**
 * 读取任务文件
 */
function readTask(taskId) {
  const filepath = join(TASKS_DIR, `task_${taskId}.json`);
  if (!existsSync(filepath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(filepath, 'utf8'));
  } catch (e) {
    console.error(`Failed to read task ${taskId}:`, e.message);
    return null;
  }
}

/**
 * 保存任务文件
 */
function saveTask(task) {
  const filepath = join(TASKS_DIR, `task_${task.id}.json`);
  writeFileSync(filepath, JSON.stringify(task, null, 2), 'utf8');
}

/**
 * 获取下一个任务 ID
 */
function getNextId() {
  const files = [];
  try {
    const allFiles = require('fs').readdirSync(TASKS_DIR);
    for (const f of allFiles) {
      files.push(f);
    }
  } catch (e) {
    return 1;
  }

  const ids = files
    .filter(f => f.startsWith('task_') && f.endsWith('.json'))
    .map(f => {
      const parts = f.split('_');
      const idStr = parts[1]?.split('.')[0] || '';
      return parseInt(idStr) || 0;
    });

  return Math.max(...ids, 0) + 1;
}

/**
 * 清除依赖
 */
function clearDependency(completedId) {
  const fs = require('fs');
  const files = [];
  try {
    const allFiles = fs.readdirSync(TASKS_DIR);
    for (const f of allFiles) {
      files.push(f);
    }
  } catch (e) {
    return;
  }

  for (const file of files) {
    const parts = file.split('_');
    const idStr = parts[1]?.split('.')[0] || '';
    const taskId = parseInt(idStr);
    if (taskId <= 0) continue;

    const task = readTask(taskId);
    if (task && task.blockedBy?.includes(completedId)) {
      task.blockedBy = task.blockedBy.filter(id => id !== completedId);
      saveTask(task);
    }
  }
}

/**
 * 创建任务
 */
function createTask(subject, description = '') {
  const taskId = getNextId();
  const task = {
    id: taskId,
    subject,
    description,
    status: 'pending',
    blockedBy: [],
    blocks: [],
    owner: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  saveTask(task);
  console.log(`Created task ${taskId}: ${subject}`);
  return task;
}

/**
 * 更新任务
 */
function updateTask(taskId, options = {}) {
  const task = readTask(taskId);
  if (!task) {
    console.error(`Task ${taskId} not found`);
    return null;
  }

  if (options.status) {
    if (!['pending', 'in_progress', 'completed', 'deleted'].includes(options.status)) {
      console.error(`Invalid status: ${options.status}`);
      return null;
    }
    task.status = options.status;
    task.updatedAt = Date.now();

    // 清除依赖
    if (options.status === 'completed') {
      clearDependency(taskId);
    }
  }

  if (options.owner !== undefined) {
    task.owner = options.owner;
  }

  if (options.addBlockedBy && Array.isArray(options.addBlockedBy)) {
    task.blockedBy = Array.from(new Set([...(task.blockedBy || []), ...options.addBlockedBy]));
  }

  if (options.addBlocks && Array.isArray(options.addBlocks)) {
    task.blocks = Array.from(new Set([...(task.blocks || []), ...options.addBlocks]));

    // 双向依赖
    for (const blockedId of options.addBlocks) {
      const blocked = readTask(blockedId);
      if (blocked) {
        if (!blocked.blockedBy.includes(taskId)) {
          blocked.blockedBy.push(taskId);
          saveTask(blocked);
        }
      }
    }
  }

  task.updatedAt = Date.now();
  saveTask(task);
  console.log(`Updated task ${taskId}`);
  return task;
}

/**
 * 列出所有任务
 */
function listTasks() {
  const fs = require('fs');
  const tasks = [];
  try {
    const allFiles = fs.readdirSync(TASKS_DIR);
    const sortedFiles = allFiles
      .filter(f => f.startsWith('task_') && f.endsWith('.json'))
      .sort();

    for (const file of sortedFiles) {
      const task = readTask(parseInt(file.split('_')[1].split('.')[0]));
      if (task) {
        tasks.push(task);
      }
    }
  } catch (e) {
    console.error('Failed to list tasks:', e.message);
  }

  if (tasks.length === 0) {
    console.log('No tasks found');
    return tasks;
  }

  console.log(`\nTotal: ${tasks.length} tasks\n`);
  for (const task of tasks) {
    const statusIcon = {
      pending: '[ ]',
      in_progress: '[>]',
      completed: '[x]',
      deleted: '[!]',
    }[task.status];

    console.log(`${statusIcon} ${task.id}. ${task.subject}`);
    if (task.description) {
      console.log(`    ${task.description}`);
    }
    if (task.owner) {
      console.log(`    Owner: ${task.owner}`);
    }
    if (task.blockedBy?.length > 0) {
      console.log(`    Blocked by: [${task.blockedBy.join(', ')}]`);
    }
    if (task.blocks?.length > 0) {
      console.log(`    Blocks: [${task.blocks.join(', ')}]`);
    }
    console.log();
  }

  return tasks;
}

/**
 * 获取任务详情
 */
function getTask(taskId) {
  const task = readTask(taskId);
  if (!task) {
    console.error(`Task ${taskId} not found`);
    return null;
  }

  console.log(`\nTask ${taskId}: ${task.subject}`);
  console.log(`Status: ${task.status}`);
  console.log(`Description: ${task.description || 'N/A'}`);
  console.log(`Owner: ${task.owner || 'N/A'}`);
  console.log(`Blocked by: [${task.blockedBy?.join(', ') || 'none'}]`);
  console.log(`Blocks: [${task.blocks?.join(', ') || 'none'}]`);
  console.log(`Created: ${new Date(task.createdAt).toISOString()}`);
  console.log(`Updated: ${new Date(task.updatedAt).toISOString()}\n`);

  return task;
}

/**
 * 删除任务
 */
function deleteTask(taskId) {
  const fs = require('fs');
  const filepath = join(TASKS_DIR, `task_${taskId}.json`);
  if (!existsSync(filepath)) {
    console.error(`Task ${taskId} not found`);
    return false;
  }

  try {
    fs.unlinkSync(filepath);
    console.log(`Deleted task ${taskId}`);
    return true;
  } catch (e) {
    console.error(`Failed to delete task ${taskId}:`, e.message);
    return false;
  }
}

/**
 * 获取统计信息
 */
function getStats() {
  const tasks = listTasks();
  const stats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    deleted: tasks.filter(t => t.status === 'deleted').length,
    blocked: tasks.filter(t => t.blockedBy?.length > 0).length,
    blocking: tasks.filter(t => t.blocks?.length > 0).length,
  };

  console.log(`\nStatistics:`);
  console.log(`  Total: ${stats.total}`);
  console.log(`  Pending: ${stats.pending}`);
  console.log(`  In Progress: ${stats.inProgress}`);
  console.log(`  Completed: ${stats.completed}`);
  console.log(`  Deleted: ${stats.deleted}`);
  console.log(`  Blocked: ${stats.blocked}`);
  console.log(`  Blocking: ${stats.blocking}\n`);

  return stats;
}

/**
 * 获取依赖图
 */
function getDependencyGraph() {
  const tasks = listTasks();
  const graph = {
    nodes: tasks.map(t => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      blockedBy: t.blockedBy || [],
      blocks: t.blocks || [],
    })),
    edges: [],
  };

  // 构建边
  for (const task of tasks) {
    for (const blockedId of task.blockedBy || []) {
      graph.edges.push({
        from: blockedId,
        to: task.id,
        type: 'blocks',
      });
    }
    for (const blockId of task.blocks || []) {
      graph.edges.push({
        from: task.id,
        to: blockId,
        type: 'blocks',
      });
    }
  }

  console.log(`\nDependency Graph:`);
  console.log(`  Nodes: ${graph.nodes.length}`);
  console.log(`  Edges: ${graph.edges.length}\n`);

  for (const edge of graph.edges) {
    console.log(`  ${edge.from} -> ${edge.to} (${edge.type})`);
  }

  console.log();

  return graph;
}

// CLI 入口
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'create': {
    const subject = args[1];
    const description = args[2] || '';
    if (!subject) {
      console.error('Usage: task-cli create <subject> [description]');
      process.exit(1);
    }
    createTask(subject, description);
    break;
  }

  case 'update': {
    const taskId = parseInt(args[1]);
    if (isNaN(taskId)) {
      console.error('Usage: task-cli update <taskId> [options]');
      process.exit(1);
    }

    const options = {};
    for (let i = 2; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--status') {
        options.status = args[++i];
      } else if (arg === '--owner') {
        options.owner = args[++i];
      } else if (arg === '--blocked-by') {
        options.addBlockedBy = args[++i].split(',').map(Number);
      } else if (arg === '--blocks') {
        options.addBlocks = args[++i].split(',').map(Number);
      }
    }

    updateTask(taskId, options);
    break;
  }

  case 'list':
    listTasks();
    break;

  case 'get': {
    const taskId = parseInt(args[1]);
    if (isNaN(taskId)) {
      console.error('Usage: task-cli get <taskId>');
      process.exit(1);
    }
    getTask(taskId);
    break;
  }

  case 'delete': {
    const taskId = parseInt(args[1]);
    if (isNaN(taskId)) {
      console.error('Usage: task-cli delete <taskId>');
      process.exit(1);
    }
    deleteTask(taskId);
    break;
  }

  case 'stats':
    getStats();
    break;

  case 'graph':
    getDependencyGraph();
    break;

  default:
    console.log(`
HundunOS v4.3 Task CLI

Usage:
  task-cli create <subject> [description]     Create a new task
  task-cli update <taskId> [options]          Update a task
  task-cli list                               List all tasks
  task-cli get <taskId>                       Get task details
  task-cli delete <taskId>                    Delete a task
  task-cli stats                              Show statistics
  task-cli graph                              Show dependency graph

Update options:
  --status <status>     Set task status (pending|in_progress|completed|deleted)
  --owner <owner>       Set task owner
  --blocked-by <ids>    Add blocked-by dependencies (comma-separated)
  --blocks <ids>        Add blocks dependencies (comma-separated)

Examples:
  task-cli create "Fix bug" "Fix the critical bug in auth module"
  task-cli update 1 --status in_progress --owner agent-1
  task-cli update 2 --blocked-by 1
  task-cli get 1
  task-cli list
  task-cli stats
  task-cli graph
`);
    process.exit(1);
}
