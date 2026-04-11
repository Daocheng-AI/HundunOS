// hundunos/stable-modules/permission-gating/index.js — Permission Gating v3.1
// 集成 Claude Code 风格的多层权限流水线

import { randomUUID } from 'crypto';
import { checkPermission, createDefaultRules } from '../../kernel/permission-pipeline.js';
import { validatePath, PROTECTED_PATHS } from '../../kernel/path-validation.js';
import { PermissionMode } from '../../kernel/permission-mode.js';
import { createLogger } from '../../kernel/logger.js';

const logger = createLogger('Permission');

export class PermissionGating {
    constructor(kernel) {
        this.kernel = kernel;
        this.policies = new Map();
        this.pendingApprovals = [];
        this.permanentAllow = new Map();
        this.stats = { total: 0, allowed: 0, denied: 0, pending: 0 };
        
        // 集成新的权限流水线
        this.permissionMode = PermissionMode.DEFAULT;
        this.rules = createDefaultRules();
        
        this._initPolicies();
    }

    async initialize() {
        await this.loadPermanentAllow();
        
        // 加载配置中的权限模式
        const mode = this.kernel?.config?.system?.permissionMode;
        if (mode) {
            this.permissionMode = mode;
        }
        
        // 加载自定义规则
        const customRules = this.kernel?.config?.system?.permissionRules;
        if (customRules) {
            this.rules = { ...this.rules, ...customRules };
        }
        
        // review: removed // review: removed console.log(`[Permission] Initialized: mode=${this.permissionMode}, rules=${Object.keys(this.rules).length}`);
    }

    _initPolicies() {
        this.policies.set('dangerous', { level: 'explicit', timeout: 0, requiresReason: true, logRequired: true });
        this.policies.set('normal', { level: 'auto', timeout: 3600, requiresReason: false, logRequired: false });
        this.policies.set('system', { level: 'approval', timeout: 300, requiresReason: true, logRequired: true });
        this.policies.set('cowork', { level: 'cowork', timeout: 600, requiresReason: true, logRequired: true, realtimeNotify: true });
        this.policies.set('deny', { level: 'deny', timeout: 0, requiresReason: false, logRequired: true });
    }

    /**
     * 主要权限检查方法 - 集成多层流水线
     */
    async check(intent, message) {
        this.stats.total++;
        const op = this._buildOperation(intent, message);

        // 0. 检查永久授权
        const permanent = this._checkPermanent(op);
        if (permanent) { 
            this.stats.allowed++; 
            return { allowed: true, source: 'permanent' }; 
        }

        // 构建工具调用对象，用于流水线检查
        const toolUse = {
            name: this._getToolName(intent),
            input: intent.parameters || {},
            id: `tool_${Date.now()}`,
        };

        // 集成新的权限流水线检查
        try {
            const pipelineResult = await checkPermission(
                toolUse,
                this.permissionMode,
                {
                    rules: this.rules,
                    tools: this.kernel?.tools || new Map(),
                    workspaceRoot: this.kernel?.config?.workspace,
                }
            );

            // 流水线返回 allow
            if (pipelineResult.decision === 'allow') {
                this.stats.allowed++;
                return { allowed: true, source: 'pipeline' };
            }

            // 流水线返回 deny
            if (pipelineResult.decision === 'deny') {
                this.stats.denied++;
                return { allowed: false, source: 'pipeline_deny', reason: pipelineResult.reason };
            }

            // 流水线返回 ask，继续原有逻辑
        } catch (e) {
            logger.warn('Pipeline check failed:', e.message);
        }

        // 原有风险推断逻辑作为后备
        const riskLevel = this._inferRisk(op);
        const policy = this.policies.get(riskLevel) || this.policies.get('normal');

        switch (policy.level) {
            case 'auto': 
                this.stats.allowed++; 
                return { allowed: true, source: 'auto' };
            case 'explicit': 
                return await this._requestExplicit(op, message, policy);
            case 'approval': 
                return await this._requestApproval(op, message, policy);
            case 'cowork': 
                return { allowed: true, source: 'cowork', approvalId: `cowork_${Date.now()}` };
            case 'deny': 
                this.stats.denied++; 
                return { allowed: false, source: 'policy_deny', reason: 'Policy deny' };
        }
        
        this.stats.allowed++; 
        return { allowed: true, source: 'default' };
    }

    /**
     * 将 intent 映射为工具名
     */
    _getToolName(intent) {
        const action = intent.action || '';
        
        // 映射到工具名
        if (action.includes('read') || action.includes('file_search')) return 'Read';
        if (action.includes('write') || action.includes('create')) return 'Write';
        if (action.includes('edit') || action.includes('modify')) return 'Edit';
        if (action.includes('delete') || action.includes('remove')) return 'Delete';
        if (action.includes('execute') || action.includes('run') || action.includes('bash')) return 'Bash';
        
        return 'Unknown';
    }

    _buildOperation(intent, message) {
        return {
            type: intent.type || 'unknown',
            action: intent.action || 'unknown',
            target: intent.parameters?.target || '',
            description: `${intent.type}:${intent.action}`,
            riskLevel: this._inferRisk({ type: intent.type, action: intent.action }),
            context: { sessionId: message.sessionId, user: 'user' }
        };
    }

    _inferRisk(op) {
        // 精确匹配 action
        const dangerous = new Set(['file_delete', 'network_send', 'system_change', 'delete', 'rm', 'destroy', 'wipe']);
        const system = new Set(['kernel_upgrade', 'module_install', 'config_write', 'kernel_downgrade', 'module_uninstall']);

        const action = op.action || '';
        if (dangerous.has(action)) return 'dangerous';
        if (system.has(action)) return 'system';

        // 危险前缀匹配
        const dangerousPrefixes = ['file_delete:', 'network_send:', 'destroy_', 'wipe_'];
        if (dangerousPrefixes.some(p => action.startsWith(p))) return 'dangerous';

        return 'normal';
    }

    _checkPermanent(op) {
        const key = `${op.type}:${op.action}:${op.target}`;
        const entry = this.permanentAllow.get(key);
        if (entry && (!entry.expiresAt || entry.expiresAt > Date.now())) return entry;
        return null;
    }

    async _requestExplicit(op, message, policy) {
        const pending = {
            id: `approval_${randomUUID()}`,
            operation: op, status: 'pending', created: Date.now()
        };
        this.pendingApprovals.push(pending);
        this.stats.pending++;
        return { allowed: false, source: 'pending', approvalId: pending.id, reason: 'Requires explicit approval' };
    }

    async _requestApproval(op, message, policy) {
        const pending = {
            id: `approval_${randomUUID()}`,
            operation: op, status: 'pending', created: Date.now(), requiresReason: true
        };
        this.pendingApprovals.push(pending);
        this.stats.pending++;
        return { allowed: false, source: 'pending', approvalId: pending.id, reason: 'Requires multi-level approval' };
    }

    async approve(approvalId, options = {}) {
        const approval = this.pendingApprovals.find(a => a.id === approvalId);
        if (!approval) return { success: false, reason: 'Not found' };
        approval.status = 'approved';
        this.stats.pending--;
        if (options.permanent) {
            const key = `${approval.operation.type}:${approval.operation.action}:${approval.operation.target}`;
            this.permanentAllow.set(key, { operation: approval.operation, reason: approval.operation?.description || 'User-approved permanent authorization', created: Date.now() });
            await this.savePermanentAllow();
        }
        return { success: true };
    }

    async deny(approvalId, reason = '') {
        const approval = this.pendingApprovals.find(a => a.id === approvalId);
        if (!approval) return { success: false };
        approval.status = 'denied';
        this.stats.pending--;
        return { success: true };
    }

    getPending(id) {
        return this.pendingApprovals.find(a => a.id === id && a.status === 'pending');
    }

    async savePermanentAllow() {
        await this.kernel.storage.put('permission:permanent', Array.from(this.permanentAllow.entries()));
    }

    async loadPermanentAllow() {
        const data = await this.kernel.storage.get('permission:permanent');
        if (data) this.permanentAllow = new Map(data);
    }

    /**
     * 设置权限模式
     */
    setPermissionMode(mode) {
        this.permissionMode = mode;
        // review: removed // review: removed console.log(`[Permission] Mode changed to: ${mode}`);
    }

    /**
     * 更新规则
     */
    updateRules(newRules) {
        this.rules = { ...this.rules, ...newRules };
        // review: removed // review: removed console.log('[Permission] Rules updated');
    }

    getStats() { 
        return { 
            ...this.stats, 
            pending: this.pendingApprovals.filter(a => a.status === 'pending').length,
            mode: this.permissionMode,
        }; 
    }
}