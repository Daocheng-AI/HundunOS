// hundunos/__tests__/turboquant-benchmark.js
// TurboQuant v2 Performance Benchmark
// Based on: TurboQuant (Google Research, arXiv:2504.19874v1)
//
// Measures:
//   - Compression ratio (3.5-bit Lloyd-Max)
//   - Latency & throughput
//   - Token savings
//   - Vector search recall

import { TurboQuantizer, textToEmbedding, estimateKVCacheMemory } from '../kernel/model-router/polar-quant.js';
import { TurboContextCompressor } from '../kernel/model-router/turbo-context-compressor.js';

async function run() {
  console.log('='.repeat(60));
  console.log('  TurboQuant v2 Performance Benchmark — HundunOS v4.0');
  console.log('  Paper: arXiv:2504.19874v1 — Google Research');
  console.log('='.repeat(60));

  const results = {};

  // ── 1. TurboQuantizer Core Benchmark ────────────────────────────
  console.log('\n[1] TurboQuantizer Core (Lloyd-Max, d=512, 3.5-bit)');
  console.log('-'.repeat(50));

  const q = new TurboQuantizer({ embeddingDim: 512, bitsPerChannel: 3.5, useTurboQuant: true });
  const N = 2000;
  const docs = Array.from({ length: N }, (_, i) =>
    `Document ${i}: A comprehensive analysis of machine learning algorithms ` +
    `including neural networks, transformers, and reinforcement learning approaches ` +
    `applied to natural language understanding and computer vision tasks.`
  );

  const t0 = Date.now();
  const quantized = docs.map(d => q.quantize(textToEmbedding(d, 512)));
  const embedMs = Date.now() - t0;

  // Compression stats
  const origBytes = N * 512 * 4; // Float32
  const indexBytesPerVec = Math.ceil(512 * 3.5 / 8); // 3.5-bit indices
  const normBytes = 8; // Float64
  const compressedBytes = N * (indexBytesPerVec + normBytes);
  const ratio = origBytes / compressedBytes;

  console.log(`  Vectors:             ${N.toLocaleString()}`);
  console.log(`  Dim:                 512`);
  console.log(`  Bits/channel:         3.5 (paper: quality-neutral)`);
  console.log(`  Total time:          ${embedMs}ms`);
  console.log(`  Per-vector:          ${(embedMs / N).toFixed(3)}ms`);
  console.log(`  Throughput:           ${Math.round(N / (embedMs / 1000)).toLocaleString()} vectors/sec`);
  console.log(`  Original size:       ${(origBytes / 1024).toFixed(1)} KB`);
  console.log(`  Compressed size:    ${(compressedBytes / 1024).toFixed(1)} KB`);
  console.log(`  Compression ratio:   ${ratio.toFixed(1)}:1 (paper expected ~9:1)`);

  results.quantizer = {
    vectors: N, timeMs: embedMs, perVectorMs: embedMs / N,
    throughput: Math.round(N / (embedMs / 1000)),
    compressionRatio: ratio, originalKB: origBytes / 1024, compressedKB: compressedBytes / 1024,
  };

  // ── 2. Dequantization Roundtrip ────────────────────────────
  console.log('\n[2] Dequantization Roundtrip (Lloyd-Max optimal)');
  console.log('-'.repeat(50));

  const t1 = Date.now();
  const restored = quantized.map(qo => q.dequantize(qo));
  const deqMs = Date.now() - t1;

  // Cosine similarity on first 100
  const sampleSize = Math.min(100, N);
  const similarities = restored.slice(0, sampleSize).map((vec, i) => {
    const orig = textToEmbedding(docs[i], 512);
    let dot = 0;
    for (let j = 0; j < 512; j++) dot += orig[j] * vec[j];
    return Math.max(-1, Math.min(1, dot));
  });
  const avgSim = similarities.reduce((a, b) => a + b, 0) / sampleSize;
  const minSim = Math.min(...similarities);

  console.log(`  Dequantization:      ${deqMs}ms (${(deqMs / N).toFixed(3)}ms/vec)`);
  console.log(`  Avg cosine sim:     ${avgSim.toFixed(4)} (paper theory: ~0.999 for b=3.5)`);
  console.log(`  Min cosine sim:     ${minSim.toFixed(4)}`);

  results.roundtrip = { deqMs, avgCosineSimilarity: avgSim, minCosineSimilarity: minSim };

  // ── 3. Approximate Nearest Neighbor Search ──────────────────
  console.log('\n[3] Approximate Nearest Neighbor (d=512, 3.5-bit)');
  console.log('-'.repeat(50));

  const engine = {
    quantizer: q,
    embedAndQuantize: (text) => q.quantize(textToEmbedding(text, 512)),
    dequantize: (qo) => q.dequantize(qo),
    similarityCompressed: (a, b) => {
      const va = q.dequantize(a), vb = q.dequantize(b);
      let dot = 0;
      for (let i = 0; i < 512; i++) dot += va[i] * vb[i];
      return dot;
    },
  };

  const queries = docs.slice(0, 100);
  const t2 = Date.now();
  const searchResults = queries.map(query => {
    const qv = engine.embedAndQuantize(query);
    const scored = quantized.map((c, idx) => ({
      idx, score: engine.similarityCompressed(qv, c),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 5);
  });
  const searchMs = Date.now() - t2;

  console.log(`  Queries:             ${queries.length}`);
  console.log(`  Candidate pool:     ${quantized.length}`);
  console.log(`  Total search:       ${searchMs}ms`);
  console.log(`  Per query:          ${(searchMs / queries.length).toFixed(3)}ms`);
  console.log(`  Throughput:          ${Math.round(queries.length / (searchMs / 1000)).toLocaleString()} queries/sec`);
  console.log(`  (paper: 0.0013s for PQ=239s, RabitQ=2267s at d=1536)`);

  results.search = {
    queries: queries.length, pool: quantized.length,
    totalMs: searchMs, perQueryMs: searchMs / queries.length,
    throughput: Math.round(queries.length / (searchMs / 1000)),
  };

  // ── 4. TurboContextCompressor Benchmark ────────────────────
  console.log('\n[4] TurboContextCompressor (Session Compression)');
  console.log('-'.repeat(50));

  const compressor = new TurboContextCompressor({});

  const sessionMessages = [];
  const intents = ['chat', 'error', 'system', 'user', 'tool', 'analysis', 'chat', 'chat'];
  const contents = [
    'Hello, how are you?',
    'Error: connection timeout after 30s',
    'System: Model switched to gpt-4',
    'I want to implement a new feature in my project',
    'Tool call: file.read(path="/src/main.js")',
    'Analyzing the performance bottlenecks in the system',
    'Can you explain how the routing algorithm works?',
    'Thank you, that makes sense!',
  ];

  for (let i = 0; i < 40; i++) {
    sessionMessages.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: contents[i % contents.length] + ` (message ${i + 1})`,
      tokens: 30 + Math.floor(Math.random() * 50),
    });
  }

  const totalTokens = sessionMessages.reduce((s, m) => s + m.tokens, 0);
  console.log(`  Session messages:   ${sessionMessages.length}`);
  console.log(`  Total tokens:       ${totalTokens}`);

  const t3 = Date.now();
  const compressedResult = await compressor.compress(sessionMessages, Math.floor(totalTokens * 0.25));
  const compressMs = Date.now() - t3;

  const tokenReduction = (1 - compressedResult.compressedTokens / totalTokens) * 100;

  console.log(`  Compressed to:      ${compressedResult.messages.length} messages (${compressedResult.compressedTokens} tokens)`);
  console.log(`  Token reduction:     ${tokenReduction.toFixed(1)}%`);
  console.log(`  Compression time:    ${compressMs}ms`);

  results.contextCompressor = {
    originalMessages: sessionMessages.length, originalTokens: totalTokens,
    compressedMessages: compressedResult.messages.length, compressedTokens: compressedResult.compressedTokens,
    tokenReductionPct: tokenReduction, compressMs,
  };

  // ── 5. KV Cache Memory Estimates ────────────────────────────
  console.log('\n[5] KV Cache Memory Estimates (Llama-3.1-8B)');
  console.log('-'.repeat(50));

  const modelConfigs = [
    { label: '3.5-bit uniform', bits: 3.5, outlier: false },
    { label: '2.5-bit outlier', bits: 3.5, outlier: true },
  ];

  for (const cfg of modelConfigs) {
    for (const sl of [1024, 4096, 16384]) {
      const est = estimateKVCacheMemory(sl, {
        numLayers: 32, numHeads: 32, headDim: 128,
        bitsPerChannel: cfg.bits, useOutlierSplit: cfg.outlier,
      });
      console.log(`  ${cfg.label} @ seq=${sl}: ${est.original_mb}MB -> ${est.compressed_mb}MB (${est.ratio}x)`);
    }
  }

  // ── 6. Token Savings Summary ────────────────────────────────
  console.log('\n[6] Token Savings Summary (3.5-bit TurboQuant)');
  console.log('-'.repeat(50));

  const compressedSessionTokens = compressedResult.compressedTokens;
  const savingsPerSession = totalTokens - compressedSessionTokens;
  const dailySessions = 200;
  const gpt4CostPerM = 30;

  console.log(`  Original:           ${totalTokens} tokens/session`);
  console.log(`  Compressed:         ${compressedSessionTokens} tokens/session`);
  console.log(`  Savings/session:   ${savingsPerSession} tokens`);
  console.log(`  Daily sessions:    ${dailySessions}`);
  console.log(`  Monthly savings:    ${(savingsPerSession * dailySessions * 30 / 1e6).toFixed(1)}M tokens`);
  console.log(`  Monthly cost (GPT-4 $30/1M): $${(savingsPerSession * dailySessions * 30 / 1e6 * gpt4CostPerM).toFixed(2)}`);

  results.tokenSavings = {
    originalTokensPerSession: totalTokens,
    compressedTokensPerSession: compressedSessionTokens,
    savingsPerSession,
    monthlySavingsM: (savingsPerSession * dailySessions * 30 / 1e6).toFixed(1),
    monthlyCostSavings: (savingsPerSession * dailySessions * 30 / 1e6 * gpt4CostPerM).toFixed(2),
  };

  // ── Summary ──────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('  BENCHMARK SUMMARY');
  console.log('='.repeat(60));
  console.log(`  TurboQuant Lloyd-Max compression:  ${ratio.toFixed(1)}:1  (paper: ~9:1 @ 3.5-bit)`);
  console.log(`  Embed throughput:                  ${results.quantizer.throughput.toLocaleString()} vecs/sec`);
  console.log(`  Avg cosine similarity:              ${avgSim.toFixed(4)}`);
  console.log(`  ANN search:                         ${results.search.perQueryMs.toFixed(3)}ms/query`);
  console.log(`  Context token reduction:             ${tokenReduction.toFixed(1)}%`);
  console.log(`  Monthly cost savings (GPT-4):      $${results.tokenSavings.monthlyCostSavings}`);
  console.log('='.repeat(60));

  return results;
}

run().catch(console.error);
