// hundunos/kernel/pipeline/graph/directed-graph.test.js
// 有向图单元测试

import { describe, it, expect, beforeEach } from 'vitest';
import { DirectedGraph, GraphNode } from './directed-graph.js';

describe('DirectedGraph', () => {
  let graph;

  beforeEach(() => {
    graph = new DirectedGraph();
  });

  describe('addNode', () => {
    it('should add a new node', () => {
      const node = graph.addNode('node1', { data: 'test' });

      expect(node).toBeInstanceOf(GraphNode);
      expect(node.id).toBe('node1');
      expect(node.data).toEqual({ data: 'test' });
      expect(graph.size()).toBe(1);
    });

    it('should return existing node if id already exists', () => {
      const node1 = graph.addNode('node1', { data: 'test1' });
      const node2 = graph.addNode('node1', { data: 'test2' });

      expect(node1).toBe(node2);
      expect(node1.data).toEqual({ data: 'test1' });
      expect(graph.size()).toBe(1);
    });
  });

  describe('getNode', () => {
    it('should return node by id', () => {
      graph.addNode('node1', { data: 'test' });
      const node = graph.getNode('node1');

      expect(node).toBeDefined();
      expect(node.id).toBe('node1');
    });

    it('should return undefined for non-existent node', () => {
      const node = graph.getNode('nonexistent');
      expect(node).toBeUndefined();
    });
  });

  describe('addEdge', () => {
    it('should add an edge between nodes', () => {
      graph.addNode('node1');
      graph.addNode('node2');
      graph.addEdge('node1', 'node2');

      const node1 = graph.getNode('node1');
      const node2 = graph.getNode('node2');

      expect(node1.outgoing.has(node2)).toBe(true);
      expect(node2.incoming.has(node1)).toBe(true);
    });

    it('should throw error if nodes do not exist', () => {
      expect(() => graph.addEdge('node1', 'node2')).toThrow();
    });
  });

  describe('detectCycle', () => {
    it('should return null for DAG', () => {
      graph.addNode('node1');
      graph.addNode('node2');
      graph.addNode('node3');
      graph.addEdge('node1', 'node2');
      graph.addEdge('node2', 'node3');

      const cycle = graph.detectCycle();
      expect(cycle).toBeNull();
    });

    it('should detect cycle', () => {
      graph.addNode('node1');
      graph.addNode('node2');
      graph.addNode('node3');
      graph.addEdge('node1', 'node2');
      graph.addEdge('node2', 'node3');
      graph.addEdge('node3', 'node1');

      const cycle = graph.detectCycle();
      expect(cycle).toContain('Cycle detected');
    });

    it('should detect self-loop', () => {
      graph.addNode('node1');
      graph.addEdge('node1', 'node1');

      const cycle = graph.detectCycle();
      expect(cycle).toContain('Cycle detected');
    });
  });

  describe('topologicalSort', () => {
    it('should return empty array for empty graph', () => {
      const sorted = graph.topologicalSort();
      expect(sorted).toEqual([]);
    });

    it('should return single node for graph with one node', () => {
      graph.addNode('node1');
      const sorted = graph.topologicalSort();
      expect(sorted).toEqual(['node1']);
    });

    it('should sort nodes in dependency order', () => {
      graph.addNode('node1');
      graph.addNode('node2');
      graph.addNode('node3');
      graph.addEdge('node1', 'node2');
      graph.addEdge('node2', 'node3');

      const sorted = graph.topologicalSort();
      expect(sorted.indexOf('node1')).toBeLessThan(sorted.indexOf('node2'));
      expect(sorted.indexOf('node2')).toBeLessThan(sorted.indexOf('node3'));
    });

    it('should throw error for graph with cycle', () => {
      graph.addNode('node1');
      graph.addNode('node2');
      graph.addEdge('node1', 'node2');
      graph.addEdge('node2', 'node1');

      expect(() => graph.topologicalSort()).toThrow();
    });

    it('should handle multiple independent nodes', () => {
      graph.addNode('node1');
      graph.addNode('node2');
      graph.addNode('node3');
      graph.addEdge('node1', 'node3');

      const sorted = graph.topologicalSort();
      expect(sorted).toContain('node1');
      expect(sorted).toContain('node2');
      expect(sorted).toContain('node3');
      expect(sorted.indexOf('node1')).toBeLessThan(sorted.indexOf('node3'));
    });
  });

  describe('getParallelGroups', () => {
    it('should return groups for linear chain', () => {
      graph.addNode('node1');
      graph.addNode('node2');
      graph.addNode('node3');
      graph.addEdge('node1', 'node2');
      graph.addEdge('node2', 'node3');

      const groups = graph.getParallelGroups();
      expect(groups).toEqual([['node1'], ['node2'], ['node3']]);
    });

    it('should return groups for parallel nodes', () => {
      graph.addNode('node1');
      graph.addNode('node2');
      graph.addNode('node3');
      graph.addEdge('node1', 'node2');
      graph.addEdge('node1', 'node3');

      const groups = graph.getParallelGroups();
      expect(groups.length).toBe(2);
      expect(groups[0]).toContain('node1');
      expect(groups[1]).toContain('node2');
      expect(groups[1]).toContain('node3');
    });

    it('should handle complex graph', () => {
      graph.addNode('node1');
      graph.addNode('node2');
      graph.addNode('node3');
      graph.addNode('node4');
      graph.addEdge('node1', 'node2');
      graph.addEdge('node1', 'node3');
      graph.addEdge('node2', 'node4');
      graph.addEdge('node3', 'node4');

      const groups = graph.getParallelGroups();
      expect(groups.length).toBe(3);
      expect(groups[0]).toContain('node1');
      expect(groups[1]).toContain('node2');
      expect(groups[1]).toContain('node3');
      expect(groups[2]).toContain('node4');
    });
  });

  describe('canExecute', () => {
    it('should return true for node with no dependencies', () => {
      graph.addNode('node1');
      const canExecute = graph.canExecute('node1', new Set());
      expect(canExecute).toBe(true);
    });

    it('should return false for node with unmet dependencies', () => {
      graph.addNode('node1');
      graph.addNode('node2');
      graph.addEdge('node1', 'node2');

      const canExecute = graph.canExecute('node2', new Set());
      expect(canExecute).toBe(false);
    });

    it('should return true for node with met dependencies', () => {
      graph.addNode('node1');
      graph.addNode('node2');
      graph.addEdge('node1', 'node2');

      const canExecute = graph.canExecute('node2', new Set(['node1']));
      expect(canExecute).toBe(true);
    });
  });

  describe('getNextExecutableNodes', () => {
    it('should return nodes with no dependencies', () => {
      graph.addNode('node1');
      graph.addNode('node2');
      graph.addEdge('node1', 'node2');

      const executable = graph.getNextExecutableNodes(new Set());
      expect(executable).toEqual(['node1']);
    });

    it('should return nodes whose dependencies are met', () => {
      graph.addNode('node1');
      graph.addNode('node2');
      graph.addNode('node3');
      graph.addEdge('node1', 'node2');
      graph.addEdge('node1', 'node3');

      const executable = graph.getNextExecutableNodes(new Set(['node1']));
      expect(executable).toContain('node2');
      expect(executable).toContain('node3');
    });

    it('should not return completed nodes', () => {
      graph.addNode('node1');
      graph.addNode('node2');
      graph.addEdge('node1', 'node2');

      const executable = graph.getNextExecutableNodes(new Set(['node1', 'node2']));
      expect(executable).toEqual([]);
    });
  });

  describe('toJSON', () => {
    it('should serialize graph to JSON', () => {
      graph.addNode('node1', { data: 'test1' });
      graph.addNode('node2', { data: 'test2' });
      graph.addEdge('node1', 'node2');

      const json = graph.toJSON();
      expect(json.nodes).toEqual({
        node1: { data: 'test1' },
        node2: { data: 'test2' }
      });
      expect(json.edges).toEqual([{ from: 'node1', to: 'node2' }]);
    });
  });

  describe('fromJSON', () => {
    it('should deserialize graph from JSON', () => {
      const json = {
        nodes: {
          node1: { data: 'test1' },
          node2: { data: 'test2' }
        },
        edges: [{ from: 'node1', to: 'node2' }]
      };

      const newGraph = DirectedGraph.fromJSON(json);
      expect(newGraph.size()).toBe(2);
      expect(newGraph.getNode('node1')).toBeDefined();
      expect(newGraph.getNode('node2')).toBeDefined();

      const node1 = newGraph.getNode('node1');
      const node2 = newGraph.getNode('node2');
      expect(node1.outgoing.has(node2)).toBe(true);
    });
  });
});
