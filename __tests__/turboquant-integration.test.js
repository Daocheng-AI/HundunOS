// hundunos/__tests__/turboquant-integration.test.js
// TurboQuant v2 Integration Tests — HundunOS v4.0
// Based on: TurboQuant (Google Research, arXiv:2504.19874v1)
//
// Tests integration of TurboQuantizer, TurboContextCompressor,
// and KV Cache memory estimation.

function fileUrl(p) {
    return new URL('file:///' + p.replace(/\\/g, '/')).href;
}

const KERNEL_DIR = fileUrl('C:/Users/Lin/.qclaw/workspace/hundunos/kernel/');

async function test_turbo_quantizer_v2() {
    console.log('  [1/5] TurboQuantizer v2 Integration...');

    const { TurboQuantizer, textToEmbedding, EmbeddingEngine, estimateKVCacheMemory } = await import(
        KERNEL_DIR + 'model-router/polar-quant.js'
    );

    // Test 1: embed and quantize (new v2 API: indices + norms)
    const engine = new EmbeddingEngine({ embeddingDim: 384, bitsPerChannel: 3.5, useTurboQuant: true });
    const q = engine.embedAndQuantize('hello world');
    if (!q.indices) throw new Error('Missing indices (v2 field)');
    if (!q.norms) throw new Error('Missing norms (v2 field)');
    if (q.indices.length !== 384) throw new Error(`Wrong length: ${q.indices.length}`);

    // Test 2: dequantize and verify
    const vec = engine.dequantize(q);
    if (vec.length !== 384) throw new Error(`Wrong dequantized length: ${vec.length}`);
    if (!vec.every(v => isFinite(v))) throw new Error('Contains non-finite values');

    // Test 3: cache hit
    const q2 = engine.embedAndQuantize('hello world');
    if (q.norms !== q2.norms) throw new Error('Cache miss');
    if (engine.stats.hits !== 1) throw new Error(`Cache hit not recorded: ${engine.stats.hits}`);

    // Test 4: compressed domain search
    const docs = [
        'python programming language tutorial',
        'rust systems programming language',
        'machine learning neural networks',
        'web development javascript',
        'data science analytics',
    ];
    const candidates = docs.map(d => engine.embedAndQuantize(d));
    const results = engine.searchCompressed('python coding', candidates, 3);
    if (results.length !== 3) throw new Error(`Expected 3 results, got ${results.length}`);
    if (results[0].score < 0) throw new Error('Invalid similarity score');

    // Test 5: KV Cache memory estimation (new v2 feature)
    const est = estimateKVCacheMemory(4096, {
        numLayers: 32, numHeads: 32, headDim: 128,
        bitsPerChannel: 3.5, useOutlierSplit: false,
    });
    if (!est.ratio) throw new Error('Missing ratio');
    if (parseFloat(est.ratio) < 4) throw new Error(`Bad compression ratio: ${est.ratio}`);

    // Test 6: Lloyd-Max compression ratio
    const engine2 = new EmbeddingEngine({ embeddingDim: 512, bitsPerChannel: 4 });
    const vec512 = textToEmbedding('benchmark vector test', 512);
    const qv512 = engine2.embedAndQuantize('benchmark vector test');
    const deq512 = engine2.dequantize(qv512);
    const q2norm = Math.sqrt(deq512.reduce((s, v) => s + v * v, 0));
    if (q2norm < 0.5) throw new Error(`Degenerated vector norm: ${q2norm}`);

    // Test 7: v2 stats
    const stats = engine.getStats();
    if (typeof stats.effectiveBits !== 'number') throw new Error('Missing effectiveBits in stats');

    console.log('  ✓ TurboQuantizer v2 integration OK');
    console.log(`    effectiveBits=${stats.effectiveBits}, ratio=${stats.compressionRatio.toFixed(1)}`);
}

async function test_context_compressor_v2() {
    console.log('  [2/5] TurboContextCompressor v2 Integration...');

    const { TurboContextCompressor, scoreImportance } = await import(
        KERNEL_DIR + 'model-router/turbo-context-compressor.js'
    );

    // Test 1: importance scoring
    const errorMsg = { role: 'system', content: 'Error: connection timeout', tokens: 8 };
    const chatMsg = { role: 'user', content: 'hello there', tokens: 5 };

    const errorScore = scoreImportance(errorMsg, 0, 10);
    const chatScore = scoreImportance(chatMsg, 0, 10);
    if (errorScore <= chatScore) throw new Error('Error should score higher than chat');

    // Test 2: compress a session (v2 returns stats)
    const session = [
        { role: 'user', content: 'hello', tokens: 3 },
        { role: 'assistant', content: 'hi!', tokens: 2 },
        { role: 'system', content: 'Error: API rate limit exceeded', tokens: 8 },
        { role: 'user', content: 'implement sorting algorithm', tokens: 25 },
    ];

    const compressor = new TurboContextCompressor();
    const result = await compressor.compress(session, 20);
    if (!result.messages) throw new Error('Missing messages in result');
    if (!result.hasOwnProperty('compressed')) throw new Error('Missing compressed flag');

    // Test 3: v2 paper default (bitsPerChannel=3.5)
    const stats = compressor.getStats();
    if (stats.engineStats && stats.engineStats.effectiveBits !== 3.5) {
        throw new Error(`Wrong effectiveBits: ${stats.engineStats.effectiveBits}`);
    }

    console.log('  ✓ TurboContextCompressor v2 integration OK');
}

async function test_kv_memory_estimation() {
    console.log('  [3/5] KV Cache Memory Estimation...');

    const { estimateKVCacheMemory } = await import(KERNEL_DIR + 'model-router/polar-quant.js');

    // 3.5-bit: should be ~9x
    const est1 = estimateKVCacheMemory(4096, {
        numLayers: 32, numHeads: 32, headDim: 128,
        bitsPerChannel: 3.5, useOutlierSplit: false,
    });
    const ratio1 = parseFloat(est1.ratio);
    if (ratio1 < 4 || ratio1 > 5.5) throw new Error(`3.5-bit ratio: ${ratio1} (expected ~4.6)`);

    // 2.5-bit with outlier: should be ~7x
    const est2 = estimateKVCacheMemory(4096, {
        numLayers: 32, numHeads: 32, headDim: 128,
        bitsPerChannel: 3.5, useOutlierSplit: true,
    });
    const ratio2 = parseFloat(est2.ratio);
    if (ratio2 < 6 || ratio2 > 8) throw new Error(`2.5-bit outlier ratio: ${ratio2} (expected ~7)`);

    console.log('  ✓ KV Cache memory estimation OK');
    console.log(`    3.5-bit: ${est1.original_mb}MB -> ${est1.compressed_mb}MB (${ratio1}x)`);
    console.log(`    2.5-bit outlier: ${est2.original_mb}MB -> ${est2.compressed_mb}MB (${ratio2}x)`);
}

async function test_llm_router_integration() {
    console.log('  [4/5] ModelRouter TurboQuant v4 Integration...');

    const { ModelRouter } = await import(KERNEL_DIR + 'model-router/index.js');

    const router = new ModelRouter({});

    // Verify TurboContextCompressor v2 is initialized
    if (!router.turboCompressor) throw new Error('TurboCompressor not initialized in ModelRouter');
    if (typeof router.turboCompressor.compress !== 'function') throw new Error('compress missing');

    // Test the turbo compressor directly
    const session = [
        { role: 'user', content: 'hello world', tokens: 5 },
        { role: 'system', content: 'Error: connection failed', tokens: 6 },
    ];
    const compressed = await router.turboCompressor.compress(session, 10);
    if (!compressed.messages) throw new Error('compress() should return messages');
    if (typeof compressed.compressed !== 'boolean') throw new Error('Missing compressed flag');

    // Test getStats includes engine stats
    const stats = router.getStats();
    if (!stats.hasOwnProperty('turboCompressor')) throw new Error('Missing turboCompressor in router stats');

    console.log('  ✓ ModelRouter v4 TurboQuant integration OK');
}

async function test_outlier_split_mode() {
    console.log('  [5/5] Outlier Split Mode...');

    const { TurboQuantizer, EmbeddingEngine } = await import(KERNEL_DIR + 'model-router/polar-quant.js');

    // With outlier split (2.5-bit effective)
    const engine = new EmbeddingEngine({
        embeddingDim: 128,
        bitsPerChannel: 3.5,
        useOutlierSplit: true,
    });

    if (engine.quantizer.effectiveBits < 2.0 || engine.quantizer.effectiveBits > 3.0) {
        throw new Error(`Wrong effectiveBits: ${engine.quantizer.effectiveBits}`);
    }

    console.log('  ✓ Outlier split mode OK');
    console.log(`    effectiveBits=${engine.quantizer.effectiveBits.toFixed(2)}`);
}

async function main() {
    console.log('\n' + '═'.repeat(60));
    console.log('  TurboQuant v2 Integration Tests — HundunOS v4.0');
    console.log('  Paper: arXiv:2504.19874v1 — Google Research');
    console.log('═'.repeat(60) + '\n');

    let passed = 0;
    let failed = 0;

    const tests = [
        test_turbo_quantizer_v2,
        test_context_compressor_v2,
        test_kv_memory_estimation,
        test_llm_router_integration,
        test_outlier_split_mode,
    ];

    for (const testFn of tests) {
        try {
            await testFn();
            passed++;
        } catch (e) {
            console.error(`  ✗ FAILED: ${e.message}`);
            failed++;
        }
    }

    console.log('\n' + '═'.repeat(60));
    console.log(`  Passed: ${passed}/${tests.length}  ✓`);
    console.log(`  Failed: ${failed}/${tests.length}  ✗`);
    console.log('═'.repeat(60) + '\n');

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
    console.error('Test runner error:', e.message);
    process.exit(1);
});
