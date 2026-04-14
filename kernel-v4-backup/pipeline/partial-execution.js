// hundunos/kernel/pipeline/partial-execution.js
// 部分执行能力实现

import { DirectedGraph } from './graph/directed-graph.js';

/**
 * 执行栈帧
 */
export class ExecutionStackFrame {
  /**
   * 构造函数
   * @param {string} nodeId - 节点ID
   * @param {string} status - 执行状态 ('pending', 'running', 'completed', 'failed')
   * @param {*} output - 执行输出
   * @param {Error} error - 错误信息
   */
  constructor(nodeId, status = 'pending', output = null, error = null) {
    this.nodeId = nodeId;
    this.status = status;
    this.output = output;
    this.error = error;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * 执行栈
 */
export class ExecutionStack {
  /**
   * 构造函数
   */
  constructor() {
    this.frames = new Map(); // nodeId -> ExecutionStackFrame
    this.executionOrder = []; // 节点执行顺序
  }

  /**
   * 添加栈帧
   * @param {string} nodeId - 节点ID
   * @param {string} status - 执行状态
   * @param {*} output - 执行输出
   * @param {Error} error - 错误信息
   */
  push(nodeId, status = 'pending', output = null, error = null) {
    const frame = new ExecutionStackFrame(nodeId, status, output, error);
    this.frames.set(nodeId, frame);

    if (status === 'completed' || status === 'failed') {
      this.executionOrder.push(nodeId);
    }
  }

  /**
   * 更新栈帧
   * @param {string} nodeId - 节点ID
   * @param {string} status - 执行状态
   * @param {*} output - 执行输出
   * @param {Error} error - 错误信息
   */
  update(nodeId, status, output = null, error = null) {
    const frame = this.frames.get(nodeId);
    if (frame) {
      frame.status = status;
      frame.output = output;
      frame.error = error;
      frame.timestamp = new Date().toISOString();

      if ((status === 'completed' || status === 'failed') && !this.executionOrder.includes(nodeId)) {
        this.executionOrder.push(nodeId);
      }
    }
  }

  /**
   * 获取栈帧
   * @param {string} nodeId - 节点ID
   * @returns {ExecutionStackFrame|undefined} 栈帧
   */
  get(nodeId) {
    return this.frames.get(nodeId);
  }

  /**
   * 检查节点是否已完成
   * @param {string} nodeId - 节点ID
   * @returns {boolean} 是否已完成
   */
  isCompleted(nodeId) {
    const frame = this.frames.get(nodeId);
    return frame?.status === 'completed';
  }

  /**
   * 检查节点是否已失败
   * @param {string} nodeId - 节点ID
   * @returns {boolean} 是否已失败
   */
  isFailed(nodeId) {
    const frame = this.frames.get(nodeId);
    return frame?.status === 'failed';
  }

  /**
   * 检查节点是否正在执行
   * @param {string} nodeId - 节点ID
   * @returns {boolean} 是否正在执行
   */
  isRunning(nodeId) {
    const frame = this.frames.get(nodeId);
    return frame?.status === 'running';
  }

  /**
   * 获取已完成的节点集合
   * @returns {Set<string>} 已完成的节点ID集合
   */
  getCompletedNodes() {
    const completed = new Set();
    for (const [nodeId, frame] of this.frames.entries()) {
      if (frame.status === 'completed') {
        completed.add(nodeId);
      }
    }
    return completed;
  }

  /**
   * 获取已失败的节点集合
   * @returns {Set<string>} 已失败的节点ID集合
   */
  getFailedNodes() {
    const failed = new Set();
    for (const [nodeId, frame] of this.frames.entries()) {
      if (frame.status === 'failed') {
        failed.add(nodeId);
      }
    }
    return failed;
  }

  /**
   * 获取执行进度
   * @param {number} totalNodes - 总节点数
   * @returns {Object} 执行进度信息
   */
  getProgress(totalNodes) {
    const completed = this.getCompletedNodes().size;
    const failed = this.getFailedNodes().size;
    const total = completed + failed;

    return {
      total,
      totalNodes,
      completed,
      failed,
      pending: totalNodes - total,
      progress: totalNodes > 0 ? (total / totalNodes) * 100 : 0
    };
  }

  /**
   * 转换为JSON
   * @returns {Object} JSON对象
   */
  toJSON() {
    return {
      frames: Array.from(this.frames.entries()).map(([nodeId, frame]) => ({
        nodeId,
        ...frame
      })),
      executionOrder: this.executionOrder
    };
  }

  /**
   * 从JSON创建执行栈
   * @param {Object} json - JSON对象
   * @returns {ExecutionStack} 执行栈
   */
  static fromJSON(json) {
    const stack = new ExecutionStack();
    
    for (const frameData of json.frames || []) {
      const frame = new ExecutionStackFrame(
        frameData.nodeId,
        frameData.status,
        frameData.output,
        frameData.error
      );
      frame.timestamp = frameData.timestamp;
      stack.frames.set(frameData.nodeId, frame);
    }

    stack.executionOrder = json.executionOrder || [];
    return stack;
  }

  /**
   * 清空执行栈
   */
  clear() {
    this.frames.clear();
    this.executionOrder = [];
  }
}

/**
 * 部分执行管理器
 */
export class PartialExecutionManager {
  /**
   * 构造函数
   * @param {DirectedGraph} graph - 有向图
   */
  constructor(graph) {
    this.graph = graph;
    this.executionStack = new ExecutionStack();
  }

  /**
   * 提取子图（从目标节点及其所有依赖）
   * @param {string} targetNodeId - 目标节点ID
   * @returns {DirectedGraph} 子图
   */
  extractSubgraph(targetNodeId) {
    const subgraph = new DirectedGraph();
    const visited = new Set();

    // 收集所有相关节点（目标节点及其所有依赖）
    const collectNodes = (nodeId) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = this.graph.getNode(nodeId);
      if (!node) return;

      // 添加节点到子图
      subgraph.addNode(nodeId, node.data);

      // 递归收集依赖节点
      for (const dep of node.getDependencies()) {
        collectNodes(dep.id);
      }
    };

    collectNodes(targetNodeId);

    // 添加边
    for (const nodeId of visited) {
      const node = this.graph.getNode(nodeId);
      if (!node) continue;

      for (const dependent of node.getDependents()) {
        if (visited.has(dependent.id)) {
          subgraph.addEdge(nodeId, dependent.id);
        }
      }
    }

    return subgraph;
  }

  /**
   * 提取剩余子图（从指定节点开始，包括所有未完成的节点及其依赖）
   * @param {string} startNodeId - 起始节点ID
   * @returns {DirectedGraph} 剩余子图
   */
  extractRemainingSubgraph(startNodeId) {
    const subgraph = new DirectedGraph();
    const visited = new Set();
    const completedNodes = this.executionStack.getCompletedNodes();

    // 收集从 startNodeId 开始的所有相关节点
    const collectNodes = (nodeId) => {
      if (visited.has(nodeId)) return;

      visited.add(nodeId);

      const node = this.graph.getNode(nodeId);
      if (!node) return;

      // 添加节点到子图
      subgraph.addNode(nodeId, node.data);

      // 收集依赖该节点的所有下游节点
      for (const dependent of node.getDependents()) {
        collectNodes(dependent.id);
      }

      // 收集该节点的所有上游依赖
      for (const dep of node.getDependencies()) {
        collectNodes(dep.id);
      }
    };

    collectNodes(startNodeId);

    // 添加边
    for (const nodeId of visited) {
      const node = this.graph.getNode(nodeId);
      if (!node) continue;

      for (const dependent of node.getDependents()) {
        if (visited.has(dependent.id)) {
          subgraph.addEdge(nodeId, dependent.id);
        }
      }
    }

    return subgraph;
  }

  /**
   * 重建执行栈（从已保存的执行历史）
   * @param {Object} executionHistory - 执行历史
   */
  rebuildExecutionStack(executionHistory) {
    this.executionStack = ExecutionStack.fromJSON(executionHistory);
  }

  /**
   * 保存执行栈
   * @returns {Object} 执行历史
   */
  saveExecutionStack() {
    return this.executionStack.toJSON();
  }

  /**
   * 获取可执行的节点（考虑已完成的节点）
   * @returns {string[]} 可执行的节点ID列表
   */
  getNextExecutableNodes() {
    const completedNodes = this.executionStack.getCompletedNodes();
    return this.graph.getNextExecutableNodes(completedNodes);
  }

  /**
   * 检查是否可以从指定节点开始执行
   * @param {string} startNodeId - 起始节点ID
   * @returns {boolean} 是否可以开始执行
   */
  canStartFrom(startNodeId) {
    const completedNodes = this.executionStack.getCompletedNodes();
    return this.graph.canExecute(startNodeId, completedNodes);
  }

  /**
   * 标记节点为正在执行
   * @param {string} nodeId - 节点ID
   */
  markRunning(nodeId) {
    if (!this.executionStack.get(nodeId)) {
      this.executionStack.push(nodeId, 'running');
    } else {
      this.executionStack.update(nodeId, 'running');
    }
  }

  /**
   * 标记节点为已完成
   * @param {string} nodeId - 节点ID
   * @param {*} output - 执行输出
   */
  markCompleted(nodeId, output) {
    if (!this.executionStack.get(nodeId)) {
      this.executionStack.push(nodeId, 'completed', output);
    } else {
      this.executionStack.update(nodeId, 'completed', output);
    }
  }

  /**
   * 标记节点为失败
   * @param {string} nodeId - 节点ID
   * @param {Error} error - 错误信息
   */
  markFailed(nodeId, error) {
    if (!this.executionStack.get(nodeId)) {
      this.executionStack.push(nodeId, 'failed', null, error);
    } else {
      this.executionStack.update(nodeId, 'failed', null, error);
    }
  }

  /**
   * 获取节点执行结果
   * @param {string} nodeId - 节点ID
   * @returns {*} 执行结果
   */
  getNodeOutput(nodeId) {
    const frame = this.executionStack.get(nodeId);
    return frame?.output ?? null;
  }

  /**
   * 获取执行进度
   * @returns {Object} 执行进度信息
   */
  getProgress() {
    return this.executionStack.getProgress(this.graph.size());
  }

  /**
   * 检查节点是否已完成
   * @param {string} nodeId - 节点ID
   * @returns {boolean} 是否已完成
   */
  isCompleted(nodeId) {
    return this.executionStack.isCompleted(nodeId);
  }

  /**
   * 检查节点是否已失败
   * @param {string} nodeId - 节点ID
   * @returns {boolean} 是否已失败
   */
  isFailed(nodeId) {
    return this.executionStack.isFailed(nodeId);
  }

  /**
   * 检查节点是否正在执行
   * @param {string} nodeId - 节点ID
   * @returns {boolean} 是否正在执行
   */
  isRunning(nodeId) {
    return this.executionStack.isRunning(nodeId);
  }

  /**
   * 检查执行是否完成
   * @returns {boolean} 是否完成
   */
  isExecutionComplete() {
    const progress = this.getProgress();
    return progress.pending === 0 && progress.failed === 0;
  }

  /**
   * 检查执行是否失败
   * @returns {boolean} 是否失败
   */
  isExecutionFailed() {
    return this.executionStack.getFailedNodes().size > 0;
  }

  /**
   * 重置执行状态
   */
  reset() {
    this.executionStack.clear();
  }
}
