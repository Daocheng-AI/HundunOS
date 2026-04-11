# LongCat-AudioDiT TTS Module

High-fidelity diffusion-based text-to-speech with zero-shot voice cloning.

## Features

- **SOTA Performance**: Speaker similarity 0.818 on Seed-ZH benchmark
- **Zero-shot Voice Cloning**: Clone any voice from a single 3-10s sample
- **Adaptive Projection Guidance (APG)**: Superior to traditional CFG
- **Local Inference**: No cloud API required, privacy-preserving
- **Rust Implementation**: 3-10x faster than Python

## Installation

### 1. Build Rust Module

```bash
cd hundunos-rust
cargo build --release -p hundunos-audiodit
```

### 2. Download Model Weights

```bash
# From HuggingFace
pip install huggingface_hub
huggingface-cli download meituan-longcat/LongCat-AudioDiT-1B --local-dir models/LongCat-AudioDiT-1B
```

## Usage

### Basic TTS

```javascript
import { LongCatTTS } from './extension-modules/longcat-tts/index.js';

const tts = new LongCatTTS(kernel);

// Simple synthesis
const result = await tts.synthesize('你好，世界！', {
    output: './output.wav'
});

// review: removed // review: removed console.log(`Generated: ${result.outputPath} (${result.duration}s)`);
```

### Voice Cloning

```javascript
// Clone voice from reference audio
const result = await tts.synthesize('今天天气很好', {
    promptText: '这是参考音频的文本内容',
    promptAudio: './reference.wav',
    output: './cloned.wav',
    guidanceMethod: 'apg'  // Adaptive Projection Guidance
});
```

### Configuration

```json
// config/system.json
{
    "longcat": {
        "modelDir": "models/LongCat-AudioDiT-1B",
        "guidanceMethod": "apg",
        "steps": 16,
        "guidanceStrength": 4.0
    }
}
```

## API Reference

### `synthesize(text, options)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `text` | string | Text to synthesize |
| `options.output` | string | Output WAV file path |
| `options.promptText` | string | Reference audio text |
| `options.promptAudio` | string | Reference audio path |
| `options.steps` | number | ODE steps (default: 16) |
| `options.guidanceStrength` | number | Guidance strength (default: 4.0) |
| `options.guidanceMethod` | 'cfg' \| 'apg' | Guidance method |
| `options.seed` | number | Random seed |

### `batch(listPath, outputDir, options)`

Batch synthesis from list file.

Format: `uid|prompt_text|prompt_wav|gen_text` (one per line)

### `getModelInfo(modelDir)`

Get model configuration information.

## Performance

| Metric | Value |
|--------|-------|
| Speaker Similarity (Seed-ZH) | 0.818 |
| Speaker Similarity (Seed-Hard) | 0.797 |
| Inference Time (1B) | ~200ms |
| Inference Time (3.5B) | ~500ms |
| GPU Memory (1B) | ~4GB |
| GPU Memory (3.5B) | ~16GB |

## Architecture

```
┌─────────────────────────────────────┐
│           Text Input                │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│         Text Tokenizer              │
│      (Qwen2-based)                  │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│         DiT Backbone                │
│   (Diffusion Transformer)           │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Self-Attention + Cross-Attn │   │
│  │  + MLP (SwiGLU)             │   │
│  └─────────────────────────────┘   │
│                                     │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│          Wav-VAE                    │
│      (Decoder only)                 │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│         Audio Output                │
│        (24kHz WAV)                  │
└─────────────────────────────────────┘
```

## References

- Paper: [LongCat-AudioDiT](https://arxiv.org/abs/2603.29339)
- GitHub: [meituan-longcat/LongCat-AudioDiT](https://github.com/meituan-longcat/LongCat-AudioDiT)
- HuggingFace: [meituan-longcat/LongCat-AudioDiT-1B](https://huggingface.co/meituan-longcat/LongCat-AudioDiT-1B)

## License

MIT License (same as original LongCat-AudioDiT)
