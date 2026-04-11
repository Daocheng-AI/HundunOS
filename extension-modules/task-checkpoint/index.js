// hundunos/extension-modules/task-checkpoint/index.js — Long-Running Task Checkpoint System
// 功能: 长程任务检查点机制，支持暂停/恢复，参考 deer-flow 设计
// 状态: 新增

import { randomUUID } from 'crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const TaskState = {
    PENDING: 'pending',
    RUNNING: 'running',
    PAUSED: 'paused',
    COMPLETED: 'completed',
    FAILED: 'failed'
};

export class TaskCheckpoint {
    constructor(kernel) {
        this.kernel = kernel;
        this.activeTasks = new Map();
        this.checkpoints = new Map();
        
        // 配置
        this.config = {
            checkpointDir: join(__dirname, '..', '..', 'data', 'checkpoints'),
            maxCheckpoints: 10,
            autoSaveInterval: 30000  // 30秒自动保存
        };
        
        this.stats = {
            created: 0,
            paused: 0,
            resumed: 0,
            completed: 0,
            failed: 0
        };
    }

    async initialize() {
        // 确保检查点目录存在
        mkdirSync(this.config.checkpointDir, { recursive: true });
        
        // 加载已有的检查点
        await this._loadCheckpoints();
        
        console.log('[TaskCheckpoint] Initialized,', this.checkpoints.size, 'checkpoints loaded');
    }

    /**
     * 创建新任务
     */
    createTask(name, initialState = {}) {
        const taskId = `task_${randomUUID()}`;
        
        const task = {
            id: taskId,
            name,
            state: TaskState.PENDING,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            progress: 0,
            steps: [],
            currentStep: 0,
            context: initialState.context || {},
            result: null,
            error: null
        };
        
        this.activeTasks.set(taskId, task);
        this.stats.created++;
        
        console.log(`[TaskCheckpoint] Created task: ${taskId} (${name})`);
        return taskId;
    }

    /**
     * 开始任务
     */
    startTask(taskId) {
        const task = this.activeTasks.get(taskId);
        if (!task) return null;
        
        task.state = TaskState.RUNNING;
        task.startedAt = Date.now();
        task.updatedAt = Date.now();
        
        console.log(`[TaskCheckpoint] Started task: ${taskId}`);
        return task;
    }

    /**
     * 记录任务步骤
     */
    recordStep(taskId, stepName, stepData = {}) {
        const task = this.activeTasks.get(taskId);
        if (!task) return null;
        
        const step = {
            id: task.steps.length,
            name: stepName,
            data: stepData,
            startedAt: Date.now(),
            completedAt: null,
            duration: null
        };
        
        task.steps.push(step);
        task.currentStep = step.id;
        
        // 立即保存检查点
        this._saveCheckpoint(taskId);
        
        return step;
    }

    /**
     * 完成步骤
     */
    completeStep(taskId, stepResult = {}) {
        const task = this.activeTasks.get(taskId);
        if (!task || task.steps.length === 0) return null;
        
        const currentStep = task.steps[task.currentStep];
        if (currentStep) {
            currentStep.completedAt = Date.now();
            currentStep.duration = currentStep.completedAt - currentStep.startedAt;
            currentStep.result = stepResult;
        }
        
        // 更新进度
        task.progress = Math.round((task.currentStep + 1) / task.steps.length * 100);
        task.updatedAt = Date.now();
        
        // 保存检查点
        this._saveCheckpoint(taskId);
        
        return currentStep;
    }

    /**
     * 暂停任务 (保存检查点)
     */
    pauseTask(taskId, reason = '') {
        const task = this.activeTasks.get(taskId);
        if (!task) return null;
        
        task.state = TaskState.PAUSED;
        task.pausedAt = Date.now();
        task.pauseReason = reason;
        task.updatedAt = Date.now();
        
        // 保存检查点
        this._saveCheckpoint(taskId);
        
        this.stats.paused++;
        console.log(`[TaskCheckpoint] Paused task: ${taskId} (${reason})`);
        
        return task;
    }

    /**
     * 恢复任务
     */
    resumeTask(taskId) {
        const task = this.activeTasks.get(taskId);
        if (!task) {
            // 尝试从持久化恢复
            const checkpoint = this.checkpoints.get(taskId);
            if (checkpoint) {
                this.activeTasks.set(taskId, checkpoint);
                task = checkpoint;
            } else {
                return null;
            }
        }
        
        task.state = TaskState.RUNNING;
        task.resumedAt = Date.now();
        task.updatedAt = Date.now();
        
        this.stats.resumed++;
        console.log(`[TaskCheckpoint] Resumed task: ${taskId}`);
        
        return task;
    }

    /**
     * 完成任务
     */
    completeTask(taskId, result = {}) {
        const task = this.activeTasks.get(taskId);
        if (!task) return null;
        
        task.state = TaskState.COMPLETED;
        task.completedAt = Date.now();
        task.result = result;
        task.updatedAt = Date.now();
        task.progress = 100;
        
        // 清理检查点
        this.checkpoints.delete(taskId);
        
        this.stats.completed++;
        console.log(`[TaskCheckpoint] Completed task: ${taskId}`);
        
        return task;
    }

    /**
     * 任务失败
     */
    failTask(taskId, error) {
        const task = this.activeTasks.get(taskId);
        if (!task) return null;
        
        task.state = TaskState.FAILED;
        task.failedAt = Date.now();
        task.error = error;
        task.updatedAt = Date.now();
        
        // 保存最终检查点
        this._saveCheckpoint(taskId);
        
        this.stats.failed++;
        console.log(`[TaskCheckpoint] Failed task: ${taskId} (${error})`);
        
        return task;
    }

    /**
     * 获取任务状态
     */
    getTask(taskId) {
        return this.activeTasks.get(taskId) || this.checkpoints.get(taskId);
    }

    /**
     * 列出所有任务
     */
    listTasks(filter = {}) {
        const allTasks = [...this.activeTasks.values(), ...this.checkpoints.values()];
        
        if (filter.state) {
            return allTasks.filter(t => t.state === filter.state);
        }
        
        return allTasks;
    }

    /**
     * 删除任务
     */
    deleteTask(taskId) {
        this.activeTasks.delete(taskId);
        this.checkpoints.delete(taskId);
        
        // 删除持久化文件
        const filePath = join(this.config.checkpointDir, `${taskId}.json`);
        try {
            if (existsSync(filePath)) {
                unlinkSync(filePath);  // 实际删除文件
            }
        } catch (e) {
            console.error(`[TaskCheckpoint] Failed to delete file:`, e.message);
        }
        
        console.log(`[TaskCheckpoint] Deleted task: ${taskId}`);
    }

    /**
     * 内部方法: 保存检查点（内存 + 持久化）
     */
    _saveCheckpoint(taskId) {
        const task = this.activeTasks.get(taskId);
        if (!task) return;
        
        // 限制检查点数量
        if (this.checkpoints.size >= this.config.maxCheckpoints) {
            // 删除最老的检查点
            const oldest = this.checkpoints.keys().next().value;
            if (oldest) this.checkpoints.delete(oldest);
        }
        
        // 深度复制保存到内存
        const checkpoint = JSON.parse(JSON.stringify(task));
        this.checkpoints.set(taskId, checkpoint);
        
        // 持久化到文件系统
        this._persistCheckpoint(checkpoint);
    }

    /**
     * 内部方法: 持久化保存
     */
    _persistCheckpoint(task) {
        const filePath = join(this.config.checkpointDir, `${task.id}.json`);
        try {
            writeFileSync(filePath, JSON.stringify(task, null, 2), 'utf8');
        } catch (e) {
            console.error(`[TaskCheckpoint] Failed to persist:`, e.message);
        }
    }

    /**
     * 内部方法: 加载检查点
     */
    async _loadCheckpoints() {
        try {
            const files = readdirSync(this.config.checkpointDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = join(this.config.checkpointDir, file);
                    try {
                        const content = readFileSync(filePath, 'utf8');
                        const task = JSON.parse(content);
                        this.checkpoints.set(task.id, task);
                    } catch (e) {
                        console.warn(`[TaskCheckpoint] Failed to load ${file}:`, e.message);
                    }
                }
            }
        } catch (e) {
            // 目录不存在或为空，忽略
        }
    }

    /**
     * 获取统计
     */
    getStats() {
        return {
            active: this.activeTasks.size,
            checkpoints: this.checkpoints.size,
            ...this.stats
        };
    }
}

export function getTaskCheckpoint(kernel) {
    return new TaskCheckpoint(kernel);
}