// HundunOS LongCat-AudioDiT Module
// Rust-based high-fidelity TTS with zero-shot voice cloning

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class LongCatTTS {
    constructor(kernel) {
        this.kernel = kernel;
        this.config = kernel?.config?.longcat || {};
        
        // Default configuration
        this.modelDir = this.config.modelDir || 'meituan-longcat/LongCat-AudioDiT-1B';
        this.guidanceMethod = this.config.guidanceMethod || 'apg';
        this.steps = this.config.steps || 16;
        this.guidanceStrength = this.config.guidanceStrength || 4.0;
        
        // Rust binary path
        this.binaryPath = this.config.binaryPath || 
            join(__dirname, '..', '..', '..', 'hundunos-rust', 'target', 'release', 'hundunos-audiodit.exe');
        
        // Check if binary exists
        this.available = existsSync(this.binaryPath);
        
        // Cache directory for generated audio
        this.cacheDir = this.config.cacheDir || join(__dirname, 'cache');
        if (!existsSync(this.cacheDir)) {
            mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    /**
     * Check if TTS is available
     */
    isAvailable() {
        return this.available;
    }

    /**
     * Synthesize speech from text
     * 
     * @param {string} text - Text to synthesize
     * @param {Object} options - Synthesis options
     * @param {string} options.output - Output file path
     * @param {string} options.promptText - Prompt text for voice cloning
     * @param {string} options.promptAudio - Prompt audio path for voice cloning
     * @param {number} options.steps - Number of ODE steps
     * @param {number} options.guidanceStrength - Guidance strength
     * @param {string} options.guidanceMethod - 'cfg' or 'apg'
     * @param {number} options.seed - Random seed
     */
    async synthesize(text, options = {}) {
        if (!this.available) {
            throw new Error('LongCat-AudioDiT binary not found. Please build the Rust module first.');
        }

        const args = [
            'synthesize',
            '--text', text,
            '--model_dir', options.modelDir || this.modelDir,
            '--guidance_method', options.guidanceMethod || this.guidanceMethod,
            '--steps', String(options.steps || this.steps),
            '--guidance_strength', String(options.guidanceStrength || this.guidanceStrength),
        ];

        // Output path
        const outputPath = options.output || join(this.cacheDir, `tts_${Date.now()}.wav`);
        args.push('--output', outputPath);

        // Voice cloning options
        if (options.promptText) {
            args.push('--prompt_text', options.promptText);
        }
        if (options.promptAudio) {
            args.push('--prompt_audio', options.promptAudio);
        }
        if (options.seed !== undefined) {
            args.push('--seed', String(options.seed));
        }

        return new Promise((resolve, reject) => {
            const proc = spawn(this.binaryPath, args, {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve({
                        success: true,
                        outputPath,
                        duration: this._parseDuration(stdout),
                    });
                } else {
                    reject(new Error(`LongCat-AudioDiT failed with code ${code}: ${stderr}`));
                }
            });

            proc.on('error', (err) => {
                reject(new Error(`Failed to spawn LongCat-AudioDiT: ${err.message}`));
            });
        });
    }

    /**
     * Batch synthesis from list file
     */
    async batch(listPath, outputDir, options = {}) {
        if (!this.available) {
            throw new Error('LongCat-AudioDiT binary not found');
        }

        const args = [
            'batch',
            '--list', listPath,
            '--output_dir', outputDir,
            '--model_dir', options.modelDir || this.modelDir,
            '--guidance_method', options.guidanceMethod || this.guidanceMethod,
        ];

        return new Promise((resolve, reject) => {
            const proc = spawn(this.binaryPath, args, {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => { stdout += data.toString(); });
            proc.stderr.on('data', (data) => { stderr += data.toString(); });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve({ success: true, outputDir });
                } else {
                    reject(new Error(`Batch synthesis failed: ${stderr}`));
                }
            });

            proc.on('error', reject);
        });
    }

    /**
     * Get model information
     */
    async getModelInfo(modelDir) {
        if (!this.available) {
            throw new Error('LongCat-AudioDiT binary not found');
        }

        const args = ['info', '--model_dir', modelDir || this.modelDir];

        return new Promise((resolve, reject) => {
            const proc = spawn(this.binaryPath, args, {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => { stdout += data.toString(); });
            proc.stderr.on('data', (data) => { stderr += data.toString(); });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve(this._parseModelInfo(stdout));
                } else {
                    reject(new Error(`Failed to get model info: ${stderr}`));
                }
            });

            proc.on('error', reject);
        });
    }

    /**
     * Parse duration from output
     */
    _parseDuration(output) {
        const match = output.match(/\((\d+\.?\d*)s\)/);
        return match ? parseFloat(match[1]) : null;
    }

    /**
     * Parse model info from output
     */
    _parseModelInfo(output) {
        const info = {};
        const lines = output.split('\n');
        
        for (const line of lines) {
            const match = line.match(/\s+(\w+):\s+(.+)/);
            if (match) {
                const [, key, value] = match;
                info[key] = isNaN(value) ? value : parseFloat(value);
            }
        }
        
        return info;
    }

    /**
     * Get module stats
     */
    getStats() {
        return {
            available: this.available,
            modelDir: this.modelDir,
            guidanceMethod: this.guidanceMethod,
            steps: this.steps,
            binaryPath: this.binaryPath,
        };
    }
}

/**
 * Module initialization function
 */
export async function initialize(kernel) {
    const tts = new LongCatTTS(kernel);
    
    // review: removed // review: removed console.log(`[LongCat-TTS] Initialized (available: ${tts.available})`);
    
    if (tts.available) {
        try {
            const info = await tts.getModelInfo();
            // review: removed // review: removed console.log(`[LongCat-TTS] Model: ${info.hidden_size} hidden, ${info.num_layers} layers`);
        } catch (e) {
            // review: removed // review: removed console.log(`[LongCat-TTS] Model info unavailable: ${e.message}`);
        }
    } else {
        // review: removed // review: removed console.log(`[LongCat-TTS] Build the Rust module with: cargo build --release -p hundunos-audiodit`);
    }
    
    return tts;
}

export default LongCatTTS;
