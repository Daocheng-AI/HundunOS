/**
 * HundunOS v3.0 - edict 核心引擎（重写版）
 * 三省六部核心引擎 - 完整版
 * 
 * 重写日期: 2026-04-07
 * 对齐原版 Python edict 核心特性：
 * - 9状态状态机 + 严格转换校验
 * - EventBus 事件驱动架构
 * - 停滞检测与升级路径
 * - 快慢分桶并发控制
 * - 三级记忆注入
 * - Prompt 注入检测
 * - 富上下文组装
 */

import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// 目录配置
// ============================================================================

const DATA_DIR = path.join(__dirname, '../../../data/edict');
const EDICTS_DIR = path.join(DATA_DIR, 'edicts');
const MEMORIALS_DIR = path.join(DATA_DIR, 'memorials');
const CONFIG_DIR = path.join(__dirname, '../config');
const MEMORY_DIR = path.join(DATA_DIR, 'memory');

const SHARED_MEMORY_FILE = path.join(MEMORY_DIR, 'shared_memory.json');
const AGENT_MEMORY_DIR = path.join(MEMORY_DIR, 'agents');
const DLQ_DIR = path.join(DATA_DIR, 'dlq');

let _dirsInitialized = false;

function ensureDirs() {
    if (!_dirsInitialized) {
        [EDICTS_DIR, MEMORIALS_DIR, MEMORY_DIR, AGENT_MEMORY_DIR, DLQ_DIR].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
        _dirsInitialized = true;
    }
}

// ============================================================================
// 常量定义
// ============================================================================

const TaskStatus = {
    TAIZI: 'taizi',
    ZHONGSHU: 'zhongshu',
    MENXIA: 'menxia',
    ASSIGNED: 'assigned',
    DOING: 'doing',
    REVIEW: 'review',
    COMPLETED: 'completed',
    BLOCKED: 'blocked',
    CANCELED: 'canceled'
};

const STATE_TRANSITIONS = {
    [TaskStatus.TAIZI]: [TaskStatus.ZHONGSHU, TaskStatus.CANCELED, TaskStatus.BLOCKED],
    [TaskStatus.ZHONGSHU]: [TaskStatus.MENXIA, TaskStatus.TAIZI, TaskStatus.CANCELED, TaskStatus.BLOCKED],
    [TaskStatus.MENXIA]: [TaskStatus.ASSIGNED, TaskStatus.ZHONGSHU, TaskStatus.CANCELED, TaskStatus.BLOCKED],
    [TaskStatus.ASSIGNED]: [TaskStatus.DOING, TaskStatus.MENXIA, TaskStatus.CANCELED, TaskStatus.BLOCKED],
    [TaskStatus.DOING]: [TaskStatus.REVIEW, TaskStatus.ASSIGNED, TaskStatus.BLOCKED, TaskStatus.CANCELED],
    [TaskStatus.REVIEW]: [TaskStatus.COMPLETED, TaskStatus.DOING, TaskStatus.BLOCKED],
    [TaskStatus.COMPLETED]: [],
    [TaskStatus.BLOCKED]: [TaskStatus.DOING, TaskStatus.CANCELED],
    [TaskStatus.CANCELED]: []
};

const ESCALATION_PATH = [
    'bingbu', 'hubu', 'libu', 'xingbu', 'gongbu', 'libu_doc',
    'shangshu', 'menxia', 'zhongshu', 'taizi'
];

const AGENT_BUCKETS = {
    fast: { agents: ['taizi', 'zhongshu', 'menxia', 'shangshu'], limit: 4 },
    slow: { agents: ['bingbu', 'hubu', 'libu', 'xingbu', 'gongbu', 'libu_doc'], limit: 3 }
};

const STALLED_CONFIG = {
    checkIntervalMs: 60000,
    timeoutMs: 300000,
    maxRetries: 3,
    backoffBase: 2,
    backoffMultiplier: 2
};

const INJECTION_PATTERNS = [
    /ignore\s+(previous|all|above)\s+(instructions?|prompts?|rules?)/i,
    /disregard\s+(all|any|previous)\s+(instructions?|rules?)/i,
    /you\s+are\s+now\s+(a|an)\s+\w+/i,
    /pretend\s+(to\s+be|you('re|are))/i,
    /act\s+as\s+(if|a|an)/i,
    /forget\s+(everything|all|previous)/i,
    /new\s+instructions?:/i,
    /override\s+(previous|default|all)\s+(instructions?|rules?|settings?)/i,
    /system:\s*you\s+(must|should|are)\s+(now|to)/i,
    /\[SYSTEM\]|\[ADMIN\]|\[ROOT\]/i,
    /\<\|.*?\|\>/,
    /```system\s/i,
    /inject\s+(code|prompt|command)/i,
    /escape\s+(sandbox|container|mode)/i
];

const EventTopics = {
    TASK_CREATED: 'task.created',
    TASK_STATUS: 'task.status',
    TASK_DISPATCH: 'task.dispatch',
    TASK_COMPLETED: 'task.completed',
    TASK_STALLED: 'task.stalled',
    TASK_ESCALATED: 'task.escalated',
    TASK_BLOCKED: 'task.blocked',
    INJECTION_ALERT: 'security.injection',
    AGENT_ERROR: 'agent.error'
};

// ============================================================================
// EventBus
// ============================================================================

class EventBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(50);
        this.outbox = [];
        this.subscribers = new Map();
    }

    subscribe(topic, handler) {
        if (!this.subscribers.has(topic)) {
            this.subscribers.set(topic, []);
        }
        this.subscribers.get(topic).push(handler);
        this.on(topic, handler);
        return () => this.unsubscribe(topic, handler);
    }

    unsubscribe(topic, handler) {
        const handlers = this.subscribers.get(topic);
        if (handlers) {
            const idx = handlers.indexOf(handler);
            if (idx >= 0) {
                handlers.splice(idx, 1);
                this.off(topic, handler);
            }
        }
    }

    publish(topic, event) {
        const enrichedEvent = {
            ...event,
            topic,
            timestamp: new Date().toISOString(),
            eventId: `evt_${randomUUID()}`
        };
        this.outbox.push(enrichedEvent);
        if (this.outbox.length > 1000) {
            this.outbox = this.outbox.slice(-500);
        }
        this.emit(topic, enrichedEvent);
        // console.log(`[EventBus] ${topic}: ${enrichedEvent.eventId}`);
        return enrichedEvent;
    }

    getOutboxEvents(topic = null) {
        if (topic) {
            return this.outbox.filter(e => e.topic === topic);
        }
        return [...this.outbox];
    }

    clearOutbox(eventId) {
        if (eventId) {
            this.outbox = this.outbox.filter(e => e.eventId !== eventId);
        } else {
            this.outbox = [];
        }
    }
}

const eventBus = new EventBus();

// ============================================================================
// Semaphore
// ============================================================================

class Semaphore {
    constructor(limit) {
        this.limit = limit;
        this.current = 0;
        this.queue = [];
    }

    async acquire() {
        if (this.current < this.limit) {
            this.current++;
            return () => this.release();
        }
        return new Promise(resolve => {
            this.queue.push(() => {
                this.current++;
                resolve(() => this.release());
            });
        });
    }

    release() {
        this.current--;
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            next();
        }
    }

    getStats() {
        return { limit: this.limit, current: this.current, waiting: this.queue.length };
    }
}

const semaphores = {
    fast: new Semaphore(AGENT_BUCKETS.fast.limit),
    slow: new Semaphore(AGENT_BUCKETS.slow.limit)
};

function getSemaphore(agentId) {
    if (AGENT_BUCKETS.fast.agents.includes(agentId)) {
        return semaphores.fast;
    }
    return semaphores.slow;
}

// ============================================================================
// 数据模型
// ============================================================================

export class Edict {
    constructor(userId, message, title = null) {
        this.id = `edict_${randomUUID()}`;
        this.userId = userId;
        this.title = title || message.slice(0, 40);
        this.message = message;
        this.status = TaskStatus.TAIZI;
        this.createdAt = new Date().toISOString();
        this.updatedAt = new Date().toISOString();
        this.stage = 'taizi';
        this.retries = 0;
        this.maxRetries = STALLED_CONFIG.maxRetries;
        this.subtasks = [];
        this.plan = null;
        this.reviewResult = null;
        this.executedBy = null;
        this.assignedTo = null;
        this.result = null;
        this.log = [];
        this.todos = [];
        this.flowRecords = [];
        this.progress = [];
        this.reminders = [];
        this.escalationLevel = 0;
        this.lastActivityAt = new Date().toISOString();
        this.blockedReason = null;
        this.canceledReason = null;
    }
}

export class Memorial {
    constructor(edict) {
        this.id = `memorial_${randomUUID()}`;
        this.edictId = edict.id;
        this.userId = edict.userId;
        this.title = edict.title;
        this.status = edict.status;
        this.result = edict.result;
        this.createdAt = new Date().toISOString();
        this.flowSummary = edict.flowRecords || [];
        this.progressSummary = edict.progress || [];
    }
}

// ============================================================================
// 工具函数
// ============================================================================

async function safeRegexTest(pattern, text, timeoutMs = 100) {
    if (!pattern || typeof text !== 'string') return false;
    if (text.length > 500) return false;
    try {
        const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
        const result = await Promise.race([
            Promise.resolve(regex.test(text)),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Regex timeout')), timeoutMs))
        ]);
        return result;
    } catch {
        return false;
    }
}

function validateEdictId(id) {
    if (!id || typeof id !== 'string') return false;
    if (id.includes('..') || id.includes('/') || id.includes('\\') || id.includes(':')) {
        return false;
    }
    return true;
}

function generateTimestampId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

// ============================================================================
// 状态机
// ============================================================================

function isValidTransition(currentStatus, targetStatus) {
    const allowedTargets = STATE_TRANSITIONS[currentStatus];
    if (!allowedTargets) return false;
    return allowedTargets.includes(targetStatus);
}

function safeUpdateStatus(edict, newStatus, reason = null) {
    if (!isValidTransition(edict.status, newStatus)) {
        const error = `Invalid state transition: ${edict.status} → ${newStatus}`;
        console.error(`[StateMachine] ${error}`);
        return { success: false, error };
    }
    const oldStatus = edict.status;
    edict.status = newStatus;
    edict.updatedAt = new Date().toISOString();
    edict.lastActivityAt = new Date().toISOString();
    edict.flowRecords.push({
        from: oldStatus,
        to: newStatus,
        reason,
        timestamp: new Date().toISOString()
    });
    eventBus.publish(EventTopics.TASK_STATUS, {
        edictId: edict.id,
        from: oldStatus,
        to: newStatus,
        reason
    });
    return { success: true };
}

// ============================================================================
// Prompt 注入检测
// ============================================================================

function detectInjection(text) {
    const detected = [];
    for (const pattern of INJECTION_PATTERNS) {
        if (pattern.test(text)) {
            detected.push({
                pattern: pattern.source,
                match: text.match(pattern)?.[0] || ''
            });
        }
    }
    if (detected.length > 0) {
        eventBus.publish(EventTopics.INJECTION_ALERT, {
            text: text.slice(0, 200),
            patterns: detected,
            severity: 'high'
        });
    }
    return detected;
}

// ============================================================================
// 三级记忆
// ============================================================================

function loadSharedMemory() {
    ensureDirs();
    if (fs.existsSync(SHARED_MEMORY_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(SHARED_MEMORY_FILE, 'utf-8'));
        } catch {
            return { entries: [] };
        }
    }
    return { entries: [] };
}

function saveSharedMemory(memory) {
    ensureDirs();
    fs.writeFileSync(SHARED_MEMORY_FILE, JSON.stringify(memory, null, 2), 'utf-8');
}

function loadAgentMemory(agentId) {
    ensureDirs();
    const filePath = path.join(AGENT_MEMORY_DIR, `${agentId}.json`);
    if (fs.existsSync(filePath)) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch {
            return { entries: [], pinned: [] };
        }
    }
    return { entries: [], pinned: [] };
}

function saveAgentMemory(agentId, memory) {
    ensureDirs();
    const filePath = path.join(AGENT_MEMORY_DIR, `${agentId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(memory, null, 2), 'utf-8');
}

function addAgentMemory(agentId, entry, relevance = 0.5, pinned = false) {
    const memory = loadAgentMemory(agentId);
    const newEntry = {
        id: generateTimestampId('mem'),
        content: entry,
        relevance,
        pinned,
        createdAt: new Date().toISOString()
    };
    if (pinned) {
        memory.pinned.unshift(newEntry);
    } else {
        memory.entries.push(newEntry);
        memory.entries.sort((a, b) => b.relevance - a.relevance);
        if (memory.entries.length > 100) {
            memory.entries = memory.entries.slice(0, 100);
        }
    }
    saveAgentMemory(agentId, memory);
    return newEntry;
}

function assembleMemoryContext(edict, agentId) {
    const context = { shared: [], permanent: [], taskContext: [] };
    const sharedMemory = loadSharedMemory();
    context.shared = sharedMemory.entries.slice(-10);
    const agentMemory = loadAgentMemory(agentId);
    context.permanent = [...agentMemory.pinned, ...agentMemory.entries.slice(0, 20)];
    context.taskContext = edict.flowRecords.map(r => ({
        stage: r.from,
        decision: r.reason,
        timestamp: r.timestamp
    }));
    return context;
}

function assembleRichContext(edict) {
    return {
        metadata: {
            id: edict.id,
            title: edict.title,
            message: edict.message,
            status: edict.status,
            stage: edict.stage,
            createdAt: edict.createdAt,
            updatedAt: edict.updatedAt,
            userId: edict.userId,
            retries: edict.retries,
            escalationLevel: edict.escalationLevel
        },
        todos: edict.todos || [],
        flowRecords: edict.flowRecords || [],
        progress: (edict.progress || []).slice(-5),
        plan: edict.plan,
        reviewResult: edict.reviewResult,
        reminders: edict.reminders || [],
        memory: assembleMemoryContext(edict, edict.assignedTo || edict.stage)
    };
}

// ============================================================================
// 存储操作
// ============================================================================

export function saveEdict(edict) {
    ensureDirs();
    if (!validateEdictId(edict.id)) return edict;
    const filePath = path.join(EDICTS_DIR, `${edict.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(edict, null, 2), 'utf-8');
    return edict;
}

export function getEdict(edictId) {
    ensureDirs();
    if (!validateEdictId(edictId)) return null;
    const filePath = path.join(EDICTS_DIR, `${edictId}.json`);
    if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    return null;
}

export function updateEdict(edictId, updates) {
    if (!validateEdictId(edictId)) return null;
    const edict = getEdict(edictId);
    if (!edict) return null;
    Object.assign(edict, updates);
    edict.updatedAt = new Date().toISOString();
    edict.lastActivityAt = new Date().toISOString();
    return saveEdict(edict);
}

export function createEdict(userId, message, title = null) {
    const injectionDetected = detectInjection(message);
    const edict = new Edict(userId, message, title);
    if (injectionDetected.length > 0) {
        edict.reminders.push({
            type: 'security_warning',
            message: '检测到潜在的安全风险，已加强审核',
            patterns: injectionDetected.map(d => d.pattern)
        });
    }
    addLog(edict.id, 'system', 'created', `旨意创建: ${message.slice(0, 50)}`);
    saveEdict(edict);
    eventBus.publish(EventTopics.TASK_CREATED, {
        edictId: edict.id,
        userId,
        title: edict.title
    });
    return edict;
}

export function createMemorial(edict) {
    if (!validateEdictId(edict.id)) return null;
    const memorial = new Memorial(edict);
    const filePath = path.join(MEMORIALS_DIR, `${memorial.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(memorial, null, 2), 'utf-8');
    return memorial;
}

// ============================================================================
// DLQ
// ============================================================================

function sendToDLQ(edict, error, fatalError = false) {
    ensureDirs();
    const dlqEntry = {
        id: generateTimestampId('dlq'),
        edictId: edict.id,
        edict,
        error: error.message || error,
        fatalError,
        timestamp: new Date().toISOString(),
        retries: edict.retries
    };
    const filePath = path.join(DLQ_DIR, `${dlqEntry.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(dlqEntry, null, 2), 'utf-8');
    eventBus.publish(EventTopics.AGENT_ERROR, {
        edictId: edict.id,
        error: error.message || error,
        fatalError
    });
    return dlqEntry;
}

function getDLQEntries() {
    ensureDirs();
    const files = fs.readdirSync(DLQ_DIR).filter(f => f.endsWith('.json'));
    return files.map(f => {
        try {
            return JSON.parse(fs.readFileSync(path.join(DLQ_DIR, f), 'utf-8'));
        } catch {
            return null;
        }
    }).filter(Boolean);
}

// ============================================================================
// 日志
// ============================================================================

export function addLog(edictId, stage, action, detail) {
    if (!validateEdictId(edictId)) return;
    const edict = getEdict(edictId);
    if (!edict) return;
    edict.log.push({
        timestamp: new Date().toISOString(),
        stage,
        action,
        detail
    });
    edict.progress.push({
        stage,
        action,
        detail,
        timestamp: new Date().toISOString()
    });
    saveEdict(edict);
}

// ============================================================================
// 配置
// ============================================================================

export function loadConfig(name) {
    const filePath = path.join(CONFIG_DIR, `${name}.json`);
    if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    return {};
}

export async function matchWhitelist(message) {
    const whitelist = loadConfig('whitelist');
    const items = whitelist.items || [];
    for (const item of items) {
        if (item.pattern) {
            const matched = await safeRegexTest(item.pattern, message);
            if (matched) return item;
        }
        if (item.keywords && item.keywords.some(kw => message.includes(kw))) {
            return item;
        }
    }
    return null;
}

// ============================================================================
// 中书省
// ============================================================================

const TASK_TYPE_RULES = [
    { type: 'code', keywords: ['代码', '写', 'python', '脚本', '实现', '编程', '开发', '调试', 'js', 'javascript'] },
    { type: 'data', keywords: ['数据', '分析', '统计', '报表', 'excel', 'csv', '表格'] },
    { type: 'document', keywords: ['文档', '报告', '文章', '写作', '总结', '说明', '公文'] },
    { type: 'search', keywords: ['搜索', '查找', '查询', '找', '搜一下', '查一下'] },
    { type: 'system', keywords: ['整理', '清理', '桌面', '文件', '目录', '系统'] },
    { type: 'review', keywords: ['检查', '审查', '审核', '看看', '验证', '测试'] },
    { type: 'plan', keywords: ['规划', '计划', '方案', '设计', '安排', '分配'] },
];

function detectTaskType(message) {
    const lower = message.toLowerCase();
    for (const rule of TASK_TYPE_RULES) {
        if (rule.keywords.some(kw => lower.includes(kw))) {
            return rule.type;
        }
    }
    return 'general';
}

const MINISTRY_MAP = {
    code: { id: 'bingbu', name: '兵部', desc: '技术实现与编码' },
    data: { id: 'hubu', name: '户部', desc: '数据处理与分析' },
    document: { id: 'libu_doc', name: '礼部', desc: '文档撰写与整理' },
    search: { id: 'gongbu', name: '工部', desc: '搜索与信息获取' },
    system: { id: 'gongbu', name: '工部', desc: '系统操作与文件管理' },
    review: { id: 'xingbu', name: '刑部', desc: '审核与检查' },
    plan: { id: 'libu', name: '吏部', desc: '规划与资源调度' },
    general: { id: 'bingbu', name: '兵部', desc: '通用任务处理' },
};

async function plan(edictId) {
    const edict = getEdict(edictId);
    if (!edict) return { error: 'edict not found' };
    const transition = safeUpdateStatus(edict, TaskStatus.ZHONGSHU, '进入中书省规划');
    if (!transition.success) return { error: transition.error };
    saveEdict(edict);
    addLog(edictId, 'zhongshu', 'plan_start', '中书省开始规划...');
    const message = edict.message;
    const taskType = detectTaskType(message);
    const ministry = MINISTRY_MAP[taskType] || MINISTRY_MAP.general;
    const planData = {
        taskType,
        ministry: ministry.id,
        ministryName: ministry.name,
        complexity: message.length > 100 ? 'complex' : message.length > 30 ? 'moderate' : 'simple',
        subtasks: generateSubtasks(message, taskType),
        estimatedSteps: 1,
        priority: 'normal',
        plannedAt: new Date().toISOString()
    };
    planData.estimatedSteps = planData.subtasks.length;
    edict.plan = planData;
    edict.stage = 'menxia';
    edict.executedBy = ministry.id;
    const menxiaTransition = safeUpdateStatus(edict, TaskStatus.MENXIA, '规划完成，进入门下省审核');
    if (!menxiaTransition.success) return { error: menxiaTransition.error };
    saveEdict(edict);
    addLog(edictId, 'zhongshu', 'plan_done', `规划完成: ${ministry.name} 执行, ${planData.subtasks.length} 个子任务`);
    return { status: 'ok', plan: planData };
}

function generateSubtasks(message, taskType) {
    const templates = {
        code: ['分析需求', '设计方案', '编写代码', '测试验证'],
        data: ['数据读取', '数据清洗', '分析处理', '生成报告'],
        document: ['收集资料', '整理大纲', '撰写内容', '审核校对'],
        search: ['解析查询', '执行搜索', '整理结果'],
        system: ['扫描目标', '分析结构', '执行操作', '验证结果'],
        review: ['读取内容', '分析问题', '生成报告'],
        plan: ['分析需求', '制定方案', '分配资源', '输出计划'],
        general: ['分析任务', '执行处理', '输出结果']
    };
    const steps = templates[taskType] || templates.general;
    return steps.map((name, i) => ({ id: `sub_${i + 1}`, name, status: 'pending', order: i + 1 }));
}

// ============================================================================
// 门下省
// ============================================================================

const REJECT_RULES = [
    { pattern: /删除.*系统|格式化.*磁盘|rm\s+-rf[\/\s]|del\s+[\/\\][sfq]|remove\s+[\/\\][rf]|shutdown\s+-?h|halt|init\s+0/i, reason: '危险操作：可能损坏系统' },
    { pattern: /drop\s+(database|table|index)|truncate\s+table|delete\s+from\s+\w+\s*where\s*1\s*=\s*1|rm\s+-rf\s*\/$/i, reason: '危险操作：数据库或目录破坏' },
    { pattern: /kill\s+(-9\s+)?(1|init|sshd|systemd)|pkill\s+-9|^kill\s+-9$/i, reason: '危险操作：进程破坏' },
    { pattern: /泄露.*密码|获取.*私钥|exfiltrate|curl.*credential|base64.*password/i, reason: '安全风险：凭证或密钥泄露' },
    { pattern: /发送.*病毒|传播.*恶意|发送.*木马|植入.*后门/i, reason: '安全风险：恶意内容' },
];

const REVISE_RULES = [
    { pattern: /不清楚|不明确|模糊/, reason: '任务描述不够清晰，需要补充细节' },
];

async function review(edictId) {
    const edict = getEdict(edictId);
    if (!edict) return { verdict: 'ERROR', reason: 'edict not found' };
    addLog(edictId, 'menxia', 'review_start', '门下省开始审核...');
    const message = edict.message;
    for (const rule of REJECT_RULES) {
        if (rule.pattern.test(message)) {
            edict.reviewResult = { verdict: 'REJECT', reason: rule.reason };
            safeUpdateStatus(edict, TaskStatus.BLOCKED, rule.reason);
            edict.blockedReason = rule.reason;
            saveEdict(edict);
            addLog(edictId, 'menxia', 'review_reject', rule.reason);
            eventBus.publish(EventTopics.TASK_BLOCKED, { edictId, reason: rule.reason });
            return { verdict: 'REJECT', reason: rule.reason };
        }
    }
    for (const rule of REVISE_RULES) {
        if (rule.pattern.test(message)) {
            edict.reviewResult = { verdict: 'REVISE', reason: rule.reason };
            saveEdict(edict);
            addLog(edictId, 'menxia', 'review_revise', rule.reason);
            return { verdict: 'REVISE', reason: rule.reason };
        }
    }
    const reviewResult = {
        verdict: 'APPROVE',
        ministry: edict.plan?.ministry || 'bingbu',
        reason: '任务合规，准予执行',
        approvedAt: new Date().toISOString()
    };
    edict.reviewResult = reviewResult;
    edict.stage = 'shangshu';
    const transition = safeUpdateStatus(edict, TaskStatus.ASSIGNED, '审核通过，尚书省派发');
    if (!transition.success) return { verdict: 'ERROR', reason: transition.error };
    saveEdict(edict);
    addLog(edictId, 'menxia', 'review_approve', `审核通过 → ${reviewResult.ministry}`);
    eventBus.publish(EventTopics.TASK_DISPATCH, { edictId, ministry: reviewResult.ministry });
    return reviewResult;
}

// ============================================================================
// 尚书省
// ============================================================================

async function dispatch(edictId) {
    const edict = getEdict(edictId);
    if (!edict) return { error: 'edict not found' };
    const target = edict.executedBy || edict.plan?.ministry || 'bingbu';
    const ministryInfo = Object.values(MINISTRY_MAP).find(m => m.id === target) || MINISTRY_MAP.general;
    const transition = safeUpdateStatus(edict, TaskStatus.DOING, `调度到 ${ministryInfo.name}`);
    if (!transition.success) return { error: transition.error };
    edict.assignedTo = target;
    saveEdict(edict);
    addLog(edictId, 'shangshu', 'dispatch_start', `调度到 ${ministryInfo.name}（${target}）`);
    const semaphore = getSemaphore(target);
    const release = await semaphore.acquire();
    try {
        const subtasks = edict.plan?.subtasks || [];
        const results = [];
        for (const subtask of subtasks) {
            try {
                const subtaskResult = await executeSubtask(subtask, edict, target);
                results.push(subtaskResult);
                const currentEdict = getEdict(edictId);
                if (currentEdict.plan?.subtasks) {
                    const idx = currentEdict.plan.subtasks.findIndex(s => s.id === subtask.id);
                    if (idx >= 0) {
                        currentEdict.plan.subtasks[idx].status = 'done';
                        currentEdict.plan.subtasks[idx].result = subtaskResult;
                        saveEdict(currentEdict);
                    }
                }
            } catch (subtaskError) {
                results.push({
                    subtaskId: subtask.id,
                    name: subtask.name,
                    status: 'failed',
                    error: subtaskError.message
                });
                addLog(edictId, target, 'subtask_error', `子任务 ${subtask.name} 失败: ${subtaskError.message}`);
            }
        }
        const dispatchResult = {
            dispatched: true,
            target,
            ministryName: ministryInfo.name,
            subtaskCount: subtasks.length,
            completedCount: results.filter(r => r.status !== 'failed').length,
            results,
            completedAt: new Date().toISOString()
        };
        edict.result = dispatchResult;
        safeUpdateStatus(edict, TaskStatus.REVIEW, '执行完成，待审查');
        saveEdict(edict);
        addLog(edictId, 'shangshu', 'dispatch_done', `执行完成: ${results.filter(r => r.status !== 'failed').length}/${subtasks.length} 子任务`);
        return dispatchResult;
    } catch (error) {
        edict.retries++;
        if (edict.retries >= edict.maxRetries) {
            sendToDLQ(edict, error, true);
            safeUpdateStatus(edict, TaskStatus.BLOCKED, '超过最大重试次数');
            edict.blockedReason = error.message;
            saveEdict(edict);
        }
        throw error;
    } finally {
        release();
    }
}

async function executeSubtask(subtask, edict, ministryId) {
    let ministry;
    try {
        const ministries = await import('../ministeries/index.js');
        ministry = ministries.getMinistry(ministryId);
    } catch (importError) {
        return {
            subtaskId: subtask.id,
            name: subtask.name,
            status: 'skipped',
            note: 'Ministry module not available',
            ministry: ministryId,
            executedAt: new Date().toISOString()
        };
    }
    if (!ministry) {
        return {
            subtaskId: subtask.id,
            name: subtask.name,
            status: 'failed',
            error: `Ministry not found: ${ministryId}`,
            ministry: ministryId,
            executedAt: new Date().toISOString()
        };
    }
    try {
        const result = await ministry.execute(subtask, edict);
        return {
            subtaskId: subtask.id,
            name: subtask.name,
            status: result.status || 'done',
            ministry: ministryId,
            result: result.content || result,
            executedAt: new Date().toISOString()
        };
    } catch (e) {
        return {
            subtaskId: subtask.id,
            name: subtask.name,
            status: 'failed',
            error: e.message,
            ministry: ministryId,
            executedAt: new Date().toISOString()
        };
    }
}

// ============================================================================
// 完成审查
// ============================================================================

async function completeTask(edictId) {
    const edict = getEdict(edictId);
    if (!edict) return { error: 'edict not found' };
    const transition = safeUpdateStatus(edict, TaskStatus.COMPLETED, '任务完成');
    if (!transition.success) return { error: transition.error };
    edict.completedAt = new Date().toISOString();
    saveEdict(edict);
    addLog(edictId, 'system', 'completed', '旨意执行完成');
    eventBus.publish(EventTopics.TASK_COMPLETED, {
        edictId,
        result: edict.result
    });
    const memorial = createMemorial(edict);
    return { status: 'completed', edictId, memorialId: memorial.id };
}

// ============================================================================
// 取消任务
// ============================================================================

function cancelEdict(edictId, reason = null) {
    const edict = getEdict(edictId);
    if (!edict) return { error: 'edict not found' };
    const transition = safeUpdateStatus(edict, TaskStatus.CANCELED, reason || '用户取消');
    if (!transition.success) return { error: transition.error };
    edict.canceledReason = reason || '用户取消';
    edict.canceledAt = new Date().toISOString();
    saveEdict(edict);
    addLog(edictId, 'system', 'canceled', reason || '用户取消');
    return { status: 'canceled', edictId };
}

// ============================================================================
// 停滞检测与恢复
// ============================================================================

let stalledCheckTimer = null;

function startStalledDetection() {
    if (stalledCheckTimer) return;
    stalledCheckTimer = setInterval(() => {
        checkStalledTasks();
    }, STALLED_CONFIG.checkIntervalMs);
    // console.log('[StalledDetection] Started');
}

function stopStalledDetection() {
    if (stalledCheckTimer) {
        clearInterval(stalledCheckTimer);
        stalledCheckTimer = null;
        // console.log('[StalledDetection] Stopped');
    }
}

async function checkStalledTasks() {
    const edicts = listEdicts({ status: TaskStatus.DOING });
    const now = Date.now();
    for (const edict of edicts) {
        const lastActivity = new Date(edict.lastActivityAt).getTime();
        if (now - lastActivity > STALLED_CONFIG.timeoutMs) {
            await handleStalledTask(edict);
        }
    }
}

async function handleStalledTask(edict) {
    eventBus.publish(EventTopics.TASK_STALLED, {
        edictId: edict.id,
        retries: edict.retries
    });
    addLog(edict.id, 'system', 'stalled', `任务停滞检测触发，重试 ${edict.retries}/${edict.maxRetries}`);
    if (edict.retries < edict.maxRetries) {
        edict.retries++;
        const backoffDelay = Math.pow(STALLED_CONFIG.backoffMultiplier, edict.retries) * STALLED_CONFIG.backoffBase * 1000;
        setTimeout(() => {
            retryTask(edict.id);
        }, backoffDelay);
        addLog(edict.id, 'system', 'retry_scheduled', `将在 ${backoffDelay / 1000}s 后重试`);
    } else {
        escalateTask(edict);
    }
}

async function retryTask(edictId) {
    const edict = getEdict(edictId);
    if (!edict) return;
    addLog(edictId, 'system', 'retry', `开始重试（第 ${edict.retries} 次）`);
    try {
        await dispatch(edictId);
    } catch (error) {
        addLog(edictId, 'system', 'retry_failed', error.message);
    }
}

function escalateTask(edict) {
    const currentAssignee = edict.assignedTo || 'bingbu';
    const currentIdx = ESCALATION_PATH.indexOf(currentAssignee);
    if (currentIdx < ESCALATION_PATH.length - 1) {
        const newAssignee = ESCALATION_PATH[currentIdx + 1];
        edict.assignedTo = newAssignee;
        edict.escalationLevel++;
        safeUpdateStatus(edict, TaskStatus.BLOCKED, `升级到 ${newAssignee} 处理`);
        edict.blockedReason = `任务升级，需 ${newAssignee} 介入`;
        saveEdict(edict);
        eventBus.publish(EventTopics.TASK_ESCALATED, {
            edictId: edict.id,
            from: currentAssignee,
            to: newAssignee,
            level: edict.escalationLevel
        });
        addLog(edict.id, 'system', 'escalated', `升级到 ${newAssignee}`);
    } else {
        safeUpdateStatus(edict, TaskStatus.BLOCKED, '已升级到最高级别，需人工介入');
        edict.blockedReason = '无法继续升级，需要人工介入';
        saveEdict(edict);
        eventBus.publish(EventTopics.TASK_BLOCKED, {
            edictId: edict.id,
            reason: 'Max escalation level reached'
        });
        addLog(edict.id, 'system', 'max_escalation', '已升级到最高级别');
    }
}

// ============================================================================
// 主引擎
// ============================================================================

export async function processMessage(userId, message) {
    const edict = createEdict(userId, message);
    const edictId = edict.id;

    // console.log(`[Taizi] edict: ${edictId}`);

    const whitelistMatch = await matchWhitelist(message);
    if (whitelistMatch) {
        addLog(edictId, 'taizi', 'whitelist', `Matched: ${whitelistMatch.directTo || 'default'}, review will proceed`);
    }

    const planResult = await plan(edictId);
    if (planResult.error) {
        updateEdict(edictId, { status: TaskStatus.BLOCKED, blockedReason: planResult.error });
        return { status: 'error', edictId, error: planResult.error };
    }

    const reviewResult = await review(edictId);
    const verdict = reviewResult.verdict || 'ERROR';

    if (verdict === 'REJECT') {
        const updatedEdict = getEdict(edictId);
        const memorial = createMemorial(updatedEdict);
        return { status: 'rejected', edictId, memorialId: memorial.id, reason: reviewResult.reason };
    }

    if (verdict === 'REVISE') {
        return { status: 'revising', edictId, reason: reviewResult.reason };
    }

    const dispatchResult = await dispatch(edictId);
    if (dispatchResult.error) {
        return { status: 'error', edictId, error: dispatchResult.error };
    }

    const completeResult = await completeTask(edictId);
    const updatedEdict = getEdict(edictId);
    const memorial = createMemorial(updatedEdict);

    return {
        status: 'done',
        edictId,
        memorialId: memorial.id,
        result: dispatchResult
    };
}

// ============================================================================
// 查询接口
// ============================================================================

export function listEdicts(filter = {}) {
    ensureDirs();
    if (!fs.existsSync(EDICTS_DIR)) return [];
    const files = fs.readdirSync(EDICTS_DIR).filter(f => f.endsWith('.json'));
    const edicts = files.map(f => {
        try {
            return JSON.parse(fs.readFileSync(path.join(EDICTS_DIR, f), 'utf-8'));
        } catch {
            return null;
        }
    }).filter(Boolean);

    if (filter.status) return edicts.filter(e => e.status === filter.status);
    if (filter.userId) return edicts.filter(e => e.userId === filter.userId);
    if (filter.stage) return edicts.filter(e => e.stage === filter.stage);
    if (filter.assignedTo) return edicts.filter(e => e.assignedTo === filter.assignedTo);
    return edicts;
}

export function getStats() {
    const edicts = listEdicts();
    const stats = {
        total: edicts.length,
        byStatus: {},
        byMinistry: {},
        byStage: {},
        dlqCount: getDLQEntries().length
    };
    for (const e of edicts) {
        stats.byStatus[e.status] = (stats.byStatus[e.status] || 0) + 1;
        stats.byStage[e.stage] = (stats.byStage[e.stage] || 0) + 1;
        const m = e.plan?.ministry || e.assignedTo || 'unknown';
        stats.byMinistry[m] = (stats.byMinistry[m] || 0) + 1;
    }
    return stats;
}

// ============================================================================
// 导出工具函数
// ============================================================================

export function getEventBus() {
    return eventBus;
}

export function getSemaphores() {
    return {
        fast: semaphores.fast.getStats(),
        slow: semaphores.slow.getStats()
    };
}

export function getTaskStatus() {
    return TaskStatus;
}

export function getStateTransitions() {
    return STATE_TRANSITIONS;
}

export function getEscalationPath() {
    return ESCALATION_PATH;
}

export function getMinistryMap() {
    return MINISTRY_MAP;
}

export function getDLQ() {
    return getDLQEntries();
}

export function clearDLQ() {
    ensureDirs();
    const files = fs.readdirSync(DLQ_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
        fs.unlinkSync(path.join(DLQ_DIR, f));
    }
    return { cleared: files.length };
}

export {
    // 导出常量供外部使用
    TaskStatus,
    STATE_TRANSITIONS,
    ESCALATION_PATH,
    AGENT_BUCKETS,
    STALLED_CONFIG,
    INJECTION_PATTERNS,
    EventTopics,
    // 内部函数
    isValidTransition,
    safeUpdateStatus,
    detectInjection,
    assembleRichContext,
    assembleMemoryContext,
    loadSharedMemory,
    saveSharedMemory,
    loadAgentMemory,
    saveAgentMemory,
    addAgentMemory,
    startStalledDetection,
    stopStalledDetection,
    cancelEdict,
    completeTask
};

// ============================================================================
// 默认导出
// ============================================================================

export default {
    // 核心类
    Edict,
    Memorial,
    
    // 主要 API
    processMessage,
    createEdict,
    getEdict,
    updateEdict,
    saveEdict,
    createMemorial,
    addLog,
    loadConfig,
    matchWhitelist,
    listEdicts,
    getStats,
    
    // 工具
    detectTaskType,
    getEventBus,
    getSemaphores,
    getTaskStatus,
    getStateTransitions,
    getEscalationPath,
    getMinistryMap,
    getDLQ,
    clearDLQ,
    
    // 控制
    startStalledDetection,
    stopStalledDetection,
    cancelEdict,
    completeTask,
    
    // 常量
    TaskStatus,
    STATE_TRANSITIONS,
    ESCALATION_PATH,
    AGENT_BUCKETS,
    STALLED_CONFIG,
    INJECTION_PATTERNS,
    EventTopics,
    MINISTRY_MAP
};