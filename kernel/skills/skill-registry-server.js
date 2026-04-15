// kernel/skills/skill-registry-server.js
// HundunOS v3.9 — Skill Package Registry Server
// 
// 类似 npm 的 Skill 包管理服务
// 提供搜索、发布、安装、版本管理等功能

import { createServer } from 'http';
import { readFile, writeFile, mkdir, access, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { createHash } from 'crypto';

/**
 * Skill Registry Server
 */
export class SkillRegistryServer {
    constructor(options = {}) {
        this.port = options.port || 3690;
        this.registryDir = options.registryDir || join(process.env.HOME || '.', '.hundunos', 'registry');
        this.indexFile = join(this.registryDir, 'index.json');
        this.index = null;
    }
    
    async init() {
        // Ensure registry directory exists
        await mkdir(this.registryDir, { recursive: true });
        await mkdir(join(this.registryDir, 'packages'), { recursive: true });
        
        // Load or create index
        try {
            const content = await readFile(this.indexFile, 'utf-8');
            this.index = JSON.parse(content);
        } catch {
            this.index = {
                version: '1.0.0',
                updated: new Date().toISOString(),
                packages: {},
            };
            await this.saveIndex();
        }
    }
    
    async saveIndex() {
        this.index.updated = new Date().toISOString();
        await writeFile(this.indexFile, JSON.stringify(this.index, null, 2));
    }
    
    /**
     * Search packages
     */
    async search(query, options = {}) {
        const { limit = 20, offset = 0 } = options;
        const results = [];
        const q = query.toLowerCase();
        
        for (const [name, pkg] of Object.entries(this.index.packages)) {
            const matchName = name.toLowerCase().includes(q);
            const matchDesc = (pkg.description || '').toLowerCase().includes(q);
            const matchTags = (pkg.tags || []).some(t => t.toLowerCase().includes(q));
            
            if (matchName || matchDesc || matchTags) {
                results.push({
                    name,
                    version: pkg.latest,
                    description: pkg.description,
                    tags: pkg.tags,
                    author: pkg.author,
                    downloads: pkg.downloads || 0,
                });
            }
        }
        
        return {
            total: results.length,
            results: results.slice(offset, offset + limit),
        };
    }
    
    /**
     * Get package info
     */
    async info(name) {
        const pkg = this.index.packages[name];
        if (!pkg) {
            return { error: 'Package not found' };
        }
        
        // Load full package metadata
        const pkgFile = join(this.registryDir, 'packages', name, 'package.json');
        try {
            const content = await readFile(pkgFile, 'utf-8');
            return JSON.parse(content);
        } catch {
            return {
                name,
                version: pkg.latest,
                description: pkg.description,
                versions: pkg.versions,
            };
        }
    }
    
    /**
     * Publish package
     */
    async publish(pkgData) {
        const { name, version, description, author, tags, skillDef, readme } = pkgData;
        
        // Validate name
        if (!name || !version) {
            return { error: 'name and version are required' };
        }
        
        // Create package directory
        const pkgDir = join(this.registryDir, 'packages', name);
        await mkdir(pkgDir, { recursive: true });
        
        // Create version directory
        const versionDir = join(pkgDir, version);
        await mkdir(versionDir, { recursive: true });
        
        // Save skill definition
        await writeFile(
            join(versionDir, 'skill.yaml'),
            typeof skillDef === 'string' ? skillDef : this._toYaml(skillDef)
        );
        
        // Save readme if provided
        if (readme) {
            await writeFile(join(versionDir, 'README.md'), readme);
        }
        
        // Calculate checksum
        const checksum = createHash('sha256')
            .update(JSON.stringify(skillDef))
            .digest('hex')
            .slice(0, 16);
        
        // Update package metadata
        const pkgFile = join(pkgDir, 'package.json');
        let pkgMeta = {};
        try {
            pkgMeta = JSON.parse(await readFile(pkgFile, 'utf-8'));
        } catch {}
        
        pkgMeta.name = name;
        pkgMeta.version = version;
        pkgMeta.description = description || pkgMeta.description;
        pkgMeta.author = author || pkgMeta.author;
        pkgMeta.tags = tags || pkgMeta.tags || [];
        pkgMeta.versions = pkgMeta.versions || {};
        pkgMeta.versions[version] = {
            date: new Date().toISOString(),
            checksum,
        };
        pkgMeta.latest = version;
        pkgMeta.downloads = pkgMeta.downloads || 0;
        
        await writeFile(pkgFile, JSON.stringify(pkgMeta, null, 2));
        
        // Update index
        this.index.packages[name] = {
            latest: version,
            description: pkgMeta.description,
            tags: pkgMeta.tags,
            author: pkgMeta.author,
            versions: Object.keys(pkgMeta.versions),
            downloads: pkgMeta.downloads,
        };
        
        await this.saveIndex();
        
        return {
            success: true,
            name,
            version,
            checksum,
        };
    }
    
    /**
     * Install package
     */
    async install(name, version = 'latest') {
        const pkg = this.index.packages[name];
        if (!pkg) {
            return { error: 'Package not found' };
        }
        
        // Resolve version
        if (version === 'latest') {
            version = pkg.latest;
        }
        
        // Find skill file
        const skillFile = join(this.registryDir, 'packages', name, version, 'skill.yaml');
        try {
            const content = await readFile(skillFile, 'utf-8');
            
            // Increment downloads
            const pkgFile = join(this.registryDir, 'packages', name, 'package.json');
            const pkgMeta = JSON.parse(await readFile(pkgFile, 'utf-8'));
            pkgMeta.downloads = (pkgMeta.downloads || 0) + 1;
            await writeFile(pkgFile, JSON.stringify(pkgMeta, null, 2));
            
            // Update index
            if (this.index.packages[name]) {
                this.index.packages[name].downloads = pkgMeta.downloads;
                await this.saveIndex();
            }
            
            return {
                success: true,
                name,
                version,
                content,
            };
        } catch {
            return { error: `Version ${version} not found` };
        }
    }
    
    /**
     * Deprecate package version
     */
    async deprecate(name, version, message) {
        const pkgFile = join(this.registryDir, 'packages', name, 'package.json');
        try {
            const pkgMeta = JSON.parse(await readFile(pkgFile, 'utf-8'));
            
            if (pkgMeta.versions[version]) {
                pkgMeta.versions[version].deprecated = message || true;
                await writeFile(pkgFile, JSON.stringify(pkgMeta, null, 2));
                return { success: true };
            }
            
            return { error: 'Version not found' };
        } catch {
            return { error: 'Package not found' };
        }
    }
    
    /**
     * Unpublish package
     */
    async unpublish(name, version) {
        if (!version) {
            // Unpublish entire package
            delete this.index.packages[name];
            await this.saveIndex();
            return { success: true };
        }
        
        // Unpublish specific version
        const pkgFile = join(this.registryDir, 'packages', name, 'package.json');
        try {
            const pkgMeta = JSON.parse(await readFile(pkgFile, 'utf-8'));
            
            if (pkgMeta.versions[version]) {
                delete pkgMeta.versions[version];
                
                // Update latest
                const versions = Object.keys(pkgMeta.versions);
                if (versions.length === 0) {
                    delete this.index.packages[name];
                } else {
                    pkgMeta.latest = versions.sort(this._compareVersions).reverse()[0];
                    this.index.packages[name].latest = pkgMeta.latest;
                    this.index.packages[name].versions = versions;
                }
                
                await writeFile(pkgFile, JSON.stringify(pkgMeta, null, 2));
                await this.saveIndex();
                
                return { success: true };
            }
            
            return { error: 'Version not found' };
        } catch {
            return { error: 'Package not found' };
        }
    }
    
    /**
     * Get download stats
     */
    async stats(name) {
        const pkg = this.index.packages[name];
        if (!pkg) {
            return { error: 'Package not found' };
        }
        
        return {
            name,
            downloads: pkg.downloads || 0,
            versions: pkg.versions?.length || 0,
            latest: pkg.latest,
        };
    }
    
    /**
     * Handle HTTP request
     */
    handleRequest = async (req, res) => {
        const url = new URL(req.url, `http://localhost:${this.port}`);
        const path = url.pathname;
        
        // CORS headers
        const isProduction = process.env.NODE_ENV === 'production';
        const corsOrigins = process.env.HUNDUNOS_CORS_ORIGINS || '*';
        const origin = isProduction ? corsOrigins : '*';
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }
        
        try {
            // Routes
            if (req.method === 'GET' && path === '/') {
                // Index
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    name: 'HundunOS Skill Registry',
                    version: this.index.version,
                    packages: Object.keys(this.index.packages).length,
                }));
                return;
            }
            
            if (req.method === 'GET' && path === '/search') {
                // Search
                const query = url.searchParams.get('q') || '';
                const limit = parseInt(url.searchParams.get('limit') || '20');
                const offset = parseInt(url.searchParams.get('offset') || '0');
                
                const result = await this.search(query, { limit, offset });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
                return;
            }
            
            if (req.method === 'GET' && path.startsWith('/package/')) {
                // H-4 Fix: 验证包名格式，防止路径遍历（只允许字母、数字、连字符、点、@）
                const name = path.slice(9);
                if (!/^[a-zA-Z0-9._@-]+$/.test(name) || name.includes('..') || /[\\/]/.test(name)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid package name' }));
                    return;
                }
                const result = await this.info(name);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
                return;
            }

            if (req.method === 'GET' && path.startsWith('/install/')) {
                // H-4 Fix: 同样验证安装路径包名
                const raw = path.slice(9);
                if (!/^[a-zA-Z0-9._@-]+$/.test(raw) || raw.includes('..') || /[\\/]/.test(raw)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid package name' }));
                    return;
                }
                const [name, version] = raw.split('@');
                const result = await this.install(name, version || 'latest');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
                return;
            }
            
            if (req.method === 'POST' && path === '/publish') {
                // Publish package
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', async () => {
                    const pkgData = JSON.parse(body);
                    const result = await this.publish(pkgData);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                });
                return;
            }
            
            if (req.method === 'DELETE' && path.startsWith('/package/')) {
                // Unpublish
                const [name, version] = path.slice(9).split('@');
                const result = await this.unpublish(name, version);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
                return;
            }
            
            if (req.method === 'GET' && path.startsWith('/stats/')) {
                // Stats
                const name = path.slice(7);
                const result = await this.stats(name);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
                return;
            }
            
            // 404
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
            
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    }
    
    start() {
        return new Promise((resolve) => {
            this.server = createServer(this.handleRequest);
            this.server.listen(this.port, () => {
                // console.log(`Skill Registry running at http://localhost:${this.port}`);
                resolve();
            });
        });
    }
    
    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(resolve);
            } else {
                resolve();
            }
        });
    }
    
    // Helper: Convert object to YAML
    _toYaml(obj) {
        let yaml = '';
        for (const [key, value] of Object.entries(obj)) {
            if (Array.isArray(value)) {
                yaml += `${key}: [${value.join(', ')}]\n`;
            } else if (typeof value === 'object' && value !== null) {
                yaml += `${key}:\n`;
                for (const [k, v] of Object.entries(value)) {
                    yaml += `  ${k}: ${v}\n`;
                }
            } else {
                yaml += `${key}: ${value}\n`;
            }
        }
        return yaml;
    }
    
    // Helper: Compare semver versions
    _compareVersions(a, b) {
        const pa = a.split('.').map(Number);
        const pb = b.split('.').map(Number);
        for (let i = 0; i < 3; i++) {
            if (pa[i] > pb[i]) return 1;
            if (pa[i] < pb[i]) return -1;
        }
        return 0;
    }
}

export default SkillRegistryServer;
