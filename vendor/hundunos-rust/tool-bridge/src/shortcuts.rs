// hundunos-rust/tool-bridge/src/shortcuts.rs
// Three-layer command system: Shortcuts → API Commands → Raw API
// Inspired by larksuite/cli three-layer architecture

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Output format for command results
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum OutputFormat {
    #[serde(rename = "json")]
    Json,
    #[serde(rename = "pretty")]
    Pretty,
    #[serde(rename = "table")]
    Table,
    #[serde(rename = "csv")]
    Csv,
    #[serde(rename = "ndjson")]
    Ndjson,
}

impl Default for OutputFormat {
    fn default() -> Self {
        Self::Json
    }
}

/// A shortcut command - the top layer of the three-layer system
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Shortcut {
    /// Unique name: "+agenda", "+create", "+list"
    pub name: String,
    /// Category: "calendar", "docs", "system"
    pub category: String,
    /// Human-readable description
    pub description: String,
    /// Layer 1: Direct command that this shortcut expands to
    pub expands_to: String,
    /// Smart default arguments (merged with user args)
    pub defaults: HashMap<String, String>,
    /// Output format for this shortcut
    pub output_format: OutputFormat,
    /// Whether this command has side effects (requires dry-run confirmation)
    pub has_side_effects: bool,
    /// Example usage
    pub example: String,
    /// Permission required to run this shortcut
    pub permission: Permission,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Permission {
    Read,
    Write,
    Admin,
    Super,
}

impl Default for Permission {
    fn default() -> Self {
        Self::Read
    }
}

/// Built-in shortcuts registry (layer 1 - AI friendly)
pub struct ShortcutsRegistry {
    shortcuts: Vec<Shortcut>,
}

impl Default for ShortcutsRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl ShortcutsRegistry {
    pub fn new() -> Self {
        let shortcuts = vec![
            // ============ System Shortcuts ============
            Shortcut {
                name: "+health".to_string(),
                category: "system".to_string(),
                description: "System health check - returns health score across all modules".to_string(),
                expands_to: "python health_check.py".to_string(),
                defaults: HashMap::new(),
                output_format: OutputFormat::Json,
                has_side_effects: false,
                example: "+health".to_string(),
                permission: Permission::Read,
            },
            Shortcut {
                name: "+status".to_string(),
                category: "system".to_string(),
                description: "Quick system status overview".to_string(),
                expands_to: "python system_info.py".to_string(),
                defaults: HashMap::new(),
                output_format: OutputFormat::Pretty,
                has_side_effects: false,
                example: "+status".to_string(),
                permission: Permission::Read,
            },
            Shortcut {
                name: "+clear".to_string(),
                category: "system".to_string(),
                description: "Clear system cache and temporary files".to_string(),
                expands_to: "python clear_cache.py".to_string(),
                defaults: HashMap::new(),
                output_format: OutputFormat::Pretty,
                has_side_effects: true,
                example: "+clear".to_string(),
                permission: Permission::Admin,
            },
            // ============ File Shortcuts ============
            Shortcut {
                name: "+ls".to_string(),
                category: "file".to_string(),
                description: "List files in directory (default: current)".to_string(),
                expands_to: "dir /b".to_string(),
                defaults: {
                    let mut m = HashMap::new();
                    m.insert("path".to_string(), ".".to_string());
                    m
                },
                output_format: OutputFormat::Table,
                has_side_effects: false,
                example: "+ls --path ./docs".to_string(),
                permission: Permission::Read,
            },
            Shortcut {
                name: "+find".to_string(),
                category: "file".to_string(),
                description: "Find files matching pattern".to_string(),
                expands_to: "find".to_string(),
                defaults: HashMap::new(),
                output_format: OutputFormat::Table,
                has_side_effects: false,
                example: "+find --pattern *.js --dir ./kernel".to_string(),
                permission: Permission::Read,
            },
            Shortcut {
                name: "+read".to_string(),
                category: "file".to_string(),
                description: "Read file content (supports JSON/TXT/MD)".to_string(),
                expands_to: "python read_json.py".to_string(),
                defaults: HashMap::new(),
                output_format: OutputFormat::Pretty,
                has_side_effects: false,
                example: "+read --path ./config/system.json".to_string(),
                permission: Permission::Read,
            },
            Shortcut {
                name: "+write".to_string(),
                category: "file".to_string(),
                description: "Write content to file".to_string(),
                expands_to: "python write_json.py".to_string(),
                defaults: HashMap::new(),
                output_format: OutputFormat::Json,
                has_side_effects: true,
                example: "+write --path ./data/output.json --content '{}'".to_string(),
                permission: Permission::Write,
            },
            // ============ Report Shortcuts ============
            Shortcut {
                name: "+daily".to_string(),
                category: "report".to_string(),
                description: "Generate daily report".to_string(),
                expands_to: "python daily_report.py".to_string(),
                defaults: HashMap::new(),
                output_format: OutputFormat::Pretty,
                has_side_effects: false,
                example: "+daily".to_string(),
                permission: Permission::Read,
            },
            Shortcut {
                name: "+weekly".to_string(),
                category: "report".to_string(),
                description: "Generate weekly report".to_string(),
                expands_to: "python weekly_report.py".to_string(),
                defaults: HashMap::new(),
                output_format: OutputFormat::Pretty,
                has_side_effects: false,
                example: "+weekly".to_string(),
                permission: Permission::Read,
            },
            // ============ Tool Management ============
            Shortcut {
                name: "+tools".to_string(),
                category: "tools".to_string(),
                description: "List all available tools".to_string(),
                expands_to: "python tool_hub.py list".to_string(),
                defaults: HashMap::new(),
                output_format: OutputFormat::Table,
                has_side_effects: false,
                example: "+tools".to_string(),
                permission: Permission::Read,
            },
            Shortcut {
                name: "+tools-find".to_string(),
                category: "tools".to_string(),
                description: "Search tools by name or description".to_string(),
                expands_to: "python tool_hub.py find".to_string(),
                defaults: HashMap::new(),
                output_format: OutputFormat::Json,
                has_side_effects: false,
                example: "+tools-find --query health".to_string(),
                permission: Permission::Read,
            },
            // ============ Monitor Shortcuts ============
            Shortcut {
                name: "+cron".to_string(),
                category: "monitor".to_string(),
                description: "Monitor cron jobs status".to_string(),
                expands_to: "python cron_monitor.py".to_string(),
                defaults: HashMap::new(),
                output_format: OutputFormat::Json,
                has_side_effects: false,
                example: "+cron".to_string(),
                permission: Permission::Read,
            },
            Shortcut {
                name: "+heartbeat".to_string(),
                category: "monitor".to_string(),
                description: "Enhanced heartbeat health check".to_string(),
                expands_to: "python heartbeat_enhanced.py".to_string(),
                defaults: HashMap::new(),
                output_format: OutputFormat::Json,
                has_side_effects: false,
                example: "+heartbeat".to_string(),
                permission: Permission::Read,
            },
            // ============ Evolution Shortcuts ============
            Shortcut {
                name: "+evolution".to_string(),
                category: "evolution".to_string(),
                description: "Intelligence evolution hub - status and triggers".to_string(),
                expands_to: "python intelligence_evolution_hub.py --status".to_string(),
                defaults: HashMap::new(),
                output_format: OutputFormat::Pretty,
                has_side_effects: false,
                example: "+evolution".to_string(),
                permission: Permission::Read,
            },
            Shortcut {
                name: "+evolve".to_string(),
                category: "evolution".to_string(),
                description: "Trigger automatic evolution cycle".to_string(),
                expands_to: "python auto_evolution.py".to_string(),
                defaults: HashMap::new(),
                output_format: OutputFormat::Pretty,
                has_side_effects: true,
                example: "+evolve".to_string(),
                permission: Permission::Admin,
            },
            // ============ WorkBuddy Shortcuts ============
            Shortcut {
                name: "+workbuddy".to_string(),
                category: "tools".to_string(),
                description: "Launch or check WorkBuddy IDE".to_string(),
                expands_to: "python workbuddy_launcher.py status".to_string(),
                defaults: HashMap::new(),
                output_format: OutputFormat::Pretty,
                has_side_effects: false,
                example: "+workbuddy".to_string(),
                permission: Permission::Read,
            },
        ];
        Self { shortcuts }
    }

    /// Resolve a shortcut name to its expanded command
    pub fn resolve(&self, name: &str) -> Option<Shortcut> {
        if !name.starts_with('+') {
            return None;
        }
        self.shortcuts.iter().find(|s| &s.name == name).cloned()
    }

    /// Resolve and merge with user arguments
    /// Returns the expanded command string
    pub fn resolve_with_args(&self, name: &str, user_args: &HashMap<String, String>) -> Option<String> {
        let shortcut = self.resolve(name)?;
        let mut cmd = shortcut.expands_to.clone();
        let mut merged: HashMap<String, String> = shortcut.defaults.clone();
        for (k, v) in user_args {
            merged.insert(k.clone(), v.clone());
        }
        // Build argument string
        for (key, value) in &merged {
            // Handle boolean flags
            if value == "true" || value == "" {
                cmd.push_str(&format!(" --{}", key));
            } else {
                cmd.push_str(&format!(" --{} \"{}\"", key, value));
            }
        }
        Some(cmd)
    }

    /// List all shortcuts (optionally filtered by category)
    pub fn list(&self, category: Option<&str>) -> Vec<&Shortcut> {
        match category {
            Some(cat) => self.shortcuts.iter().filter(|s| s.category == cat).collect(),
            None => self.shortcuts.iter().collect(),
        }
    }

    /// Get shortcuts by category map
    pub fn by_category(&self) -> HashMap<&str, Vec<&Shortcut>> {
        let mut map: HashMap<&str, Vec<&Shortcut>> = HashMap::new();
        for shortcut in &self.shortcuts {
            map.entry(shortcut.category.as_str())
                .or_default()
                .push(shortcut);
        }
        map
    }
}

/// API Command - the second layer (platform-synced)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiCommand {
    pub name: String,
    pub category: String,
    pub description: String,
    pub command_template: String,
    pub args: Vec<ArgDef>,
    pub has_side_effects: bool,
    pub permission: Permission,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArgDef {
    pub name: String,
    pub description: String,
    pub required: bool,
    pub arg_type: String,
    pub default: Option<String>,
}

/// Built-in API Commands registry (layer 2)
pub struct ApiCommandsRegistry {
    commands: Vec<ApiCommand>,
}

impl Default for ApiCommandsRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl ApiCommandsRegistry {
    pub fn new() -> Self {
        let commands = vec![
            ApiCommand {
                name: "system.health".to_string(),
                category: "system".to_string(),
                description: "Get system health score across all dimensions".to_string(),
                command_template: "python health_check.py".to_string(),
                args: vec![],
                has_side_effects: false,
                permission: Permission::Read,
            },
            ApiCommand {
                name: "system.info".to_string(),
                category: "system".to_string(),
                description: "Get detailed system information".to_string(),
                command_template: "python system_info.py".to_string(),
                args: vec![],
                has_side_effects: false,
                permission: Permission::Read,
            },
            ApiCommand {
                name: "file.list".to_string(),
                category: "file".to_string(),
                description: "List files in directory".to_string(),
                command_template: "python list_files.js".to_string(),
                args: vec![
                    ArgDef {
                        name: "path".to_string(),
                        description: "Directory path".to_string(),
                        required: false,
                        arg_type: "string".to_string(),
                        default: Some(".".to_string()),
                    },
                    ArgDef {
                        name: "recursive".to_string(),
                        description: "Recursive listing".to_string(),
                        required: false,
                        arg_type: "bool".to_string(),
                        default: Some("false".to_string()),
                    },
                ],
                has_side_effects: false,
                permission: Permission::Read,
            },
            ApiCommand {
                name: "file.read".to_string(),
                category: "file".to_string(),
                description: "Read file content".to_string(),
                command_template: "python read_json.py".to_string(),
                args: vec![
                    ArgDef {
                        name: "path".to_string(),
                        description: "File path".to_string(),
                        required: true,
                        arg_type: "string".to_string(),
                        default: None,
                    },
                ],
                has_side_effects: false,
                permission: Permission::Read,
            },
            ApiCommand {
                name: "file.write".to_string(),
                category: "file".to_string(),
                description: "Write content to file".to_string(),
                command_template: "python write_json.py".to_string(),
                args: vec![
                    ArgDef {
                        name: "path".to_string(),
                        description: "File path".to_string(),
                        required: true,
                        arg_type: "string".to_string(),
                        default: None,
                    },
                    ArgDef {
                        name: "content".to_string(),
                        description: "Content to write".to_string(),
                        required: true,
                        arg_type: "string".to_string(),
                        default: None,
                    },
                ],
                has_side_effects: true,
                permission: Permission::Write,
            },
            ApiCommand {
                name: "report.daily".to_string(),
                category: "report".to_string(),
                description: "Generate daily report".to_string(),
                command_template: "python daily_report.py".to_string(),
                args: vec![],
                has_side_effects: false,
                permission: Permission::Read,
            },
            ApiCommand {
                name: "report.weekly".to_string(),
                category: "report".to_string(),
                description: "Generate weekly report".to_string(),
                command_template: "python weekly_report.py".to_string(),
                args: vec![],
                has_side_effects: false,
                permission: Permission::Read,
            },
            ApiCommand {
                name: "tools.list".to_string(),
                category: "tools".to_string(),
                description: "List all available tools".to_string(),
                command_template: "python tool_hub.py list".to_string(),
                args: vec![],
                has_side_effects: false,
                permission: Permission::Read,
            },
            ApiCommand {
                name: "tools.find".to_string(),
                category: "tools".to_string(),
                description: "Search tools".to_string(),
                command_template: "python tool_hub.py find".to_string(),
                args: vec![
                    ArgDef {
                        name: "query".to_string(),
                        description: "Search query".to_string(),
                        required: false,
                        arg_type: "string".to_string(),
                        default: None,
                    },
                ],
                has_side_effects: false,
                permission: Permission::Read,
            },
            ApiCommand {
                name: "monitor.cron".to_string(),
                category: "monitor".to_string(),
                description: "Monitor cron jobs".to_string(),
                command_template: "python cron_monitor.py".to_string(),
                args: vec![],
                has_side_effects: false,
                permission: Permission::Read,
            },
        ];
        Self { commands }
    }

    /// Resolve an API command name to its definition
    pub fn resolve(&self, name: &str) -> Option<&ApiCommand> {
        self.commands.iter().find(|c| c.name == name)
    }

    /// List all commands
    pub fn list(&self) -> &[ApiCommand] {
        &self.commands
    }

    /// Build a command string from an API command name and args
    #[allow(dead_code)]
    pub fn build(&self, name: &str, args: &HashMap<String, String>) -> Option<String> {
        let cmd = self.resolve(name)?;
        let mut result = cmd.command_template.clone();
        for (key, value) in args {
            if value == "true" || value.is_empty() {
                result.push_str(&format!(" --{}", key));
            } else {
                result.push_str(&format!(" --{} \"{}\"", key, value));
            }
        }
        Some(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shortcut_resolve() {
        let registry = ShortcutsRegistry::new();
        let s = registry.resolve("+health");
        assert!(s.is_some());
        assert_eq!(s.unwrap().category, "system");

        assert!(registry.resolve("nonexistent").is_none());
    }

    #[test]
    fn test_shortcut_resolve_with_args() {
        let registry = ShortcutsRegistry::new();
        let mut args = HashMap::new();
        args.insert("path".to_string(), "./docs".to_string());
        let cmd = registry.resolve_with_args("+ls", &args);
        assert!(cmd.is_some());
        assert!(cmd.unwrap().contains("--path"));
    }

    #[test]
    fn test_api_command_resolve() {
        let registry = ApiCommandsRegistry::new();
        let cmd = registry.resolve("system.health");
        assert!(cmd.is_some());
        assert!(!cmd.unwrap().has_side_effects);
    }
}
