// hundunos/extension-modules/task-visualizer/index.js — Task Visualization System
// 功能: 任务执行可视化，跟踪和展示任务执行状态
// 状态: 新增

import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const TaskStatus = {
    PENDING: 'pending',
    RUNNING: 'running',
    WAITING: 'waiting',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
};

export const TaskType = {
    SEQUENTIAL: 'sequential',
    PARALLEL: 'parallel',
    CONDITIONAL: 'conditional',
    DAG: 'dag'
};

export class TaskVisualizer {
    constructor(kernel) {
        this.kernel = kernel;
        this.tasks = new Map();
        this.taskGraph = {
            nodes: [],
            edges: []
        };
        
        this.config = {
            dataDir: join(__dirname, '..', '..', 'data', 'task-visualizer'),
            maxHistory: 1000,
            autoCleanup: true,
            cleanupInterval: 3600000  // 1小时
        };
        
        this.stats = {
            totalTasks: 0,
            completedTasks: 0,
            failedTasks: 0,
            avgDuration: 0
        };
        
        this._startCleanupTimer();
    }

    async initialize() {
        mkdirSync(this.config.dataDir, { recursive: true });
        await this._loadState();
        // review: removed // review: removed console.log('[TaskVisualizer] Initialized');
    }

    /**
     * 创建任务
     */
    createTask(config) {
        const taskId = config.id || `task_${randomUUID()}`;
        
        const task = {
            id: taskId,
            name: config.name || 'Untitled Task',
            type: config.type || TaskType.SEQUENTIAL,
            
            // 状态
            status: TaskStatus.PENDING,
            
            // 时间
            createdAt: Date.now(),
            startedAt: null,
            completedAt: null,
            duration: null,
            
            // 执行信息
            progress: 0,
            currentStep: 0,
            totalSteps: config.steps?.length || 0,
            steps: config.steps || [],
            result: null,
            error: null,
            
            // 依赖
            dependsOn: config.dependsOn || [],
            dependents: [],
            
            // 可视化数据
            position: config.position || { x: 0, y: 0 },
            style: config.style || {},
            
            // 元数据
            metadata: config.metadata || {},
            tags: config.tags || []
        };
        
        this.tasks.set(taskId, task);
        this._updateGraph();
        
        this.stats.totalTasks++;
        
        return taskId;
    }

    /**
     * 开始任务
     */
    startTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) return null;
        
        task.status = TaskStatus.RUNNING;
        task.startedAt = Date.now();
        
        this._updateGraph();
        
        return task;
    }

    /**
     * 更新任务进度
     */
    updateProgress(taskId, progress, stepName = null) {
        const task = this.tasks.get(taskId);
        if (!task) return null;
        
        task.progress = Math.min(100, Math.max(0, progress));
        
        if (stepName) {
            task.currentStep = task.steps.findIndex(s => s.name === stepName);
        }
        
        this._updateGraph();
        
        return task;
    }

    /**
     * 完成任务
     */
    completeTask(taskId, result = null) {
        const task = this.tasks.get(taskId);
        if (!task) return null;
        
        task.status = TaskStatus.COMPLETED;
        task.completedAt = Date.now();
        task.duration = task.completedAt - task.startedAt;
        task.progress = 100;
        task.result = result;
        
        this._updateGraph();
        
        this.stats.completedTasks++;
        this._updateAvgDuration(task.duration);
        
        return task;
    }

    /**
     * 任务失败
     */
    failTask(taskId, error) {
        const task = this.tasks.get(taskId);
        if (!task) return null;
        
        task.status = TaskStatus.FAILED;
        task.completedAt = Date.now();
        task.duration = task.completedAt - task.startedAt;
        task.error = error;
        
        this._updateGraph();
        
        this.stats.failedTasks++;
        
        return task;
    }

    /**
     * 取消任务
     */
    cancelTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) return null;
        
        task.status = TaskStatus.CANCELLED;
        task.completedAt = Date.now();
        
        this._updateGraph();
        
        return task;
    }

    /**
     * 获取任务状态
     */
    getTask(taskId) {
        return this.tasks.get(taskId);
    }

    /**
     * 获取所有任务
     */
    getAllTasks(filter = {}) {
        let tasks = Array.from(this.tasks.values());
        
        if (filter.status) {
            tasks = tasks.filter(t => t.status === filter.status);
        }
        if (filter.type) {
            tasks = tasks.filter(t => t.type === filter.type);
        }
        if (filter.tags) {
            tasks = tasks.filter(t => 
                filter.tags.some(tag => t.tags.includes(tag))
            );
        }
        
        return tasks;
    }

    /**
     * 获取 DAG 可视化数据
     */
    getDAGData() {
        return {
            nodes: this.taskGraph.nodes,
            edges: this.taskGraph.edges,
            layout: this._calculateLayout()
        };
    }

    /**
     * 获取时间线数据
     */
    getTimelineData(range = 'day') {
        const now = Date.now();
        const ranges = {
            hour: 3600000,
            day: 86400000,
            week: 604800000,
            month: 2592000000
        };
        
        const startTime = now - ranges[range];
        
        const tasks = Array.from(this.tasks.values())
            .filter(t => t.createdAt >= startTime)
            .sort((a, b) => a.createdAt - b.createdAt);
        
        return {
            tasks,
            summary: {
                total: tasks.length,
                completed: tasks.filter(t => t.status === TaskStatus.COMPLETED).length,
                failed: tasks.filter(t => t.status === TaskStatus.FAILED).length,
                avgDuration: this.stats.avgDuration
            }
        };
    }

    /**
     * 获取甘特图数据
     */
    getGanttData(filter = {}) {
        const tasks = this.getAllTasks(filter);
        const now = Date.now();
        
        return tasks.map(task => ({
            id: task.id,
            name: task.name,
            start: task.startedAt || task.createdAt,
            end: task.completedAt || now,
            duration: task.duration,
            progress: task.progress,
            status: task.status,
            type: task.type
        }));
    }

    /**
     * 获取统计
     */
    getStats() {
        return {
            ...this.stats,
            activeTasks: Array.from(this.tasks.values())
                .filter(t => t.status === TaskStatus.RUNNING).length,
            pendingTasks: Array.from(this.tasks.values())
                .filter(t => t.status === TaskStatus.PENDING).length,
            successRate: this.stats.totalTasks > 0
                ? ((this.stats.completedTasks / this.stats.totalTasks) * 100).toFixed(1) + '%'
                : '0%'
        };
    }

    /**
     * 获取导出数据
     */
    exportData(format = 'json') {
        const data = {
            exportTime: Date.now(),
            tasks: Array.from(this.tasks.values()),
            stats: this.getStats(),
            graph: this.taskGraph
        };
        
        if (format === 'json') {
            return JSON.stringify(data, null, 2);
        }
        
        if (format === 'csv') {
            const headers = ['id', 'name', 'status', 'createdAt', 'duration', 'progress'];
            const rows = data.tasks.map(t => 
                headers.map(h => t[h] || '').join(',')
            );
            return [headers.join(','), ...rows].join('\n');
        }
        
        return data;
    }

    /**
     * 内部方法: 更新图结构
     */
    _updateGraph() {
        this.taskGraph.nodes = Array.from(this.tasks.values()).map(task => ({
            id: task.id,
            label: task.name,
            status: task.status,
            progress: task.progress,
            type: task.type,
            x: task.position.x,
            y: task.position.y
        }));
        
        this.taskGraph.edges = [];
        for (const task of this.tasks.values()) {
            for (const depId of task.dependsOn) {
                this.taskGraph.edges.push({
                    from: depId,
                    to: task.id
                });
            }
        }
    }

    /**
     * 内部方法: 计算布局
     */
    _calculateLayout() {
        const nodes = [...this.taskGraph.nodes];
        const levels = new Map();
        const visited = new Set();
        
        // 简单的层级布局算法
        const getLevel = (nodeId) => {
            if (visited.has(nodeId)) {
                return levels.get(nodeId) || 0;
            }
            visited.add(nodeId);
            
            const task = this.tasks.get(nodeId);
            if (!task || task.dependsOn.length === 0) {
                levels.set(nodeId, 0);
                return 0;
            }
            
            const maxDepLevel = Math.max(
                ...task.dependsOn.map(depId => getLevel(depId))
            );
            const level = maxDepLevel + 1;
            levels.set(nodeId, level);
            return level;
        };
        
        for (const node of nodes) {
            getLevel(node.id);
        }
        
        // 按层级分组
        const byLevel = new Map();
        for (const [nodeId, level] of levels) {
            if (!byLevel.has(level)) {
                byLevel.set(level, []);
            }
            byLevel.get(level).push(nodeId);
        }
        
        // 计算位置
        const layout = new Map();
        const nodeSpacing = 150;
        const levelSpacing = 100;
        
        for (const [level, nodeIds] of byLevel) {
            const count = nodeIds.length;
            const startX = -(count - 1) * nodeSpacing / 2;
            
            nodeIds.forEach((nodeId, index) => {
                layout.set(nodeId, {
                    x: startX + index * nodeSpacing,
                    y: level * levelSpacing
                });
            });
        }
        
        return layout;
    }

    /**
     * 内部方法: 更新平均时长
     */
    _updateAvgDuration(duration) {
        const total = this.stats.avgDuration * this.stats.completedTasks;
        this.stats.avgDuration = (total + duration) / this.stats.completedTasks;
    }

    /**
     * 内部方法: 启动清理定时器
     */
    _startCleanupTimer() {
        setInterval(() => {
            if (this.config.autoCleanup) {
                this._cleanup();
            }
        }, this.config.cleanupInterval);
    }

    /**
     * 内部方法: 清理过期任务
     */
    _cleanup() {
        const now = Date.now();
        const maxAge = 7 * 24 * 60 * 60 * 1000;  // 7天
        
        for (const [taskId, task] of this.tasks) {
            if (task.completedAt && (now - task.completedAt) > maxAge) {
                this.tasks.delete(taskId);
            }
        }
        
        // 限制总数量
        if (this.tasks.size > this.config.maxHistory) {
            const tasks = Array.from(this.tasks.values())
                .sort((a, b) => a.createdAt - b.createdAt);
            
            const toRemove = tasks.slice(0, this.tasks.size - this.config.maxHistory);
            for (const task of toRemove) {
                this.tasks.delete(task.id);
            }
        }
        
        this._saveState();
    }

    /**
     * 持久化
     */
    async _saveState() {
        const stateFile = join(this.config.dataDir, 'state.json');
        const state = {
            tasks: Array.from(this.tasks.entries()),
            stats: this.stats
        };
        writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
    }

    async _loadState() {
        const stateFile = join(this.config.dataDir, 'state.json');
        if (existsSync(stateFile)) {
            try {
                const state = JSON.parse(readFileSync(stateFile, 'utf8'));
                this.tasks = new Map(state.tasks);
                this.stats = { ...this.stats, ...state.stats };
            } catch (e) {
                console.warn('[TaskVisualizer] Failed to load state');
            }
        }
    }
}

export function getTaskVisualizer(kernel) {
    return new TaskVisualizer(kernel);
}