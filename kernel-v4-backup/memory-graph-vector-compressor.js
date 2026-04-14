// hundunos/kernel/memory-graph-vector-compressor.js — MemoryGraph PolarQuant v1.0
// 基于 TurboQuant PolarQuant：语义层记忆向量压缩
//
// 作用：将 semantic 层的实体编码从原始 Float32 压缩为 3-bit 量化向量
// 目标：存储空间减少 ~10 倍，相似性搜索精度损失 < 2%
//
// 集成方式：自动注入到 MemoryGraph.semantic 层
// 安全（DoS防护）：
//   - 最多压缩 50000 个记忆节点
//   - 每次查询最多扫描 1000 个节点

import { createEmbeddingEngine } from './model-router/polar-quant.js';

const MAX_MEMORY_NODES = 50000;
const MAX_SEARCH_NODES = 1000;

export class MemoryGraphVectorCompressor {
    constructor(kernel, config = {}) {
        this.kernel = kernel;

        this.config = {
            enabled: config.enabled !== false,
            radiusBits: config.radiusBits || 3,
            compressSemantic: config.compressSemantic !== false,
            similarityThreshold: config.similarityThreshold || 0.70,
            embeddingDim: config.embeddingDim || 384,
            maxDecompressedCache: config.maxDecompressedCache || 500,
        };

        this.embeddingEngine = createEmbeddingEngine({
            embeddingDim: this.config.embeddingDim,
            radiusBits: this.config.radiusBits,
        });

        this.semanticIndex = new Map(); // key → quantized
        this.decompressedCache = new Map(); // LRU 缓存
        this.lruOrder = [];

        this.stats = {
            nodesCompressed: 0,
            nodesDecompressed: 0,
            searchesPerformed: 0,
            cacheHits: 0,
            storageSavedBytes: 0,
            originalBytes: 0,
        };

        this._inject();
    }

    _inject() {
        const mg = this.kernel?.memoryGraph;
        if (!mg) {
            console.warn('[MemoryGraphVectorCompressor] No memoryGraph found');
            return;
        }

        // 覆盖 semantic.set：自动量化
        if (mg.semantic instanceof Map) {
            const origSet = mg.semantic.set.bind(mg.semantic);
            mg.semantic.set = (key, value) => {
                if (this.config.compressSemantic && this.config.enabled && value?.description) {
                    this._compressOnWrite(key, value);
                }
                return origSet(key, value);
            };

            // 覆盖 semantic.get：按需逆量化
            const origGet = mg.semantic.get.bind(mg.semantic);
            mg.semantic.get = (key) => {
                const raw = origGet(key);
                if (raw && raw._quantized && this.config.enabled) {
                    return this._decompressOnRead(key, raw);
                }
                return raw;
            };
        }

        // 新增语义搜索方法
        mg.semanticSearch = (query, topK = 5) => {
            return this.semanticSearch(query, topK);
        };

        // 新增批量压缩
        mg.compressSemanticLayer = (semanticMap) => {
            return this.compressExisting(semanticMap);
        };

        // console.log('[MemoryGraphVectorCompressor] Injected into MemoryGraph');
    }

    _compressOnWrite(key, value) {
        if (this.semanticIndex.size >= MAX_MEMORY_NODES) return;
        if (!value?.description) return;

        const quantized = this.embeddingEngine.embedAndQuantize(value.description);
        const originalBytes = this.config.embeddingDim * 4;
        const compressedBytes = 1 + quantized.angular.length;

        this.semanticIndex.set(key, quantized);
        this.stats.nodesCompressed++;
        this.stats.originalBytes += originalBytes;
        this.stats.storageSavedBytes += Math.max(0, originalBytes - compressedBytes);
    }

    _decompressOnRead(key, raw) {
        const quantized = raw._quantized;
        if (!quantized) return raw;

        if (this.decompressedCache.has(key)) {
            this.stats.cacheHits++;
            // 更新 LRU 顺序：移到末尾
            const idx = this.lruOrder.indexOf(key);
            if (idx >= 0) {
                this.lruOrder.splice(idx, 1);
                this.lruOrder.push(key);
            }
            return this.decompressedCache.get(key);
        }

        const vec = this.embeddingEngine.dequantize(quantized);
        this.stats.nodesDecompressed++;

        // LRU 淘汰：先取最老的 key，再 shift
        while (this.lruOrder.length >= this.config.maxDecompressedCache) {
            const oldest = this.lruOrder.shift();  // 先取出最老的 key
            if (oldest) {
                this.decompressedCache.delete(oldest);  // 删除正确的条目
            }
        }
        this.decompressedCache.set(key, vec);
        this.lruOrder.push(key);

        return { ...raw, _decompressedVec: vec };
    }

    semanticSearch(query, topK = 5) {
        if (!this.config.enabled || this.semanticIndex.size === 0) return [];

        this.stats.searchesPerformed++;
        const candidates = Array.from(this.semanticIndex.entries()).slice(0, MAX_SEARCH_NODES);

        const queryVec = this.embeddingEngine.embedAndQuantize(query);

        const scored = candidates.map(([key, quantized]) => ({
            key,
            score: this.embeddingEngine.quantizer.similarityCompressed(queryVec, quantized),
        }));

        scored.sort((a, b) => b.score - a.score);

        return scored
            .slice(0, topK)
            .filter(r => r.score >= this.config.similarityThreshold)
            .map(r => ({ key: r.key, score: r.score, type: 'semantic' }));
    }

    async compressExisting(semanticMap) {
        if (!(semanticMap instanceof Map)) return { compressed: 0, skipped: 0 };

        let compressed = 0, skipped = 0;
        for (const [key, value] of semanticMap.entries()) {
            if (this.semanticIndex.has(key)) { skipped++; continue; }
            if (!value?.description) { skipped++; continue; }
            try {
                this._compressOnWrite(key, value);
                compressed++;
            } catch (_) { skipped++; }
        }
        // console.log(`[MemoryGraphVectorCompressor] 批量压缩: ${compressed} 节点压缩, ${skipped} 跳过`);
        return { compressed, skipped, total: this.semanticIndex.size };
    }

    getStats() {
        const saved = this.stats.originalBytes - this.stats.storageSavedBytes;
        return {
            ...this.stats,
            compressionRatio: this.stats.originalBytes > 0
                ? `${Math.round(this.stats.originalBytes / Math.max(1, saved))}:1`
                : '1:1',
            indexSize: this.semanticIndex.size,
            cacheHitRate: this.stats.nodesDecompressed > 0
                ? Math.round(this.stats.cacheHits / this.stats.nodesDecompressed * 100)
                : 0,
            embeddingStats: this.embeddingEngine.getStats(),
        };
    }

    reset() {
        this.semanticIndex.clear();
        this.decompressedCache.clear();
        this.lruOrder = [];
        this.stats = { nodesCompressed: 0, nodesDecompressed: 0, searchesPerformed: 0, cacheHits: 0, storageSavedBytes: 0, originalBytes: 0 };
    }
}

export function createMemoryGraphVectorCompressor(kernel, config) {
    return new MemoryGraphVectorCompressor(kernel, config);
}
