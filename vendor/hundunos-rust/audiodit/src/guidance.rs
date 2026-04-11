//! Guidance Methods: CFG and APG

use serde::{Deserialize, Serialize};

// ================================================================
// Guidance Method
// ================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GuidanceMethod {
    /// Classifier-Free Guidance
    ClassifierFree(GuidanceConfig),
    
    /// Adaptive Projection Guidance (APG)
    AdaptiveProjection(GuidanceConfig),
}

impl Default for GuidanceMethod {
    fn default() -> Self {
        Self::AdaptiveProjection(GuidanceConfig::default())
    }
}

// ================================================================
// Guidance Configuration
// ================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuidanceConfig {
    /// Guidance strength (typically 1.0 - 10.0)
    #[serde(default = "default_strength")]
    pub strength: f32,
    
    /// Minimum guidance scale (for adaptive methods)
    #[serde(default = "default_min_scale")]
    pub min_scale: f32,
    
    /// Maximum guidance scale
    #[serde(default = "default_max_scale")]
    pub max_scale: f32,
}

fn default_strength() -> f32 { 4.0 }
fn default_min_scale() -> f32 { 1.0 }
fn default_max_scale() -> f32 { 10.0 }

impl Default for GuidanceConfig {
    fn default() -> Self {
        Self {
            strength: default_strength(),
            min_scale: default_min_scale(),
            max_scale: default_max_scale(),
        }
    }
}

impl GuidanceConfig {
    /// Compute adaptive scale based on timestep
    pub fn adaptive_scale(&self, t: f32) -> f32 {
        // Scale decreases linearly from strength to min_scale
        let scale = self.strength * (1.0 - t) + self.min_scale * t;
        scale.clamp(self.min_scale, self.max_scale)
    }
}

// ================================================================
// Guidance Implementation
// ================================================================

/// Apply Classifier-Free Guidance
/// 
/// v_guided = v_uncond + scale * (v_cond - v_uncond)
pub fn apply_cfg(v_cond: &[f32], v_uncond: &[f32], scale: f32) -> Vec<f32> {
    v_uncond.iter()
        .zip(v_cond.iter())
        .map(|(u, c)| u + scale * (c - u))
        .collect()
}

/// Apply Adaptive Projection Guidance
/// 
/// APG improves upon CFG by adaptively scaling the guidance based on:
/// 1. The timestep t (higher guidance early, lower later)
/// 2. The magnitude of the difference between conditional and unconditional
pub fn apply_apg(
    v_cond: &[f32],
    v_uncond: &[f32],
    scale: f32,
    t: f32,
) -> Vec<f32> {
    // Compute difference
    let diff: Vec<f32> = v_cond.iter()
        .zip(v_uncond.iter())
        .map(|(c, u)| c - u)
        .collect();
    
    // Compute norm
    let norm: f32 = diff.iter().map(|x| x * x).sum::<f32>().sqrt();
    
    // Adaptive scaling
    let adaptive_scale = if norm > 1e-6 {
        // Scale decreases as we approach the end of diffusion
        scale * (1.0 - t * 0.5)
    } else {
        1.0
    };
    
    // Apply guidance
    v_uncond.iter()
        .zip(diff.iter())
        .map(|(u, d)| u + adaptive_scale * d)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_cfg() {
        let v_cond = vec![1.0, 2.0, 3.0];
        let v_uncond = vec![0.0, 0.0, 0.0];
        let result = apply_cfg(&v_cond, &v_uncond, 2.0);
        
        assert!((result[0] - 2.0).abs() < 1e-5);
        assert!((result[1] - 4.0).abs() < 1e-5);
        assert!((result[2] - 6.0).abs() < 1e-5);
    }
    
    #[test]
    fn test_apg() {
        let v_cond = vec![1.0, 2.0, 3.0];
        let v_uncond = vec![0.0, 0.0, 0.0];
        
        // At t=0, APG should behave like CFG
        let result = apply_apg(&v_cond, &v_uncond, 2.0, 0.0);
        assert!(result[0] > 0.0);
        
        // At t=1, APG should have lower guidance
        let result_t1 = apply_apg(&v_cond, &v_uncond, 2.0, 1.0);
        assert!(result_t1[0] < result[0]);
    }
    
    #[test]
    fn test_adaptive_scale() {
        let config = GuidanceConfig {
            strength: 4.0,
            min_scale: 1.0,
            max_scale: 10.0,
        };
        
        // At t=0, scale should be close to strength
        let scale_0 = config.adaptive_scale(0.0);
        assert!((scale_0 - 4.0).abs() < 0.1);
        
        // At t=1, scale should be close to min_scale
        let scale_1 = config.adaptive_scale(1.0);
        assert!((scale_1 - 1.0).abs() < 0.1);
    }
}
