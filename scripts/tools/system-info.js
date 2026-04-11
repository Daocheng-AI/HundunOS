// HundunOS Tool: System Information
// Returns detailed system and environment information

export default {
    name: 'system-info',
    description: '获取系统信息',
    category: 'system',
    timeout: 3000,
    
    async execute(params, context) {
        const os = await import('os');
        
        return {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            hostname: os.hostname(),
            cpus: {
                count: os.cpus().length,
                model: os.cpus()[0]?.model || 'unknown'
            },
            memory: {
                total: Math.round(os.totalmem() / 1024 / 1024 / 1024) + 'GB',
                free: Math.round(os.freemem() / 1024 / 1024 / 1024) + 'GB'
            },
            uptime: {
                system: Math.round(os.uptime() / 3600) + ' hours',
                process: Math.round(process.uptime()) + ' seconds'
            },
            env: {
                nodeEnv: process.env.NODE_ENV || 'development',
                hundunEnv: process.env.HUNDUNOS_ENV || 'default'
            }
        };
    }
};
