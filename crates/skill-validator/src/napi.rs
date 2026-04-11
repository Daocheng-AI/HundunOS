use napi_derive::napi;
use skill_validator::*;
use std::collections::HashMap;

/// Validate skill name format
#[napi]
pub fn validate_skill_name(name: String) -> Option<String> {
    get_skill_name_error(&name)
}

/// Parse SKILL.md content
#[napi(object)]
pub struct ParsedSkillMd {
    pub frontmatter: SkillFrontmatterJson,
    pub body: String,
    pub raw: String,
}

#[napi(object)]
pub struct SkillFrontmatterJson {
    pub name: String,
    pub description: Option<String>,
    pub version: Option<String>,
    pub author: Option<String>,
    pub license: Option<String>,
    pub compatibility: Option<String>,
    pub tags: Vec<String>,
    pub metadata: HashMap<String, String>,
}

/// ValidationResult for Node.js
#[napi(object)]
pub struct ValidationResultJson {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub data: Option<ParsedSkillMd>,
}

/// Parse SKILL.md file content
#[napi]
pub fn parse_skill_md(content: String) -> Result<ParsedSkillMd, napi::Error> {
    let parsed = skill_validator::parse_skill_md(&content)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    
    Ok(ParsedSkillMd {
        frontmatter: SkillFrontmatterJson {
            name: parsed.frontmatter.name,
            description: parsed.frontmatter.description,
            version: parsed.frontmatter.version,
            author: parsed.frontmatter.author,
            license: parsed.frontmatter.license,
            compatibility: parsed.frontmatter.compatibility,
            tags: parsed.frontmatter.tags,
            metadata: parsed.frontmatter.metadata,
        },
        body: parsed.body,
        raw: parsed.raw,
    })
}

/// Validate SKILL.md content
#[napi]
pub fn validate_skill_md(content: String, dir_name: Option<String>) -> ValidationResultJson {
    let result = skill_validator::validate_skill_md(&content, dir_name.as_deref());
    
    ValidationResultJson {
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
        data: result.data.map(|parsed| ParsedSkillMd {
            frontmatter: SkillFrontmatterJson {
                name: parsed.frontmatter.name,
                description: parsed.frontmatter.description,
                version: parsed.frontmatter.version,
                author: parsed.frontmatter.author,
                license: parsed.frontmatter.license,
                compatibility: parsed.frontmatter.compatibility,
                tags: parsed.frontmatter.tags,
                metadata: parsed.frontmatter.metadata,
            },
            body: parsed.body,
            raw: parsed.raw,
        }),
    }
}

/// Validate skill definition (JSON object)
#[napi]
pub fn validate_skill_def(def: String) -> ValidationResultJson {
    let json: serde_json::Value = match serde_json::from_str(&def) {
        Ok(v) => v,
        Err(e) => {
            return ValidationResultJson {
                valid: false,
                errors: vec![format!("Invalid JSON: {}", e)],
                warnings: vec![],
                data: None,
            };
        }
    };
    
    let result = skill_validator::validate_skill_def(&json);
    
    ValidationResultJson {
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
        data: None,
    }
}
