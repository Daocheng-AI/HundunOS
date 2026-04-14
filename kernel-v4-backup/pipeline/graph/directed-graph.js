// hundunos/kernel/pipeline/graph/directed-graph.js
// 有向图实现

/**
 * 有向图节点
 */
export class GraphNode {
  /**
   * 构造函数
   * @param {string} id - 节点ID
   * @param {*} data - 节点数据
   */
  constructor(id, data = null) {
    this.id = id;
    this.data = data;
    this.incoming = new Set(); // 入边
    this.outgoing = new Set(); // 出边
  }

  /**
   * 添加出边
   * @param {GraphNode} node - 目标节点
   */
  addOutgoing(node) {
    this.outgoing.add(node);
    node.incoming.add(this);
  }

  /**
   * 移除出边
   * @param {GraphNode} node - 目标节点
   */
  removeOutgoing(node) {
    this.outgoing.delete(node);
    node.incoming.delete(this);
  }

  /**
   * 获取所有依赖节点
   * @returns {GraphNode[]} 依赖节点列表
   */
  getDependencies() {
    return Array.from(this.incoming);
  }

  /**
   * 获取所有依赖节点
   * @returns {GraphNode[]} 依赖节点列表
   */
  getDependents() {
    return Array.from(this.outgoing);
  }
}

/**
 * 有向图类
 */
export class DirectedGraph {
  /**
   * 构造函数
   */
  constructor() {
    this.nodes = new Map(); // id -> GraphNode
  }

  /**
   * 添加节点
   * @param {string} id - 节点ID
   * @param {*} data - 节点数据
   * @returns {GraphNode} 新节点
   */
  addNode(id, data = null) {
    if (this.nodes.has(id)) {
      return this.nodes.get(id);
    }

    const node = new GraphNode(id, data);
    this.nodes.set(id, node);
    return node;
  }

  /**
   * 获取节点
   * @param {string} id - 节点ID
   * @returns {GraphNode|undefined} 节点
   */
  getNode(id) {
    return this.nodes.get(id);
  }

  /**
   * 添加边
   * @param {string} fromId - 源节点ID
   * @param {string} toId - 目标节点ID
   */
  addEdge(fromId, toId) {
    const fromNode = this.getNode(fromId);
    const toNode = this.getNode(toId);

    if (!fromNode || !toNode) {
      throw new Error(`Cannot add edge: node not found (${fromId} -> ${toId})`);
    }

    fromNode.addOutgoing(toNode);
  }

  /**
   * 移除边
   * @param {string} fromId - 源节点ID
   * @param {string} toId - 目标节点ID
   */
  removeEdge(fromId, toId) {
    const fromNode = this.getNode(fromId);
    const toNode = this.getNode(toId);

    if (fromNode && toNode) {
      fromNode.removeOutgoing(toNode);
    }
  }

  /**
   * 检测循环依赖
   * @returns {string[]|null} 循环路径，如果没有循环返回 null
   */
  detectCycle() {
    const visited = new Set();
    const recursionStack = new Set();
    const path = [];

    const dfs = (nodeId) => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const node = this.getNode(nodeId);
      if (!node) return false;

      for (const dependent of node.getDependents()) {
        if (!visited.has(dependent.id)) {
          if (dfs(dependent.id)) {
            return true;
          }
        } else if (recursionStack.has(dependent.id)) {
          // 找到循环
          const cycleStart = path.indexOf(dependent.id);
          const cyclePath = path.slice(cycleStart);
          cyclePath.push(dependent.id);
          throw new Error(`Cycle detected: ${cyclePath.join(' -> ')}`);
        }
      }

      path.pop();
      recursionStack.delete(nodeId);
      return false;
    };

    try {
      for (const nodeId of this.nodes.keys()) {
        if (!visited.has(nodeId)) {
          dfs(nodeId);
        }
      }
      return null;
    } catch (error) {
      if (error.message.includes('Cycle detected')) {
        return error.message;
      }
      throw error;
    }
  }

  /**
   * 拓扑排序
   * @returns {string[]} 节点ID列表（按依赖顺序）
   */
  topologicalSort() {
    // 检测循环
    const cycle = this.detectCycle();
    if (cycle) {
      throw new Error(cycle);
    }

    const inDegree = new Map();
    const queue = [];
    const result = [];

    // 初始化入度
    for (const [id, node] of this.nodes.entries()) {
      inDegree.set(id, node.incoming.size);
      if (node.incoming.size === 0) {
        queue.push(id);
      }
    }

    // 拓扑排序
    while (queue.length > 0) {
      // 按ID排序以保证确定性
      queue.sort();

      const nodeId = queue.shift();
      result.push(nodeId);

      const node = this.getNode(nodeId);
      if (!node) continue;

      for (const dependent of node.getDependents()) {
        const newDegree = inDegree.get(dependent.id) - 1;
        inDegree.set(dependent.id, newDegree);

        if (newDegree === 0) {
          queue.push(dependent.id);
        }
      }
    }

    // 检查是否所有节点都已处理
    if (result.length !== this.nodes.size) {
      throw new Error('Graph has a cycle');
    }

    return result;
  }

  /**
   * 获取可并行执行的节点组
   * @returns {string[][]} 节点组列表，每组中的节点可以并行执行
   */
  getParallelGroups() {
    const sorted = this.topologicalSort();
    const groups = [];
    const currentGroup = [];
    const currentGroupDependencies = new Set();

    for (const nodeId of sorted) {
      const node = this.getNode(nodeId);
      if (!node) continue;

      const nodeDependencies = new Set(node.getDependencies().map(n => n.id));

      // 检查是否可以加入当前组
      const canAddToCurrentGroup = [...nodeDependencies].every(
        depId => !currentGroupDependencies.has(depId)
      );

      if (canAddToCurrentGroup || currentGroup.length === 0) {
        currentGroup.push(nodeId);
        currentGroupDependencies.add(nodeId);
      } else {
        // 开始新组
        groups.push([...currentGroup]);
        currentGroup.length = 0;
        currentGroupDependencies.clear();
        currentGroup.push(nodeId);
        currentGroupDependencies.add(nodeId);
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * 获取节点的所有依赖（包括传递依赖）
   * @param {string} nodeId - 节点ID
   * @returns {string[]} 依赖节点ID列表
   */
  getAllDependencies(nodeId) {
    const dependencies = new Set();
    const visited = new Set();

    const collect = (id) => {
      if (visited.has(id)) return;
      visited.add(id);

      const node = this.getNode(id);
      if (!node) return;

      for (const dep of node.getDependencies()) {
        dependencies.add(dep.id);
        collect(dep.id);
      }
    };

    collect(nodeId);
    return Array.from(dependencies);
  }

  /**
   * 获取依赖某个节点的所有节点（包括传递依赖）
   * @param {string} nodeId - 节点ID
   * @returns {string[]} 依赖节点ID列表
   */
  getAllDependents(nodeId) {
    const dependents = new Set();
    const visited = new Set();

    const collect = (id) => {
      if (visited.has(id)) return;
      visited.add(id);

      const node = this.getNode(id);
      if (!node) return;

      for (const dep of node.getDependents()) {
        dependents.add(dep.id);
        collect(dep.id);
      }
    };

    collect(nodeId);
    return Array.from(dependents);
  }

  /**
   * 检查节点是否可以执行（所有依赖都已满足）
   * @param {string} nodeId - 节点ID
   * @param {Set<string>} completedNodes - 已完成的节点ID集合
   * @returns {boolean} 是否可以执行
   */
  canExecute(nodeId, completedNodes) {
    const node = this.getNode(nodeId);
    if (!node) return false;

    const dependencies = node.getDependencies();
    return dependencies.every(dep => completedNodes.has(dep.id));
  }

  /**
   * 获取下一个可执行的节点
   * @param {Set<string>} completedNodes - 已完成的节点ID集合
   * @returns {string[]} 可执行的节点ID列表
   */
  getNextExecutableNodes(completedNodes) {
    const executable = [];

    for (const [id, node] of this.nodes.entries()) {
      if (!completedNodes.has(id) && this.canExecute(id, completedNodes)) {
        executable.push(id);
      }
    }

    return executable;
  }

  /**
   * 清空图
   */
  clear() {
    this.nodes.clear();
  }

  /**
   * 获取节点数量
   * @returns {number} 节点数量
   */
  size() {
    return this.nodes.size;
  }

  /**
   * 获取所有节点ID
   * @returns {string[]} 节点ID列表
   */
  getNodeIds() {
    return Array.from(this.nodes.keys());
  }

  /**
   * 转换为JSON
   * @returns {Object} JSON对象
   */
  toJSON() {
    const nodes = {};
    const edges = [];

    for (const [id, node] of this.nodes.entries()) {
      nodes[id] = node.data;

      for (const dependent of node.getDependents()) {
        edges.push({ from: id, to: dependent.id });
      }
    }

    return { nodes, edges };
  }

  /**
   * 从JSON创建图
   * @param {Object} json - JSON对象
   * @returns {DirectedGraph} 有向图
   */
  static fromJSON(json) {
    const graph = new DirectedGraph();

    // 添加节点
    for (const [id, data] of Object.entries(json.nodes || {})) {
      graph.addNode(id, data);
    }

    // 添加边
    for (const edge of json.edges || []) {
      graph.addEdge(edge.from, edge.to);
    }

    return graph;
  }
}
