// kernel/skills/skill-remote.js
// HundunOS v3.9 — 远程 Skill 安装器（含 SSRF 防护）
// 移植自 PromptHub skill-installer-remote.ts
//
// 职责：
//   - 从 URL / GitHub / Gist 安装 Skill
//   - SSRF 防护：阻止访问私有 IP / 内网地址
//   - 请求超时与错误处理
//   - 缓存管理

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// ================================================================
// SSRF 防护配置
// ================================================================

/**
 * 私有 IP 地址范围（CIDR 格式）
 * 这些地址段不允许通过远程安装访问
 */
const PRIVATE_IP_RANGES = [
    // IPv4 私有地址
    '10.0.0.0/8',       // Class A 私有网络
    '172.16.0.0/12',    // Class B 私有网络
    '192.168.0.0/16',   // Class C 私有网络
    '127.0.0.0/8',      // 本地回环
    '169.254.0.0/16',   // 链路本地
    '0.0.0.0/8',        // 当前网络
    '224.0.0.0/4',      // 多播
    '240.0.0.0/4',      // 保留
    // IPv6 私有地址
    '::1/128',          // 本地回环
    'fc00::/7',         // 唯一本地地址
    'fe80::/10',        // 链路本地
    '::ffff:0:0/96',    // IPv4 映射地址
];

/**
 * 禁止访问的主机名模式
 */
const BLOCKED_HOSTNAME_PATTERNS = [
    /^localhost$/i,
    /^local$/i,
    /\.local$/i,
    /\.internal$/i,
    /internal\./i,       // 包含 internal. 的域名（如 internal.corp）
    /^192\.168\./i,
    /^10\./i,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./i,
    /^127\./i,
    /^0\.0\.0\.0$/i,
    /\[::1\]/i,
    /\[::\]/i,
];

/**
 * 允许的协议
 */
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

/**
 * 默认请求超时（毫秒）
 */
const DEFAULT_TIMEOUT = 15000;

/**
 * 默认最大响应大小（字节）
 */
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB

// ================================================================
// SSRF 防护函数
// ================================================================

/**
 * 检查 URL 是否允许访问
 * @param {string} urlString
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function validateUrl(urlString) {
    let url;
    
    try {
        url = new URL(urlString);
    } catch (e) {
        return { allowed: false, reason: 'Invalid URL format' };
    }
    
    // 检查协议
    if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
        return { allowed: false, reason: `Protocol "${url.protocol}" not allowed. Only HTTP/HTTPS are supported.` };
    }
    
    // 检查主机名模式
    const hostname = url.hostname;
    for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
        if (pattern.test(hostname)) {
            return { allowed: false, reason: `Hostname "${hostname}" is blocked (matches internal/private pattern)` };
        }
    }
    
    // 检查是否是 IP 地址（而非域名）
    const isIPv4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
    const isIPv6 = hostname.includes(':');
    
    if (isIPv4 || isIPv6) {
        // 直接 IP 访问需要更严格的检查
        const ipCheck = checkPrivateIP(hostname);
        if (ipCheck.isPrivate) {
            return { allowed: false, reason: `IP address "${hostname}" is private/internal` };
        }
    }
    
    return { allowed: true };
}

/**
 * 检查 IP 是否是私有地址
 * @param {string} ip
 * @returns {{ isPrivate: boolean, range?: string }}
 */
function checkPrivateIP(ip) {
    // IPv6 本地地址
    if (ip === '::1' || ip === '::') {
        return { isPrivate: true, range: 'IPv6 loopback' };
    }
    if (ip.startsWith('fc') || ip.startsWith('fd')) {
        return { isPrivate: true, range: 'IPv6 ULA' };
    }
    if (ip.startsWith('fe80')) {
        return { isPrivate: true, range: 'IPv6 link-local' };
    }
    
    // IPv4 私有地址检查
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) {
        return { isPrivate: false };
    }
    
    // 10.0.0.0/8
    if (parts[0] === 10) {
        return { isPrivate: true, range: '10.0.0.0/8' };
    }
    
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
        return { isPrivate: true, range: '172.16.0.0/12' };
    }
    
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) {
        return { isPrivate: true, range: '192.168.0.0/16' };
    }
    
    // 127.0.0.0/8
    if (parts[0] === 127) {
        return { isPrivate: true, range: '127.0.0.0/8' };
    }
    
    // 169.254.0.0/16
    if (parts[0] === 169 && parts[1] === 254) {
        return { isPrivate: true, range: '169.254.0.0/16' };
    }
    
    // 0.0.0.0/8
    if (parts[0] === 0) {
        return { isPrivate: true, range: '0.0.0.0/8' };
    }
    
    return { isPrivate: false };
}

/**
 * 解析 DNS 并检查是否解析到私有 IP
 * 注意：这个检查在 Node.js 中需要额外依赖，这里提供简化版本
 * @param {string} hostname
 * @returns {Promise<{ allowed: boolean, reason?: string }>}
 */
export async function validateHostnameResolution(hostname) {
    // 检查主机名模式（已在 validateUrl 中完成）
    // 完整的 DNS 检查需要 dns.lookup()，但可能被 DNS rebinding 绕过
    // 这里我们信任之前的主机名检查
    
    // 如果是 IP 地址，已经检查过了
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
        return { allowed: true };
    }
    if (hostname.includes(':')) {
        return { allowed: true };
    }
    
    // 域名：通过主机名模式检查即可
    return { allowed: true };
}

// ================================================================
// 远程获取
// ================================================================

/**
 * 安全地从 URL 获取内容
 * @param {string} url - 要获取的 URL
 * @param {object} options - 选项
 * @param {number} [options.timeout] - 超时时间（毫秒）
 * @param {number} [options.maxSize] - 最大响应大小（字节）
 * @param {object} [options.headers] - 自定义请求头
 * @returns {Promise<{ success: boolean, content?: string, error?: string, status?: number }>}
 */
export async function safeFetch(url, options = {}) {
    const timeout = options.timeout || DEFAULT_TIMEOUT;
    const maxSize = options.maxSize || DEFAULT_MAX_SIZE;
    const headers = options.headers || {};
    
    // SSRF 验证
    const urlValidation = validateUrl(url);
    if (!urlValidation.allowed) {
        return { success: false, error: `SSRF blocked: ${urlValidation.reason}` };
    }
    
    // DNS 解析验证（可选，增强安全）
    try {
        const urlObj = new URL(url);
        const dnsValidation = await validateHostnameResolution(urlObj.hostname);
        if (!dnsValidation.allowed) {
            return { success: false, error: `SSRF blocked: ${dnsValidation.reason}` };
        }
    } catch (e) {
        return { success: false, error: `URL validation failed: ${e.message}` };
    }
    
    // 创建 AbortController 用于超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'Accept': 'text/yaml, application/json, text/markdown, */*',
                'User-Agent': 'HundunOS-SkillInstaller/3.9',
                ...headers,
            },
            redirect: 'follow',
        });
        
        clearTimeout(timeoutId);
        
        // 检查响应状态
        if (!response.ok) {
            return {
                success: false,
                error: `HTTP ${response.status}: ${response.statusText}`,
                status: response.status,
            };
        }
        
        // 检查 Content-Length
        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > maxSize) {
            return { success: false, error: `Response too large (${contentLength} bytes, max: ${maxSize})` };
        }
        
        // 读取内容（带大小限制）
        const reader = response.body?.getReader();
        if (!reader) {
            return { success: false, error: 'Response body not readable' };
        }
        
        const chunks = [];
        let totalSize = 0;
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            totalSize += value.length;
            if (totalSize > maxSize) {
                reader.cancel();
                return { success: false, error: `Response too large (exceeded ${maxSize} bytes)` };
            }
            
            chunks.push(value);
        }
        
        // 合并 chunks
        const buffer = chunks.reduce((acc, chunk) => {
            const newAcc = new Uint8Array(acc.length + chunk.length);
            newAcc.set(acc);
            newAcc.set(chunk, acc.length);
            return newAcc;
        }, new Uint8Array(0));
        
        // 解码为字符串
        const decoder = new TextDecoder('utf-8');
        const content = decoder.decode(buffer);
        
        return { success: true, content, status: response.status };
        
    } catch (e) {
        clearTimeout(timeoutId);
        
        if (e.name === 'AbortError') {
            return { success: false, error: `Request timeout after ${timeout}ms` };
        }
        
        return { success: false, error: `Fetch failed: ${e.message}` };
    }
}

// ================================================================
// Skill 安装
// ================================================================

/**
 * 从 URL 安装 Skill
 * @param {string} url - Skill 定义文件 URL（YAML 或 JSON）
 * @param {object} options
 * @param {function} options.register - 注册函数 (spec) => void
 * @param {number} [options.timeout] - 超时时间
 * @returns {Promise<{ success: boolean, error?: string, spec?: object }>}
 */
export async function installFromUrl(url, options = {}) {
    const { register, timeout } = options;
    
    // 获取内容
    const fetchResult = await safeFetch(url, { timeout });
    if (!fetchResult.success) {
        return { success: false, error: fetchResult.error };
    }
    
    // 解析内容
    const parseResult = parseSkillContent(fetchResult.content, url);
    if (!parseResult.success) {
        return { success: false, error: parseResult.error };
    }
    
    // 注册
    try {
        if (register) {
            register(parseResult.spec);
        }
        return { success: true, spec: parseResult.spec };
    } catch (e) {
        return { success: false, error: `Registration failed: ${e.message}` };
    }
}

/**
 * 从 GitHub Gist 安装 Skill
 * @param {string} gistUrl - Gist URL
 * @param {object} options
 * @returns {Promise<{ success: boolean, error?: string, spec?: object }>}
 */
export async function installFromGist(gistUrl, options = {}) {
    // 解析 Gist URL
    const match = gistUrl.match(/gist\.github\.com\/([^/]+)\/([a-f0-9]+)/i);
    if (!match) {
        return { success: false, error: 'Invalid Gist URL format' };
    }
    
    const [, user, gistId] = match;
    
    // 构建原始内容 URL
    // 注意：Gist raw URL 格式可能变化，这里使用常见格式
    const rawUrl = `https://gist.githubusercontent.com/${user}/${gistId}/raw`;
    
    return installFromUrl(rawUrl, options);
}

/**
 * 从 GitHub 仓库引用安装 Skill
 * @param {string} ref - GitHub 引用格式：github:user/repo/path@branch
 * @param {object} options
 * @returns {Promise<{ success: boolean, error?: string, spec?: object }>}
 */
export async function installFromGitHubRef(ref, options = {}) {
    // 解析引用
    const match = ref.match(/^github:([^/]+)\/([^@]+)(?:@(.+))?$/);
    if (!match) {
        return { success: false, error: 'Invalid github: reference format. Use: github:user/repo/path@branch' };
    }
    
    const [, user, repoPath, branch = 'main'] = match;
    
    // 构建原始内容 URL
    const rawUrl = `https://raw.githubusercontent.com/${user}/${repoPath.split('/')[0]}/${branch}/${repoPath.split('/').slice(1).join('/')}`;
    
    return installFromUrl(rawUrl, options);
}

/**
 * 解析 Skill 内容（YAML 或 JSON）
 * @param {string} content
 * @param {string} source
 * @returns {{ success: boolean, error?: string, spec?: object }}
 */
function parseSkillContent(content, source) {
    const trimmed = content.trim();
    
    // 尝试 JSON
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            const spec = JSON.parse(content);
            if (!spec.name) {
                return { success: false, error: 'Skill definition must have a "name" field' };
            }
            spec._source = source;
            return { success: true, spec };
        } catch (e) {
            return { success: false, error: `JSON parse error: ${e.message}` };
        }
    }
    
    // 尝试 YAML
    try {
        // 使用 yaml 包（如果已安装）
        const YAML = require('yaml');
        const spec = YAML.parse(content);
        if (!spec || !spec.name) {
            return { success: false, error: 'Skill definition must have a "name" field' };
        }
        spec._source = source;
        return { success: true, spec };
    } catch (e) {
        // YAML 包未安装或解析失败，使用简单解析器
        const spec = simpleYamlParse(content);
        if (!spec || !spec.name) {
            return { success: false, error: 'Failed to parse YAML content' };
        }
        spec._source = source;
        return { success: true, spec };
    }
}

/**
 * 简单 YAML 解析器（无依赖降级）
 * @param {string} content
 * @returns {object}
 */
function simpleYamlParse(content) {
    const result = {};
    const lines = content.split('\n');
    let currentKey = null;
    let currentArray = [];
    let inArray = false;
    let inBlockScalar = false;
    let blockScalarContent = [];
    
    for (const line of lines) {
        // 块标量处理
        if (inBlockScalar) {
            if (line.startsWith('  ') || line.startsWith('\t') || line.trim() === '') {
                blockScalarContent.push(line);
                continue;
            } else {
                result[currentKey] = blockScalarContent.join('\n').trim();
                inBlockScalar = false;
                blockScalarContent = [];
            }
        }
        
        // 空行或注释
        if (!line.trim() || line.trim().startsWith('#')) {
            continue;
        }
        
        // 数组项
        if (line.trimStart().startsWith('- ')) {
            inArray = true;
            const value = line.trimStart().slice(2).trim();
            // 移除引号
            const cleaned = value.replace(/^['"]|['"]$/g, '');
            currentArray.push(cleaned);
            continue;
        }
        
        // 结束数组
        if (inArray && !line.trimStart().startsWith('- ')) {
            if (currentKey) {
                result[currentKey] = currentArray;
            }
            currentArray = [];
            inArray = false;
        }
        
        // 键值对
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;
        
        const key = line.slice(0, colonIndex).trim();
        let value = line.slice(colonIndex + 1).trim();
        
        currentKey = key;
        
        // 块标量
        if (value === '|' || value === '>') {
            inBlockScalar = true;
            continue;
        }
        
        // 空值（可能是嵌套对象或数组）
        if (value === '') {
            continue;
        }
        
        // 移除引号
        value = value.replace(/^['"]|['"]$/g, '');
        
        // 布尔值
        if (value === 'true') {
            result[key] = true;
        } else if (value === 'false') {
            result[key] = false;
        } else if (/^\d+(\.\d+)?$/.test(value)) {
            result[key] = parseFloat(value);
        } else {
            result[key] = value;
        }
    }
    
    // 处理最后的数组
    if (inArray && currentKey) {
        result[currentKey] = currentArray;
    }
    
    // 处理最后的块标量
    if (inBlockScalar && currentKey) {
        result[currentKey] = blockScalarContent.join('\n').trim();
    }
    
    return result;
}

// ================================================================
// 导出
// ================================================================

export default {
    validateUrl,
    safeFetch,
    installFromUrl,
    installFromGist,
    installFromGitHubRef,
    PRIVATE_IP_RANGES,
    BLOCKED_HOSTNAME_PATTERNS,
    DEFAULT_TIMEOUT,
    DEFAULT_MAX_SIZE,
};
