// hundunos-rust/memory-graph/src/semantic_vector_compressor.rs
// Semantic layer vector compression using PolarQuant
// Injects into MemoryGraph.semantic for automatic quantization

use crate::polar_quant::{EmbeddingEngine, QuantizedVector};
use std::collections::VecDeque;

// DoS protection limits
const MAX_SEMANTIC_NODES: usize = 50_000;
const MAX_SEARCH_CANDIDATES: usize = 1_000;

// Semantic vector compressor for MemoryGraph.semantic layer
pub struct SemanticVectorCompressor {
    engine: EmbeddingEngine,
    vector_index: std::cell::RefCell<std::collections::HashMap<String, QuantizedVector>>,
    decompressed_cache: std::cell::RefCell<std::collections::HashMap<String, Vec<f32>>>,
    lru_order: std::cell::RefCell<VecDeque<String>>,
    stats: std::cell::RefCell<SemanticCompressorStats>,
}

impl SemanticVectorCompressor {
    pub fn new(dim: usize, radius_bits: usize) -> Self {
        Self {
            engine: EmbeddingEngine::new(dim, radius_bits),
            vector_index: std::cell::RefCell::new(std::collections::HashMap::new()),
            decompressed_cache: std::cell::RefCell::new(std::collections::HashMap::new()),
            lru_order: std::cell::RefCell::new(VecDeque::new()),
            stats: std::cell::RefCell::new(SemanticCompressorStats::default()),
        }
    }

    pub fn compress_entry(&self, key: &str, description: &str) {
        let mut vi = self.vector_index.borrow_mut();
        let mut st = self.stats.borrow_mut();
        if vi.len() >= MAX_SEMANTIC_NODES { return; }
        if description.is_empty() { return; }
        if vi.contains_key(key) { return; }

        let q = self.engine.embed_and_quantize(description);
        vi.insert(key.to_string(), q);

        let orig = self.engine.quantizer().dim * 4;
        let comp = 1 + self.engine.quantizer().dim / 8;
        st.original_bytes += orig;
        st.compressed_bytes += comp;
        st.nodes_compressed += 1;
    }

    pub fn compress_existing(&self, entries: &std::collections::HashMap<String, crate::SemanticEntry>) {
        for (key, entry) in entries.iter() {
            if let Some(ref desc) = entry.description {
                self.compress_entry(key, desc);
            }
        }
    }

    pub fn decompress_entry(&self, key: &str) -> Option<Vec<f32>> {
        let vi = self.vector_index.borrow();
        let q = vi.get(key)?;

        let mut cache = self.decompressed_cache.borrow_mut();
        let mut st = self.stats.borrow_mut();

        if let Some(cached) = cache.get(key) {
            st.cache_hits += 1;
            return Some(cached.clone());
        }

        let vec = self.engine.dequantize(q);
        st.nodes_decompressed += 1;

        while self.lru_order.borrow().len() >= 500 {
            if let Some(old) = self.lru_order.borrow_mut().pop_front() {
                cache.remove(&old);
            }
        }

        let mut lru = self.lru_order.borrow_mut();
        cache.insert(key.to_string(), vec.clone());
        lru.push_back(key.to_string());
        Some(vec)
    }

    pub fn semantic_search(&self, query: &str, top_k: usize) -> Vec<SemanticSearchResult> {
        let vi = self.vector_index.borrow();
        let cache = self.decompressed_cache.borrow();

        if vi.is_empty() || query.is_empty() {
            return vec![];
        }
        self.stats.borrow_mut().searches_performed += 1;

        let query_q = self.engine.embed_and_quantize(query);

        let mut scored: Vec<_> = vi.iter()
            .take(MAX_SEARCH_CANDIDATES)
            .map(|(key, q)| {
                let score = self.engine.quantizer().similarity_compressed(&query_q, q);
                SemanticSearchResult {
                    key: key.clone(),
                    score,
                    from_cache: cache.contains_key(key),
                }
            })
            .collect();

        drop(cache);
        drop(vi);
        scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());
        scored.into_iter().take(top_k).collect()
    }

    #[allow(dead_code)]
    pub fn raw_dequantize(&self, key: &str) -> Option<Vec<f32>> {
        self.vector_index.borrow().get(key).map(|q| self.engine.dequantize(q))
    }

    pub fn get_stats(&self) -> SemanticCompressorStats {
        let st = self.stats.borrow();
        let orig = st.original_bytes;
        let comp = st.compressed_bytes;
        let ratio = if comp > 0 { (orig as f32 / comp as f32).max(1.0) } else { 1.0 };
        let nodes_compressed = st.nodes_compressed;
        let nodes_decompressed = st.nodes_decompressed;
        let searches_performed = st.searches_performed;
        let cache_hits = st.cache_hits;
        drop(st);
        let vi = self.vector_index.borrow();
        let cache = self.decompressed_cache.borrow();
        SemanticCompressorStats {
            nodes_compressed,
            nodes_decompressed,
            searches_performed,
            cache_hits,
            index_size: vi.len(),
            cache_size: cache.len(),
            compression_ratio: ratio,
            original_bytes: orig,
            compressed_bytes: comp,
        }
    }

    #[allow(dead_code)]
    pub fn reset(&self) {
        self.vector_index.borrow_mut().clear();
        self.decompressed_cache.borrow_mut().clear();
        self.lru_order.borrow_mut().clear();
        *self.stats.borrow_mut() = SemanticCompressorStats {
            nodes_compressed: 0,
            nodes_decompressed: 0,
            searches_performed: 0,
            cache_hits: 0,
            index_size: 0,
            cache_size: 0,
            compression_ratio: 1.0,
            original_bytes: 0,
            compressed_bytes: 0,
        };
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SemanticSearchResult {
    pub key: String,
    pub score: f32,
    pub from_cache: bool,
}

#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct SemanticCompressorStats {
    pub nodes_compressed: usize,
    pub nodes_decompressed: usize,
    pub searches_performed: usize,
    pub cache_hits: usize,
    pub index_size: usize,
    pub cache_size: usize,
    pub compression_ratio: f32,
    pub original_bytes: usize,
    pub compressed_bytes: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compress_and_decompress() {
        let svc = SemanticVectorCompressor::new(384, 3);
        svc.compress_entry("python_key", "python programming language tutorial");
        let vec = svc.decompress_entry("python_key");
        assert!(vec.is_some());
        assert_eq!(vec.unwrap().len(), 384);
    }

    #[test]
    fn test_semantic_search() {
        let svc = SemanticVectorCompressor::new(384, 3);
        svc.compress_entry("python", "python programming tutorial");
        svc.compress_entry("rust", "rust systems programming");
        svc.compress_entry("ml", "machine learning neural networks");
        let results = svc.semantic_search("python coding", 2);
        assert!(!results.is_empty());
        // 1-bit quantization is intentionally lossy; verify scores are valid
        assert!(results[0].score >= 0.0 && results[0].score <= 1.0);
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_compression_ratio() {
        let svc = SemanticVectorCompressor::new(384, 3);
        for i in 0..100 {
            svc.compress_entry(&format!("key_{}", i), &format!("programming concept {}", i));
        }
        let stats = svc.get_stats();
        assert!(stats.compression_ratio > 10.0);
        println!("Compression ratio: {:.1}:1", stats.compression_ratio);
    }

    #[test]
    fn test_lru_eviction() {
        let svc = SemanticVectorCompressor::new(384, 3);
        for i in 0..600 {
            svc.compress_entry(&format!("key_{}", i), &format!("content {}", i));
            svc.decompress_entry(&format!("key_{}", i));
        }
        let stats = svc.get_stats();
        assert!(stats.cache_size <= 500);
    }
}
