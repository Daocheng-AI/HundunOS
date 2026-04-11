// hundunos/extension-modules/subagent调度/index.js — SubAgent 调度系统
// 功能: 子Agent生命周期管理，参考 deer-flow 设计
// 状态: 新增

import { randomUUID } from 'crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const AgentState = {
    CREATED: 'created',
    READY: 'ready',
    RUNNING: 'running',
    IDLE: 'idle',
    TERMINATED: 'terminated'
};

export class SubAgentScheduler {
    constructor(kernel) {
        this.kernel = kernel;
        this.agents = new Map();
        
        // 配置
        this.config = {
            agentsDir: join(__dirname, '..', '..', 'data', 'agents'),
            maxConcurrent: 3,
            maxDepth: 2,
            defaultTimeout: 300000  // 5分钟
        };
        
        this.stats = {
            created: 0,
            spawned: 0,
            completed: 0,
            terminated: 0
        };
        
        this._callbacks = {
            onSpawn: [],
            onComplete: [],
            onError: [],
            onTerminate: []
        };
    }

    async initialize() {
        mkdirSync(this.config.agentsDir, { recursive: true });
        
        // 加载已有 Agent 配置
        await this._loadAgents();
        
        // review: removed // review: removed console.log('[SubAgentScheduler] Initialized,', this.agents.size, 'agents loaded');
    }

    /**
     * 创建新 Agent
     */
    createAgent(config) {
        const agentId = config.id || `agent_${randomUUID()}`;
        
        const agent = {
            id: agentId,
            name: config.name || agentId,
            description: config.description || '',
            
            // SOUL 配置 (参考 deer-flow)
            soul: config.soul || '',
            
            // 模型配置
            model: config.model || null,
            
            // 工具组
            toolGroups: config.toolGroups || [],
            
            // 状态
            state: AgentState.CREATED,
            
            // 生命周期
            createdAt: Date.now(),
            startedAt: null,
            endedAt: null,
            
            // 执行信息
            parentId: config.parentId || null,
            depth: config.depth || 0,
            
            // 配置
            timeout: config.timeout || this.config.defaultTimeout,
            maxRetries: config.maxRetries || 0,
            
            // 运行时
            currentTask: null,
            result: null,
            error: null
        };
        
        // 检查深度限制
        if (agent.depth >= this.config.maxDepth) {
            throw new Error(`Max agent depth (${this.config.maxDepth}) exceeded`);
        }
        
        this.agents.set(agentId, agent);
        this._saveAgentConfig(agent);
        
        this.stats.created++;
        // review: removed // review: removed console.log(`[SubAgentScheduler] Created agent: ${agentId} (${agent.name})`);
        
        return agentId;
    }

    /**
     * 启动 Agent
     */
    async spawn(agentId, task = {}) {
        const agent = this.agents.get(agentId);
        if (!agent) {
            // 尝试从文件加载
            const loaded = await this._loadAgentFromFile(agentId);
            if (!loaded) return null;
            agent = this.agents.get(agentId);
        }
        
        // 检查并发限制
        const runningCount = this._getRunningCount();
        if (runningCount >= this.config.maxConcurrent) {
            console.warn(`[SubAgentScheduler] Max concurrent agents (${this.config.maxConcurrent}) reached`);
            return { success: false, reason: 'max_concurrent_reached' };
        }
        
        // 更新状态
        agent.state = AgentState.RUNNING;
        agent.startedAt = Date.now();
        agent.currentTask = {
            id: task.id || `task_${randomUUID()}`,
            input: task.input || {},
            startedAt: Date.now()
        };
        
        // 触发回调
        this._emit('onSpawn', { agentId, agent, task });
        
        this.stats.spawned++;
        // review: removed // review: removed console.log(`[SubAgentScheduler] Spawned agent: ${agentId}`);
        
        return { success: true, agentId, taskId: agent.currentTask.id };
    }

    /**
     * 完成 Agent 执行
     */
    complete(agentId, result = {}) {
        const agent = this.agents.get(agentId);
        if (!agent) return null;
        
        agent.state = AgentState.IDLE;
        agent.endedAt = Date.now();
        agent.result = result;
        agent.currentTask = null;
        
        // 触发回调
        this._emit('onComplete', { agentId, agent, result });
        
        this.stats.completed++;
        // review: removed // review: removed console.log(`[SubAgentScheduler] Completed agent: ${agentId}`);
        
        return agent;
    }

    /**
     * Agent 执行失败
     */
    fail(agentId, error) {
        const agent = this.agents.get(agentId);
        if (!agent) return null;
        
        agent.state = AgentState.IDLE;
        agent.endedAt = Date.now();
        agent.error = error;
        
        // 触发回调
        this._emit('onError', { agentId, agent, error });
        
        // review: removed // review: removed console.log(`[SubAgentScheduler] Agent failed: ${agentId} (${error})`);
        
        return agent;
    }

    /**
     * 终止 Agent
     */
    terminate(agentId, reason = '') {
        const agent = this.agents.get(agentId);
        if (!agent) return null;
        
        agent.state = AgentState.TERMINATED;
        agent.endedAt = Date.now();
        agent.terminationReason = reason;
        
        // 删除配置
        this._deleteAgentConfig(agentId);
        this.agents.delete(agentId);
        
        // 触发回调
        this._emit('onTerminate', { agentId, reason });
        
        this.stats.terminated++;
        // review: removed // review: removed console.log(`[SubAgentScheduler] Terminated agent: ${agentId} (${reason})`);
        
        return agent;
    }

    /**
     * 获取 Agent 信息
     */
    getAgent(agentId) {
        return this.agents.get(agentId);
    }

    /**
     * 列出所有 Agent
     */
    listAgents(filter = {}) {
        const all = Array.from(this.agents.values());
        
        if (filter.state) {
            return all.filter(a => a.state === filter.state);
        }
        if (filter.parentId) {
            return all.filter(a => a.parentId === filter.parentId);
        }
        
        return all;
    }

    /**
     * 获取可用 Agent (IDLE 状态)
     */
    getAvailableAgents() {
        return this.listAgents({ state: AgentState.IDLE });
    }

    /**
     * 注册回调
     */
    on(event, callback) {
        if (this._callbacks[event]) {
            this._callbacks[event].push(callback);
        }
    }

    /**
     * 触发回调
     */
    _emit(event, data) {
        const callbacks = this._callbacks[event] || [];
        for (const cb of callbacks) {
            try {
                cb(data);
            } catch (e) {
                console.error(`[SubAgentScheduler] Callback error:`, e.message);
            }
        }
    }

    /**
     * 统计运行中的 Agent
     */
    _getRunningCount() {
        let count = 0;
        for (const agent of this.agents.values()) {
            if (agent.state === AgentState.RUNNING) count++;
        }
        return count;
    }

    /**
     * 保存 Agent 配置到文件
     */
    _saveAgentConfig(agent) {
        const configPath = join(this.config.agentsDir, `${agent.id}.json`);
        try {
            writeFileSync(configPath, JSON.stringify(agent, null, 2), 'utf8');
        } catch (e) {
            console.error(`[SubAgentScheduler] Failed to save config:`, e.message);
        }
    }

    /**
     * 从文件加载 Agent 配置
     */
    async _loadAgentFromFile(agentId) {
        const configPath = join(this.config.agentsDir, `${agentId}.json`);
        if (!existsSync(configPath)) return false;
        
        try {
            const content = readFileSync(configPath, 'utf8');
            const agent = JSON.parse(content);
            this.agents.set(agentId, agent);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * 加载所有 Agent 配置
     */
    async _loadAgents() {
        try {
            const files = readdirSync(this.config.agentsDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const agentId = file.replace('.json', '');
                    await this._loadAgentFromFile(agentId);
                }
            }
        } catch (e) {
            // review: removed // review: removed console.log('[SubAgentScheduler] No existing agents');
        }
    }

    /**
     * 删除 Agent 配置
     */
    _deleteAgentConfig(agentId) {
        const configPath = join(this.config.agentsDir, `${agentId}.json`);
        try {
            if (existsSync(configPath)) {
                unlinkSync(configPath);  // 实际删除文件
            }
        } catch (e) {
            console.error(`[SubAgentScheduler] Failed to delete config:`, e.message);
        }
    }

    /**
     * 获取统计
     */
    getStats() {
        const states = {};
        for (const agent of this.agents.values()) {
            states[agent.state] = (states[agent.state] || 0) + 1;
        }
        
        return {
            total: this.agents.size,
            running: this._getRunningCount(),
            states,
            ...this.stats
        };
    }
}

export function getSubAgentScheduler(kernel) {
    return new SubAgentScheduler(kernel);
}