// HundunOS Tool: List Files
// Lists files in a directory with filtering

export default {
    name: 'list-files',
    description: '列出目录文件',
    category: 'file',
    timeout: 5000,
    
    async execute(params, context) {
        const { path = '.', pattern = '*', limit = 100 } = params;
        const { readdirSync, statSync } = await import('fs');
        const { join, resolve } = await import('path');
        
        const targetPath = resolve(path);
        const results = [];
        
        try {
            const files = readdirSync(targetPath);
            let count = 0;
            
            for (const file of files) {
                if (count >= limit) break;
                
                const filePath = join(targetPath, file);
                const stats = statSync(filePath);
                
                // Simple pattern matching
                if (pattern === '*' || file.includes(pattern.replace(/\*/g, ''))) {
                    results.push({
                        name: file,
                        size: Math.round(stats.size / 1024) + 'KB',
                        modified: stats.mtime.toISOString(),
                        isDirectory: stats.isDirectory()
                    });
                    count++;
                }
            }
            
            return { path: targetPath, count: results.length, files: results };
        } catch (e) {
            return { error: e.message, path: targetPath };
        }
    }
};