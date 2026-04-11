// hundunos/kernel/hooks/hook-loader.js
// HundunOS v3.8 Phase 7 — Hook 配置加载器
// 职责：从 config/hooks/*.yaml 扫描并加载 Hook 定义

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { createDefaultHooks } from './index.js';
import { createLogger } from '../logger.js';

const logger = createLogger('HookLoader');

const __dirname = dirname(fileURLToPath(import.meta.url));

export class HookLoader {
    /**
     * @param {Object} kernel - HundunOS kernel 引用
     */
    constructor(kernel) {
        this.kernel = kernel;
        this.hooks = {};           // eventName → hookGroup[]
        this._loadedFiles = [];   // 已加载文件路径
    }

    /**
     * 获取 Hook 配置目录
     */
    _getHooksDir() {
        const projectRoot = this.kernel?.config?.projectRoot || process.cwd();
        return resolve(projectRoot, 'config', 'hooks');
    }

    /**
     * 扫描并加载所有 Hook YAML 文件
     * @returns {Promise<Object>} 合并后的 hooks 配置（不含默认 hook，由 core.js 负责合并）
     */
    async loadAll() {
        const hooksDir = this._getHooksDir();

        if (!existsSync(hooksDir)) {
            // review: removed // review: removed console.log('[HookLoader] config/hooks/ 目录不存在，返回空（默认 Hook 由 core.js _mergeHooks 注入）');
            return {};
        }

        const files = readdirSync(hooksDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

        if (files.length === 0) {
            // review: removed // review: removed console.log('[HookLoader] config/hooks/ 无 YAML 文件，返回空（默认 Hook 由 core.js _mergeHooks 注入）');
            return {};
        }

        for (const file of files) {
            try {
                const path = join(hooksDir, file);
                const content = readFileSync(path, 'utf-8');
                const parsed = YAML.parse(content);
                this._mergeHookConfig(parsed);
                this._loadedFiles.push(path);
            } catch (e) {
                logger.warn(`加载失败 ${file}: ${e.message}`);
            }
        }

        // review: removed // review: removed console.log(`[HookLoader] 已加载 ${this._loadedFiles.length} 个 Hook 文件，${Object.keys(this.hooks).length} 个事件`);
        return this.hooks;
    }

    /**
     * 获取默认内置 Hook（委托给 hooks/index.js）
     * 保留本方法以维持向后兼容
     * @returns {Object}
     * @deprecated 请使用 hooks/index.js 的 createDefaultHooks()
     */
    _getDefaultHooks() {
        return createDefaultHooks();
    }

    /**
     * 合并单个 Hook 配置文件到全局 hooks 对象
     * @param {Object} config - YAML 解析后的配置
     */
    _mergeHookConfig(config) {
        if (!config || !config.hooks) return;

        for (const [eventName, groups] of Object.entries(config.hooks)) {
            if (!this.hooks[eventName]) {
                this.hooks[eventName] = [];
            }
            // 支持单个对象或数组
            const groupList = Array.isArray(groups) ? groups : [groups];
            for (const group of groupList) {
                if (group && group.hooks) {
                    this.hooks[eventName].push(group);
                }
            }
        }
    }

    /**
     * 获取所有已加载的 Hook 事件列表
     * @returns {string[]}
     */
    listEvents() {
        return Object.keys(this.hooks);
    }

    /**
     * 获取指定事件的 Hook 配置
     * @param {string} eventName
     * @returns {Array}
     */
    getHooks(eventName) {
        return this.hooks[eventName] || [];
    }

    /**
     * 动态注册 Hook（运行时添加）
     * @param {string} event
     * @param {Object} hookGroup
     */
    register(event, hookGroup) {
        if (!this.hooks[event]) {
            this.hooks[event] = [];
        }
        this.hooks[event].push(hookGroup);
    }

    /**
     * 获取加载统计
     */
    getStats() {
        return {
            loadedFiles: this._loadedFiles.length,
            events: this.listEvents().length,
            eventList: this.listEvents(),
        };
    }
}

export default HookLoader;
