/**
 * Agent SDK - Binary Data 管理测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BinaryMetadata,
  BinaryData,
  StorageBackend,
  FileSystemStorage,
  MemoryStorage,
  BinaryDataManager,
  createBinaryDataManager,
  createFileSystemStorage,
  createMemoryStorage
} from './binary-data.js';

describe('BinaryMetadata', () => {
  it('should create metadata with default values', () => {
    const metadata = new BinaryMetadata();
    
    expect(metadata.id).toBeDefined();
    expect(metadata.fileName).toBe('');
    expect(metadata.mimeType).toBe('application/octet-stream');
    expect(metadata.size).toBe(0);
    expect(metadata.tags).toEqual([]);
    expect(metadata.customData).toEqual({});
  });

  it('should create metadata with custom values', () => {
    const metadata = new BinaryMetadata({
      fileName: 'test.txt',
      mimeType: 'text/plain',
      size: 100,
      tags: ['tag1', 'tag2'],
      customData: { key: 'value' }
    });
    
    expect(metadata.fileName).toBe('test.txt');
    expect(metadata.mimeType).toBe('text/plain');
    expect(metadata.size).toBe(100);
    expect(metadata.tags).toEqual(['tag1', 'tag2']);
    expect(metadata.customData.key).toBe('value');
  });

  it('should serialize to JSON', () => {
    const metadata = new BinaryMetadata({
      fileName: 'test.txt',
      mimeType: 'text/plain'
    });
    
    const json = metadata.toJSON();
    
    expect(json.fileName).toBe('test.txt');
    expect(json.mimeType).toBe('text/plain');
    expect(json.id).toBeDefined();
  });

  it('should deserialize from JSON', () => {
    const original = new BinaryMetadata({
      fileName: 'test.txt',
      mimeType: 'text/plain',
      tags: ['tag1']
    });
    
    const json = original.toJSON();
    const restored = BinaryMetadata.fromJSON(json);
    
    expect(restored.fileName).toBe('test.txt');
    expect(restored.mimeType).toBe('text/plain');
    expect(restored.tags).toEqual(['tag1']);
  });
});

describe('BinaryData', () => {
  it('should create binary data', () => {
    const data = Buffer.from('test data');
    const binaryData = new BinaryData(data, {
      fileName: 'test.txt',
      mimeType: 'text/plain'
    });
    
    expect(binaryData.getData()).toBe(data);
    expect(binaryData.getMimeType()).toBe('text/plain');
    expect(binaryData.getSize()).toBe(data.length);
  });

  it('should check if expired', () => {
    const data = Buffer.from('test');
    const expiredData = new BinaryData(data, {
      expiresAt: new Date(Date.now() - 1000) // 1秒前过期
    });
    
    const validData = new BinaryData(data, {
      expiresAt: new Date(Date.now() + 1000) // 1秒后过期
    });
    
    expect(expiredData.isExpired()).toBe(true);
    expect(validData.isExpired()).toBe(false);
  });

  it('should add and remove tags', () => {
    const data = Buffer.from('test');
    const binaryData = new BinaryData(data);
    
    binaryData.addTag('tag1');
    expect(binaryData.metadata.tags).toContain('tag1');
    
    binaryData.removeTag('tag1');
    expect(binaryData.metadata.tags).not.toContain('tag1');
  });

  it('should set and get custom data', () => {
    const data = Buffer.from('test');
    const binaryData = new BinaryData(data);
    
    binaryData.setCustomData('key', 'value');
    expect(binaryData.getCustomData('key')).toBe('value');
  });

  it('should not add duplicate tags', () => {
    const data = Buffer.from('test');
    const binaryData = new BinaryData(data);
    
    binaryData.addTag('tag1');
    binaryData.addTag('tag1');
    
    expect(binaryData.metadata.tags).toEqual(['tag1']);
  });
});

describe('MemoryStorage', () => {
  let storage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('should store and retrieve data', async () => {
    const data = Buffer.from('test data');
    const metadata = {
      fileName: 'test.txt',
      mimeType: 'text/plain'
    };
    
    const id = await storage.store(data, metadata);
    const retrieved = await storage.retrieve(id);
    
    expect(retrieved.getData()).toEqual(data);
    expect(retrieved.metadata.fileName).toBe('test.txt');
  });

  it('should check if data exists', async () => {
    const data = Buffer.from('test');
    const id = await storage.store(data, {});
    
    expect(await storage.exists(id)).toBe(true);
    expect(await storage.exists('non-existent')).toBe(false);
  });

  it('should delete data', async () => {
    const data = Buffer.from('test');
    const id = await storage.store(data, {});
    
    await storage.delete(id);
    expect(await storage.exists(id)).toBe(false);
  });

  it('should get metadata', async () => {
    const data = Buffer.from('test');
    const id = await storage.store(data, {
      fileName: 'test.txt',
      mimeType: 'text/plain'
    });
    
    const metadata = await storage.getMetadata(id);
    
    expect(metadata.fileName).toBe('test.txt');
    expect(metadata.mimeType).toBe('text/plain');
  });

  it('should list all data', async () => {
    await storage.store(Buffer.from('data1'), { fileName: 'file1.txt' });
    await storage.store(Buffer.from('data2'), { fileName: 'file2.txt' });
    
    const list = await storage.list();
    
    expect(list).toHaveLength(2);
  });

  it('should filter by tags', async () => {
    await storage.store(Buffer.from('data1'), { tags: ['tag1'] });
    await storage.store(Buffer.from('data2'), { tags: ['tag2'] });
    await storage.store(Buffer.from('data3'), { tags: ['tag1', 'tag2'] });
    
    const list = await storage.list({ tags: ['tag1'] });
    
    expect(list).toHaveLength(2);
  });

  it('should cleanup expired data', async () => {
    const now = Date.now();
    await storage.store(Buffer.from('data1'), { expiresAt: new Date(now - 1000) });
    await storage.store(Buffer.from('data2'), { expiresAt: new Date(now + 1000) });
    
    await storage.cleanup();
    
    const list = await storage.list();
    expect(list).toHaveLength(1);
  });

  it('should clear all data', async () => {
    await storage.store(Buffer.from('data1'), {});
    await storage.store(Buffer.from('data2'), {});
    
    storage.clear();
    
    expect(storage.size()).toBe(0);
  });
});

describe('BinaryDataManager', () => {
  let manager;

  beforeEach(() => {
    manager = createBinaryDataManager({
      backend: createMemoryStorage(),
      enableDeduplication: true,
      enableCompression: false
    });
  });

  it('should store and retrieve data', async () => {
    const data = Buffer.from('test data');
    const result = await manager.store(data, {
      fileName: 'test.txt',
      mimeType: 'text/plain'
    });
    
    expect(result.isNew).toBe(true);
    expect(result.id).toBeDefined();
    
    const retrieved = await manager.retrieve(result.id);
    expect(retrieved.data).toEqual(data);
    expect(retrieved.metadata.fileName).toBe('test.txt');
  });

  it('should deduplicate identical data', async () => {
    const data = Buffer.from('test data');
    
    const result1 = await manager.store(data, { fileName: 'file1.txt' });
    const result2 = await manager.store(data, { fileName: 'file2.txt' });
    
    expect(result1.isNew).toBe(true);
    expect(result2.isNew).toBe(false);
    expect(result2.id).toBe(result1.id);
  });

  it('should delete data', async () => {
    const data = Buffer.from('test');
    const result = await manager.store(data, {});
    
    await manager.delete(result.id);
    expect(await manager.exists(result.id)).toBe(false);
  });

  it('should check if data exists', async () => {
    const data = Buffer.from('test');
    const result = await manager.store(data, {});
    
    expect(await manager.exists(result.id)).toBe(true);
    expect(await manager.exists('non-existent')).toBe(false);
  });

  it('should get metadata', async () => {
    const data = Buffer.from('test');
    const result = await manager.store(data, {
      fileName: 'test.txt',
      mimeType: 'text/plain'
    });
    
    const metadata = await manager.getMetadata(result.id);
    
    expect(metadata.fileName).toBe('test.txt');
    expect(metadata.mimeType).toBe('text/plain');
  });

  it('should list all data', async () => {
    await manager.store(Buffer.from('data1'), { fileName: 'file1.txt' });
    await manager.store(Buffer.from('data2'), { fileName: 'file2.txt' });
    
    const list = await manager.list();
    
    expect(list).toHaveLength(2);
  });

  it('should search data', async () => {
    await manager.store(Buffer.from('data1'), { fileName: 'important.txt', tags: ['important'] });
    await manager.store(Buffer.from('data2'), { fileName: 'normal.txt' });
    
    const results = await manager.search('important');
    
    expect(results).toHaveLength(1);
    expect(results[0].fileName).toBe('important.txt');
  });

  it('should cleanup expired data', async () => {
    const now = Date.now();
    await manager.store(Buffer.from('data1'), { expiresAt: new Date(now - 1000) });
    await manager.store(Buffer.from('data2'), { expiresAt: new Date(now + 1000) });
    
    await manager.cleanup();
    
    const list = await manager.list();
    expect(list).toHaveLength(1);
  });

  it('should get stats', async () => {
    await manager.store(Buffer.from('data1'), { fileName: 'file1.txt' });
    await manager.store(Buffer.from('data2'), { fileName: 'file2.txt' });
    
    const stats = await manager.getStats();
    
    expect(stats.totalCount).toBe(2);
    expect(stats.totalSize).toBeGreaterThan(0);
    expect(stats.deduplicationEnabled).toBe(true);
  });

  it('should switch backend', async () => {
    const data = Buffer.from('test');
    const result = await manager.store(data, { fileName: 'test.txt' });
    
    const newBackend = createMemoryStorage();
    await manager.switchBackend(newBackend);
    
    const retrieved = await manager.retrieve(result.id);
    expect(retrieved.metadata.fileName).toBe('test.txt');
  });
});

describe('Convenience Functions', () => {
  it('should create binary data manager', () => {
    const manager = createBinaryDataManager();
    
    expect(manager).toBeInstanceOf(BinaryDataManager);
  });

  it('should create file system storage', () => {
    const storage = createFileSystemStorage({ basePath: './test-data' });
    
    expect(storage).toBeInstanceOf(FileSystemStorage);
  });

  it('should create memory storage', () => {
    const storage = createMemoryStorage();
    
    expect(storage).toBeInstanceOf(MemoryStorage);
  });
});

describe('Edge Cases', () => {
  it('should handle empty data', async () => {
    const manager = createBinaryDataManager();
    const data = Buffer.from('');
    
    const result = await manager.store(data, {});
    expect(result.id).toBeDefined();
  });

  it('should handle large data', async () => {
    const manager = createBinaryDataManager();
    const data = Buffer.alloc(1024 * 1024); // 1MB
    
    const result = await manager.store(data, {});
    expect(result.metadata.size).toBe(1024 * 1024);
  });

  it('should handle special characters in filename', async () => {
    const manager = createBinaryDataManager();
    const data = Buffer.from('test');
    
    const result = await manager.store(data, {
      fileName: 'test file (1).txt'
    });
    
    const metadata = await manager.getMetadata(result.id);
    expect(metadata.fileName).toBe('test file (1).txt');
  });

  it('should handle multiple tags', async () => {
    const manager = createBinaryDataManager();
    const data = Buffer.from('test');
    
    await manager.store(data, { tags: ['tag1', 'tag2', 'tag3'] });
    
    const list = await manager.list({ tags: ['tag1'] });
    expect(list).toHaveLength(1);
    expect(list[0].tags).toEqual(['tag1', 'tag2', 'tag3']);
  });

  it('should handle custom data with various types', async () => {
    const manager = createBinaryDataManager();
    const data = Buffer.from('test');
    
    const result = await manager.store(data, {
      customData: {
        string: 'value',
        number: 42,
        boolean: true,
        null: null,
        object: { nested: 'value' }
      }
    });
    
    const metadata = await manager.getMetadata(result.id);
    expect(metadata.customData.string).toBe('value');
    expect(metadata.customData.number).toBe(42);
    expect(metadata.customData.boolean).toBe(true);
    expect(metadata.customData.null).toBeNull();
    expect(metadata.customData.object.nested).toBe('value');
  });

  it('should handle retrieval of non-existent data', async () => {
    const manager = createBinaryDataManager();
    
    const result = await manager.retrieve('non-existent-id');
    expect(result).toBeNull();
  });

  it('should handle deletion of non-existent data', async () => {
    const manager = createBinaryDataManager();
    
    // Should not throw error
    await manager.delete('non-existent-id');
  });
});
