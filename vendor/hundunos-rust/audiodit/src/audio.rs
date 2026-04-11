//! Audio I/O Utilities

use anyhow::Result;
use hound::{WavSpec, WavWriter};
use ndarray::Array1;
use std::path::Path;

// ================================================================
// WAV I/O
// ================================================================

/// Load WAV file and resample to target sample rate
pub fn load_wav(path: &str, target_sr: u32) -> Result<Array1<f32>> {
    let reader = hound::WavReader::open(path)?;
    let spec = reader.spec();
    
    let samples: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Float => {
            reader.into_samples::<f32>()
                .map(|s| s.unwrap_or(0.0))
                .collect()
        }
        hound::SampleFormat::Int => {
            let max_val = 2_i32.pow((spec.bits_per_sample - 1).into()) as f32;
            reader.into_samples::<i32>()
                .map(|s| s.unwrap_or(0) as f32 / max_val)
                .collect()
        }
    };
    
    // Convert to mono if stereo
    let mono = if spec.channels == 2 {
        samples.chunks(2)
            .map(|chunk| (chunk[0] + chunk.get(1).copied().unwrap_or(0.0)) / 2.0)
            .collect()
    } else {
        samples
    };
    
    // Resample if needed
    let resampled = if spec.sample_rate != target_sr {
        resample(&Array1::from_vec(mono), spec.sample_rate, target_sr)?
    } else {
        Array1::from_vec(mono)
    };
    
    Ok(resampled)
}

/// Save WAV file
pub fn save_wav(path: &Path, samples: &[f32], sample_rate: u32) -> Result<()> {
    let spec = WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    
    let mut writer = WavWriter::create(path, spec)?;
    
    let max_val = 32767_i16;
    for &sample in samples {
        let sample_i16 = (sample.clamp(-1.0, 1.0) * max_val as f32) as i16;
        writer.write_sample(sample_i16)?;
    }
    
    writer.finalize()?;
    Ok(())
}

// ================================================================
// Resampling
// ================================================================

/// Simple linear interpolation resampling
pub fn resample(input: &Array1<f32>, from_sr: u32, to_sr: u32) -> Result<Array1<f32>> {
    if from_sr == to_sr {
        return Ok(input.clone());
    }
    
    let ratio = from_sr as f64 / to_sr as f64;
    let output_len = (input.len() as f64 / ratio) as usize;
    let mut output = Array1::zeros(output_len);
    
    for i in 0..output_len {
        let src_idx = i as f64 * ratio;
        let src_floor = src_idx.floor() as usize;
        let src_ceil = (src_floor + 1).min(input.len() - 1);
        let frac = src_idx - src_floor as f64;
        
        output[i] = input[src_floor] * (1.0 - frac as f32) + input[src_ceil] * frac as f32;
    }
    
    Ok(output)
}

// ================================================================
// Audio Processing
// ================================================================

/// Normalize audio to [-1, 1] range
pub fn normalize(audio: &Array1<f32>) -> Array1<f32> {
    let max_val = audio.iter().map(|x| x.abs()).fold(0.0_f32, f32::max);
    if max_val > 0.0 {
        audio / max_val
    } else {
        audio.clone()
    }
}

/// Apply fade in/out
#[allow(dead_code)]
pub fn fade(audio: &mut [f32], fade_samples: usize) {
    let len = audio.len();
    let fade_len = fade_samples.min(len / 2);
    
    // Fade in
    for i in 0..fade_len {
        audio[i] *= i as f32 / fade_len as f32;
    }
    
    // Fade out
    for i in 0..fade_len {
        audio[len - 1 - i] *= i as f32 / fade_len as f32;
    }
}

/// Trim silence from start and end
#[allow(dead_code)]
pub fn trim_silence(audio: &[f32], threshold: f32) -> Vec<f32> {
    let start = audio.iter()
        .position(|&x| x.abs() > threshold)
        .unwrap_or(0);
    
    let end = audio.iter().rev()
        .position(|&x| x.abs() > threshold)
        .map(|p| audio.len() - p)
        .unwrap_or(audio.len());
    
    audio[start..end].to_vec()
}

// ================================================================
// Duration Estimation
// ================================================================

/// Estimate speech duration from text
/// 
/// Heuristics:
/// - Chinese: ~3 chars/second
/// - English: ~15 chars/second
/// - Mixed: weighted average
pub fn estimate_duration(text: &str, sample_rate: u32) -> f32 {
    let chinese_chars = text.chars().filter(|c| c.is_ascii() == false).count();
    let english_chars = text.chars().filter(|c| c.is_ascii()).count();
    
    let chinese_duration = chinese_chars as f32 / 3.0;
    let english_duration = english_chars as f32 / 15.0;
    
    chinese_duration + english_duration
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_normalize() {
        let audio = Array1::from_vec(vec![-2.0, 0.0, 1.0]);
        let normalized = normalize(&audio);
        
        assert!((normalized[0].abs() - 1.0).abs() < 1e-5);
        assert!((normalized[1]).abs() < 1e-5);
        assert!((normalized[2].abs() - 0.5).abs() < 1e-5);
    }
    
    #[test]
    fn test_resample() {
        let input = Array1::from_vec(vec![0.0, 1.0, 0.0, -1.0]);
        let output = resample(&input, 4, 8).unwrap();
        
        // Should double length
        assert_eq!(output.len(), 8);
    }
    
    #[test]
    fn test_estimate_duration() {
        // Chinese text
        let duration_zh = estimate_duration("你好世界", 24000);
        assert!(duration_zh > 1.0);
        
        // English text
        let duration_en = estimate_duration("hello world", 24000);
        assert!(duration_en < 1.0);
    }
}
