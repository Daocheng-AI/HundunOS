// HundunOS Tool: Clear Cache
// Clears system cache and temporary data

export default {
    name: 'clear-cache',
    description: '清理系统缓存',
    category: 'maintenance',
    timeout: 10000,
    
    async execute(params, context) {
        const { scope = 'all' } = params;
        const results = {
            timestamp: new Date().toISOString(),
            cleared: []
        };

        // Clear memory cache (if context has storage)
        if (context.storage && context.storage.cache) {
            const before = context.storage.cache.size;
            context.storage.cache.clear();
            results.cleared.push({ type: 'memory-cache', items: before });
        }

        // Clear temp files (if fs available)
        try {
            const { readdirSync, unlinkSync, statSync } = await import('fs');
            const { tmpdir } = await import('os');
            const tmpPath = tmpdir();
            const files = readdirSync(tmpPath).filter(f => f.startsWith('hundunos-'));
            
            let clearedFiles = 0;
            for (const file of files) {
                try {
                    unlinkSync(`${tmpPath}/${file}`);
                    clearedFiles++;
                } catch (e) {
                    // Ignore locked files
                }
            }
            if (clearedFiles > 0) {
                results.cleared.push({ type: 'temp-files', items: clearedFiles });
            }
        } catch (e) {
            // Skip if no temp files
        }

        results.success = results.cleared.length > 0;
        return results;
    }
};