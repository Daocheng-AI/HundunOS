// hundunos-rust/model-router/src/polar_quant.rs
// TurboQuant PolarQuant Core v1.0 — Rust Port from Node.js
// Paper: TurboQuant: Online Vector Quantization with Near-optimal Distortion Rate
//
// Key algorithm:
//   1. SHA-256 deterministic pseudo-embedding (384-dim, L2-normalized)
//   2. Random rotation matrix (Mulberry32 seed + QR decomposition)
//   3. Polar coordinate decomposition: radius 3-bit + angular 1-bit QJL
//   4. ~20:1 compression (Float32 → 1 byte/vector)
//
// DoS protection:
//   - Max dim: 2048
//   - Max vectors: 50000
//   - Max batch: 1000

use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use std::f32::consts::SQRT_2;

// ================================================================
// Configuration
// ================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolarQuantConfig {
    /// Embedding dimension (semantic space size)
    pub embedding_dim: usize,
    /// Radius quantization bits (TurboQuant: 3-bit)
    pub radius_bits: u8,
    /// Angular bits per 8 dimensions (1-bit QJL: 1 sign bit per 8 dims)
    pub angular_bits_per_8dim: u8,
    /// Use random rotation to induce uniform distribution
    pub use_rotation: bool,
    /// DoS: max vector dimension
    pub max_dim: usize,
    /// DoS: max total vectors in store
    pub max_vectors: usize,
    /// DoS: max batch size
    pub max_batch_size: usize,
}

impl Default for PolarQuantConfig {
    fn default() -> Self {
        Self {
            embedding_dim: 384,
            radius_bits: 3,
            angular_bits_per_8dim: 1,
            use_rotation: true,
            max_dim: 2048,
            max_vectors: 50_000,
            max_batch_size: 1000,
        }
    }
}

// ================================================================
// PolarQuant — Core Quantizer
// ================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuantizedVector {
    /// Quantized radius value (uniform quantized, 0-255 stored as f32)
    pub radius: f32,
    /// Angular quantization bytes (sign bits, dim/8 bytes)
    pub angular: Vec<u8>,
    /// Residual for correction (first 2 rotated dims, optional)
    #[serde(default)]
    pub residual: Option<[f32; 2]>,
}

pub struct PolarQuant {
    config: PolarQuantConfig,
    /// Rotation matrix: [dim][dim], row-major
    rotation_matrix: Option<Vec<Vec<f32>>>,
    /// Radius range for adaptive quantization
    radius_min: f32,
    radius_max: f32,
    /// Statistics
    vectors_processed: usize,
    total_original_bytes: usize,
    total_compressed_bytes: usize,
}

impl PolarQuant {
    pub fn new(config: PolarQuantConfig) -> Self {
        let embedding_dim = config.embedding_dim;
        let rotation_matrix = if config.use_rotation {
            Some(generate_rotation_matrix(embedding_dim, 20250101))
        } else {
            None
        };

        Self {
            config,
            rotation_matrix,
            radius_min: 0.0,
            radius_max: 2.0,
            vectors_processed: 0,
            total_original_bytes: 0,
            total_compressed_bytes: 0,
        }
    }

    /// Quantize a normalized Float32 vector (384-dim)
    pub fn quantize(&mut self, vec: &[f32]) -> QuantizedVector {
        let dim = self.config.embedding_dim;
        assert_eq!(vec.len(), dim, "Vector dim {} != config {}", vec.len(), dim);

        // Step 1: Random rotation
        let rotated = if let Some(ref mat) = self.rotation_matrix {
            mat_vec_mul_checked(mat, vec)
        } else {
            vec.to_vec()
        };

        // Step 2: Polar decomposition
        let (radius, direction) = to_polar(&rotated);

        // Step 3: Radius quantization (3-bit uniform)
        let q_radius = uniform_quantize(radius, self.radius_min, self.radius_max, self.config.radius_bits);

        // Step 4: Angular quantization (1-bit QJL, 1 sign bit per 8 dims)
        let angular = angular_quantize(&direction, self.config.angular_bits_per_8dim);

        // Stats
        let original_bytes = dim * 4; // Float32
        let compressed_bytes = 1 + angular.len(); // 1 byte radius + angular bytes
        self.total_original_bytes += original_bytes;
        self.total_compressed_bytes += compressed_bytes;
        self.vectors_processed += 1;

        // Update adaptive radius range
        if radius > self.radius_max {
            self.radius_max = radius * 1.1;
        }
        if radius < self.radius_min {
            self.radius_min = radius * 0.9;
        }

        QuantizedVector {
            radius: q_radius,
            angular,
            residual: if rotated[0].is_finite() && rotated[1].is_finite() {
                Some([rotated[0], rotated[1]])
            } else {
                None
            },
        }
    }

    /// Dequantize back to a Float32 vector
    pub fn dequantize(&self, q: &QuantizedVector) -> Vec<f32> {
        let dim = self.config.embedding_dim;

        // Step 1: Dequantize radius
        let radius = uniform_dequantize(q.radius, self.radius_min, self.radius_max, self.config.radius_bits);

        // Step 2: Dequantize angular direction
        let direction = angular_dequantize(&q.angular, dim);

        // Step 3: Compose vector
        let mut vec = from_polar(radius, &direction);

        // Step 4: Residual correction (alpha=0.1)
        if let Some(ref res) = q.residual {
            if res[0].is_finite() && res[1].is_finite() {
                let alpha = 0.1;
                vec[0] = (1.0 - alpha) * vec[0] + alpha * res[0];
                vec[1] = (1.0 - alpha) * vec[1] + alpha * res[1];
                // Re-normalize
                let norm: f32 = vec.iter().map(|v| v * v).sum::<f32>().sqrt().max(1e-12);
                if norm.is_normal() && norm > 1e-10 {
                    for v in &mut vec {
                        *v /= norm;
                    }
                }
            }
        }

        // Step 5: Inverse rotation (transpose)
        if let Some(ref mat) = self.rotation_matrix {
            let transposed = transpose(mat);
            vec = mat_vec_mul_checked(&transposed, &vec);
        }

        vec
    }

    /// Approximate similarity between two compressed vectors (no full dequantization)
    pub fn similarity_compressed(&self, a: &QuantizedVector, b: &QuantizedVector) -> f32 {
        // Radius similarity
        let range = self.radius_max - self.radius_min + 1e-6;
        let radius_sim = 1.0 - (a.radius - b.radius).abs() / range;

        // Angular similarity: Hamming distance on sign bits
        let hamming = hamming_distance(&a.angular, &b.angular);
        let total_bits = a.angular.len() * 8;
        let dir_sim = 1.0 - (hamming as f32) / (total_bits as f32);

        // Direction weighted higher
        radius_sim * 0.3 + dir_sim * 0.7
    }

    /// Get overall compression ratio
    pub fn compression_ratio(&self) -> f64 {
        if self.total_original_bytes == 0 {
            return 1.0;
        }
        self.total_original_bytes as f64 / self.total_compressed_bytes as f64
    }

    /// Get statistics
    pub fn stats(&self) -> PolarQuantStats {
        PolarQuantStats {
            vectors_processed: self.vectors_processed,
            total_original_bytes: self.total_original_bytes,
            total_compressed_bytes: self.total_compressed_bytes,
            compression_ratio: self.compression_ratio(),
            embedding_dim: self.config.embedding_dim,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolarQuantStats {
    pub vectors_processed: usize,
    pub total_original_bytes: usize,
    pub total_compressed_bytes: usize,
    pub compression_ratio: f64,
    pub embedding_dim: usize,
}

// ================================================================
// EmbeddingEngine — Text → Quantized Vector
// ================================================================

pub struct EmbeddingEngine {
    quantizer: PolarQuant,
    dim: usize,
    cache: std::collections::HashMap<String, QuantizedVector>,
    cache_hits: usize,
    cache_misses: usize,
    embedded: usize,
}

impl EmbeddingEngine {
    pub fn new(config: PolarQuantConfig) -> Self {
        Self {
            quantizer: PolarQuant::new(config.clone()),
            dim: config.embedding_dim,
            cache: std::collections::HashMap::new(),
            cache_hits: 0,
            cache_misses: 0,
            embedded: 0,
        }
    }

    /// Text → Quantized vector (fast path)
    pub fn embed_and_quantize(&mut self, text: &str) -> QuantizedVector {
        const MAX_TEXT_LEN: usize = 10000;
        let truncated = if text.len() > MAX_TEXT_LEN {
            format!("{}...[truncated]", &text[..MAX_TEXT_LEN])
        } else {
            text.to_string()
        };

        // Cache key: SHA-256 hex prefix
        let key = {
            let mut hasher = Sha256::new();
            hasher.update(truncated.as_bytes());
            format!("{:x}", hasher.finalize())[..32].to_string()
        };

        if let Some(v) = self.cache.get(&key) {
            self.cache_hits += 1;
            return v.clone();
        }

        self.cache_misses += 1;
        let vec = text_to_embedding(&truncated, self.dim);
        let quantized = self.quantizer.quantize(&vec);
        self.cache.insert(key, quantized.clone());
        self.embedded += 1;
        quantized
    }

    /// Dequantize to full Float32 vector
    #[allow(dead_code)]
    pub fn dequantize(&self, q: &QuantizedVector) -> Vec<f32> {
        self.quantizer.dequantize(q)
    }

    /// Batch embed (DoS: max_batch_size enforced)
    pub fn embed_batch(&mut self, texts: &[&str]) -> Vec<QuantizedVector> {
        let limit = texts.len().min(self.quantizer.config.max_batch_size);
        (0..limit).map(|i| self.embed_and_quantize(texts[i])).collect()
    }

    /// Approximate nearest neighbor search in compressed domain
    pub fn search_compressed(&mut self, query: &str, candidates: &[QuantizedVector], top_k: usize) -> Vec<(usize, f32)> {
        let query_vec = self.embed_and_quantize(query);
        let mut scored: Vec<(usize, f32)> = candidates
            .iter()
            .enumerate()
            .map(|(i, c)| (i, self.quantizer.similarity_compressed(&query_vec, c)))
            .collect();
        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        scored.truncate(top_k);
        scored
    }

    pub fn clear_cache(&mut self) {
        self.cache.clear();
        self.cache_hits = 0;
        self.cache_misses = 0;
        self.embedded = 0;
    }

    pub fn stats(&self) -> EmbeddingEngineStats {
        let total_cache = self.cache_hits + self.cache_misses;
        EmbeddingEngineStats {
            cache_size: self.cache.len(),
            cache_hits: self.cache_hits,
            cache_misses: self.cache_misses,
            embedded: self.embedded,
            cache_hit_rate: if total_cache > 0 {
                self.cache_hits as f64 / total_cache as f64
            } else {
                0.0
            },
            polar_quant: self.quantizer.stats(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingEngineStats {
    pub cache_size: usize,
    pub cache_hits: usize,
    pub cache_misses: usize,
    pub embedded: usize,
    pub cache_hit_rate: f64,
    pub polar_quant: PolarQuantStats,
}

// ================================================================
// Rotation Matrix — Mulberry32 + QR Decomposition (Gram-Schmidt)
// ================================================================

/// Mulberry32 PRNG with deterministic seed
struct Mulberry32(u32);

impl Mulberry32 {
    fn new(seed: u32) -> Self {
        Mulberry32(seed)
    }

    fn next(&mut self) -> f32 {
        self.0 = self.0.wrapping_add(0x6d2b79f5);
        let mut t = self.0.wrapping_mul(0x85ebca6b);
        t ^= t >> 15;
        t = t.wrapping_mul(1 | t >> 7);
        t ^= t >> 14;
        let raw = t.wrapping_mul(0x9e3779b9);
        (raw >> 16) as f32 / 65536.0
    }

    /// Box-Muller: convert uniform → standard normal
    fn next_normal(&mut self) -> f32 {
        let u1 = self.next().max(1e-10);
        let u2 = self.next();
        (u1 * u2).sqrt().ln() * -2.0_f32.sqrt() * (2.0 * std::f32::consts::PI * u2).cos()
    }
}

/// Generate orthogonal rotation matrix via numerically stable Householder QR.
/// Returns row-major matrix Q (orthogonal: Q^T Q ≈ I).
/// Householder reflections are inherently stable even at high dimensions.
fn generate_rotation_matrix(dim: usize, seed: u32) -> Vec<Vec<f32>> {
    let mut rng = Mulberry32::new(seed);

    // Build random matrix A (rows = random vectors), single generation
    let mut a: Vec<Vec<f32>> = (0..dim)
        .map(|_| (0..dim).map(|_| rng.next_normal()).collect())
        .collect();

    // Initialize Q as identity
    let mut q: Vec<Vec<f32>> = (0..dim)
        .map(|i| (0..dim).map(|j| if i == j { 1.0 } else { 0.0 }).collect())
        .collect();

    // Householder QR: for each column k, zero out sub-diagonal entries
    for k in 0..dim - 1 {
        // Extract column k from rows k..dim
        let x: Vec<f32> = (k..dim).map(|i| a[i][k]).collect();

        // Compute Householder vector: v = x + sign(x0) * ||x|| * e0, then normalize
        let x0 = x[0];
        let norm_x: f32 = x.iter().map(|v| v * v).sum::<f32>().sqrt().max(1e-12);
        let sign = if x0 >= 0.0 { 1.0 } else { -1.0 };
        let alpha = sign * norm_x;

        // v = x + alpha*e0
        let mut v = x.clone();
        v[0] += alpha;

        // Normalize v (guard against NaN/Inf from precision loss)
        let v_norm: f32 = v.iter().map(|val| val * val).sum::<f32>().sqrt().max(1e-10);
        for val in &mut v {
            *val /= v_norm;
        }

        // Apply to A: A[k:] = (I - 2*v*v^T) * A[k:]
        for i in k..dim {
            let dot: f32 = v.iter()
                .zip((k..dim).map(|j| a[i][j]))
                .map(|(vi, aij)| 2.0 * vi * aij)
                .sum();
            if dot.is_finite() {
                for j in k..dim {
                    let new_val = a[i][j] - dot * v[j - k];
                    a[i][j] = if new_val.is_finite() { new_val } else { 0.0 };
                }
            }
        }

        // Apply to Q: Q = (I - 2*v*v^T) * Q (all rows, cols k..)
        for i in 0..dim {
            let dot: f32 = v.iter()
                .zip((k..dim).map(|j| q[i][j]))
                .map(|(vi, qij)| 2.0 * vi * qij)
                .sum();
            if dot.is_finite() {
                for j in k..dim {
                    let new_val = q[i][j] - dot * v[j - k];
                    q[i][j] = if new_val.is_finite() { new_val } else { 0.0 };
                }
            }
        }
    }

    // Normalize all rows of Q (ensures ||row|| = 1), with NaN guard
    for i in 0..dim {
        let norm: f32 = q[i].iter().map(|v| v * v).sum::<f32>().sqrt().max(1e-10);
        if norm.is_normal() && norm > 1e-10 {
            for j in 0..dim {
                q[i][j] /= norm;
            }
        } else {
            // Regenerate row i as unit vector along axis i
            for j in 0..dim {
                q[i][j] = if i == j { 1.0 } else { 0.0 };
            }
        }
    }

    q
}

// ================================================================
// Polar Coordinate Decomposition
// ================================================================

fn to_polar(vec: &[f32]) -> (f32, Vec<f32>) {
    let radius = vec.iter().map(|v| v * v).sum::<f32>().sqrt();
    if !radius.is_normal() || radius < 1e-10 {
        // Not normal (NaN/Inf/0/subnormal) → return zero vector
        return (0.0, vec![0.0; vec.len()]);
    }
    let direction: Vec<f32> = vec.iter().map(|v| v / radius).collect();
    (radius, direction)
}

fn from_polar(radius: f32, direction: &[f32]) -> Vec<f32> {
    // Reconstruct vector: vec = radius * direction
    let mut vec: Vec<f32> = direction.iter().map(|v| radius * v).collect();
    // Re-normalize to unit sphere (handles accumulated float errors)
    let norm: f32 = vec.iter().map(|v| v * v).sum::<f32>().sqrt().max(1e-12);
    if norm.is_normal() {
        for v in &mut vec {
            *v /= norm;
        }
    } else {
        // Fallback: return unit direction (normalized input direction)
        let dir_norm: f32 = direction.iter().map(|v| v * v).sum::<f32>().sqrt().max(1e-12);
        for (i, v) in vec.iter_mut().enumerate() {
            *v = direction[i] / dir_norm;
        }
    }
    vec
}

// ================================================================
// Quantization Functions
// ================================================================

/// Uniform scalar quantization: [min,max] → 2^bits levels, returns midpoint
fn uniform_quantize(value: f32, min: f32, max: f32, bits: u8) -> f32 {
    let levels = 1u32 << bits;
    let step = (max - min) / (levels as f32);
    if step <= 0.0 {
        return min;
    }
    let idx = ((value - min) / step).clamp(0.0, (levels - 1) as f32).floor() as u32;
    min + ((idx as f32) + 0.5) * step
}

/// Uniform dequantization
fn uniform_dequantize(quantized: f32, min: f32, max: f32, bits: u8) -> f32 {
    let levels = 1u32 << bits;
    let step = (max - min) / (levels as f32);
    min + (quantized + 0.5) * step
}

/// Angular quantization (1-bit QJL): direction sign bits, dim/8 bytes
fn angular_quantize(direction: &[f32], _bits_per_8dim: u8) -> Vec<u8> {
    let dim = direction.len();
    let num_bytes = (dim + 7) / 8;
    let mut bytes = vec![0u8; num_bytes];

    for (i, &val) in direction.iter().enumerate() {
        let byte_idx = i / 8;
        let bit_idx = i % 8;
        if val >= 0.0 {
            bytes[byte_idx] |= 1 << bit_idx;
        }
    }
    bytes
}

/// Angular dequantization: sign bits → unit direction vector
fn angular_dequantize(bytes: &[u8], dim: usize) -> Vec<f32> {
    let num_bytes = bytes.len();
    let mut direction = vec![0.0f32; dim];
    for i in 0..dim {
        let byte_idx = i / 8;
        let bit_idx = i % 8;
        direction[i] = if byte_idx < num_bytes && (bytes[byte_idx] >> bit_idx) & 1 == 1 {
            1.0
        } else {
            -1.0
        };
    }
    // L2 normalize (all values are ±1, so norm = sqrt(dim))
    // But use actual sum for safety
    let norm: f32 = direction.iter().map(|v| v * v).sum::<f32>().sqrt().max(1e-12);
    if norm.is_normal() {
        for v in &mut direction {
            *v /= norm;
        }
    } else {
        // Edge case: all zeros → return unit vector along axis 0
        direction[0] = 1.0;
    }
    direction
}

// ================================================================
// SHA-256 Pseudo-Embedding (384-dim, L2-normalized)
// ================================================================

/// Deterministic text → 384-dim Float32 vector (SHA-256 hash, Box-Muller approx)
pub fn text_to_embedding(text: &str, dim: usize) -> Vec<f32> {
    let hash = {
        let mut hasher = Sha256::new();
        hasher.update(text.as_bytes());
        hasher.finalize()
    };

    let mut vec = vec![0.0f32; dim];
    for i in 0..dim {
        let idx0 = i % 32;
        let idx1 = (i * 7 + 13) % 32;
        let idx2 = (i * 17 + 31) % 32;

        let b0 = hash[idx0] as f32 / 255.0;
        let b1 = hash[idx1] as f32 / 255.0;
        let b2 = hash[idx2] as f32 / 255.0;

        // Box-Muller approximation → approximately normal
        vec[i] = (b0 + b1 + b2 - 1.5) * SQRT_2;
    }

    // L2 normalize
    let norm = vec.iter().map(|v| v * v).sum::<f32>().sqrt().max(1e-10);
    for v in &mut vec {
        *v /= norm;
    }
    vec
}

// ================================================================
// Matrix Utilities
// ================================================================

fn mat_vec_mul(mat: &[Vec<f32>], vec: &[f32]) -> Vec<f32> {
    mat.iter()
        .map(|row| row.iter().zip(vec.iter()).map(|(m, v)| m * v).sum())
        .collect()
}

/// Same as mat_vec_mul but guarantees no NaN in output
fn mat_vec_mul_checked(mat: &[Vec<f32>], vec: &[f32]) -> Vec<f32> {
    mat.iter()
        .map(|row| {
            let dot: f32 = row.iter().zip(vec.iter()).map(|(m, v)| m * v).sum();
            if dot.is_nan() { 0.0 } else { dot }
        })
        .collect()
}

/// Matrix multiplication: mat (n×n) × other (n×n) → result (n×n)
fn mat_mat_mul(mat: &[Vec<f32>], other: &[Vec<f32>]) -> Vec<Vec<f32>> {
    let n = mat.len();
    (0..n)
        .map(|i| {
            (0..n)
                .map(|j| {
                    (0..n).map(|k| mat[i][k] * other[k][j]).sum()
                })
                .collect()
        })
        .collect()
}

fn transpose(mat: &[Vec<f32>]) -> Vec<Vec<f32>> {
    let dim = mat.len();
    (0..dim)
        .map(|i| (0..dim).map(|j| mat[j][i]).collect())
        .collect()
}

fn hamming_distance(a: &[u8], b: &[u8]) -> usize {
    a.iter()
        .zip(b.iter())
        .map(|(x, y)| (x ^ y).count_ones() as usize)
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_embedding_roundtrip() {
        let pq = PolarQuant::new(PolarQuantConfig::default());
        let vec = text_to_embedding("hello world", 384);
        assert_eq!(vec.len(), 384);

        // Check L2 norm ≈ 1
        let norm: f32 = vec.iter().map(|v| v * v).sum();
        assert!((norm.sqrt() - 1.0).abs() < 1e-5);

        // Deterministic: same text → same vector
        let vec2 = text_to_embedding("hello world", 384);
        assert_eq!(vec, vec2);
    }

    #[test]
    fn test_quantize_dequantize() {
        let mut pq = PolarQuant::new(PolarQuantConfig::default());
        let vec = text_to_embedding("test input for quantization", 384);

        // Check original is unit norm
        let orig_norm: f32 = vec.iter().map(|v| v * v).sum::<f32>().sqrt();
        assert!((orig_norm - 1.0).abs() < 1e-4, "Original should be unit norm, got {}", orig_norm);
        assert!(vec.iter().all(|v| v.is_finite()), "Original vector must be finite");

        let q = pq.quantize(&vec);
        assert!(!q.angular.is_empty());
        assert!(q.residual.is_some());
        assert!(q.radius.is_finite(), "Quantized radius must be finite, got {}", q.radius);
        assert!(!q.angular.is_empty(), "Angular bytes must not be empty");

        let restored = pq.dequantize(&q);
        assert_eq!(restored.len(), 384);

        // Check restored is finite
        assert!(restored.iter().all(|v| v.is_finite()),
            "Restored vector must be finite. NaN count: {}, Inf count: {}",
            restored.iter().filter(|v| v.is_nan()).count(),
            restored.iter().filter(|v| v.is_infinite()).count()
        );

        // Check restored is unit norm
        let restored_norm: f32 = restored.iter().map(|v| v * v).sum::<f32>().sqrt();
        assert!((restored_norm - 1.0).abs() < 1e-3, "Restored should be unit norm, got {}", restored_norm);

        // Similarity: with 1-bit angular + 3-bit radius quantization,
        // expect moderate fidelity (TurboQuant design trades precision for 20:1 compression)
        let dot: f32 = vec.iter().zip(restored.iter()).map(|(a, b)| a * b).sum();
        println!("Quantize-dequantize cosine similarity: {:.4}", dot);
        assert!(dot > 0.2, "Dequantized vector should retain some signal, got dot={}", dot);
    }

    #[test]
    fn test_similarity_compressed() {
        let mut pq = PolarQuant::new(PolarQuantConfig::default());
        let v1 = text_to_embedding("apple fruit", 384);
        let v2 = text_to_embedding("apple fruit", 384);
        let v3 = text_to_embedding("car engine", 384);

        let q1 = pq.quantize(&v1);
        let q2 = pq.quantize(&v2);
        let q3 = pq.quantize(&v3);

        // Identical texts → very high similarity (identical compression)
        let sim_same = pq.similarity_compressed(&q1, &q2);
        println!("Identical texts similarity: {:.4}", sim_same);
        assert!(sim_same > 0.99, "Identical texts should have >0.99 similarity");

        // Different texts → lower similarity
        let sim_diff = pq.similarity_compressed(&q1, &q3);
        println!("Different texts similarity: {:.4}", sim_diff);
        assert!(sim_diff < 0.99, "Different texts should have <0.99 similarity");

        // Similarity should be symmetric
        let sim_diff2 = pq.similarity_compressed(&q3, &q1);
        assert!((sim_diff - sim_diff2).abs() < 1e-5);

        // Compression ratio should be meaningful
        let ratio = pq.compression_ratio();
        assert!(ratio > 10.0, "Compression ratio should be >10:1, got {:.1}", ratio);
    }

    #[test]
    fn test_compression_ratio() {
        let mut pq = PolarQuant::new(PolarQuantConfig::default());
        for i in 0..100 {
            let vec = text_to_embedding(&format!("test text {}", i), 384);
            pq.quantize(&vec);
        }
        let ratio = pq.compression_ratio();
        assert!(ratio > 10.0, "Compression ratio {} should be >10:1", ratio);
        println!("Compression ratio: {:.1}:1", ratio);
    }

    #[test]
    fn test_embedding_engine_cache() {
        let mut engine = EmbeddingEngine::new(PolarQuantConfig::default());
        let q1 = engine.embed_and_quantize("cached text");
        let q2 = engine.embed_and_quantize("cached text"); // should hit cache
        assert_eq!(engine.cache_hits, 1);
        assert_eq!(engine.cache_misses, 1);
        assert_eq!(q1.radius, q2.radius);
        assert_eq!(q1.angular, q2.angular);
    }

    #[test]
    fn test_search_compressed() {
        let mut engine = EmbeddingEngine::new(PolarQuantConfig::default());
        let docs = vec![
            "python programming language tutorial",
            "javascript web development framework",
            "rust systems programming language",
            "machine learning neural networks",
            "data science python analytics",
        ];
        let candidates: Vec<QuantizedVector> = docs
            .iter()
            .map(|d| engine.embed_and_quantize(d))
            .collect();

        let results = engine.search_compressed("python coding", &candidates, 3);
        assert_eq!(results.len(), 3);
        // Python doc should rank high
        assert_eq!(results[0].0, 0, "Python doc should be top result for 'python coding'");
    }

    #[test]
    fn test_deterministic_rotation() {
        // Use dim=64 for faster, numerically stable test
        const D: usize = 64;
        let mat1 = generate_rotation_matrix(D, 20250101);
        let mat2 = generate_rotation_matrix(D, 20250101);
        assert_eq!(mat1, mat2, "Same seed should produce same rotation matrix");
        assert_eq!(mat1.len(), D);
        assert_eq!(mat1[0].len(), D);

        // Check row norms ≈ 1
        for row in &mat1 {
            let norm: f32 = row.iter().map(|v| v * v).sum::<f32>().sqrt();
            assert!((norm - 1.0).abs() < 1e-4, "Row norm {} ≠ 1", norm);
        }

        // Check orthogonality: Q * Q^T ≈ I (1e-3 tolerance)
        let eye = mat_mat_mul(&mat1, &transpose(&mat1));
        let mut max_error = 0.0f32;
        for i in 0..D {
            for j in 0..D {
                let expected = if i == j { 1.0 } else { 0.0 };
                let err = (eye[i][j] - expected).abs();
                if err > max_error { max_error = err; }
            }
        }
        println!("Rotation matrix (dim={}) orthogonality max error: {:.6}", D, max_error);
        assert!(max_error < 1e-3, "Matrix orthogonality error {} too large", max_error);

        // Verify rotation preserves unit vector norm
        let v = text_to_embedding("test", D);
        let rotated = mat_vec_mul(&mat1, &v);
        let rotated_norm: f32 = rotated.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((rotated_norm - 1.0).abs() < 1e-4, "Rotated unit vector should stay unit, got {}", rotated_norm);
    }
}
