/**
 * kernel/pipeline/graph/conditional-directed-graph.js
 * 有向图条件边支持
 * 
 * 基于 TradingAgents-CN 的优化方案，增强有向图功能：
 * 1. 条件边：根据条件决定是否激活边
 * 2. 权重边：带权重的边，影响执行优先级
 * 3. 动态边：运行时动态添加/移除边
 * 4. 子图支持：嵌套子图结构
 */

import { DirectedGraph, GraphNode } from './directed-graph.js';

/**
 * 条件边类型
 */
export const EdgeType = {
    ALWAYS: 'always',      // 总是激活
    CONDITIONAL: 'conditional', // 条件激活
    WEIGHTED: 'weighted',  // 带权重
    DYNAMIC: 'dynamic',    // 动态边
};

/**
 * 条件边
 */
export class ConditionalEdge {
    /**
     * 构造函数
     * @param {string} fromId - 源节点ID
     * @param {string} toId - 目标节点ID
     * @param {Object} options - 配置选项
     * @param {string} options.type - 边类型 (EdgeType)
     * @param {Function} options.condition - 条件函数，返回布尔值
     * @param {number} options.weight - 权重（0-1）
     * @param {Object} options.metadata - 元数据
     * @param {boolean} options.enabled - 是否启用
     */
    constructor(fromId, toId, options = {}) {
        this.fromId = fromId;
        this.toId = toId;
        this.type = options.type || EdgeType.ALWAYS;
        this.condition = options.condition || (() => true);
        this.weight = Math.max(0, Math.min(1, options.weight || 1.0));
        this.metadata = options.metadata || {};
        this.enabled = options.enabled !== false;
        this.createdAt = Date.now();
        this.lastEvaluatedAt = null;
        this.evaluationCount = 0;
        this.activationCount = 0;
    }

    /**
     * 评估条件
     * @param {Object} context - 评估上下文
     * @returns {boolean} 是否激活
     */
    evaluate(context = {}) {
        this.lastEvaluatedAt = Date.now();
        this.evaluationCount++;

        if (!this.enabled) {
            return false;
        }

        if (this.type === EdgeType.ALWAYS) {
            this.activationCount++;
            return true;
        }

        if (this.type === EdgeType.CONDITIONAL) {
            try {
                const result = this.condition(context);
                if (result) {
                    this.activationCount++;
                }
                return result;
            } catch (error) {
                console.warn(`[ConditionalEdge] Condition evaluation failed for ${this.fromId} -> ${this.toId}:`, error);
                return false;
            }
        }

        if (this.type === EdgeType.WEIGHTED) {
            // 权重边总是激活，但权重影响优先级
            this.activationCount++;
            return true;
        }

        if (this.type === EdgeType.DYNAMIC) {
            // 动态边需要运行时评估
            try {
                const result = this.condition(context);
                if (result) {
                    this.activationCount++;
                }
                return result;
            } catch (error) {
                console.warn(`[ConditionalEdge] Dynamic edge evaluation failed for ${this.fromId} -> ${this.toId}:`, error);
                return false;
            }
        }

        return false;
    }

    /**
     * 获取边统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        const totalEvaluations = this.evaluationCount;
        const activationRate = totalEvaluations > 0 ? (this.activationCount / totalEvaluations) : 0;
        
        return {
            fromId: this.fromId,
            toId: this.toId,
            type: this.type,
            weight: this.weight,
            enabled: this.enabled,
            createdAt: this.createdAt,
            lastEvaluatedAt: this.lastEvaluatedAt,
            evaluationCount: totalEvaluations,
            activationCount: this.activationCount,
            activationRate: activationRate.toFixed(4),
            metadata: this.metadata,
        };
    }

    /**
     * 克隆边
     * @returns {ConditionalEdge} 克隆的边
     */
    clone() {
        return new ConditionalEdge(this.fromId, this.toId, {
            type: this.type,
            condition: this.condition,
            weight: this.weight,
            metadata: { ...this.metadata },
            enabled: this.enabled,
        });
    }
}

/**
 * 条件节点
 */
export class ConditionalNode extends GraphNode {
    /**
     * 构造函数
     * @param {string} id - 节点ID
     * @param {*} data - 节点数据
     * @param {Object} options - 配置选项
     */
    constructor(id, data = null, options = {}) {
        super(id, data);
        this.conditions = options.conditions || {};
        this.priority = options.priority || 0;
        this.enabled = options.enabled !== false;
        this.metadata = options.metadata || {};
        this.executionCount = 0;
        this.lastExecutedAt = null;
        this.executionTime = 0;
    }

    /**
     * 检查节点是否可执行
     * @param {Object} context - 执行上下文
     * @returns {boolean} 是否可执行
     */
    canExecute(context = {}) {
        if (!this.enabled) {
            return false;
        }

        // 检查前置条件
        if (this.conditions.precondition) {
            try {
                if (!this.conditions.precondition(context)) {
                    return false;
                }
            } catch (error) {
                console.warn(`[ConditionalNode] Precondition evaluation failed for ${this.id}:`, error);
                return false;
            }
        }

        return true;
    }

    /**
     * 执行节点
     * @param {Object} context - 执行上下文
     * @returns {*} 执行结果
     */
    async execute(context = {}) {
        if (!this.canExecute(context)) {
            throw new Error(`Node ${this.id} cannot execute`);
        }

        const startTime = Date.now();
        this.executionCount++;
        
        try {
            let result = null;
            
            if (this.conditions.execute) {
                result = await this.conditions.execute(context);
            } else if (this.data && typeof this.data.execute === 'function') {
                result = await this.data.execute(context);
            }
            
            const endTime = Date.now();
            this.lastExecutedAt = endTime;
            this.executionTime += (endTime - startTime);
            
            // 执行后置条件
            if (this.conditions.postcondition) {
                try {
                    if (!this.conditions.postcondition(context, result)) {
                        console.warn(`[ConditionalNode] Postcondition failed for ${this.id}`);
                    }
                } catch (error) {
                    console.warn(`[ConditionalNode] Postcondition evaluation failed for ${this.id}:`, error);
                }
            }
            
            return result;
        } catch (error) {
            const endTime = Date.now();
            this.lastExecutedAt = endTime;
            this.executionTime += (endTime - startTime);
            throw error;
        }
    }

    /**
     * 获取节点统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        const avgExecutionTime = this.executionCount > 0 
            ? (this.executionTime / this.executionCount) 
            : 0;
        
        return {
            id: this.id,
            enabled: this.enabled,
            priority: this.priority,
            executionCount: this.executionCount,
            lastExecutedAt: this.lastExecutedAt,
            totalExecutionTime: this.executionTime,
            avgExecutionTime: avgExecutionTime.toFixed(2),
            metadata: this.metadata,
        };
    }
}

/**
 * 有向图条件边支持
 */
export class ConditionalDirectedGraph extends DirectedGraph {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     */
    constructor(options = {}) {
        super();
        this.conditionalEdges = new Map(); // fromId -> Map<toId, ConditionalEdge>
        this.nodeConditions = new Map(); // nodeId -> conditions
        this.executionHistory = [];
        this.maxHistorySize = options.maxHistorySize || 1000;
        this.enableStatistics = options.enableStatistics !== false;
    }

    /**
     * 添加条件节点
     * @param {string} id - 节点ID
     * @param {*} data - 节点数据
     * @param {Object} options - 配置选项
     * @returns {ConditionalNode} 新节点
     */
    addConditionalNode(id, data = null, options = {}) {
        const node = new ConditionalNode(id, data, options);
        this.nodes.set(id, node);
        return node;
    }

    /**
     * 添加条件边
     * @param {string} fromId - 源节点ID
     * @param {string} toId - 目标节点ID
     * @param {Object} options - 配置选项
     * @returns {ConditionalEdge} 新边
     */
    addConditionalEdge(fromId, toId, options = {}) {
        // 确保节点存在
        if (!this.nodes.has(fromId)) {
            this.addConditionalNode(fromId);
        }
        if (!this.nodes.has(toId)) {
            this.addConditionalNode(toId);
        }

        // 创建条件边
        const edge = new ConditionalEdge(fromId, toId, options);
        
        // 存储条件边
        if (!this.conditionalEdges.has(fromId)) {
            this.conditionalEdges.set(fromId, new Map());
        }
        this.conditionalEdges.get(fromId).set(toId, edge);

        // 添加基础边（总是添加，条件边控制激活）
        super.addEdge(fromId, toId);

        return edge;
    }

    /**
     * 移除条件边
     * @param {string} fromId - 源节点ID
     * @param {string} toId - 目标节点ID
     * @returns {boolean} 是否成功移除
     */
    removeConditionalEdge(fromId, toId) {
        const fromEdges = this.conditionalEdges.get(fromId);
        if (fromEdges) {
            fromEdges.delete(toId);
            if (fromEdges.size === 0) {
                this.conditionalEdges.delete(fromId);
            }
        }

        // 移除基础边
        super.removeEdge(fromId, toId);
        return true;
    }

    /**
     * 获取条件边
     * @param {string} fromId - 源节点ID
     * @param {string} toId - 目标节点ID
     * @returns {ConditionalEdge|undefined} 条件边
     */
    getConditionalEdge(fromId, toId) {
        const fromEdges = this.conditionalEdges.get(fromId);
        return fromEdges ? fromEdges.get(toId) : undefined;
    }

    /**
     * 获取激活的边（基于上下文）
     * @param {Object} context - 评估上下文
     * @returns {Array<{from: string, to: string, edge: ConditionalEdge}>} 激活的边
     */
    getActiveEdges(context = {}) {
        const activeEdges = [];

        for (const [fromId, toEdges] of this.conditionalEdges.entries()) {
            for (const [toId, edge] of toEdges.entries()) {
                if (edge.evaluate(context)) {
                    activeEdges.push({
                        from: fromId,
                        to: toId,
                        edge: edge,
                    });
                }
            }
        }

        return activeEdges;
    }

    /**
     * 获取激活的子图（基于上下文）
     * @param {Object} context - 评估上下文
     * @returns {DirectedGraph} 激活的子图
     */
    getActiveSubgraph(context = {}) {
        const subgraph = new DirectedGraph();
        
        // 添加所有节点
        for (const [id, node] of this.nodes.entries()) {
            if (node.enabled !== false) {
                subgraph.addNode(id, node.data);
            }
        }

        // 添加激活的边
        const activeEdges = this.getActiveEdges(context);
        for (const { from, to } of activeEdges) {
            try {
                subgraph.addEdge(from, to);
            } catch (error) {
                // 忽略边添加错误（节点可能不存在于子图中）
            }
        }

        return subgraph;
    }

    /**
     * 获取可执行的节点（考虑条件和优先级）
     * @param {Set<string>} completedNodes - 已完成的节点ID集合
     * @param {Object} context - 执行上下文
     * @returns {Array<{id: string, node: ConditionalNode, priority: number}>} 可执行的节点
     */
    getNextExecutableNodes(completedNodes, context = {}) {
        const executable = [];

        for (const [id, node] of this.nodes.entries()) {
            // 检查节点是否已完成
            if (completedNodes.has(id)) {
                continue;
            }

            // 检查节点是否可执行
            if (!node.canExecute(context)) {
                continue;
            }

            // 检查所有依赖是否满足（考虑条件边）
            const dependencies = node.getDependencies();
            const allDependenciesMet = dependencies.every(dep => {
                // 检查基础依赖
                if (!completedNodes.has(dep.id)) {
                    return false;
                }

                // 检查条件边是否激活
                const edge = this.getConditionalEdge(dep.id, id);
                if (edge) {
                    return edge.evaluate(context);
                }

                return true;
            });

            if (allDependenciesMet) {
                executable.push({
                    id,
                    node,
                    priority: node.priority,
                });
            }
        }

        // 按优先级排序
        executable.sort((a, b) => b.priority - a.priority);
        return executable;
    }

    /**
     * 执行图（考虑条件边）
     * @param {Object} initialContext - 初始上下文
     * @param {Function} onNodeExecuted - 节点执行回调
     * @returns {Promise<Object>} 执行结果
     */
    async execute(initialContext = {}, onNodeExecuted = null) {
        const context = { ...initialContext };
        const completedNodes = new Set();
        const executionOrder = [];
        const results = new Map();
        const startTime = Date.now();

        // 记录执行历史
        const executionRecord = {
            startTime,
            context: { ...context },
            completedNodes: [],
            results: {},
            errors: [],
        };

        try {
            while (completedNodes.size < this.nodes.size) {
                // 获取可执行的节点
                const executable = this.getNextExecutableNodes(completedNodes, context);
                
                if (executable.length === 0) {
                    // 检查是否有循环依赖或死锁
                    const remainingNodes = Array.from(this.nodes.keys())
                        .filter(id => !completedNodes.has(id));
                    
                    if (remainingNodes.length > 0) {
                        const error = new Error(`Execution deadlock: no executable nodes found. Remaining: ${remainingNodes.join(', ')}`);
                        executionRecord.errors.push(error.message);
                        throw error;
                    }
                    break;
                }

                // 执行所有可并行执行的节点
                const executionPromises = executable.map(async ({ id, node }) => {
                    try {
                        const nodeStartTime = Date.now();
                        const result = await node.execute(context);
                        const nodeEndTime = Date.now();
                        
                        results.set(id, result);
                        completedNodes.add(id);
                        executionOrder.push(id);
                        
                        // 更新上下文
                        context[`${id}_result`] = result;
                        context[`${id}_executed`] = true;
                        context[`${id}_executionTime`] = nodeEndTime - nodeStartTime;
                        
                        // 回调
                        if (onNodeExecuted) {
                            await onNodeExecuted(id, node, result, context);
                        }
                        
                        // 记录执行历史
                        executionRecord.completedNodes.push({
                            id,
                            startTime: nodeStartTime,
                            endTime: nodeEndTime,
                            duration: nodeEndTime - nodeStartTime,
                            success: true,
                            result,
                        });
                        
                        return { id, success: true, result };
                    } catch (error) {
                        console.error(`[ConditionalDirectedGraph] Node ${id} execution failed:`, error);
                        
                        // 记录错误
                        executionRecord.errors.push({
                            node: id,
                            error: error.message,
                            timestamp: Date.now(),
                        });
                        
                        // 根据错误处理策略决定是否继续
                        const errorPolicy = node.metadata.errorPolicy || 'continue';
                        if (errorPolicy === 'stop') {
                            throw error;
                        }
                        
                        return { id, success: false, error };
                    }
                });

                const executionResults = await Promise.allSettled(executionPromises);
                
                // 检查是否有致命错误
                for (const result of executionResults) {
                    if (result.status === 'rejected') {
                        throw result.reason;
                    }
                }
            }

            const endTime = Date.now();
            executionRecord.endTime = endTime;
            executionRecord.duration = endTime - startTime;
            executionRecord.results = Object.fromEntries(results);

            // 记录执行历史
            this._addToHistory(executionRecord);

            return {
                success: true,
                executionOrder,
                results: Object.fromEntries(results),
                context,
                stats: {
                    totalNodes: this.nodes.size,
                    completedNodes: completedNodes.size,
                    executionTime: endTime - startTime,
                    avgNodeTime: executionRecord.completedNodes.length > 0 
                        ? executionRecord.completedNodes.reduce((sum, n) => sum + n.duration, 0) / executionRecord.completedNodes.length
                        : 0,
                },
            };
        } catch (error) {
            const endTime = Date.now();
            executionRecord.endTime = endTime;
            executionRecord.duration = endTime - startTime;
            executionRecord.error = error.message;
            
            this._addToHistory(executionRecord);
            
            return {
                success: false,
                error: error.message,
                executionOrder,
                results: Object.fromEntries(results),
                context,
                stats: {
                    totalNodes: this.nodes.size,
                    completedNodes: completedNodes.size,
                    executionTime: endTime - startTime,
                },
            };
        }
    }

    /**
     * 获取执行计划（考虑条件边）
     * @param {Object} context - 评估上下文
     * @returns {Array<Object>} 执行计划
     */
    getExecutionPlan(context = {}) {
        const plan = [];
        const visited = new Set();
        const inDegree = new Map();
        
        // 计算入度
        for (const [id, node] of this.nodes.entries()) {
            inDegree.set(id, 0);
        }
        
        for (const [fromId, toEdges] of this.conditionalEdges.entries()) {
            for (const [toId, edge] of toEdges.entries()) {
                if (edge.enabled !== false && edge.evaluate(context)) {
                    inDegree.set(toId, (inDegree.get(toId) || 0) + 1);
                }
            }
        }
        
        // 拓扑排序
        const queue = [];
        for (const [id, degree] of inDegree.entries()) {
            if (degree === 0) {
                const node = this.getNode(id);
                if (node && node.enabled !== false) {
                    queue.push(id);
                }
            }
        }
        
        while (queue.length > 0) {
            // 按优先级排序
            queue.sort((a, b) => {
                const nodeA = this.getNode(a);
                const nodeB = this.getNode(b);
                const priorityA = nodeA instanceof ConditionalNode ? nodeA.priority : 0;
                const priorityB = nodeB instanceof ConditionalNode ? nodeB.priority : 0;
                return priorityB - priorityA; // 降序
            });
            
            const currentId = queue.shift();
            const node = this.getNode(currentId);
            
            if (node && node.enabled !== false) {
                plan.push({
                    id: currentId,
                    data: node.data,
                    priority: node instanceof ConditionalNode ? node.priority : 0,
                    metadata: node.metadata || {},
                });
                
                visited.add(currentId);
                
                // 更新依赖节点的入度
                const dependents = node.getDependents();
                for (const dependent of dependents) {
                    const edge = this.getConditionalEdge(currentId, dependent.id);
                    if (edge && edge.enabled !== false && edge.evaluate(context)) {
                        const newDegree = (inDegree.get(dependent.id) || 0) - 1;
                        inDegree.set(dependent.id, newDegree);
                        
                        if (newDegree === 0 && !visited.has(dependent.id)) {
                            queue.push(dependent.id);
                        }
                    }
                }
            }
        }
        
        // 检查是否有环
        if (visited.size < this.nodes.size) {
            const remaining = Array.from(this.nodes.keys()).filter(id => !visited.has(id));
            console.warn(`[ConditionalDirectedGraph] 检测到可能的循环依赖，剩余节点: ${remaining.join(', ')}`);
        }
        
        return plan;
    }

    /**
     * 获取执行路径（考虑条件边）
     * @param {string} startNodeId - 起始节点ID
     * @param {string} endNodeId - 结束节点ID
     * @param {Object} context - 评估上下文
     * @returns {Array<string>|null} 执行路径
     */
    getExecutionPath(startNodeId, endNodeId, context = {}) {
        const visited = new Set();
        const path = [];
        
        const dfs = (currentId, targetId) => {
            if (currentId === targetId) {
                path.push(currentId);
                return true;
            }
            
            if (visited.has(currentId)) {
                return false;
            }
            
            visited.add(currentId);
            path.push(currentId);
            
            const node = this.getNode(currentId);
            if (!node) {
                path.pop();
                return false;
            }
            
            // 获取激活的出边
            const activeOutgoing = [];
            for (const dependent of node.getDependents()) {
                const edge = this.getConditionalEdge(currentId, dependent.id);
                if (!edge || edge.evaluate(context)) {
                    activeOutgoing.push(dependent.id);
                }
            }
            
            // 按权重排序
            activeOutgoing.sort((a, b) => {
                const edgeA = this.getConditionalEdge(currentId, a);
                const edgeB = this.getConditionalEdge(currentId, b);
                const weightA = edgeA ? edgeA.weight : 1.0;
                const weightB = edgeB ? edgeB.weight : 1.0;
                return weightB - weightA; // 降序
            });
            
            for (const nextId of activeOutgoing) {
                if (dfs(nextId, targetId)) {
                    return true;
                }
            }
            
            path.pop();
            return false;
        };
        
        return dfs(startNodeId, endNodeId) ? path : null;
    }

    /**
     * 获取图统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        const totalNodes = this.nodes.size;
        const totalEdges = Array.from(this.conditionalEdges.values())
            .reduce((sum, edges) => sum + edges.size, 0);
        
        const edgeStats = {
            total: totalEdges,
            byType: {},
            activationRates: {},
        };
        
        for (const [fromId, toEdges] of this.conditionalEdges.entries()) {
            for (const [toId, edge] of toEdges.entries()) {
                const type = edge.type;
                edgeStats.byType[type] = (edgeStats.byType[type] || 0) + 1;
                
                const stats = edge.getStats();
                if (!edgeStats.activationRates[type]) {
                    edgeStats.activationRates[type] = [];
                }
                edgeStats.activationRates[type].push(parseFloat(stats.activationRate));
            }
        }
        
        // 计算平均激活率
        for (const [type, rates] of Object.entries(edgeStats.activationRates)) {
            if (rates.length > 0) {
                const avg = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
                edgeStats.activationRates[type] = avg.toFixed(4);
            } else {
                edgeStats.activationRates[type] = '0.0000';
            }
        }
        
        const nodeStats = {
            total: totalNodes,
            enabled: 0,
            disabled: 0,
            executed: 0,
            avgExecutionTime: 0,
        };
        
        let totalExecutionTime = 0;
        let executedCount = 0;
        
        for (const [id, node] of this.nodes.entries()) {
            if (node.enabled !== false) {
                nodeStats.enabled++;
            } else {
                nodeStats.disabled++;
            }
            
            if (node.executionCount > 0) {
                nodeStats.executed++;
                totalExecutionTime += node.executionTime;
                executedCount += node.executionCount;
            }
        }
        
        nodeStats.avgExecutionTime = executedCount > 0 
            ? (totalExecutionTime / executedCount).toFixed(2)
            : '0.00';
        
        return {
            nodes: nodeStats,
            edges: edgeStats,
            executionHistory: {
                total: this.executionHistory.length,
                success: this.executionHistory.filter(r => r.success).length,
                failed: this.executionHistory.filter(r => !r.success).length,
                lastExecution: this.executionHistory.length > 0 
                    ? this.executionHistory[this.executionHistory.length - 1]
                    : null,
            },
        };
    }

    /**
     * 添加执行历史
     * @param {Object} record - 执行记录
     * @private
     */
    _addToHistory(record) {
        this.executionHistory.push(record);
        
        // 限制历史记录大小
        if (this.executionHistory.length > this.maxHistorySize) {
            this.executionHistory = this.executionHistory.slice(-this.maxHistorySize);
        }
    }

    /**
     * 清空执行历史
     */
    clearHistory() {
        this.executionHistory = [];
    }

    /**
     * 转换为JSON（包含条件边信息）
     * @returns {Object} JSON对象
     */
    toJSON() {
        const baseJson = super.toJSON();
        
        const conditionalEdges = [];
        for (const [fromId, toEdges] of this.conditionalEdges.entries()) {
            for (const [toId, edge] of toEdges.entries()) {
                conditionalEdges.push({
                    from: fromId,
                    to: toId,
                    type: edge.type,
                    weight: edge.weight,
                    enabled: edge.enabled,
                    metadata: edge.metadata,
                });
            }
        }
        
        const nodeConditions = {};
        for (const [id, node] of this.nodes.entries()) {
            if (node instanceof ConditionalNode) {
                nodeConditions[id] = {
                    enabled: node.enabled,
                    priority: node.priority,
                    metadata: node.metadata,
                    executionCount: node.executionCount,
                    lastExecutedAt: node.lastExecutedAt,
                    executionTime: node.executionTime,
                };
            }
        }
        
        return {
            ...baseJson,
            conditionalEdges,
            nodeConditions,
            stats: this.getStats(),
        };
    }

    /**
     * 从JSON创建图
     * @param {Object} json - JSON对象
     * @returns {ConditionalDirectedGraph} 条件有向图
     */
    static fromJSON(json) {
        const graph = new ConditionalDirectedGraph();
        
        // 添加节点
        for (const [id, data] of Object.entries(json.nodes || {})) {
            const nodeData = typeof data === 'object' ? data : { value: data };
            const conditions = json.nodeConditions?.[id] || {};
            
            graph.addConditionalNode(id, nodeData, {
                enabled: conditions.enabled,
                priority: conditions.priority,
                metadata: conditions.metadata,
            });
            
            // 恢复执行统计
            const node = graph.getNode(id);
            if (node instanceof ConditionalNode) {
                node.executionCount = conditions.executionCount || 0;
                node.lastExecutedAt = conditions.lastExecutedAt || null;
                node.executionTime = conditions.executionTime || 0;
            }
        }
        
        // 添加基础边
        for (const edge of json.edges || []) {
            try {
                graph.addEdge(edge.from, edge.to);
            } catch (error) {
                console.warn(`[ConditionalDirectedGraph] Failed to add edge ${edge.from} -> ${edge.to}:`, error.message);
            }
        }
        
        // 添加条件边
        for (const edge of json.conditionalEdges || []) {
            try {
                graph.addConditionalEdge(edge.from, edge.to, {
                    type: edge.type,
                    weight: edge.weight,
                    enabled: edge.enabled,
                    metadata: edge.metadata,
                });
            } catch (error) {
                console.warn(`[ConditionalDirectedGraph] Failed to add conditional edge ${edge.from} -> ${edge.to}:`, error.message);
            }
        }
        
        return graph;
    }
}

export default {
    ConditionalDirectedGraph,
    ConditionalNode,
    ConditionalEdge,
    EdgeType,
};