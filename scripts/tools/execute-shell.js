// HundunOS Tool: Execute Shell Command
// Safely executes shell commands with timeout

export default {
    name: 'execute-shell',
    description: '执行Shell命令',
    category: 'system',
    timeout: 30000,
    
    async execute(params, context) {
        const { command, timeout = 10000 } = params;
        if (!command) throw new Error('Command required');
        
        // 安全检查：禁止危险命令
        const dangerous = ['rm -rf', 'del /s', 'format', 'mkfs', 'dd if=', '> /dev/'];
        if (dangerous.some(d => command.includes(d))) {
            throw new Error('Dangerous command blocked');
        }
        
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        try {
            const { stdout, stderr } = await execAsync(command, {
                timeout,
                maxBuffer: 1024 * 1024 // 1MB
            });
            
            return {
                success: true,
                stdout: stdout.slice(0, 10000), // 限制输出
                stderr: stderr.slice(0, 1000)
            };
        } catch (e) {
            return {
                success: false,
                error: e.message,
                code: e.code
            };
        }
    }
};