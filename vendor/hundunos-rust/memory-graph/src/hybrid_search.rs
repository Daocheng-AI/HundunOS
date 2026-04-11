// hybrid_search.rs - BM25 + Vector RRF Hybrid Search
// 借鉴 sage-wiki 的 hybrid search 实现
// Reciprocal Rank Fusion (RRF) 混合搜索

use std::collections::HashMap;

/// RRF 常数 (Cormack et al. 2009)
const RRF_K: f64 = 60.0;

/// 混合搜索结果
#[derive(Debug, Clone)]
pub struct HybridResult<T> {
    pub item: T,
    pub rrf_score: f64,
    pub bm25_rank: Option<usize>,
    pub vector_rank: Option<usize>,
    pub tag_boost: f64,
    pub recency_boost: f64,
}

/// 混合搜索选项
#[derive(Debug, Clone)]
pub struct HybridSearchOpts {
    /// 查询字符串
    pub query: String,
    /// 必须包含的标签（AND 过滤）
    pub tags: Vec<String>,
    /// 提升标签（软后排序）
    pub boost_tags: Vec<String>,
    /// 返回结果数量
    pub limit: usize,
    /// 是否启用 BM25
    pub use_bm25: bool,
    /// 是否启用向量搜索
    pub use_vector: bool,
}

impl Default for HybridSearchOpts {
    fn default() -> Self {
        Self {
            query: String::new(),
            tags: Vec::new(),
            boost_tags: Vec::new(),
            limit: 10,
            use_bm25: true,
            use_vector: true,
        }
    }
}

/// 混合搜索器
pub struct HybridSearcher;

impl HybridSearcher {
    /// 执行 RRF 融合搜索
    /// 
    /// # 参数
    /// - `bm25_results`: BM25 搜索结果 (ID, rank)
    /// - `vector_results`: 向量搜索结果 (ID, rank, score)
    /// - `opts`: 搜索选项
    /// 
    /// # 返回
    /// 按 RRF 分数排序的结果列表
    pub fn fuse<T: Clone>(
        bm25_results: &[(String, usize)],
        vector_results: &[(String, usize, f32)],
        item_lookup: &HashMap<String, T>,
        tag_lookup: &HashMap<String, Vec<String>>,
        opts: &HybridSearchOpts,
    ) -> Vec<HybridResult<T>> {
        let mut fusion_scores: HashMap<String, FusionEntry<T>> = HashMap::new();

        // 添加 BM25 结果
        if opts.use_bm25 {
            for (id, rank) in bm25_results {
                let entry = fusion_scores.entry(id.clone()).or_insert_with(|| FusionEntry {
                    id: id.clone(),
                    item: item_lookup.get(id).cloned(),
                    tags: tag_lookup.get(id).cloned().unwrap_or_default(),
                    bm25_rank: Some(*rank),
                    vector_rank: None,
                });
                entry.bm25_rank = Some(*rank);
            }
        }

        // 添加向量搜索结果
        if opts.use_vector {
            for (id, rank, _score) in vector_results {
                let entry = fusion_scores.entry(id.clone()).or_insert_with(|| FusionEntry {
                    id: id.clone(),
                    item: item_lookup.get(id).cloned(),
                    tags: tag_lookup.get(id).cloned().unwrap_or_default(),
                    bm25_rank: None,
                    vector_rank: Some(*rank),
                });
                entry.vector_rank = Some(*rank);
            }
        }

        // 计算 RRF 分数
        let mut results: Vec<HybridResult<T>> = fusion_scores
            .into_values()
            .filter_map(|entry| {
                let item = entry.item?;
                
                // 基础 RRF 分数
                let mut rrf_score = 0.0;
                if let Some(rank) = entry.bm25_rank {
                    rrf_score += 1.0 / (RRF_K + rank as f64);
                }
                if let Some(rank) = entry.vector_rank {
                    rrf_score += 1.0 / (RRF_K + rank as f64);
                }

                // 标签提升: +3% 每个匹配标签, 上限 15%
                let tag_boost = Self::calculate_tag_boost(&entry.tags, &opts.boost_tags);
                rrf_score += tag_boost;

                // 时间衰减提升: 14天半衰期, 最大 +5%
                // 注意: 这里需要外部传入时间戳
                let recency_boost = 0.0; // 由调用者计算

                Some(HybridResult {
                    item,
                    rrf_score,
                    bm25_rank: entry.bm25_rank,
                    vector_rank: entry.vector_rank,
                    tag_boost,
                    recency_boost,
                })
            })
            .collect();

        // 按 RRF 分数降序排序
        results.sort_by(|a, b| b.rrf_score.partial_cmp(&a.rrf_score).unwrap());
        results.truncate(opts.limit);

        results
    }

    /// 计算标签提升分数
    /// +3% 每个匹配标签, 上限 15%
    fn calculate_tag_boost(entry_tags: &[String], boost_tags: &[String]) -> f64 {
        if boost_tags.is_empty() {
            return 0.0;
        }

        let matches = boost_tags
            .iter()
            .filter(|bt| entry_tags.iter().any(|et| et.eq_ignore_ascii_case(bt)))
            .count();

        (matches as f64 * 0.03).min(0.15)
    }

    /// 计算时间衰减提升分数
    /// 14天半衰期, 最大 +5%
    pub fn calculate_recency_boost(age_days: f64) -> f64 {
        if age_days < 0.0 {
            return 0.05;
        }
        let half_life = 14.0;
        0.05 * (2.0_f64).powf(-age_days / half_life)
    }
}

/// 融合条目（内部使用）
struct FusionEntry<T> {
    id: String,
    item: Option<T>,
    tags: Vec<String>,
    bm25_rank: Option<usize>,
    vector_rank: Option<usize>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rrf_fusion() {
        let bm25_results = vec![
            ("id1".to_string(), 1),
            ("id2".to_string(), 2),
            ("id3".to_string(), 3),
        ];

        let vector_results = vec![
            ("id2".to_string(), 1, 0.9),
            ("id1".to_string(), 3, 0.8),
            ("id4".to_string(), 2, 0.85),
        ];

        let mut item_lookup: HashMap<String, String> = HashMap::new();
        item_lookup.insert("id1".to_string(), "item1".to_string());
        item_lookup.insert("id2".to_string(), "item2".to_string());
        item_lookup.insert("id3".to_string(), "item3".to_string());
        item_lookup.insert("id4".to_string(), "item4".to_string());

        let tag_lookup: HashMap<String, Vec<String>> = HashMap::new();

        let opts = HybridSearchOpts {
            query: "test".to_string(),
            limit: 10,
            ..Default::default()
        };

        let results = HybridSearcher::fuse(
            &bm25_results,
            &vector_results,
            &item_lookup,
            &tag_lookup,
            &opts,
        );

        // id2 在 BM25 排第2，在向量排第1，应该总分最高
        assert!(!results.is_empty());
        assert_eq!(results[0].item, "item2");
    }

    #[test]
    fn test_tag_boost() {
        let boost = HybridSearcher::calculate_tag_boost(
            &vec!["rust".to_string(), "ai".to_string()],
            &vec!["rust".to_string(), "go".to_string()],
        );
        assert_eq!(boost, 0.03);

        let boost_max = HybridSearcher::calculate_tag_boost(
            &vec!["a".to_string(), "b".to_string(), "c".to_string(), "d".to_string(), "e".to_string(), "f".to_string()],
            &vec!["a".to_string(), "b".to_string(), "c".to_string(), "d".to_string(), "e".to_string(), "f".to_string()],
        );
        assert_eq!(boost_max, 0.15); // 上限 15%
    }

    #[test]
    fn test_recency_boost() {
        let fresh = HybridSearcher::calculate_recency_boost(0.0);
        assert!(fresh > 0.04);

        let old = HybridSearcher::calculate_recency_boost(30.0);
        assert!(old < 0.05);
    }
}
