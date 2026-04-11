// hundunos-rust/model-router/src/main.rs
// HundunOS Model Router - Rust Implementation v2.0
// Multi-provider routing with LinUCB and edict-inspired enhancements
// TurboQuant PolarQuant v1.0 integrated

mod polar_quant;
use polar_quant::{EmbeddingEngine, PolarQuantConfig, QuantizedVector};

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use sha2::{Sha256, Digest};
use dashmap::DashMap;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt};
use tokio::sync::RwLock;

// ================================================================
// Type Definitions
// ================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub provider_type: ProviderType,
    pub model: String,
    pub capabilities: Vec<String>,
    pub max_tokens: u32,
    pub cost_per_1m: f64,
    pub endpoint: Option<String>,
    pub api_key: Option<String>,
    // v2.0: New fields
    pub speed_tier: SpeedTier,           // Fast or Slow agent bucket
    pub success_rate: f64,               // Historical success rate
    pub avg_latency_ms: u64,             // Average response time
    pub token_throughput: f64,           // Tokens per second
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ProviderType {
    Local,
    Cloud,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SpeedTier {
    Fast,    // For simple tasks, quick responses
    Slow,    // For complex tasks, thorough reasoning
    Balanced,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteRequest {
    pub content: String,
    pub task_type: Option<String>,
    pub max_tokens: Option<u32>,
    pub prefer_local: Option<bool>,
    pub require_fast: Option<bool>,     // v2.0: Require fast agent
    pub cost_budget: Option<f64>,       // v2.0: Cost budget for this request
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteResult {
    pub provider_id: String,
    pub provider_name: String,
    pub model: String,
    pub task_type: String,
    pub estimated_cost: f64,
    pub is_cached: bool,
    // v2.0: New fields
    pub routing_strategy: String,        // Which strategy was used
    pub confidence: f64,                 // Confidence in routing decision
    pub estimated_latency_ms: u64,       // Estimated response time
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry {
    pub response: String,
    pub tokens: u32,
    pub timestamp: u64,
    pub provider_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CircuitBreakerState {
    pub failures: u32,
    pub last_failure: u64,
    pub is_open: bool,
    pub success_count: u32,              // v2.0: Track successes for recovery
}

// v2.0: LinUCB arm for each provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinUCBArm {
    pub provider_id: String,
    pub theta: Vec<f64>,                 // Parameter vector
    pub a: Vec<Vec<f64>>,                // A matrix
    pub b: Vec<f64>,                     // b vector
    pub alpha: f64,                      // Exploration parameter
    pub reward_sum: f64,
    pub pull_count: u64,
}

impl LinUCBArm {
    pub fn new(provider_id: String, feature_dim: usize, alpha: f64) -> Self {
        let a = (0..feature_dim)
            .map(|i| {
                (0..feature_dim)
                    .map(|j| if i == j { 1.0 } else { 0.0 })
                    .collect()
            })
            .collect();
        
        Self {
            provider_id,
            theta: vec![0.0; feature_dim],
            a,
            b: vec![0.0; feature_dim],
            alpha,
            reward_sum: 0.0,
            pull_count: 0,
        }
    }

    pub fn predict(&self, features: &[f64]) -> f64 {
        let p = self.theta.iter().zip(features.iter())
            .map(|(t, f)| t * f)
            .sum::<f64>();
        
        // Add exploration bonus (simplified)
        let exploration = self.alpha / (self.pull_count as f64 + 1.0).sqrt();
        p + exploration
    }

    pub fn update(&mut self, features: &[f64], reward: f64) {
        // Simplified update (in production, use proper matrix operations)
        self.pull_count += 1;
        self.reward_sum += reward;
        
        // Update theta with gradient descent approximation
        for i in 0..self.theta.len().min(features.len()) {
            self.b[i] += reward * features[i];
            self.theta[i] = self.b[i] / (self.pull_count as f64);
        }
    }
}

// v2.0: Task type classification
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TaskType {
    CodeGeneration,
    CodeReview,
    Summarization,
    Translation,
    Analysis,
    CreativeWriting,
    QuestionAnswering,
    Chat,
    Unknown,
}

impl TaskType {
    pub fn from_string(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "code" | "code_generation" => TaskType::CodeGeneration,
            "review" | "code_review" => TaskType::CodeReview,
            "summarize" | "summarization" => TaskType::Summarization,
            "translate" | "translation" => TaskType::Translation,
            "analyze" | "analysis" => TaskType::Analysis,
            "creative" | "write" => TaskType::CreativeWriting,
            "qa" | "question" => TaskType::QuestionAnswering,
            "chat" => TaskType::Chat,
            _ => TaskType::Unknown,
        }
    }

    pub fn preferred_speed(&self) -> SpeedTier {
        match self {
            TaskType::CodeGeneration => SpeedTier::Slow,
            TaskType::CodeReview => SpeedTier::Balanced,
            TaskType::Summarization => SpeedTier::Fast,
            TaskType::Translation => SpeedTier::Fast,
            TaskType::Analysis => SpeedTier::Slow,
            TaskType::CreativeWriting => SpeedTier::Slow,
            TaskType::QuestionAnswering => SpeedTier::Fast,
            TaskType::Chat => SpeedTier::Balanced,
            TaskType::Unknown => SpeedTier::Balanced,
        }
    }
}

// ================================================================
// Model Router
// ================================================================

pub struct ModelRouter {
    providers: DashMap<String, Provider>,
    cache: DashMap<String, CacheEntry>,
    circuit_breakers: DashMap<String, CircuitBreakerState>,
    usage_stats: RwLock<HashMap<String, UsageStats>>,
    
    // v2.0: LinUCB arms for intelligent routing
    linucb_arms: DashMap<String, LinUCBArm>,
    
    // v2.0: Token quota management
    token_quota: RwLock<TokenQuota>,
    
    strategy: RwLock<RoutingStrategy>,
    max_cache_size: usize,
    cache_ttl_ms: u64,
    failure_threshold: u32,
    recovery_timeout_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RoutingStrategy {
    Balanced,           // Prefer local, fallback to cloud
    CostFirst,          // Always use cheapest
    QualityFirst,       // Prefer best quality
    LocalOnly,          // Only use local models
    LinUCB,             // v2.0: LinUCB bandit algorithm
    TaskBased,          // v2.0: Route based on task type
    CostOptimized,      // v2.0: Cost optimization with performance tracking
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UsageStats {
    pub calls: u64,
    pub tokens: u64,
    pub cost: f64,
    pub cache_hits: u64,
    pub cache_misses: u64,
    pub total_latency_ms: u64,
    pub success_count: u64,
    pub failure_count: u64,
}

// v2.0: Token quota tracking (功过簿 concept)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenQuota {
    pub hourly_limit: u64,
    pub hourly_used: u64,
    pub daily_limit: u64,
    pub daily_used: u64,
    pub last_reset: u64,
}

impl Default for TokenQuota {
    fn default() -> Self {
        Self {
            hourly_limit: 1_000_000,
            hourly_used: 0,
            daily_limit: 10_000_000,
            daily_used: 0,
            last_reset: current_timestamp(),
        }
    }
}

impl TokenQuota {
    pub fn check_and_consume(&mut self, tokens: u64) -> bool {
        let now = current_timestamp();
        
        // Reset hourly if needed
        if now - self.last_reset > 3600000 {
            self.hourly_used = 0;
            self.last_reset = now;
        }
        
        // Reset daily if needed (simplified)
        if now - self.last_reset > 86400000 {
            self.daily_used = 0;
        }
        
        if self.hourly_used + tokens > self.hourly_limit {
            return false;
        }
        if self.daily_used + tokens > self.daily_limit {
            return false;
        }
        
        self.hourly_used += tokens;
        self.daily_used += tokens;
        true
    }
}

impl ModelRouter {
    pub fn new() -> Self {
        Self {
            providers: DashMap::new(),
            cache: DashMap::new(),
            circuit_breakers: DashMap::new(),
            usage_stats: RwLock::new(HashMap::new()),
            linucb_arms: DashMap::new(),
            token_quota: RwLock::new(TokenQuota::default()),
            strategy: RwLock::new(RoutingStrategy::Balanced),
            max_cache_size: 1000,
            cache_ttl_ms: 3600000, // 1 hour
            failure_threshold: 5,
            recovery_timeout_ms: 30000, // 30 seconds
        }
    }

    pub fn register_provider(&self, provider: Provider) {
        let id = provider.id.clone();
        
        // Initialize LinUCB arm
        self.linucb_arms.insert(
            id.clone(),
            LinUCBArm::new(id.clone(), 5, 0.5)
        );
        
        self.providers.insert(id.clone(), provider);
        self.circuit_breakers.insert(id, CircuitBreakerState {
            failures: 0,
            last_failure: 0,
            is_open: false,
            success_count: 0,
        });
    }

    pub async fn route(&self, request: &RouteRequest) -> Option<RouteResult> {
        let task_type = request.task_type.clone().unwrap_or_else(|| 
            self.classify_task(&request.content)
        );
        let task_enum = TaskType::from_string(&task_type);

        // Check cache first
        let cache_key = self.generate_cache_key(&request.content);
        if let Some(entry) = self.cache.get(&cache_key) {
            if current_timestamp() - entry.timestamp < self.cache_ttl_ms {
                let mut stats = self.usage_stats.write().await;
                if let Some(s) = stats.get_mut("total") {
                    s.cache_hits += 1;
                }
                return Some(RouteResult {
                    provider_id: "cache".to_string(),
                    provider_name: "Response Cache".to_string(),
                    model: "cached".to_string(),
                    task_type: task_type.clone(),
                    estimated_cost: 0.0,
                    is_cached: true,
                    routing_strategy: "cache".to_string(),
                    confidence: 1.0,
                    estimated_latency_ms: 0,
                });
            }
        }

        let mut stats = self.usage_stats.write().await;
        if let Some(s) = stats.get_mut("total") {
            s.cache_misses += 1;
        }
        drop(stats);

        // Get available providers
        let candidates: Vec<Provider> = self.providers.iter()
            .filter(|p| self.is_available(&p.id))
            .map(|p| p.clone())
            .collect();

        if candidates.is_empty() {
            return None;
        }

        // Select provider based on strategy
        let strategy = self.strategy.read().await.clone();
        let selected = match strategy {
            RoutingStrategy::Balanced => self.select_balanced(&candidates, &task_type),
            RoutingStrategy::CostFirst => self.select_cheapest(&candidates),
            RoutingStrategy::QualityFirst => self.select_best_quality(&candidates),
            RoutingStrategy::LocalOnly => self.select_local(&candidates),
            RoutingStrategy::LinUCB => self.select_linucb(&candidates, &task_enum),
            RoutingStrategy::TaskBased => self.select_task_based(&candidates, &task_enum, request.require_fast),
            RoutingStrategy::CostOptimized => self.select_cost_optimized(&candidates, request.cost_budget),
        };

        selected.map(|p| {
            let estimated_cost = self.estimate_cost(&p, request.max_tokens);
            let estimated_latency = self.estimate_latency(&p);
            
            RouteResult {
                provider_id: p.id.clone(),
                provider_name: p.name.clone(),
                model: p.model.clone(),
                task_type,
                estimated_cost,
                is_cached: false,
                routing_strategy: format!("{:?}", strategy),
                confidence: p.success_rate,
                estimated_latency_ms: estimated_latency,
            }
        })
    }

    fn select_balanced(&self, candidates: &[Provider], task_type: &str) -> Option<Provider> {
        // Prefer local for simple tasks, cloud for complex
        if task_type.starts_with("LOCAL") || task_type.starts_with("FAST") {
            candidates.iter()
                .find(|p| p.provider_type == ProviderType::Local)
                .cloned()
                .or_else(|| candidates.first().cloned())
        } else {
            candidates.first().cloned()
        }
    }

    fn select_cheapest(&self, candidates: &[Provider]) -> Option<Provider> {
        candidates.iter()
            .min_by(|a, b| a.cost_per_1m.partial_cmp(&b.cost_per_1m).unwrap())
            .cloned()
    }

    fn select_best_quality(&self, candidates: &[Provider]) -> Option<Provider> {
        // Prefer cloud models for quality
        candidates.iter()
            .find(|p| p.provider_type == ProviderType::Cloud)
            .cloned()
            .or_else(|| candidates.first().cloned())
    }

    fn select_local(&self, candidates: &[Provider]) -> Option<Provider> {
        candidates.iter()
            .find(|p| p.provider_type == ProviderType::Local)
            .cloned()
    }

    // v2.0: LinUCB selection
    fn select_linucb(&self, candidates: &[Provider], task_type: &TaskType) -> Option<Provider> {
        let features = self.extract_features(task_type);
        
        let mut best_provider: Option<Provider> = None;
        let mut best_score = f64::NEG_INFINITY;

        for provider in candidates {
            if let Some(arm) = self.linucb_arms.get(&provider.id) {
                let score = arm.predict(&features);
                if score > best_score {
                    best_score = score;
                    best_provider = Some(provider.clone());
                }
            }
        }

        best_provider.or_else(|| candidates.first().cloned())
    }

    // v2.0: Task-based selection
    fn select_task_based(
        &self,
        candidates: &[Provider],
        task_type: &TaskType,
        require_fast: Option<bool>,
    ) -> Option<Provider> {
        let preferred_speed = if require_fast.unwrap_or(false) {
            SpeedTier::Fast
        } else {
            task_type.preferred_speed()
        };

        candidates.iter()
            .filter(|p| p.speed_tier == preferred_speed || p.speed_tier == SpeedTier::Balanced)
            .max_by(|a, b| a.success_rate.partial_cmp(&b.success_rate).unwrap())
            .cloned()
            .or_else(|| candidates.first().cloned())
    }

    // v2.0: Cost-optimized selection
    fn select_cost_optimized(
        &self,
        candidates: &[Provider],
        cost_budget: Option<f64>,
    ) -> Option<Provider> {
        let budget = cost_budget.unwrap_or(f64::MAX);
        
        candidates.iter()
            .filter(|p| {
                let estimated = self.estimate_cost(p, Some(1000));
                estimated <= budget
            })
            .max_by(|a, b| {
                // Score = success_rate / cost (performance per dollar)
                let score_a = a.success_rate / (a.cost_per_1m + 0.001);
                let score_b = b.success_rate / (b.cost_per_1m + 0.001);
                score_a.partial_cmp(&score_b).unwrap()
            })
            .cloned()
            .or_else(|| self.select_cheapest(candidates))
    }

    fn extract_features(&self, task_type: &TaskType) -> Vec<f64> {
        // Simple feature vector: [is_complex, requires_creativity, is_code, is_chat, is_fast]
        vec![
            if *task_type == TaskType::Analysis || *task_type == TaskType::CodeGeneration { 1.0 } else { 0.0 },
            if *task_type == TaskType::CreativeWriting { 1.0 } else { 0.0 },
            if *task_type == TaskType::CodeGeneration || *task_type == TaskType::CodeReview { 1.0 } else { 0.0 },
            if *task_type == TaskType::Chat { 1.0 } else { 0.0 },
            if task_type.preferred_speed() == SpeedTier::Fast { 1.0 } else { 0.0 },
        ]
    }

    fn estimate_cost(&self, provider: &Provider, max_tokens: Option<u32>) -> f64 {
        let tokens = max_tokens.unwrap_or(1000) as f64;
        (tokens / 1_000_000.0) * provider.cost_per_1m
    }

    fn estimate_latency(&self, provider: &Provider) -> u64 {
        provider.avg_latency_ms
    }

    fn is_available(&self, provider_id: &str) -> bool {
        if let Some(cb) = self.circuit_breakers.get(provider_id) {
            if cb.is_open {
                // Check if recovery timeout passed
                return current_timestamp() - cb.last_failure > self.recovery_timeout_ms;
            }
        }
        true
    }

    pub async fn record_success(&self, provider_id: &str, latency_ms: u64, tokens: u64) {
        // Update circuit breaker
        if let Some(mut cb) = self.circuit_breakers.get_mut(provider_id) {
            cb.failures = 0;
            cb.is_open = false;
            cb.success_count += 1;
        }

        // Update usage stats
        let mut stats = self.usage_stats.write().await;
        let entry = stats.entry(provider_id.to_string()).or_default();
        entry.success_count += 1;
        entry.total_latency_ms += latency_ms;
        entry.tokens += tokens;

        // Update LinUCB arm with reward
        if let Some(mut arm) = self.linucb_arms.get_mut(provider_id) {
            let reward = 1.0 - (latency_ms as f64 / 10000.0).min(1.0); // Reward based on speed
            let features = vec![1.0, 0.0, 0.0, 0.0, 0.0]; // Simplified
            arm.update(&features, reward);
        }
    }

    pub async fn record_failure(&self, provider_id: &str) {
        // Update circuit breaker
        if let Some(mut cb) = self.circuit_breakers.get_mut(provider_id) {
            cb.failures += 1;
            cb.last_failure = current_timestamp();
            if cb.failures >= self.failure_threshold {
                cb.is_open = true;
            }
        }

        // Update usage stats
        let mut stats = self.usage_stats.write().await;
        let entry = stats.entry(provider_id.to_string()).or_default();
        entry.failure_count += 1;

        // Update LinUCB arm with penalty
        if let Some(mut arm) = self.linucb_arms.get_mut(provider_id) {
            let features = vec![1.0, 0.0, 0.0, 0.0, 0.0];
            arm.update(&features, 0.0); // Zero reward for failure
        }
    }

    pub fn cache_response(&self, content: &str, response: &str, tokens: u32, provider_id: &str) {
        let key = self.generate_cache_key(content);
        
        // Evict old entries if cache is full
        if self.cache.len() >= self.max_cache_size {
            let oldest = self.cache.iter()
                .min_by_key(|e| e.timestamp)
                .map(|e| e.key().clone());
            if let Some(k) = oldest {
                self.cache.remove(&k);
            }
        }

        self.cache.insert(key, CacheEntry {
            response: response.to_string(),
            tokens,
            timestamp: current_timestamp(),
            provider_id: provider_id.to_string(),
        });
    }

    fn classify_task(&self, content: &str) -> String {
        let content_lower = content.to_lowercase();
        
        if content_lower.contains("总结") || content_lower.contains("翻译") || 
           content_lower.contains("解释") || content_lower.contains("查询") {
            return "LOCAL_FAST".to_string();
        }
        if content_lower.contains("代码") || content_lower.contains("审查") || 
           content_lower.contains("script") {
            return "LOCAL_BALANCE".to_string();
        }
        if content_lower.contains("分析") || content_lower.contains("报告") {
            return "CLOUD_ANALYSIS".to_string();
        }
        if content_lower.contains("架构") || content_lower.contains("设计") {
            return "CLOUD_EXPERT".to_string();
        }
        
        "BALANCED".to_string()
    }

    fn generate_cache_key(&self, content: &str) -> String {
        let normalized = content.to_lowercase()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        
        let mut hasher = Sha256::new();
        hasher.update(normalized.as_bytes());
        format!("{:x}", hasher.finalize())[..16].to_string()
    }

    pub async fn set_strategy(&self, strategy: RoutingStrategy) {
        let mut s = self.strategy.write().await;
        *s = strategy;
    }

    // v2.0: Hot-swap model support
    pub fn update_provider_model(&self, provider_id: &str, new_model: &str) -> bool {
        if let Some(mut provider) = self.providers.get_mut(provider_id) {
            provider.model = new_model.to_string();
            true
        } else {
            false
        }
    }

    // v2.0: Check token quota
    pub async fn check_quota(&self, tokens: u64) -> bool {
        let mut quota = self.token_quota.write().await;
        quota.check_and_consume(tokens)
    }

    // v2.0: Get quota status
    pub async fn get_quota_status(&self) -> TokenQuota {
        self.token_quota.read().await.clone()
    }

    pub async fn get_stats(&self) -> RouterStats {
        let usage = self.usage_stats.read().await;
        RouterStats {
            providers: self.providers.len(),
            cache_entries: self.cache.len(),
            circuit_breakers: self.circuit_breakers.iter()
                .filter(|cb| cb.is_open)
                .count(),
            usage: usage.get("total").cloned().unwrap_or_default(),
            quota: self.token_quota.read().await.clone(),
            linucb_arms: self.linucb_arms.iter()
                .map(|e| (e.key().clone(), e.pull_count))
                .collect(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RouterStats {
    pub providers: usize,
    pub cache_entries: usize,
    pub circuit_breakers: usize,
    pub usage: UsageStats,
    pub quota: TokenQuota,
    pub linucb_arms: HashMap<String, u64>,
}

// TurboQuant v1.0: Benchmark function
fn run_polar_benchmark(num_vectors: usize) -> serde_json::Value {
    use std::time::Instant;

    let config = PolarQuantConfig::default();
    let dim = config.embedding_dim;
    let mut engine = EmbeddingEngine::new(config.clone());

    // Generate test texts
    let texts: Vec<String> = (0..num_vectors)
        .map(|i| format!("test document number {} with some content about programming and AI", i))
        .collect();

    // Benchmark: embed + quantize
    let start = Instant::now();
    for text in &texts {
        engine.embed_and_quantize(text);
    }
    let embed_ms = start.elapsed().as_secs_f64() * 1000.0;

    // Benchmark: batch search (compressed domain)
    let start = Instant::now();
    let candidates: Vec<_> = texts.iter().map(|t| engine.embed_and_quantize(t)).collect();
    let query_texts = texts.iter().take(100).collect::<Vec<_>>();
    let mut search_times = Vec::new();
    for q in &query_texts {
        let start_q = Instant::now();
        let _ = engine.search_compressed(q, &candidates, 10);
        search_times.push(start_q.elapsed().as_secs_f64() * 1000.0);
    }
    let search_ms = start.elapsed().as_secs_f64() * 1000.0;

    let stats = engine.stats();
    let avg_embed_ms = embed_ms / num_vectors as f64;
    let avg_search_ms = search_ms / query_texts.len() as f64;

    serde_json::json!({
        "vectors": num_vectors,
        "dim": dim,
        "embed_total_ms": embed_ms,
        "embed_per_vector_ms": avg_embed_ms,
        "embed_throughput_per_sec": 1000.0 / avg_embed_ms,
        "search_total_ms": search_ms,
        "search_per_query_ms": avg_search_ms,
        "compression_ratio": stats.polar_quant.compression_ratio,
        "original_bytes_per_vector": dim * 4,
        "compressed_bytes_per_vector": stats.polar_quant.total_compressed_bytes as f64 / num_vectors as f64,
        "cache_hit_rate": stats.cache_hit_rate,
    })
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
pub enum RouterRequest {
    Route { content: String, task_type: Option<String>, max_tokens: Option<u32>, require_fast: Option<bool>, cost_budget: Option<f64> },
    RegisterProvider { provider: Provider },
    RecordSuccess { provider_id: String, latency_ms: u64, tokens: u64 },
    RecordFailure { provider_id: String },
    CacheResponse { content: String, response: String, tokens: u32, provider_id: String },
    GetStats,
    SetStrategy { strategy: RoutingStrategy },
    UpdateProviderModel { provider_id: String, new_model: String },
    CheckQuota { tokens: u64 },
    GetQuotaStatus,
    // TurboQuant v1.0: PolarQuant benchmark & operations
    PolarQuantBenchmark { num_vectors: Option<usize> },
    PolarQuantEmbed { texts: Vec<String> },
    PolarQuantSearch { query: String, documents: Vec<String>, top_k: Option<usize> },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RouterResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    tracing::info!("HundunOS Model Router v2.0 starting...");

    let router = Arc::new(ModelRouter::new());

    // TurboQuant v1.0: Shared embedding engine
    let embedding_engine = Arc::new(std::sync::Mutex::new(EmbeddingEngine::new(PolarQuantConfig::default())));

    // Register default providers
    router.register_provider(Provider {
        id: "ollama_local".to_string(),
        name: "Ollama Local".to_string(),
        provider_type: ProviderType::Local,
        model: "qwen2.5:1.5b".to_string(),
        capabilities: vec!["text".to_string(), "chat".to_string()],
        max_tokens: 8192,
        cost_per_1m: 0.0,
        endpoint: Some("http://127.0.0.1:11434".to_string()),
        api_key: None,
        speed_tier: SpeedTier::Fast,
        success_rate: 0.95,
        avg_latency_ms: 500,
        token_throughput: 100.0,
    });

    router.register_provider(Provider {
        id: "openai_gpt4".to_string(),
        name: "OpenAI GPT-4".to_string(),
        provider_type: ProviderType::Cloud,
        model: "gpt-4".to_string(),
        capabilities: vec!["text".to_string(), "chat".to_string(), "vision".to_string()],
        max_tokens: 8192,
        cost_per_1m: 30.0,
        endpoint: None,
        api_key: None,
        speed_tier: SpeedTier::Slow,
        success_rate: 0.98,
        avg_latency_ms: 2000,
        token_throughput: 50.0,
    });

    router.register_provider(Provider {
        id: "openai_gpt35".to_string(),
        name: "OpenAI GPT-3.5".to_string(),
        provider_type: ProviderType::Cloud,
        model: "gpt-3.5-turbo".to_string(),
        capabilities: vec!["text".to_string(), "chat".to_string()],
        max_tokens: 4096,
        cost_per_1m: 2.0,
        endpoint: None,
        api_key: None,
        speed_tier: SpeedTier::Balanced,
        success_rate: 0.96,
        avg_latency_ms: 800,
        token_throughput: 200.0,
    });

    let stdin = tokio::io::stdin();
    let mut reader = tokio::io::BufReader::new(stdin).lines();
    let mut stdout = tokio::io::stdout();

    while let Some(line) = reader.next_line().await? {
        let request: RouterRequest = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                let response = RouterResponse::<()> {
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
            RouterRequest::Route { content, task_type, max_tokens, require_fast, cost_budget } => {
                let route_req = RouteRequest { 
                    content, 
                    task_type, 
                    max_tokens, 
                    prefer_local: None,
                    require_fast,
                    cost_budget,
                };
                let result = router.route(&route_req).await;
                let response = RouterResponse {
                    success: true,
                    data: result,
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            RouterRequest::RegisterProvider { provider } => {
                router.register_provider(provider);
                let response = RouterResponse::<()> {
                    success: true,
                    data: None,
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            RouterRequest::RecordSuccess { provider_id, latency_ms, tokens } => {
                router.record_success(&provider_id, latency_ms, tokens).await;
                let response = RouterResponse::<()> {
                    success: true,
                    data: None,
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            RouterRequest::RecordFailure { provider_id } => {
                router.record_failure(&provider_id).await;
                let response = RouterResponse::<()> {
                    success: true,
                    data: None,
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            RouterRequest::CacheResponse { content, response, tokens, provider_id } => {
                router.cache_response(&content, &response, tokens, &provider_id);
                let resp = RouterResponse::<()> {
                    success: true,
                    data: None,
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&resp)?.as_bytes()).await?;
            }
            RouterRequest::GetStats => {
                let stats = router.get_stats().await;
                let response = RouterResponse {
                    success: true,
                    data: Some(stats),
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            RouterRequest::SetStrategy { strategy } => {
                router.set_strategy(strategy).await;
                let response = RouterResponse::<()> {
                    success: true,
                    data: None,
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            RouterRequest::UpdateProviderModel { provider_id, new_model } => {
                let updated = router.update_provider_model(&provider_id, &new_model);
                let response = RouterResponse {
                    success: updated,
                    data: Some(updated),
                    error: if updated { None } else { Some("Provider not found".to_string()) },
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            RouterRequest::CheckQuota { tokens } => {
                let allowed = router.check_quota(tokens).await;
                let response = RouterResponse {
                    success: allowed,
                    data: Some(allowed),
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            RouterRequest::GetQuotaStatus => {
                let quota = router.get_quota_status().await;
                let response = RouterResponse {
                    success: true,
                    data: Some(quota),
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            // TurboQuant v1.0: Benchmark
            RouterRequest::PolarQuantBenchmark { num_vectors } => {
                let n = num_vectors.unwrap_or(1000).min(10000);
                let result = run_polar_benchmark(n);
                let response = RouterResponse {
                    success: true,
                    data: Some(result),
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            // TurboQuant v1.0: Embed texts
            RouterRequest::PolarQuantEmbed { texts } => {
                let mut engine = embedding_engine.lock().unwrap();
                let results: Vec<QuantizedVector> = texts.iter()
                    .map(|t| engine.embed_and_quantize(t))
                    .collect();
                let stats = engine.stats();
                let response = RouterResponse {
                    success: true,
                    data: Some(serde_json::json!({
                        "count": results.len(),
                        "stats": stats,
                    })),
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            // TurboQuant v1.0: Semantic search in compressed domain
            RouterRequest::PolarQuantSearch { query, documents, top_k } => {
                let top_k = top_k.unwrap_or(5);
                let mut engine = embedding_engine.lock().unwrap();
                let candidates: Vec<QuantizedVector> = documents.iter()
                    .map(|d| engine.embed_and_quantize(d))
                    .collect();
                let results = engine.search_compressed(&query, &candidates, top_k);
                let output: Vec<_> = results.iter()
                    .map(|(idx, score)| serde_json::json!({
                        "index": idx,
                        "score": score,
                        "document": documents[*idx],
                    }))
                    .collect();
                let response = RouterResponse {
                    success: true,
                    data: Some(output),
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
// v3.0: TaxHacker-inspired Provider Registry + Structured Output
// 借鉴 TaxHacker ai/schema.ts SUPPORTED_PROVIDERS 架构
// ================================================================

/// Provider 元数据（对齐 hundunos model-router v4.0 SUPPORTED_PROVIDERS）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderMeta {
    /// Provider key（唯一标识）
    pub key: String,
    /// 人类可读名称
    pub label: String,
    /// 配置键名（config.system.modelRouter 中的键）
    pub config_key: String,
    /// API Key 环境变量名
    pub api_key_name: Option<String>,
    /// 默认模型
    pub default_model: String,
    /// 默认 Base URL（OpenAI-Compatible 专用）
    pub default_base_url: Option<String>,
    /// Logo 路径
    pub logo: String,
    /// 文档 URL
    pub docs_url: String,
    /// Provider 类型
    pub provider_type: ProviderType,
    /// 默认成本（$/1M tokens）
    pub default_cost_per_1m: f64,
    /// 最大上下文窗口
    pub default_max_tokens: u32,
}

/// Provider 元数据（const 版本，使用 &'static str）
#[derive(Debug, Clone)]
pub struct ProviderMetaConst {
    pub key: &'static str,
    pub label: &'static str,
    pub config_key: &'static str,
    pub api_key_name: Option<&'static str>,
    pub default_model: &'static str,
    pub default_base_url: Option<&'static str>,
    pub logo: &'static str,
    pub docs_url: &'static str,
    pub provider_type: ProviderType,
    pub default_cost_per_1m: f64,
    pub default_max_tokens: u32,
}

impl Default for ProviderMeta {
    fn default() -> Self {
        Self {
            key: String::from("unknown"),
            label: String::from("Unknown"),
            config_key: String::new(),
            api_key_name: None,
            default_model: String::new(),
            default_base_url: None,
            logo: String::new(),
            docs_url: String::new(),
            provider_type: ProviderType::Cloud,
            default_cost_per_1m: 0.0,
            default_max_tokens: 8192,
        }
    }
}

/// 内置 Provider 元数据（与 hundunos model-router v4.0 对齐）
pub const SUPPORTED_PROVIDERS: &[ProviderMetaConst] = &[
    ProviderMetaConst {
        key: "openai",
        label: "OpenAI",
        config_key: "openai",
        api_key_name: Some("OPENAI_API_KEY"),
        default_model: "gpt-4o-mini",
        default_base_url: None,
        logo: "/logo/openai.svg",
        docs_url: "https://platform.openai.com/settings/organization/api-keys",
        provider_type: ProviderType::Cloud,
        default_cost_per_1m: 0.15,
        default_max_tokens: 128_000,
    },
    ProviderMetaConst {
        key: "anthropic",
        label: "Anthropic (Claude)",
        config_key: "anthropic",
        api_key_name: Some("ANTHROPIC_API_KEY"),
        default_model: "claude-3-5-haiku",
        default_base_url: None,
        logo: "/logo/anthropic.svg",
        docs_url: "https://console.anthropic.com/settings/keys",
        provider_type: ProviderType::Cloud,
        default_cost_per_1m: 0.25,
        default_max_tokens: 200_000,
    },
    ProviderMetaConst {
        key: "google",
        label: "Google Gemini",
        config_key: "google",
        api_key_name: Some("GOOGLE_API_KEY"),
        default_model: "gemini-2.5-flash",
        default_base_url: None,
        logo: "/logo/google.svg",
        docs_url: "https://aistudio.google.com/apikey",
        provider_type: ProviderType::Cloud,
        default_cost_per_1m: 0.075,
        default_max_tokens: 1_048_576,
    },
    ProviderMetaConst {
        key: "mistral",
        label: "Mistral",
        config_key: "mistral",
        api_key_name: Some("MISTRAL_API_KEY"),
        default_model: "mistral-small-latest",
        default_base_url: None,
        logo: "/logo/mistral.svg",
        docs_url: "https://admin.mistral.ai/organization/api-keys",
        provider_type: ProviderType::Cloud,
        default_cost_per_1m: 0.20,
        default_max_tokens: 128_000,
    },
    ProviderMetaConst {
        key: "openai_compatible",
        label: "Ollama / LM Studio / vLLM / LocalAI",
        config_key: "ollama",
        api_key_name: None,
        default_model: "qwen2.5:1.5b",
        default_base_url: Some("http://localhost:11434/v1"),
        logo: "/logo/openai.svg",
        docs_url: "https://github.com/ollama/ollama/blob/main/docs/openai.md",
        provider_type: ProviderType::Local,
        default_cost_per_1m: 0.0,
        default_max_tokens: 8192,
    },
];

/// 获取指定 key 的 Provider 元数据
pub fn get_provider_meta(key: &str) -> Option<&'static ProviderMetaConst> {
    SUPPORTED_PROVIDERS.iter().find(|p| p.key == key)
}

/// 获取所有支持的 Provider
pub fn get_all_provider_meta() -> Vec<&'static ProviderMetaConst> {
    SUPPORTED_PROVIDERS.iter().collect()
}

/// 按类型过滤 Provider
pub fn get_providers_by_type(provider_type: &ProviderType) -> Vec<&'static ProviderMetaConst> {
    SUPPORTED_PROVIDERS
        .iter()
        .filter(|p| &p.provider_type == provider_type)
        .collect()
}

// ================================================================
// v3.0: Structured Output 支持（TaxHacker withStructuredOutput 风格）
// ================================================================

/// Structured Output 参数定义（TaxHacker fieldsToJsonSchema 风格）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructuredOutputSchema {
    /// JSON Schema 对象
    pub schema: serde_json::Value,
    /// 可选：schema 名称（用于 withStructuredOutput）
    pub name: Option<String>,
    /// 严格模式（strict validation）
    pub strict: bool,
}

impl Default for StructuredOutputSchema {
    fn default() -> Self {
        Self {
            schema: serde_json::json!({ "type": "object", "properties": {} }),
            name: None,
            strict: false,
        }
    }
}

impl StructuredOutputSchema {
    /// 从字段定义构建 JSON Schema（TaxHacker fieldsToJsonSchema 风格）
    /// 对应 hundunos kernel/prompt-template.js 的 fieldsToJsonSchema()
    pub fn from_fields(
        fields: &[(&str, &str, bool)], // (code, llm_prompt, is_required)
    ) -> Self {
        let mut properties = serde_json::Map::new();
        let mut required = Vec::new();

        for (code, llm_prompt, is_required) in fields {
            let mut prop = serde_json::Map::new();
            prop.insert("type".to_string(), serde_json::json!("string"));
            prop.insert(
                "description".to_string(),
                serde_json::json!(llm_prompt.to_string()),
            );
            properties.insert(code.to_string(), serde_json::json!(prop));
            if *is_required {
                required.push(serde_json::json!(code.to_string()));
            }
        }

        Self {
            schema: serde_json::json!({
                "type": "object",
                "properties": properties,
                "required": required,
                "additionalProperties": false
            }),
            name: None,
            strict: false,
        }
    }

    /// 构建 LLM 提取 prompt（TaxHacker buildLLMPrompt 风格）
    /// 输出示例：
    ///   "Please extract the following fields from the text:"
    ///   "- name: 用户姓名 [required]"
    ///   "- email: 邮箱地址"
    pub fn build_extraction_prompt(&self, text: &str) -> String {
        let schema_obj = self.schema.as_object().unwrap();
        let properties = schema_obj.get("properties").and_then(|v| v.as_object());
        let required = schema_obj
            .get("required")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str())
                    .collect::<std::collections::HashSet<_>>()
            })
            .unwrap_or_default();

        let field_lines: Vec<String> = properties
            .map(|props| {
                props
                    .iter()
                    .map(|(name, schema)| {
                        let desc = schema
                            .as_object()
                            .and_then(|o| o.get("description"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let required_marker = if required.contains(name.as_str()) {
                            " [required]"
                        } else {
                            ""
                        };
                        format!("- {}: {}{}", name, desc, required_marker)
                    })
                    .collect()
            })
            .unwrap_or_default();

        format!(
            "请从以下文本中提取结构化信息：\n\n{}\n\n需要提取的字段：\n{}",
            text,
            field_lines.join("\n")
        )
    }

    /// 从 JSON Schema 构建 extraction prompt（TaxHacker buildLLMPrompt 封装）
    pub fn build_extraction_prompt_from_schema(&self, text: &str) -> String {
        self.build_extraction_prompt(text)
    }

    /// 验证 LLM 输出是否符合 schema（TaxHacker structured output 验证风格）
    pub fn validate(&self, output: &serde_json::Value) -> (bool, Vec<String>) {
        let mut errors = Vec::new();

        if !output.is_object() {
            errors.push("Output must be a JSON object".to_string());
            return (false, errors);
        }

        let schema_obj = self.schema.as_object().unwrap();
        let properties = schema_obj.get("properties").and_then(|v| v.as_object());
        let required = schema_obj
            .get("required")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str())
                    .collect::<std::collections::HashSet<_>>()
            })
            .unwrap_or_default();
        let output_obj = output.as_object().unwrap();

        // 检查必填字段
        for req in &required {
            if !output_obj.contains_key(&**req) {
                errors.push(format!("Missing required field: {}", req));
            }
        }

        // 检查类型
        if let Some(props) = properties {
            for (key, value) in output_obj {
                if let Some(expected_schema) = props.get(key) {
                    let expected_type = expected_schema
                        .as_object()
                        .and_then(|o| o.get("type"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("string");

                    let actual_type = match value {
                        serde_json::Value::Null => "null",
                        serde_json::Value::Bool(_) => "boolean",
                        serde_json::Value::Number(_) => "number",
                        serde_json::Value::String(_) => "string",
                        serde_json::Value::Array(_) => "array",
                        serde_json::Value::Object(_) => "object",
                    };

                    if expected_type == "integer" && actual_type == "number" {
                        // 允许 number 作为 integer 的子类型
                    } else if actual_type != expected_type {
                        errors.push(format!(
                            "Field '{}' type mismatch: expected {}, got {}",
                            key, expected_type, actual_type
                        ));
                    }
                }
            }
        }

        (errors.is_empty(), errors)
    }

    /// 解析 LLM JSON 输出（容错：去除 markdown 包裹）
    /// 对应 hundunos kernel/prompt-template.js 的 parseLLMResponse()
    pub fn parse_json_output(raw: &str) -> Result<serde_json::Value, String> {
        let text = raw
            .trim()
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim();

        serde_json::from_str(text).map_err(|e| format!("JSON parse failed: {}", e))
    }
}

/// Structured Output 调用结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructuredOutputResult {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub validation_errors: Option<Vec<String>>,
    pub provider: Option<String>,
    pub tokens_used: Option<u32>,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
}

impl StructuredOutputResult {
    /// 从原始 LLM 输出构造（TaxHacker structured output 流程）
    pub fn from_raw_response(
        raw: &str,
        schema: &StructuredOutputSchema,
        provider: &str,
        latency_ms: u64,
    ) -> Self {
        // Step 1: JSON 解析（容错）
        let parsed = match StructuredOutputSchema::parse_json_output(raw) {
            Ok(v) => v,
            Err(e) => {
                return Self {
                    success: false,
                    data: None,
                    validation_errors: None,
                    provider: Some(provider.to_string()),
                    tokens_used: None,
                    latency_ms: Some(latency_ms),
                    error: Some(e),
                };
            }
        };

        // Step 2: Schema 验证
        let (valid, errors) = schema.validate(&parsed);
        if !valid {
            return Self {
                success: false,
                data: Some(parsed),
                validation_errors: Some(errors),
                provider: Some(provider.to_string()),
                tokens_used: None,
                latency_ms: Some(latency_ms),
                error: Some("Schema validation failed".to_string()),
            };
        }

        Self {
            success: true,
            data: Some(parsed),
            validation_errors: None,
            provider: Some(provider.to_string()),
            tokens_used: None,
            latency_ms: Some(latency_ms),
            error: None,
        }
    }
}

#[cfg(test)]
mod provider_meta_tests {
    use super::*;

    #[test]
    fn test_get_provider_meta() {
        let openai = get_provider_meta("openai").unwrap();
        assert_eq!(openai.label, "OpenAI");
        assert_eq!(openai.provider_type, ProviderType::Cloud);
        assert_eq!(openai.default_model, "gpt-4o-mini");
    }

    #[test]
    fn test_get_all_providers() {
        let all = get_all_provider_meta();
        assert!(all.len() >= 5);
    }

    #[test]
    fn test_get_providers_by_type() {
        let local = get_providers_by_type(&ProviderType::Local);
        assert!(!local.is_empty());
        let cloud = get_providers_by_type(&ProviderType::Cloud);
        assert!(cloud.len() >= 3);
    }

    #[test]
    fn test_structured_output_schema_from_fields() {
        let schema = StructuredOutputSchema::from_fields(&[
            ("name", "用户姓名", true),
            ("email", "邮箱地址", false),
        ]);
        assert_eq!(schema.schema["type"], "object");
        assert!(schema.schema["properties"].as_object().unwrap().contains_key("name"));
        assert!(schema.schema["required"].as_array().unwrap().contains(&serde_json::json!("name")));
    }

    #[test]
    fn test_schema_validation_success() {
        let schema = StructuredOutputSchema::from_fields(&[
            ("name", "用户名", true),
            ("age", "年龄", false),
        ]);
        let output = serde_json::json!({
            "name": "张三",
            "age": "30"
        });
        let (valid, errors) = schema.validate(&output);
        assert!(valid);
        assert!(errors.is_empty());
    }

    #[test]
    fn test_schema_validation_missing_required() {
        let schema = StructuredOutputSchema::from_fields(&[
            ("name", "用户名", true),
        ]);
        let output = serde_json::json!({});
        let (valid, errors) = schema.validate(&output);
        assert!(!valid);
        assert!(errors.iter().any(|e| e.contains("Missing required")));
    }

    #[test]
    fn test_parse_json_output() {
        let raw = "```json\n{\"name\": \"测试\"}\n```";
        let parsed = StructuredOutputSchema::parse_json_output(raw).unwrap();
        assert_eq!(parsed["name"], "测试");
    }

    #[test]
    fn test_structured_result_from_raw() {
        let schema = StructuredOutputSchema::from_fields(&[
            ("name", "用户名", true),
        ]);
        let raw = r#"{"name": "李四"}"#;
        let result = StructuredOutputResult::from_raw_response(raw, &schema, "openai", 150);
        assert!(result.success);
        assert_eq!(result.provider, Some("openai".to_string()));
        assert!(result.latency_ms.is_some());
    }

    #[test]
    fn test_build_extraction_prompt() {
        let schema = StructuredOutputSchema::from_fields(&[
            ("name", "用户姓名", true),
            ("email", "邮箱地址", false),
        ]);
        let prompt = schema.build_extraction_prompt("用户王五的邮箱是 test@example.com");
        assert!(prompt.contains("name"));
        assert!(prompt.contains("[required]"));
        assert!(prompt.contains("email"));
    }
}
