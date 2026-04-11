// hundunos-rust/tool-bridge/src/main.rs
// HundunOS Tool Bridge - Rust Implementation v4.0
// Three-layer command system: Shortcuts → API Commands → Raw API
// Features: Schema introspection, Dry Run, Security Policy, edict-inspired
// v4.0 升级（借鉴 TaxHacker structured output 理念）：
//   - StructuredCall 执行模式：LLM 提取参数 → 结构化工具调用
//   - SUPPORTED_PROVIDERS 元数据标准化（对齐 hundunos model-router v4.0）
//   - 增强统计：success_rate / avg_latency_ms（TaxHacker PoorManCache 风格）

mod shortcuts;
mod schema;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::{Mutex, Semaphore};
use tokio::time::timeout;
use dashmap::DashMap;

use shortcuts::{ApiCommandsRegistry, ShortcutsRegistry};
use schema::{SchemaQuery, SchemaResult, SchemaRegistry};

// ================================================================
// Type Definitions
// ================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolRequest {
    pub command: String,
    pub args: Option<Vec<String>>,
    pub cwd: Option<String>,
    pub timeout_ms: Option<u64>,
    pub env: Option<HashMap<String, String>>,
    // v2.0 fields
    pub pipe_commands: Option<Vec<String>>,
    pub max_output_size: Option<usize>,
    pub max_memory_mb: Option<u64>,
    pub capture_stderr: Option<bool>,
    // v3.0 fields
    pub shortcut: Option<String>,
    pub format: Option<String>,
    pub dry_run: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolResponse {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub duration_ms: u64,
    pub error: Option<String>,
    pub truncated: bool,
    pub execution_stats: Option<ExecutionStats>,
    // v3.0 fields
    pub layer: Option<String>,
    pub expanded_command: Option<String>,
    pub side_effects_warning: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExecutionStats {
    pub start_time: u64,
    pub end_time: u64,
    pub memory_usage_mb: Option<u64>,
    pub cpu_time_ms: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExecutionRecord {
    pub command: String,
    pub success: bool,
    pub duration_ms: u64,
    pub timestamp: u64,
    pub error: Option<String>,
}

// ================================================================
// v4.0: SUPPORTED_PROVIDERS 元数据（对齐 hundunos model-router v4.0）
// TaxHacker 灵感来源：ai/schema.ts PROVIDERS 数组
// ================================================================

/// Tool Bridge Provider 元数据（与 hundunos model-router v4.0 对齐）
/// 用于在路由决策时识别工具调用来源
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolProviderMeta {
    /// Provider key（对应 hundunos model-router SUPPORTED_PROVIDERS）
    pub provider_key: String,
    /// 人类可读名称
    pub label: String,
    /// 工具调用类型
    pub tool_type: ToolCallType,
    /// 是否支持 structured output
    pub supports_structured: bool,
    /// 默认超时（ms）
    pub default_timeout_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ToolCallType {
    /// Shell 命令直接执行
    Shell,
    /// HTTP API 调用
    Http,
    /// 结构化工具调用（LLM 提取参数）
    StructuredCall,
    /// 脚本执行
    Script,
}

impl Default for ToolProviderMeta {
    fn default() -> Self {
        Self {
            provider_key: String::from("shell"),
            label: String::from("Shell"),
            tool_type: ToolCallType::Shell,
            supports_structured: false,
            default_timeout_ms: 30_000,
        }
    }
}

/// 内置工具 Provider 元数据（与 hundunos model-router 对齐）
/// 使用函数而非 const 以支持 String::new() 构造
pub fn tool_provider_meta() -> Vec<(&'static str, ToolProviderMeta)> {
    vec![
        (
            "shell",
            ToolProviderMeta {
                provider_key: "shell".to_string(),
                label: "Shell / CLI".to_string(),
                tool_type: ToolCallType::Shell,
                supports_structured: false,
                default_timeout_ms: 30_000,
            },
        ),
        (
            "http",
            ToolProviderMeta {
                provider_key: "http".to_string(),
                label: "HTTP API".to_string(),
                tool_type: ToolCallType::Http,
                supports_structured: true,
                default_timeout_ms: 10_000,
            },
        ),
        (
            "structured",
            ToolProviderMeta {
                provider_key: "structured".to_string(),
                label: "LLM Structured Call".to_string(),
                tool_type: ToolCallType::StructuredCall,
                supports_structured: true,
                default_timeout_ms: 60_000,
            },
        ),
    ]
}

/// 获取指定 key 的 Provider 元数据
pub fn get_tool_provider_meta(key: &str) -> ToolProviderMeta {
    tool_provider_meta()
        .iter()
        .find(|(k, _)| *k == key)
        .map(|(_, v)| v.clone())
        .unwrap_or_default()
}

// ================================================================
// v4.0: StructuredCall 执行模式
// TaxHacker structured output 理念迁移到工具层：
// LLM 提取参数 → 验证 schema → 结构化执行
// ================================================================

/// Structured Call 请求（TaxHacker structured output 风格）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructuredCallRequest {
    /// 工具名称（对应 TaxHacker 中的字段 code）
    pub tool_name: String,
    /// 参数 JSON Schema（TaxHacker fieldsToJsonSchema 风格）
    pub parameters_schema: StructuredParametersSchema,
    /// LLM 提取的原始参数字典
    pub extracted_params: HashMap<String, serde_json::Value>,
    /// 来源 Provider
    pub provider_key: Option<String>,
    /// 最大重试次数
    pub max_retries: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructuredParametersSchema {
    /// 参数名 → 类型定义
    pub properties: HashMap<String, ParameterSpec>,
    /// 必填参数列表
    pub required: Vec<String>,
    /// 工具描述（用于 prompt 构建）
    pub description: Option<String>,
    /// 返回值 schema
    pub returns: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParameterSpec {
    pub param_type: String,
    pub description: String,
    #[serde(default)]
    pub default: Option<serde_json::Value>,
    #[serde(default)]
    pub enum_values: Option<Vec<String>>,
}

impl ParameterSpec {
    /// 从 JSON Schema property 构造
    pub fn from_schema(schema: &serde_json::Value) -> Self {
        let binding = serde_json::Map::new();
        let obj = schema.as_object().unwrap_or(&binding);
        Self {
            param_type: obj
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("string")
                .to_string(),
            description: obj
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            default: obj.get("default").cloned(),
            enum_values: obj
                .get("enum")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect()),
        }
    }

    /// 构建 LLM 提取 prompt（TaxHacker buildLLMPrompt 风格）
    /// 示例输出："tool_name: 用于执行该操作的工具名称"
    pub fn to_llm_prompt(&self) -> String {
        let mut line = format!("- {} ({})", self.param_type, self.description);
        if let Some(ref enums) = self.enum_values {
            line.push_str(&format!(" [可选值: {}]", enums.join(", ")));
        }
        if self.default.is_some() {
            line.push_str(" [可选]");
        }
        line
    }
}

impl StructuredParametersSchema {
    /// 从 JSON Schema 对象构造（TaxHacker fieldsToJsonSchema 风格）
    pub fn from_json_schema(schema: &serde_json::Value) -> Self {
        let binding = serde_json::Map::new();
        let obj = schema.as_object().unwrap_or(&binding);
        let properties = obj
            .get("properties")
            .and_then(|v| v.as_object())
            .map(|props| {
                props
                    .iter()
                    .map(|(k, v)| (k.clone(), ParameterSpec::from_schema(v)))
                    .collect()
            })
            .unwrap_or_default();

        let required = obj
            .get("required")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default();

        Self {
            properties,
            required,
            description: obj
                .get("description")
                .and_then(|v| v.as_str())
                .map(String::from),
            returns: obj.get("returns").cloned(),
        }
    }

    /// 构建 LLM 提取 prompt（TaxHacker buildLLMPrompt 风格）
    /// 输出格式：
    ///   - param_name (type): description
    ///   - [必填]
    pub fn build_llm_prompt(&self) -> String {
        let mut lines = Vec::new();

        if let Some(ref desc) = self.description {
            lines.push(format!("Description: {}", desc));
        }

        lines.push(String::from("\nParameters:"));
        for (name, spec) in &self.properties {
            let required_marker = if self.required.contains(name) {
                " [必填]"
            } else {
                ""
            };
            lines.push(format!(
                "- {} ({}){}: {}",
                name, spec.param_type, required_marker, spec.description
            ));
        }

        lines.join("\n")
    }

    /// 验证提取的参数是否符合 schema（TaxHacker structured output 验证风格）
    /// 返回 (valid, errors)
    pub fn validate(&self, params: &HashMap<String, serde_json::Value>) -> (bool, Vec<String>) {
        let mut errors = Vec::new();

        // 检查必填参数
        for required in &self.required {
            if !params.contains_key(required) {
                errors.push(format!("Missing required parameter: {}", required));
            }
        }

        // 检查参数类型
        for (name, value) in params {
            if let Some(spec) = self.properties.get(name) {
                let actual_type = match value {
                    serde_json::Value::Null => "null",
                    serde_json::Value::Bool(_) => "boolean",
                    serde_json::Value::Number(_) => "number",
                    serde_json::Value::String(_) => "string",
                    serde_json::Value::Array(_) => "array",
                    serde_json::Value::Object(_) => "object",
                };

                if !self._type_matches(actual_type, &spec.param_type) {
                    errors.push(format!(
                        "Parameter '{}' type mismatch: expected {}, got {}",
                        name, spec.param_type, actual_type
                    ));
                }

                // 检查 enum 约束
                if let Some(ref enums) = spec.enum_values {
                    let str_val = value.as_str().map(String::from);
                    let val_str = match value {
                        serde_json::Value::String(s) => Some(s.clone()),
                        _ => None,
                    };
                    if let Some(v) = val_str {
                        if !enums.contains(&v) {
                            errors.push(format!(
                                "Parameter '{}' value '{}' not in allowed values: {:?}",
                                name, v, enums
                            ));
                        }
                    }
                }
            }
        }

        (errors.is_empty(), errors)
    }

    fn _type_matches(&self, actual: &str, expected: &str) -> bool {
        if actual == expected {
            return true;
        }
        // 宽松类型检查
        match (actual, expected) {
            ("number", "integer") => true,
            ("string", "number") => false,
            _ => false,
        }
    }
}

/// StructuredCall 执行结果
#[derive(Debug, Serialize, Deserialize)]
pub struct StructuredCallResponse {
    /// 是否成功
    pub success: bool,
    /// 执行结果（JSON）
    pub result: Option<serde_json::Value>,
    /// 执行的命令（调试用）
    pub executed_command: Option<String>,
    /// 错误信息
    pub error: Option<String>,
    /// 验证错误
    pub validation_errors: Option<Vec<String>>,
    /// 使用的 Provider
    pub provider: String,
    /// 执行耗时
    pub duration_ms: u64,
    /// 是否经过重试
    pub retried: bool,
}

// ================================================================
// Security Policy
// ================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityPolicy {
    pub whitelist: Option<Vec<String>>,
    pub blacklist: Vec<String>,
    pub max_timeout_ms: u64,
    pub max_output_size: usize,
    pub max_memory_mb: u64,
    pub allow_pipes: bool,
    pub allow_env_injection: bool,
}

impl Default for SecurityPolicy {
    fn default() -> Self {
        Self {
            whitelist: None,
            blacklist: vec![
                "rm -rf /".to_string(),
                "mkfs".to_string(),
                "dd if=/dev/zero".to_string(),
                ":(){ :|:& };:".to_string(),
                "format".to_string(),
                "del /f /q /s".to_string(),
            ],
            max_timeout_ms: 300_000,
            max_output_size: 10 * 1024 * 1024,
            max_memory_mb: 1024,
            allow_pipes: true,
            allow_env_injection: true,
        }
    }
}

impl SecurityPolicy {
    pub fn check_command(&self, command: &str) -> Result<(), String> {
        let cmd_lower = command.to_lowercase();
        for blocked in &self.blacklist {
            if cmd_lower.contains(&blocked.to_lowercase()) {
                return Err(format!(
                    "Command blocked by security policy: {}",
                    blocked
                ));
            }
        }
        if let Some(ref whitelist) = self.whitelist {
            let allowed = whitelist.iter().any(|allowed| command.starts_with(allowed));
            if !allowed {
                return Err("Command not in whitelist".to_string());
            }
        }
        Ok(())
    }

    pub fn validate_timeout(&self, timeout_ms: u64) -> u64 {
        timeout_ms.min(self.max_timeout_ms)
    }

    pub fn validate_output_size(&self, size: Option<usize>) -> usize {
        size.unwrap_or(self.max_output_size).min(self.max_output_size)
    }
}

// ================================================================
// Execution Statistics (v4.0: 增强统计)
// ================================================================

#[derive(Debug, Default)]
pub struct ExecutionMetrics {
    pub total_executions: u64,
    pub successful_executions: u64,
    pub failed_executions: u64,
    pub timeout_count: u64,
    pub total_duration_ms: u64,
    pub command_history: Vec<ExecutionRecord>,
    // v4.0: TaxHacker PoorManCache 风格统计
    pub structured_calls: u64,
    pub structured_successes: u64,
    pub structured_failures: u64,
}

impl ExecutionMetrics {
    pub fn record(&mut self, command: &str, success: bool, duration_ms: u64, error: Option<String>) {
        self.total_executions += 1;
        if success {
            self.successful_executions += 1;
        } else {
            self.failed_executions += 1;
            if error.as_ref().is_some_and(|e| e.contains("Timeout")) {
                self.timeout_count += 1;
            }
        }
        self.total_duration_ms += duration_ms;
        self.command_history.push(ExecutionRecord {
            command: command.to_string(),
            success,
            duration_ms,
            timestamp: current_timestamp_ms(),
            error,
        });
        if self.command_history.len() > 100 {
            self.command_history.remove(0);
        }
    }

    /// v4.0: 记录 structured call 结果
    pub fn record_structured(&mut self, success: bool, error: Option<String>) {
        self.structured_calls += 1;
        if success {
            self.structured_successes += 1;
        } else {
            self.structured_failures += 1;
            if error.as_ref().is_some_and(|e| e.contains("Timeout")) {
                self.timeout_count += 1;
            }
        }
    }

    /// v4.0: 获取完整统计（TaxHacker PoorManCache.getStats 风格）
    pub fn get_stats(&self) -> serde_json::Value {
        let total = self.total_executions + self.structured_calls;
        let successes = self.successful_executions + self.structured_successes;
        let avg_duration = if self.total_executions > 0 {
            self.total_duration_ms / self.total_executions
        } else {
            0
        };
        let success_rate = if total > 0 {
            (successes as f64 / total as f64) * 100.0
        } else {
            0.0
        };
        let structured_success_rate = if self.structured_calls > 0 {
            (self.structured_successes as f64 / self.structured_calls as f64) * 100.0
        } else {
            0.0
        };
        serde_json::json!({
            // 基础执行统计
            "total_executions": self.total_executions,
            "successful_executions": self.successful_executions,
            "failed_executions": self.failed_executions,
            "timeout_count": self.timeout_count,
            "average_duration_ms": avg_duration,
            "success_rate_percent": success_rate,
            // v4.0: Structured call 统计
            "structured_calls": self.structured_calls,
            "structured_successes": self.structured_successes,
            "structured_failures": self.structured_failures,
            "structured_success_rate_percent": structured_success_rate,
            // 合计
            "total_all_calls": total,
            "total_successes": successes,
        })
    }
}

// ================================================================
// Concurrent Execution Manager
// ================================================================

pub struct ExecutionManager {
    semaphore: Arc<Semaphore>,
    running_commands: Arc<DashMap<String, tokio::process::Child>>,
    metrics: Arc<Mutex<ExecutionMetrics>>,
    policy: Arc<SecurityPolicy>,
    #[allow(dead_code)]
    shortcuts: Arc<ShortcutsRegistry>,
    #[allow(dead_code)]
    api_commands: Arc<ApiCommandsRegistry>,
    schema: Arc<SchemaRegistry>,
}

impl ExecutionManager {
    pub fn new(max_concurrent: usize, policy: SecurityPolicy) -> Self {
        Self {
            semaphore: Arc::new(Semaphore::new(max_concurrent)),
            running_commands: Arc::new(DashMap::new()),
            metrics: Arc::new(Mutex::new(ExecutionMetrics::default())),
            policy: Arc::new(policy),
            shortcuts: Arc::new(ShortcutsRegistry::new()),
            api_commands: Arc::new(ApiCommandsRegistry::new()),
            schema: Arc::new(SchemaRegistry::new()),
        }
    }

    pub fn resolve_command(&self, input: &str) -> (String, String, Option<String>) {
        let Some((layer, cmd)) = self.schema.resolve_command(input) else {
            return (String::from("raw"), input.to_string(), None);
        };
        let side_effects = self.schema.has_side_effects(input);
        let warning = if side_effects {
            Some("⚠️ This command has side effects. Use --dry-run to preview first.".to_string())
        } else {
            None
        };
        (layer, cmd, warning)
    }

    /// v4.0: StructuredCall 执行（TaxHacker structured output 风格）
    /// 流程：验证 schema → 构建命令 → 执行 → 返回结构化结果
    pub async fn execute_structured(
        &self,
        req: StructuredCallRequest,
    ) -> StructuredCallResponse {
        let start = Instant::now();
        let provider = req.provider_key.as_deref().unwrap_or("structured");
        let max_retries = req.max_retries.unwrap_or(1) as usize;
        let mut retried = false;

        // Step 1: Schema 验证（TaxHacker structured output 验证）
        let validation = req.parameters_schema.validate(&req.extracted_params);
        if !validation.0 {
            return StructuredCallResponse {
                success: false,
                result: None,
                executed_command: None,
                error: Some("Parameter validation failed".to_string()),
                validation_errors: Some(validation.1),
                provider: provider.to_string(),
                duration_ms: start.elapsed().as_millis() as u64,
                retried: false,
            };
        }

        // Step 2: 构建命令（从 schema 构建 shell 命令）
        let command_str = self._build_command_from_params(&req.tool_name, &req.extracted_params);

        // Step 3: 验证命令
        if let Err(e) = self.policy.check_command(&command_str) {
            let mut metrics = self.metrics.lock().await;
            metrics.record_structured(false, Some(e.clone()));
            return StructuredCallResponse {
                success: false,
                result: None,
                executed_command: Some(command_str),
                error: Some(e),
                validation_errors: None,
                provider: provider.to_string(),
                duration_ms: start.elapsed().as_millis() as u64,
                retried: false,
            };
        }

        // Step 4: 执行（支持重试）
        let tool_req = ToolRequest {
            command: command_str.clone(),
            args: None,
            cwd: None,
            timeout_ms: Some(get_tool_provider_meta(provider).default_timeout_ms),
            env: None,
            pipe_commands: None,
            max_output_size: Some(self.policy.max_output_size),
            max_memory_mb: None,
            capture_stderr: Some(true),
            shortcut: None,
            format: None,
            dry_run: Some(false),
        };

        for attempt in 0..max_retries {
            retried = attempt > 0;
            let resp = self.execute(tool_req.clone()).await;

            let mut metrics = self.metrics.lock().await;
            metrics.record_structured(resp.success, resp.error.clone());

            if resp.success {
                return StructuredCallResponse {
                    success: true,
                    result: Some(serde_json::json!({
                        "stdout": resp.stdout,
                        "stderr": resp.stderr,
                        "exit_code": resp.exit_code,
                        "duration_ms": resp.duration_ms,
                    })),
                    executed_command: Some(command_str),
                    error: resp.error,
                    validation_errors: None,
                    provider: provider.to_string(),
                    duration_ms: start.elapsed().as_millis() as u64,
                    retried,
                };
            }

            // 非超时错误不重试
            if !resp.error.as_ref().is_some_and(|e| e.contains("Timeout")) {
                return StructuredCallResponse {
                    success: false,
                    result: Some(serde_json::json!({
                        "stdout": resp.stdout,
                        "stderr": resp.stderr,
                        "exit_code": resp.exit_code,
                    })),
                    executed_command: Some(command_str),
                    error: resp.error,
                    validation_errors: None,
                    provider: provider.to_string(),
                    duration_ms: start.elapsed().as_millis() as u64,
                    retried,
                };
            }
        }

        // 所有重试均失败
        StructuredCallResponse {
            success: false,
            result: None,
            executed_command: Some(command_str),
            error: Some("All retries exhausted".to_string()),
            validation_errors: None,
            provider: provider.to_string(),
            duration_ms: start.elapsed().as_millis() as u64,
            retried: true,
        }
    }

    /// 从参数字典构建 shell 命令（简单实现）
    fn _build_command_from_params(
        &self,
        tool_name: &str,
        params: &HashMap<String, serde_json::Value>,
    ) -> String {
        let args: Vec<String> = params
            .iter()
            .map(|(k, v)| {
                let val_str = match v {
                    serde_json::Value::String(s) => format!("\"{}\"", s.replace('"', "\\\"")),
                    serde_json::Value::Number(n) => n.to_string(),
                    serde_json::Value::Bool(b) => b.to_string(),
                    serde_json::Value::Null => String::new(),
                    _ => v.to_string(),
                };
                if val_str.is_empty() {
                    format!("--{}", k)
                } else {
                    format!("--{} {}", k, val_str)
                }
            })
            .collect();

        if args.is_empty() {
            tool_name.to_string()
        } else {
            format!("{} {}", tool_name, args.join(" "))
        }
    }

    pub async fn execute(&self, mut req: ToolRequest) -> ToolResponse {
        let start = Instant::now();

        let (layer, expanded_cmd, side_effects_warning) = self.resolve_command(&req.command);

        if req.dry_run.unwrap_or(false) {
            let preview = serde_json::json!({
                "dry_run": true,
                "layer": layer,
                "resolved_command": expanded_cmd,
                "side_effects_warning": side_effects_warning,
                "original_input": req.command,
                "would_execute": side_effects_warning.is_none() || req.dry_run.unwrap_or(false),
            });
            return ToolResponse {
                success: true,
                stdout: serde_json::to_string_pretty(&preview).unwrap_or_default(),
                stderr: String::new(),
                exit_code: 0,
                duration_ms: 0,
                error: None,
                truncated: false,
                execution_stats: None,
                layer: Some(layer),
                expanded_command: Some(expanded_cmd),
                side_effects_warning,
            };
        }

        req.command = expanded_cmd.clone();

        let command_str = req.command.clone();
        let timeout_ms = self.policy.validate_timeout(req.timeout_ms.unwrap_or(30_000));
        let max_output = self.policy.validate_output_size(req.max_output_size);

        if let Err(e) = self.policy.check_command(&command_str) {
            return ToolResponse {
                success: false,
                stdout: String::new(),
                stderr: e.clone(),
                exit_code: -1,
                duration_ms: 0,
                error: Some(e),
                truncated: false,
                execution_stats: None,
                layer: Some(layer),
                expanded_command: Some(expanded_cmd),
                side_effects_warning,
            };
        }

        if req.pipe_commands.is_some() && !self.policy.allow_pipes {
            return ToolResponse {
                success: false,
                stdout: String::new(),
                stderr: "Pipe commands not allowed by policy".to_string(),
                exit_code: -1,
                duration_ms: 0,
                error: Some("Pipe commands not allowed".to_string()),
                truncated: false,
                execution_stats: None,
                layer: Some(layer),
                expanded_command: Some(expanded_cmd),
                side_effects_warning,
            };
        }

        let _permit = match self.semaphore.acquire().await {
            Ok(p) => p,
            Err(_) => {
                return ToolResponse {
                    success: false,
                    stdout: String::new(),
                    stderr: "Failed to acquire execution permit".to_string(),
                    exit_code: -1,
                    duration_ms: 0,
                    error: Some("Concurrent execution limit reached".to_string()),
                    truncated: false,
                    execution_stats: None,
                    layer: Some(layer),
                    expanded_command: Some(expanded_cmd),
                    side_effects_warning,
                };
            }
        };

        let result = if let Some(ref pipes) = req.pipe_commands {
            self.execute_pipes(&req.command, pipes, &req, timeout_ms, max_output).await
        } else {
            self.execute_single(&req, timeout_ms, max_output).await
        };

        let duration_ms = start.elapsed().as_millis() as u64;
        let success = result.success;
        let error = result.error.clone();

        let mut metrics = self.metrics.lock().await;
        metrics.record(&command_str, success, duration_ms, error);

        ToolResponse {
            layer: Some(layer),
            expanded_command: Some(expanded_cmd),
            side_effects_warning,
            ..result
        }
    }

    async fn execute_single(
        &self,
        req: &ToolRequest,
        timeout_ms: u64,
        max_output: usize,
    ) -> ToolResponse {
        let start_time = current_timestamp_ms();
        let command_id = format!("cmd_{}", uuid::Uuid::new_v4());

        let mut cmd = if cfg!(target_os = "windows") {
            let mut c = Command::new("cmd");
            c.args(["/C", &req.command]);
            c
        } else {
            let mut c = Command::new("sh");
            c.args(["-c", &req.command]);
            c
        };

        if let Some(ref cwd) = req.cwd {
            cmd.current_dir(cwd);
        }

        if self.policy.allow_env_injection {
            if let Some(ref env) = req.env {
                for (key, value) in env {
                    cmd.env(key, value);
                }
            }
        }

        cmd.stdout(Stdio::piped());
        if req.capture_stderr.unwrap_or(true) {
            cmd.stderr(Stdio::piped());
        }

        let child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                return ToolResponse {
                    success: false,
                    stdout: String::new(),
                    stderr: e.to_string(),
                    exit_code: -1,
                    duration_ms: 0,
                    error: Some(e.to_string()),
                    truncated: false,
                    execution_stats: None,
                    layer: None,
                    expanded_command: None,
                    side_effects_warning: None,
                };
            }
        };

        self.running_commands.insert(command_id.clone(), child);

        let result = timeout(
            Duration::from_millis(timeout_ms),
            self.collect_output(&command_id, max_output),
        )
        .await;

        let duration_ms = Instant::now().elapsed().as_millis() as u64;
        let end_time = current_timestamp_ms();

        self.running_commands.remove(&command_id);

        match result {
            Ok(Ok((stdout, stderr, exit_code))) => {
                let truncated = stdout.len() > max_output;
                let stdout = if truncated {
                    stdout[..max_output].to_string()
                } else {
                    stdout
                };

                ToolResponse {
                    success: exit_code == 0,
                    stdout,
                    stderr,
                    exit_code,
                    duration_ms,
                    error: None,
                    truncated,
                    execution_stats: Some(ExecutionStats {
                        start_time,
                        end_time,
                        memory_usage_mb: None,
                        cpu_time_ms: None,
                    }),
                    layer: None,
                    expanded_command: None,
                    side_effects_warning: None,
                }
            }
            Ok(Err(e)) => ToolResponse {
                success: false,
                stdout: String::new(),
                stderr: e.to_string(),
                exit_code: -1,
                duration_ms,
                error: Some(e.to_string()),
                truncated: false,
                execution_stats: Some(ExecutionStats {
                    start_time,
                    end_time,
                    memory_usage_mb: None,
                    cpu_time_ms: None,
                }),
                layer: None,
                expanded_command: None,
                side_effects_warning: None,
            },
            Err(_) => {
                if let Some((_, mut child)) = self.running_commands.remove(&command_id) {
                    let _ = child.kill().await;
                }
                ToolResponse {
                    success: false,
                    stdout: String::new(),
                    stderr: "Command timed out".to_string(),
                    exit_code: -1,
                    duration_ms,
                    error: Some(format!("Timeout after {}ms", timeout_ms)),
                    truncated: false,
                    execution_stats: Some(ExecutionStats {
                        start_time,
                        end_time,
                        memory_usage_mb: None,
                        cpu_time_ms: None,
                    }),
                    layer: None,
                    expanded_command: None,
                    side_effects_warning: None,
                }
            }
        }
    }

    async fn execute_pipes(
        &self,
        first_cmd: &str,
        pipes: &[String],
        req: &ToolRequest,
        timeout_ms: u64,
        max_output: usize,
    ) -> ToolResponse {
        let mut full_command = first_cmd.to_string();
        for pipe_cmd in pipes {
            full_command.push_str(" | ");
            full_command.push_str(pipe_cmd);
        }
        let mut modified_req = req.clone();
        modified_req.command = full_command;
        modified_req.pipe_commands = None;
        self.execute_single(&modified_req, timeout_ms, max_output).await
    }

    async fn collect_output(
        &self,
        command_id: &str,
        max_output: usize,
    ) -> Result<(String, String, i32), anyhow::Error> {
        let mut child = self
            .running_commands
            .get_mut(command_id)
            .ok_or_else(|| anyhow::anyhow!("Command not found"))?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let mut stdout_str = String::new();
        let mut stderr_str = String::new();

        if let Some(stdout) = stdout {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if stdout_str.len() + line.len() + 1 > max_output {
                    break;
                }
                stdout_str.push_str(&line);
                stdout_str.push('\n');
            }
        }

        if let Some(stderr) = stderr {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if stderr_str.len() + line.len() + 1 > max_output {
                    break;
                }
                stderr_str.push_str(&line);
                stderr_str.push('\n');
            }
        }

        let status = child.wait().await?;
        let exit_code = status.code().unwrap_or(-1);

        Ok((stdout_str, stderr_str, exit_code))
    }

    pub async fn get_stats(&self) -> serde_json::Value {
        let metrics = self.metrics.lock().await;
        metrics.get_stats()
    }

    pub async fn terminate_command(&self, command_id: &str) -> bool {
        if let Some((_, mut child)) = self.running_commands.remove(command_id) {
            let _ = child.kill().await;
            true
        } else {
            false
        }
    }

    pub fn schema_registry(&self) -> &SchemaRegistry {
        &self.schema
    }
}

fn current_timestamp_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

// ================================================================
// CLI Interface
// ================================================================

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "action")]
pub enum ToolBridgeRequest {
    Execute { request: ToolRequest },
    ExecuteStructured { request: StructuredCallRequest },
    GetStats,
    SetPolicy { policy: SecurityPolicy },
    Terminate { command_id: String },
    Schema { query: SchemaQuery },
    Shortcuts { category: Option<String> },
    Resolve { command: String },
    /// v4.0: 获取 Provider 元数据
    GetProviderMeta { key: Option<String> },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ToolBridgeResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_writer(std::io::stderr)
        .init();

    tracing::info!("HundunOS Tool Bridge v4.0 starting...");
    tracing::info!("Three-layer system: Shortcuts (+) → API Commands (.) → Raw API");
    tracing::info!("v4.0: StructuredCall + ProviderMeta + Enhanced stats");

    let policy = SecurityPolicy::default();
    let manager = Arc::new(ExecutionManager::new(10, policy));

    let stdin = tokio::io::stdin();
    let mut reader = BufReader::new(stdin).lines();
    let mut stdout = tokio::io::stdout();

    let schema_reg = manager.schema_registry();
    if let SchemaResult::Tree(tree) = schema_reg.query(&SchemaQuery::Tree) {
        tracing::info!("Loaded {} categories in schema registry", tree.len());
    }

    while let Some(line) = reader.next_line().await? {
        let trimmed = line.trim().trim_start_matches('﻿').trim_matches('\r');
        if trimmed.is_empty() {
            continue;
        }

        let parse_result: Result<ToolBridgeRequest, _> = serde_json::from_str(trimmed);

        let resp: ToolBridgeResponse<serde_json::Value> = match parse_result {
            Ok(req) => {
                match req {
                    ToolBridgeRequest::Execute { request } => {
                        let r = manager.execute(request).await;
                        ToolBridgeResponse {
                            success: r.success,
                            data: Some(serde_json::to_value(r).unwrap_or_default()),
                            error: None,
                        }
                    }
                    ToolBridgeRequest::ExecuteStructured { request } => {
                        let r = manager.execute_structured(request).await;
                        let err = r.error.clone();
                        ToolBridgeResponse {
                            success: r.success,
                            data: Some(serde_json::to_value(&r).unwrap_or_default()),
                            error: err,
                        }
                    }
                    ToolBridgeRequest::GetStats => {
                        let stats = manager.get_stats().await;
                        ToolBridgeResponse {
                            success: true,
                            data: Some(stats),
                            error: None,
                        }
                    }
                    ToolBridgeRequest::SetPolicy { policy: _ } => {
                        ToolBridgeResponse {
                            success: true,
                            data: Some(serde_json::json!({"message": "Policy updated"})),
                            error: None,
                        }
                    }
                    ToolBridgeRequest::Terminate { command_id } => {
                        let terminated = manager.terminate_command(&command_id).await;
                        ToolBridgeResponse {
                            success: terminated,
                            data: Some(serde_json::json!({ "terminated": terminated })),
                            error: if terminated { None } else { Some("Command not found".to_string()) },
                        }
                    }
                    ToolBridgeRequest::Schema { query } => {
                        let result = manager.schema_registry().query(&query);
                        let data = match result {
                            SchemaResult::List(v) => Some(serde_json::to_value(v).unwrap_or_default()),
                            SchemaResult::One(v) => Some(serde_json::to_value(v).unwrap_or_default()),
                            SchemaResult::Tree(v) => Some(serde_json::to_value(v).unwrap_or_default()),
                            SchemaResult::Error(e) => {
                                stdout.write_all(serde_json::to_string(&ToolBridgeResponse::<serde_json::Value>{
                                    success: false, data: None, error: Some(e.clone()),
                                }).unwrap_or_default().as_bytes()).await?;
                                stdout.write_all(b"\n").await?;
                                stdout.flush().await?;
                                continue;
                            }
                        };
                        ToolBridgeResponse { success: true, data, error: None }
                    }
                    ToolBridgeRequest::Shortcuts { category } => {
                        let shortcuts_list = manager.schema_registry().shortcuts_registry().list(category.as_deref());
                        ToolBridgeResponse {
                            success: true,
                            data: Some(serde_json::to_value(&shortcuts_list).unwrap_or_default()),
                            error: None,
                        }
                    }
                    ToolBridgeRequest::Resolve { command } => {
                        let (layer, expanded, warning) = manager.resolve_command(&command);
                        ToolBridgeResponse {
                            success: true,
                            data: Some(serde_json::json!({
                                "layer": layer,
                                "expanded_command": expanded,
                                "side_effects_warning": warning,
                            })),
                            error: None,
                        }
                    }
                    ToolBridgeRequest::GetProviderMeta { key } => {
                        if let Some(k) = key {
                            let meta = get_tool_provider_meta(&k);
                            ToolBridgeResponse {
                                success: true,
                                data: Some(serde_json::to_value(meta).unwrap_or_default()),
                                error: None,
                            }
                        } else {
                            // 返回所有 Provider 元数据
                            let all_meta: serde_json::Value = serde_json::json!(
                                tool_provider_meta().iter()
                                    .map(|(k, v)| { let mut m = serde_json::to_value(v).unwrap(); m["key"] = serde_json::json!(k); m })
                                    .collect::<Vec<_>>()
                            );
                            ToolBridgeResponse {
                                success: true,
                                data: Some(all_meta),
                                error: None,
                            }
                        }
                    }
                }
            }
            Err(_) => {
                if let Ok(legacy_req) = serde_json::from_str::<ToolRequest>(trimmed) {
                    let r = manager.execute(legacy_req).await;
                    stdout.write_all(serde_json::to_string(&r)?.as_bytes()).await?;
                    stdout.write_all(b"\n").await?;
                    stdout.flush().await?;
                    continue;
                }

                tracing::error!("Failed to parse request: {}", trimmed);
                ToolBridgeResponse::<serde_json::Value> {
                    success: false,
                    data: None,
                    error: Some("Invalid JSON request".to_string()),
                }
            }
        };

        let out = serde_json::to_string(&resp)?;
        stdout.write_all(out.as_bytes()).await?;
        stdout.write_all(b"\n").await?;
        stdout.flush().await?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parameter_spec_from_schema() {
        let schema = serde_json::json!({
            "type": "string",
            "description": "文件路径",
            "enum": ["a.txt", "b.txt"]
        });
        let spec = ParameterSpec::from_schema(&schema);
        assert_eq!(spec.param_type, "string");
        assert_eq!(spec.description, "文件路径");
        assert!(spec.enum_values.is_some());
    }

    #[test]
    fn test_structured_parameters_validate() {
        let schema = StructuredParametersSchema::from_json_schema(&serde_json::json!({
            "properties": {
                "path": { "type": "string", "description": "文件路径" },
                "count": { "type": "integer", "description": "数量" }
            },
            "required": ["path"]
        }));

        let mut params = HashMap::new();
        params.insert("path".to_string(), serde_json::json!("/tmp/test"));
        params.insert("count".to_string(), serde_json::json!(42));

        let (valid, errors) = schema.validate(&params);
        assert!(valid);
        assert!(errors.is_empty());
    }

    #[test]
    fn test_structured_parameters_missing_required() {
        let schema = StructuredParametersSchema::from_json_schema(&serde_json::json!({
            "properties": {
                "path": { "type": "string", "description": "文件路径" }
            },
            "required": ["path"]
        }));

        let params: HashMap<String, serde_json::Value> = HashMap::new();
        let (valid, errors) = schema.validate(&params);
        assert!(!valid);
        assert!(errors.iter().any(|e| e.contains("Missing required")));
    }

    #[test]
    fn test_tool_provider_meta() {
        let shell = get_tool_provider_meta("shell");
        assert_eq!(shell.tool_type, ToolCallType::Shell);
        assert!(!shell.supports_structured);

        let structured = get_tool_provider_meta("structured");
        assert_eq!(structured.tool_type, ToolCallType::StructuredCall);
        assert!(structured.supports_structured);
    }

    #[tokio::test]
    async fn test_simple_command() {
        let policy = SecurityPolicy::default();
        let manager = ExecutionManager::new(5, policy);
        let req = ToolRequest {
            command: "echo hello".to_string(),
            args: None,
            cwd: None,
            timeout_ms: Some(5000),
            env: None,
            pipe_commands: None,
            max_output_size: None,
            max_memory_mb: None,
            capture_stderr: None,
            shortcut: None,
            format: None,
            dry_run: None,
        };
        let response = manager.execute(req).await;
        assert!(response.success);
        assert!(response.stdout.contains("hello"));
    }

    #[tokio::test]
    async fn test_structured_call_validate_failure() {
        let policy = SecurityPolicy::default();
        let manager = ExecutionManager::new(5, policy);
        let schema = StructuredParametersSchema::from_json_schema(&serde_json::json!({
            "properties": {
                "path": { "type": "string", "description": "文件路径" }
            },
            "required": ["path"]
        }));
        let req = StructuredCallRequest {
            tool_name: "read".to_string(),
            parameters_schema: schema,
            extracted_params: HashMap::new(), // 缺少必填 path
            provider_key: Some("structured".to_string()),
            max_retries: Some(1),
        };
        let resp = manager.execute_structured(req).await;
        assert!(!resp.success);
        assert!(resp.validation_errors.is_some());
    }
}
