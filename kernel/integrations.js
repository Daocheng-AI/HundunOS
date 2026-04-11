/**
 * kernel/integrations.js
 * HundunOS v3.1 新模块集成
 * 
 * 此文件提供新模块的导入和初始化逻辑
 * 需要手动添加到 kernel/core.js 中
 */

// ============== Subagents 集成 ==============

/**
 * 初始化 SubagentManager
 * 位置: 在 initialize() 中，在 modelRouter 之后
 */
async function _initSubagentManager() {
    const { SubagentManager } = await import('./subagents/index.js');
    this.subagentManager = new SubagentManager(this);
    await this.subagentManager.initialize?.() || Promise.resolve();
    // review: removed // review: removed console.log(`[Kernel] SubagentManager: ${this.subagentManager.getStats().totalSubagents} subagents`);
}

// ============== Skills 集成 ==============

/**
 * 初始化 SkillLoader
 * 位置: 在 initialize() 中，在 subagentManager 之后
 */
async function _initSkillLoader() {
    const { SkillLoader, SkillExecutor } = await import('./skills/index.js');
    
    // 从配置获取 skill 目录
    const path = await import('path');
    const skillDirs = this.config.system?.skills?.dirs || ['./.claude/skills', './skills'];
    const resolvedDirs = skillDirs.map(d => {
        return path.resolve(this.config.projectRoot, d);
    });
    
    this.skillLoader = new SkillLoader(resolvedDirs);
    this.skillLoader.loadAllMetadata();
    
    this.skillExecutor = new SkillExecutor(this.skillLoader);
    
    // review: removed // review: removed console.log(`[Kernel] SkillLoader: ${this.skillLoader.metadata.size} skills loaded`);
}

// ============== Hooks 集成 ==============

/**
 * 初始化 HookExecutor
 * 位置: 在 initialize() 中，在 skillLoader 之后
 */
async function _initHookExecutor() {
    const { HookExecutor, createDefaultHooks } = await import('./hooks/index.js');
    
    // 从配置加载 hooks
    const hooksConfig = this.config.system?.hooks || createDefaultHooks();
    this.hookExecutor = new HookExecutor({ hooks: hooksConfig });
    
    // review: removed // review: removed console.log(`[Kernel] HookExecutor: initialized`);
}

/**
 * 触发 Hook 事件
 */
async function _triggerHook(eventName, input) {
    if (!this.hookExecutor) return null;
    return await this.hookExecutor.trigger(eventName, input);
}

// ============== 权限模式配置 ==============

/**
 * 配置权限模式
 */
function _configurePermissionMode() {
    const mode = this.config.system?.permissionMode || 'default';
    if (this.permissionGating?.setPermissionMode) {
        this.permissionGating.setPermissionMode(mode);
    }
    // review: removed // review: removed console.log(`[Kernel] Permission mode: ${mode}`);
}

// ============== 内置模块更新 ==============

/**
 * 更新 _registerBuiltInModules 添加新内置模块
 */
function _registerNewBuiltins() {
    // 添加 SubagentManager 内置模块
    if (this.subagentManager && !this.moduleRegistry.has('subagentManager')) {
        this.moduleRegistry.register({
            id: 'subagentManager',
            name: 'Subagent Manager',
            type: 'kernel',
            instance: {
                execute: async () => ({ 
                    success: true, 
                    stats: this.subagentManager.getStats() 
                }),
                shutdown: async () => {
                    // 清理活跃会话
                    // review: removed // review: removed console.log('[Kernel] SubagentManager shutdown');
                }
            }
        });
    }

    // 添加 SkillLoader 内置模块
    if (this.skillLoader && !this.moduleRegistry.has('skillLoader')) {
        this.moduleRegistry.register({
            id: 'skillLoader',
            name: 'Skill Loader',
            type: 'kernel',
            instance: {
                execute: async () => ({ 
                    success: true, 
                    skills: this.skillLoader.getSkillNames(),
                    count: this.skillLoader.metadata.size,
                    byPriority: Object.fromEntries(
                        this.skillLoader.getAllMetadata().map(s => [s.priority || 'unknown', s.name])
                    ),
                    schema: this.skillLoader.getSchema(),
                })
            }
        });
    }

    // 添加 HookExecutor 内置模块
    if (this.hookExecutor && !this.moduleRegistry.has('hookExecutor')) {
        this.moduleRegistry.register({
            id: 'hookExecutor',
            name: 'Hook Executor',
            type: 'kernel',
            instance: {
                execute: async (intent) => {
                    // 手动触发 Hook
                    return { success: true };
                }
            }
        });
    }
}

// ============== 更新 process() 添加 Hook 支持 ==============

/**
 * 在 process() 中集成 Hooks
 * 位置: 在权限检查之前，添加 PreToolUse Hook
 */
async function _processPreHook(message) {
    if (!this.hookExecutor) return null;
    
    return await this.hookExecutor.trigger('UserPromptSubmit', {
        session_id: message.sessionId,
        cwd: this.config.workspace,
        hook_event_name: 'UserPromptSubmit',
        user_prompt: message.content,
    });
}

/**
 * 在 process() 中集成 Hooks
 * 位置: 在工具执行后，添加 PostToolUse Hook
 */
async function _processPostHook(toolUse, result) {
    if (!this.hookExecutor) return null;
    
    return await this.hookExecutor.trigger('PostToolUse', {
        session_id: result.sessionId,
        cwd: this.config.workspace,
        hook_event_name: 'PostToolUse',
        tool_name: toolUse.name,
        tool_input: toolUse.input,
        tool_use_id: toolUse.id,
    });
}

export {
    _initSubagentManager,
    _initSkillLoader,
    _initHookExecutor,
    _configurePermissionMode,
    _registerNewBuiltins,
    _processPreHook,
    _processPostHook,
};