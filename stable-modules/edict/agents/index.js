/**
 * HundunOS v3.0 - 使官系统
 * 三省六部的 Agent 执行代理
 * 
 * 升级特性：
 * - Agent 类型定义与状态机状态对齐
 * - Agent 心跳与健康检查增强
 * - Agent 上下文注入能力（三级记忆）
 * - Agent 消息权限矩阵
 * - 任务分配/完成/失败/超时流程增强
 * - 状态机驱动的 Agent 状态转换
 */

import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Agent 类型定义（与状态机对齐）
// ============================================================================

export const AgentType = {
    // 三省使官
    TAIZI:      'taizi',      // 太子 - 旨意接收与分发
    ZHONGSHU:   'zhongshu',   // 中书省 - 规划与设计
    MENXIA:     'menxia',     // 门下省 - 审核与审批
    SHANGSHU:   'shangshu',   // 尚书省 - 调度与执行
    
    // 六部使官
    BINGBU:     'bingbu',     // 兵部 - 技术实现
    HUBU:       'hubu',       // 户部 - 数据处理
    LIBU:       'libu',       // 吏部 - 人事与资源
    LIBU_DOC:   'libu_doc',   // 礼部文 - 文档撰写
    GONGBU:     'gongbu',     // 工部 - 工程与系统
    XINGBU:     'xingbu',     // 刑部 - 审核与检查
    
    // 系统使官
    REPORTER:   'reporter',   // 奏报使 - 结果报告
    LOGGER:     'logger',     // 记档使 - 日志记录
    WATCHDOG:   'watchdog',   // 监察使 - 健康监控
    COORDINATOR: 'coordinator', // 协调使 - 跨模块协调
};

// ============================================================================
// Agent 状态（与状态机严格对齐）
// ============================================================================

export const AgentState = {
    IDLE:       'idle',       // 空闲 - 初始状态，可接收新任务
    PREPARING:  'preparing',  // 准备中 - 任务准备阶段
    WORKING:    'working',    // 工作 中 - 任务执行中
    WAITING:    'waiting',    // 等待中 - 等待外部资源
    REVIEWING:  'reviewing',  // 审核中 - 等待审核
    COMPLETED:  'completed',  // 完成 - 任务成功完成
    FAILED:     'failed',     // 失败 - 任务执行失败
    BLOCKED:    'blocked',    // 阻塞 - 任务被阻塞
    TIMEOUT:    'timeout',    // 超时 - 任务执行超时
    CANCELLED:  'cancelled',  // 已取消 - 任务被取消
};

// 状态转换映射
export const STATE_TRANSITIONS = {
    [AgentState.IDLE]:         [AgentState.PREPARING, AgentState.CANCELLED],
    [AgentState.PREPARING]:    [AgentState.WORKING, AgentState.WAITING, AgentState.FAILED, AgentState.CANCELLED],
    [AgentState.WORKING]:      [AgentState.REVIEWING, AgentState.WAITING, AgentState.COMPLETED, AgentState.FAILED, AgentState.TIMEOUT, AgentState.BLOCKED],
    [AgentState.WAITING]:      [AgentState.WORKING, AgentState.FAILED, AgentState.TIMEOUT, AgentState.CANCELLED],
    [AgentState.REVIEWING]:     [AgentState.COMPLETED, AgentState.WORKING, AgentState.FAILED],
    [AgentState.COMPLETED]:    [AgentState.IDLE],
    [AgentState.FAILED]:       [AgentState.IDLE, AgentState.PREPARING],
    [AgentState.BLOCKED]:      [AgentState.WORKING, AgentState.FAILED, AgentState.CANCELLED],
    [AgentState.TIMEOUT]:      [AgentState.IDLE, AgentState.PREPARING],
    [AgentState.CANCELLED]:    [AgentState.IDLE],
};

// 有效状态转换检查
export function canTransition(fromState, toState) {
    const allowed = STATE_TRANSITIONS[fromState];
    return allowed && allowed.includes(toState);
}

// ============================================================================
// 消息类型定义
// ============================================================================

export const MessageType = {
    ASSIGN:     'assign',     // 分配任务
    PREPARE:    'prepare',    // 准备任务
    EXECUTE:    'execute',    // 执行任务
    REPORT:     'report',      // 进度报告
    COMPLETE:   'complete',    // 任务完成
    FAIL:       'fail',        // 任务失败
    HEARTBEAT:  'heartbeat',   // 心跳
    QUERY:      'query',       // 状态查询
    RESPONSE:   'response',    // 响应
    REVIEW:     'review',      // 审核请求
    TIMEOUT:    'timeout',     // 超时
    CANCEL:     'cancel',      // 取消
    RESUME:     'resume',      // 恢复
};

// ============================================================================
// 消息权限矩阵
// ============================================================================

const MESSAGE_PERMISSIONS = {
    // 各状态允许接收的消息类型
    [AgentState.IDLE]:         [MessageType.ASSIGN, MessageType.QUERY, MessageType.HEARTBEAT],
    [AgentState.PREPARING]:    [MessageType.PREPARE, MessageType.REPORT, MessageType.CANCEL, MessageType.QUERY],
    [AgentState.WORKING]:      [MessageType.EXECUTE, MessageType.REPORT, MessageType.CANCEL, MessageType.QUERY, MessageType.TIMEOUT],
    [AgentState.WAITING]:      [MessageType.RESPONSE, MessageType.CANCEL, MessageType.QUERY, MessageType.RESUME],
    [AgentState.REVIEWING]:    [MessageType.REVIEW, MessageType.REPORT, MessageType.CANCEL, MessageType.QUERY],
    [AgentState.COMPLETED]:    [MessageType.ASSIGN, MessageType.QUERY, MessageType.HEARTBEAT],
    [AgentState.FAILED]:       [MessageType.ASSIGN, MessageType.QUERY, MessageType.HEARTBEAT],
    [AgentState.BLOCKED]:      [MessageType.RESUME, MessageType.CANCEL, MessageType.QUERY],
    [AgentState.TIMEOUT]:      [MessageType.ASSIGN, MessageType.QUERY, MessageType.HEARTBEAT],
    [AgentState.CANCELLED]:    [MessageType.ASSIGN, MessageType.QUERY, MessageType.HEARTBEAT],
};

export function canReceiveMessage(agentState, messageType) {
    const allowed = MESSAGE_PERMISSIONS[agentState];
    return allowed && allowed.includes(messageType);
}

// ============================================================================
// 三级记忆系统
// ============================================================================

export class AgentMemory {
    constructor() {
        this.shortTerm = [];    // 最近对话（5条）
        this.working = {};      // 当前任务工作区
        this.longTerm = {};     // 持久记忆（用户偏好等）
        this.maxShortTerm = 5;
    }

    /**
     * 添加短期记忆
     */
    addShortTerm(entry) {
        this.shortTerm.unshift({
            ...entry,
            timestamp: Date.now()
        });
        if (this.shortTerm.length > this.maxShortTerm) {
            this.shortTerm.pop();
        }
    }

    /**
     * 设置工作区数据
     */
    setWorking(key, value) {
        this.working[key] = value;
    }

    /**
     * 获取工作区数据
     */
    getWorking(key) {
        return this.working[key];
    }

    /**
     * 清空工作区
     */
    clearWorking() {
        this.working = {};
    }

    /**
     * 设置长期记忆
     */
    setLongTerm(key, value) {
        this.longTerm[key] = {
            value,
            updatedAt: Date.now()
        };
    }

    /**
     * 获取长期记忆
     */
    getLongTerm(key) {
        return this.longTerm[key]?.value;
    }

    /**
     * 获取上下文（注入到 Agent）
     */
    getContext() {
        return {
            shortTerm: this.shortTerm,
            working: { ...this.working },
            longTerm: { ...this.longTerm }
        };
    }

    /**
     * 序列化
     */
    toJSON() {
        return {
            shortTerm: this.shortTerm,
            working: this.working,
            longTerm: this.longTerm
        };
    }

    /**
     * 反序列化
     */
    static fromJSON(data) {
        const mem = new AgentMemory();
        if (data) {
            mem.shortTerm = data.shortTerm || [];
            mem.working = data.working || {};
            mem.longTerm = data.longTerm || {};
        }
        return mem;
    }
}

// ============================================================================
// Agent 基类（增强版）
// ============================================================================

export class Agent extends EventEmitter {
    constructor(config = {}) {
        super();
        
        // 基本属性
        this.id = config.id || `${config.type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        this.type = config.type || AgentType.BINGBU;
        this.name = config.name || this.type;
        this.description = config.description || '';
        
        // 状态管理
        this.state = AgentState.IDLE;
        this.previousState = null;
        
        // 任务管理
        this.task = null;
        this.taskHistory = [];
        this.maxHistory = config.maxHistory || 50;
        
        // 三级记忆
        this.memory = new AgentMemory();
        
        // 元数据
        this.metadata = config.metadata || {};
        this.tags = config.tags || [];
        
        // 健康检查配置
        this.lastHeartbeat = Date.now();
        this.createdAt = new Date().toISOString();
        this.heartbeatInterval = config.heartbeatInterval || 30000; // 30s
        this.maxIdleTime = config.maxIdleTime || 300000; // 5min
        this.maxTaskTime = config.maxTaskTime || 600000; // 10min
        
        // 超时计时器
        this._taskTimer = null;
        this._heartbeatTimer = null;
        
        // 统计
        this.stats = {
            tasksCompleted: 0,
            tasksFailed: 0,
            totalTaskTime: 0,
            avgTaskTime: 0,
        };
        
        // 启动心跳
        this._startHeartbeat();
    }

    // ========================================================================
    // 状态转换（状态机驱动）
    // ========================================================================

    /**
     * 转换状态
     */
    transitionTo(newState, reason = '') {
        if (!canTransition(this.state, newState)) {
            const error = new Error(`Invalid state transition: ${this.state} -> ${newState}`);
            this.emit('error', { agentId: this.id, error: error.message });
            return false;
        }

        this.previousState = this.state;
        this.state = newState;
        
        this._log('state_change', {
            from: this.previousState,
            to: newState,
            reason,
            timestamp: new Date().toISOString()
        });

        this.emit('stateChanged', {
            agentId: this.id,
            previousState: this.previousState,
            currentState: newState,
            reason
        });

        // 状态特定的清理
        if (newState === AgentState.WORKING) {
            this._startTaskTimer();
        } else if (newState !== AgentState.WORKING) {
            this._stopTaskTimer();
        }

        return true;
    }

    /**
     * 检查是否可以接收消息
     */
    canAccept(messageType) {
        return canReceiveMessage(this.state, messageType);
    }

    // ========================================================================
    // 任务管理
    // ========================================================================

    /**
     * 分配任务
     */
    assign(task) {
        if (!this.canAccept(MessageType.ASSIGN)) {
            return { 
                success: false, 
                reason: `Cannot assign task in state: ${this.state}`,
                code: 'STATE_FORBIDDEN'
            };
        }

        this.task = {
            ...task,
            id: task.id || `task_${Date.now()}`,
            assignedAt: new Date().toISOString(),
            agentId: this.id,
            state: 'assigned'
        };

        // 添加到记忆
        this.memory.addShortTerm({
            type: 'task_assigned',
            taskId: this.task.id,
            taskName: task.name || task.id
        });

        this.transitionTo(AgentState.PREPARING, 'task_assigned');
        this.emit('assigned', { agentId: this.id, task: this.task });
        
        this._log('task_assigned', `Task assigned: ${this.task.id}`);
        
        return { success: true, task: this.task };
    }

    /**
     * 开始执行
     */
    startExecution() {
        if (this.state !== AgentState.PREPARING && this.state !== AgentState.WAITING) {
            return { success: false, reason: 'Not in PREPARING or WAITING state' };
        }

        this.transitionTo(AgentState.WORKING, 'execution_started');
        if (this.task) {
            this.task.state = 'executing';
            this.task.startedAt = new Date().toISOString();
        }
        
        return { success: true };
    }

    /**
     * 上报进度
     */
    report(progress, detail = {}) {
        if (!this.canAccept(MessageType.REPORT)) {
            return { success: false, reason: 'Cannot report in current state' };
        }

        const reportMsg = {
            type: MessageType.REPORT,
            agentId: this.id,
            agentType: this.type,
            taskId: this.task?.id,
            progress: Math.min(100, Math.max(0, progress)),
            detail,
            timestamp: new Date().toISOString()
        };

        this.emit('report', reportMsg);
        
        // 更新任务进度
        if (this.task) {
            this.task.progress = reportMsg.progress;
            this.task.lastReport = reportMsg;
        }

        return reportMsg;
    }

    /**
     * 完成任务
     */
    complete(result = {}) {
        if (!this.canAccept(MessageType.COMPLETE)) {
            // 强制转换到完成状态
            this.transitionTo(AgentState.COMPLETED, 'force_complete');
        } else {
            this.transitionTo(AgentState.COMPLETED, 'task_completed');
        }

        const completeMsg = {
            type: MessageType.COMPLETE,
            agentId: this.id,
            agentType: this.type,
            taskId: this.task?.id,
            result,
            timestamp: new Date().toISOString()
        };

        // 更新统计
        this._updateStats('completed');

        // 添加到历史
        this._addToHistory(completeMsg);

        // 记录到记忆
        this.memory.addShortTerm({
            type: 'task_completed',
            taskId: this.task?.id,
            result
        });

        this.emit('complete', completeMsg);
        this._log('task_completed', `Task completed: ${this.task?.id}`);

        // 延迟重置到空闲
        setTimeout(() => {
            this.transitionTo(AgentState.IDLE, 'cooldown_complete');
            this.task = null;
        }, 1000);

        return completeMsg;
    }

    /**
     * 报告失败
     */
    fail(error, canRetry = false) {
        const errorMsg = error.message || String(error);
        
        this.transitionTo(AgentState.FAILED, 'task_failed');

        const failMsg = {
            type: MessageType.FAIL,
            agentId: this.id,
            agentType: this.type,
            taskId: this.task?.id,
            error: errorMsg,
            canRetry,
            timestamp: new Date().toISOString()
        };

        // 更新统计
        this._updateStats('failed');

        // 添加到历史
        this._addToHistory(failMsg);

        this.emit('fail', failMsg);
        this._log('task_failed', errorMsg);

        // 自动重试
        if (canRetry && this.task) {
            setTimeout(() => {
                this.transitionTo(AgentState.PREPARING, 'retry');
                this.task.retryCount = (this.task.retryCount || 0) + 1;
            }, 2000);
        } else {
            // 延迟重置
            setTimeout(() => {
                this.transitionTo(AgentState.IDLE, 'reset_after_failure');
                this.task = null;
            }, 3000);
        }

        return failMsg;
    }

    /**
     * 进入等待状态
     */
    wait(reason = '') {
        if (!this.canAccept(MessageType.REPORT)) {
            return { success: false, reason: 'Cannot wait in current state' };
        }

        this.transitionTo(AgentState.WAITING, reason || 'waiting_for_resource');
        if (this.task) {
            this.task.state = 'waiting';
            this.task.waitReason = reason;
        }

        this.emit('waiting', { agentId: this.id, reason });
        
        return { success: true };
    }

    /**
     * 恢复执行
     */
    resume() {
        if (!this.canAccept(MessageType.RESUME)) {
            return { success: false, reason: 'Cannot resume in current state' };
        }

        this.transitionTo(AgentState.WORKING, 'resumed');
        if (this.task) {
            this.task.state = 'executing';
        }

        return { success: true };
    }

    /**
     * 取消任务
     */
    cancel(reason = 'user_cancelled') {
        this.transitionTo(AgentState.CANCELLED, reason);
        
        if (this.task) {
            this.task.state = 'cancelled';
            this.task.cancelledAt = new Date().toISOString();
            this.task.cancelReason = reason;
        }

        this.emit('cancelled', { agentId: this.id, reason });
        
        // 延迟重置
        setTimeout(() => {
            this.transitionTo(AgentState.IDLE, 'reset_after_cancel');
            this.task = null;
        }, 500);

        return { success: true };
    }

    // ========================================================================
    // 上下文注入
    // ========================================================================

    /**
     * 获取带上下文的执行参数
     */
    getExecutionContext(extraContext = {}) {
        return {
            agent: {
                id: this.id,
                type: this.type,
                name: this.name,
                state: this.state
            },
            task: this.task,
            memory: this.memory.getContext(),
            ...extraContext
        };
    }

    /**
     * 注入上下文数据
     */
    injectContext(key, value) {
        this.memory.setWorking(key, value);
    }

    /**
     * 获取注入的上下文
     */
    getInjectedContext(key) {
        return this.memory.getWorking(key);
    }

    // ========================================================================
    // 状态查询
    // ========================================================================

    /**
     * 获取完整状态
     */
    getStatus() {
        return {
            id: this.id,
            type: this.type,
            name: this.name,
            description: this.description,
            state: this.state,
            previousState: this.previousState,
            task: this.task ? {
                id: this.task.id,
                name: this.task.name,
                progress: this.task.progress,
                assignedAt: this.task.assignedAt,
                state: this.task.state
            } : null,
            lastHeartbeat: this.lastHeartbeat,
            createdAt: this.createdAt,
            tags: this.tags,
            metadata: this.metadata,
            stats: { ...this.stats }
        };
    }

    /**
     * 检查健康状态
     */
    isHealthy() {
        const timeSinceHeartbeat = Date.now() - this.lastHeartbeat;
        return timeSinceHeartbeat < this.maxIdleTime;
    }

    /**
     * 检查任务超时
     */
    isTaskTimeout() {
        if (!this.task || !this.task.startedAt) return false;
        const taskDuration = Date.now() - new Date(this.task.startedAt).getTime();
        return taskDuration > this.maxTaskTime;
    }

    /**
     * 获取心跳信息
     */
    getHeartbeatInfo() {
        return {
            agentId: this.id,
            state: this.state,
            lastHeartbeat: this.lastHeartbeat,
            timeSinceHeartbeat: Date.now() - this.lastHeartbeat,
            healthy: this.isHealthy()
        };
    }

    // ========================================================================
    // 内部方法
    // ========================================================================

    _startHeartbeat() {
        this._heartbeatTimer = setInterval(() => {
            this.lastHeartbeat = Date.now();
            const info = this.getHeartbeatInfo();
            this.emit('heartbeat', info);

            // 检查任务超时
            if (this.state === AgentState.WORKING && this.isTaskTimeout()) {
                this._handleTimeout();
            }

            // 检查空闲超时
            if (this.state === AgentState.IDLE && !this.isHealthy()) {
                this._handleIdleTimeout();
            }
        }, this.heartbeatInterval);
    }

    _startTaskTimer() {
        this._stopTaskTimer();
        this._taskTimer = setTimeout(() => {
            if (this.state === AgentState.WORKING) {
                this._handleTimeout();
            }
        }, this.maxTaskTime);
    }

    _stopTaskTimer() {
        if (this._taskTimer) {
            clearTimeout(this._taskTimer);
            this._taskTimer = null;
        }
    }

    _handleTimeout() {
        const timeoutMsg = {
            type: MessageType.TIMEOUT,
            agentId: this.id,
            taskId: this.task?.id,
            taskDuration: this.task?.startedAt ? Date.now() - new Date(this.task.startedAt).getTime() : 0
        };

        this.transitionTo(AgentState.TIMEOUT, 'task_timeout');
        this.emit('timeout', timeoutMsg);
        this._log('timeout', `Task timeout: ${this.task?.id}`);

        // 自动重置
        setTimeout(() => {
            this.transitionTo(AgentState.IDLE, 'reset_after_timeout');
            this.task = null;
        }, 2000);
    }

    _handleIdleTimeout() {
        this._log('warning', `Agent idle timeout: ${this.id}`);
        this.emit('idleTimeout', { agentId: this.id });
    }

    _updateStats(action) {
        if (action === 'completed') {
            this.stats.tasksCompleted++;
            if (this.task?.startedAt) {
                const taskTime = Date.now() - new Date(this.task.startedAt).getTime();
                this.stats.totalTaskTime += taskTime;
                this.stats.avgTaskTime = this.stats.totalTaskTime / this.stats.tasksCompleted;
            }
        } else if (action === 'failed') {
            this.stats.tasksFailed++;
        }
    }

    _addToHistory(entry) {
        this.taskHistory.unshift(entry);
        if (this.taskHistory.length > this.maxHistory) {
            this.taskHistory.pop();
        }
    }

    _log(action, detail) {
        const entry = {
            timestamp: new Date().toISOString(),
            agentId: this.id,
            agentState: this.state,
            action,
            detail
        };
        this.emit('log', entry);
    }

    /**
     * 重置 Agent
     */
    reset() {
        this.transitionTo(AgentState.IDLE, 'manual_reset');
        this.task = null;
        this.memory.clearWorking();
    }

    /**
     * 销毁 Agent
     */
    destroy() {
        this._stopTaskTimer();
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
        this.removeAllListeners();
    }
}

// ============================================================================
// Agent 注册中心
// ============================================================================

export class AgentRegistry extends EventEmitter {
    constructor() {
        super();
        this.agents = new Map();
        this.taskQueue = [];
        this.maxQueueLength = 100;
    }

    /**
     * 注册 Agent
     */
    register(agent) {
        if (this.agents.has(agent.id)) {
            console.warn(`[AgentRegistry] Agent ${agent.id} already registered`);
            return false;
        }

        this.agents.set(agent.id, agent);

        // 监听所有事件
        agent.on('complete', (msg) => this.emit('agent_complete', msg));
        agent.on('fail', (msg) => this.emit('agent_fail', msg));
        agent.on('report', (msg) => this.emit('agent_report', msg));
        agent.on('timeout', (msg) => this.emit('agent_timeout', msg));
        agent.on('heartbeat', (msg) => this.emit('agent_heartbeat', msg));
        agent.on('stateChanged', (msg) => this.emit('agent_state_changed', msg));
        agent.on('assigned', (msg) => this.emit('agent_assigned', msg));
        agent.on('waiting', (msg) => this.emit('agent_waiting', msg));
        agent.on('cancelled', (msg) => this.emit('agent_cancelled', msg));
        agent.on('error', (msg) => this.emit('agent_error', msg));
        agent.on('log', (entry) => this.emit('agent_log', entry));

        // console.log(`[AgentRegistry] Registered: ${agent.type} (${agent.id})`);
        return true;
    }

    /**
     * 注销 Agent
     */
    unregister(agentId) {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.destroy();
            this.agents.delete(agentId);
            // console.log(`[AgentRegistry] Unregistered: ${agentId}`);
            return true;
        }
        return false;
    }

    /**
     * 获取 Agent
     */
    get(agentId) {
        return this.agents.get(agentId);
    }

    /**
     * 按类型获取 Agents
     */
    getByType(type) {
        return Array.from(this.agents.values()).filter(a => a.type === type);
    }

    /**
     * 按状态获取 Agents
     */
    getByState(state) {
        return Array.from(this.agents.values()).filter(a => a.state === state);
    }

    /**
     * 分配任务到指定类型
     */
    assignToType(type, task) {
        const agents = this.getByType(type);
        if (agents.length === 0) {
            return { success: false, reason: `No agents of type: ${type}`, code: 'NO_AGENT' };
        }

        // 优先选择空闲的 Agent
        const idle = agents.find(a => a.state === AgentState.IDLE);
        if (idle) {
            const result = idle.assign(task);
            return result;
        }

        // 其次选择刚完成的
        const completed = agents.find(a => a.state === AgentState.COMPLETED);
        if (completed) {
            const result = completed.assign(task);
            return result;
        }

        // 加入队列
        if (this.taskQueue.length < this.maxQueueLength) {
            this.taskQueue.push({ type, task, queuedAt: Date.now() });
            return { success: false, reason: 'queued', queued: true, queuePosition: this.taskQueue.length };
        }

        return { success: false, reason: 'queue_full', code: 'QUEUE_FULL' };
    }

    /**
     * 分配任务到指定 Agent
     */
    assignToAgent(agentId, task) {
        const agent = this.agents.get(agentId);
        if (!agent) {
            return { success: false, reason: 'Agent not found', code: 'NOT_FOUND' };
        }
        return agent.assign(task);
    }

    /**
     * 获取所有 Agent 状态
     */
    getAllStatus() {
        const agents = [];
        for (const [id, agent] of this.agents) {
            agents.push(agent.getStatus());
        }

        const byState = {};
        for (const agent of this.agents.values()) {
            byState[agent.state] = (byState[agent.state] || 0) + 1;
        }

        const byType = {};
        for (const agent of this.agents.values()) {
            byType[agent.type] = (byType[agent.type] || 0) + 1;
        }

        return {
            agents,
            total: this.agents.size,
            byState,
            byType,
            queueLength: this.taskQueue.length,
            queue: this.taskQueue.map(q => ({ type: q.type, taskId: q.task.id, queuedAt: q.queuedAt }))
        };
    }

    /**
     * 健康检查
     */
    healthCheck() {
        const results = [];
        for (const [id, agent] of this.agents) {
            const healthy = agent.isHealthy();
            const taskTimeout = agent.isTaskTimeout();
            results.push({
                agentId: id,
                type: agent.type,
                state: agent.state,
                healthy,
                taskTimeout,
                lastHeartbeat: agent.lastHeartbeat
            });

            if (!healthy) {
                this.emit('unhealthy', { agentId: id, lastHeartbeat: agent.lastHeartbeat });
            }
            if (taskTimeout) {
                this.emit('task_timeout_warning', { agentId: id, taskId: agent.task?.id });
            }
        }
        return results;
    }

    /**
     * 处理超时 Agents
     */
    handleTimeouts() {
        for (const [id, agent] of this.agents) {
            if (agent.state === AgentState.WORKING && agent.isTaskTimeout()) {
                agent.fail(new Error('Task timeout via registry'), true);
            }
        }
    }

    /**
     * 广播消息到所有 Agents
     */
    broadcast(messageType, data) {
        for (const agent of this.agents.values()) {
            if (agent.canAccept(messageType)) {
                agent.emit(messageType, data);
            }
        }
    }

    /**
     * 获取可用的 Agent 类型统计
     */
    getAvailableCounts() {
        const counts = {};
        for (const [type, agents] of this._groupByType()) {
            const idle = agents.filter(a => a.state === AgentState.IDLE).length;
            const working = agents.filter(a => a.state === AgentState.WORKING).length;
            counts[type] = { total: agents.length, idle, working };
        }
        return counts;
    }

    _groupByType() {
        const groups = new Map();
        for (const agent of this.agents.values()) {
            if (!groups.has(agent.type)) {
                groups.set(agent.type, []);
            }
            groups.get(agent.type).push(agent);
        }
        return groups;
    }

    /**
     * 销毁所有 Agents
     */
    destroy() {
        for (const agent of this.agents.values()) {
            agent.destroy();
        }
        this.agents.clear();
        this.taskQueue = [];
        this.removeAllListeners();
    }
}

// ============================================================================
// 默认 Agent 工厂
// ============================================================================

/**
 * 创建默认 Agent 集合
 */
export function createDefaultAgents(config = {}) {
    const registry = new AgentRegistry();

    const defaults = [
        // 六部使官
        { type: AgentType.BINGBU,    name: '兵部使',    description: '技术实现与编码' },
        { type: AgentType.HUBU,      name: '户部使',    description: '数据处理与分析' },
        { type: AgentType.LIBU,      name: '吏部使',    description: '资源调度与任务分配' },
        { type: AgentType.LIBU_DOC,  name: '礼部文使',  description: '文档撰写与报告' },
        { type: AgentType.GONGBU,    name: '工部使',    description: '执行操作与系统任务' },
        { type: AgentType.XINGBU,    name: '刑部使',    description: '审核检查与代码审查' },
        
        // 系统使官
        { type: AgentType.REPORTER,   name: '奏报使',  description: '结果报告' },
        { type: AgentType.LOGGER,     name: '记档使',  description: '日志记录' },
        { type: AgentType.WATCHDOG,   name: '监察使',  description: '健康监控' },
        { type: AgentType.COORDINATOR,name: '协调使',  description: '跨模块协调' },
    ];

    for (const cfg of defaults) {
        const agent = new Agent({
            ...cfg,
            heartbeatInterval: config.heartbeatInterval || 30000,
            maxIdleTime: config.maxIdleTime || 300000,
            maxTaskTime: config.maxTaskTime || 600000,
            maxHistory: config.maxHistory || 50
        });
        registry.register(agent);
    }

    return registry;
}

// ============================================================================
// 导出
// ============================================================================

export default {
    Agent,
    AgentRegistry,
    AgentType,
    AgentState,
    MessageType,
    STATE_TRANSITIONS,
    canTransition,
    canReceiveMessage,
    AgentMemory,
    createDefaultAgents
};
