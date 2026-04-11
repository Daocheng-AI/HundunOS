// hundunos-rust/tool-bridge/src/schema.rs
// Schema introspection system - query parameter structure, output format
// Inspired by lark-cli schema command

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::shortcuts::{ApiCommand, ArgDef, Permission, Shortcut, ShortcutsRegistry, ApiCommandsRegistry};

/// Schema query types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SchemaQuery {
    /// List all available schemas
    List,
    /// Get schema for a specific shortcut
    Shortcut { name: String },
    /// Get schema for a specific API command
    ApiCommand { name: String },
    /// Get full schema tree
    Tree,
    /// Search schemas by keyword
    Search { keyword: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaInfo {
    pub name: String,
    pub kind: SchemaKind,
    pub description: String,
    pub category: String,
    /// JSON Schema representation
    pub schema: SchemaObject,
    /// Output format
    pub output_format: String,
    /// Whether it has side effects
    pub has_side_effects: bool,
    /// Required permission
    pub permission: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaObject {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub properties: Option<HashMap<String, SchemaProperty>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub example: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaProperty {
    #[serde(rename = "type")]
    pub prop_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enum_values: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SchemaKind {
    #[serde(rename = "shortcut")]
    Shortcut,
    #[serde(rename = "api_command")]
    ApiCommand,
    #[serde(rename = "raw_command")]
    RawCommand,
    #[serde(rename = "tool")]
    Tool,
}

impl SchemaKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            SchemaKind::Shortcut => "shortcut",
            SchemaKind::ApiCommand => "api_command",
            SchemaKind::RawCommand => "raw_command",
            SchemaKind::Tool => "tool",
        }
    }
}

/// Schema registry - provides introspection for all commands
pub struct SchemaRegistry {
    shortcuts: ShortcutsRegistry,
    api_commands: ApiCommandsRegistry,
    /// Built-in tools schema
    tools: HashMap<String, ToolSchema>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolSchema {
    pub name: String,
    pub description: String,
    pub category: String,
    pub args: Vec<ArgDef>,
    pub has_side_effects: bool,
    pub permission: Permission,
    pub example: String,
}

impl Default for SchemaRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl SchemaRegistry {
    pub fn new() -> Self {
        let shortcuts = ShortcutsRegistry::new();
        let api_commands = ApiCommandsRegistry::new();

        // Built-in tools schema
        let tools = vec![
            ToolSchema {
                name: "health_check".to_string(),
                description: "System health check across all modules".to_string(),
                category: "monitor".to_string(),
                args: vec![],
                has_side_effects: false,
                permission: Permission::Read,
                example: "python health_check.py".to_string(),
            },
            ToolSchema {
                name: "system_info".to_string(),
                description: "Get detailed system information".to_string(),
                category: "system".to_string(),
                args: vec![],
                has_side_effects: false,
                permission: Permission::Read,
                example: "python system_info.py".to_string(),
            },
            ToolSchema {
                name: "clear_cache".to_string(),
                description: "Clear system cache and temporary files".to_string(),
                category: "maintenance".to_string(),
                args: vec![],
                has_side_effects: true,
                permission: Permission::Admin,
                example: "python clear_cache.js".to_string(),
            },
            ToolSchema {
                name: "list_files".to_string(),
                description: "List files in directory".to_string(),
                category: "file".to_string(),
                args: vec![
                    ArgDef {
                        name: "path".to_string(),
                        description: "Directory path (default: current)".to_string(),
                        required: false,
                        arg_type: "string".to_string(),
                        default: Some(".".to_string()),
                    },
                    ArgDef {
                        name: "pattern".to_string(),
                        description: "File pattern filter (e.g., *.js)".to_string(),
                        required: false,
                        arg_type: "string".to_string(),
                        default: None,
                    },
                    ArgDef {
                        name: "recursive".to_string(),
                        description: "List recursively".to_string(),
                        required: false,
                        arg_type: "bool".to_string(),
                        default: Some("false".to_string()),
                    },
                ],
                has_side_effects: false,
                permission: Permission::Read,
                example: "python list_files.js --path ./kernel --pattern *.js".to_string(),
            },
            ToolSchema {
                name: "read_json".to_string(),
                description: "Read JSON/TXT/MD file content".to_string(),
                category: "file".to_string(),
                args: vec![
                    ArgDef {
                        name: "path".to_string(),
                        description: "File path to read".to_string(),
                        required: true,
                        arg_type: "string".to_string(),
                        default: None,
                    },
                ],
                has_side_effects: false,
                permission: Permission::Read,
                example: "python read_json.js --path ./config/system.json".to_string(),
            },
            ToolSchema {
                name: "write_json".to_string(),
                description: "Write content to file".to_string(),
                category: "file".to_string(),
                args: vec![
                    ArgDef {
                        name: "path".to_string(),
                        description: "File path to write".to_string(),
                        required: true,
                        arg_type: "string".to_string(),
                        default: None,
                    },
                    ArgDef {
                        name: "content".to_string(),
                        description: "Content to write (JSON string)".to_string(),
                        required: true,
                        arg_type: "string".to_string(),
                        default: None,
                    },
                ],
                has_side_effects: true,
                permission: Permission::Write,
                example: "python write_json.js --path ./data/out.json --content '{\"key\":\"value\"}'".to_string(),
            },
            ToolSchema {
                name: "execute_shell".to_string(),
                description: "Execute arbitrary shell command".to_string(),
                category: "system".to_string(),
                args: vec![
                    ArgDef {
                        name: "command".to_string(),
                        description: "Shell command to execute".to_string(),
                        required: true,
                        arg_type: "string".to_string(),
                        default: None,
                    },
                    ArgDef {
                        name: "timeout".to_string(),
                        description: "Timeout in milliseconds (default: 30000)".to_string(),
                        required: false,
                        arg_type: "number".to_string(),
                        default: Some("30000".to_string()),
                    },
                ],
                has_side_effects: true,
                permission: Permission::Super,
                example: "python execute_shell.js --command \"dir\" --timeout 5000".to_string(),
            },
            ToolSchema {
                name: "daily_report".to_string(),
                description: "Generate daily progress report".to_string(),
                category: "report".to_string(),
                args: vec![],
                has_side_effects: false,
                permission: Permission::Read,
                example: "python daily_report.py".to_string(),
            },
            ToolSchema {
                name: "weekly_report".to_string(),
                description: "Generate weekly summary report".to_string(),
                category: "report".to_string(),
                args: vec![],
                has_side_effects: false,
                permission: Permission::Read,
                example: "python weekly_report.py".to_string(),
            },
            ToolSchema {
                name: "tool_hub".to_string(),
                description: "Tool hub - list/find/execute tools".to_string(),
                category: "tools".to_string(),
                args: vec![
                    ArgDef {
                        name: "action".to_string(),
                        description: "Action: list, find, exec".to_string(),
                        required: true,
                        arg_type: "string".to_string(),
                        default: None,
                    },
                    ArgDef {
                        name: "query".to_string(),
                        description: "Search query for 'find' action".to_string(),
                        required: false,
                        arg_type: "string".to_string(),
                        default: None,
                    },
                ],
                has_side_effects: false,
                permission: Permission::Read,
                example: "python tool_hub.py list".to_string(),
            },
            ToolSchema {
                name: "cron_monitor".to_string(),
                description: "Monitor scheduled cron jobs status".to_string(),
                category: "monitor".to_string(),
                args: vec![],
                has_side_effects: false,
                permission: Permission::Read,
                example: "python cron_monitor.py".to_string(),
            },
            ToolSchema {
                name: "heartbeat_enhanced".to_string(),
                description: "Enhanced heartbeat health check".to_string(),
                category: "monitor".to_string(),
                args: vec![],
                has_side_effects: false,
                permission: Permission::Read,
                example: "python heartbeat_enhanced.py".to_string(),
            },
            ToolSchema {
                name: "intelligence_evolution_hub".to_string(),
                description: "Intelligence evolution hub - status and management".to_string(),
                category: "evolution".to_string(),
                args: vec![
                    ArgDef {
                        name: "status".to_string(),
                        description: "Show evolution status".to_string(),
                        required: false,
                        arg_type: "bool".to_string(),
                        default: Some("true".to_string()),
                    },
                ],
                has_side_effects: false,
                permission: Permission::Read,
                example: "python intelligence_evolution_hub.py --status".to_string(),
            },
            ToolSchema {
                name: "auto_evolution".to_string(),
                description: "Trigger automatic evolution cycle".to_string(),
                category: "evolution".to_string(),
                args: vec![],
                has_side_effects: true,
                permission: Permission::Admin,
                example: "python auto_evolution.py".to_string(),
            },
            ToolSchema {
                name: "workbuddy_launcher".to_string(),
                description: "WorkBuddy IDE launcher".to_string(),
                category: "tools".to_string(),
                args: vec![
                    ArgDef {
                        name: "action".to_string(),
                        description: "Action: status, launch, stop".to_string(),
                        required: false,
                        arg_type: "string".to_string(),
                        default: Some("status".to_string()),
                    },
                ],
                has_side_effects: false,
                permission: Permission::Read,
                example: "python workbuddy_launcher.py status".to_string(),
            },
        ].into_iter().map(|t| (t.name.clone(), t)).collect();

        Self {
            shortcuts,
            api_commands,
            tools,
        }
    }

    /// Query schema
    pub fn query(&self, q: &SchemaQuery) -> SchemaResult {
        match q {
            SchemaQuery::List => self.list_all(),
            SchemaQuery::Shortcut { name } => self.get_shortcut_schema(name),
            SchemaQuery::ApiCommand { name } => self.get_api_command_schema(name),
            SchemaQuery::Tree => self.get_tree(),
            SchemaQuery::Search { keyword } => self.search(keyword),
        }
    }

    fn list_all(&self) -> SchemaResult {
        let mut schemas = vec![];

        // Add shortcuts
        for s in self.shortcuts.list(None) {
            schemas.push(self.shortcut_to_schema(s));
        }

        // Add API commands
        for cmd in self.api_commands.list() {
            schemas.push(self.api_cmd_to_schema(cmd));
        }

        // Add tools
        for t in self.tools.values() {
            schemas.push(self.tool_to_schema(t));
        }

        SchemaResult::List(schemas)
    }

    fn get_shortcut_schema(&self, name: &str) -> SchemaResult {
        match self.shortcuts.resolve(name) {
            Some(s) => SchemaResult::One(self.shortcut_to_schema(&s)),
            None => SchemaResult::Error(format!("Shortcut not found: {}", name)),
        }
    }

    fn get_api_command_schema(&self, name: &str) -> SchemaResult {
        match self.api_commands.resolve(name) {
            Some(cmd) => SchemaResult::One(self.api_cmd_to_schema(cmd)),
            None => SchemaResult::Error(format!("API command not found: {}", name)),
        }
    }

    fn get_tree(&self) -> SchemaResult {
        let mut tree: HashMap<String, HashMap<String, Vec<String>>> = HashMap::new();

        // Shortcuts by category
        for s in self.shortcuts.list(None) {
            tree.entry("shortcuts".to_string())
                .or_default()
                .entry(s.category.clone())
                .or_default()
                .push(s.name.clone());
        }

        // API commands by category
        for cmd in self.api_commands.list() {
            tree.entry("api_commands".to_string())
                .or_default()
                .entry(cmd.category.clone())
                .or_default()
                .push(cmd.name.clone());
        }

        // Tools by category
        for t in self.tools.values() {
            tree.entry("tools".to_string())
                .or_default()
                .entry(t.category.clone())
                .or_default()
                .push(t.name.clone());
        }

        SchemaResult::Tree(tree)
    }

    fn search(&self, keyword: &str) -> SchemaResult {
        let kw = keyword.to_lowercase();
        let mut results = vec![];

        for s in self.shortcuts.list(None) {
            if s.name.contains(&kw) || s.description.to_lowercase().contains(&kw) {
                results.push(self.shortcut_to_schema(s));
            }
        }

        for cmd in self.api_commands.list() {
            if cmd.name.contains(&kw) || cmd.description.to_lowercase().contains(&kw) {
                results.push(self.api_cmd_to_schema(cmd));
            }
        }

        for t in self.tools.values() {
            if t.name.contains(&kw) || t.description.to_lowercase().contains(&kw) {
                results.push(self.tool_to_schema(t));
            }
        }

        SchemaResult::List(results)
    }

    fn shortcut_to_schema(&self, s: &Shortcut) -> SchemaInfo {
        let mut props = HashMap::new();
        for (k, v) in &s.defaults {
            props.insert(
                k.clone(),
                SchemaProperty {
                    prop_type: "string".to_string(),
                    description: Some(format!("Default: {}", v)),
                    default: Some(v.clone()),
                    required: Some(false),
                    enum_values: None,
                },
            );
        }

        SchemaInfo {
            name: s.name.clone(),
            kind: SchemaKind::Shortcut,
            description: s.description.clone(),
            category: s.category.clone(),
            schema: SchemaObject {
                title: Some(s.name.clone()),
                description: Some(s.description.clone()),
                properties: if props.is_empty() { None } else { Some(props) },
                required: None,
                example: Some(s.example.clone()),
            },
            output_format: format!("{:?}", s.output_format),
            has_side_effects: s.has_side_effects,
            permission: format!("{:?}", s.permission),
        }
    }

    fn api_cmd_to_schema(&self, cmd: &ApiCommand) -> SchemaInfo {
        let mut props = HashMap::new();
        let mut required = vec![];

        for arg in &cmd.args {
            props.insert(
                arg.name.clone(),
                SchemaProperty {
                    prop_type: arg.arg_type.clone(),
                    description: Some(arg.description.clone()),
                    default: arg.default.clone(),
                    required: Some(arg.required),
                    enum_values: None,
                },
            );
            if arg.required {
                required.push(arg.name.clone());
            }
        }

        SchemaInfo {
            name: cmd.name.clone(),
            kind: SchemaKind::ApiCommand,
            description: cmd.description.clone(),
            category: cmd.category.clone(),
            schema: SchemaObject {
                title: Some(cmd.name.clone()),
                description: Some(cmd.description.clone()),
                properties: Some(props),
                required: if required.is_empty() { None } else { Some(required) },
                example: None,
            },
            output_format: "json".to_string(),
            has_side_effects: cmd.has_side_effects,
            permission: format!("{:?}", cmd.permission),
        }
    }

    fn tool_to_schema(&self, t: &ToolSchema) -> SchemaInfo {
        let mut props = HashMap::new();
        let mut required = vec![];

        for arg in &t.args {
            props.insert(
                arg.name.clone(),
                SchemaProperty {
                    prop_type: arg.arg_type.clone(),
                    description: Some(arg.description.clone()),
                    default: arg.default.clone(),
                    required: Some(arg.required),
                    enum_values: None,
                },
            );
            if arg.required {
                required.push(arg.name.clone());
            }
        }

        SchemaInfo {
            name: t.name.clone(),
            kind: SchemaKind::Tool,
            description: t.description.clone(),
            category: t.category.clone(),
            schema: SchemaObject {
                title: Some(t.name.clone()),
                description: Some(t.description.clone()),
                properties: if props.is_empty() { None } else { Some(props) },
                required: if required.is_empty() { None } else { Some(required) },
                example: Some(t.example.clone()),
            },
            output_format: "json".to_string(),
            has_side_effects: t.has_side_effects,
            permission: format!("{:?}", t.permission),
        }
    }

    /// Resolve a command (shortcut -> api command -> raw) through all layers
    /// Returns (layer, expanded_command)
    pub fn resolve_command(&self, input: &str) -> Option<(String, String)> {
        // Layer 1: Shortcut
        if input.starts_with('+') {
            if let Some(shortcut) = self.shortcuts.resolve(input) {
                return Some(("shortcut".to_string(), shortcut.expands_to.clone()));
            }
        }

        // Layer 2: API Command
        if input.contains('.') {
            if let Some(cmd) = self.api_commands.resolve(input) {
                return Some(("api_command".to_string(), cmd.command_template.clone()));
            }
        }

        // Layer 3: Raw command
        Some(("raw".to_string(), input.to_string()))
    }

    /// Check if a command has side effects (for dry-run warning)
    pub fn has_side_effects(&self, name: &str) -> bool {
        // Check shortcut
        if let Some(s) = self.shortcuts.resolve(name) {
            return s.has_side_effects;
        }
        // Check API command
        if let Some(cmd) = self.api_commands.resolve(name) {
            return cmd.has_side_effects;
        }
        // Check tool
        if let Some(tool) = self.tools.get(name) {
            return tool.has_side_effects;
        }
        // Raw commands have side effects by default
        true
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SchemaResult {
    List(Vec<SchemaInfo>),
    One(SchemaInfo),
    Tree(HashMap<String, HashMap<String, Vec<String>>>),
    Error(String),
}


impl SchemaRegistry {
    /// Get shortcuts registry for listing shortcuts
    pub fn shortcuts_registry(&self) -> &ShortcutsRegistry {
        &self.shortcuts
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_schema_list() {
        let registry = SchemaRegistry::new();
        if let SchemaResult::List(schemas) = registry.query(&SchemaQuery::List) {
            assert!(!schemas.is_empty());
        } else {
            panic!("Expected list");
        }
    }

    #[test]
    fn test_schema_tree() {
        let registry = SchemaRegistry::new();
        if let SchemaResult::Tree(tree) = registry.query(&SchemaQuery::Tree) {
            assert!(tree.contains_key("shortcuts"));
            assert!(tree.contains_key("tools"));
        }
    }

    #[test]
    fn test_resolve_command() {
        let registry = SchemaRegistry::new();
        let Some((layer, cmd)) = registry.resolve_command("+health") else { panic!() };
        assert_eq!(layer, "shortcut");
        assert!(cmd.contains("health_check"));

        let Some((layer, _cmd)) = registry.resolve_command("system.health") else { panic!() };
        assert_eq!(layer, "api_command");

        let Some((layer, _)) = registry.resolve_command("echo hello") else { panic!() };
        assert_eq!(layer, "raw");
    }

    #[test]
    fn test_search() {
        let registry = SchemaRegistry::new();
        if let SchemaResult::List(results) = registry.query(&SchemaQuery::Search { keyword: "health".to_string() }) {
            assert!(!results.is_empty());
        }
    }
}
