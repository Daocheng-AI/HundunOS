// hundunos/kernel/skills/skill-market.js
// HundunOS v3.9 Phase 7 — Skill Market
// Remote Skill loader: install Skills from URL / GitHub Gist / Official Registry
// v3.9: 集成 PlatformBridge 跨平台分发

import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { 
    detectInstalledPlatforms,
    installSkillMd,
    installToMultiplePlatforms,
    getSkillMdInstallStatus,
    SKILL_PLATFORMS,
} from './platform-bridge.js';
import { sanitizeImportedSkillDraft } from './skill-validator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Built-in official Skill registry (no network required) */
const OFFICIAL_SKILLS = {
    'slack': {
        name: 'slack',
        version: '1.0.0',
        description: 'Slack messaging / channel management / Webhook integration',
        trigger: {
            patterns: ['slack', 'slack message', 'slack webhook', 'slack channel'],
            semantic: false,
        },
        tools: [
            {
                id: 'slack_send_message',
                type: 'http',
                endpoint: 'https://slack.com/api/chat.postMessage',
                method: 'POST',
                auth: 'env.SLACK_BOT_TOKEN',
                headers: { 'Content-Type': 'application/json' },
                body_template: '{ "channel": "{{channel}}", "text": "{{text}}" }',
            },
        ],
        system_prompt: 'You are a Slack assistant. Use Slack Web API (chat.postMessage) to send messages, prefer Incoming Webhooks.',
        execution: { isolation: 'process', timeout: 30000, retry: 2 },
        _source: 'official',
    },
    'notion': {
        name: 'notion',
        version: '1.0.0',
        description: 'Notion database / page management / content creation',
        trigger: {
            patterns: ['notion', 'notion page', 'notion database', 'notion api'],
            semantic: false,
        },
        tools: [
            {
                id: 'notion_create_page',
                type: 'http',
                endpoint: 'https://api.notion.com/v1/pages',
                method: 'POST',
                auth: 'env.NOTION_TOKEN',
                headers: { 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' },
                body_template: '{ "parent": { "database_id": "{{databaseId}}" }, "properties": { "title": { "title": [{ "text": { "content": "{{title}}" } }] } }',
            },
        ],
        system_prompt: 'You are a Notion assistant. Use the Notion API to manage pages and databases.',
        execution: { isolation: 'process', timeout: 30000, retry: 2 },
        _source: 'official',
    },
    'email': {
        name: 'email',
        version: '1.0.0',
        description: 'SMTP email sending (notifications / reports)',
        trigger: {
            patterns: ['email', 'send email', 'smtp', 'send mail'],
            semantic: false,
        },
        tools: [
            {
                id: 'email_send',
                type: 'function',
                function: 'sendEmail',
                params: {
                    to: { type: 'string', required: true, description: 'Recipient email address' },
                    subject: { type: 'string', required: true, description: 'Email subject' },
                    body: { type: 'string', required: true, description: 'Email body (supports HTML)' },
                },
            },
        ],
        system_prompt: 'You are an email assistant. Use the sendEmail tool when you need to send email notifications.',
        execution: { isolation: 'function', timeout: 15000, retry: 1 },
        _source: 'official',
    },
    'sentry': {
        name: 'sentry',
        version: '1.0.0',
        description: 'Sentry error tracking / Issue management',
        trigger: {
            patterns: ['sentry', 'error tracking', 'exception', 'bug tracking'],
            semantic: false,
        },
        tools: [
            {
                id: 'sentry_list_issues',
                type: 'http',
                endpoint: 'https://sentry.io/api/0/projects/',
                method: 'GET',
                auth: 'env.SENTRY_AUTH_TOKEN',
            },
        ],
        system_prompt: 'You are a Sentry assistant. Use the Sentry API to manage error tracking and Issues.',
        execution: { isolation: 'process', timeout: 20000, retry: 2 },
        _source: 'official',
    },
};

export class SkillMarket {
    /**
     * @param {SkillRegistry} registry
     */
    constructor(registry) {
        this.registry = registry;
        this.cache = new Map();           // name -> { spec, downloadedAt, version }
        this.installedRemotes = new Set(); // Skills installed from remote
        this.cacheDir = this._getCacheDir();
    }

    _getCacheDir() {
        const home = process.env.HOME || process.env.USERPROFILE || '.';
        const cacheDir = join(home, '.hundunos', 'skill-market-cache');
        if (!existsSync(cacheDir)) {
            try { mkdirSync(cacheDir, { recursive: true }); } catch (_) {}
        }
        return cacheDir;
    }

    // ================================================================
    // Official Skills (built-in, no network)
    // ================================================================

    /** List official Skills */
    list() {
        return Object.entries(OFFICIAL_SKILLS).map(([name, spec]) => ({
            name,
            version: spec.version,
            description: spec.description,
            source: spec._source,
            installed: this.registry.skills.has(name) || this.installedRemotes.has(name),
        }));
    }

    /** Install official Skill by name */
    installOfficial(name) {
        const spec = OFFICIAL_SKILLS[name];
        if (!spec) return { success: false, error: `Unknown official skill: ${name}` };

        this.registry.register(spec);
        this.cache.set(name, { spec, downloadedAt: Date.now(), version: spec.version, source: 'official' });
        this.installedRemotes.add(name);
        return { success: true, name, version: spec.version, source: 'official' };
    }

    // ================================================================
    // Remote loading (URL / GitHub Gist)
    // ================================================================

    /**
     * Install Skill from URL
     * @param {string} url - YAML/JSON Skill definition URL
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async install(url, options = {}) {
        if (!url) return { success: false, error: 'URL is required' };

        if (url.includes('gist.github.com')) {
            return this._installFromGist(url, options);
        }
        if (url.startsWith('github:')) {
            return this._installFromGitHubRef(url, options);
        }

        return this._installFromUrl(url, options);
    }

    async _installFromUrl(url, options = {}) {
        const timeout = options.timeout || 15000;
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(url, {
                signal: controller.signal,
                headers: { 'Accept': 'text/yaml, application/json, */*' },
            });
            clearTimeout(timer);

            if (!response.ok) {
                return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
            }

            const text = await response.text();
            return await this._installFromContent(text, url);
        } catch (e) {
            return { success: false, error: `Fetch failed: ${e.message}` };
        }
    }

    async _installFromGist(gistUrl, options = {}) {
        const match = gistUrl.match(/gist\.github\.com\/([^/]+)\/([a-f0-9]+)/i);
        if (!match) return { success: false, error: 'Invalid Gist URL' };

        const rawUrl = `https://gist.githubusercontent.com/${match[1]}/${match[2]}/raw`;
        return this._installFromUrl(rawUrl, options);
    }

    async _installFromGitHubRef(ref, options = {}) {
        const match = ref.match(/^github:([^/]+)\/([^@]+)@?(.+)?$/);
        if (!match) return { success: false, error: 'Invalid github: reference (use: github:user/repo/path@ref)' };

        const [_, user, repo, refAndPath = 'main'] = match;
        const [pathPart, gitRef = 'main'] = refAndPath.split(':');
        const rawUrl = `https://raw.githubusercontent.com/${user}/${repo}/${gitRef}/${pathPart}`;
        return this._installFromUrl(rawUrl, options);
    }

    /**
     * Install from raw content
     * @param {string} content - YAML or JSON text
     * @param {string} source - Source identifier
     */
    async _installFromContent(content, source) {
        let spec;
        try {
            const trimmed = content.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                spec = JSON.parse(content);
            } else {
                // Try yaml package first (hundunos already has it)
                try {
                    const YAML = await import('yaml');
                    spec = YAML.parse(content);
                } catch (_) {
                    // fallback: simple parser
                    spec = this._simpleYamlParse(content);
                }
            }
        } catch (e) {
            return { success: false, error: `Parse failed: ${e.message}` };
        }

        if (!spec?.name) {
            return { success: false, error: 'Skill must have a "name" field' };
        }

        this.registry.register(spec);
        this.cache.set(spec.name, {
            spec,
            downloadedAt: Date.now(),
            version: spec.version || '0.0.0',
            source,
        });
        this.installedRemotes.add(spec.name);

        return {
            success: true,
            name: spec.name,
            version: spec.version || '0.0.0',
            source,
            description: spec.description,
        };
    }

    /**
     * Simple YAML parser supporting key-value, nested objects, array items, and block scalars.
     * Uses path stack for objects; tracks activeArray separately to correctly add items and
     * handle nested content at the same indent level as the array item itself.
     */
    _simpleYamlParse(content) {
        const lines = content.split('\n');
        const root = {};
        // path: object stack for managing nesting depth
        const path = [{ obj: root, indent: -1 }];
        // activeArray: the array we are currently inside
        // activeArrayItem: the object item whose nested content we are processing
        // activeArrayItemIndent: indent of the '-' that created activeArrayItem
        let activeArray = null;
        let activeArrayItem = null;
        let activeArrayItemIndent = -1;

        const _finishArrayItem = (arr, item) => {
            arr.push(item);
            activeArray = arr;
            activeArrayItem = (item && typeof item === 'object' && !Array.isArray(item)) ? item : null;
            activeArrayItemIndent = -1;
            if (activeArrayItem) activeArrayItem._itemIndent = -1;
        };

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            const line = rawLine.replace(/^\t/, '  ');
            if (!line.trim() || line.trim().startsWith('#')) continue;

            const lineIndent = line.search(/\S/);
            const keyMatch = line.match(/^(\s*)([^:#]+):(\s*)(.*)$/);
            const isArrayItem = line.trimStart().startsWith('-') && lineIndent >= 0;

            // === Array item ===
            if (isArrayItem) {
                // Find owning array: activeArray > path top object properties > ancestors
                let arr = activeArray;
                if (!arr || !Array.isArray(arr)) {
                    for (let p = path.length - 1; p >= 0; p--) {
                        const top = path[p].obj;
                        if (Array.isArray(top)) { arr = top; break; }
                        const keys = Object.keys(top);
                        for (let k = keys.length - 1; k >= 0; k--) {
                            if (Array.isArray(top[keys[k]])) { arr = top[keys[k]]; break; }
                        }
                        if (arr) break;
                    }
                }
                if (!arr) continue;

                const itemContent = line.trimStart().slice(1).trim();

                if (itemContent.includes(':')) {
                    // Inline object item: "- id: tool1\n    type: http"
                    const mini = {};
                    // Also parse the key from the "- key: value" line itself
                    const km = itemContent.match(/^([^:#]+):(\s*)(.*)$/);
                    if (km) {
                        const [, k0, , v0] = km;
                        const kv0 = v0.trim();
                        if (kv0 === 'true' || kv0 === 'false') mini[k0.trim()] = kv0 === 'true';
                        else if (/^\d+(\.\d+)?$/.test(kv0)) mini[k0.trim()] = parseFloat(kv0);
                        else mini[k0.trim()] = kv0.replace(/^['"]|['"]$/g, '') || null;
                    }
                    // Collect nested key-value pairs (strictly greater indent)
                    let j = i + 1;
                    while (j < lines.length) {
                        const l2 = lines[j].replace(/^\t/, '  ');
                        if (!l2.trim()) { j++; continue; }
                        if (l2.search(/\S/) <= lineIndent) break;
                        const m2 = l2.match(/^(\s*)([^:#]+):(\s*)(.*)$/);
                        if (m2) {
                            const [, , k2, , v2] = m2;
                            const kv = v2.trim();
                            if (kv === 'true' || kv === 'false') mini[k2.trim()] = kv === 'true';
                            else if (/^\d+(\.\d+)?$/.test(kv)) mini[k2.trim()] = parseFloat(kv);
                            else mini[k2.trim()] = kv.replace(/^['"]|['"]$/g, '') || null;
                        }
                        j++;
                    }
                    _finishArrayItem(arr, mini);
                    activeArrayItemIndent = lineIndent;
                    if (activeArrayItem) activeArrayItem._itemIndent = lineIndent;
                    i = j - 1;
                } else if (itemContent) {
                    // Simple scalar: "- test"
                    arr.push(itemContent.replace(/^['"]|['"]$/g, ''));
                    activeArray = arr;
                    activeArrayItem = null;
                    activeArrayItemIndent = -1;
                } else {
                    // Empty "- " — peek for nested object
                    const inlineObj = {};
                    let j = i + 1;
                    while (j < lines.length) {
                        const nxt = lines[j].replace(/^\t/, '  ');
                        if (!nxt.trim()) { j++; continue; }
                        if (nxt.search(/\S/) <= lineIndent) break;
                        const nm = nxt.match(/^(\s*)([^:#]+):(\s*)(.*)$/);
                        if (nm) {
                            const [, , k2, , v2] = nm;
                            const kv = v2.trim();
                            if (kv === 'true' || kv === 'false') inlineObj[k2.trim()] = kv === 'true';
                            else if (/^\d+(\.\d+)?$/.test(kv)) inlineObj[k2.trim()] = parseFloat(kv);
                            else inlineObj[k2.trim()] = kv.replace(/^['"]|['"]$/g, '') || null;
                        }
                        j++;
                    }
                    const item = Object.keys(inlineObj).length ? inlineObj : null;
                    _finishArrayItem(arr, item);
                    activeArrayItemIndent = lineIndent;
                    if (activeArrayItem) activeArrayItem._itemIndent = lineIndent;
                    i = j - 1;
                }
                continue;
            }

            if (!keyMatch) continue;
            const [, rawIndent, rawKey, , rawVal] = keyMatch;
            const indent = rawIndent.length;
            const keyName = rawKey.trim();
            const val = rawVal.trim();

            // If we are processing nested content of an active array item at deeper indent:
            if (activeArrayItem && activeArrayItemIndent >= 0 && indent > activeArrayItemIndent) {
                path.push({ obj: activeArrayItem, indent: activeArrayItemIndent });
            } else {
            // Normal key or sibling: pop path by indentation
            // CRITICAL: save activeArrayItem before pop; restore if we're still inside the item's scope
            const savedItem = activeArrayItem;
            const savedIndent = activeArrayItemIndent;
            while (path.length > 1 && indent <= path[path.length - 1].indent) path.pop();
            const container = path[path.length - 1].obj;
            // If we popped due to sibling (indent == savedIndent), add to activeArrayItem instead
            if (savedItem && savedIndent >= 0 && indent === savedIndent) {
                savedItem[keyName] = container[keyName]; // key already added to container, move to item
                delete container[keyName];
                // Re-push savedItem onto path for subsequent nested keys
                path.push({ obj: savedItem, indent: savedIndent });
                // Don't clear activeArrayItemIndent — stay in this item's scope
            } else {
                // Truly exiting item scope
                activeArrayItem = null;
                activeArrayItemIndent = -1;
            }
            }

            const container = path[path.length - 1].obj;

            if (val === '|' || val === '>') {
                // Block scalar
                const blockLines = [];
                let j = i + 1;
                while (j < lines.length) {
                    const next = lines[j];
                    if (!next.trim()) { j++; continue; }
                    if (next.search(/\S/) <= indent) break;
                    blockLines.push(next.slice(indent + 2));
                    j++;
                }
                container[keyName] = blockLines.join('\n').trim();
                i = j - 1;
            } else if (val === '') {
                // Empty value: lookahead to decide object vs array vs null
                let j = i + 1; let hasNested = false;
                while (j < lines.length) {
                    const nxt = lines[j].replace(/^\t/, '  ');
                    if (!nxt.trim()) { j++; continue; }
                    if (nxt.search(/\S/) <= indent) break;
                    hasNested = true; j++;
                }
                if (hasNested) {
                    if (lines[i + 1] && lines[i + 1].replace(/^\t/, '  ').trimStart().startsWith('-')) {
                        container[keyName] = [];
                        activeArray = container[keyName];
                        path.push({ obj: container[keyName], indent });
                    } else {
                        container[keyName] = {};
                        path.push({ obj: container[keyName], indent });
                        activeArray = null;
                    }
                } else {
                    container[keyName] = null;
                    activeArray = null;
                }
            } else if (val.startsWith('[') && val.endsWith(']')) {
                try { container[keyName] = JSON.parse(val.replace(/'/g, '"')); } catch (_) { container[keyName] = val; }
                activeArray = null;
            } else if (val === 'true' || val === 'false') {
                container[keyName] = val === 'true';
                activeArray = null;
            } else if (/^\d+(\.\d+)?$/.test(val)) {
                container[keyName] = parseFloat(val);
                activeArray = null;
            } else {
                container[keyName] = val.replace(/^['"]|['"]$/g, '');
                activeArray = null;
            }
        }

        return root;
    }

    // ================================================================
    // Uninstall / Cache management
    // ================================================================

    /** Uninstall Skill */
    uninstall(name) {
        this.registry.unregister(name);
        this.installedRemotes.delete(name);
        return true;
    }

    /** Check if installed */
    isInstalled(name) {
        return this.registry.skills.has(name) || this.installedRemotes.has(name);
    }

    /** Get cache statistics */
    getCacheStats() {
        return {
            total: this.cache.size,
            installedRemotes: this.installedRemotes.size,
            entries: Array.from(this.cache.entries()).map(([name, entry]) => ({
                name,
                version: entry.version,
                downloadedAt: new Date(entry.downloadedAt).toISOString(),
                source: entry.source,
            })),
        };
    }

    /** Clean expired cache entries (older than maxAgeMs and not installed) */
    cleanCache(maxAgeMs = 24 * 60 * 60 * 1000) {
        const now = Date.now();
        let cleaned = 0;
        for (const [name, entry] of this.cache.entries()) {
            if (!this.installedRemotes.has(name) && now - entry.downloadedAt > maxAgeMs) {
                this.cache.delete(name);
                cleaned++;
            }
        }
        return { cleaned };
    }

    /** List all available Skills */
    listAll() {
        const official = Object.entries(OFFICIAL_SKILLS).map(([name, spec]) => ({
            name,
            version: spec.version,
            description: spec.description,
            source: 'official',
            installed: this.isInstalled(name),
        }));
        const remote = Array.from(this.cache.entries())
            .filter(([, entry]) => entry.source !== 'official')
            .map(([name, entry]) => ({
                name,
                version: entry.version,
                source: entry.source,
                installed: this.isInstalled(name),
            }));
        return { official, remote };
    }

    // ================================================================
    // v3.9: 跨平台分发（集成 PlatformBridge）
    // ================================================================

    /** 检测已安装的 AI 平台 */
    listInstalledPlatforms() {
        return detectInstalledPlatforms();
    }

    /** 获取所有支持的平台 */
    listSupportedPlatforms() {
        return SKILL_PLATFORMS.map(p => ({
            id: p.id,
            name: p.name,
            type: p.type,
        }));
    }

    /** 安装 Skill 到指定平台 */
    async installToPlatform(skillName, platformId) {
        const spec = this.registry.get(skillName);
        if (!spec) {
            return { success: false, error: `Skill "${skillName}" not found` };
        }

        // 生成 SKILL.md 内容
        const skillMdContent = this._generateSkillMd(spec);
        
        return installSkillMd(skillName, skillMdContent, platformId);
    }

    /** 安装 Skill 到多个平台 */
    async installToMultiplePlatforms(skillName, platformIds) {
        const spec = this.registry.get(skillName);
        if (!spec) {
            return { success: false, error: `Skill "${skillName}" not found` };
        }

        const skillMdContent = this._generateSkillMd(spec);
        return installToMultiplePlatforms(skillName, skillMdContent, platformIds);
    }

    /** 获取 Skill 的平台安装状态 */
    getPlatformInstallStatus(skillName) {
        return getSkillMdInstallStatus(skillName);
    }

    /** 从 Skill spec 生成 SKILL.md 内容 */
    _generateSkillMd(spec) {
        const frontmatter = [
            `name: ${spec.name}`,
            `version: ${spec.version || '1.0.0'}`,
            spec.description ? `description: ${spec.description}` : '',
            spec.author ? `author: ${spec.author}` : '',
            spec.tags?.length ? `tags: [${spec.tags.join(', ')}]` : '',
        ].filter(Boolean).join('\n');

        const body = spec.system_prompt || spec.instructions || '';
        
        return `---\n${frontmatter}\n---\n\n${body}`;
    }
}

export default SkillMarket;
