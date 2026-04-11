// hundunos/kernel/message-router.js — Message Router v3.0
// 意图 → 模块路由

export class MessageRouter {
    constructor(kernel) {
        this.kernel = kernel;
        this.routes = [];  // [{intent, type, action, modules[]}]
        this.defaultModules = ['modelRouter'];
        this._initRoutes();
    }

    async initialize() {
        // review: removed // review: removed console.log('[MessageRouter] Initialized with', this.routes.length, 'routes');
    }

    _initRoutes() {
        // 意图 → 模块映射
        this.routes = [
            { type: 'system', action: 'status', modules: ['status'] },
            { type: 'system', action: 'shutdown', modules: ['shutdown'] },
            { type: 'system', action: 'kernel_upgrade', modules: ['upgradeController'] },
            { type: 'system', action: 'health_check', modules: ['healthMonitor'] },
            { type: 'file', action: 'read', modules: ['fileReader'] },
            { type: 'file', action: 'write', modules: ['fileWriter'] },
            { type: 'file', action: 'delete', modules: ['fileWriter'] },
            { type: 'file', action: 'search', modules: ['fileSearch', 'modelRouter'] },
            { type: 'code', modules: ['modelRouter'] },
            { type: 'analysis', modules: ['modelRouter'] },
            { type: 'search', modules: ['modelRouter'] },
            { type: 'task', modules: ['aware', 'modelRouter'] },
            { type: 'edict', modules: ['edict'] },
            { type: 'reminder', modules: ['aware'] },
            { type: 'aware', modules: ['aware'] },
            { type: 'research', action: 'autocode', modules: ['intentEngine'] },
            { type: 'permission', modules: ['permissionGating'] },
            { type: 'health', modules: ['healthMonitor'] },
            { type: 'memory', modules: ['recoverableMemory'] },
            { type: 'chat', modules: ['modelRouter'] },
        ];
    }

    async route(intent, session) {
        if (!intent || !intent.type) return this.defaultModules;

        // 精确匹配
        const match = this.routes.find(r =>
            r.type === intent.type && (!r.action || r.action === intent.action)
        );

        if (match) return match.modules;

        // 类型匹配
        const typeMatch = this.routes.find(r => r.type === intent.type && !r.action);
        if (typeMatch) return typeMatch.modules;

        // 默认
        return this.defaultModules;
    }

    addRoute(intentType, intentAction, modules) {
        this.routes.push({ type: intentType, action: intentAction, modules });
    }

    removeRoute(intentType, intentAction) {
        this.routes = this.routes.filter(r =>
            !(r.type === intentType && (!intentAction || r.action === intentAction))
        );
    }

    listRouteModules() {
        return Array.from(new Set(this.routes.flatMap(route => route.modules || [])));
    }

    validateRoutes(moduleRegistry) {
        return this.listRouteModules().filter(moduleId => !moduleRegistry?.has?.(moduleId));
    }
}
