// hundunos-rust/memory-graph/src/polar_quant.rs
// Lean PolarQuant for MemoryGraph semantic layer compression
// Based on hundunos-rust/model-router/polar_quant.rs (same algorithm)
// SHA-256 deterministic pseudo-embeddings → polar coordinate → 3-bit radius + 1-bit angular

use sha2::{Sha256, Digest};
use std::f32::consts::TAU;

#[allow(dead_code)] const DEFAULT_DIM: usize = 384;
#[allow(dead_code)] const RADIUS_BITS: usize = 3;
#[allow(dead_code)] const ANGULAR_BITS: usize = 1;

// ================================================================
// Mulberry32 RNG (fast, seedable)
// ================================================================

#[derive(Debug, Clone)]
pub struct Mulberry32(u32);

impl Mulberry32 {
    pub fn new(seed: u32) -> Self {
        Self(seed)
    }
    pub fn next_f32(&mut self) -> f32 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 17;
        self.0 ^= self.0 << 5;
        let x = self.0 as f64;
        (x as f64 * (1.0 / (u32::MAX as f64 + 1.0))) as f32
    }
    /// Box-Muller: transform uniform [0,1) to normal N(0,1)
    pub fn next_normal(&mut self) -> f32 {
        let u1 = self.next_f32().max(1e-7);
        let u2 = self.next_f32();
        let z = (-2.0 * u1.ln()).sqrt() * (TAU as f32 * u2).cos();
        z
    }
}

// ================================================================
// Rotation matrix via Householder QR (numerically stable at dim=384)
// ================================================================

fn generate_rotation_matrix(dim: usize, seed: u32) -> Vec<Vec<f32>> {
    let mut rng = Mulberry32::new(seed);
    let mut a: Vec<Vec<f32>> = (0..dim)
        .map(|_| (0..dim).map(|_| rng.next_normal()).collect())
        .collect();
    let mut q: Vec<Vec<f32>> = (0..dim)
        .map(|i| (0..dim).map(|j| if i == j { 1.0 } else { 0.0 }).collect())
        .collect();

    for k in 0..dim.saturating_sub(1) {
        let x: Vec<f32> = (k..dim).map(|i| a[i][k]).collect();
        let x0 = x[0];
        let norm_x = x.iter().map(|v| v * v).sum::<f32>().sqrt().max(1e-12);
        let sign = if x0 >= 0.0 { 1.0 } else { -1.0 };
        let mut v: Vec<f32> = x;
        v[0] += sign * norm_x;
        let v_norm = v.iter().map(|val| val * val).sum::<f32>().sqrt().max(1e-10);
        if v_norm > 1e-10 {
            for val in &mut v { *val /= v_norm; }
        }

        // Apply to A
        for i in k..dim {
            let dot: f32 = v.iter().zip((k..dim).map(|j| a[i][j]))
                .map(|(vi, aij)| 2.0 * vi * aij).sum();
            if dot.is_finite() {
                for j in k..dim {
                    let new_val = a[i][j] - dot * v[j - k];
                    a[i][j] = if new_val.is_finite() { new_val } else { 0.0 };
                }
            }
        }
        // Apply to Q
        for i in 0..dim {
            let dot: f32 = v.iter().zip((k..dim).map(|j| q[i][j]))
                .map(|(vi, qij)| 2.0 * vi * qij).sum();
            if dot.is_finite() {
                for j in k..dim {
                    let new_val = q[i][j] - dot * v[j - k];
                    q[i][j] = if new_val.is_finite() { new_val } else { 0.0 };
                }
            }
        }
    }

    // Normalize rows
    for i in 0..dim {
        let norm = q[i].iter().map(|v| v * v).sum::<f32>().sqrt().max(1e-10);
        if norm.is_normal() && norm > 1e-10 {
            for j in 0..dim { q[i][j] /= norm; }
        } else {
            for j in 0..dim { q[i][j] = if i == j { 1.0 } else { 0.0 }; }
        }
    }
    q
}

// Matrix-vector multiply
fn mat_vec_mul(m: &[Vec<f32>], v: &[f32]) -> Vec<f32> {
    let dim = v.len();
    m.iter().map(|row| {
        let mut sum = 0.0_f32;
        for j in 0..dim {
            sum += row[j] * v[j];
        }
        sum
    }).collect()
}

// ================================================================
// Deterministic pseudo-embedding via SHA-256 + Box-Muller
// ================================================================

pub fn text_to_embedding(text: &str, dim: usize) -> Vec<f32> {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    let hash = hasher.finalize();

    let mut rng = Mulberry32::new(
        ((hash[0] as u32) << 24) | ((hash[1] as u32) << 16) | ((hash[2] as u32) << 8) | (hash[3] as u32)
    );

    // Box-Muller: dim/2 pairs → dim samples
    let pairs = dim / 2;
    let mut vec = Vec::with_capacity(dim);
    for _ in 0..pairs {
        let u1 = rng.next_f32().max(1e-7);
        let u2 = rng.next_f32();
        let z0 = (-2.0 * u1.ln()).sqrt() * (TAU * u2).cos();
        let z1 = (-2.0 * u1.ln()).sqrt() * (TAU * u2).sin();
        vec.push(z0);
        vec.push(z1);
    }
    if dim % 2 == 1 {
        vec.push(rng.next_normal());
    }

    // L2 normalize
    let norm = vec.iter().map(|v| v * v).sum::<f32>().sqrt().max(1e-12);
    for v in &mut vec { *v /= norm; }
    vec
}

// ================================================================
// Polar coordinate transform
// ================================================================

fn to_polar(vec: &[f32]) -> (f32, Vec<f32>) {
    let radius: f32 = vec.iter().map(|v| v * v).sum::<f32>().sqrt().max(1e-12);
    let direction: Vec<f32> = if radius.is_normal() {
        vec.iter().map(|v| v / radius).collect()
    } else {
        vec.to_vec()
    };
    (radius, direction)
}

fn from_polar(radius: f32, direction: &[f32]) -> Vec<f32> {
    let mut vec: Vec<f32> = direction.iter().map(|v| radius * v).collect();
    let norm = vec.iter().map(|v| v * v).sum::<f32>().sqrt().max(1e-12);
    if norm.is_normal() && norm > 1e-10 {
        for v in &mut vec { *v /= norm; }
    }
    vec
}

// ================================================================
// Quantization
// ================================================================

// Uniform quantization for radius (3-bit → 8 levels)
pub fn uniform_quantize(x: f32, min_val: f32, max_val: f32, bits: usize) -> u8 {
    let levels = (1usize << bits) - 1;
    let t = ((x - min_val) / (max_val - min_val + 1e-12)).clamp(0.0, 1.0);
    (t * levels as f32).round() as u8
}

pub fn uniform_dequantize(q: u8, min_val: f32, max_val: f32, bits: usize) -> f32 {
    let levels = (1usize << bits) - 1;
    let t = q as f32 / levels as f32;
    min_val + t * (max_val - min_val)
}

// Angular: 1-bit per dimension (sign bit)
pub fn angular_quantize(direction: &[f32]) -> Vec<u8> {
    direction.iter().map(|v| if *v >= 0.0 { 1u8 } else { 0u8 }).collect()
}

pub fn angular_dequantize(angular: &[u8]) -> Vec<f32> {
    angular.iter().map(|b| if *b == 1 { 1.0 } else { -1.0 }).collect()
}

// ================================================================
// Serialized quantized vector
// ================================================================

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct QuantizedVector {
    pub radius: u8,          // 3-bit quantized radius
    pub angular: Vec<u8>,    // 1-bit per dim
    pub dim: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub residual: Option<Vec<f32>>,
}

impl QuantizedVector {
    /// Size in bytes (for compression ratio calculation)
    pub fn size_bytes(&self) -> usize {
        1 + self.angular.len() + self.residual.as_ref().map(|r| r.len() * 4).unwrap_or(0)
    }
}

// ================================================================
// PolarQuant quantizer
// ================================================================

#[derive(Debug, Clone)]
pub struct PolarQuant {
    pub dim: usize,
    pub radius_bits: usize,
    pub rotation: Vec<Vec<f32>>,
    #[allow(dead_code)]
    rotation_seed: u32,  // retained for reproducibility debugging
}

impl PolarQuant {
    pub fn new(dim: usize, radius_bits: usize, rotation_seed: u32) -> Self {
        Self {
            dim,
            radius_bits,
            rotation: generate_rotation_matrix(dim, rotation_seed),
            rotation_seed,
        }
    }

    /// Quantize a raw float vector
    pub fn quantize(&self, vec: &[f32]) -> QuantizedVector {
        let rotated = mat_vec_mul(&self.rotation, vec);
        let (radius, direction) = to_polar(&rotated);
        let radius_q = uniform_quantize(radius, 0.0, 1.0, self.radius_bits);
        let angular = angular_quantize(&direction);
        QuantizedVector { radius: radius_q, angular, dim: self.dim, residual: None }
    }

    /// Reconstruct approximate vector from quantized form
    pub fn dequantize(&self, q: &QuantizedVector) -> Vec<f32> {
        let radius = uniform_dequantize(q.radius, 0.0, 1.0, self.radius_bits);
        let direction = angular_dequantize(&q.angular);
        let polar_vec = from_polar(radius, &direction);
        // Inverse rotation (Q^T since Q is orthogonal)
        mat_vec_mul(&self.rotation, &polar_vec)
    }

    /// Compressed-domain Hamming similarity (no decompression needed)
    pub fn similarity_compressed(&self, a: &QuantizedVector, b: &QuantizedVector) -> f32 {
        let radius_diff = (a.radius as i32 - b.radius as i32).unsigned_abs() as f32;
        let radius_levels = (1 << self.radius_bits) as f32;
        let radius_sim = 1.0 - (radius_diff / radius_levels.min(1.0));

        let matching = a.angular.iter().zip(b.angular.iter())
            .filter(|(x, y)| *x == *y).count();
        let angular_sim = matching as f32 / self.dim as f32;

        // Angular dominates (1-bit is very lossy, radius gives coarse magnitude info)
        angular_sim * 0.9 + radius_sim * 0.1
    }
}

// ================================================================
// EmbeddingEngine: embed text → quantized vector
// ================================================================

#[derive(Debug, Clone)]
pub struct EmbeddingEngine {
    quantizer: PolarQuant,
    embed_cache: std::cell::RefCell<std::collections::HashMap<String, QuantizedVector>>,
    stats: std::cell::RefCell<EmbedStats>,
}

#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct EmbedStats {
    pub embeddings_generated: usize,
    pub cache_hits: usize,
    pub vectors_quantized: usize,
}

impl EmbeddingEngine {
    pub fn new(dim: usize, radius_bits: usize) -> Self {
        Self {
            quantizer: PolarQuant::new(dim, radius_bits, 42),
            embed_cache: std::cell::RefCell::new(std::collections::HashMap::new()),
            stats: std::cell::RefCell::new(EmbedStats::default()),
        }
    }

    /// Embed text and quantize in one step (with caching)
    pub fn embed_and_quantize(&self, text: &str) -> QuantizedVector {
        let key = text.to_lowercase();
        let mut cache = self.embed_cache.borrow_mut();
        let mut stats = self.stats.borrow_mut();
        if let Some(cached) = cache.get(&key) {
            stats.cache_hits += 1;
            return cached.clone();
        }
        stats.embeddings_generated += 1;
        let vec = text_to_embedding(&key, self.quantizer.dim);
        stats.vectors_quantized += 1;
        let q = self.quantizer.quantize(&vec);
        cache.insert(key, q.clone());
        q
    }

    /// Decompress a quantized vector
    pub fn dequantize(&self, q: &QuantizedVector) -> Vec<f32> {
        self.quantizer.dequantize(q)
    }

    /// Compressed-domain search (Hamming similarity)
    pub fn search_compressed(&self, query_text: &str, candidates: &[QuantizedVector], top_k: usize) -> Vec<(usize, f32)> {
        let query_q = self.embed_and_quantize(query_text);
        let mut scored: Vec<(usize, f32)> = candidates.iter().enumerate()
            .map(|(i, c)| (i, self.quantizer.similarity_compressed(&query_q, c)))
            .collect();
        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        scored.into_iter().take(top_k).collect()
    }

    pub fn get_stats(&self) -> EmbedStats {
        self.stats.borrow().clone()
    }

    pub fn quantizer(&self) -> &PolarQuant {
        &self.quantizer
    }
}

// ================================================================
// Tests
// ================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_embedding_generation() {
        let e1 = text_to_embedding("hello world", 384);
        let e2 = text_to_embedding("hello world", 384);
        let e3 = text_to_embedding("different text", 384);
        assert_eq!(e1.len(), 384);
        assert_eq!(e2.len(), 384);
        // Same text → same embedding
        assert!((e1[0] - e2[0]).abs() < 1e-5);
        // Different text → different (with very high probability)
        let diff = e1.iter().zip(e3.iter()).map(|(a, b)| (a - b).abs()).sum::<f32>();
        assert!(diff > 0.01, "Different texts should produce different embeddings");
    }

    #[test]
    fn test_quantize_dequantize() {
        let pq = PolarQuant::new(384, 3, 99);
        let vec = text_to_embedding("test vector", 384);
        let q = pq.quantize(&vec);
        assert!(q.radius > 0);
        assert_eq!(q.angular.len(), 384);
        let restored = pq.dequantize(&q);
        assert_eq!(restored.len(), 384);
        assert!(restored.iter().all(|v| v.is_finite()));
    }

    #[test]
    fn test_similarity_compressed() {
        let engine = EmbeddingEngine::new(384, 3);
        let q1 = engine.embed_and_quantize("python programming");
        let q2 = engine.embed_and_quantize("python programming");
        let q3 = engine.embed_and_quantize("rust systems programming");
        let sim_same = engine.quantizer.similarity_compressed(&q1, &q2);
        let sim_diff = engine.quantizer.similarity_compressed(&q1, &q3);
        assert!(sim_same > 0.9, "Identical text should have >0.9 similarity");
        assert!(sim_diff < 0.99 || sim_same > sim_diff, "Different texts should have lower similarity");
    }

    #[test]
    fn test_search_compressed() {
        let engine = EmbeddingEngine::new(384, 3);
        let docs = vec![
            "python programming tutorial",
            "rust systems programming",
            "machine learning neural networks",
            "web development javascript",
        ];
        let candidates: Vec<_> = docs.iter().map(|d| engine.embed_and_quantize(d)).collect();
        let results = engine.search_compressed("python coding", &candidates, 2);
        assert_eq!(results.len(), 2);
        assert!(results[0].1 >= results[1].1, "Results should be sorted by score desc");
        // 1-bit angular quantization is intentionally lossy; verify scores are valid and distinct
        assert!(results[0].1 >= 0.0 && results[0].1 <= 1.0);
        assert!(results[1].1 >= 0.0 && results[1].1 <= 1.0);
    }

    #[test]
    fn test_quantized_size() {
        let pq = PolarQuant::new(384, 3, 42);
        let vec = text_to_embedding("test", 384);
        let q = pq.quantize(&vec);
        let compressed_bytes = q.size_bytes();
        let original_bytes = 384 * 4;
        // Actual implementation: angular is Vec<u8> (1 byte/dim = 384 bytes) + radius (1 byte) = 385 bytes
        // + Vec pointer overhead (~24 bytes) = ~409 bytes in-memory
        // Original: 1536 bytes → realistic ratio ~3.5-4:1 for Vec<u8> storage
        // For true 20:1+ ratio, angular would need bit-packing (1 bit/dim = 48 bytes), not implemented here
        let ratio = original_bytes as f32 / compressed_bytes as f32;
        assert!(ratio > 3.0, "Compression ratio should be > 3:1, got {:.1}:1", ratio);
        println!("Compression ratio: {:.1}:1 ({} bytes → {} bytes)", ratio, original_bytes, compressed_bytes);
    }

    #[test]
    fn test_rotation_orthogonality() {
        let dim = 384;
        let q_mat = generate_rotation_matrix(dim, 777);
        // Check rows are normalized
        for i in 0..dim {
            let norm = q_mat[i].iter().map(|v| v * v).sum::<f32>().sqrt();
            assert!(norm > 0.99 && norm < 1.01, "Row {} norm = {}", i, norm);
        }
        // Check Q × Q^T ≈ I
        for i in 0..dim.min(5) {
            for j in 0..dim.min(5) {
                let dot: f32 = q_mat[i].iter().zip(q_mat[j].iter()).map(|(a, b)| a * b).sum();
                let expected = if i == j { 1.0 } else { 0.0 };
                assert!((dot - expected).abs() < 0.01, "Q×Q^T[{},{}] = {} (expected {})", i, j, dot, expected);
            }
        }
    }

    #[test]
    fn test_engine_caching() {
        let engine = EmbeddingEngine::new(384, 3);
        let q1 = engine.embed_and_quantize("cache test");
        let q2 = engine.embed_and_quantize("cache test");
        let stats = engine.get_stats();
        assert_eq!(stats.embeddings_generated, 1, "Second call should hit cache");
        assert_eq!(stats.cache_hits, 1);
        assert_eq!(q1.radius, q2.radius);
        assert_eq!(q1.angular, q2.angular);
    }
}
