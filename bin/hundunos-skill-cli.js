#!/usr/bin/env node
// hundunos-skill-cli.js
// HundunOS v3.9 — Skill 命令行工具
// 
// 用法：
//   hundunos-skill install <url>
//   hundunos-skill publish <name>
//   hundunos-skill list [--platform claude]
//   hundunos-skill validate ./my-skill

import { join, resolve } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';

// ================================================================
// CLI 入口
// ================================================================

const args = process.argv.slice(2);
const command = args[0];
const params = args.slice(1);

// 动态导入模块
async function loadModules() {
    const skillValidator = await import('../kernel/skills/skill-validator.js');
    const platformBridge = await import('../kernel/skills/platform-bridge.js');
    const skillRemote = await import('../kernel/skills/skill-remote.js');
    const skillRepo = await import('../kernel/skills/skill-repo.js').then(m => new m.SkillRepo());
    const skillVersion = await import('../kernel/skills/skill-version.js');
    
    return { skillValidator, platformBridge, skillRemote, skillRepo, skillVersion };
}

// ================================================================
// 命令处理
// ================================================================

async function main() {
    const modules = await loadModules();
    
    switch (command) {
        case 'install':
            await handleInstall(modules, params);
            break;
        case 'publish':
            await handlePublish(modules, params);
            break;
        case 'list':
            await handleList(modules, params);
            break;
        case 'validate':
            await handleValidate(modules, params);
            break;
        case 'version':
            await handleVersion(modules, params);
            break;
        case 'platform':
            await handlePlatform(modules, params);
            break;
        case 'help':
        case '--help':
        case '-h':
            printHelp();
            break;
        default:
            console.error(`Unknown command: ${command}`);
            printHelp();
            process.exit(1);
    }
}

// ================================================================
// install 命令
// ================================================================

async function handleInstall(modules, params) {
    const url = params[0];
    
    if (!url) {
        console.error('Usage: hundunos-skill install <url>');
        console.error('  url: YAML file URL, GitHub reference (github:user/repo/path), or Gist URL');
        process.exit(1);
    }
    
    console.log(`Installing skill from: ${url}`);
    
    let result;
    
    if (url.startsWith('github:')) {
        result = await modules.skillRemote.installFromGitHubRef(url, {
            register: (spec) => modules.skillRepo.create(spec.name, spec),
        });
    } else if (url.includes('gist.github.com')) {
        result = await modules.skillRemote.installFromGist(url, {
            register: (spec) => modules.skillRepo.create(spec.name, spec),
        });
    } else {
        result = await modules.skillRemote.installFromUrl(url, {
            register: (spec) => modules.skillRepo.create(spec.name, spec),
        });
    }
    
    if (result.success) {
        console.log(`✅ Installed: ${result.spec.name} v${result.spec.version}`);
        console.log(`   Description: ${result.spec.description || '(none)'}`);
    } else {
        console.error(`❌ Failed: ${result.error}`);
        process.exit(1);
    }
}

// ================================================================
// publish 命令
// ================================================================

async function handlePublish(modules, params) {
    const skillName = params[0];
    const platform = params[1] || 'openclaw';
    
    if (!skillName) {
        console.error('Usage: hundunos-skill publish <skill-name> [platform]');
        console.error('  platform: claude, cursor, openclaw, hundunos (default: openclaw)');
        process.exit(1);
    }
    
    // 读取 Skill
    const readResult = modules.skillRepo.read(skillName);
    
    if (!readResult.success) {
        console.error(`❌ Skill not found: ${skillName}`);
        process.exit(1);
    }
    
    // 生成 SKILL.md
    const spec = readResult.spec;
    const skillMd = `---
name: ${spec.name}
version: ${spec.version || '1.0.0'}
description: ${spec.description || ''}
${spec.tags?.length ? `tags: [${spec.tags.join(', ')}]` : ''}
---

${spec.system_prompt || spec.body || ''}
`;
    
    // 安装到平台
    const result = await modules.platformBridge.installSkillMd(skillName, skillMd, platform);
    
    if (result.success) {
        console.log(`✅ Published ${skillName} to ${platform}`);
    } else {
        console.error(`❌ Failed: ${result.error}`);
        process.exit(1);
    }
}

// ================================================================
// list 命令
// ================================================================

async function handleList(modules, params) {
    const platformIndex = params.indexOf('--platform');
    const platform = platformIndex >= 0 ? params[platformIndex + 1] : null;
    
    if (platform) {
        // 列出平台上的 Skill
        const platformInfo = modules.platformBridge.getPlatform(platform);
        
        if (!platformInfo) {
            console.error(`Unknown platform: ${platform}`);
            console.error('Supported: claude, claude-desktop, cursor, windsurf, openclaw, hundunos');
            process.exit(1);
        }
        
        const skillsDir = modules.platformBridge.getPlatformSkillsDir(platform);
        console.log(`Skills in ${platformInfo.name} (${skillsDir}):\n`);
        
        if (existsSync(skillsDir)) {
            const entries = require('fs').readdirSync(skillsDir, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const skillMdPath = join(skillsDir, entry.name, 'SKILL.md');
                    if (existsSync(skillMdPath)) {
                        const content = readFileSync(skillMdPath, 'utf-8');
                        const parsed = modules.skillValidator.parseSkillMd(content);
                        console.log(`  ${entry.name} v${parsed.frontmatter.version || '?''} - ${parsed.frontmatter.description || '(no description)'}`);
                    } else {
                        console.log(`  ${entry.name} (no SKILL.md)`);
                    }
                }
            }
        } else {
            console.log('  (directory not found)');
        }
    } else {
        // 列出本地仓库的 Skill
        const skills = modules.skillRepo.list();
        
        console.log(`Local skills (${modules.skillRepo.repoDir}):\n`);
        
        if (skills.length === 0) {
            console.log('  (no skills)');
        } else {
            for (const skill of skills) {
                console.log(`  ${skill.name} v${skill.metadata.version || '?'} - ${skill.metadata.description || '(no description)'}`);
            }
        }
    }
}

// ================================================================
// validate 命令
// ================================================================

async function handleValidate(modules, params) {
    const skillPath = params[0];
    
    if (!skillPath) {
        console.error('Usage: hundunos-skill validate <path>');
        console.error('  path: Skill directory or SKILL.md file');
        process.exit(1);
    }
    
    const resolvedPath = resolve(skillPath);
    
    if (!existsSync(resolvedPath)) {
        console.error(`❌ Path not found: ${resolvedPath}`);
        process.exit(1);
    }
    
    const stat = require('fs').statSync(resolvedPath);
    
    if (stat.isDirectory()) {
        // 验证 Skill 文件夹
        console.log(`Validating skill package: ${resolvedPath}\n`);
        
        const result = await modules.skillValidator.validateSkillPackage(resolvedPath);
        
        if (result.valid) {
            console.log('✅ Valid skill package');
        } else {
            console.log('❌ Invalid skill package');
            result.errors.forEach(e => console.log(`  Error: ${e}`));
        }
        
        if (result.warnings.length > 0) {
            console.log('\nWarnings:');
            result.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
        }
    } else {
        // 验证 SKILL.md 文件
        console.log(`Validating SKILL.md: ${resolvedPath}\n`);
        
        const content = readFileSync(resolvedPath, 'utf-8');
        const dirName = require('path').basename(require('path').dirname(resolvedPath));
        const result = modules.skillValidator.validateSkillMd(content, dirName);
        
        if (result.valid) {
            console.log('✅ Valid SKILL.md');
        } else {
            console.log('❌ Invalid SKILL.md');
            result.errors.forEach(e => console.log(`  Error: ${e}`));
        }
        
        if (result.warnings.length > 0) {
            console.log('\nWarnings:');
            result.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
        }
    }
}

// ================================================================
// version 命令
// ================================================================

async function handleVersion(modules, params) {
    const skillName = params[0];
    const action = params[1];
    
    if (!skillName) {
        console.error('Usage: hundunos-skill version <skill-name> [patch|minor|major]');
        process.exit(1);
    }
    
    const versionManager = new modules.skillVersion.SkillVersionManager();
    const versions = versionManager.listVersions(skillName);
    
    if (!action) {
        // 显示版本历史
        console.log(`Versions for ${skillName}:\n`);
        
        if (versions.length === 0) {
            console.log('  (no versions)');
        } else {
            for (const v of versions) {
                const date = new Date(v.createdAt).toLocaleString();
                console.log(`  ${v.version} - ${date}${v.message ? ` - ${v.message}` : ''}`);
            }
        }
    } else if (['patch', 'minor', 'major'].includes(action)) {
        // 增加版本
        const latest = versions[0]?.version || '0.0.0';
        const newVersion = modules.skillVersion.incrementVersion(latest, action);
        
        console.log(`Version bump: ${latest} → ${newVersion}`);
        
        // 创建快照
        const skillPath = join(modules.skillRepo.repoDir, skillName);
        const result = versionManager.createSnapshot(skillName, skillPath, { version: newVersion });
        
        if (result.success) {
            console.log(`✅ Created version ${newVersion}`);
        } else {
            console.error(`❌ Failed: ${result.error}`);
        }
    } else {
        console.error('Invalid action. Use: patch, minor, or major');
        process.exit(1);
    }
}

// ================================================================
// platform 命令
// ================================================================

async function handlePlatform(modules, params) {
    const action = params[0];
    
    switch (action) {
        case 'list':
            console.log('Supported platforms:\n');
            const platforms = modules.platformBridge.getSupportedPlatforms();
            const installed = modules.platformBridge.detectInstalledPlatforms();
            
            for (const p of platforms) {
                const isInstalled = installed.includes(p.id);
                console.log(`  ${isInstalled ? '✅' : '⚪'} ${p.name} (${p.id}) - ${p.type}`);
            }
            break;
            
        case 'detect':
            console.log('Detected platforms:\n');
            const detected = modules.platformBridge.detectInstalledPlatforms();
            
            if (detected.length === 0) {
                console.log('  (none)');
            } else {
                for (const id of detected) {
                    const p = modules.platformBridge.getPlatform(id);
                    console.log(`  ✅ ${p.name} (${id})`);
                }
            }
            break;
            
        default:
            console.error('Usage: hundunos-skill platform <list|detect>');
            process.exit(1);
    }
}

// ================================================================
// 帮助
// ================================================================

function printHelp() {
    console.log(`
HundunOS Skill CLI v3.9

Usage: hundunos-skill <command> [options]

Commands:
  install <url>              Install a skill from URL, GitHub, or Gist
  publish <name> [platform]  Publish a skill to a platform
  list [--platform <id>]     List skills (local or on a platform)
  validate <path>            Validate a skill package or SKILL.md
  version <name> [action]    Manage skill versions
  platform <list|detect>     List or detect supported platforms
  help                       Show this help

Examples:
  hundunos-skill install https://example.com/my-skill.yaml
  hundunos-skill install github:user/repo/skills/my-skill
  hundunos-skill publish my-skill claude
  hundunos-skill list --platform cursor
  hundunos-skill validate ./my-skill
  hundunos-skill version my-skill patch
  hundunos-skill platform list

Platforms:
  claude         Claude Code (~/.claude/skills)
  claude-desktop Claude Desktop (MCP config)
  cursor         Cursor (~/.cursor/mcp.json)
  windsurf       Windsurf (~/.windsurf/mcp.json)
  openclaw       OpenClaw (~/.openclaw/skills)
  hundunos       HundunOS (~/.hundunos/skills)
`);
}

// ================================================================
// 运行
// ================================================================

main().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
