/**
 * kernel/conditional-task-graph.js
 * 条件任务图系统
 * 
 * 基于 TradingAgents-CN 的优化方案，增强任务图功能：
 * 1. 条件依赖：根据条件决定是否激活依赖关系
 * 2. 权重优先级：带权重的任务优先级
 * 3. 动态依赖：运行时动态添加/移除依赖
 * 4. 子图支持：嵌套子图结构
 */

import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'fs';
import { ConditionalDirectedGraph, ConditionalNode, ConditionalEdge, EdgeType } from './pipeline/graph/conditional-directed-graph.js';

/**
 * 任务状态
 */
export const TaskStatus = {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed',
    BLOCKED: 'blocked',
    CANCELLED: 'cancelled',
};

/**
 * 任务优先级
 */
export const TaskPriority = {
    LOW: 0,
    NORMAL: 1,
    HIGH: 2,
    CRITICAL: 3,
};

/**
 * 条件任务图
 */
export class ConditionalTaskGraph {
    /**
     * 构造函数
     * @param {Object} kernel - 内核实例
     * @param {Object} options - 配置选项
     */
    constructor(kernel, options = {}) {
        this.kernel = kernel;
        this.tasksDir = join(kernel?.config?.storageDir || '.hundunos', 'conditional-tasks');
        mkdirSync(this.tasksDir, { recursive: true });
        
        this.graph = new ConditionalDirectedGraph({
            maxHistorySize: options.maxHistorySize || 1000,
            enableStatistics: options.enableStatistics !== false,
        });
        
        this.nextId = this._maxId() + 1;
        this.loadTasks();
    }

    /**
     * 获取最大任务 ID
     * @returns {number} 最大ID
     * @private
     */
    _maxId() {
        const files = [];
        try {
            const allFiles = readdirSync(this.tasksDir);
            for (const f of allFiles) {
                files.push(f);
            }
        } catch (e) {
            return 0;
        }

        const ids = files
            .filter(f => f.startsWith('task_') && f.endsWith('.json'))
            .map(f => {
                const parts = f.split('_');
                const idStr = parts[1]?.split('.')[0] || '';
                return parseInt(idStr) || 0;
            });
        
        return Math.max(...ids, 0);
    }

    /**
     * 加载任务
     * @param {number} taskId - 任务ID
     * @returns {Object|null} 任务对象
     * @private
     */
    _load(taskId) {
        const path = join(this.tasksDir, `task_${taskId}.json`);
        if (!existsSync(path)) {
            return null;
        }
        try {
            return JSON.parse(readFileSync(path, 'utf8'));
        } catch (e) {
            console.error(`[ConditionalTaskGraph] Failed to load task ${taskId}:`, e.message);
            return null;
        }
    }

    /**
     * 保存任务
     * @param {Object} task - 任务对象
     * @private
     */
    _save(task) {
        const path = join(this.tasksDir, `task_${task.id}.json`);
        writeFileSync(path, JSON.stringify(task, null, 2), 'utf8');
    }

    /**
     * 从存储加载所有任务到图中
     */
    loadTasks() {
        try {
            const allFiles = readdirSync(this.tasksDir);
            const taskFiles = allFiles.filter(f => f.startsWith('task_') && f.endsWith('.json'));
            
            for (const file of taskFiles) {
                const taskId = parseInt(file.split('_')[1].split('.')[0]);
                const taskData = this._load(taskId);
                
                if (taskData) {
                    // 创建条件节点
                    const node = this.graph.addConditionalNode(
                        `task_${taskId}`,
                        taskData,
                        {
                            enabled: taskData.status !== TaskStatus.CANCELLED,
                            priority: taskData.priority || TaskPriority.NORMAL,
                            metadata: {
                                ...taskData.metadata,
                                originalId: taskId,
                            },
                        }
                    );
                    
                    // 恢复执行统计
                    if (taskData.executionStats) {
                        node.executionCount = taskData.executionStats.count || 0;
                        node.lastExecutedAt = taskData.executionStats.lastExecutedAt || null;
                        node.executionTime = taskData.executionStats.totalTime || 0;
                    }
                }
            }
            
            // 加载依赖关系
            this._loadDependencies();
            
            console.log(`[ConditionalTaskGraph] Loaded ${this.graph.nodes.size} tasks`);
        } catch (error) {
            console.warn('[ConditionalTaskGraph] Failed to load tasks:', error.message);
        }
    }

    /**
     * 加载依赖关系
     * @private
     */
    _loadDependencies() {
        try {
            const allFiles = readdirSync(this.tasksDir);
            const taskFiles = allFiles.filter(f => f.startsWith('task_') && f.endsWith('.json'));
            
            for (const file of taskFiles) {
                const taskId = parseInt(file.split('_')[1].split('.')[0]);
                const taskData = this._load(taskId);
                
                if (taskData && taskData.dependencies) {
                    const fromId = `task_${taskId}`;
                    
                    for (const dep of taskData.dependencies) {
                        const toId = `task_${dep.taskId}`;
                        
                        // 添加条件边
                        this.graph.addConditionalEdge(fromId, toId, {
                            type: dep.type || EdgeType.ALWAYS,
                            condition: this._createConditionFunction(dep.condition),
                            weight: dep.weight || 1.0,
                            metadata: dep.metadata || {},
                            enabled: dep.enabled !== false,
                        });
                    }
                }
            }
        } catch (error) {
            console.warn('[ConditionalTaskGraph] Failed to load dependencies:', error.message);
        }
    }

    /**
     * 创建条件函数
     * @param {string|Function|Object} condition - 条件定义
     * @returns {Function} 条件函数
     * @private
     */
    _createConditionFunction(condition) {
        if (!condition) {
            return () => true;
        }
        
        if (typeof condition === 'function') {
            return condition;
        }
        
        if (typeof condition === 'string') {
            // 尝试解析字符串条件
            try {
                // 简单的条件表达式解析
                return (context) => {
                    try {
                        // 替换变量
                        let expr = condition;
                        for (const [key, value] of Object.entries(context)) {
                            expr = expr.replace(new RegExp(`\\$${key}`, 'g'), JSON.stringify(value));
                        }
                        
                        // 安全评估
                        return eval(`(${expr})`);
                    } catch (error) {
                        console.warn(`[ConditionalTaskGraph] Failed to evaluate condition: ${condition}`, error);
                        return false;
                    }
                };
            } catch (error) {
                console.warn(`[ConditionalTaskGraph] Failed to parse condition: ${condition}`, error);
                return () => false;
            }
        }
        
        if (typeof condition === 'object') {
            // 对象条件
            return (context) => {
                try {
                    // 检查所有条件
                    for (const [key, expected] of Object.entries(condition)) {
                        const actual = context[key];
                        
                        if (Array.isArray(expected)) {
                            // 数组条件：值必须在数组中
                            if (!expected.includes(actual)) {
                                return false;
                            }
                        } else if (typeof expected === 'object' && expected !== null) {
                            // 对象条件：支持比较操作符
                            if (expected.$eq !== undefined && actual !== expected.$eq) return false;
                            if (expected.$ne !== undefined && actual === expected.$ne) return false;
                            if (expected.$gt !== undefined && actual <= expected.$gt) return false;
                            if (expected.$lt !== undefined && actual >= expected.$lt) return false;
                            if (expected.$gte !== undefined && actual < expected.$gte) return false;
                            if (expected.$lte !== undefined && actual > expected.$lte) return false;
                            if (expected.$in !== undefined && !expected.$in.includes(actual)) return false;
                            if (expected.$nin !== undefined && expected.$nin.includes(actual)) return false;
                            if (expected.$regex !== undefined && !new RegExp(expected.$regex).test(actual)) return false;
                        } else {
                            // 简单相等条件
                            if (actual !== expected) {
                                return false;
                            }
                        }
                    }
                    return true;
                } catch (error) {
                    console.warn('[ConditionalTaskGraph] Failed to evaluate object condition:', error);
                    return false;
                }
            };
        }
        
        return () => true;
    }

    /**
     * 创建任务
     * @param {string} subject - 任务主题
     * @param {string} description - 任务描述
     * @param {Object} options - 配置选项
     * @returns {Object} 创建的任务
     */
    async create(subject, description = '', options = {}) {
        const taskId = this.nextId;
        const nodeId = `task_${taskId}`;
        
        const task = {
            id: taskId,
            subject,
            description,
            status: TaskStatus.PENDING,
            priority: options.priority || TaskPriority.NORMAL,
            dependencies: options.dependencies || [],
            metadata: options.metadata || {},
            conditions: options.conditions || {},
            executionStats: {
                count: 0,
                lastExecutedAt: null,
                totalTime: 0,
                successCount: 0,
                failureCount: 0,
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        // 保存到文件
        this._save(task);
        this.nextId++;

        // 添加到图
        const node = this.graph.addConditionalNode(nodeId, task, {
            enabled: true,
            priority: task.priority,
            metadata: task.metadata,
            conditions: {
                precondition: this._createConditionFunction(task.conditions.precondition),
                execute: options.execute || null,
                postcondition: this._createConditionFunction(task.conditions.postcondition),
            },
        });

        // 添加依赖关系
        for (const dep of task.dependencies) {
            const depNodeId = `task_${dep.taskId}`;
            
            // 确保依赖任务存在
            if (!this.graph.getNode(depNodeId)) {
                const depTask = this._load(dep.taskId);
                if (depTask) {
                    this.graph.addConditionalNode(depNodeId, depTask, {
                        enabled: depTask.status !== TaskStatus.CANCELLED,
                        priority: depTask.priority || TaskPriority.NORMAL,
                        metadata: depTask.metadata,
                    });
                }
            }
            
            // 添加条件边
            this.graph.addConditionalEdge(nodeId, depNodeId, {
                type: dep.type || EdgeType.ALWAYS,
                condition: this._createConditionFunction(dep.condition),
                weight: dep.weight || 1.0,
                metadata: dep.metadata || {},
                enabled: dep.enabled !== false,
            });
        }

        return task;
    }

    /**
     * 获取任务
     * @param {number} taskId - 任务ID
     * @returns {Object|null} 任务对象
     */
    async get(taskId) {
        return this._load(taskId);
    }

    /**
     * 获取任务节点
     * @param {number} taskId - 任务ID
     * @returns {ConditionalNode|null} 任务节点
     */
    getTaskNode(taskId) {
        return this.graph.getNode(`task_${taskId}`);
    }

    /**
     * 更新任务
     * @param {number} taskId - 任务ID
     * @param {Object} updates - 更新内容
     * @returns {Object} 更新后的任务
     */
    async update(taskId, updates = {}) {
        const task = await this.get(taskId);
        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }

        const nodeId = `task_${taskId}`;
        const node = this.graph.getNode(nodeId);
        
        // 更新任务数据
        if (updates.status !== undefined) {
            if (!Object.values(TaskStatus).includes(updates.status)) {
                throw new Error(`Invalid status: ${updates.status}`);
            }
            task.status = updates.status;
            
            // 更新节点启用状态
            if (node) {
                node.enabled = updates.status !== TaskStatus.CANCELLED;
            }
        }
        
        if (updates.priority !== undefined) {
            task.priority = updates.priority;
            if (node) {
                node.priority = updates.priority;
            }
        }
        
        if (updates.metadata !== undefined) {
            task.metadata = { ...task.metadata, ...updates.metadata };
            if (node) {
                node.metadata = { ...node.metadata, ...updates.metadata };
            }
        }
        
        if (updates.conditions !== undefined) {
            task.conditions = { ...task.conditions, ...updates.conditions };
            if (node) {
                node.conditions = {
                    precondition: this._createConditionFunction(task.conditions.precondition),
                    postcondition: this._createConditionFunction(task.conditions.postcondition),
                };
            }
        }
        
        if (updates.dependencies !== undefined) {
            // 移除旧的依赖边
            const oldDeps = task.dependencies || [];
            for (const dep of oldDeps) {
                this.graph.removeConditionalEdge(nodeId, `task_${dep.taskId}`);
            }
            
            // 添加新的依赖
            task.dependencies = updates.dependencies;
            for (const dep of task.dependencies) {
                const depNodeId = `task_${dep.taskId}`;
                
                // 确保依赖任务存在
                if (!this.graph.getNode(depNodeId)) {
                    const depTask = this._load(dep.taskId);
                    if (depTask) {
                        this.graph.addConditionalNode(depNodeId, depTask, {
                            enabled: depTask.status !== TaskStatus.CANCELLED,
                            priority: depTask.priority || TaskPriority.NORMAL,
                            metadata: depTask.metadata,
                        });
                    }
                }
                
                // 添加条件边
                this.graph.addConditionalEdge(nodeId, depNodeId, {
                    type: dep.type || EdgeType.ALWAYS,
                    condition: this._createConditionFunction(dep.condition),
                    weight: dep.weight || 1.0,
                    metadata: dep.metadata || {},
                    enabled: dep.enabled !== false,
                });
            }
        }
        
        task.updatedAt = Date.now();
        this._save(task);
        
        return task;
    }

    /**
     * 执行任务
     * @param {number} taskId - 任务ID
     * @param {Object} context - 执行上下文
     * @returns {Promise<Object>} 执行结果
     */
    async execute(taskId, context = {}) {
        const nodeId = `task_${taskId}`;
        const node = this.graph.getNode(nodeId);
        
        if (!node) {
            throw new Error(`Task ${taskId} not found in graph`);
        }
        
        if (!(node instanceof ConditionalNode)) {
            throw new Error(`Task ${taskId} is not a conditional node`);
        }
        
        const task = await this.get(taskId);
        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }
        
        // 检查任务状态
        if (task.status === TaskStatus.COMPLETED) {
            return {
                success: true,
                message: `Task ${taskId} already completed`,
                result: task.result,
                stats: task.executionStats,
            };
        }
        
        if (task.status === TaskStatus.CANCELLED) {
            throw new Error(`Task ${taskId} is cancelled`);
        }
        
        // 更新任务状态
        task.status = TaskStatus.IN_PROGRESS;
        task.updatedAt = Date.now();
        this._save(task);
        
        try {
            // 执行任务
            const startTime = Date.now();
            const result = await node.execute(context);
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            // 更新任务状态和结果
            task.status = TaskStatus.COMPLETED;
            task.result = result;
            task.completedAt = endTime;
            task.executionStats.count++;
            task.executionStats.lastExecutedAt = endTime;
            task.executionStats.totalTime += duration;
            task.executionStats.successCount++;
            task.updatedAt = endTime;
            this._save(task);
            
            // 更新节点统计
            node.executionCount++;
            node.lastExecutedAt = endTime;
            node.executionTime += duration;
            
            return {
                success: true,
                result,
                duration,
                stats: task.executionStats,
            };
        } catch (error) {
            // 更新任务状态
            task.status = TaskStatus.FAILED;
            task.error = error.message;
            task.executionStats.count++;
            task.executionStats.failureCount++;
            task.updatedAt = Date.now();
            this._save(task);
            
            throw error;
        }
    }

    /**
     * 获取可执行的任务
     * @param {Object} context - 执行上下文
     * @returns {Array<Object>} 可执行的任务列表
     */
    async getExecutableTasks(context = {}) {
        const completedNodes = new Set();
        
        // 获取已完成的节点
        for (const [id, node] of this.graph.nodes.entries()) {
            const taskId = parseInt(id.replace('task_', ''));
            const task = await this.get(taskId);
            
            if (task && task.status === TaskStatus.COMPLETED) {
                completedNodes.add(id);
            }
        }
        
        // 获取可执行的节点
        const executableNodes = this.graph.getNextExecutableNodes(completedNodes, context);
        
        // 转换为任务对象
        const executableTasks = [];
        for (const { id, node, priority } of executableNodes) {
            const taskId = parseInt(id.replace('task_', ''));
            const task = await this.get(taskId);
            
            if (task) {
                executableTasks.push({
                    ...task,
                    node,
                    priority,
                });
            }
        }
        
        return executableTasks;
    }

    /**
     * 执行任务图
     * @param {Object} initialContext - 初始上下文
     * @param {Function} onTaskExecuted - 任务执行回调
     * @returns {Promise<Object>} 执行结果
     */
    async executeGraph(initialContext = {}, onTaskExecuted = null) {
        const context = { ...initialContext };
        const results = new Map();
        const errors = [];
        
        // 获取执行计划
        const executionPlan = await this.getExecutionPlan(context);
        
        for (const phase of executionPlan) {
            const phaseResults = await Promise.allSettled(
                phase.map(async (taskId) => {
                    try {
                        const result = await this.execute(taskId, context);
                        
                        // 更新上下文
                        context[`task_${taskId}_result`] = result.result;
                        context[`task_${taskId}_success`] = true;
                        
                        // 回调
                        if (onTaskExecuted) {
                            await onTaskExecuted(taskId, result, context);
                        }
                        
                        return { taskId, success: true, result };
                    } catch (error) {
                        console.error(`[ConditionalTaskGraph] Task ${taskId} execution failed:`, error);
                        
                        // 更新上下文
                        context[`task_${taskId}_error`] = error.message;
                        context[`task_${taskId}_success`] = false;
                        
                        errors.push({
                            taskId,
                            error: error.message,
                            timestamp: Date.now(),
                        });
                        
                        return { taskId, success: false, error };
                    }
                })
            );
            
            // 收集结果
            for (const result of phaseResults) {
                if (result.status === 'fulfilled') {
                    const { taskId, success, result: taskResult, error } = result.value;
                    results.set(taskId, { success, result: taskResult, error });
                } else {
                    errors.push({
                        taskId: 'unknown',
                        error: result.reason.message,
                        timestamp: Date.now(),
                    });
                }
            }
        }
        
        return {
            success: errors.length === 0,
            results: Object.fromEntries(results),
            errors,
            context,
            stats: this.graph.getStats(),
        };
    }

    /**
     * 获取执行计划（考虑条件依赖）
     * @param {Object} context - 执行上下文
     * @returns {Array<Array<number>>} 执行计划（按阶段分组）
     */
    async getExecutionPlan(context = {}) {
        // 获取激活的子图
        const activeSubgraph = this.graph.getActiveSubgraph(context);
        
        // 获取拓扑排序
        const sortedNodes = activeSubgraph.topologicalSort();
        
        // 按依赖关系分组
        const groups = activeSubgraph.getParallelGroups();
        
        // 转换为任务ID
        const plan = groups.map(group => 
            group.map(nodeId => parseInt(nodeId.replace('task_', '')))
        );
        
        return plan;
    }

    /**
     * 获取任务依赖路径
     * @param {number} startTaskId - 起始任务ID
     * @param {number} endTaskId - 结束任务ID
     * @param {Object} context - 评估上下文
     * @returns {Array<number>|null} 依赖路径
     */
    async getDependencyPath(startTaskId, endTaskId, context = {}) {
        const startNodeId = `task_${startTaskId}`;
        const endNodeId = `task_${endTaskId}`;
        
        const path = this.graph.getExecutionPath(startNodeId, endNodeId, context);
        
        if (!path) {
            return null;
        }
        
        return path.map(nodeId => parseInt(nodeId.replace('task_', '')));
    }

    /**
     * 获取任务统计信息
     * @returns {Object} 统计信息
     */
    async getStats() {
        const tasks = await this.listAll();
        const graphStats = this.graph.getStats();
        
        const statusCounts = {};
        for (const status of Object.values(TaskStatus)) {
            statusCounts[status] = 0;
        }
        
        let totalExecutionTime = 0;
        let totalExecutions = 0;
        
        for (const task of tasks) {
            statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
            
            if (task.executionStats) {
                totalExecutionTime += task.executionStats.totalTime || 0;
                totalExecutions += task.executionStats.count || 0;
            }
        }
        
        const avgExecutionTime = totalExecutions > 0 
            ? totalExecutionTime / totalExecutions 
            : 0;
        
        return {
            tasks: {
                total: tasks.length,
                byStatus: statusCounts,
                execution: {
                    totalExecutions,
                    totalExecutionTime,
                    avgExecutionTime: avgExecutionTime.toFixed(2),
                },
            },
            graph: graphStats,
            storage: {
                directory: this.tasksDir,
                fileCount: tasks.length,
            },
        };
    }

    /**
     * 列出所有任务
     * @returns {Array<Object>} 任务列表
     */
    async listAll() {
        const tasks = [];
        try {
            const allFiles = readdirSync(this.tasksDir);
            const sortedFiles = allFiles
                .filter(f => f.startsWith('task_') && f.endsWith('.json'))
                .sort();

            for (const file of sortedFiles) {
                const taskId = parseInt(file.split('_')[1].split('.')[0]);
                const task = this._load(taskId);
                if (task) {
                    tasks.push(task);
                }
            }
        } catch (e) {
            console.warn('[ConditionalTaskGraph] Failed to list tasks:', e.message);
        }

        return tasks;
    }

    /**
     * 删除任务
     * @param {number} taskId - 任务ID
     * @returns {boolean} 是否成功
     */
    async delete(taskId) {
        const nodeId = `task_${taskId}`;
        
        // 从图中移除节点
        this.graph.nodes.delete(nodeId);
        
        // 移除相关的边
        for (const [fromId, toEdges] of this.graph.conditionalEdges.entries()) {
            if (fromId === nodeId) {
                this.graph.conditionalEdges.delete(fromId);
            } else {
                toEdges.delete(nodeId);
                if (toEdges.size === 0) {
                    this.graph.conditionalEdges.delete(fromId);
                }
            }
        }
        
        // 删除文件
        const path = join(this.tasksDir, `task_${taskId}.json`);
        if (!existsSync(path)) {
            return false;
        }

        try {
            rmSync(path);
            return true;
        } catch (e) {
            console.warn(`[ConditionalTaskGraph] Failed to delete task ${taskId}:`, e.message);
            return false;
        }
    }

    /**
     * 清空所有任务
     */
    async clear() {
        try {
            const allFiles = readdirSync(this.tasksDir);
            const taskFiles = allFiles.filter(f => f.startsWith('task_') && f.endsWith('.json'));
            
            for (const file of taskFiles) {
                const path = join(this.tasksDir, file);
                rmSync(path);
            }
            
            // 清空图
            this.graph.nodes.clear();
            this.graph.conditionalEdges.clear();
            this.graph.clearHistory();
            
            this.nextId = 1;
        } catch (error) {
            console.warn('[ConditionalTaskGraph] Failed to clear tasks:', error.message);
        }
    }

    /**
     * 导出图数据
     * @returns {Object} 图数据
     */
    export() {
        return this.graph.toJSON();
    }

    /**
     * 导入图数据
     * @param {Object} data - 图数据
     */
    import(data) {
        this.graph = ConditionalDirectedGraph.fromJSON(data);
        
        // 保存任务到文件
        for (const [nodeId, nodeData] of Object.entries(data.nodes || {})) {
            if (nodeId.startsWith('task_')) {
                const taskId = parseInt(nodeId.replace('task_', ''));
                if (!isNaN(taskId)) {
                    this._save({
                        ...nodeData,
                        id: taskId,
                    });
                }
            }
        }
        
        // 更新下一个ID
        this.nextId = this._maxId() + 1;
    }
}

export default {
    ConditionalTaskGraph,
    TaskStatus,
    TaskPriority,
    EdgeType,
};