//! AudioDiT Configuration

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;

// ================================================================
// Model Configuration
// ================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDiTConfig {
    /// Hidden dimension
    #[serde(default = "default_hidden_size")]
    pub hidden_size: usize,
    
    /// Number of transformer layers
    #[serde(default = "default_num_layers")]
    pub num_layers: usize,
    
    /// Number of attention heads
    #[serde(default = "default_num_heads")]
    pub num_heads: usize,
    
    /// Head dimension
    #[serde(default = "default_head_dim")]
    pub head_dim: usize,
    
    /// MLP intermediate dimension
    #[serde(default = "default_intermediate_size")]
    pub intermediate_size: usize,
    
    /// VAE configuration
    #[serde(default)]
    pub vae: AudioDiTVaeConfig,
    
    /// Sampling rate
    #[serde(default = "default_sampling_rate")]
    pub sampling_rate: u32,
    
    /// Latent hop size
    #[serde(default = "default_latent_hop")]
    pub latent_hop: usize,
    
    /// Maximum waveform duration in seconds
    #[serde(default = "default_max_duration")]
    pub max_wav_duration: f32,
    
    /// Text encoder model
    #[serde(default = "default_text_encoder")]
    pub text_encoder_model: String,
    
    /// Vocabulary size
    #[serde(default = "default_vocab_size")]
    pub vocab_size: usize,
    
    /// Maximum position embeddings
    #[serde(default = "default_max_positions")]
    pub max_position_embeddings: usize,
    
    /// RoPE base
    #[serde(default = "default_rope_base")]
    pub rope_base: f32,
}

fn default_hidden_size() -> usize { 1536 }
fn default_num_layers() -> usize { 24 }
fn default_num_heads() -> usize { 24 }
fn default_head_dim() -> usize { 64 }
fn default_intermediate_size() -> usize { 8960 }
fn default_sampling_rate() -> u32 { 24000 }
fn default_latent_hop() -> usize { 480 }
fn default_max_duration() -> f32 { 30.0 }
fn default_text_encoder() -> String { "Qwen/Qwen2-7B-Instruct".to_string() }
fn default_vocab_size() -> usize { 151643 }
fn default_max_positions() -> usize { 32768 }
fn default_rope_base() -> f32 { 1000000.0 }

impl Default for AudioDiTConfig {
    fn default() -> Self {
        Self {
            hidden_size: default_hidden_size(),
            num_layers: default_num_layers(),
            num_heads: default_num_heads(),
            head_dim: default_head_dim(),
            intermediate_size: default_intermediate_size(),
            vae: AudioDiTVaeConfig::default(),
            sampling_rate: default_sampling_rate(),
            latent_hop: default_latent_hop(),
            max_wav_duration: default_max_duration(),
            text_encoder_model: default_text_encoder(),
            vocab_size: default_vocab_size(),
            max_position_embeddings: default_max_positions(),
            rope_base: default_rope_base(),
        }
    }
}

impl AudioDiTConfig {
    /// Load configuration from model directory
    pub fn load(model_dir: &str) -> Result<Self> {
        let path = Path::new(model_dir).join("config.json");
        
        if path.exists() {
            let content = std::fs::read_to_string(&path)?;
            let config: Self = serde_json::from_str(&content)?;
            Ok(config)
        } else {
            Ok(Self::default())
        }
    }
    
    /// Get 1B model config
    pub fn model_1b() -> Self {
        Self {
            hidden_size: 1024,
            num_layers: 16,
            num_heads: 16,
            head_dim: 64,
            intermediate_size: 5632,
            ..Default::default()
        }
    }
    
    /// Get 3.5B model config
    pub fn model_3_5b() -> Self {
        Self {
            hidden_size: 2048,
            num_layers: 36,
            num_heads: 32,
            head_dim: 64,
            intermediate_size: 11264,
            ..Default::default()
        }
    }
}

// ================================================================
// VAE Configuration
// ================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDiTVaeConfig {
    /// Latent dimension
    #[serde(default = "default_latent_dim")]
    pub latent_dim: usize,
    
    /// Encoder channels
    #[serde(default = "default_encoder_channels")]
    pub encoder_channels: Vec<usize>,
    
    /// Decoder channels
    #[serde(default = "default_decoder_channels")]
    pub decoder_channels: Vec<usize>,
    
    /// Kernel sizes
    #[serde(default = "default_kernel_sizes")]
    pub kernel_sizes: Vec<usize>,
    
    /// Strides
    #[serde(default = "default_strides")]
    pub strides: Vec<usize>,
    
    /// Dilations
    #[serde(default = "default_dilations")]
    pub dilations: Vec<usize>,
}

fn default_latent_dim() -> usize { 128 }
fn default_encoder_channels() -> Vec<usize> { vec![1, 32, 64, 128, 256, 512] }
fn default_decoder_channels() -> Vec<usize> { vec![512, 256, 128, 64, 32, 1] }
fn default_kernel_sizes() -> Vec<usize> { vec![7, 7, 7, 7, 7] }
fn default_strides() -> Vec<usize> { vec![4, 4, 4, 4, 4] }
fn default_dilations() -> Vec<usize> { vec![1, 1, 1, 1, 1] }

impl Default for AudioDiTVaeConfig {
    fn default() -> Self {
        Self {
            latent_dim: default_latent_dim(),
            encoder_channels: default_encoder_channels(),
            decoder_channels: default_decoder_channels(),
            kernel_sizes: default_kernel_sizes(),
            strides: default_strides(),
            dilations: default_dilations(),
        }
    }
}
