// diag-intent.js
async function main() {
    const { IntentVectorCache } = await import('file:///C:/Users/Lin/.qclaw/workspace/hundunos/kernel/intent-vector-cache.js');
    const mockKernel = {
        intentEngine: {
            classifiers: [
                { name: 'code_gen', patterns: ['code', 'function', 'implement', 'class'] },
                { name: 'analysis', patterns: ['analyze', 'data', 'metrics', 'report'] },
                { name: 'chat', patterns: ['hello', 'thanks', 'how', 'what'] },
            ],
        },
    };
    const cache = new IntentVectorCache(mockKernel, { embeddingDim: 384 });
    await cache.initialize();
    console.log('intentIndex size:', cache.intentIndex.size);
    console.log('intentPreloaded:', cache.stats.intentPreloaded);

    const queries = [
        'write a function in python',
        'hello there, how are you?',
        'analyze the data metrics',
    ];
    for (const q of queries) {
        const r = await cache.findBestIntent(q);
        console.log(`Query: "${q}" => intentName=${r?.intentName}, score=${r?.score}, fromCache=${r?.fromCache}`);
    }
}
main().catch(e => { console.error(e); process.exit(1); });
