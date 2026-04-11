/**
 * HundunOS v3.0 - WorkBuddy Extension
 * WorkBuddy IDE 集成扩展
 * 
 * 功能:
 * - 进程管理与监控
 * - 任务提交与结果获取
 * - 状态同步
 */

import { EventEmitter } from 'events';
import { spawn, exec } from 'child_process';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';

// ============================================================================
// WorkBuddy 状态
// ============================================================================

export const WorkBuddyState = {
    STOPPED:    'stopped',
    STARTING:   'starting',
    RUNNING:    'running',
    BUSY:       'busy',
    ERROR:      'error'
};

// ============================================================================
// WorkBuddy Extension
// ============================================================================

export class WorkBuddyExtension extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            workbuddyPath: config.workbuddyPath || 'C:\\Program Files\\WorkBuddy\\workbuddy.exe',
            port: config.port || 28790,
            mcpPort: config.mcpPort || 28791,
            autoStart: config.autoStart || false,
            restartOnCrash: config.restartOnCrash !== false,
            maxRestarts: config.maxRestarts || 3,
            ...config
        };

        this.state = WorkBuddyState.STOPPED;
        this.process = null;
        this.tasks = new Map();        // taskId -> task
        this.results = new Map();      // taskId -> result
        this.restartCount = 0;
        this.lastError = null;
        this.stats = {
            tasksSubmitted: 0,
            tasksCompleted: 0,
            tasksFailed: 0,
            uptime: 0,
            startTime: null
        };

        // review: removed // review: removed console.log('[WorkBuddy] Extension initialized');
    }

    // ========================================================================
    // 进程管理
    // ========================================================================

    /**
     * 启动 WorkBuddy
     */
    async start() {
        if (this.state === WorkBuddyState.RUNNING) {
            return { alreadyRunning: true };
        }

        this.state = WorkBuddyState.STARTING;
        this.emit('starting');

        try {
            // 检查是否已运行
            const running = await this._checkRunning();
            if (running) {
                this.state = WorkBuddyState.RUNNING;
                this.stats.startTime = Date.now();
                // review: removed // review: removed console.log('[WorkBuddy] Already running');
                return { alreadyRunning: true };
            }

            // 启动进程
            this.process = spawn(this.config.workbuddyPath, [], {
                detached: true,
                stdio: 'ignore',
                windowsHide: true
            });

            this.process.unref();

            // 等待启动
            await this._waitForReady(10000);

            this.state = WorkBuddyState.RUNNING;
            this.stats.startTime = Date.now();
            this.restartCount = 0;

            // review: removed // review: removed console.log('[WorkBuddy] Started');
            this.emit('started');

            return { started: true, pid: this.process?.pid };
        } catch (error) {
            this.state = WorkBuddyState.ERROR;
            this.lastError = error.message;
            console.error('[WorkBuddy] Start failed:', error.message);
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * 停止 WorkBuddy
     */
    async stop() {
        if (this.state === WorkBuddyState.STOPPED) {
            return { alreadyStopped: true };
        }

        try {
            if (this.process) {
                this.process.kill();
                this.process = null;
            }

            this.state = WorkBuddyState.STOPPED;
            // review: removed // review: removed console.log('[WorkBuddy] Stopped');
            this.emit('stopped');

            return { stopped: true };
        } catch (error) {
            console.error('[WorkBuddy] Stop failed:', error.message);
            throw error;
        }
    }

    /**
     * 重启 WorkBuddy
     */
    async restart() {
        await this.stop();
        await new Promise(r => setTimeout(r, 1000));
        return this.start();
    }

    /**
     * 获取状态
     */
    getStatus() {
        return {
            state: this.state,
            pid: this.process?.pid,
            port: this.config.port,
            mcpPort: this.config.mcpPort,
            uptime: this.stats.startTime ? Date.now() - this.stats.startTime : 0,
            tasks: {
                pending: this.tasks.size,
                completed: this.results.size
            },
            stats: this.stats,
            lastError: this.lastError
        };
    }

    // ========================================================================
    // 任务管理
    // ========================================================================

    /**
     * 提交任务
     */
    async submitTask(task) {
        const taskId = `task_${randomUUID()}`;

        const taskObj = {
            id: taskId,
            type: task.type || 'code',
            content: task.content,
            language: task.language || 'python',
            priority: task.priority || 'normal',
            status: 'pending',
            createdAt: new Date().toISOString(),
            ...task
        };

        this.tasks.set(taskId, taskObj);
        this.stats.tasksSubmitted++;

        // review: removed // review: removed console.log(`[WorkBuddy] Task submitted: ${taskId}`);
        this.emit('task_submitted', { taskId, task: taskObj });

        // 模拟执行（实际通过 MCP 或 IPC）
        this._executeTask(taskId, taskObj);

        return { taskId, status: 'submitted' };
    }

    /**
     * 获取任务结果
     */
    getTaskResult(taskId) {
        return this.results.get(taskId);
    }

    /**
     * 获取任务状态
     */
    getTaskStatus(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) return null;

        return {
            id: task.id,
            status: task.status,
            result: this.results.get(taskId)
        };
    }

    /**
     * 取消任务
     */
    cancelTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) return false;

        if (task.status === 'pending' || task.status === 'running') {
            task.status = 'cancelled';
            this.emit('task_cancelled', { taskId });
            return true;
        }

        return false;
    }

    // ========================================================================
    // 内部方法
    // ========================================================================

    async _checkRunning() {
        return new Promise((resolve) => {
            exec('tasklist /FI "IMAGENAME eq WorkBuddy.exe"', (err, stdout) => {
                resolve(stdout?.toLowerCase().includes('workbuddy'));
            });
        });
    }

    async _waitForReady(timeout = 10000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const running = await this._checkRunning();
            if (running) return true;
            await new Promise(r => setTimeout(r, 500));
        }
        throw new Error('WorkBuddy start timeout');
    }

    async _executeTask(taskId, task) {
        task.status = 'running';
        this.state = WorkBuddyState.BUSY;
        this.emit('task_started', { taskId });

        try {
            // 实际调用 toolBridge 执行任务
            let result;
            
            if (task.type === 'code' && task.toolId) {
                // 代码执行：调用 toolBridge
                result = await this.toolBridge.execute(task.toolId, task.args || '');
            } else if (task.type === 'analysis') {
                // 分析任务：调用 ModelRouter
                result = await this.modelRouter.route({ content: task.input }, {});
            } else {
                // 默认：模拟执行（兼容旧任务）
                await new Promise(r => setTimeout(r, 500));
                result = { success: true, output: `Task ${task.type} processed` };
            }

            if (result?.success !== false) {
                this.results.set(taskId, {
                    taskId,
                    status: 'completed',
                    output: result.stdout || result.content || result.output,
                    completedAt: new Date().toISOString()
                });
                task.status = 'completed';
                this.stats.tasksCompleted++;
                // review: removed // review: removed console.log(`[WorkBuddy] Task completed: ${taskId}`);
                this.emit('task_completed', { taskId, result });
            } else {
                throw new Error(result.error || 'Task execution failed');
            }
        } catch (e) {
            this.results.set(taskId, {
                taskId,
                status: 'failed',
                error: e.message,
                completedAt: new Date().toISOString()
            });
            task.status = 'failed';
            this.stats.tasksFailed++;
            // review: removed // review: removed console.log(`[WorkBuddy] Task failed: ${taskId} - ${e.message}`);
            this.emit('task_failed', { taskId, error: e.message });
        }

        this.state = WorkBuddyState.RUNNING;
    }
}

// ============================================================================
// 单例
// ============================================================================

let instance = null;

export function getWorkBuddyExtension() {
    if (!instance) {
        instance = new WorkBuddyExtension();
    }
    return instance;
}

export default {
    WorkBuddyExtension,
    getWorkBuddyExtension,
    WorkBuddyState
};
