// hundunos-rust/memory-graph/src/main.rs
// HundunOS Memory Graph - Rust Implementation v2.1
// Hierarchical memory system with edict-inspired enhancements + SQLite FTS5 search
//
// v2.1 升级（参考 Hermes-Agent SessionDB）：
//   - SQLite FTS5 全文搜索（hermes_state.py 模式）
//   - WAL 模式 + 随机 jitter 重试
//   - snippet() 高亮上下文返回
//   - FTS5 查询清洗防止注入

use anyhow::Result;
use serde::{Deserialize, Serialize};

mod polar_quant;
mod semantic_vector_compressor;
mod hybrid_search;
mod sqlite_pool;

use semantic_vector_compressor::SemanticVectorCompressor;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;
use dashmap::DashMap;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt};
use tokio::sync::RwLock;
use rusqlite::{Connection, params};
use rand::Rng;
use std::sync::Mutex;

// ================================================================
// Type Definitions
// ================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryNode {
    pub id: String,
    pub timestamp: u64,
    pub content: String,
    pub intent: String,
    pub importance: u8,  // 1-5
    pub result: bool,
    // v2.0: New fields
    pub ttl: Option<u64>,           // Time to live in milliseconds
    pub tags: Vec<String>,          // Tags for categorization
    pub source: Option<String>,     // Source of the memory
    pub embedding: Option<Vec<f32>>, // Vector embedding for similarity search
    pub relevance_score: Option<f32>, // Computed relevance score
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticEntry {
    pub key: String,
    pub count: u32,
    pub description: Option<String>,
    pub last_seen: u64,
    pub entries: Vec<String>,
    pub aggregated_importance: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpisodicEntry {
    pub id: String,
    pub timestamp: u64,
    pub content: String,
    pub intent: String,
    pub result: bool,
    pub importance: u8,
    pub full: bool,
    pub summary: Option<String>,    // Distilled summary
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextEntry {
    pub value: serde_json::Value,
    pub timestamp: u64,
    pub ttl: u64,
    pub priority: u8,               // Priority for injection (1-5)
}

// v2.0: Memory snapshot for persistence
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemorySnapshot {
    pub timestamp: u64,
    pub working: Vec<MemoryNode>,
    pub recent: Vec<MemoryNode>,
    pub semantic: Vec<SemanticEntry>,
    pub episodic: Vec<EpisodicEntry>,
    pub hierarchy: HashMap<String, HashMap<String, ContextEntry>>,
    pub version: String,
}

// v2.0: Search result with relevance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub node: MemoryNode,
    pub relevance: f32,
    pub layer: MemoryLayer,
}

// v2.2: Hybrid search result (BM25 + Vector RRF)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HybridSearchResult {
    pub node: MemoryNode,
    pub rrf_score: f32,
    pub bm25_rank: Option<usize>,
    pub vector_rank: Option<usize>,
    pub tag_boost: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MemoryLayer {
    Working,
    Recent,
    Semantic,
    Episodic,
}

// v2.0: Three-level memory injection (align with edict dispatch_worker)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryInjection {
    pub immediate: Vec<MemoryNode>,     // High priority, injected first
    pub relevant: Vec<MemoryNode>,      // Contextually relevant
    pub background: Vec<MemoryNode>,    // General background knowledge
}

// ================================================================
// v2.1 SQLite FTS5 Store（参考 Hermes-Agent SessionDB）
// Hermes 实现了 WAL + FTS5，HundunOS-Rust 同步升级
// ================================================================

const FTS_WRITE_MAX_RETRIES: usize = 15;
const FTS_WRITE_RETRY_MIN_MS: u64 = 20;
const FTS_WRITE_RETRY_MAX_MS: u64 = 150;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FtsSearchResult {
    pub id: String,
    pub content: String,
    pub snippet: String,       // snippet() 高亮上下文
    pub layer: String,
    pub timestamp: u64,
    pub intent: String,
    pub importance: u8,
    pub relevance: f32,
}

pub struct SqliteFts5Store {
    conn: Mutex<Connection>,
}

impl SqliteFts5Store {
    /// 初始化 FTS5 虚拟表（WAL 模式，参考 Hermes）
    pub fn new(db_path: &str) -> Result<Self> {
        let conn = Connection::open(db_path)?;

        // Hermes 模式：WAL 模式提升并发读写性能
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")?;

        // 创建 FTS5 虚拟表（content= 指定镜像源表）
        conn.execute_batch(
            "CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
                content,
                intent,
                layer,
                content=messages,
                content_rowid=id
            );"
        )?;

        // 镜像源表（FTS5 content= 依赖）
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS messages(
                id INTEGER PRIMARY KEY,
                memory_id TEXT,
                content TEXT,
                intent TEXT,
                layer TEXT,
                timestamp INTEGER,
                importance INTEGER
            );"
        )?;

        Ok(Self { conn: Mutex::new(conn) })
    }

    /// 记录一条记忆到 FTS5（带 WAL jitter 重试，参考 Hermes）
    pub fn record(&self, memory_id: &str, content: &str, intent: &str, layer: &str, timestamp: u64, importance: u8) -> Result<()> {
        let mut rng = rand::thread_rng();
        let mut retries = 0;

        loop {
            match self._try_record(memory_id, content, intent, layer, timestamp, importance) {
                Ok(()) => return Ok(()),
                Err(e) => {
                    retries += 1;
                    if retries >= FTS_WRITE_MAX_RETRIES {
                        return Err(e);
                    }
                    // 随机 jitter 退避（Hermes 模式）
                    let delay_ms = rng.gen_range(FTS_WRITE_RETRY_MIN_MS..FTS_WRITE_RETRY_MAX_MS);
                    std::thread::sleep(std::time::Duration::from_millis(delay_ms));
                }
            }
        }
    }

    fn _try_record(&self, _memory_id: &str, content: &str, intent: &str, layer: &str, timestamp: u64, importance: u8) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO messages(content, intent, layer, timestamp, importance) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![content, intent, layer, timestamp, importance],
        )?;

        // 获取 rowid 并触发 FTS5 索引更新
        let rowid: i64 = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO messages_fts(rowid, content, intent, layer) VALUES (?1, ?2, ?3, ?4)",
            params![rowid, content, intent, layer],
        )?;
        Ok(())
    }

    /// FTS5 搜索（支持 snippet() 高亮，Hermes 模式）
    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<FtsSearchResult>> {
        let sanitized = self._sanitize_fts5_query(query);
        let conn = self.conn.lock().unwrap();

        let mut stmt = conn.prepare(
            "SELECT m.memory_id, m.content, snippet(messages_fts, 0, '<mark>', '</mark>', '...', 32) AS snippet,
                    m.layer, m.timestamp, m.intent, m.importance,
                    bm25(messages_fts) AS rank
             FROM messages_fts
             JOIN messages m ON messages_fts.rowid = m.id
             WHERE messages_fts MATCH ?1
             ORDER BY rank
             LIMIT ?2"
        )?;

        let results = stmt.query_map(params![sanitized, limit as i64], |row| {
                Ok(FtsSearchResult {
                    id: row.get::<_, String>(0)?,
                    content: row.get::<_, String>(1)?,
                    snippet: row.get::<_, String>(2)?,
                    layer: row.get::<_, String>(3)?,
                    timestamp: row.get::<_, u64>(4)?,
                    intent: row.get::<_, String>(5)?,
                    importance: row.get::<_, u8>(6)?,
                    relevance: (1.0 / ((row.get::<_, f64>(7)?.abs() + 0.1) as f32).max(0.1)) as f32,
                })
        })?;

        let mut out = Vec::new();
        for r in results {
            out.push(r?);
        }
        Ok(out)
    }

    /// 按层过滤搜索
    pub fn search_filtered(&self, query: &str, layer_filter: Option<&str>, limit: usize) -> Result<Vec<FtsSearchResult>> {
        let sanitized = self._sanitize_fts5_query(query);
        let conn = self.conn.lock().unwrap();

        let sql = match layer_filter {
            Some(_) => {
                "SELECT m.memory_id, m.content, snippet(messages_fts, 0, '<mark>', '</mark>', '...', 32),
                        m.layer, m.timestamp, m.intent, m.importance, bm25(messages_fts)
                 FROM messages_fts
                 JOIN messages m ON messages_fts.rowid = m.id
                 WHERE messages_fts MATCH ?1 AND m.layer = ?3
                 ORDER BY rank LIMIT ?2"
            }
            None => {
                "SELECT m.memory_id, m.content, snippet(messages_fts, 0, '<mark>', '</mark>', '...', 32),
                        m.layer, m.timestamp, m.intent, m.importance, bm25(messages_fts)
                 FROM messages_fts
                 JOIN messages m ON messages_fts.rowid = m.id
                 WHERE messages_fts MATCH ?1
                 ORDER BY rank LIMIT ?2"
            }
        };

        let mut stmt = conn.prepare(sql)?;

        // v2.1: 统一结果收集（解决 match arms 类型冲突 + turbofish 正确语法）
        let mut out = Vec::new();
        let f = |row: &rusqlite::Row| -> rusqlite::Result<FtsSearchResult> {
            let rank: f64 = row.get(7)?;
            Ok(FtsSearchResult {
                id: row.get(0)?, content: row.get(1)?, snippet: row.get(2)?,
                layer: row.get(3)?, timestamp: row.get(4)?, intent: row.get(5)?,
                importance: row.get(6)?,
                relevance: (1.0 / ((rank.abs() + 0.1) as f32).max(0.1)) as f32,
            })
        };
        match layer_filter {
            Some(lf) => {
                let mut rows = stmt.query(params![sanitized, limit as i64, lf])?;
                while let Some(row) = rows.next()? {
                    out.push(f(&row)?);
                }
            }
            None => {
                let mut rows = stmt.query(params![sanitized, limit as i64])?;
                while let Some(row) = rows.next()? {
                    out.push(f(&row)?);
                }
            }
        };
        Ok(out)
    }

    /// 获取 FTS5 索引统计
    pub fn get_stats(&self) -> Result<Fts5Stats> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM messages", [], |row| row.get(0)
        )?;
        let fts_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM messages_fts", [], |row| row.get(0)
        )?;
        Ok(Fts5Stats { total_records: count as usize, fts_indexed: fts_count as usize })
    }

    /// 清洗 FTS5 查询（防止注入，参考 Hermes _sanitize_fts5_query）
    fn _sanitize_fts5_query(&self, query: &str) -> String {
        // 去除 FTS5 特殊操作符，只保留安全字符
        let cleaned: String = query
            .chars()
            .filter(|c| c.is_alphanumeric() || c.is_whitespace())
            .collect::<String>()
            .trim()
            .to_string();

        // 空查询返回通配符
        if cleaned.is_empty() {
            return "*".to_string();
        }

        // 前缀搜索支持（Hermes 风格）
        let words: Vec<&str> = cleaned.split_whitespace().collect();
        words.iter()
            .map(|w| format!("{}*", w))
            .collect::<Vec<_>>()
            .join(" ")
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Fts5Stats {
    pub total_records: usize,
    pub fts_indexed: usize,
}

// ================================================================
// Memory Graph
// ================================================================

pub struct MemoryGraph {
    // Four-layer memory
    working: DashMap<String, MemoryNode>,
    recent: RwLock<Vec<MemoryNode>>,
    semantic: DashMap<String, SemanticEntry>,
    episodic: RwLock<Vec<EpisodicEntry>>,
    
    // Hierarchical context (OpenViking style)
    hierarchy: RwLock<HashMap<String, HashMap<String, ContextEntry>>>,
    
    // v2.0: In-memory fallback search index
    search_index: DashMap<String, HashSet<String>>, // word -> memory_ids
    
    // v2.1: SQLite FTS5 store (primary search engine)
    fts5: Option<SqliteFts5Store>,

    // TurboQuant: Semantic layer vector compression
    semantic_compressor: SemanticVectorCompressor,
    
    // Configuration
    max_recent: usize,
    max_episodic: usize,
    promotion_threshold: u8,
    
    // Stats
    reads: RwLock<u64>,
    writes: RwLock<u64>,
    promotions: RwLock<u64>,
    searches: RwLock<u64>,
    distillations: RwLock<u64>,
    fts_searches: RwLock<u64>,
}

impl MemoryGraph {
    pub fn new() -> Self {
        // v2.1: 自动检测 HUNDUNOS_FTS5_DB 环境变量启用 FTS5
        let db_path = std::env::var("HUNDUNOS_FTS5_DB").ok();
        let fts5 = db_path.as_ref().and_then(|p| Self::try_init_fts5(p));
        Self::with_fts5(fts5)
    }

    /// v2.1: 支持 SQLite FTS5 的构造函数
    pub fn with_fts5(fts5: Option<SqliteFts5Store>) -> Self {
        let mut hierarchy = HashMap::new();
        hierarchy.insert("session".to_string(), HashMap::new());
        hierarchy.insert("project".to_string(), HashMap::new());
        hierarchy.insert("user".to_string(), HashMap::new());
        hierarchy.insert("global".to_string(), HashMap::new());

        Self {
            working: DashMap::new(),
            recent: RwLock::new(Vec::new()),
            semantic: DashMap::new(),
            episodic: RwLock::new(Vec::new()),
            hierarchy: RwLock::new(hierarchy),
            search_index: DashMap::new(),
            fts5,
            semantic_compressor: SemanticVectorCompressor::new(384, 3),
            max_recent: 100,
            max_episodic: 50,
            promotion_threshold: 5,
            reads: RwLock::new(0),
            writes: RwLock::new(0),
            promotions: RwLock::new(0),
            searches: RwLock::new(0),
            distillations: RwLock::new(0),
            fts_searches: RwLock::new(0),
        }
    }

    /// v2.1: 初始化 FTS5 存储（WAL + FTS5）
    /// 使用 Option+Some 模式支持 Arc-wrapped MemoryGraph
    pub fn try_init_fts5(db_path: &str) -> Option<SqliteFts5Store> {
        match SqliteFts5Store::new(db_path) {
            Ok(store) => {
                tracing::info!("FTS5 search engine initialized at {}", db_path);
                Some(store)
            }
            Err(e) => {
                tracing::error!("Failed to init FTS5 at {}: {}", db_path, e);
                None
            }
        }
    }

    pub async fn record(&self, content: &str, intent: &str, result: bool) -> MemoryNode {
        let mut writes = self.writes.write().await;
        *writes += 1;
        drop(writes);
        
        let importance = self.calculate_importance(intent, result);
        let node = MemoryNode {
            id: format!("mem_{}", Uuid::new_v4()),
            timestamp: current_timestamp(),
            content: content.to_string(),
            intent: intent.to_string(),
            importance,
            result,
            ttl: Some(86400000), // 24 hours default TTL
            tags: self.extract_tags(content, intent),
            source: None,
            embedding: None,
            relevance_score: None,
        };

        // Layer 1: Working memory
        self.working.insert(node.id.clone(), node.clone());

        // v2.1: 同时写入 FTS5 索引（Hermes 模式）
        if let Some(fts) = &self.fts5 {
            if let Err(e) = fts.record(&node.id, &node.content, &node.intent, "working", node.timestamp, node.importance) {
                tracing::warn!("FTS5 write failed (working): {}", e);
            }
        }

        // Layer 2: Recent memory
        {
            let mut recent = self.recent.write().await;
            recent.insert(0, node.clone());
            if recent.len() > self.max_recent {
                recent.pop();
            }
        }

        // Update search index
        self.index_node(&node);

        // Layer 3: Semantic promotion
        if importance >= self.promotion_threshold {
            self.promote_to_semantic(&node).await;
        }

        // Layer 4: Episodic memory
        if importance >= 3 {
            let mut episodic = self.episodic.write().await;
            episodic.insert(0, EpisodicEntry {
                id: node.id.clone(),
                timestamp: node.timestamp,
                content: node.content.clone(),
                intent: node.intent.clone(),
                result: node.result,
                importance: node.importance,
                full: true,
                summary: None,
            });
            if episodic.len() > self.max_episodic {
                episodic.pop();
            }

            // v2.1: Episodic 也写入 FTS5（参考 Hermes SessionDB）
            if let Some(fts) = &self.fts5 {
                if let Err(e) = fts.record(&node.id, &node.content, &node.intent, "episodic", node.timestamp, node.importance) {
                    tracing::warn!("FTS5 write failed (episodic): {}", e);
                }
            }
        }

        node
    }

    // v2.1: Full-text search — 优先 FTS5，回退 in-memory
    pub async fn search(&self, query: &str, limit: Option<usize>) -> Vec<SearchResult> {
        let mut searches = self.searches.write().await;
        *searches += 1;
        drop(searches);

        let limit = limit.unwrap_or(10);

        // v2.1: FTS5 优先搜索（Hermes 模式）
        if let Some(fts) = &self.fts5 {
            let mut fts_searches = self.fts_searches.write().await;
            *fts_searches += 1;
            drop(fts_searches);

            match fts.search(query, limit) {
                Ok(fts_results) => {
                    return fts_results.into_iter().map(|r| {
                        let node = MemoryNode {
                            id: r.id.clone(),
                            timestamp: r.timestamp,
                            content: r.content,
                            intent: r.intent,
                            importance: r.importance,
                            result: true,
                            ttl: None,
                            tags: vec![],
                            source: Some("fts5".to_string()),
                            embedding: None,
                            relevance_score: Some(r.relevance),
                        };
                        let layer = match r.layer.as_str() {
                            "working" => MemoryLayer::Working,
                            "recent" => MemoryLayer::Recent,
                            "semantic" => MemoryLayer::Semantic,
                            _ => MemoryLayer::Episodic,
                        };
                        SearchResult { node, relevance: r.relevance, layer }
                    }).collect();
                }
                Err(e) => {
                    tracing::warn!("FTS5 search failed, falling back to in-memory: {}", e);
                }
            }
        }
        let query_lower = query.to_lowercase();
        let query_words: Vec<&str> = query_lower.split_whitespace().collect();
        
        let mut results: HashMap<String, (MemoryNode, f32, MemoryLayer)> = HashMap::new();

        // Search in working memory
        for entry in self.working.iter() {
            let node = entry.value();
            if let Some(score) = self.calculate_relevance(node, &query_words) {
                if score > 0.0 {
                    results.insert(node.id.clone(), (node.clone(), score, MemoryLayer::Working));
                }
            }
        }

        // Search in recent memory
        {
            let recent = self.recent.read().await;
            for node in recent.iter() {
                if let Some(score) = self.calculate_relevance(node, &query_words) {
                    if score > 0.0 {
                        results.entry(node.id.clone())
                            .and_modify(|(_, s, _)| *s = s.max(score))
                            .or_insert((node.clone(), score, MemoryLayer::Recent));
                    }
                }
            }
        }

        // Search in semantic memory
        for entry in self.semantic.iter() {
            let semantic = entry.value();
            if semantic.key.to_lowercase().contains(&query_lower) {
                // Find associated nodes
                for node_id in &semantic.entries {
                    if let Some(node) = self.working.get(node_id) {
                        results.entry(node_id.clone())
                            .and_modify(|(_, s, _)| *s += 0.5)
                            .or_insert((node.clone(), 0.5, MemoryLayer::Semantic));
                    }
                }
            }
        }

        // Search in episodic memory
        {
            let episodic = self.episodic.read().await;
            for entry in episodic.iter() {
                if let Some(score) = self.calculate_relevance_episodic(entry, &query_words) {
                    if score > 0.0 {
                        // Convert episodic to memory node for result
                        let node = MemoryNode {
                            id: entry.id.clone(),
                            timestamp: entry.timestamp,
                            content: entry.content.clone(),
                            intent: entry.intent.clone(),
                            importance: entry.importance,
                            result: entry.result,
                            ttl: None,
                            tags: vec![],
                            source: None,
                            embedding: None,
                            relevance_score: Some(score),
                        };
                        results.entry(entry.id.clone())
                            .and_modify(|(_, s, _)| *s = s.max(score))
                            .or_insert((node, score, MemoryLayer::Episodic));
                    }
                }
            }
        }

        // Convert to sorted results
        let mut sorted: Vec<SearchResult> = results.into_iter()
            .map(|(_, (node, relevance, layer))| SearchResult {
                node,
                relevance,
                layer,
            })
            .collect();
        
        sorted.sort_by(|a, b| b.relevance.partial_cmp(&a.relevance).unwrap());
        sorted.truncate(limit);

        sorted
    }

    /// v2.2: Hybrid Search (BM25 + Vector RRF)
    /// 借鉴 sage-wiki 的 hybrid search 实现
    /// 
    /// # 参数
    /// - `query`: 查询字符串
    /// - `query_vec`: 查询向量（可选，为 None 时只使用 BM25）
    /// - `limit`: 返回结果数量
    /// - `boost_tags`: 提升标签列表
    /// 
    /// # 返回
    /// 按 RRF 分数排序的搜索结果
    pub async fn hybrid_search(
        &self,
        query: &str,
        query_vec: Option<&[f32]>,
        limit: usize,
        boost_tags: &[String],
    ) -> Vec<HybridSearchResult> {
        use hybrid_search::{HybridSearcher, HybridSearchOpts, HybridResult};
        
        let mut searches = self.searches.write().await;
        *searches += 1;
        drop(searches);

        // 1. BM25 搜索 (通过 FTS5)
        let mut bm25_results: Vec<(String, usize)> = Vec::new();
        if let Some(fts) = &self.fts5 {
            let mut fts_searches = self.fts_searches.write().await;
            *fts_searches += 1;
            drop(fts_searches);

            match fts.search(query, limit * 3) {
                Ok(fts_results) => {
                    bm25_results = fts_results.into_iter()
                        .enumerate()
                        .map(|(idx, r)| (r.id, idx + 1))
                        .collect();
                }
                Err(e) => {
                    tracing::warn!("FTS5 search failed in hybrid: {}", e);
                }
            }
        }

        // 2. 向量搜索（如果提供了查询向量）
        let mut vector_results: Vec<(String, usize, f32)> = Vec::new();
        if let Some(qvec) = query_vec {
            // 使用 semantic_compressor 进行向量搜索
            // 收集所有节点的向量
            let candidates: Vec<(String, Vec<f32>)> = self.working
                .iter()
                .filter_map(|entry| {
                    let node = entry.value();
                    node.embedding.as_ref().map(|emb| (node.id.clone(), emb.clone()))
                })
                .collect();

            // 计算余弦相似度并排序
            let mut similarities: Vec<(String, f32)> = candidates
                .into_iter()
                .map(|(id, vec)| {
                    let sim = Self::cosine_similarity(qvec, &vec);
                    (id, sim)
                })
                .collect();
            
            similarities.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
            similarities.truncate(limit * 3);

            vector_results = similarities.into_iter()
                .enumerate()
                .map(|(idx, (id, score))| (id, idx + 1, score))
                .collect();
        }

        // 3. 构建查找表
        let mut item_lookup: std::collections::HashMap<String, MemoryNode> = std::collections::HashMap::new();
        let mut tag_lookup: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();

        // 从 working memory 收集
        for entry in self.working.iter() {
            let node = entry.value().clone();
            tag_lookup.insert(node.id.clone(), node.tags.clone());
            item_lookup.insert(node.id.clone(), node);
        }

        // 从 recent memory 收集
        {
            let recent = self.recent.read().await;
            for node in recent.iter() {
                tag_lookup.insert(node.id.clone(), node.tags.clone());
                item_lookup.entry(node.id.clone()).or_insert_with(|| node.clone());
            }
        }

        // 4. 执行 RRF 融合
        let opts = HybridSearchOpts {
            query: query.to_string(),
            tags: Vec::new(),
            boost_tags: boost_tags.to_vec(),
            limit,
            use_bm25: !bm25_results.is_empty(),
            use_vector: !vector_results.is_empty(),
        };

        let hybrid_results: Vec<HybridResult<MemoryNode>> = HybridSearcher::fuse(
            &bm25_results,
            &vector_results,
            &item_lookup,
            &tag_lookup,
            &opts,
        );

        // 5. 转换为搜索结果
        hybrid_results.into_iter()
            .map(|hr| HybridSearchResult {
                node: hr.item,
                rrf_score: hr.rrf_score as f32,
                bm25_rank: hr.bm25_rank,
                vector_rank: hr.vector_rank,
                tag_boost: hr.tag_boost as f32,
            })
            .collect()
    }

    /// 计算余弦相似度
    fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
        if a.len() != b.len() || a.is_empty() {
            return 0.0;
        }
        
        let dot_product: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
        let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
        let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
        
        if norm_a == 0.0 || norm_b == 0.0 {
            return 0.0;
        }
        
        dot_product / (norm_a * norm_b)
    }

    // Legacy recall method (backward compatible)
    pub async fn recall(&self, query: &str) -> RecallResult {
        let mut reads = self.reads.write().await;
        *reads += 1;
        drop(reads);

        let q = query.to_lowercase();

        let mut results = RecallResult {
            working: Vec::new(),
            recent: Vec::new(),
            semantic: Vec::new(),
            episodic: Vec::new(),
        };

        // Search recent
        {
            let recent = self.recent.read().await;
            for node in recent.iter().take(10) {
                if node.content.to_lowercase().contains(&q) || 
                   node.intent.to_lowercase().contains(&q) {
                    results.recent.push(node.clone());
                }
            }
        }

        // Search semantic
        for entry in self.semantic.iter() {
            if entry.key().contains(&q) {
                results.semantic.push(entry.value().clone());
            }
        }

        // Search episodic
        {
            let episodic = self.episodic.read().await;
            for entry in episodic.iter().take(5) {
                if entry.content.to_lowercase().contains(&q) {
                    results.episodic.push(entry.clone());
                }
            }
        }

        results
    }

    pub async fn set_context(&self, level: &str, key: &str, value: serde_json::Value, priority: Option<u8>) {
        let mut hierarchy = self.hierarchy.write().await;
        if let Some(level_map) = hierarchy.get_mut(level) {
            level_map.insert(key.to_string(), ContextEntry {
                value,
                timestamp: current_timestamp(),
                ttl: 3600000, // 1 hour
                priority: priority.unwrap_or(3),
            });
        }
    }

    pub async fn get_context(&self, level: &str, key: &str) -> Option<serde_json::Value> {
        let hierarchy = self.hierarchy.read().await;
        if let Some(level_map) = hierarchy.get(level) {
            if let Some(entry) = level_map.get(key) {
                // Check TTL
                if current_timestamp() - entry.timestamp > entry.ttl {
                    return None;
                }
                return Some(entry.value.clone());
            }
        }
        None
    }

    pub async fn get_context_chain(&self) -> HashMap<String, HashMap<String, ContextEntry>> {
        let hierarchy = self.hierarchy.read().await;
        hierarchy.clone()
    }

    // v2.0: Three-level memory injection (align with edict dispatch_worker)
    pub async fn get_memory_injection(&self, context: &str, max_tokens: Option<usize>) -> MemoryInjection {
        let max_tokens = max_tokens.unwrap_or(4000);
        let mut injection = MemoryInjection {
            immediate: Vec::new(),
            relevant: Vec::new(),
            background: Vec::new(),
        };

        // Immediate: High priority context from hierarchy
        {
            let hierarchy = self.hierarchy.read().await;
            for (level, entries) in hierarchy.iter() {
                for (key, entry) in entries.iter() {
                    if entry.priority >= 4 {
                        let node = MemoryNode {
                            id: format!("ctx_{}_{}", level, key),
                            timestamp: entry.timestamp,
                            content: format!("{}: {}", key, entry.value.to_string()),
                            intent: format!("context_{}", level),
                            importance: entry.priority,
                            result: true,
                            ttl: Some(entry.ttl),
                            tags: vec![level.clone()],
                            source: Some("hierarchy".to_string()),
                            embedding: None,
                            relevance_score: Some(entry.priority as f32 / 5.0),
                        };
                        injection.immediate.push(node);
                    }
                }
            }
        }

        // Relevant: Search for context-related memories
        let search_results = self.search(context, Some(10)).await;
        for result in search_results {
            if result.relevance >= 0.7 {
                injection.relevant.push(result.node);
            } else if result.relevance >= 0.3 {
                injection.background.push(result.node);
            }
        }

        // Background: Recent important memories
        {
            let recent = self.recent.read().await;
            for node in recent.iter().take(5) {
                if node.importance >= 4 {
                    injection.background.push(node.clone());
                }
            }
        }

        // Trim to token limit (rough estimate)
        let mut total_tokens = 0;
        injection.immediate.retain(|n| {
            let tokens = n.content.len() / 4;
            total_tokens += tokens;
            total_tokens <= max_tokens
        });
        injection.relevant.retain(|n| {
            let tokens = n.content.len() / 4;
            total_tokens += tokens;
            total_tokens <= max_tokens
        });
        injection.background.retain(|n| {
            let tokens = n.content.len() / 4;
            total_tokens += tokens;
            total_tokens <= max_tokens
        });

        injection
    }

    // v2.0: Memory distillation - extract key information
    pub async fn distill(&self) -> Vec<EpisodicEntry> {
        let mut distillations = self.distillations.write().await;
        *distillations += 1;
        drop(distillations);

        let mut distilled = Vec::new();
        let mut hierarchy = self.hierarchy.write().await;

        // Extract important concepts from recent to project level
        let mut count = 0u32;
        {
            let recent = self.recent.read().await;
            for node in recent.iter().filter(|n| n.importance >= 4) {
                let key = format!("concept_{}", node.intent);
                let summary = format!("{}...", &node.content[..100.min(node.content.len())]);
                count += 1;
                
                if let Some(level_map) = hierarchy.get_mut("project") {
                    let count = if let Some(entry) = level_map.get(&key) {
                        entry.value.as_u64().unwrap_or(0) as u32 + 1
                    } else {
                        1
                    };
                    level_map.insert(key.clone(), ContextEntry {
                        value: serde_json::json!({
                            "description": summary,
                            "count": count
                        }),
                        timestamp: current_timestamp(),
                        ttl: 86400000, // 24 hours
                        priority: node.importance,
                    });
                }

                distilled.push(EpisodicEntry {
                    id: format!("distilled_{}", node.id),
                    timestamp: node.timestamp,
                    content: summary,
                    intent: node.intent.clone(),
                    result: node.result,
                    importance: node.importance,
                    full: false,
                    summary: Some(format!("Distilled from {} interactions", count)),
                });
            }
        }

        distilled
    }

    // v2.0: Create memory snapshot
    pub async fn create_snapshot(&self) -> MemorySnapshot {
        let recent = self.recent.read().await;
        let episodic = self.episodic.read().await;
        let hierarchy = self.hierarchy.read().await;

        MemorySnapshot {
            timestamp: current_timestamp(),
            working: self.working.iter().map(|e| e.value().clone()).collect(),
            recent: recent.clone(),
            semantic: self.semantic.iter().map(|e| e.value().clone()).collect(),
            episodic: episodic.clone(),
            hierarchy: hierarchy.clone(),
            version: "2.1".to_string(),
        }
    }

    // v2.0: Restore from snapshot
    pub async fn restore_snapshot(&self, snapshot: MemorySnapshot) {
        self.working.clear();
        for node in snapshot.working {
            self.working.insert(node.id.clone(), node);
        }

        {
            let mut recent = self.recent.write().await;
            *recent = snapshot.recent;
        }

        self.semantic.clear();
        for entry in snapshot.semantic {
            self.semantic.insert(entry.key.clone(), entry);
        }

        {
            let mut episodic = self.episodic.write().await;
            *episodic = snapshot.episodic;
        }

        {
            let mut hierarchy = self.hierarchy.write().await;
            *hierarchy = snapshot.hierarchy;
        }

        // Rebuild search index
        self.search_index.clear();
        for entry in self.working.iter() {
            self.index_node(entry.value());
        }
    }

    // v2.0: TTL cleanup
    pub async fn cleanup_expired(&self) -> usize {
        let now = current_timestamp();
        let mut removed = 0;

        // Clean working memory
        self.working.retain(|_, node| {
            if let Some(ttl) = node.ttl {
                let expired = now - node.timestamp > ttl;
                if expired {
                    removed += 1;
                }
                !expired
            } else {
                true
            }
        });

        // Clean hierarchy
        {
            let mut hierarchy = self.hierarchy.write().await;
            for level_map in hierarchy.values_mut() {
                level_map.retain(|_, entry| {
                    now - entry.timestamp <= entry.ttl
                });
            }
        }

        removed
    }

    fn calculate_importance(&self, intent: &str, result: bool) -> u8 {
        let mut score: u8 = 1;
        if intent.contains("system") { score += 2; }
        if intent.contains("upgrade") || intent.contains("kernel") { score += 3; }
        if intent.contains("error") || intent.contains("fail") { score += 1; }
        if intent.contains("user") || intent.contains("preference") { score += 1; }
        if !result { score += 1; }
        score.min(5)
    }

    fn extract_tags(&self, content: &str, intent: &str) -> Vec<String> {
        let mut tags = Vec::new();
        let content_lower = content.to_lowercase();
        
        if content_lower.contains("code") || content_lower.contains("function") {
            tags.push("code".to_string());
        }
        if content_lower.contains("error") || content_lower.contains("fail") {
            tags.push("error".to_string());
        }
        if content_lower.contains("user") {
            tags.push("user".to_string());
        }
        if intent.contains("system") {
            tags.push("system".to_string());
        }
        
        tags
    }

    async fn promote_to_semantic(&self, node: &MemoryNode) {
        // TurboQuant: compress semantic entry with PolarQuant
        self.semantic_compressor.compress_entry(
            &self.extract_key(node),
            node.content.as_str(),
        );
        let mut promotions = self.promotions.write().await;
        *promotions += 1;
        drop(promotions);

        let key = self.extract_key(node);
        
        let mut entry = self.semantic.get(&key).map(|e| e.clone())
            .unwrap_or(SemanticEntry {
                key: key.clone(),
                count: 0,
                description: None,
                last_seen: 0,
                entries: Vec::new(),
                aggregated_importance: 0,
            });

        entry.count += 1;
        entry.entries.push(node.id.clone());
        if !node.content.is_empty() {
            entry.description = Some(node.content.chars().take(100).collect());
        }
        entry.last_seen = node.timestamp;
        entry.aggregated_importance += node.importance as u32;

        self.semantic.insert(key, entry);
    }

    fn extract_key(&self, node: &MemoryNode) -> String {
        format!("{}:{}", node.intent, if node.result { "success" } else { "fail" })
    }

    fn index_node(&self, node: &MemoryNode) {
        let words: Vec<String> = node.content
            .to_lowercase()
            .split_whitespace()
            .map(|w| w.to_string())
            .collect();
        
        for word in words {
            self.search_index
                .entry(word)
                .or_insert_with(HashSet::new)
                .insert(node.id.clone());
        }
    }

    fn calculate_relevance(&self, node: &MemoryNode, query_words: &[&str]) -> Option<f32> {
        let content_lower = node.content.to_lowercase();
        let content_words: Vec<&str> = content_lower
            .split_whitespace()
            .collect();
        
        let mut matches = 0;
        for qw in query_words {
            if content_words.iter().any(|cw| cw.contains(qw) || qw.contains(cw)) {
                matches += 1;
            }
        }

        if matches == 0 {
            return None;
        }

        let base_score = matches as f32 / query_words.len().max(content_words.len()) as f32;
        let importance_boost = node.importance as f32 / 5.0;
        let recency_boost = 1.0 - ((current_timestamp() - node.timestamp) as f32 / 86400000.0).min(1.0);

        Some(base_score * 0.5 + importance_boost * 0.3 + recency_boost * 0.2)
    }

    fn calculate_relevance_episodic(&self, entry: &EpisodicEntry, query_words: &[&str]) -> Option<f32> {
        let content_lower = entry.content.to_lowercase();
        let content_words: Vec<&str> = content_lower
            .split_whitespace()
            .collect();
        
        let mut matches = 0;
        for qw in query_words {
            if content_words.iter().any(|cw| cw.contains(qw) || qw.contains(cw)) {
                matches += 1;
            }
        }

        if matches == 0 {
            return None;
        }

        let base_score = matches as f32 / query_words.len().max(content_words.len()) as f32;
        let importance_boost = entry.importance as f32 / 5.0;

        Some(base_score * 0.6 + importance_boost * 0.4)
    }

    pub async fn get_stats(&self) -> MemoryStats {
        let recent = self.recent.read().await;
        let episodic = self.episodic.read().await;
        let hierarchy = self.hierarchy.read().await;
        let reads = self.reads.read().await;
        let writes = self.writes.read().await;
        let promotions = self.promotions.read().await;
        let searches = self.searches.read().await;
        let distillations = self.distillations.read().await;

        MemoryStats {
            working: self.working.len(),
            recent: recent.len(),
            semantic: self.semantic.len(),
            episodic: episodic.len(),
            hierarchy: hierarchy.iter()
                .map(|(k, v)| (k.clone(), v.len()))
                .collect(),
            reads: *reads,
            writes: *writes,
            promotions: *promotions,
            searches: *searches,
            distillations: *distillations,
            fts_searches: *self.fts_searches.read().await,
            fts_available: self.fts5.is_some(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RecallResult {
    pub working: Vec<MemoryNode>,
    pub recent: Vec<MemoryNode>,
    pub semantic: Vec<SemanticEntry>,
    pub episodic: Vec<EpisodicEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MemoryStats {
    pub working: usize,
    pub recent: usize,
    pub semantic: usize,
    pub episodic: usize,
    pub hierarchy: HashMap<String, usize>,
    pub reads: u64,
    pub writes: u64,
    pub promotions: u64,
    pub searches: u64,
    pub distillations: u64,
    pub fts_searches: u64,         // v2.1: FTS5 搜索次数
    pub fts_available: bool,       // v2.1: FTS5 是否启用
}

fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

// ================================================================
// CLI Interface
// ================================================================

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "action")]
pub enum MemoryRequest {
    Record { content: String, intent: String, result: bool },
    Recall { query: String },
    Search { query: String, limit: Option<usize> },
    SetContext { level: String, key: String, value: serde_json::Value, priority: Option<u8> },
    GetContext { level: String, key: String },
    GetContextChain,
    GetMemoryInjection { context: String, max_tokens: Option<usize> },
    Distill,
    CreateSnapshot,
    RestoreSnapshot { snapshot: MemorySnapshot },
    CleanupExpired,
    GetStats,
    // v2.1: FTS5 搜索（Hermes 风格，snippet 高亮）
    FtsSearch { query: String, limit: Option<usize>, layer_filter: Option<String> },
    // TurboQuant: Semantic layer vector compression
    CompressSemantic,
    SemanticSearch { query: String, top_k: Option<usize> },
    GetSemanticCompressorStats,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MemoryResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    tracing::info!("HundunOS Memory Graph v2.1 starting (FTS5 enabled)...");

    let graph = Arc::new(MemoryGraph::new());

    let stdin = tokio::io::stdin();
    let mut reader = tokio::io::BufReader::new(stdin).lines();
    let mut stdout = tokio::io::stdout();

    while let Some(line) = reader.next_line().await? {
        let request: MemoryRequest = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                let response = MemoryResponse::<()> {
                    success: false,
                    data: None,
                    error: Some(format!("Invalid request: {}", e)),
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
                stdout.write_all(b"\n").await?;
                continue;
            }
        };

        match request {
            MemoryRequest::Record { content, intent, result } => {
                let node = graph.record(&content, &intent, result).await;
                let response = MemoryResponse {
                    success: true,
                    data: Some(node),
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            MemoryRequest::Recall { query } => {
                let results = graph.recall(&query).await;
                let response = MemoryResponse {
                    success: true,
                    data: Some(results),
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            MemoryRequest::Search { query, limit } => {
                let results = graph.search(&query, limit).await;
                let response = MemoryResponse {
                    success: true,
                    data: Some(results),
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            MemoryRequest::SetContext { level, key, value, priority } => {
                graph.set_context(&level, &key, value, priority).await;
                let response = MemoryResponse::<()> {
                    success: true,
                    data: None,
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            MemoryRequest::GetContext { level, key } => {
                let value = graph.get_context(&level, &key).await;
                let response = MemoryResponse {
                    success: true,
                    data: value,
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            MemoryRequest::GetContextChain => {
                let chain = graph.get_context_chain().await;
                let response = MemoryResponse {
                    success: true,
                    data: Some(chain),
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            MemoryRequest::GetMemoryInjection { context, max_tokens } => {
                let injection = graph.get_memory_injection(&context, max_tokens).await;
                let response = MemoryResponse {
                    success: true,
                    data: Some(injection),
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            MemoryRequest::Distill => {
                let distilled = graph.distill().await;
                let response = MemoryResponse {
                    success: true,
                    data: Some(distilled),
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            MemoryRequest::CreateSnapshot => {
                let snapshot = graph.create_snapshot().await;
                let response = MemoryResponse {
                    success: true,
                    data: Some(snapshot),
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            MemoryRequest::RestoreSnapshot { snapshot } => {
                graph.restore_snapshot(snapshot).await;
                let response = MemoryResponse::<()> {
                    success: true,
                    data: None,
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            MemoryRequest::CleanupExpired => {
                let removed = graph.cleanup_expired().await;
                let response = MemoryResponse {
                    success: true,
                    data: Some(removed),
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            MemoryRequest::GetStats => {
                let stats = graph.get_stats().await;
                let response = MemoryResponse {
                    success: true,
                    data: Some(stats),
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            // v2.1: FTS5 搜索（Hermes 风格 snippet 高亮）
            MemoryRequest::FtsSearch { query, limit, layer_filter } => {
                // FTS5 操作是同步的，在 tokio 上下文中调用
                if let Some(fts) = &graph.fts5 {
                    let results = fts.search_filtered(&query, layer_filter.as_deref(), limit.unwrap_or(20));
                    match results {
                        Ok(r) => {
                            let response = MemoryResponse {
                                success: true,
                                data: Some(r),
                                error: None,
                            };
                            stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
                        }
                        Err(e) => {
                            let response = MemoryResponse::<()> {
                                success: false,
                                data: None,
                                error: Some(format!("FTS5 search error: {}", e)),
                            };
                            stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
                        }
                    }
                } else {
                    let response = MemoryResponse::<()> {
                        success: false,
                        data: None,
                        error: Some("FTS5 not initialized — use InitFts5 first".to_string()),
                    };
                    stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
                }
            }
            // TurboQuant: Compress all semantic entries
            MemoryRequest::CompressSemantic => {
                let entries: std::collections::HashMap<String, SemanticEntry> = graph.semantic.iter()
                    .map(|e| (e.key().clone(), e.value().clone()))
                    .collect();
                graph.semantic_compressor.compress_existing(&entries);
                let response = MemoryResponse {
                    success: true,
                    data: Some(serde_json::json!({ "compressed": graph.semantic_compressor.get_stats() })),
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            // TurboQuant: Compressed-domain semantic search
            MemoryRequest::SemanticSearch { query, top_k } => {
                let results = graph.semantic_compressor.semantic_search(&query, top_k.unwrap_or(5));
                let response = MemoryResponse {
                    success: true,
                    data: Some(results),
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            // TurboQuant: Get compression stats
            MemoryRequest::GetSemanticCompressorStats => {
                let stats = graph.semantic_compressor.get_stats();
                let response = MemoryResponse {
                    success: true,
                    data: Some(stats),
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
        }
        stdout.write_all(b"\n").await?;
        stdout.flush().await?;
    }

    Ok(())
}

// ================================================================
// v2.2: TaxHacker-inspired Memory Fields System
// 借鉴 TaxHacker DEFAULT_FIELDS 架构：
//   每个记忆节点携带 llm_prompt 描述，使 LLM 能理解记忆语义
//   类似于 TaxHacker 的 Field.code + Field.llm_prompt 组合
// ================================================================

/// 记忆字段定义（TaxHacker Field 模型风格）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryField {
    /// 字段代码（唯一标识）
    pub code: String,
    /// 人类可读名称
    pub name: String,
    /// 字段类型
    pub field_type: String,
    /// LLM 友好的描述（TaxHacker llm_prompt 核心）
    pub llm_prompt: String,
    /// 是否在列表中可见
    pub visible_in_list: bool,
    /// 是否在分析时可见
    pub visible_in_analysis: bool,
    /// 是否必填
    pub required: bool,
    /// 召回权重（影响 recall 优先级）
    pub recall_weight: f64,
    /// 默认值
    pub default_value: Option<String>,
}

/// 记忆字段定义（const 版本）
#[derive(Debug, Clone, Copy)]
pub struct MemoryFieldConst {
    pub code: &'static str,
    pub name: &'static str,
    pub field_type: &'static str,
    pub llm_prompt: &'static str,
    pub visible_in_list: bool,
    pub visible_in_analysis: bool,
    pub required: bool,
    pub recall_weight: f64,
}

impl Default for MemoryField {
    fn default() -> Self {
        Self {
            code: String::new(),
            name: String::new(),
            field_type: "string".to_string(),
            llm_prompt: String::new(),
            visible_in_list: false,
            visible_in_analysis: false,
            required: false,
            recall_weight: 1.0,
            default_value: None,
        }
    }
}

/// 默认记忆字段（TaxHacker DEFAULT_FIELDS 风格）
pub const DEFAULT_MEMORY_FIELDS: &[(&str, MemoryFieldConst)] = &[
    (
        "intent",
        MemoryFieldConst {
            code: "intent",
            name: "意图",
            field_type: "string",
            llm_prompt: "用户当前意图或请求的核心内容",
            visible_in_list: true,
            visible_in_analysis: true,
            required: true,
            recall_weight: 1.5,
        },
    ),
    (
        "action",
        MemoryFieldConst {
            code: "action",
            name: "执行动作",
            field_type: "string",
            llm_prompt: "AI 执行的具体操作类型，如 read_file, write_code, search 等",
            visible_in_list: true,
            visible_in_analysis: true,
            required: false,
            recall_weight: 1.2,
        },
    ),
    (
        "result",
        MemoryFieldConst {
            code: "result",
            name: "执行结果",
            field_type: "string",
            llm_prompt: "操作的成功与否及关键结果摘要",
            visible_in_list: false,
            visible_in_analysis: true,
            required: false,
            recall_weight: 1.0,
        },
    ),
    (
        "project",
        MemoryFieldConst {
            code: "project",
            name: "关联项目",
            field_type: "string",
            llm_prompt: "该项目记忆关联的代码项目名称",
            visible_in_list: true,
            visible_in_analysis: false,
            required: false,
            recall_weight: 0.8,
        },
    ),
    (
        "tags",
        MemoryFieldConst {
            code: "tags",
            name: "标签",
            field_type: "array",
            llm_prompt: "记忆的分类标签数组，如 [bug, frontend, api]",
            visible_in_list: false,
            visible_in_analysis: false,
            required: false,
            recall_weight: 0.7,
        },
    ),
];

/// MemoryField 注册表（TaxHacker Field 模型的内存版）
#[derive(Debug, Default)]
pub struct MemoryFieldRegistry {
    fields: std::collections::HashMap<String, MemoryField>,
}

impl MemoryFieldRegistry {
    pub fn new() -> Self {
        let mut registry = Self::default();
        // 注册默认字段
        for (_, field) in DEFAULT_MEMORY_FIELDS {
            registry.fields.insert(field.code.to_string(), MemoryField {
                code: field.code.to_string(),
                name: field.name.to_string(),
                field_type: field.field_type.to_string(),
                llm_prompt: field.llm_prompt.to_string(),
                visible_in_list: field.visible_in_list,
                visible_in_analysis: field.visible_in_analysis,
                required: field.required,
                recall_weight: field.recall_weight,
                default_value: None,
            });
        }
        registry
    }

    /// 注册自定义字段
    pub fn register(&mut self, field: MemoryField) {
        self.fields.insert(field.code.clone(), field);
    }

    /// 按 code 获取字段
    pub fn get(&self, code: &str) -> Option<&MemoryField> {
        self.fields.get(code)
    }

    /// 获取所有字段
    pub fn all(&self) -> Vec<&MemoryField> {
        self.fields.values().collect()
    }

    /// 获取需要召回的字段（权重 > 阈值）
    pub fn get_recall_fields(&self, threshold: f64) -> Vec<&MemoryField> {
        self.fields
            .values()
            .filter(|f| f.recall_weight >= threshold)
            .collect()
    }

    /// 构建召回 prompt（TaxHacker buildLLMPrompt 风格）
    /// 输出示例：
    ///   - intent: 用户当前意图或请求的核心内容 [权重: 1.5]
    ///   - action: AI 执行的具体操作类型 [权重: 1.2]
    pub fn build_recall_prompt(&self, query: &str) -> String {
        let fields = self.get_recall_fields(0.5); // 召回权重 >= 0.5
        let field_lines: Vec<String> = fields
            .iter()
            .map(|f| {
                format!(
                    "- {} ({}): {} [recall_weight: {:.1}]",
                    f.code, f.field_type, f.llm_prompt, f.recall_weight
                )
            })
            .collect();

        format!(
            "查询: {}\n相关记忆字段:\n{}\n\n请根据以上字段召回相关记忆。",
            query,
            field_lines.join("\n")
        )
    }

    /// 转换为 JSON Schema（TaxHacker fieldsToJsonSchema 风格）
    pub fn to_json_schema(&self) -> serde_json::Value {
        let mut properties = serde_json::Map::new();
        for field in self.fields.values() {
            let mut prop = serde_json::Map::new();
            prop.insert("type".to_string(), serde_json::json!(field.field_type));
            prop.insert("description".to_string(), serde_json::json!(field.llm_prompt));
            if let Some(ref default) = field.default_value {
                prop.insert("default".to_string(), serde_json::json!(default));
            }
            if let Some(ref enums) = field.default_value {
                if field.field_type == "string" {
                    prop.insert("enum".to_string(), serde_json::json!([enums]));
                }
            }
            properties.insert(field.code.clone(), serde_json::json!(prop));
        }

        let required: Vec<String> = self
            .fields
            .values()
            .filter(|f| f.required)
            .map(|f| f.code.clone())
            .collect();

        serde_json::json!({
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": false
        })
    }
}

/// 带字段语义的记忆节点（TaxHacker Field 增强版）
#[derive(Debug, Clone)]
pub struct RichMemoryNode {
    pub node: MemoryNode,
    pub fields: std::collections::HashMap<String, serde_json::Value>,
}

impl RichMemoryNode {
    /// 从 MemoryNode 和字段注册表构建 RichMemoryNode
    pub fn from_node(node: MemoryNode, registry: &MemoryFieldRegistry) -> Self {
        let mut fields = std::collections::HashMap::new();

        // 自动填充字段（TaxHacker 风格的字段提取）
        if let Some(f) = registry.get("intent") {
            fields.insert(
                f.code.clone(),
                serde_json::json!(node.intent),
            );
        }
        if let Some(f) = registry.get("result") {
            fields.insert(
                f.code.clone(),
                serde_json::json!(node.result),
            );
        }
        if let Some(f) = registry.get("tags") {
            fields.insert(
                f.code.clone(),
                serde_json::json!(node.tags),
            );
        }
        // importance 字段
        if let Some(f) = registry.get("importance") {
            fields.insert(
                f.code.clone(),
                serde_json::json!(node.importance),
            );
        }

        Self { node, fields }
    }

    /// 提取特定字段（TaxHacker extractField 风格）
    pub fn extract_field(&self, code: &str) -> Option<&serde_json::Value> {
        self.fields.get(code)
    }

    /// 转换为 LLM 友好格式
    pub fn to_llm_summary(&self, registry: &MemoryFieldRegistry) -> String {
        let mut lines = Vec::new();
        for field in registry.all() {
            if !field.visible_in_analysis {
                continue;
            }
            if let Some(value) = self.fields.get(&field.code) {
                let value_str = match value {
                    serde_json::Value::String(s) => s.clone(),
                    serde_json::Value::Null => "[未记录]".to_string(),
                    _ => value.to_string(),
                };
                lines.push(format!("[{}] {}: {}", field.name, field.code, value_str));
            }
        }
        if lines.is_empty() {
            // fallback：返回原始内容
            return format!("记忆 (时间: {}): {}", self.node.timestamp, self.node.content);
        }
        format!("{}\n内容摘要: {}", lines.join("; "), self.node.content)
    }
}

#[cfg(test)]
mod memory_field_tests {
    use super::*;

    #[test]
    fn test_field_registry_defaults() {
        let registry = MemoryFieldRegistry::new();
        assert!(registry.get("intent").is_some());
        assert!(registry.get("action").is_some());
        assert_eq!(registry.all().len(), DEFAULT_MEMORY_FIELDS.len());
    }

    #[test]
    fn test_build_recall_prompt() {
        let registry = MemoryFieldRegistry::new();
        let prompt = registry.build_recall_prompt("查找与 API 相关的记忆");
        assert!(prompt.contains("intent"));
        assert!(prompt.contains("API"));
        assert!(prompt.contains("recall_weight"));
    }

    #[test]
    fn test_to_json_schema() {
        let registry = MemoryFieldRegistry::new();
        let schema = registry.to_json_schema();
        assert_eq!(schema["type"], "object");
        assert!(schema["properties"].as_object().unwrap().contains_key("intent"));
        assert!(schema["required"].as_array().unwrap().contains(&serde_json::json!("intent")));
    }

    #[test]
    fn test_rich_memory_node() {
        let node = MemoryNode {
            id: "test-1".to_string(),
            timestamp: 1234567890,
            content: "实现了文件读取功能".to_string(),
            intent: "实现文件读取".to_string(),
            result: true,
            importance: 3,
            ttl: None,
            tags: vec!["feature".to_string(), "io".to_string()],
            source: None,
            embedding: None,
            relevance_score: None,
        };
        let registry = MemoryFieldRegistry::new();
        let rich = RichMemoryNode::from_node(node, &registry);
        assert!(rich.extract_field("intent").is_some());
        assert!(rich.extract_field("result").is_some());
    }
}
