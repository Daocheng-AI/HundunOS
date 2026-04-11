// hundunos/stable-modules/cowork-monitor/index.js — Cowork Monitor v3.0

export class CoworkMonitor {
    constructor(kernel) {
        this.kernel = kernel;
        this.activeSessions = new Map();
        this.history = [];
    }

    async initialize() {
        // Kernel facade: delegate to messageBus (kernel.messageBus.on is the event subscription API)
        if (this.kernel.messageBus?.on) {
            this.kernel.messageBus.on('permission:approved', (a) => this._onApproved(a));
        }
        // review: removed // review: removed console.log('[Cowork] Initialized');
    }

    async monitor(intent, permission) {
        if (permission.source !== 'cowork') return;
        const session = {
            id: permission.approvalId,
            intent, permission,
            status: 'preparing',
            progress: 0, steps: [],
            startedAt: null, completedAt: null,
            canCancel: true, killSwitch: false
        };
        this.activeSessions.set(session.id, session);
        await this._notifyStart(session);
        return session;
    }

    async _onApproved(approval) {
        const session = this.activeSessions.get(approval.id);
        if (!session) return;
        session.status = 'running';
        session.startedAt = Date.now();
        this._runWithProgress(session).catch(e => { session.status = 'error'; session.error = e.message; });
    }

    async _runWithProgress(session) {
        const { intent } = session;
        const steps = this._planSteps(intent);
        session.steps = steps;

        for (let i = 0; i < steps.length; i++) {
            if (session.killSwitch) { session.status = 'cancelled'; await this._notifyCancelled(session); return; }
            session.currentStep = i;
            session.progress = Math.round((i / steps.length) * 100);
            await this._notifyProgress(session);
            try { await this._executeStep(steps[i], session); steps[i].status = 'completed'; }
            catch (e) { steps[i].status = 'failed'; steps[i].error = e.message; session.status = 'error'; session.error = e.message; await this._notifyError(session); return; }
        }

        session.status = 'completed';
        session.progress = 100;
        session.completedAt = Date.now();
        this.history.push({ ...session });
        if (this.history.length > 100) this.history.shift();
        await this._notifyCompleted(session);
    }

    _planSteps(intent) {
        const plans = {
            'file_delete': () => [
                { id: 1, name: '扫描目标文件', type: 'scan' },
                { id: 2, name: '创建备份快照', type: 'backup' },
                { id: 3, name: '执行删除操作', type: 'execute' },
                { id: 4, name: '验证删除结果', type: 'verify' }
            ]
        };
        const planner = plans[intent.action] || (() => [{ id: 1, name: '执行操作', type: 'execute' }]);
        return planner(intent);
    }

    async _executeStep(step, session) { await new Promise(r => setTimeout(r, 500)); }

    async _notifyStart(session) {
        await this.kernel.messageBus.publish('cowork:started', { sessionId: session.id, title: `开始执行: ${session.intent.description}`, steps: session.steps.map(s => s.name) });
    }

    async _notifyProgress(session) {
        await this.kernel.messageBus.publish('cowork:progress', { sessionId: session.id, progress: session.progress, currentStep: session.steps[session.currentStep]?.name });
    }

    async _notifyCompleted(session) { await this.kernel.messageBus.publish('cowork:completed', { sessionId: session.id, summary: `完成 ${session.steps.filter(s => s.status === 'completed').length} 步` }); }

    async _notifyCancelled(session) { await this.kernel.messageBus.publish('cowork:cancelled', { sessionId: session.id }); }

    async _notifyError(session) { await this.kernel.messageBus.publish('cowork:error', { sessionId: session.id, error: session.error }); }

    async cancel(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session || !session.canCancel) return { success: false };
        session.killSwitch = true;
        return { success: true };
    }

    getActive() { return Array.from(this.activeSessions.values()); }
    getHistory() { return this.history; }
}
