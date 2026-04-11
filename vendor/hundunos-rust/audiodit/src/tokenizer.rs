//! Text Tokenizer for AudioDiT

use anyhow::Result;
use tokenizers::Tokenizer;
use std::path::Path;

// ================================================================
// Text Tokenizer
// ================================================================

pub struct TextTokenizer {
    tokenizer: Option<Tokenizer>,
    model_name: String,
}

impl TextTokenizer {
    pub fn new(model_name: &str) -> Result<Self> {
        // Try to load tokenizer from HuggingFace
        let tokenizer = Self::load_tokenizer(model_name).ok();
        
        Ok(Self {
            tokenizer,
            model_name: model_name.to_string(),
        })
    }
    
    /// Encode text to token IDs
    pub fn encode(&self, text: &str) -> Result<Vec<i32>> {
        if let Some(ref tokenizer) = self.tokenizer {
            let encoding = tokenizer.encode(text, true).map_err(|e| anyhow::anyhow!("{}", e))?;
            Ok(encoding.get_ids().iter().map(|&id| id as i32).collect())
        } else {
            // Fallback: simple character-level encoding
            Ok(text.chars().map(|c| c as i32).collect())
        }
    }
    
    /// Decode token IDs to text
    #[allow(dead_code)]
    pub fn decode(&self, tokens: &[i32]) -> Result<String> {
        if let Some(ref tokenizer) = self.tokenizer {
            let ids: Vec<u32> = tokens.iter().map(|&id| id as u32).collect();
            Ok(tokenizer.decode(&ids, true).map_err(|e| anyhow::anyhow!("{}", e))?)
        } else {
            // Fallback: character-level decoding
            Ok(tokens.iter().map(|&id| char::from_u32(id as u32).unwrap_or('?')).collect())
        }
    }
    
    /// Load tokenizer from HuggingFace
    fn load_tokenizer(model_name: &str) -> Result<Tokenizer> {
        // Try local path first
        let local_path = Path::new(model_name).join("tokenizer.json");
        if local_path.exists() {
            return Ok(Tokenizer::from_file(&local_path).map_err(|e| anyhow::anyhow!("{}", e))?);
        }
        
        // For now, return error - HuggingFace hub requires additional setup
        anyhow::bail!("Tokenizer not found at {}", model_name)
    }
}

// ================================================================
// Text Normalization
// ================================================================

/// Normalize text for TTS
pub fn normalize_text(text: &str) -> String {
    let mut normalized = text.to_string();
    
    // Remove extra whitespace
    while normalized.contains("  ") {
        normalized = normalized.replace("  ", " ");
    }
    
    // Trim
    normalized = normalized.trim().to_string();
    
    // Chinese text normalization
    normalized = normalize_chinese(&normalized);
    
    // English text normalization
    normalized = normalize_english(&normalized);
    
    normalized
}

fn normalize_chinese(text: &str) -> String {
    let mut result = text.to_string();
    
    // Replace full-width punctuation with half-width
    result = result.replace("，", ", ");
    result = result.replace("。", ". ");
    result = result.replace("！", "! ");
    result = result.replace("？", "? ");
    result = result.replace("：", ": ");
    result = result.replace("；", "; ");
    result = result.replace("（", " (");
    result = result.replace("）", ") ");
    result = result.replace("【", " [");
    result = result.replace("】", "] ");
    result = result.replace("、", ", ");
    
    result
}

fn normalize_english(text: &str) -> String {
    let mut result = text.to_string();
    
    // Normalize abbreviations
    result = result.replace("Mr.", "Mister ");
    result = result.replace("Mrs.", "Misses ");
    result = result.replace("Dr.", "Doctor ");
    result = result.replace("Prof.", "Professor ");
    
    // Normalize numbers (simplified)
    // TODO: Use num2words for proper number conversion
    
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_normalize_chinese() {
        let text = "你好，世界！";
        let normalized = normalize_text(text);
        assert!(normalized.contains(","));
        assert!(normalized.contains("!"));
    }
    
    #[test]
    fn test_normalize_whitespace() {
        let text = "hello    world";
        let normalized = normalize_text(text);
        assert_eq!(normalized, "hello world");
    }
}
