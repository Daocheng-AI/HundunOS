//! HundunOS Skill Validator
//!
//! High-performance skill validation library migrated from JavaScript.
//! Provides:
//! - Skill name validation (kebab-case, 1-64 chars)
//! - SKILL.md frontmatter parsing
//! - Complete skill package validation

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use thiserror::Error;

lazy_static::lazy_static! {
    /// Skill name validation regex
    /// - Format: lowercase alphanumeric with single hyphen separators
    /// - Length: 1-64 characters
    /// - Cannot start or end with `-`
    /// - Cannot contain consecutive `--`
    static ref SKILL_NAME_REGEX: Regex = Regex::new(r"^[a-z0-9]+(-[a-z0-9]+)*$").unwrap();
}

/// Maximum skill name length
pub const MAX_SKILL_NAME_LENGTH: usize = 64;

/// Validation error types
#[derive(Error, Debug, Clone, PartialEq)]
pub enum ValidationError {
    #[error("Skill name is empty")]
    EmptyName,
    
    #[error("Skill name exceeds {0} characters")]
    NameTooLong(usize),
    
    #[error("Skill name contains invalid characters: {0}")]
    InvalidCharacters(String),
    
    #[error("Skill name starts with hyphen")]
    StartsWitHyphen,
    
    #[error("Skill name ends with hyphen")]
    EndsWithHyphen,
    
    #[error("Skill name contains consecutive hyphens")]
    ConsecutiveHyphens,
    
    #[error("Skill name contains uppercase letters")]
    UppercaseLetters,
    
    #[error("Missing required field: {0}")]
    MissingField(String),
    
    #[error("Invalid frontmatter format: {0}")]
    InvalidFrontmatter(String),
    
    #[error("SKILL.md not found")]
    SkillMdNotFound,
    
    #[error("Directory name '{dir}' does not match skill name '{skill}'")]
    NameMismatch { dir: String, skill: String },
}

/// Skill frontmatter structure
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SkillFrontmatter {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub license: Option<String>,
    #[serde(default)]
    pub compatibility: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub metadata: HashMap<String, String>,
}

/// Parsed SKILL.md result
#[derive(Debug, Clone)]
pub struct ParsedSkillMd {
    pub frontmatter: SkillFrontmatter,
    pub body: String,
    pub raw: String,
}

/// Validation result
#[derive(Debug, Clone, Default)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub data: Option<ParsedSkillMd>,
}

impl ValidationResult {
    pub fn new() -> Self {
        Self::default()
    }
    
    pub fn with_error(mut self, error: impl Into<String>) -> Self {
        self.errors.push(error.into());
        self.valid = false;
        self
    }
    
    pub fn with_warning(mut self, warning: impl Into<String>) -> Self {
        self.warnings.push(warning.into());
        self
    }
    
    pub fn with_data(mut self, data: ParsedSkillMd) -> Self {
        self.data = Some(data);
        self.valid = self.errors.is_empty();
        self
    }
}

/// Validate skill name format
///
/// # Arguments
/// * `name` - Skill name to validate
///
/// # Returns
/// * `Ok(())` if valid
/// * `Err(ValidationError)` with specific error
pub fn validate_skill_name(name: &str) -> Result<(), ValidationError> {
    // Check empty
    if name.is_empty() {
        return Err(ValidationError::EmptyName);
    }
    
    // Check length
    if name.len() > MAX_SKILL_NAME_LENGTH {
        return Err(ValidationError::NameTooLong(MAX_SKILL_NAME_LENGTH));
    }
    
    // Check starts with hyphen
    if name.starts_with('-') {
        return Err(ValidationError::StartsWithHyphen);
    }
    
    // Check ends with hyphen
    if name.ends_with('-') {
        return Err(ValidationError::EndsWithHyphen);
    }
    
    // Check consecutive hyphens
    if name.contains("--") {
        return Err(ValidationError::ConsecutiveHyphens);
    }
    
    // Check uppercase
    if name.chars().any(|c| c.is_ascii_uppercase()) {
        return Err(ValidationError::UppercaseLetters);
    }
    
    // Check regex pattern
    if !SKILL_NAME_REGEX.is_match(name) {
        return Err(ValidationError::InvalidCharacters(name.to_string()));
    }
    
    Ok(())
}

/// Get detailed error message for skill name
pub fn get_skill_name_error(name: &str) -> Option<String> {
    match validate_skill_name(name) {
        Ok(()) => None,
        Err(e) => Some(e.to_string()),
    }
}

/// Parse SKILL.md content
///
/// # Arguments
/// * `content` - SKILL.md file content
///
/// # Returns
/// * `Ok(ParsedSkillMd)` if parsing succeeds
/// * `Err(ValidationError)` if parsing fails
pub fn parse_skill_md(content: &str) -> Result<ParsedSkillMd, ValidationError> {
    let content = content.trim();
    
    // Check for frontmatter markers
    if !content.starts_with("---") {
        return Err(ValidationError::InvalidFrontmatter(
            "Missing opening frontmatter marker (---)".to_string()
        ));
    }
    
    // Find closing marker
    let rest = &content[3..];
    let close_pos = rest.find("---").ok_or_else(|| {
        ValidationError::InvalidFrontmatter("Missing closing frontmatter marker (---)".to_string())
    })?;
    
    let frontmatter_str = rest[..close_pos].trim();
    let body = rest[close_pos + 3..].trim().to_string();
    
    // Parse YAML frontmatter
    let frontmatter = parse_yaml_frontmatter(frontmatter_str)?;
    
    Ok(ParsedSkillMd {
        frontmatter,
        body,
        raw: content.to_string(),
    })
}

/// Parse YAML frontmatter string into SkillFrontmatter
fn parse_yaml_frontmatter(yaml: &str) -> Result<SkillFrontmatter, ValidationError> {
    let mut frontmatter = SkillFrontmatter::default();
    
    for line in yaml.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        
        // Parse key: value
        if let Some(colon_pos) = line.find(':') {
            let key = line[..colon_pos].trim();
            let value = line[colon_pos + 1..].trim();
            
            match key {
                "name" => frontmatter.name = value.to_string(),
                "description" => frontmatter.description = Some(value.to_string()),
                "version" => frontmatter.version = Some(value.to_string()),
                "author" => frontmatter.author = Some(value.to_string()),
                "license" => frontmatter.license = Some(value.to_string()),
                "compatibility" => frontmatter.compatibility = Some(value.to_string()),
                "tags" => {
                    // Parse array: [tag1, tag2] or - item format
                    frontmatter.tags = parse_yaml_array(value);
                }
                _ => {
                    frontmatter.metadata.insert(key.to_string(), value.to_string());
                }
            }
        }
    }
    
    if frontmatter.name.is_empty() {
        return Err(ValidationError::MissingField("name".to_string()));
    }
    
    Ok(frontmatter)
}

/// Parse YAML array value
fn parse_yaml_array(value: &str) -> Vec<String> {
    let value = value.trim();
    
    // Inline array: [item1, item2]
    if value.starts_with('[') && value.ends_with(']') {
        let inner = &value[1..value.len()-1];
        return inner
            .split(',')
            .map(|s| s.trim().trim_matches('"').to_string())
            .filter(|s| !s.is_empty())
            .collect();
    }
    
    Vec::new()
}

/// Validate SKILL.md content
///
/// # Arguments
/// * `content` - SKILL.md file content
/// * `dir_name` - Optional directory name for consistency check
///
/// # Returns
/// * `ValidationResult` with errors, warnings, and parsed data
pub fn validate_skill_md(content: &str, dir_name: Option<&str>) -> ValidationResult {
    let mut result = ValidationResult::new();
    result.valid = true;
    
    // Parse frontmatter
    let parsed = match parse_skill_md(content) {
        Ok(p) => p,
        Err(e) => return ValidationResult::new().with_error(e.to_string()),
    };
    
    // Validate name
    if let Err(e) = validate_skill_name(&parsed.frontmatter.name) {
        result = result.with_error(format!("Invalid skill name: {}", e));
    }
    
    // Check directory name consistency
    if let Some(dir) = dir_name {
        if dir != parsed.frontmatter.name {
            result = result.with_error(format!(
                "Directory name '{}' does not match skill name '{}'",
                dir, parsed.frontmatter.name
            ));
        }
    }
    
    // Check description
    if parsed.frontmatter.description.is_none() {
        result = result.with_warning("Missing description field");
    }
    
    // Check version
    if parsed.frontmatter.version.is_none() {
        result = result.with_warning("Missing version field, defaulting to 1.0.0");
    }
    
    // Check body
    if parsed.body.is_empty() {
        result = result.with_warning("SKILL.md has no body content");
    }
    
    result.with_data(parsed)
}

/// Validate skill definition (HundunOS YAML format)
///
/// # Arguments
/// * `def` - Skill definition JSON object
///
/// # Returns
/// * `ValidationResult` with errors and warnings
pub fn validate_skill_def(def: &serde_json::Value) -> ValidationResult {
    let mut result = ValidationResult::new();
    result.valid = true;
    
    // Check required name field
    if let Some(name) = def.get("name").and_then(|n| n.as_str()) {
        if let Err(e) = validate_skill_name(name) {
            result = result.with_error(format!("Invalid skill name: {}", e));
        }
    } else {
        result = result.with_error("Missing required field: name");
    }
    
    // Check triggers
    if let Some(triggers) = def.get("triggers") {
        if !triggers.is_array() {
            result = result.with_error("Field 'triggers' must be an array");
        } else if triggers.as_array().unwrap().is_empty() {
            result = result.with_warning("Triggers array is empty");
        }
    }
    
    // Check tools
    if let Some(tools) = def.get("tools") {
        if !tools.is_array() {
            result = result.with_error("Field 'tools' must be an array");
        }
    }
    
    // Check system_prompt
    if def.get("system_prompt").is_none() && def.get("body").is_none() {
        result = result.with_warning("Missing system_prompt or body field");
    }
    
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_valid_skill_names() {
        let valid_names = vec![
            "my-skill",
            "skill",
            "my-skill-123",
            "a",
            "skill123",
            "123-skill",
        ];
        
        for name in valid_names {
            assert!(validate_skill_name(name).is_ok(), "Expected '{}' to be valid", name);
        }
    }
    
    #[test]
    fn test_invalid_skill_names() {
        let invalid_cases = vec![
            ("", ValidationError::EmptyName),
            ("My-Skill", ValidationError::UppercaseLetters),
            ("-skill", ValidationError::StartsWithHyphen),
            ("skill-", ValidationError::EndsWithHyphen),
            ("skill--name", ValidationError::ConsecutiveHyphens),
            ("skill_name", ValidationError::InvalidCharacters("skill_name".to_string())),
            ("skill.name", ValidationError::InvalidCharacters("skill.name".to_string())),
        ];
        
        for (name, expected_error) in invalid_cases {
            let result = validate_skill_name(name);
            assert!(result.is_err(), "Expected '{}' to be invalid", name);
            assert_eq!(result.unwrap_err(), expected_error);
        }
    }
    
    #[test]
    fn test_name_too_long() {
        let long_name = "a".repeat(65);
        let result = validate_skill_name(&long_name);
        assert!(matches!(result, Err(ValidationError::NameTooLong(64))));
    }
    
    #[test]
    fn test_parse_skill_md() {
        let content = r#"---
name: my-skill
version: 1.0.0
description: A test skill
tags: [test, demo]
---

This is the body content.
"#;
        
        let result = parse_skill_md(content).unwrap();
        assert_eq!(result.frontmatter.name, "my-skill");
        assert_eq!(result.frontmatter.version, Some("1.0.0".to_string()));
        assert_eq!(result.frontmatter.description, Some("A test skill".to_string()));
        assert_eq!(result.frontmatter.tags, vec!["test", "demo"]);
        assert!(result.body.contains("This is the body content"));
    }
    
    #[test]
    fn test_validate_skill_def() {
        let valid_def = serde_json::json!({
            "name": "my-skill",
            "triggers": ["test"],
            "system_prompt": "You are a helper"
        });
        
        let result = validate_skill_def(&valid_def);
        assert!(result.valid);
        
        let invalid_def = serde_json::json!({
            "triggers": ["test"]
        });
        
        let result = validate_skill_def(&invalid_def);
        assert!(!result.valid);
        assert!(result.errors.iter().any(|e| e.contains("Missing required field: name")));
    }
}
