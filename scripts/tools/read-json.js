// HundunOS Tool: Read JSON
// Reads and parses a JSON file

export default {
    name: 'read-json',
    description: '读取JSON文件',
    category: 'file',
    timeout: 3000,
    
    async execute(params, context) {
        const { path } = params;
        if (!path) throw new Error('Path required');
        
        const { readFileSync } = await import('fs');
        const { resolve } = await import('path');
        
        const targetPath = resolve(path);
        const content = readFileSync(targetPath, 'utf8');
        
        return {
            path: targetPath,
            data: JSON.parse(content)
        };
    }
};