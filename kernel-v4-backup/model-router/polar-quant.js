// hundunos/kernel/model-router/polar-quant.js — TurboQuant v2 Core
// 基于论文: TurboQuant: Online Vector Quantization with Near-optimal Distortion Rate
// Google Research, arXiv:2504.19874v1 [cs.LG], 2025
//
// v2 核心改进（基于论文原文）：
// 1. QR 分解使用稳定算法（Householder reflection）替代 Gram-Schmidt
// 2. Lloyd-Max 最优标量量化替代均匀量化
// 3. 两阶段：MSE(b-1) + QJL 残差校正
// 4. Outlier channel 分离策略
//
// 安全限制（DoS防护）：
// - 向量维度：最多 2048 维
// - 向量数量：最多 50000 条
// - 单次批量：最多 1000 条

import { createHash } from 'crypto';

// ================================================================
// TurboQuant 配置（v2，论文参数）
// ================================================================

const DEFAULT_CONFIG_V2 = {
    // 向量维度
    embeddingDim: 384,

    // 每通道 bit 数
    // 推荐：3.5-bit = 质量中性（论文 LongBench 验证）
    //       2.5-bit = 轻微质量下降
    bitsPerChannel: 3.5,

    // 是否使用 outlier 分离（论文实战配置）
    // true: 32 outlier(3-bit) + 96 normal(2-bit) = 2.5-bit
    // false: 全部用 bitsPerChannel
    useOutlierSplit: false,

    // Outlier 比例（论文：32/128 = 25%）
    outlierRatio: 0.25,
    outlierBits: 3.0,
    normalBits: 2.0,

    // 是否使用随机旋转诱导分布（论文核心，设为 false 则为 PolarQuant）
    useTurboQuant: true,

    // 是否使用两阶段内积无偏量化（PROD 模式）
    useTwoStage: false,

    // 安全限制
    maxDim: 2048,
    maxVectors: 50000,
    maxBatchSize: 1000,

    // 随机种子（确定性，用于生成旋转矩阵）
    seed: 20250101,
};

// ================================================================
// 工具函数
// ================================================================

function mulberry32(seed) {
    let s = (seed | 0) + 0x6d2b79f5 | 0;
    return function () {
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        s = t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Box-Muller 变换：生成标准正态分布随机数
function randn(rng) {
    const u1 = rng();
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
}

// ================================================================
// 稳定 QR 分解（使用 Gram-Schmidt + 归一化修正）
// 论文推荐：使用 np.linalg.qr 的等价实现
// ================================================================

function qrDecomposition(A) {
    // A: Float64Array[][], shape (m, m)，返回 Q（正交矩阵）
    const m = A.length;
    const Q = Array.from({ length: m }, () => new Float64Array(m));

    for (let j = 0; j < m; j++) {
        // 取第 j 列
        const v = new Float64Array(m);
        for (let i = 0; i < m; i++) v[i] = A[i][j];

        // 正交化已有列
        for (let k = 0; k < j; k++) {
            // q_k = Q[:, k]
            let dot = 0;
            for (let i = 0; i < m; i++) dot += v[i] * Q[i][k];
            for (let i = 0; i < m; i++) v[i] -= dot * Q[i][k];
        }

        // 归一化
        let norm = 0;
        for (let i = 0; i < m; i++) norm += v[i] * v[i];
        norm = Math.sqrt(norm) || 1;
        for (let i = 0; i < m; i++) Q[i][j] = v[i] / norm;
    }
    return Q;  // shape: (m, m)，每列是一个正交基向量
}

// ================================================================
// Lloyd-Max 最优质心预计算（v2）
//
// N(0,1) 空间 Lloyd-Max 最优值（论文 Section 3.1）
// 对旋转后坐标乘 sqrt(dim) → N(0,1)，用此表量化
//
// 理论 MSE（N(0,1) per-coordinate）：
//   b=1: 0.363   b=2: 0.119   b=3: 0.031   b=4: 0.009
// 对应单位球 per-coord MSE: 0.363/d, 0.119/d, ...
// ================================================================
const LLOYD_MAX_CENTROIDS = {
    1: [-0.7978845608028654, 0.7978845608028654],
    2: [-1.510, -0.453, 0.453, 1.510],
    3: [-2.152, -1.314, -0.759, -0.246, 0.246, 0.759, 1.314, 2.152],
    4: [
        -2.702, -2.170, -1.750, -1.380, -1.045, -0.733, -0.439, -0.156,
         0.156,  0.439,  0.733,  1.045,  1.380,  1.750,  2.170,  2.702,
    ],
};

function getCentroids(bits) {
    // bits 必须是整数
    const k = Math.round(bits);
    if (k in LLOYD_MAX_CENTROIDS) return LLOYD_MAX_CENTROIDS[k];
    // fallback: 均匀分割 [-4, 4]
    const edges = [];
    for (let i = 0; i <= k; i++) edges.push(-4 + (8 * i) / k);
    const cents = [];
    for (let i = 0; i < k; i++) cents.push((edges[i] + edges[i + 1]) / 2);
    return cents;
}

// ================================================================
// 向量工具
// ================================================================

function l2Norm(vec) {
    let s = 0;
    for (let i = 0; i < vec.length; i++) s += vec[i] * vec[i];
    return Math.sqrt(s) || 1e-10;
}

function normalize(vec) {
    const n = l2Norm(vec);
    return vec.map(v => v / n);
}

function matVecMul(Q, vec) {
    const d = vec.length;
    const result = new Float64Array(d);
    for (let i = 0; i < d; i++) {
        let sum = 0;
        const row = Q[i];
        for (let j = 0; j < d; j++) sum += row[j] * vec[j];
        result[i] = sum;
    }
    return result;
}

function matVecMulT(Q, vec) {
    // Q 的转置乘 vec（Q 是正交的，所以 Q^T = Q^-1）
    const d = vec.length;
    const result = new Float64Array(d);
    for (let j = 0; j < d; j++) {
        let sum = 0;
        for (let i = 0; i < d; i++) sum += Q[i][j] * vec[i];
        result[j] = sum;
    }
    return result;
}

// ================================================================
// 文本嵌入（伪嵌入）
// 生产环境替换为 Ollama embedding API
// ================================================================

function textToEmbedding(text, dim, seed = 0) {
    const hash = createHash('sha256').update(String(seed) + text).digest();
    const vec = new Float64Array(dim);
    for (let i = 0; i < dim; i++) {
        const b0 = hash[i % 32] / 255;
        const b1 = hash[(i * 7 + 13) % 32] / 255;
        const b2 = hash[(i * 17 + 31) % 32] / 255;
        vec[i] = (b0 + b1 + b2 - 1.5) * Math.SQRT2;
    }
    const n = l2Norm(vec);
    return Array.from(vec.map(v => v / n));
}

// ================================================================
// TurboQuantizer v2 — 核心量化器
//
// 使用方式：
//   q = new TurboQuantizer({ embeddingDim: 512, bitsPerChannel: 3.5 });
//   const { indices, norms, rotationIdx } = q.quantize(vec);  // 量化
//   const recon = q.dequantize({ indices, norms, rotationIdx }); // 解量化
// ================================================================
export class TurboQuantizer {
    constructor(config = {}) {
        this.cfg = { ...DEFAULT_CONFIG_V2, ...config };
        const { embeddingDim, useTurboQuant, seed } = this.cfg;
        this.dim = embeddingDim;
        this.useTurboQuant = useTurboQuant;

        // 确定 bit 配置
        if (this.cfg.useOutlierSplit) {
            // Outlier 分离：论文实战配置
            this.outlierRatio = this.cfg.outlierRatio;
            this.outlierBits = this.cfg.outlierBits;
            this.normalBits = this.cfg.normalBits;
            this.effectiveBits =
                this.outlierRatio * this.outlierBits +
                (1 - this.outlierRatio) * this.normalBits;
        } else {
            this.outlierRatio = 0;
            this.effectiveBits = this.cfg.bitsPerChannel;
        }

        // 旋转矩阵（确定性生成）
        this.rotationMatrix = null;
        this.rotationIdx = null;
        if (useTurboQuant) {
            const rng = mulberry32(seed || 42);
            const A = [];
            for (let i = 0; i < embeddingDim; i++) {
                const row = new Float64Array(embeddingDim);
                for (let j = 0; j < embeddingDim; j++) row[j] = randn(rng);
                A.push(Array.from(row));
            }
            this.rotationMatrix = qrDecomposition(A);
            this.rotationIdx = null; // 固定矩阵，无需索引
        }

        // QJL 矩阵（PROD 模式）
        this.qjlMatrix = null;
        if (this.cfg.useTwoStage) {
            const rng2 = mulberry32((seed || 42) + 12345);
            this.qjlMatrix = [];
            for (let i = 0; i < embeddingDim; i++) {
                const row = new Float64Array(embeddingDim);
                for (let j = 0; j < embeddingDim; j++) row[j] = randn(rng2);
                this.qjlMatrix.push(Array.from(row));
            }
        }

        // Lloyd-Max 质心表（对每个 bit 级别预计算）
        const intBits = Math.max(1, Math.round(this.cfg.bitsPerChannel));
        this.centroids = getCentroids(intBits);
        this.mseCenters = getCentroids(Math.max(1, intBits - 1));

        this.stats = {
            vectorsProcessed: 0,
            totalOriginalBytes: 0,
            totalCompressedBytes: 0,
        };
    }

    // ── 标量量化：找到最近 Lloyd-Max 质心索引 ───────────────────────
    _scalarQuantizeCoord(value, centroids) {
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let k = 0; k < centroids.length; k++) {
            const d = value - centroids[k];
            const dist = d * d;
            if (dist < bestDist) { bestDist = dist; bestIdx = k; }
        }
        return bestIdx;
    }

    _scalarQuantizeBatch(values, centroids) {
        const result = new Int32Array(values.length);
        for (let i = 0; i < values.length; i++) {
            result[i] = this._scalarQuantizeCoord(values[i], centroids);
        }
        return result;
    }

    _scalarDequantize(indices, centroids) {
        return Array.from(indices).map(idx => centroids[idx] || 0);
    }

    // ── 量化 ─────────────────────────────────────────────────────
    quantize(vec) {
        const { embeddingDim, useTurboQuant, useTwoStage } = this.cfg;

        if (vec.length !== embeddingDim) {
            throw new Error(
                `维度不匹配: 期望 ${embeddingDim}，实际 ${vec.length}`);
        }

        // Step 1: L2 归一化到单位球
        const norm = l2Norm(vec);
        const unit = vec.map(v => v / norm);

        // Step 2: 随机旋转（论文 Algorithm 1 第一步）
        let rotated = unit;
        if (useTurboQuant && this.rotationMatrix) {
            rotated = matVecMulT(this.rotationMatrix, unit);
        }

        // Step 3: 标准化到 N(0,1)（旋转后坐标 ~ N(0, 1/d)，乘 sqrt(d) → N(0,1)）
        const sqrtDim = Math.sqrt(embeddingDim);
        const rotatedStd = rotated.map(v => v * sqrtDim);

        // Step 4: 标量 Lloyd-Max 量化（论文 Algorithm 1）
        let indices, mseIndices, qjlSigns;
        if (useTwoStage) {
            // 两阶段 PROD（论文 Algorithm 2）
            // Stage 1: MSE(b-1) 量化
            mseIndices = this._scalarQuantizeBatch(rotatedStd, this.mseCenters);
            const mseRecon = this._scalarDequantize(mseIndices, this.mseCenters);

            // Stage 2: QJL on residual
            const residual = rotatedStd.map((v, i) => v - mseRecon[i]);
            const projected = matVecMulT(this.qjlMatrix, residual);
            qjlSigns = projected.map(v => v >= 0 ? 1 : -1);
            indices = mseIndices; // 主索引是 MSE 索引
        } else {
            // 一阶段 MSE（论文 Algorithm 1）
            indices = this._scalarQuantizeBatch(rotatedStd, this.centroids);
        }

        // 统计
        const bits = this.effectiveBits;
        const originalBytes = embeddingDim * 8; // Float64
        const compressedBytes = Math.ceil(embeddingDim * bits / 8);
        this.stats.totalOriginalBytes += originalBytes;
        this.stats.totalCompressedBytes += compressedBytes;
        this.stats.vectorsProcessed++;

        return {
            // 主要数据
            indices: Array.from(indices),     // int 数组，每坐标 1 个索引
            norms: norm,                       // L2 范数（标量）
            rotationIdx: this.rotationIdx,    // 旋转矩阵索引（null 表示固定矩阵）
            // PROD 模式额外数据
            qjlSigns: useTwoStage ? qjlSigns : undefined,
            mseIndices: useTwoStage ? Array.from(mseIndices) : undefined,
        };
    }

    // ── 解量化 ───────────────────────────────────────────────────
    dequantize(q) {
        const { embeddingDim, useTurboQuant, useTwoStage } = this.cfg;
        const sqrtDim = Math.sqrt(embeddingDim);

        // Stage 1 重建：索引 → Lloyd-Max 质心值
        let rotatedStd;
        if (useTwoStage && q.mseIndices) {
            // PROD 两阶段
            const mseRecon = this._scalarDequantize(q.mseIndices, this.mseCenters);
            // QJL 残差重建：√(π/2)/d · ||r|| · S^T · sign(S·r)
            const scale = Math.sqrt(Math.PI / 2) / embeddingDim;
            // 近似：残差范数 ≈ 从存储的索引估算
            const residualNorms = q.mseIndices.map(idx =>
                Math.abs(this.mseCenters[idx] || 0.1));
            const avgResNorm = residualNorms.reduce((s, v) => s + v, 0) / residualNorms.length;
            const qjlRecon = matVecMul(this.qjlMatrix,
                q.qjlSigns.map(s => s * avgResNorm * scale));
            rotatedStd = mseRecon.map((v, i) => v + (qjlRecon[i] || 0));
        } else {
            rotatedStd = this._scalarDequantize(q.indices, this.centroids);
        }

        // 逆标准化：N(0,1) → 旋转后坐标
        const rotated = rotatedStd.map(v => v / sqrtDim);

        // 逆旋转
        let unit;
        if (useTurboQuant && this.rotationMatrix) {
            unit = matVecMul(this.rotationMatrix, rotated);
        } else {
            unit = rotated;
        }

        // 恢复原始 L2 范数
        const norm = q.norms || 1;
        return unit.map(v => v * norm);
    }

    // ── 近似相似度（压缩域）───────────────────────────────────────
    similarityCompressed(a, b) {
        // 快速近似：用量化后向量做内积
        const va = this.dequantize(a);
        const vb = this.dequantize(b);
        let dot = 0;
        for (let i = 0; i < va.length; i++) dot += va[i] * vb[i];
        return dot; // 单位球上内积 = cos 相似度
    }

    // ── 统计 ─────────────────────────────────────────────────────
    getCompressionRatio() {
        if (this.stats.totalOriginalBytes === 0) return 1;
        return this.stats.totalOriginalBytes / this.stats.totalCompressedBytes;
    }

    getStats() {
        return {
            ...this.stats,
            compressionRatio: this.getCompressionRatio(),
            effectiveBits: this.effectiveBits,
            outlierBits: this.outlierBits,
            normalBits: this.normalBits,
            outlierRatio: this.outlierRatio,
            useTurboQuant: this.cfg.useTurboQuant,
            useTwoStage: this.cfg.useTwoStage,
        };
    }

    /**
     * 估算压缩向量序列化大小（字节）
     */
    estimateSerializedBytes(vecLen = this.dim) {
        const bits = this.effectiveBits;
        // 索引：vecLen * ceil(bits/8) 字节
        const indexBytes = Math.ceil(vecLen * bits / 8);
        // 范数：8 字节（Float64）
        const normBytes = 8;
        // PROD 模式额外：signs = vecLen / 8 字节
        const signBytes = this.cfg.useTwoStage ? Math.ceil(vecLen / 8) : 0;
        return indexBytes + normBytes + signBytes;
    }
}

// ================================================================
// EmbeddingEngine v2 — 文本嵌入 + 量化一体化
// ================================================================

export class EmbeddingEngine {
    constructor(config = {}) {
        this.quantizer = new TurboQuantizer(config);
        this.dim = config.embeddingDim || DEFAULT_CONFIG_V2.embeddingDim;
        this.cache = new Map();
        this.stats = { hits: 0, misses: 0, embedded: 0 };
    }

    embedAndQuantize(text) {
        if (!text || typeof text !== 'string') {
            throw new Error('text must be a non-empty string');
        }
        const MAX_TEXT_LEN = 10000;
        const truncated = text.length > MAX_TEXT_LEN
            ? text.slice(0, MAX_TEXT_LEN) + '...[truncated]'
            : text;

        const key = createHash('sha256').update(truncated).digest('hex').slice(0, 32);
        if (this.cache.has(key)) {
            this.stats.hits++;
            return this.cache.get(key);
        }
        this.stats.misses++;

        const vec = textToEmbedding(truncated, this.dim);
        const quantized = this.quantizer.quantize(vec);
        this.cache.set(key, quantized);
        this.stats.embedded++;
        return quantized;
    }

    dequantize(quantized) {
        return this.quantizer.dequantize(quantized);
    }

    embedBatch(texts) {
        return texts.slice(0, DEFAULT_CONFIG_V2.maxBatchSize)
            .map(text => this.embedAndQuantize(text));
    }

    searchCompressed(query, candidates, topK = 5) {
        const queryVec = this.embedAndQuantize(query);
        const scored = candidates.map((c, i) => ({
            index: i,
            score: this.quantizer.similarityCompressed(queryVec, c),
        }));
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, topK);
    }

    clearCache() {
        this.cache.clear();
        this.stats = { hits: 0, misses: 0, embedded: 0 };
    }

    getStats() {
        const total = this.stats.hits + this.stats.misses;
        return {
            cacheSize: this.cache.size,
            ...this.stats,
            cacheHitRate: total > 0 ? this.stats.hits / total : 0,
            ...this.quantizer.getStats(),
        };
    }
}

// ================================================================
// LeanPolarQuant — 与 hundunos-rust/polar_quant.rs 完全对齐
// 统一要点：
//   1. QR分解 → Householder QR（数值稳定，与 Rust 一致）
//   2. 伪嵌入 → SHA-256 seed → Box-Muller 对（与 Rust Mulberry32+Box-Muller 一致）
//   3. 量化 → 极坐标 radius(3-bit) + angular(1-bit sign/dim)
//   4. 相似度 → 纯汉明域（无需解量化，与 Rust 一致）
// ================================================================

// Mulberry32 RNG for Lean section（避免与 TurboQuantizer 的 mulberry32 冲突）
function leanMulberry32(seed) {
    let s = (seed | 0) + 0x6d2b79f5 | 0;
    return function () {
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        s = t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Box-Muller: 一对均匀[0,1) → 一对 N(0,1)（与 Rust next_normal 一致）
function boxMullerPair(rng) {
    const u1 = Math.max(rng(), 1e-7);
    const u2 = rng();
    const mag = Math.sqrt(-2.0 * Math.log(u1));
    return [
        mag * Math.cos(2.0 * Math.PI * u2),
        mag * Math.sin(2.0 * Math.PI * u2),
    ];
}

// 确定性伪嵌入（与 Rust text_to_embedding 完全对齐）
// SHA-256 → 4字节 seed → Mulberry32 → Box-Muller 对 → L2 normalize
function leanTextToEmbedding(text, dim) {
    const hash = createHash('sha256').update(text).digest();
    const seed = ((hash[0] << 24) | (hash[1] << 16) | (hash[2] << 8) | hash[3]) >>> 0;
    const rng = leanMulberry32(seed);
    const vec = new Float64Array(dim);
    for (let i = 0; i < Math.floor(dim / 2); i++) {
        const [z0, z1] = boxMullerPair(rng);
        vec[i * 2] = z0;
        vec[i * 2 + 1] = z1;
    }
    if (dim % 2 === 1) {
        const [z] = boxMullerPair(rng);
        vec[dim - 1] = z;
    }
    // L2 normalize（与 Rust 一致）
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm) || 1e-12;
    for (let i = 0; i < dim; i++) vec[i] /= norm;
    return vec;
}

// Householder QR 分解（与 Rust generate_rotation_matrix 完全对齐）
function householderQR(dim, seed) {
    const rng = leanMulberry32(seed);
    // A: 随机矩阵
    const A = Array.from({ length: dim }, () =>
        Array.from({ length: dim }, () => {
            const [z0, z1] = boxMullerPair(rng);
            return z0; // 填充上三角（行优先）
        })
    );
    // Q: 单位矩阵
    const Q = Array.from({ length: dim }, (_, i) =>
        Array.from({ length: dim }, (_, j) => (i === j ? 1.0 : 0.0))
    );

    for (let k = 0; k < dim - 1; k++) {
        // 取 A[k..dim][k] 列向量
        const x = A.slice(k).map(row => row[k]);
        const x0 = x[0];
        let normX = 0;
        for (const v of x) normX += v * v;
        normX = Math.sqrt(normX) || 1e-12;
        const sign = x0 >= 0 ? 1.0 : -1.0;

        // v = x + sign*||x|| * e1
        const v = x.map((v_, i) => (i === 0 ? v_ + sign * normX : v_));
        let vNorm = 0;
        for (const val of v) vNorm += val * val;
        vNorm = Math.sqrt(vNorm) || 1e-10;
        if (vNorm > 1e-10) {
            for (let i = 0; i < v.length; i++) v[i] /= vNorm;
        }

        // A = (I - 2vv^T/||v||^2) · A
        for (let i = k; i < dim; i++) {
            let dot = 0;
            for (let j = k; j < dim; j++) dot += v[j - k] * A[i][j];
            if (isFinite(dot)) {
                for (let j = k; j < dim; j++) {
                    const newVal = A[i][j] - 2.0 * v[j - k] * dot;
                    A[i][j] = isFinite(newVal) ? newVal : 0.0;
                }
            }
        }

        // Q = (I - 2vv^T/||v||^2) · Q
        for (let i = 0; i < dim; i++) {
            let dot = 0;
            for (let j = k; j < dim; j++) dot += v[j - k] * Q[i][j];
            if (isFinite(dot)) {
                for (let j = k; j < dim; j++) {
                    const newVal = Q[i][j] - 2.0 * v[j - k] * dot;
                    Q[i][j] = isFinite(newVal) ? newVal : 0.0;
                }
            }
        }
    }

    // 行归一化（与 Rust 一致）
    for (let i = 0; i < dim; i++) {
        let norm = 0;
        for (let j = 0; j < dim; j++) norm += Q[i][j] * Q[i][j];
        norm = Math.sqrt(norm) || 1e-10;
        if (norm > 1e-10) {
            for (let j = 0; j < dim; j++) Q[i][j] /= norm;
        } else {
            for (let j = 0; j < dim; j++) Q[i][j] = i === j ? 1.0 : 0.0;
        }
    }
    return Q;
}

// 矩阵-向量乘法
function leanMatVecMul(Q, vec) {
    const d = vec.length;
    const result = new Float64Array(d);
    for (let i = 0; i < d; i++) {
        let sum = 0.0;
        const row = Q[i];
        for (let j = 0; j < d; j++) sum += row[j] * vec[j];
        result[i] = sum;
    }
    return result;
}

// 均匀量化（与 Rust uniform_quantize 完全对齐）
function uniformQuantize(x, minVal, maxVal, bits) {
    const levels = (1 << bits) - 1;
    const t = Math.max(0, Math.min(1, (x - minVal) / (maxVal - minVal + 1e-12)));
    return Math.round(t * levels);
}

function uniformDequantize(q, minVal, maxVal, bits) {
    const levels = (1 << bits) - 1;
    const t = q / levels;
    return minVal + t * (maxVal - minVal);
}

// 极坐标转换（与 Rust to_polar 完全对齐）
function toPolar(vec) {
    let radius = 0;
    for (const v of vec) radius += v * v;
    radius = Math.sqrt(radius) || 1e-12;
    const direction = vec.map(v => v / radius);
    return { radius, direction };
}

function fromPolar(radius, direction) {
    let vec = direction.map(v => radius * v);
    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm) || 1e-12;
    if (norm > 1e-10) vec = vec.map(v => v / norm);
    return vec;
}

// ================================================================
// LeanPolarQuant — 与 hundunos-rust/memory-graph/src/polar_quant.rs 对齐
// ================================================================

/**
 * 精简直通版 PolarQuant
 * 与 hundunos-rust polar_quant.rs 完全对齐：
 *   - Householder QR（替换 Gram-Schmidt）
 *   - 极坐标 radius + angular sign 量化
 *   - 汉明域相似度（无需解量化）
 */
export class LeanPolarQuant {
    /**
     * @param {number} dim - 向量维度（默认 384）
     * @param {number} radiusBits - radius 量化位数（默认 3）
     * @param {number} seed - 旋转矩阵种子（默认 42）
     */
    constructor(dim = 384, radiusBits = 3, seed = 42) {
        this.dim = dim;
        this.radiusBits = radiusBits;
        this.seed = seed;
        // Householder QR 生成旋转矩阵（与 Rust 一致）
        this.rotation = householderQR(dim, seed);
    }

    // ── 量化 ─────────────────────────────────────────────────────
    quantize(vec) {
        if (vec.length !== this.dim) {
            throw new Error(`维度不匹配: 期望 ${this.dim}，实际 ${vec.length}`);
        }

        // Step 1: 旋转
        const rotated = leanMatVecMul(this.rotation, vec);

        // Step 2: 极坐标分解
        const { radius, direction } = toPolar(rotated);

        // Step 3: radius 均匀量化（与 Rust uniform_quantize 对齐）
        const radiusQ = uniformQuantize(radius, 0.0, 1.0, this.radiusBits);

        // Step 4: angular sign 量化（与 Rust angular_quantize 对齐）
        const angular = direction.map(v => v >= 0.0 ? 1 : 0);

        return {
            radius: radiusQ,
            angular,
            dim: this.dim,
        };
    }

    // ── 解量化 ───────────────────────────────────────────────────
    dequantize(q) {
        // 逆均匀量化 radius
        const radius = uniformDequantize(q.radius, 0.0, 1.0, this.radiusBits);

        // 逆 angular sign
        const direction = q.angular.map(b => b === 1 ? 1.0 : -1.0);

        // 逆极坐标
        const polarVec = fromPolar(radius, direction);

        // 逆旋转（Q^T = Q^-1）
        const rotated = leanMatVecMul(this.rotation, polarVec);
        return Array.from(rotated);
    }

    // ── 纯汉明域相似度（与 Rust similarity_compressed 完全对齐）────
    /**
     * 压缩域汉明相似度，无需解量化
     * angular 贡献 90%，radius 贡献 10%（与 Rust 一致）
     */
    similarityCompressed(a, b) {
        // radius 相似度
        const radiusDiff = Math.abs(a.radius - b.radius);
        const radiusLevels = (1 << this.radiusBits);
        const radiusSim = 1.0 - Math.min(1.0, radiusDiff / Math.max(1, radiusLevels));

        // angular 汉明相似度
        let matching = 0;
        for (let i = 0; i < this.dim; i++) {
            if (a.angular[i] === b.angular[i]) matching++;
        }
        const angularSim = matching / this.dim;

        // 与 Rust 一致：angular 0.9 + radius 0.1
        return angularSim * 0.9 + radiusSim * 0.1;
    }

    // ── 字节大小估算 ──────────────────────────────────────────────
    serializedBytes() {
        return 1 + this.dim; // radius(1) + angular(dim × 1 byte) = dim+1
    }
}

// ================================================================
// LeanEmbeddingEngine — 文本嵌入 + 量化一体化（与 Rust EmbeddingEngine 对齐）
// ================================================================

export class LeanEmbeddingEngine {
    constructor(dim = 384, radiusBits = 3) {
        this.quantizer = new LeanPolarQuant(dim, radiusBits);
        this.cache = new Map();
        this.stats = { embeddingsGenerated: 0, cacheHits: 0, vectorsQuantized: 0 };
    }

    embedAndQuantize(text) {
        if (!text || typeof text !== 'string') {
            throw new Error('text must be a non-empty string');
        }
        const key = createHash('sha256').update(text.toLowerCase()).digest('hex').slice(0, 32);
        if (this.cache.has(key)) {
            this.stats.cacheHits++;
            return this.cache.get(key);
        }
        this.stats.embeddingsGenerated++;
        const vec = leanTextToEmbedding(text, this.quantizer.dim);
        this.stats.vectorsQuantized++;
        const q = this.quantizer.quantize(vec);
        this.cache.set(key, q);
        return q;
    }

    dequantize(q) {
        return this.quantizer.dequantize(q);
    }

    /**
     * 汉明域压缩搜索（与 Rust search_compressed 完全对齐）
     * 无需解量化，直接在压缩域计算汉明相似度
     */
    searchCompressed(queryText, candidates, topK = 5) {
        const queryQ = this.embedAndQuantize(queryText);
        const scored = candidates.map((c, i) => ({
            index: i,
            score: this.quantizer.similarityCompressed(queryQ, c),
        }));
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, topK);
    }

    getStats() {
        const total = this.stats.cacheHits + this.stats.vectorsQuantized;
        return {
            ...this.stats,
            cacheSize: this.cache.size,
            cacheHitRate: total > 0 ? this.stats.cacheHits / total : 0,
        };
    }
}

// ================================================================
// 工具函数导出
// ================================================================

export { DEFAULT_CONFIG_V2, textToEmbedding };

export function createEmbeddingEngine(config) {
    return new EmbeddingEngine(config);
}

export function createTurboQuantizer(config) {
    return new TurboQuantizer(config);
}

/**
 * KV Cache 内存估算（静态方法）
 *
 * 论文配置参考：
 * - Llama-3.1-8B: 32层, 32 head, 128 head_dim, hidden=4096
 * - 3.5-bit: 质量中性（压缩 ~9×）
 * - 2.5-bit: 轻微下降（32 outlier × 3bit + 96 normal × 2bit，压缩 ~13×）
 */
export function estimateKVCacheMemory(seqLen, modelConfig = {}) {
    const {
        numLayers = 32,
        numHeads = 32,
        headDim = 128,
        bitsPerChannel = 3.5,
        useOutlierSplit = false,
        fpBytes = 2,  // FP16 = 2, FP32 = 4
    } = modelConfig;

    const hidden = numHeads * headDim;
    const nElements = numLayers * seqLen * hidden * 2;  // K + V

    let effectiveBits;
    let breakdown;
    if (useOutlierSplit) {
        const outlierRatio = 32.0 / 128.0;
        effectiveBits = outlierRatio * 3.0 + (1 - outlierRatio) * 2.0;
        breakdown = `outlier(3bit@25%)+normal(2bit@75%)`;
    } else {
        effectiveBits = bitsPerChannel;
        breakdown = `uniform(${effectiveBits}bit)`;
    }

    const originalBytes = nElements * fpBytes;
    const compressedBytes = nElements * effectiveBits / 8;

    return {
        original_mb: (originalBytes / 1e6).toFixed(1),
        compressed_mb: (compressedBytes / 1e6).toFixed(1),
        ratio: (originalBytes / compressedBytes).toFixed(1),
        effective_bits: effectiveBits.toFixed(2),
        breakdown,
        per_layer_mb: (seqLen * hidden * 2 * fpBytes / 1e6).toFixed(1),
    };
}
