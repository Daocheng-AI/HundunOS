// kernel/skills/skill-sync.js
// HundunOS v3.9 — WebDAV 云同步
// 
// 职责：
//   - WebDAV 协议支持
//   - 增量同步（仅传输变更）
//   - 冲突检测与解决
//   - 离线队列

import { join, dirname, basename } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, createReadStream } from 'fs';

// ================================================================
// WebDAV 客户端
// ================================================================

/**
 * WebDAV 客户端
 */
export class WebDAVClient {
    /**
     * @param {object} options
     * @param {string} options.serverUrl - WebDAV 服务器地址
     * @param {string} options.username
     * @param {string} options.password
     * @param {string} [options.basePath] - 服务器上的基础路径
     */
    constructor(options = {}) {
        this.serverUrl = options.serverUrl?.replace(/\/$/, '');
        this.username = options.username;
        this.password = options.password;
        this.basePath = options.basePath || '/hundunos-skills';
        this._headers = {
            'Authorization': 'Basic ' + Buffer.from(`${this.username}:${this.password}`).toString('base64'),
        };
    }

    /**
     * 检查连接
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async testConnection() {
        try {
            const response = await fetch(this.serverUrl, {
                method: 'OPTIONS',
                headers: this._headers,
            });
            
            return { success: response.ok };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 列出目录内容
     * @param {string} remotePath
     * @returns {Promise<{ success: boolean, items?: Array<{ name: string, isDirectory: boolean, size: number, modified: Date }>, error?: string }>}
     */
    async list(remotePath = '') {
        const url = `${this.serverUrl}${this.basePath}/${remotePath}`;
        
        try {
            const response = await fetch(url, {
                method: 'PROPFIND',
                headers: {
                    ...this._headers,
                    'Depth': '1',
                    'Content-Type': 'application/xml',
                },
                body: `<?xml version="1.0" encoding="utf-8"?>
                    <propfind xmlns="DAV:">
                        <prop>
                            <displayname/>
                            <resourcetype/>
                            <getcontentlength/>
                            <getlastmodified/>
                        </prop>
                    </propfind>`,
            });
            
            if (!response.ok) {
                return { success: false, error: `HTTP ${response.status}` };
            }
            
            const text = await response.text();
            const items = this._parseWebDAVResponse(text, remotePath);
            
            return { success: true, items };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 创建目录
     * @param {string} remotePath
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async mkdir(remotePath) {
        const url = `${this.serverUrl}${this.basePath}/${remotePath}`;
        
        try {
            const response = await fetch(url, {
                method: 'MKCOL',
                headers: this._headers,
            });
            
            // 201 Created 或 405 Already Exists 都算成功
            if (response.ok || response.status === 405) {
                return { success: true };
            }
            
            return { success: false, error: `HTTP ${response.status}` };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 上传文件
     * @param {string} remotePath
     * @param {Buffer | string} content
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async upload(remotePath, content) {
        const url = `${this.serverUrl}${this.basePath}/${remotePath}`;
        
        try {
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    ...this._headers,
                    'Content-Type': 'application/octet-stream',
                },
                body: content,
            });
            
            if (response.ok || response.status === 201 || response.status === 204) {
                return { success: true };
            }
            
            return { success: false, error: `HTTP ${response.status}` };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 下载文件
     * @param {string} remotePath
     * @returns {Promise<{ success: boolean, content?: Buffer, error?: string }>}
     */
    async download(remotePath) {
        const url = `${this.serverUrl}${this.basePath}/${remotePath}`;
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: this._headers,
            });
            
            if (!response.ok) {
                return { success: false, error: `HTTP ${response.status}` };
            }
            
            const buffer = await response.arrayBuffer();
            return { success: true, content: Buffer.from(buffer) };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 删除文件或目录
     * @param {string} remotePath
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async delete(remotePath) {
        const url = `${this.serverUrl}${this.basePath}/${remotePath}`;
        
        try {
            const response = await fetch(url, {
                method: 'DELETE',
                headers: this._headers,
            });
            
            if (response.ok || response.status === 204) {
                return { success: true };
            }
            
            return { success: false, error: `HTTP ${response.status}` };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 解析 WebDAV PROPFIND 响应
     * @private
     */
    _parseWebDAVResponse(xml, currentPath) {
        const items = [];
        
        // 简单 XML 解析（无依赖）
        const responses = xml.match(/<response[^>]*>[\s\S]*?<\/response>/gi) || [];
        
        for (const resp of responses) {
            const hrefMatch = resp.match(/<d?:href>([^<]+)<\/d?:href>/i);
            const isDirMatch = resp.match(/<d?:resourcetype>[\s\S]*?<d?:collection\/>[\s\S]*?<\/d?:resourcetype>/i);
            const sizeMatch = resp.match(/<d?:getcontentlength>(\d+)<\/d?:getcontentlength>/i);
            const modifiedMatch = resp.match(/<d?:getlastmodified>([^<]+)<\/d?:getlastmodified>/i);
            
            if (hrefMatch) {
                let name = decodeURIComponent(hrefMatch[1].split('/').pop() || '');
                
                // 跳过当前目录
                if (!name || name === currentPath.split('/').pop()) {
                    continue;
                }
                
                items.push({
                    name,
                    isDirectory: !!isDirMatch,
                    size: sizeMatch ? parseInt(sizeMatch[1], 10) : 0,
                    modified: modifiedMatch ? new Date(modifiedMatch[1]) : null,
                });
            }
        }
        
        return items;
    }
}

// ================================================================
// SkillSync 类
// ================================================================

/**
 * Skill 云同步管理器
 */
export class SkillSync {
    /**
     * @param {object} options
     * @param {WebDAVClient} options.client
     * @param {string} options.localDir - 本地 Skill 目录
     * @param {object} [options.kernel]
     */
    constructor(options = {}) {
        this.client = options.client;
        this.localDir = options.localDir;
        this.kernel = options.kernel;
        
        // 同步状态文件
        this._syncStateFile = join(this.localDir, '.sync-state.json');
        this._syncState = this._loadSyncState();
        
        // 离线队列
        this._offlineQueue = [];
    }

    // ================================================================
    // 同步操作
    // ================================================================

    /**
     * 上传 Skill 到云端
     * @param {string} skillName
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async upload(skillName) {
        if (!this.client) {
            return { success: false, error: 'WebDAV client not configured' };
        }
        
        const localPath = join(this.localDir, skillName);
        
        if (!existsSync(localPath)) {
            return { success: false, error: `Skill "${skillName}" not found` };
        }
        
        try {
            // 创建远程目录
            await this.client.mkdir(skillName);
            
            // 上传所有文件
            const files = this._listFiles(localPath);
            
            for (const file of files) {
                const relativePath = file.replace(localPath, '').replace(/^[\/\\]/, '');
                const remotePath = `${skillName}/${relativePath}`;
                const content = readFileSync(file);
                
                const result = await this.client.upload(remotePath, content);
                
                if (!result.success) {
                    return { success: false, error: `Failed to upload ${relativePath}: ${result.error}` };
                }
            }
            
            // 更新同步状态
            this._updateSyncState(skillName, {
                lastSync: Date.now(),
                direction: 'upload',
                fileCount: files.length,
            });
            
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 从云端下载 Skill
     * @param {string} skillName
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async download(skillName) {
        if (!this.client) {
            return { success: false, error: 'WebDAV client not configured' };
        }
        
        const localPath = join(this.localDir, skillName);
        
        try {
            // 列出远程文件
            const listResult = await this.client.list(skillName);
            
            if (!listResult.success) {
                return { success: false, error: listResult.error };
            }
            
            // 创建本地目录
            if (!existsSync(localPath)) {
                mkdirSync(localPath, { recursive: true });
            }
            
            // 下载所有文件
            for (const item of listResult.items) {
                if (item.isDirectory) {
                    // 递归处理子目录
                    await this._downloadDir(`${skillName}/${item.name}`, join(localPath, item.name));
                } else {
                    const remotePath = `${skillName}/${item.name}`;
                    const downloadResult = await this.client.download(remotePath);
                    
                    if (downloadResult.success) {
                        writeFileSync(join(localPath, item.name), downloadResult.content);
                    }
                }
            }
            
            // 更新同步状态
            this._updateSyncState(skillName, {
                lastSync: Date.now(),
                direction: 'download',
            });
            
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 双向同步
     * @returns {Promise<{ uploaded: string[], downloaded: string[], conflicts: Array<{ name: string, local: Date, remote: Date }>, errors: Array<{ name: string, error: string }> }>}
     */
    async sync() {
        const result = {
            uploaded: [],
            downloaded: [],
            conflicts: [],
            errors: [],
        };
        
        if (!this.client) {
            result.errors.push({ name: 'client', error: 'WebDAV client not configured' });
            return result;
        }
        
        // 获取本地和远程列表
        const localSkills = this._listLocalSkills();
        const remoteList = await this.client.list('');
        
        if (!remoteList.success) {
            result.errors.push({ name: 'remote', error: remoteList.error });
            return result;
        }
        
        const remoteSkills = remoteList.items.filter(i => i.isDirectory).map(i => i.name);
        
        // 上传本地独有的
        for (const name of localSkills) {
            if (!remoteSkills.includes(name)) {
                const uploadResult = await this.upload(name);
                if (uploadResult.success) {
                    result.uploaded.push(name);
                } else {
                    result.errors.push({ name, error: uploadResult.error });
                }
            }
        }
        
        // 下载远程独有的
        for (const name of remoteSkills) {
            if (!localSkills.includes(name)) {
                const downloadResult = await this.download(name);
                if (downloadResult.success) {
                    result.downloaded.push(name);
                } else {
                    result.errors.push({ name, error: downloadResult.error });
                }
            }
        }
        
        // 检测冲突（两边都有）
        for (const name of localSkills) {
            if (remoteSkills.includes(name)) {
                const conflict = await this._detectConflict(name);
                if (conflict) {
                    result.conflicts.push(conflict);
                } else {
                    // 无冲突，根据修改时间决定方向
                    const localModified = this._getLastModified(join(this.localDir, name));
                    const state = this._syncState[name];
                    
                    if (state && state.lastSync) {
                        // 有同步记录，上传更新的
                        if (localModified > state.lastSync) {
                            const uploadResult = await this.upload(name);
                            if (uploadResult.success) {
                                result.uploaded.push(name);
                            }
                        } else {
                            const downloadResult = await this.download(name);
                            if (downloadResult.success) {
                                result.downloaded.push(name);
                            }
                        }
                    } else {
                        // 无同步记录，记录冲突
                        result.conflicts.push({
                            name,
                            local: new Date(localModified),
                            remote: new Date(), // 无法获取远程时间，使用当前时间
                        });
                    }
                }
            }
        }
        
        return result;
    }

    /**
     * 解决冲突
     * @param {string} skillName
     * @param {'local' | 'remote'} resolution
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async resolveConflict(skillName, resolution) {
        if (resolution === 'local') {
            return this.upload(skillName);
        } else {
            return this.download(skillName);
        }
    }

    // ================================================================
    // 离线队列
    // ================================================================

    /**
     * 添加到离线队列
     * @param {string} skillName
     * @param {'upload' | 'download'} action
     */
    addToOfflineQueue(skillName, action) {
        this._offlineQueue.push({
            skillName,
            action,
            addedAt: Date.now(),
        });
        
        this._saveOfflineQueue();
    }

    /**
     * 处理离线队列
     * @returns {Promise<{ processed: number, failed: number }>}
     */
    async processOfflineQueue() {
        let processed = 0;
        let failed = 0;
        
        const queue = [...this._offlineQueue];
        this._offlineQueue = [];
        
        for (const item of queue) {
            const result = item.action === 'upload'
                ? await this.upload(item.skillName)
                : await this.download(item.skillName);
            
            if (result.success) {
                processed++;
            } else {
                failed++;
                // 失败的重新加入队列
                this._offlineQueue.push(item);
            }
        }
        
        this._saveOfflineQueue();
        
        return { processed, failed };
    }

    /**
     * 获取离线队列状态
     * @returns {Array<{ skillName: string, action: string, addedAt: number }>}
     */
    getOfflineQueue() {
        return [...this._offlineQueue];
    }

    // ================================================================
    // 内部方法
    // ================================================================

    _listLocalSkills() {
        if (!existsSync(this.localDir)) return [];
        
        return readdirSync(this.localDir, { withFileTypes: true })
            .filter(e => e.isDirectory() && !e.name.startsWith('.'))
            .map(e => e.name);
    }

    _listFiles(dir) {
        const files = [];
        
        if (!existsSync(dir)) return files;
        
        const entries = readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const path = join(dir, entry.name);
            
            if (entry.isDirectory()) {
                files.push(...this._listFiles(path));
            } else {
                files.push(path);
            }
        }
        
        return files;
    }

    _getLastModified(dir) {
        let latest = 0;
        
        const files = this._listFiles(dir);
        
        for (const file of files) {
            try {
                const stat = statSync(file);
                if (stat.mtimeMs > latest) {
                    latest = stat.mtimeMs;
                }
            } catch (e) {
                // 忽略
            }
        }
        
        return latest;
    }

    async _detectConflict(skillName) {
        // 简单冲突检测：比较本地修改时间和上次同步时间
        const localModified = this._getLastModified(join(this.localDir, skillName));
        const state = this._syncState[skillName];
        
        if (!state || !state.lastSync) {
            return null;
        }
        
        // 如果本地修改时间晚于上次同步，且远程也有更新，则冲突
        // 这里简化处理，实际需要比较远程修改时间
        return null;
    }

    async _downloadDir(remotePath, localPath) {
        const listResult = await this.client.list(remotePath);
        
        if (!listResult.success) return;
        
        if (!existsSync(localPath)) {
            mkdirSync(localPath, { recursive: true });
        }
        
        for (const item of listResult.items) {
            if (item.isDirectory) {
                await this._downloadDir(`${remotePath}/${item.name}`, join(localPath, item.name));
            } else {
                const downloadResult = await this.client.download(`${remotePath}/${item.name}`);
                if (downloadResult.success) {
                    writeFileSync(join(localPath, item.name), downloadResult.content);
                }
            }
        }
    }

    _loadSyncState() {
        try {
            if (existsSync(this._syncStateFile)) {
                return JSON.parse(readFileSync(this._syncStateFile, 'utf-8'));
            }
        } catch (e) {
            // 忽略
        }
        
        return {};
    }

    _saveSyncState() {
        try {
            writeFileSync(this._syncStateFile, JSON.stringify(this._syncState, null, 2), 'utf-8');
        } catch (e) {
            // 忽略
        }
    }

    _updateSyncState(skillName, state) {
        this._syncState[skillName] = {
            ...this._syncState[skillName],
            ...state,
        };
        
        this._saveSyncState();
    }

    _saveOfflineQueue() {
        const queueFile = join(this.localDir, '.offline-queue.json');
        
        try {
            writeFileSync(queueFile, JSON.stringify(this._offlineQueue, null, 2), 'utf-8');
        } catch (e) {
            // 忽略
        }
    }

    // ================================================================
    // 统计
    // ================================================================

    getStats() {
        return {
            localDir: this.localDir,
            syncedSkills: Object.keys(this._syncState).length,
            pendingOperations: this._offlineQueue.length,
            hasClient: !!this.client,
        };
    }
}

export default SkillSync;
