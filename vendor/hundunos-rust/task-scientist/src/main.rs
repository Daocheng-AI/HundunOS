// task-scientist/src/main.rs
// AI-Scientist-v2 inspired Agentic Task Orchestration
// Implements Best-First Tree Search (BFTS) for general task execution

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt};

use dashmap::DashMap;
use uuid::Uuid;
use chrono::{DateTime, Utc};

// ================================================================
// Core Types - Inspired by AI-Scientist-v2 Journal/Node
// ================================================================

/// Execution result with detailed tracking (from Tool Bridge v3.0)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub exec_time_ms: u64,
    pub exc_type: Option<String>,
    pub exc_info: Option<serde_json::Value>,
    pub exc_stack: Option<Vec<StackFrame>>,
    pub truncated: bool,
    pub metric: Option<MetricValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StackFrame {
    pub filename: String,
    pub lineno: u32,
    pub name: String,
    pub line: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricValue {
    pub name: String,
    pub value: f64,
    pub lower_is_better: bool,
    pub description: String,
}

/// Task stage definition (inspired by AI-Scientist-v2 stages)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum TaskStage {
    Analysis,      // Analyze requirements
    Planning,      // Create execution plan
    Execution,     // Execute the plan
    Verification,  // Verify results
    Refinement,    // Improve based on feedback
}

impl TaskStage {
    pub fn as_str(&self) -> &'static str {
        match self {
            TaskStage::Analysis => "analysis",
            TaskStage::Planning => "planning",
            TaskStage::Execution => "execution",
            TaskStage::Verification => "verification",
            TaskStage::Refinement => "refinement",
        }
    }

    pub fn next_stage(&self) -> Option<TaskStage> {
        match self {
            TaskStage::Analysis => Some(TaskStage::Planning),
            TaskStage::Planning => Some(TaskStage::Execution),
            TaskStage::Execution => Some(TaskStage::Verification),
            TaskStage::Verification => Some(TaskStage::Refinement),
            TaskStage::Refinement => None,
        }
    }
}

/// Task node - core unit of the execution tree
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskNode {
    pub id: String,
    pub stage: TaskStage,
    pub step: u32,
    pub plan: String,
    pub code: String,           // Executable representation
    pub parent: Option<String>, // Parent node ID
    pub children: Vec<String>,  // Child node IDs
    
    // Execution info
    pub ctime: u64,
    pub exec_result: Option<ExecutionResult>,
    
    // Evaluation
    pub analysis: Option<String>,
    pub is_buggy: bool,
    pub metric: Option<MetricValue>,
    
    // Stage tracking
    pub stage_name: String,     // "draft", "debug", "improve"
    pub is_seed_node: bool,
}

impl TaskNode {
    pub fn new(stage: TaskStage, plan: String, code: String, parent: Option<String>) -> Self {
        let is_seed = parent.is_none();
        let stage_name = if is_seed {
            "draft".to_string()
        } else {
            "improve".to_string()
        };

        Self {
            id: format!("node_{}", Uuid::new_v4()),
            stage,
            step: 0,
            plan,
            code,
            parent,
            children: Vec::new(),
            ctime: current_timestamp_ms(),
            exec_result: None,
            analysis: None,
            is_buggy: false,
            metric: None,
            stage_name,
            is_seed_node: is_seed,
        }
    }

    pub fn is_leaf(&self) -> bool {
        self.children.is_empty()
    }
}

/// Stage configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageConfig {
    pub name: String,
    pub description: String,
    pub goals: Vec<String>,
    pub max_iterations: u32,
    pub num_drafts: u32,
}

/// Stage transition record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageTransition {
    pub from_stage: String,
    pub to_stage: String,
    pub reason: String,
    pub timestamp: u64,
}

/// Task Journal - tracks all execution history
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskJournal {
    pub task_id: String,
    pub root_nodes: Vec<String>,
    pub nodes: HashMap<String, TaskNode>,
    pub best_node: Option<String>,
    pub stage_transitions: Vec<StageTransition>,
    pub completed_stages: Vec<String>,
    pub current_stage: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

impl TaskJournal {
    pub fn new(task_id: String) -> Self {
        let now = current_timestamp_ms();
        Self {
            task_id,
            root_nodes: Vec::new(),
            nodes: HashMap::new(),
            best_node: None,
            stage_transitions: Vec::new(),
            completed_stages: Vec::new(),
            current_stage: None,
            created_at: now,
            updated_at: now,
        }
    }

    pub fn add_node(&mut self, node: TaskNode) -> String {
        // Update parent if exists
        if let Some(ref parent_id) = node.parent {
            if let Some(parent) = self.nodes.get_mut(parent_id) {
                parent.children.push(node.id.clone());
            }
        } else {
            self.root_nodes.push(node.id.clone());
        }

        let id = node.id.clone();
        self.nodes.insert(id.clone(), node);
        self.updated_at = current_timestamp_ms();
        id
    }

    pub fn get_node(&self, id: &str) -> Option<&TaskNode> {
        self.nodes.get(id)
    }

    pub fn get_node_mut(&mut self, id: &str) -> Option<&mut TaskNode> {
        self.nodes.get_mut(id)
    }

    pub fn get_best_node(&self) -> Option<&TaskNode> {
        self.best_node.as_ref().and_then(|id| self.nodes.get(id))
    }

    pub fn set_best_node(&mut self, node_id: String) {
        self.best_node = Some(node_id);
        self.updated_at = current_timestamp_ms();
    }

    pub fn record_stage_transition(&mut self, from: &str, to: &str, reason: &str) {
        self.stage_transitions.push(StageTransition {
            from_stage: from.to_string(),
            to_stage: to.to_string(),
            reason: reason.to_string(),
            timestamp: current_timestamp_ms(),
        });
        self.completed_stages.push(from.to_string());
        self.current_stage = Some(to.to_string());
        self.updated_at = current_timestamp_ms();
    }

    /// Get execution path from root to node
    pub fn get_path(&self, node_id: &str) -> Vec<&TaskNode> {
        let mut path = Vec::new();
        let mut current = node_id;
        
        while let Some(node) = self.nodes.get(current) {
            path.push(node);
            match &node.parent {
                Some(parent_id) => current = parent_id,
                None => break,
            }
        }
        
        path.reverse();
        path
    }

    /// Get all leaf nodes
    pub fn get_leaf_nodes(&self) -> Vec<&TaskNode> {
        self.nodes.values().filter(|n| n.is_leaf()).collect()
    }

    /// Tree visualization (text format)
    pub fn visualize_tree(&self) -> String {
        let mut output = String::new();
        output.push_str(&format!("Task Journal: {}\n", self.task_id));
        output.push_str(&format!("Created: {}\n", timestamp_to_datetime(self.created_at)));
        output.push_str(&format!("Nodes: {}\n", self.nodes.len()));
        
        if let Some(ref best) = self.best_node {
            output.push_str(&format!("Best Node: {}\n", best));
        }
        
        output.push_str("\nTree Structure:\n");
        for root_id in &self.root_nodes {
            self.visualize_node(&mut output, root_id, "", true);
        }
        
        output
    }

    fn visualize_node(&self, output: &mut String, node_id: &str, prefix: &str, is_last: bool) {
        if let Some(node) = self.nodes.get(node_id) {
            let connector = if is_last { "└── " } else { "├── " };
            let status = if node.is_buggy { "❌" } else if node.exec_result.is_some() { "✓" } else { "○" };
            let metric_str = node.metric.as_ref()
                .map(|m| format!(" [{:.2}]", m.value))
                .unwrap_or_default();
            
            output.push_str(&format!("{}{}{} {}{} ({} {})\n", 
                prefix, connector, status, 
                node.stage.as_str(), metric_str,
                node.id.chars().skip(5).take(8).collect::<String>(),
                node.stage_name
            ));

            let new_prefix = if is_last { "    " } else { "│   " };
            let child_count = node.children.len();
            for (i, child_id) in node.children.iter().enumerate() {
                self.visualize_node(output, child_id, &format!("{}{}", prefix, new_prefix), i == child_count - 1);
            }
        }
    }
}

// ================================================================
// Search Configuration
// ================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchConfig {
    pub num_workers: u32,
    pub steps: u32,
    pub max_debug_depth: u32,
    pub debug_prob: f64,
    pub num_drafts: u32,
    pub num_seeds: u32,
}

impl Default for SearchConfig {
    fn default() -> Self {
        Self {
            num_workers: 3,
            steps: 21,
            max_debug_depth: 3,
            debug_prob: 0.5,
            num_drafts: 3,
            num_seeds: 3,
        }
    }
}

// ================================================================
// Task Orchestrator
// ================================================================

pub struct TaskOrchestrator {
    journals: DashMap<String, TaskJournal>,
    config: SearchConfig,
    execution_callback: Option<Arc<dyn Fn(&TaskNode) -> ExecutionResult + Send + Sync>>,
}

impl TaskOrchestrator {
    pub fn new(config: SearchConfig) -> Self {
        Self {
            journals: DashMap::new(),
            config,
            execution_callback: None,
        }
    }

    pub fn set_execution_callback<F>(&mut self, callback: F)
    where
        F: Fn(&TaskNode) -> ExecutionResult + Send + Sync + 'static,
    {
        self.execution_callback = Some(Arc::new(callback));
    }

    /// Create a new task with initial draft nodes
    pub fn create_task(&self, task_id: String, description: TaskDescription) -> Result<String> {
        let mut journal = TaskJournal::new(task_id.clone());
        
        // Create initial draft nodes
        for i in 0..self.config.num_drafts {
            let plan = format!("Draft {}: {}", i + 1, description.title);
            let code = description.initial_code.clone().unwrap_or_default();
            let node = TaskNode::new(TaskStage::Analysis, plan, code, None);
            journal.add_node(node);
        }

        journal.current_stage = Some("analysis".to_string());
        self.journals.insert(task_id.clone(), journal);
        
        Ok(task_id)
    }

    /// Get journal by ID
    pub fn get_journal(&self, task_id: &str) -> Option<TaskJournal> {
        self.journals.get(task_id).map(|j| j.clone())
    }

    /// Execute a node (simulated - in real implementation would call Tool Bridge)
    pub async fn execute_node(&self, task_id: &str, node_id: &str) -> Result<ExecutionResult> {
        let mut journal = self.journals.get_mut(task_id)
            .ok_or_else(|| anyhow::anyhow!("Task not found"))?;
        
        let node = journal.get_node(node_id)
            .ok_or_else(|| anyhow::anyhow!("Node not found"))?;

        // In real implementation, this would call Tool Bridge v3.0
        // For now, return a simulated result
        let result = ExecutionResult {
            stdout: format!("Executed: {}", node.plan),
            stderr: String::new(),
            exit_code: 0,
            exec_time_ms: 100,
            exc_type: None,
            exc_info: None,
            exc_stack: None,
            truncated: false,
            metric: Some(MetricValue {
                name: "success_rate".to_string(),
                value: 0.85,
                lower_is_better: false,
                description: "Task success rate".to_string(),
            }),
        };

        // Update node with result
        if let Some(node) = journal.get_node_mut(node_id) {
            node.exec_result = Some(result.clone());
            node.is_buggy = result.exit_code != 0;
            node.metric = result.metric.clone();
        }

        Ok(result)
    }

    /// Select best node based on metrics
    pub fn select_best_node(&self, task_id: &str) -> Result<Option<String>> {
        let mut journal = self.journals.get_mut(task_id)
            .ok_or_else(|| anyhow::anyhow!("Task not found"))?;

        let leaf_nodes: Vec<&TaskNode> = journal.get_leaf_nodes()
            .into_iter()
            .filter(|n| n.exec_result.is_some() && !n.is_buggy)
            .collect();

        if leaf_nodes.is_empty() {
            return Ok(None);
        }

        // Select node with best metric
        let best = leaf_nodes.iter()
            .filter_map(|n| n.metric.as_ref().map(|m| (n.id.clone(), m)))
            .max_by(|(_, a), (_, b)| {
                if a.lower_is_better {
                    a.value.partial_cmp(&b.value).unwrap()
                } else {
                    b.value.partial_cmp(&a.value).unwrap()
                }
            })
            .map(|(id, _)| id);

        if let Some(ref best_id) = best {
            journal.set_best_node(best_id.clone());
        }

        Ok(best)
    }

    /// Expand a node by creating child nodes
    pub fn expand_node(&self, task_id: &str, parent_id: &str, num_children: u32) -> Result<Vec<String>> {
        let mut journal = self.journals.get_mut(task_id)
            .ok_or_else(|| anyhow::anyhow!("Task not found"))?;

        let parent = journal.get_node(parent_id)
            .ok_or_else(|| anyhow::anyhow!("Parent node not found"))?
            .clone();

        let mut child_ids = Vec::new();
        
        for i in 0..num_children {
            let plan = format!("{} - Variant {}", parent.plan, i + 1);
            let code = format!("{}\n// Variant {}", parent.code, i + 1);
            let stage = parent.stage.clone();
            
            let child = TaskNode::new(stage, plan, code, Some(parent_id.to_string()));
            let child_id = journal.add_node(child);
            child_ids.push(child_id);
        }

        Ok(child_ids)
    }

    /// Transition to next stage
    pub fn transition_stage(&self, task_id: &str, to_stage: TaskStage, reason: &str) -> Result<()> {
        let mut journal = self.journals.get_mut(task_id)
            .ok_or_else(|| anyhow::anyhow!("Task not found"))?;

        let from_stage = journal.current_stage.clone()
            .unwrap_or_else(|| "unknown".to_string());
        
        journal.record_stage_transition(&from_stage, to_stage.as_str(), reason);

        // Create new seed nodes for the new stage
        if let Some(ref best_id) = journal.best_node.clone() {
            let best = journal.get_node(best_id).cloned();
            if let Some(best_node) = best {
                let plan = format!("Stage {} from best: {}", to_stage.as_str(), best_node.plan);
                let code = best_node.code.clone();
                let node = TaskNode::new(to_stage, plan, code, None);
                journal.add_node(node);
            }
        }

        Ok(())
    }

    /// Run BFTS search for a task
    pub async fn run_bfts(&self, task_id: &str) -> Result<TaskJournal> {
        let steps = self.config.steps;
        
        for step in 0..steps {
            tracing::info!("BFTS Step {}/{}", step + 1, steps);
            
            // Get current journal
            let journal = self.get_journal(task_id)
                .ok_or_else(|| anyhow::anyhow!("Task not found"))?;

            // Find leaf nodes to expand
            let leaf_nodes: Vec<String> = journal.get_leaf_nodes()
                .into_iter()
                .filter(|n| n.exec_result.is_none())
                .map(|n| n.id.clone())
                .collect();

            if leaf_nodes.is_empty() {
                tracing::info!("No more nodes to expand");
                break;
            }

            // Execute leaf nodes in parallel (up to num_workers)
            let to_execute: Vec<String> = leaf_nodes.into_iter()
                .take(self.config.num_workers as usize)
                .collect();

            for node_id in to_execute {
                if let Err(e) = self.execute_node(task_id, &node_id).await {
                    tracing::error!("Failed to execute node {}: {}", node_id, e);
                }
            }

            // Select best node
            self.select_best_node(task_id)?;

            // Expand best node
            if step < steps - 1 {
                if let Ok(Some(best_id)) = self.select_best_node(task_id) {
                    self.expand_node(task_id, &best_id, 2)?;
                }
            }
        }

        self.get_journal(task_id)
            .ok_or_else(|| anyhow::anyhow!("Task not found"))
    }

    /// Get task statistics
    pub fn get_stats(&self, task_id: &str) -> Option<TaskStats> {
        self.journals.get(task_id).map(|journal| {
            let j = journal.value();
            TaskStats {
                task_id: j.task_id.clone(),
                total_nodes: j.nodes.len(),
                root_nodes: j.root_nodes.len(),
                leaf_nodes: j.get_leaf_nodes().len(),
                completed_stages: j.completed_stages.len(),
                best_node: j.best_node.clone(),
                created_at: j.created_at,
                updated_at: j.updated_at,
            }
        })
    }

    /// List all tasks
    pub fn list_tasks(&self) -> Vec<String> {
        self.journals.iter().map(|e| e.key().clone()).collect()
    }

    /// Delete a task
    pub fn delete_task(&self, task_id: &str) -> bool {
        self.journals.remove(task_id).is_some()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskDescription {
    pub title: String,
    pub description: String,
    pub initial_code: Option<String>,
    pub stages: Vec<StageConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskStats {
    pub task_id: String,
    pub total_nodes: usize,
    pub root_nodes: usize,
    pub leaf_nodes: usize,
    pub completed_stages: usize,
    pub best_node: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

// ================================================================
// CLI Interface
// ================================================================

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "action")]
pub enum TaskScientistRequest {
    CreateTask { 
        task_id: String,
        description: TaskDescription,
    },
    ExecuteNode {
        task_id: String,
        node_id: String,
    },
    ExpandNode {
        task_id: String,
        node_id: String,
        num_children: u32,
    },
    SelectBest {
        task_id: String,
    },
    TransitionStage {
        task_id: String,
        to_stage: TaskStage,
        reason: String,
    },
    RunBfts {
        task_id: String,
    },
    GetJournal {
        task_id: String,
    },
    GetStats {
        task_id: String,
    },
    VisualizeTree {
        task_id: String,
    },
    ListTasks,
    DeleteTask {
        task_id: String,
    },
    GetConfig,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TaskScientistResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

fn current_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

fn timestamp_to_datetime(timestamp: u64) -> String {
    let dt = DateTime::from_timestamp_millis(timestamp as i64)
        .unwrap_or_else(|| Utc::now());
    dt.format("%Y-%m-%d %H:%M:%S").to_string()
}

// ================================================================
// Main Function
// ================================================================

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    tracing::info!("Task Scientist v0.3.0 starting...");
    tracing::info!("AI-Scientist-v2 inspired Agentic Task Orchestration");

    let config = SearchConfig::default();
    let orchestrator = Arc::new(TaskOrchestrator::new(config));

    let stdin = tokio::io::stdin();
    let mut reader = tokio::io::BufReader::new(stdin).lines();
    let mut stdout = tokio::io::stdout();

    while let Some(line) = reader.next_line().await? {
        let request: TaskScientistRequest = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                let response = TaskScientistResponse::<()> {
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
            TaskScientistRequest::CreateTask { task_id, description } => {
                match orchestrator.create_task(task_id.clone(), description) {
                    Ok(_) => {
                        let response = TaskScientistResponse {
                            success: true,
                            data: Some(serde_json::json!({ "task_id": task_id })),
                            error: None,
                        };
                        stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
                    }
                    Err(e) => {
                        let response = TaskScientistResponse::<()> {
                            success: false,
                            data: None,
                            error: Some(e.to_string()),
                        };
                        stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
                    }
                }
            }
            TaskScientistRequest::ExecuteNode { task_id, node_id } => {
                match orchestrator.execute_node(&task_id, &node_id).await {
                    Ok(result) => {
                        let response = TaskScientistResponse {
                            success: true,
                            data: Some(result),
                            error: None,
                        };
                        stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
                    }
                    Err(e) => {
                        let response = TaskScientistResponse::<()> {
                            success: false,
                            data: None,
                            error: Some(e.to_string()),
                        };
                        stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
                    }
                }
            }
            TaskScientistRequest::ExpandNode { task_id, node_id, num_children } => {
                match orchestrator.expand_node(&task_id, &node_id, num_children) {
                    Ok(child_ids) => {
                        let response = TaskScientistResponse {
                            success: true,
                            data: Some(serde_json::json!({ "child_ids": child_ids })),
                            error: None,
                        };
                        stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
                    }
                    Err(e) => {
                        let response = TaskScientistResponse::<()> {
                            success: false,
                            data: None,
                            error: Some(e.to_string()),
                        };
                        stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
                    }
                }
            }
            TaskScientistRequest::SelectBest { task_id } => {
                match orchestrator.select_best_node(&task_id) {
                    Ok(best_id) => {
                        let response = TaskScientistResponse {
                            success: true,
                            data: Some(serde_json::json!({ "best_node": best_id })),
                            error: None,
                        };
                        stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
                    }
                    Err(e) => {
                        let response = TaskScientistResponse::<()> {
                            success: false,
                            data: None,
                            error: Some(e.to_string()),
                        };
                        stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
                    }
                }
            }
            TaskScientistRequest::TransitionStage { task_id, to_stage, reason } => {
                match orchestrator.transition_stage(&task_id, to_stage, &reason) {
                    Ok(_) => {
                        let response = TaskScientistResponse::<()> {
                            success: true,
                            data: None,
                            error: None,
                        };
                        stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
                    }
                    Err(e) => {
                        let response = TaskScientistResponse::<()> {
                            success: false,
                            data: None,
                            error: Some(e.to_string()),
                        };
                        stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
                    }
                }
            }
            TaskScientistRequest::RunBfts { task_id } => {
                match orchestrator.run_bfts(&task_id).await {
                    Ok(journal) => {
                        let response = TaskScientistResponse {
                            success: true,
                            data: Some(journal),
                            error: None,
                        };
                        stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
                    }
                    Err(e) => {
                        let response = TaskScientistResponse::<()> {
                            success: false,
                            data: None,
                            error: Some(e.to_string()),
                        };
                        stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
                    }
                }
            }
            TaskScientistRequest::GetJournal { task_id } => {
                match orchestrator.get_journal(&task_id) {
                    Some(journal) => {
                        let response = TaskScientistResponse {
                            success: true,
                            data: Some(journal),
                            error: None,
                        };
                        stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
                    }
                    None => {
                        let response = TaskScientistResponse::<()> {
                            success: false,
                            data: None,
                            error: Some("Task not found".to_string()),
                        };
                        stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
                    }
                }
            }
            TaskScientistRequest::GetStats { task_id } => {
                match orchestrator.get_stats(&task_id) {
                    Some(stats) => {
                        let response = TaskScientistResponse {
                            success: true,
                            data: Some(stats),
                            error: None,
                        };
                        stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
                    }
                    None => {
                        let response = TaskScientistResponse::<()> {
                            success: false,
                            data: None,
                            error: Some("Task not found".to_string()),
                        };
                        stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
                    }
                }
            }
            TaskScientistRequest::VisualizeTree { task_id } => {
                match orchestrator.get_journal(&task_id) {
                    Some(journal) => {
                        let visualization = journal.visualize_tree();
                        let response = TaskScientistResponse {
                            success: true,
                            data: Some(serde_json::json!({ "visualization": visualization })),
                            error: None,
                        };
                        stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
                    }
                    None => {
                        let response = TaskScientistResponse::<()> {
                            success: false,
                            data: None,
                            error: Some("Task not found".to_string()),
                        };
                        stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
                    }
                }
            }
            TaskScientistRequest::ListTasks => {
                let tasks = orchestrator.list_tasks();
                let response = TaskScientistResponse {
                    success: true,
                    data: Some(tasks),
                    error: None,
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            TaskScientistRequest::DeleteTask { task_id } => {
                let deleted = orchestrator.delete_task(&task_id);
                let response = TaskScientistResponse {
                    success: deleted,
                    data: Some(serde_json::json!({ "deleted": deleted })),
                    error: if deleted { None } else { Some("Task not found".to_string()) },
                };
                stdout.write_all(serde_json::to_string(&response)?.as_bytes()).await?;
            }
            TaskScientistRequest::GetConfig => {
                let config = SearchConfig::default();
                let response = TaskScientistResponse {
                    success: true,
                    data: Some(config),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_task_journal() {
        let mut journal = TaskJournal::new("test_task".to_string());
        
        let node1 = TaskNode::new(TaskStage::Analysis, "Test plan".to_string(), "code".to_string(), None);
        let id1 = node1.id.clone();
        journal.add_node(node1);
        
        assert_eq!(journal.root_nodes.len(), 1);
        assert!(journal.nodes.contains_key(&id1));
    }

    #[test]
    fn test_node_tree() {
        let mut journal = TaskJournal::new("test_task".to_string());
        
        let parent = TaskNode::new(TaskStage::Analysis, "Parent".to_string(), "code".to_string(), None);
        let parent_id = parent.id.clone();
        journal.add_node(parent);
        
        let child = TaskNode::new(TaskStage::Planning, "Child".to_string(), "code2".to_string(), Some(parent_id.clone()));
        let child_id = child.id.clone();
        journal.add_node(child);
        
        let parent = journal.get_node(&parent_id).unwrap();
        assert_eq!(parent.children.len(), 1);
        assert_eq!(parent.children[0], child_id);
    }

    #[test]
    fn test_stage_transition() {
        let mut journal = TaskJournal::new("test_task".to_string());
        journal.current_stage = Some("analysis".to_string());
        
        journal.record_stage_transition("analysis", "planning", "Analysis complete");
        
        assert_eq!(journal.stage_transitions.len(), 1);
        assert_eq!(journal.completed_stages[0], "analysis");
        assert_eq!(journal.current_stage, Some("planning".to_string()));
    }
}
