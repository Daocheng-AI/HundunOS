// hundunos/kernel/pipeline/partial-execution.test.js
// 部分执行能力单元测试

import { describe, it, expect, beforeEach } from 'vitest';
import { DirectedGraph } from './graph/directed-graph.js';
import {
  ExecutionStack,
  ExecutionStackFrame,
  PartialExecutionManager
} from './partial-execution.js';

describe('ExecutionStackFrame', () => {
  it('should create a stack frame', () => {
    const frame = new ExecutionStackFrame('node1', 'completed', { result: 'test' });

    expect(frame.nodeId).toBe('node1');
    expect(frame.status).toBe('completed');
    expect(frame.output).toEqual({ result: 'test' });
    expect(frame.error).toBeNull();
    expect(frame.timestamp).toBeDefined();
  });
});

describe('ExecutionStack', () => {
  let stack;

  beforeEach(() => {
    stack = new ExecutionStack();
  });

  describe('push', () => {
    it('should add a frame to the stack', () => {
      stack.push('node1', 'pending');
      const frame = stack.get('node1');

      expect(frame).toBeDefined();
      expect(frame.nodeId).toBe('node1');
      expect(frame.status).toBe('pending');
    });

    it('should add completed node to execution order', () => {
      stack.push('node1', 'completed', { result: 'test' });
      expect(stack.executionOrder).toContain('node1');
    });

    it('should add failed node to execution order', () => {
      stack.push('node1', 'failed', null, new Error('test error'));
      expect(stack.executionOrder).toContain('node1');
    });

    it('should not add pending node to execution order', () => {
      stack.push('node1', 'pending');
      expect(stack.executionOrder).not.toContain('node1');
    });
  });

  describe('update', () => {
    it('should update an existing frame', () => {
      stack.push('node1', 'pending');
      stack.update('node1', 'completed', { result: 'test' });

      const frame = stack.get('node1');
      expect(frame.status).toBe('completed');
      expect(frame.output).toEqual({ result: 'test' });
    });

    it('should add completed node to execution order on update', () => {
      stack.push('node1', 'pending');
      stack.update('node1', 'completed');

      expect(stack.executionOrder).toContain('node1');
    });
  });

  describe('isCompleted', () => {
    it('should return true for completed node', () => {
      stack.push('node1', 'completed');
      expect(stack.isCompleted('node1')).toBe(true);
    });

    it('should return false for non-completed node', () => {
      stack.push('node1', 'pending');
      expect(stack.isCompleted('node1')).toBe(false);
    });

    it('should return false for non-existent node', () => {
      expect(stack.isCompleted('nonexistent')).toBe(false);
    });
  });

  describe('isFailed', () => {
    it('should return true for failed node', () => {
      stack.push('node1', 'failed', null, new Error('test'));
      expect(stack.isFailed('node1')).toBe(true);
    });

    it('should return false for non-failed node', () => {
      stack.push('node1', 'pending');
      expect(stack.isFailed('node1')).toBe(false);
    });
  });

  describe('isRunning', () => {
    it('should return true for running node', () => {
      stack.push('node1', 'running');
      expect(stack.isRunning('node1')).toBe(true);
    });

    it('should return false for non-running node', () => {
      stack.push('node1', 'pending');
      expect(stack.isRunning('node1')).toBe(false);
    });
  });

  describe('getCompletedNodes', () => {
    it('should return set of completed nodes', () => {
      stack.push('node1', 'completed');
      stack.push('node2', 'completed');
      stack.push('node3', 'pending');

      const completed = stack.getCompletedNodes();
      expect(completed.has('node1')).toBe(true);
      expect(completed.has('node2')).toBe(true);
      expect(completed.has('node3')).toBe(false);
    });
  });

  describe('getFailedNodes', () => {
    it('should return set of failed nodes', () => {
      stack.push('node1', 'failed');
      stack.push('node2', 'failed');
      stack.push('node3', 'pending');

      const failed = stack.getFailedNodes();
      expect(failed.has('node1')).toBe(true);
      expect(failed.has('node2')).toBe(true);
      expect(failed.has('node3')).toBe(false);
    });
  });

  describe('getProgress', () => {
    it('should calculate progress correctly', () => {
      stack.push('node1', 'completed');
      stack.push('node2', 'completed');
      stack.push('node3', 'failed');
      stack.push('node4', 'pending');

      const progress = stack.getProgress(5);
      expect(progress.total).toBe(3);
      expect(progress.totalNodes).toBe(5);
      expect(progress.completed).toBe(2);
      expect(progress.failed).toBe(1);
      expect(progress.pending).toBe(2);
      expect(progress.progress).toBe(60);
    });
  });

  describe('toJSON', () => {
    it('should serialize stack to JSON', () => {
      stack.push('node1', 'completed', { result: 'test' });

      const json = stack.toJSON();
      expect(json.frames).toHaveLength(1);
      expect(json.frames[0].nodeId).toBe('node1');
      expect(json.frames[0].status).toBe('completed');
      expect(json.frames[0].output).toEqual({ result: 'test' });
    });
  });

  describe('fromJSON', () => {
    it('should deserialize stack from JSON', () => {
      const json = {
        frames: [
          {
            nodeId: 'node1',
            status: 'completed',
            output: { result: 'test' },
            error: null,
            timestamp: '2024-01-01T00:00:00.000Z'
          }
        ],
        executionOrder: ['node1']
      };

      const stack = ExecutionStack.fromJSON(json);
      expect(stack.get('node1')).toBeDefined();
      expect(stack.isCompleted('node1')).toBe(true);
      expect(stack.executionOrder).toEqual(['node1']);
    });
  });
});

describe('PartialExecutionManager', () => {
  let graph;
  let manager;

  beforeEach(() => {
    graph = new DirectedGraph();
    graph.addNode('node1', { name: 'Node 1' });
    graph.addNode('node2', { name: 'Node 2' });
    graph.addNode('node3', { name: 'Node 3' });
    graph.addNode('node4', { name: 'Node 4' });
    graph.addEdge('node1', 'node2');
    graph.addEdge('node2', 'node3');
    graph.addEdge('node1', 'node4');

    manager = new PartialExecutionManager(graph);
  });

  describe('extractSubgraph', () => {
    it('should extract subgraph with target node and dependencies', () => {
      const subgraph = manager.extractSubgraph('node3');

      expect(subgraph.size()).toBe(3);
      expect(subgraph.getNode('node1')).toBeDefined();
      expect(subgraph.getNode('node2')).toBeDefined();
      expect(subgraph.getNode('node3')).toBeDefined();
      expect(subgraph.getNode('node4')).toBeUndefined();
    });

    it('should preserve edges in subgraph', () => {
      const subgraph = manager.extractSubgraph('node3');

      const node1 = subgraph.getNode('node1');
      const node2 = subgraph.getNode('node2');
      const node3 = subgraph.getNode('node3');

      expect(node1.outgoing.has(node2)).toBe(true);
      expect(node2.outgoing.has(node3)).toBe(true);
    });

    it('should handle single node subgraph', () => {
      const subgraph = manager.extractSubgraph('node1');

      expect(subgraph.size()).toBe(1);
      expect(subgraph.getNode('node1')).toBeDefined();
    });
  });

  describe('extractRemainingSubgraph', () => {
    it('should extract remaining nodes after some are completed', () => {
      // 标记 node1 为已完成
      manager.markCompleted('node1', { result: 'test' });

      const remaining = manager.extractRemainingSubgraph('node2');

      expect(remaining.size()).toBe(4); // node1, node2, node3, node4
      expect(remaining.getNode('node1')).toBeDefined(); // 已完成的节点仍然包含（因为可能需要其输出）
      expect(remaining.getNode('node2')).toBeDefined();
      expect(remaining.getNode('node3')).toBeDefined();
      expect(remaining.getNode('node4')).toBeDefined();
    });

    it('should skip completed nodes when getting executable nodes', () => {
      manager.markCompleted('node1', { result: 'test' });
      manager.markCompleted('node4', { result: 'test' });

      const executable = manager.getNextExecutableNodes();
      expect(executable).toContain('node2');
      expect(executable).not.toContain('node1');
      expect(executable).not.toContain('node4');
    });
  });

  describe('rebuildExecutionStack', () => {
    it('should rebuild execution stack from history', () => {
      const history = {
        frames: [
          {
            nodeId: 'node1',
            status: 'completed',
            output: { result: 'test' },
            error: null,
            timestamp: '2024-01-01T00:00:00.000Z'
          },
          {
            nodeId: 'node2',
            status: 'running',
            output: null,
            error: null,
            timestamp: '2024-01-01T00:00:01.000Z'
          }
        ],
        executionOrder: ['node1']
      };

      manager.rebuildExecutionStack(history);

      expect(manager.isCompleted('node1')).toBe(true);
      expect(manager.isRunning('node2')).toBe(true);
      expect(manager.executionStack.executionOrder).toEqual(['node1']);
    });
  });

  describe('saveExecutionStack', () => {
    it('should save execution stack to history', () => {
      manager.markCompleted('node1', { result: 'test' });
      manager.markRunning('node2');

      const history = manager.saveExecutionStack();

      expect(history.frames).toHaveLength(2);
      expect(history.executionOrder).toContain('node1');
    });
  });

  describe('canStartFrom', () => {
    it('should return true if all dependencies are met', () => {
      manager.markCompleted('node1', { result: 'test' });

      expect(manager.canStartFrom('node2')).toBe(true);
      expect(manager.canStartFrom('node3')).toBe(false);
    });

    it('should return true for node with no dependencies', () => {
      expect(manager.canStartFrom('node1')).toBe(true);
    });
  });

  describe('markRunning', () => {
    it('should mark node as running', () => {
      manager.markRunning('node1');

      expect(manager.isRunning('node1')).toBe(true);
    });
  });

  describe('markCompleted', () => {
    it('should mark node as completed', () => {
      manager.markCompleted('node1', { result: 'test' });

      expect(manager.isCompleted('node1')).toBe(true);
      expect(manager.getNodeOutput('node1')).toEqual({ result: 'test' });
    });
  });

  describe('markFailed', () => {
    it('should mark node as failed', () => {
      const error = new Error('test error');
      manager.markFailed('node1', error);

      expect(manager.isFailed('node1')).toBe(true);
    });
  });

  describe('getNodeOutput', () => {
    it('should return output for completed node', () => {
      const output = { result: 'test' };
      manager.markCompleted('node1', output);

      expect(manager.getNodeOutput('node1')).toEqual(output);
    });

    it('should return null for non-completed node', () => {
      expect(manager.getNodeOutput('node1')).toBeNull();
    });
  });

  describe('getProgress', () => {
    it('should calculate execution progress', () => {
      manager.markCompleted('node1', { result: 'test' });
      manager.markCompleted('node4', { result: 'test' });
      manager.markFailed('node2', new Error('test'));

      const progress = manager.getProgress();

      expect(progress.total).toBe(3);
      expect(progress.totalNodes).toBe(4);
      expect(progress.completed).toBe(2);
      expect(progress.failed).toBe(1);
      expect(progress.pending).toBe(1);
    });
  });

  describe('isExecutionComplete', () => {
    it('should return true when all nodes are completed', () => {
      manager.markCompleted('node1', { result: 'test' });
      manager.markCompleted('node2', { result: 'test' });
      manager.markCompleted('node3', { result: 'test' });
      manager.markCompleted('node4', { result: 'test' });

      expect(manager.isExecutionComplete()).toBe(true);
    });

    it('should return false when some nodes are pending', () => {
      manager.markCompleted('node1', { result: 'test' });
      manager.markCompleted('node2', { result: 'test' });

      expect(manager.isExecutionComplete()).toBe(false);
    });

    it('should return false when some nodes have failed', () => {
      manager.markCompleted('node1', { result: 'test' });
      manager.markFailed('node2', new Error('test'));
      manager.markCompleted('node3', { result: 'test' });
      manager.markCompleted('node4', { result: 'test' });

      expect(manager.isExecutionComplete()).toBe(false);
    });
  });

  describe('isExecutionFailed', () => {
    it('should return true when any node has failed', () => {
      manager.markCompleted('node1', { result: 'test' });
      manager.markFailed('node2', new Error('test'));

      expect(manager.isExecutionFailed()).toBe(true);
    });

    it('should return false when no nodes have failed', () => {
      manager.markCompleted('node1', { result: 'test' });
      manager.markCompleted('node2', { result: 'test' });

      expect(manager.isExecutionFailed()).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset execution state', () => {
      manager.markCompleted('node1', { result: 'test' });
      manager.markRunning('node2');

      manager.reset();

      expect(manager.getProgress().total).toBe(0);
    });
  });
});
