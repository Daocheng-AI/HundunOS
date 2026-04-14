// kernel/skills/platform-bridge.js
// HundunOS v3.9 — 跨平台 Skill 分发桥接层
// 移植自 PromptHub skill-installer-platform.ts，适配 HundunOS 架构
//
// 职责：
//   - 定义支持的 AI 平台（Claude Code、Cursor、OpenClaw 等）
//   - 跨平台路径解析
//   - Skill 安装/卸载到目标平台
//   - MCP config 读写
//   - Symlink 模式：一处写入，多平台自动同步

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, lstatSync, symlinkSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { homedir, platform } from 'node:os';

// ================================================================
// 平台定义
// ================================================================

/**
 * @typedef {Object} SkillPlatform
 * @property {string} id - Platform identifier (e.g., 'claude', 'cursor')
 * @property {string} name - Display name
 * @property {string} type - 'mcp' | 'skill-md' | 'custom'
 * @property {string} [configPath] - Path to config file (for MCP platforms)
 * @property {string} skillsDir - Path to skills directory
 * @property {string} [configKey] - Key in config file (e.g., 'mcpServers')
 */

/**
 * Supported AI platforms
 * 每个平台定义其配置文件路径和 skills 目录
 */
export const SKILL_PLATFORMS = [
    {
        id: 'claude',
        name: 'Claude Code',
        type: 'skill-md',
        skillsDir: () => join(homedir(), '.claude', 'skills'),
        configPath: () => {
            switch (platform()) {
                case 'darwin':
                    return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
                case 'win32':
                    return join(homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
                default:
                    return join(homedir(), '.config', 'claude', 'claude_desktop_config.json');
            }
        },
        configKey: 'mcpServers',
    },
    {
        id: 'claude-desktop',
        name: 'Claude Desktop',
        type: 'mcp',
        skillsDir: () => join(homedir(), '.claude-desktop', 'skills'),
        configPath: () => {
            switch (platform()) {
                case 'darwin':
                    return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
                case 'win32':
                    return join(homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
                default:
                    return join(homedir(), '.config', 'claude', 'claude_desktop_config.json');
            }
        },
        configKey: 'mcpServers',
    },
    {
        id: 'cursor',
        name: 'Cursor',
        type: 'mcp',
        skillsDir: () => join(homedir(), '.cursor', 'skills'),
        configPath: () => join(homedir(), '.cursor', 'mcp.json'),
        configKey: 'mcpServers',
    },
    {
        id: 'windsurf',
        name: 'Windsurf',
        type: 'mcp',
        skillsDir: () => join(homedir(), '.windsurf', 'skills'),
        configPath: () => join(homedir(), '.windsurf', 'mcp.json'),
        configKey: 'mcpServers',
    },
    {
        id: 'openclaw',
        name: 'OpenClaw',
        type: 'skill-md',
        skillsDir: () => join(homedir(), '.openclaw', 'skills'),
        configPath: null,
    },
    {
        id: 'hundunos',
        name: 'HundunOS',
        type: 'skill-md',
        skillsDir: () => join(homedir(), '.hundunos', 'skills'),
        configPath: null,
    },
];

// ================================================================
// 路径解析工具
// ================================================================

/**
 * 获取平台的 skills 目录路径
 * @param {string|SkillPlatform} platform - Platform ID or platform object
 * @returns {string|null}
 */
export function getPlatformSkillsDir(platform) {
    const p = typeof platform === 'string' 
        ? SKILL_PLATFORMS.find(pp => pp.id === platform)
        : platform;
    if (!p) return null;
    return typeof p.skillsDir === 'function' ? p.skillsDir() : p.skillsDir;
}

/**
 * 获取平台的配置文件路径
 * @param {string|SkillPlatform} platform - Platform ID or platform object
 * @returns {string|null}
 */
export function getPlatformConfigPath(platform) {
    const p = typeof platform === 'string'
        ? SKILL_PLATFORMS.find(pp => pp.id === platform)
        : platform;
    if (!p || !p.configPath) return null;
    return typeof p.configPath === 'function' ? p.configPath() : p.configPath;
}

/**
 * 获取平台定义
 * @param {string} platformId
 * @returns {SkillPlatform|undefined}
 */
export function getPlatform(platformId) {
    return SKILL_PLATFORMS.find(p => p.id === platformId);
}

/**
 * 获取所有支持的平台列表
 * @returns {SkillPlatform[]}
 */
export function getSupportedPlatforms() {
    return [...SKILL_PLATFORMS];
}

/**
 * 检测已安装的平台
 * @returns {string[]} 已安装平台的 ID 列表
 */
export function detectInstalledPlatforms() {
    const installed = [];
    
    for (const p of SKILL_PLATFORMS) {
        const skillsDir = getPlatformSkillsDir(p);
        const parentDir = dirname(skillsDir);
        
        // Check if the parent directory exists
        if (existsSync(parentDir)) {
            installed.push(p.id);
        }
    }
    
    return installed;
}

// ================================================================
// Config 文件锁（防止并发写入）
// ================================================================

/**
 * Per-path mutex to prevent concurrent config file read-modify-write races.
 * @type {Map<string, Promise<void>>}
 */
const configLocks = new Map();

/**
 * 带锁执行 config 文件操作
 * @param {string} configPath
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
async function withConfigLock(configPath, fn) {
    // Wait for any pending operation on this config file
    const pending = configLocks.get(configPath) ?? Promise.resolve();
    let release;
    const lock = new Promise((resolve) => {
        release = resolve;
    });
    configLocks.set(configPath, lock);
    await pending;
    try {
        return await fn();
    } finally {
        release();
        if (configLocks.get(configPath) === lock) {
            configLocks.delete(configPath);
        }
    }
}

// ================================================================
// MCP 平台安装/卸载
// ================================================================

/**
 * 验证 MCP config 结构
 * @param {unknown} mcpConfig
 * @param {string} name
 * @throws {Error} 如果验证失败
 */
export function validateMCPConfig(mcpConfig, name) {
    if (!mcpConfig || typeof mcpConfig !== 'object') {
        throw new Error('MCP config must be an object');
    }
    
    const config = /** @type {Record<string, unknown>} */ (mcpConfig);
    
    // Check for servers key
    if (config.servers && typeof config.servers === 'object') {
        const servers = /** @type {Record<string, unknown>} */ (config.servers);
        if (Object.keys(servers).length !== 1 || !servers[name]) {
            throw new Error('MCP config.servers must contain exactly one entry matching the skill name');
        }
        return;
    }
    
    // Otherwise, assume it's a direct server config
    if (!config.command && !config.url) {
        throw new Error('MCP config must have either command or url');
    }
}

/**
 * 安装 Skill 到 MCP 平台（Claude Desktop、Cursor 等）
 * @param {string} platformId - 'claude-desktop' | 'cursor' | 'windsurf'
 * @param {string} name - Skill name
 * @param {object} mcpConfig - MCP server configuration
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function installToPlatform(platformId, name, mcpConfig) {
    const p = getPlatform(platformId);
    if (!p) {
        return { success: false, error: `Unknown platform: ${platformId}` };
    }
    
    if (p.type !== 'mcp') {
        return { success: false, error: `Platform ${platformId} does not support MCP installation` };
    }
    
    const configPath = getPlatformConfigPath(p);
    if (!configPath) {
        return { success: false, error: `Platform ${platformId} has no config path` };
    }
    
    // Runtime validation of MCP config structure
    try {
        validateMCPConfig(mcpConfig, name);
    } catch (e) {
        return { success: false, error: e.message };
    }
    
    return withConfigLock(configPath, async () => {
        try {
            // Ensure config file exists
            if (!existsSync(configPath)) {
                const dir = dirname(configPath);
                mkdirSync(dir, { recursive: true });
                const initialConfig = { mcpServers: {} };
                writeFileSync(configPath, JSON.stringify(initialConfig, null, 2));
            }
            
            // Read current config
            const content = readFileSync(configPath, 'utf-8');
            const config = JSON.parse(content);
            
            // Handle different key variations
            const serversKey = config.mcpServers
                ? 'mcpServers'
                : config.mcp_servers
                    ? 'mcp_servers'
                    : 'servers';
            
            // Initialize servers object if missing
            if (!config[serversKey]) {
                config[serversKey] = {};
            }
            
            // Backup existing config
            writeFileSync(`${configPath}.bak`, content);
            
            // Merge config
            const configObj = /** @type {Record<string, unknown>} */ (mcpConfig);
            const sourceServers = configObj.servers && typeof configObj.servers === 'object'
                ? /** @type {Record<string, unknown>} */ (configObj.servers)
                : { [name]: mcpConfig };
            
            const sourceServerEntries = Object.entries(sourceServers);
            if (sourceServerEntries.length !== 1 || sourceServerEntries[0][0] !== name) {
                return { success: false, error: 'MCP config must contain exactly one server entry matching the skill name' };
            }
            
            config[serversKey][name] = sourceServerEntries[0][1];
            
            // Write updated config
            writeFileSync(configPath, JSON.stringify(config, null, 2));
            
            // console.log(`[PlatformBridge] Installed skill "${name}" to ${p.name}`);
            return { success: true };
        } catch (error) {
            console.error(`[PlatformBridge] Failed to install to ${p.name}:`, error);
            return { success: false, error: error.message };
        }
    });
}

/**
 * 从 MCP 平台卸载 Skill
 * @param {string} platformId
 * @param {string} name
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function uninstallFromPlatform(platformId, name) {
    const p = getPlatform(platformId);
    if (!p) {
        return { success: false, error: `Unknown platform: ${platformId}` };
    }
    
    const configPath = getPlatformConfigPath(p);
    if (!configPath) {
        return { success: false, error: `Platform ${platformId} has no config path` };
    }
    
    return withConfigLock(configPath, async () => {
        if (!existsSync(configPath)) {
            return { success: true }; // Nothing to uninstall
        }
        
        try {
            const content = readFileSync(configPath, 'utf-8');
            const config = JSON.parse(content);
            
            const serversKey = config.mcpServers
                ? 'mcpServers'
                : config.mcp_servers
                    ? 'mcp_servers'
                    : 'servers';
            
            if (config[serversKey] && config[serversKey][name]) {
                delete config[serversKey][name];
                writeFileSync(configPath, JSON.stringify(config, null, 2));
                // console.log(`[PlatformBridge] Uninstalled skill "${name}" from ${p.name}`);
            }
            
            return { success: true };
        } catch (error) {
            console.error(`[PlatformBridge] Failed to uninstall from ${p.name}:`, error);
            return { success: false, error: error.message };
        }
    });
}

// ================================================================
// SKILL.md 多平台分发
// ================================================================

/**
 * 安装 SKILL.md 到指定平台
 * @param {string} skillName
 * @param {string} skillMdContent
 * @param {string} platformId
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function installSkillMd(skillName, skillMdContent, platformId) {
    const p = getPlatform(platformId);
    if (!p) {
        return { success: false, error: `Unknown platform: ${platformId}` };
    }
    
    const skillsDir = getPlatformSkillsDir(p);
    const skillDir = join(skillsDir, skillName);
    
    try {
        // Create skill directory
        mkdirSync(skillDir, { recursive: true });
        
        // Write SKILL.md file
        writeFileSync(join(skillDir, 'SKILL.md'), skillMdContent, 'utf-8');
        
        // console.log(`[PlatformBridge] Installed SKILL.md for "${skillName}" to ${p.name}`);
        return { success: true };
    } catch (error) {
        console.error(`[PlatformBridge] Failed to install SKILL.md to ${p.name}:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * 从指定平台卸载 SKILL.md
 * @param {string} skillName
 * @param {string} platformId
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function uninstallSkillMd(skillName, platformId) {
    const p = getPlatform(platformId);
    if (!p) {
        return { success: false, error: `Unknown platform: ${platformId}` };
    }
    
    const skillsDir = getPlatformSkillsDir(p);
    const skillDir = join(skillsDir, skillName);
    
    try {
        if (existsSync(skillDir)) {
            rmSync(skillDir, { recursive: true, force: true });
            // console.log(`[PlatformBridge] Uninstalled SKILL.md for "${skillName}" from ${p.name}`);
        }
        return { success: true };
    } catch (error) {
        console.error(`[PlatformBridge] Failed to uninstall SKILL.md from ${p.name}:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * 通过符号链接安装 SKILL.md（一处更新，多平台同步）
 * @param {string} skillName
 * @param {string} skillMdContent
 * @param {string} platformId
 * @param {string} canonicalDir - 源目录（HundunOS skills 目录）
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function installSkillMdSymlink(skillName, skillMdContent, platformId, canonicalDir) {
    const p = getPlatform(platformId);
    if (!p) {
        return { success: false, error: `Unknown platform: ${platformId}` };
    }
    
    // 1. Write the canonical copy into HundunOS skills dir
    const sourceDir = canonicalDir 
        ? join(canonicalDir, skillName)
        : join(homedir(), '.hundunos', 'skills', skillName);
    
    try {
        mkdirSync(sourceDir, { recursive: true });
        writeFileSync(join(sourceDir, 'SKILL.md'), skillMdContent, 'utf-8');
    } catch (error) {
        return { success: false, error: `Failed to create canonical copy: ${error.message}` };
    }
    
    // 2. Create a symlink from the platform dir → canonical dir
    const platformSkillsDir = getPlatformSkillsDir(p);
    const platformSkillDir = join(platformSkillsDir, skillName);
    
    try {
        // Ensure parent exists
        mkdirSync(platformSkillsDir, { recursive: true });
        
        // Remove existing target if present (file, dir, or broken symlink)
        if (existsSync(platformSkillDir) || lstatSync(platformSkillDir).isSymbolicLink?.()) {
            rmSync(platformSkillDir, { recursive: true, force: true });
        }
        
        // Create directory symlink
        // Note: On Windows, creating directory symlinks may require admin privileges
        // Junction points work without admin and are sufficient for this use case
        if (platform() === 'win32') {
            // Use junction on Windows (doesn't require admin)
            const { symlinkSync: symlink } = await import('node:fs');
            symlink(sourceDir, platformSkillDir, 'junction');
        } else {
            symlinkSync(sourceDir, platformSkillDir, 'dir');
        }
        
        // console.log(`[PlatformBridge] Symlinked "${skillName}" → ${p.name}: ${sourceDir} → ${platformSkillDir}`);
        return { success: true };
    } catch (error) {
        console.error(`[PlatformBridge] Failed to create symlink for "${skillName}" to ${p.name}:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * 获取 SKILL.md 在各平台的安装状态
 * @param {string} skillName
 * @returns {Record<string, boolean>}
 */
export function getSkillMdInstallStatus(skillName) {
    const status = {};
    
    for (const p of SKILL_PLATFORMS) {
        const skillsDir = getPlatformSkillsDir(p);
        const skillMdPath = join(skillsDir, skillName, 'SKILL.md');
        status[p.id] = existsSync(skillMdPath);
    }
    
    return status;
}

/**
 * 获取 Skill 在 MCP 平台的安装状态
 * @param {string} skillName
 * @returns {Record<string, boolean>}
 */
export function getMCPInstallStatus(skillName) {
    const status = {};
    
    for (const p of SKILL_PLATFORMS) {
        if (p.type !== 'mcp') continue;
        
        const configPath = getPlatformConfigPath(p);
        if (!configPath || !existsSync(configPath)) {
            status[p.id] = false;
            continue;
        }
        
        try {
            const content = readFileSync(configPath, 'utf-8');
            const config = JSON.parse(content);
            const serversKey = config.mcpServers
                ? 'mcpServers'
                : config.mcp_servers
                    ? 'mcp_servers'
                    : 'servers';
            status[p.id] = !!(config[serversKey] && config[serversKey][skillName]);
        } catch {
            status[p.id] = false;
        }
    }
    
    return status;
}

// ================================================================
// 批量安装
// ================================================================

/**
 * 安装 Skill 到多个平台
 * @param {string} skillName
 * @param {string} skillMdContent
 * @param {string[]} platformIds
 * @param {object} options
 * @param {boolean} [options.useSymlink=false]
 * @param {string} [options.canonicalDir]
 * @returns {Promise<Record<string, {success: boolean, error?: string}>>}
 */
export async function installToMultiplePlatforms(skillName, skillMdContent, platformIds, options = {}) {
    const results = {};
    
    for (const platformId of platformIds) {
        const p = getPlatform(platformId);
        if (!p) {
            results[platformId] = { success: false, error: `Unknown platform: ${platformId}` };
            continue;
        }
        
        if (options.useSymlink && p.type === 'skill-md') {
            results[platformId] = await installSkillMdSymlink(
                skillName,
                skillMdContent,
                platformId,
                options.canonicalDir
            );
        } else if (p.type === 'skill-md') {
            results[platformId] = await installSkillMd(skillName, skillMdContent, platformId);
        } else {
            results[platformId] = { success: false, error: `Platform ${platformId} requires MCP config, not SKILL.md` };
        }
    }
    
    return results;
}

export default {
    SKILL_PLATFORMS,
    getPlatformSkillsDir,
    getPlatformConfigPath,
    getPlatform,
    getSupportedPlatforms,
    detectInstalledPlatforms,
    validateMCPConfig,
    installToPlatform,
    uninstallFromPlatform,
    installSkillMd,
    uninstallSkillMd,
    installSkillMdSymlink,
    getSkillMdInstallStatus,
    getMCPInstallStatus,
    installToMultiplePlatforms,
};
