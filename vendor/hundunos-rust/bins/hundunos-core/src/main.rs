// hundunos-rust/bins/hundunos-core/src/main.rs
// HundunOS Core v4.0 - Unified Rust Daemon
// TCP:38082 (Windows) / Unix Socket (Linux/macOS) + JSON-RPC 2.0
//
// Architecture:
//   JS Adapter ←JSON-RPC→ hundunos-core ←stdin/stdout→ module child processes
//                                      tool | memory | router | policy | scientist
//
// Build: cargo build --release --bin hundunos-core
//        (from vendor/hundunos-rust/)

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use tokio::io::{AsyncReadExt, AsyncWriteExt, BufReader};
use tracing::{info, warn};

// ================================================================
// Constants
// ================================================================
const DEFAULT_TCP_PORT: &str = "38082";
const DEFAULT_SOCKET_PATH: &str = "/tmp/hundunos.sock";

// ================================================================
// JSON-RPC 2.0 Types
// ================================================================
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    #[serde(default)] pub id: Option<serde_json::Value>,
    pub module: String,
    pub method: String,
    #[serde(default)] pub params: JsonValue,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")] pub id: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")] pub result: Option<JsonValue>,
    #[serde(skip_serializing_if = "Option::is_none")] pub error: Option<JsonRpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError { pub code: i32, pub message: String, #[serde(skip_serializing_if = "Option::is_none")] pub data: Option<JsonValue> }

// Error codes (对齐 rust-api-contract.md)
const E_PARSE: i32 = -32700;
const E_INVALID: i32 = -32600;
const E_NOT_FOUND: i32 = -32601;
const E_TIMEOUT: i32 = -32001;
const E_PANIC: i32 = -32002;
const E_NO_MODULE: i32 = -32003;
const E_TRANSPORT: i32 = -32004;

impl JsonRpcRequest {
    fn ok(&self, result: JsonValue) -> JsonRpcResponse { JsonRpcResponse { jsonrpc: "2.0".to_string(), id: self.id.clone(), result: Some(result), error: None } }
    fn err(&self, code: i32, message: &str) -> JsonRpcResponse { JsonRpcResponse { jsonrpc: "2.0".to_string(), id: self.id.clone(), result: None, error: Some(JsonRpcError { code, message: message.to_string(), data: None }) } }
}

// ================================================================
// Core Manager
// ================================================================
struct CoreManager { binary_root: String }

impl CoreManager {
    fn new(binary_root: String) -> Self { Self { binary_root } }
    fn binary(&self, name: &str) -> String { format!("{}/hundunos-{}.exe", self.binary_root, name) }

    async fn send(&self, module_name: &str, native: &str) -> Result<String> {
        let binary = self.binary(module_name);
        let mut child = tokio::process::Command::new(&binary)
            .stdin(tokio::process::Stdio::piped())
            .stdout(tokio::process::Stdio::piped())
            .stderr(tokio::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn().map_err(|e| anyhow!("spawn '{}': {}", module_name, e))?;

        let mut stdin = child.stdin.take().ok_or_else(|| anyhow!("no stdin '{}'", module_name))?;
        let stdout = child.stdout.take().ok_or_else(|| anyhow!("no stdout '{}'", module_name))?;

        stdin.write_all(native.as_bytes()).await?;
        stdin.write_all(b"\n").await?;
        stdin.flush().await?;
        drop(stdin);

        let mut reader = BufReader::new(stdout);
        let mut response = String::new();
        reader.read_line(&mut response).await?;

        // Drain stderr to avoid broken pipe
        if let Some(mut stderr) = child.stderr.take() {
            let mut b = vec![0u8; 4096];
            let _ = stderr.read(&mut b).await;
        }
        Ok(response.trim().to_string())
    }
}

// ================================================================
// Request Translation: JSON-RPC 2.0 → Native Module Format
// 解决融合报告 2.1 节的协议碎片化问题
// ================================================================

// Tool Bridge: { "action": "Execute", "request": {...} }
fn to_tool(method: &str, params: &JsonValue) -> Option<String> {
    match method {
        "execute"             => serde_json::to_string(&serde_json::json!({ "action": "Execute", "request": params })).ok(),
        "execute_structured" => serde_json::to_string(&serde_json::json!({ "action": "ExecuteStructured", "request": params })).ok(),
        "get_stats"          => Some(r#"{"action":"GetStats"}"#.into()),
        "set_policy"         => serde_json::to_string(&serde_json::json!({ "action": "SetPolicy", "policy": params })).ok(),
        "terminate"          => serde_json::to_string(&serde_json::json!({ "action": "Terminate", "command_id": params.get("command_id").cloned().unwrap_or(serde_json::Value::Null) })).ok(),
        "schema"             => serde_json::to_string(&serde_json::json!({ "action": "Schema", "query": params })).ok(),
        "shortcuts"          => serde_json::to_string(&serde_json::json!({ "action": "Shortcuts", "category": params.get("category").cloned() })).ok(),
        "resolve"            => serde_json::to_string(&serde_json::json!({ "action": "Resolve", "command": params.get("command") })).ok(),
        "get_provider_meta"  => serde_json::to_string(&serde_json::json!({ "action": "GetProviderMeta", "key": params.get("key").cloned() })).ok(),
        _ => None,
    }
}

// Memory Graph: { "Record": {...} } — flat tagged enum
fn to_memory(method: &str, params: &JsonValue) -> Option<String> {
    let tag = match method {
        "record" | "recall" | "search" | "fts_search" | "semantic_search"
        | "set_context" | "get_context" | "get_context_chain" | "get_memory_injection"
        | "distill" | "create_snapshot" | "restore_snapshot" | "cleanup_expired"
        | "get_stats" | "compress_semantic" | "get_semantic_compressor_stats" => method.replace('_', ""),
        _ => return None,
    };
    let mut m = serde_json::Map::new();
    m.insert(tag, params.clone());
    serde_json::to_string(&serde_json::Value::Object(m)).ok()
}

// Model Router: { "Route": {...} } — flat tagged enum
fn to_router(method: &str, params: &JsonValue) -> Option<String> {
    let tag = match method {
        "route" | "record_success" | "record_failure" | "get_stats"
        | "get_providers" | "add_provider" | "update_provider" => method.replace('_', ""),
        _ => return None,
    };
    let mut m = serde_json::Map::new();
    m.insert(tag, params.clone());
    serde_json::to_string(&serde_json::Value::Object(m)).ok()
}

// Policy Engine: { "CheckFileRead": {...} } — flat tagged enum
fn to_policy(method: &str, params: &JsonValue) -> Option<String> {
    let tag = match method {
        "check_file_read" | "check_file_write" | "check_file_delete"
        | "check_network" | "check_tool" | "get_policy" | "set_policy" | "check_prompt" => method.replace('_', ""),
        _ => return None,
    };
    serde_json::to_string(&serde_json::json!({ tag: params })).ok()
}

// Task Scientist: { "Create": {...} } — flat tagged enum
fn to_scientist(method: &str, params: &JsonValue) -> Option<String> {
    let tag = match method { "create" | "run_bfts" | "journal" | "list_tasks" | "get_task" => method, _ => return None };
    let mut m = serde_json::Map::new(); m.insert(tag.to_string(), params.clone());
    serde_json::to_string(&serde_json::Value::Object(m)).ok()
}

// ================================================================
// JSON-RPC Dispatch
// ================================================================
async fn dispatch(req: JsonRpcRequest, mgr: &CoreManager) -> JsonRpcResponse {
    let (module, method, params) = (req.module.as_str(), req.method.as_str(), &req.params);
    let req_id = req.id.clone();

    macro_rules! call_module {
        ($to_fn:expr, $name:expr) => {
            if let Some(native) = $to_fn(method, params) {
                match mgr.send($name, &native).await {
                    Ok(raw) => {
                        let resp: JsonValue = serde_json::from_str(&raw).unwrap_or(serde_json::json!({ "raw": raw }));
                        req.ok(serde_json::json!({ "_raw": resp }))
                    }
                    Err(e) => req.err(E_TRANSPORT, &e.to_string()),
                }
            } else {
                req.err(E_NOT_FOUND, &format!("{}.{} not found", module, method))
            }
        };
    }

    match module {
        "tool"      => call_module!(to_tool, "tool"),
        "memory"    => call_module!(to_memory, "memory"),
        "router"    => call_module!(to_router, "router"),
        "policy"    => call_module!(to_policy, "policy"),
        "scientist" => call_module!(to_scientist, "scientist"),
        "system" => match method {
            "ping" => req.ok(serde_json::json!({
                "pong": true, "version": "4.0.0",
                "transport": if cfg!(windows) { "tcp:38082" } else { "unix-socket" },
                "uptime_seconds": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs()
            })),
            "modules" => req.ok(serde_json::json!({
                "modules": ["tool","memory","router","policy","scientist"],
                "binary_root": mgr.binary_root, "mode": "child-process-proxy"
            })),
            "health" => req.ok(serde_json::json!({
                "status": "ready", "core": "hundunos-core",
                "modules": { "tool": "proxied", "memory": "proxied", "router": "proxied", "policy": "proxied", "scientist": "proxied" }
            })),
            _ => req.err(E_NOT_FOUND, &format!("system.{} not found", method)),
        },
        _ => req.err(E_NOT_FOUND, &format!("Unknown module: {}", module)),
    }
}

// ================================================================
// TCP Server (Windows Named Pipe 替代方案：TCP 更稳定)
// ================================================================
async fn handle_socket(mut socket: tokio::net::TcpStream, mgr: CoreManager) {
    let mut buf = vec![0u8; 65536];
    loop {
        match socket.read(&mut buf).await {
            Ok(0) => break,
            Ok(n) => {
                let data = std::str::from_utf8(&buf[..n]).unwrap_or("").trim();
                if data.is_empty() { continue; }

                let req: JsonRpcRequest = match serde_json::from_str(data) {
                    Ok(r) => r,
                    Err(e) => {
                        let resp = JsonRpcResponse { jsonrpc: "2.0".into(), id: None, result: None,
                            error: Some(JsonRpcError { code: E_PARSE, message: format!("Invalid JSON: {}", e), data: None }) };
                        let _ = socket.write_all(serde_json::to_string(&resp).unwrap().as_bytes()).await;
                        let _ = socket.write_all(b"\n").await;
                        continue;
                    }
                };

                let resp = dispatch(req, &mgr).await;
                let out = serde_json::to_string(&resp).unwrap_or_default();
                if socket.write_all(out.as_bytes()).await.is_err() { break; }
                if socket.write_all(b"\n").await.is_err() { break; }
                let _ = socket.flush().await;
            }
            Err(e) => { warn!("Socket error: {}", e); break; }
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt().with_max_level(tracing::Level::INFO)
        .with_writer(std::io::stderr).init();

    let socket_path  = std::env::var("HUNDUNOS_SOCKET").unwrap_or_else(|_| DEFAULT_SOCKET_PATH.into());
    let binary_root  = std::env::var("HUNDUNOS_BINARY_ROOT").unwrap_or_else(|_| {
        std::env::current_exe().ok().and_then(|p| p.parent().map(|pp| pp.to_string_lossy().into_owned())).unwrap_or_else(|| ".".into())
    });
    let tcp_port     = std::env::var("HUNDUNOS_TCP_PORT").unwrap_or_else(|_| DEFAULT_TCP_PORT.into());
    let transport    = if cfg!(windows) { format!("TCP:{}", tcp_port) } else { format!("Unix:{}", socket_path) };

    println!("╔══════════════════════════════════════════════╗");
    println!("║        HundunOS Core v4.0                   ║");
    println!("║   Unified Rust Daemon — JSON-RPC 2.0         ║");
    println!("╠══════════════════════════════════════════════╣");
    println!("║  Transport:  {}             ║", transport);
    println!("║  Binary root: {}  ║", &binary_root[..binary_root.len().min(30)]);
    println!("║  Protocol:   JSON-RPC 2.0                    ║");
    println!("║  Modules:     tool memory router policy      ║");
    println!("║               scientist (5 total)            ║");
    println!("╚══════════════════════════════════════════════╝");

    info!("HundunOS Core v4.0 starting...");
    info!("Binary root: {}", binary_root);
    info!("Transport: {}", transport);

    let manager = CoreManager::new(binary_root);
    let addr = format!("127.0.0.1:{}", tcp_port);

    // Try Unix socket first on non-Windows
    #[cfg(not(windows))]
    {
        use tokio::net::UnixListener;
        let _ = tokio::fs::remove_file(&socket_path).await;
        match UnixListener::bind(&socket_path).await {
            Ok(listener) => {
                info!("Unix Socket listening: {}", socket_path);
                info!("JSON-RPC 2.0 endpoint ready — connect via TCP:127.0.0.1:{}", tcp_port);
                loop {
                    if let Ok((socket, _)) = listener.accept().await {
                        let mgr = manager.clone();
                        tokio::spawn(handle_socket(socket, mgr));
                    }
                }
            }
            Err(e) => {
                warn!("Unix socket failed ({}), falling back to TCP: {}", e, addr);
            }
        }
    }

    // TCP server (Windows primary / Unix fallback)
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!("TCP listening: {}", addr);
    info!("JSON-RPC 2.0 endpoint ready");
    info!("Connect: nc 127.0.0.1 {}", tcp_port);

    loop {
        if let Ok((socket, _)) = listener.accept().await {
            let mgr = manager.clone();
            tokio::spawn(handle_socket(socket, mgr));
        }
    }
}
