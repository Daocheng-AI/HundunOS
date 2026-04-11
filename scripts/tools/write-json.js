// HundunOS Tool: Write JSON
// Writes data to a JSON file

export default {
    name: 'write-json',
    description: '写入JSON文件',
    category: 'file',
    timeout: 3000,
    
    async execute(params, context) {
        const { path, data, pretty = true } = params;
        if (!path || data === undefined) throw new Error('Path and data required');
        
        const { writeFileSync } = await import('fs');
        const { resolve } = await import('path');
        
        const targetPath = resolve(path);
        const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
        
        writeFileSync(targetPath, content, 'utf8');
        
        return {
            success: true,
            path: targetPath,
            bytes: Buffer.byteLength(content, 'utf8')
        };
    }
};