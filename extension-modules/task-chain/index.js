// hundunos/extension-modules/task-chain/index.js — Task Dependency Chain System
// 功能: 任务依赖链，支持串行/并行/条件执行
// 状态: 新增

import { randomUUID } from 'crypto';

export const TaskType = {
    SEQUENTIAL: 'sequential',    // 串行: A -> B -> C
    PARALLEL: 'parallel',        // 并行: A || B || C
    CONDITIONAL: 'conditional',  // 条件: if A then B else C
    DAG: 'dag'                    // DAG: 依赖图
};

export const TaskStatus = {
    PENDING: 'pending',
    RUNNING: 'running',
    WAITING: 'waiting',
    COMPLETED: 'completed',
    FAILED: 'failed',
    SKIPPED: 'skipped'
};

export class TaskChain {
    constructor(kernel) {
        this.kernel = kernel;
        this.chains = new Map();
        this.runningTasks = new Map();
        
        this.stats = {
            chainsCreated: 0,
            tasksExecuted: 0,
            tasksSkipped: 0,
            failures: 0
        };
    }

    async initialize() {
        console.log('[TaskChain] Initialized');
    }

    /**
     * 创建任务链
     */
    createChain(config) {
        const chainId = config.id || `chain_${randomUUID()}`;
        
        const chain = {
            id: chainId,
            name: config.name || 'Unnamed Chain',
            type: config.type || TaskType.SEQUENTIAL,
            tasks: [],
            config: {
                stopOnFailure: config.stopOnFailure !== false,
                continueOnSkip: config.continueOnSkip || false,
                timeout: config.timeout || 300000
            },
            createdAt: Date.now(),
            status: TaskStatus.PENDING,
            results: []
        };
        
        // 添加任务
        if (config.tasks && Array.isArray(config.tasks)) {
            for (const task of config.tasks) {
                chain.tasks.push(this._createTask(task));
            }
        }
        
        this.chains.set(chainId, chain);
        this.stats.chainsCreated++;
        
        console.log(`[TaskChain] Created chain: ${chainId} (${chain.name})`);
        return chainId;
    }

    /**
     * 创建单个任务
     */
    _createTask(taskConfig) {
        return {
            id: taskConfig.id || `task_${randomUUID()}`,
            name: taskConfig.name || 'Unnamed Task',
            action: taskConfig.action,
            params: taskConfig.params || {},
            dependsOn: taskConfig.dependsOn || [],  // 依赖的任务ID
            condition: taskConfig.condition,        // 条件执行
            retry: taskConfig.retry || 0,
            timeout: taskConfig.timeout || 60000,
            status: TaskStatus.PENDING,
            result: null,
            error: null
        };
    }

    /**
     * 执行任务链
     */
    async execute(chainId, context = {}) {
        const chain = this.chains.get(chainId);
        if (!chain) {
            return { success: false, error: `Chain ${chainId} not found` };
        }
        
        chain.status = TaskStatus.RUNNING;
        chain.results = [];
        
        console.log(`[TaskChain] Executing chain: ${chainId}`);
        
        try {
            const results = await this._executeChain(chain, context);
            
            chain.status = TaskStatus.COMPLETED;
            chain.completedAt = Date.now();
            
            return {
                success: true,
                chainId,
                results,
                duration: chain.completedAt - chain.createdAt
            };
        } catch (e) {
            chain.status = TaskStatus.FAILED;
            chain.error = e.message;
            this.stats.failures++;
            
            return {
                success: false,
                chainId,
                error: e.message
            };
        }
    }

    /**
     * 执行链的核心逻辑
     */
    async _executeChain(chain, context) {
        const results = [];
        
        if (chain.type === TaskType.PARALLEL) {
            // 并行执行
            const promises = chain.tasks.map(task => this._executeTask(task, context));
            const taskResults = await Promise.allSettled(promises);
            
            for (let i = 0; i < chain.tasks.length; i++) {
                results.push({
                    taskId: chain.tasks[i].id,
                    ...taskResults[i]
                });
            }
        } else if (chain.type === TaskType.CONDITIONAL) {
            // 条件执行: 找到第一个满足条件的任务执行
            for (const task of chain.tasks) {
                if (this._checkCondition(task.condition, context, results)) {
                    const result = await this._executeTask(task, context);
                    results.push({ taskId: task.id, ...result });
                    break;
                } else {
                    task.status = TaskStatus.SKIPPED;
                    this.stats.tasksSkipped++;
                }
            }
        } else {
            // 串行或DAG执行
            const completed = new Map();
            
            for (const task of chain.tasks) {
                // 检查依赖是否满足
                if (!this._checkDependencies(task, completed)) {
                    task.status = TaskStatus.SKIPPED;
                    this.stats.tasksSkipped++;
                    continue;
                }
                
                // 执行任务
                const result = await this._executeTask(task, { ...context, ...this._buildContext(completed) });
                
                results.push({ taskId: task.id, ...result });
                completed.set(task.id, result);
                
                // 失败时停止
                if (!result.success && chain.config.stopOnFailure) {
                    break;
                }
            }
        }
        
        return results;
    }

    /**
     * 执行单个任务
     */
    async _executeTask(task, context) {
        task.status = TaskStatus.RUNNING;
        const startTime = Date.now();
        
        console.log(`[TaskChain] Executing task: ${task.id} (${task.name})`);
        
        let attempt = 0;
        let lastError = null;
        
        while (attempt <= task.retry) {
            try {
                // 模拟任务执行 (实际应该调用 kernel.process)
                const result = await this._runTaskAction(task, context);
                
                task.status = TaskStatus.COMPLETED;
                task.result = result;
                this.stats.tasksExecuted++;
                
                return {
                    success: true,
                    result,
                    duration: Date.now() - startTime,
                    attempts: attempt + 1
                };
            } catch (e) {
                lastError = e;
                attempt++;
                
                if (attempt <= task.retry) {
                    console.log(`[TaskChain] Retrying task ${task.id} (${attempt}/${task.retry})`);
                    await this._sleep(1000 * attempt);  // 指数退避
                }
            }
        }
        
        task.status = TaskStatus.FAILED;
        task.error = lastError?.message || 'Unknown error';
        this.stats.failures++;
        
        return {
            success: false,
            error: task.error,
            duration: Date.now() - startTime,
            attempts: attempt
        };
    }

    /**
     * 运行任务动作
     */
    async _runTaskAction(task, context) {
        // 这里可以调用内核处理
        // 简化实现：直接返回成功
        if (this.kernel?.process) {
            return await this.kernel.process({
                content: task.action,
                ...context,
                ...task.params
            });
        }
        
        return { success: true, message: 'Task completed' };
    }

    /**
     * 检查任务条件
     */
    _checkCondition(condition, context, results) {
        if (!condition) return true;
        
        // 简单的条件解析
        if (condition.startsWith('$')) {
            // 引用之前的任务结果
            const ref = condition.slice(1);
            const prevResult = results.find(r => r.taskId === ref);
            return prevResult?.success;
        }
        
        // 默认返回true
        return true;
    }

    /**
     * 检查依赖是否满足
     */
    _checkDependencies(task, completed) {
        if (!task.dependsOn || task.dependsOn.length === 0) return true;
        
        return task.dependsOn.every(depId => completed.has(depId));
    }

    /**
     * 构建上下文
     */
    _buildContext(completed) {
        const ctx = {};
        for (const [taskId, result] of completed) {
            ctx[`task_${taskId}`] = result;
        }
        return ctx;
    }

    /**
     * 睡眠
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 获取链状态
     */
    getChain(chainId) {
        return this.chains.get(chainId);
    }

    /**
     * 列出所有链
     */
    listChains() {
        return Array.from(this.chains.values()).map(c => ({
            id: c.id,
            name: c.name,
            type: c.type,
            status: c.status,
            taskCount: c.tasks.length
        }));
    }

    /**
     * 获取统计
     */
    getStats() {
        return {
            ...this.stats,
            activeChains: this.chains.size,
            runningTasks: this.runningTasks.size
        };
    }
}

export function getTaskChain(kernel) {
    return new TaskChain(kernel);
}