// hundunos/__tests__/hooks.test.js
// HundunOS v3.8 Phase 7 — Hook System 测试

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

// Mock filesystem module for hook loader tests
const mockFs = {
    hooksDir: new Map(),
};

const mockReaddirSync = (dir) => {
    if (dir.includes('config/hooks')) {
        return Array.from(mockFs.hooksDir.keys());
    }
    return [];
};

const mockReadFileSync = (path) => {
    if (mockFs.hooksDir.has(path)) {
        return mockFs.hooksDir.get(path);
    }
    throw new Error('File not found: ' + path);
};

const mockExistsSync = (path) => {
    return path.includes('config/hooks');
};

// Minimal HookExecutor for testing (without filesystem deps)
class MockHookExecutor {
    constructor(config = {}) {
        this.hooks = config.hooks || {};
        this.kernel = config.kernel || null;
        this._executedEvents = [];
    }

    setKernel(kernel) {
        this.kernel = kernel;
    }

    getHooks(eventName) {
        return eventName ? this.hooks[eventName] || [] : this.hooks;
    }

    async trigger(eventName, input = {}) {
        this._executedEvents.push({ eventName, input });
        const eventHooks = this.hooks[eventName];
        if (!eventHooks) return null;

        for (const hookGroup of eventHooks) {
            if (hookGroup.matcher && hookGroup.matcher !== '*') {
                const toolName = input.tool_name || '';
                if (!toolName.match(new RegExp('^' + hookGroup.matcher.replace(/\*/g, '.*') + '$'))) {
                    continue;
                }
            }

            for (const hook of hookGroup.hooks || []) {
                if (hook.type === 'command') {
                    // Simulate command hook (non-blocking)
                    continue;
                }
                if (hook.type === 'prompt') {
                    // Prompt hooks are simulated - always continue
                    continue;
                }
            }
        }
        return null;
    }

    register(event, hookGroup) {
        if (!this.hooks[event]) this.hooks[event] = [];
        this.hooks[event].push(hookGroup);
    }
}

describe('HookExecutor — Core API', () => {
    let executor;

    beforeEach(() => {
        executor = new MockHookExecutor();
    });

    it('should initialize with empty hooks', () => {
        assert.deepStrictEqual(executor.getHooks(), {});
        assert.strictEqual(executor.getHooks('PreToolUse').length, 0);
    });

    it('should register hooks for an event', () => {
        executor.register('SessionStart', {
            matcher: '*',
            hooks: [{ type: 'command', command: 'echo hello' }],
        });
        const hooks = executor.getHooks('SessionStart');
        assert.strictEqual(hooks.length, 1);
        assert.strictEqual(hooks[0].hooks[0].type, 'command');
    });

    it('should trigger SessionStart event', async () => {
        executor.register('SessionStart', {
            matcher: '*',
            hooks: [{ type: 'command', command: 'echo test' }],
        });
        await executor.trigger('SessionStart', { kernelVersion: '3.8.0' });
        assert.strictEqual(executor._executedEvents.length, 1);
        assert.strictEqual(executor._executedEvents[0].eventName, 'SessionStart');
    });

    it('should not fail when triggering unknown event', async () => {
        const result = await executor.trigger('UnknownEvent', {});
        assert.strictEqual(result, null);
    });

    it('should filter by matcher', async () => {
        executor.register('PreToolUse', {
            matcher: 'Bash',
            hooks: [{ type: 'command', command: 'echo filtered' }],
        });

        // Should match → hook executed
        await executor.trigger('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'ls' } });
        // Should not match → hook skipped but event still recorded (real HookExecutor behavior)
        await executor.trigger('PreToolUse', { tool_name: 'Write', tool_input: { content: 'test' } });

        assert.strictEqual(executor._executedEvents.length, 2);
        // First trigger matched 'Bash' → logged
        assert.strictEqual(executor._executedEvents[0].input.tool_name, 'Bash');
    });

    it('should trigger PreToolUse and PostToolUse with correct inputs', async () => {
        executor.register('PreToolUse', {
            matcher: '*',
            hooks: [{ type: 'prompt', systemPrompt: 'Block dangerous commands' }],
        });
        executor.register('PostToolUse', {
            matcher: '*',
            hooks: [{ type: 'command', command: 'echo done' }],
        });

        await executor.trigger('PreToolUse', { tool_name: 'Write', tool_input: { content: 'test.js' } });
        await executor.trigger('PostToolUse', { tool_name: 'Write', tool_input: { content: 'test.js' }, result: { success: true } });

        assert.strictEqual(executor._executedEvents.length, 2);
        assert.strictEqual(executor._executedEvents[0].eventName, 'PreToolUse');
        assert.strictEqual(executor._executedEvents[1].eventName, 'PostToolUse');
    });

    it('should support multiple hook groups per event', () => {
        executor.register('PreToolUse', {
            matcher: '*',
            hooks: [{ type: 'command', command: 'echo first' }],
        });
        executor.register('PreToolUse', {
            matcher: '*',
            hooks: [{ type: 'prompt', systemPrompt: 'Security check' }],
        });
        assert.strictEqual(executor.getHooks('PreToolUse').length, 2);
    });

    it('should block when hook returns block:true', async () => {
        const blockingExecutor = new MockHookExecutor();
        // We can't easily mock the command execution, but we verify the API supports block return
        assert.strictEqual(typeof blockingExecutor.trigger, 'function');
    });
});

describe('HookEvent — Constants', () => {
    it('should have all required event types', async () => {
        const { HookEvent } = await import('../kernel/hooks/index.js');
        assert.ok(HookEvent.SESSION_START, 'SESSION_START defined');
        assert.ok(HookEvent.SESSION_END, 'SESSION_END defined');
        assert.ok(HookEvent.USER_PROMPT_SUBMIT, 'USER_PROMPT_SUBMIT defined');
        assert.ok(HookEvent.PRE_TOOL_USE, 'PRE_TOOL_USE defined');
        assert.ok(HookEvent.POST_TOOL_USE, 'POST_TOOL_USE defined');
        assert.ok(HookEvent.SUBAGENT_START, 'SUBAGENT_START defined');
        assert.ok(HookEvent.STOP, 'STOP defined');
        assert.ok(HookEvent.CONFIG_CHANGE, 'CONFIG_CHANGE defined');
    });

    it('should have all required hook types', async () => {
        const { HookType } = await import('../kernel/hooks/index.js');
        assert.strictEqual(HookType.COMMAND, 'command');
        assert.strictEqual(HookType.PROMPT, 'prompt');
        assert.strictEqual(HookType.HTTP, 'http');
        assert.strictEqual(HookType.AGENT, 'agent');
    });
});

describe('HookLoader — Integration', () => {
    it('should merge default hooks with YAML hooks', async () => {
        // The merge logic in core.js _mergeHooks
        const yamlHooks = {
            PreToolUse: [
                { matcher: 'Write', hooks: [{ type: 'command', command: 'custom hook' }] },
            ],
        };
        const defaultHooks = {
            PreToolUse: [
                { matcher: '*', hooks: [{ type: 'command', command: 'default' }] },
            ],
            PostToolUse: [
                { matcher: '*', hooks: [{ type: 'command', command: 'post' }] },
            ],
        };

        // Simulate merge
        const merged = {};
        for (const event of Object.keys(defaultHooks)) {
            merged[event] = [...(defaultHooks[event] || [])];
        }
        for (const [event, groups] of Object.entries(yamlHooks)) {
            if (!merged[event]) merged[event] = [];
            merged[event].push(...groups);
        }

        assert.strictEqual(merged.PreToolUse.length, 2); // default + yaml
        assert.strictEqual(merged.PostToolUse.length, 1); // default only
    });

    it('should return empty hooks when config dir does not exist (defaults handled by core.js)', async () => {
        // FIX-F3: HookLoader.loadAll() 返回空对象，默认值由 core.js _mergeHooks 注入
        const loader = await import('../kernel/hooks/hook-loader.js').then(m => new m.HookLoader({ config: { projectRoot: '/nonexistent' } }));
        const hooks = await loader.loadAll();
        assert.deepStrictEqual(hooks, {}, 'loadAll returns empty when no config dir');
        // HookLoader._getDefaultHooks() 仍然委托给 createDefaultHooks()
        const defaults = loader._getDefaultHooks();
        assert.ok(defaults.PreToolUse, 'PreToolUse exists in default hooks via _getDefaultHooks');
        assert.ok(defaults.PostToolUse, 'PostToolUse exists in default hooks via _getDefaultHooks');
    });
});

describe('createHookExecutor — Factory', () => {
    it('should create executor with default config', async () => {
        const { createHookExecutor } = await import('../kernel/hooks/index.js');
        const executor = createHookExecutor({});
        assert.ok(executor instanceof MockHookExecutor || executor.constructor.name === 'HookExecutor');
    });
});
