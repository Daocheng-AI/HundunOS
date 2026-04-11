/**
 * HundunOS v3.0 - RecoverableMemory 增强版
 * 完善的快照与恢复机制
 * 
 * 功能：
 * - 完整快照 / 增量快照
 * - 快照压缩与清理
 * - 恢复策略（完整/部分）
 * - 与 MemoryGraph 集成
 */

import { createHash, randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 使用内核工作目录下的 data/snapshots，而非固定路径
const SNAPSHOT_DIR = process.env.HUNDUNOS_SNAPSHOT_DIR || './data/snapshots';
const MAX_SNAPSHOTS = 20;
const AUTO_INTERVAL = 60000; // 1分钟

/**
 * 快照类型
 */
export const SnapshotType = {
    FULL: 'full',           // 完整快照
    INCREMENTAL: 'incremental', // 增量快照
    CHECKPOINT: 'checkpoint',   // 检查点
    MANUAL: 'manual'        // 手动快照
};

/**
 * 恢复模式
 */
export const RecoveryMode = {
    FULL: 'full',           // 完整恢复
    PARTIAL: 'partial',     // 部分恢复
    ROLLBACK: 'rollback'    // 回滚到指定快照
};

/**
 * 快照数据结构
 */
class Snapshot {
    constructor(type, state, parentId = null) {
        this.id = `snap_${randomUUID()}`;
        this.type = type;
        this.timestamp = Date.now();
        this.parentId = parentId;
        this.state = state;
        this.checksum = null;
        this.size = 0;
        this.compressed = false;
    }
}

/**
 * RecoverableMemory 主类
 */
export class RecoverableMemory {
    constructor(kernel, config = {}) {
        this.kernel = kernel;
        this.config = {
            maxSnapshots: config.maxSnapshots || MAX_SNAPSHOTS,
            autoInterval: config.autoInterval || AUTO_INTERVAL,
            compressThreshold: config.compressThreshold || 10000, // 10KB
            persistDir: config.persistDir || SNAPSHOT_DIR
        };

        this.snapshots = [];
        this.snapshotIndex = new Map(); // id -> snapshot
        this.lastSnapshot = null;
        this.autoTimer = null;
        this.deltaCache = new Map();

        // 确保目录存在
        if (!fs.existsSync(this.config.persistDir)) {
            fs.mkdirSync(this.config.persistDir, { recursive: true });
        }
    }

    /**
     * 初始化
     */
    async initialize() {
        await this._loadPersistedSnapshots();
        this._startAutoSnapshot();
        // review: removed // review: removed console.log(`[RecoverableMemory] Initialized with ${this.snapshots.length} snapshots`);
        return this;
    }

    // ========================================
    // 快照操作
    // ========================================

    /**
     * 创建完整快照
     */
    async takeFullSnapshot(meta = {}) {
        const state = await this._captureFullState();
        const snapshot = new Snapshot(SnapshotType.FULL, state);
        snapshot.checksum = this._computeChecksum(state);
        snapshot.size = JSON.stringify(snapshot).length;

        // 持久化
        await this._persistSnapshot(snapshot);

        // 更新索引
        this.snapshots.push(snapshot);
        this.snapshotIndex.set(snapshot.id, snapshot);
        this.lastSnapshot = snapshot;

        // 清理旧快照
        this._cleanupOldSnapshots();

        // review: removed // review: removed console.log(`[RecoverableMemory] Full snapshot: ${snapshot.id} (${snapshot.size} bytes)`);
        return snapshot;
    }

    /**
     * 创建增量快照
     */
    async takeIncrementalSnapshot() {
        if (!this.lastSnapshot) {
            return this.takeFullSnapshot({ reason: 'no_parent' });
        }

        const currentState = await this._captureFullState();
        const delta = this._computeDelta(this.lastSnapshot.state, currentState);

        // 如果变化很小，跳过
        if (delta.changes === 0) {
            // review: removed // review: removed console.log('[RecoverableMemory] No changes, skip incremental snapshot');
            return null;
        }

        const snapshot = new Snapshot(SnapshotType.INCREMENTAL, delta, this.lastSnapshot.id);
        snapshot.checksum = this._computeChecksum(delta);
        snapshot.size = JSON.stringify(snapshot).length;

        await this._persistSnapshot(snapshot);

        this.snapshots.push(snapshot);
        this.snapshotIndex.set(snapshot.id, snapshot);
        this.lastSnapshot = snapshot;

        this._cleanupOldSnapshots();

        // review: removed // review: removed console.log(`[RecoverableMemory] Incremental snapshot: ${snapshot.id} (${delta.changes} changes)`);
        return snapshot;
    }

    /**
     * 创建检查点（轻量级快照）
     */
    async createCheckpoint(name) {
        const state = await this._captureLightState();
        const snapshot = new Snapshot(SnapshotType.CHECKPOINT, state);
        snapshot.name = name;
        snapshot.checksum = this._computeChecksum(state);

        await this._persistSnapshot(snapshot);

        this.snapshots.push(snapshot);
        this.snapshotIndex.set(snapshot.id, snapshot);

        return snapshot;
    }

    // ========================================
    // 恢复操作
    // ========================================

    /**
     * 恢复到指定快照
     */
    async recover(snapshotId, mode = RecoveryMode.FULL) {
        const snapshot = this.snapshotIndex.get(snapshotId) || await this._loadSnapshot(snapshotId);

        if (!snapshot) {
            throw new Error(`Snapshot not found: ${snapshotId}`);
        }

        // 验证校验和
        const checksum = this._computeChecksum(snapshot.state);
        if (checksum !== snapshot.checksum) {
            throw new Error('Snapshot corrupted: checksum mismatch');
        }

        // 根据快照类型处理
        if (snapshot.type === SnapshotType.INCREMENTAL) {
            return this._recoverIncremental(snapshot, mode);
        }

        // 完整快照直接恢复
        await this._restoreState(snapshot.state, mode);

        // review: removed // review: removed console.log(`[RecoverableMemory] Recovered to ${snapshot.id}`);
        return {
            snapshotId: snapshot.id,
            type: snapshot.type,
            recoveredAt: Date.now(),
            mode
        };
    }

    /**
     * 增量恢复
     */
    async _recoverIncremental(snapshot, mode) {
        // 找到父快照链
        const chain = [];
        let current = snapshot;

        while (current && current.type === SnapshotType.INCREMENTAL) {
            chain.unshift(current);
            current = this.snapshotIndex.get(current.parentId);
        }

        if (current) {
            chain.unshift(current); // 基础完整快照
        }

        // 依次应用
        let state = chain[0].state;
        for (let i = 1; i < chain.length; i++) {
            state = this._applyDelta(state, chain[i].state);
        }

        await this._restoreState(state, mode);
        return { snapshotId: snapshot.id, appliedCount: chain.length };
    }

    /**
     * 回滚到上一个快照
     */
    async rollback() {
        if (this.snapshots.length < 2) {
            throw new Error('No previous snapshot to rollback');
        }

        const previousId = this.snapshots[this.snapshots.length - 2].id;
        return this.recover(previousId, RecoveryMode.ROLLBACK);
    }

    // ========================================
    // 状态捕获与恢复
    // ========================================

    async _captureFullState() {
        const state = {
            modules: {},
            memory: {},
            sessions: {},
            aware: {},
            timestamp: Date.now()
        };

        // 捕获模块状态
        if (this.kernel.moduleRegistry?.modules) {
            for (const [id, mod] of this.kernel.moduleRegistry.modules) {
                state.modules[id] = {
                    status: mod.status,
                    config: mod.config
                };
            }
        }

        // 捕获记忆状态（kernel.memoryGraph 是实际的 MemoryGraph 实例，不是 .memory）
        if (this.kernel.memoryGraph) {
            state.memory = {
                working: Array.from(this.kernel.memoryGraph.working.entries()),
                recent: this.kernel.memoryGraph.recent,
                semantic: Array.from(this.kernel.memoryGraph.semantic.entries()),
                episodic: this.kernel.memoryGraph.episodic
            };
        }

        // 捕获会话状态
        if (this.kernel.state) {
            state.sessions = Array.from(this.kernel.state.sessions?.keys() || []);
        }

        // 捕获 Aware 状态
        if (this.kernel.aware) {
            state.aware = {
                focuses: Array.from(this.kernel.aware.focusItems?.entries() || []),
                triggers: Array.from(this.kernel.aware.triggers?.keys() || [])
            };
        }

        return state;
    }

    async _captureLightState() {
        return {
            timestamp: Date.now(),
            modules: Object.keys(this.kernel.moduleRegistry?.modules || {}),
            sessionCount: this.kernel.state?.sessions?.size || 0
        };
    }

    async _restoreState(state, mode) {
        // 恢复模块状态
        if (state.modules && this.kernel.moduleRegistry) {
            for (const [id, modState] of Object.entries(state.modules)) {
                const mod = this.kernel.moduleRegistry.modules?.get(id);
                if (mod && modState.status) {
                    mod.status = modState.status;
                }
            }
        }

        // 恢复记忆（使用 kernel.memoryGraph）
        if (state.memory && this.kernel.memoryGraph) {
            if (state.memory.working) this.kernel.memoryGraph.working = new Map(state.memory.working);
            if (state.memory.recent) this.kernel.memoryGraph.recent = state.memory.recent;
            if (state.memory.semantic) this.kernel.memoryGraph.semantic = new Map(state.memory.semantic);
            if (state.memory.episodic) this.kernel.memoryGraph.episodic = state.memory.episodic;
        }

        // 恢复 Aware
        if (state.aware && this.kernel.aware) {
            if (state.aware.focuses) {
                this.kernel.aware.focusItems = new Map(state.aware.focuses);
            }
        }

        // review: removed // review: removed console.log(`[RecoverableMemory] State restored (${mode} mode)`);
    }

    // ========================================
    // 工具方法
    // ========================================

    _computeChecksum(state) {
        return createHash('sha256')
            .update(JSON.stringify(state))
            .digest('hex')
            .slice(0, 16);
    }

    _computeDelta(oldState, newState) {
        const changes = [];
        const allKeys = new Set([...Object.keys(oldState), ...Object.keys(newState)]);

        for (const key of allKeys) {
            if (JSON.stringify(oldState[key]) !== JSON.stringify(newState[key])) {
                changes.push({
                    key,
                    oldValue: oldState[key],
                    newValue: newState[key]
                });
            }
        }

        return { changes: changes.length, deltas: changes };
    }

    _applyDelta(baseState, delta) {
        const state = JSON.parse(JSON.stringify(baseState));
        for (const d of delta.deltas || []) {
            state[d.key] = d.newValue;
        }
        return state;
    }

    // ========================================
    // 持久化
    // ========================================

    async _persistSnapshot(snapshot) {
        const filePath = path.join(this.config.persistDir, `${snapshot.id}.json`);
        const data = JSON.stringify(snapshot, null, 2);
        fs.writeFileSync(filePath, data, 'utf-8');
    }

    async _loadSnapshot(id) {
        const filePath = path.join(this.config.persistDir, `${id}.json`);
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data);
        }
        return null;
    }

    async _loadPersistedSnapshots() {
        if (!fs.existsSync(this.config.persistDir)) return;

        const files = fs.readdirSync(this.config.persistDir)
            .filter(f => f.startsWith('snap_') && f.endsWith('.json'))
            .sort();

        for (const file of files.slice(-this.config.maxSnapshots)) {
            try {
                const data = fs.readFileSync(path.join(this.config.persistDir, file), 'utf-8');
                const snapshot = JSON.parse(data);
                this.snapshots.push(snapshot);
                this.snapshotIndex.set(snapshot.id, snapshot);
            } catch (e) {
                console.warn(`[RecoverableMemory] Failed to load ${file}: ${e.message}`);
            }
        }
    }

    _cleanupOldSnapshots() {
        while (this.snapshots.length > this.config.maxSnapshots) {
            const old = this.snapshots.shift();
            this.snapshotIndex.delete(old.id);

            // 删除文件
            const filePath = path.join(this.config.persistDir, `${old.id}.json`);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
    }

    _startAutoSnapshot() {
        this.autoTimer = setInterval(async () => {
            try {
                await this.takeIncrementalSnapshot();
            } catch (e) {
                console.warn('[RecoverableMemory] Auto snapshot failed:', e.message);
            }
        }, this.config.autoInterval);
    }

    stopAutoSnapshot() {
        if (this.autoTimer) {
            clearInterval(this.autoTimer);
            this.autoTimer = null;
        }
    }

    async shutdown() {
        this.stopAutoSnapshot();
        await this._persistMetadata();
    }

    async _persistMetadata() {
        const metaPath = path.join(this.config.persistDir, 'index.json');
        fs.writeFileSync(metaPath, JSON.stringify({
            latestSnapshotId: this.lastSnapshot?.id || null,
            total: this.snapshots.length,
            updatedAt: Date.now()
        }, null, 2), 'utf-8');
    }

    // ========================================
    // 查询接口
    // ========================================

    getLatest() {
        return this.lastSnapshot;
    }

    getAll() {
        return [...this.snapshots];
    }

    getById(id) {
        return this.snapshotIndex.get(id);
    }

    getStats() {
        return {
            total: this.snapshots.length,
            byType: this.snapshots.reduce((acc, s) => {
                acc[s.type] = (acc[s.type] || 0) + 1;
                return acc;
            }, {}),
            totalSize: this.snapshots.reduce((sum, s) => sum + (s.size || 0), 0),
            oldest: this.snapshots[0]?.timestamp,
            newest: this.lastSnapshot?.timestamp
        };
    }
}

export default RecoverableMemory;
