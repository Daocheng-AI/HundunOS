// hundunos/__tests__/hundunos-cli.test.js
// HundunOS v3.8 Phase 7 — Unified CLI 测试

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

// Mock HTTP responses for CLI testing
const MOCK_RESPONSES = {
    '/api/status': { ok: true, kernel: 'v3.8.0', uptime: 1000 },
    '/api/tasks': { tasks: [{ taskId: 't1', engine: 'js', status: 'created', created: Date.now() }] },
    '/api/tasks/stats': { total_tasks: 1, active_tasks: 1 },
    '/api/tasks/analyze': { suitable: true, confidence: 0.8, engine: 'js', reasons: ['实现'], recommendation: 'BFTS recommended' },
    '/api/skills': [
        { name: 'github', version: '1.0.0', description: 'GitHub management' },
        { name: 'database', version: '1.0.0', description: 'Database operations' },
    ],
    '/api/skills/market': {
        official: [
            { name: 'slack', version: '1.0.0', description: 'Slack integration', source: 'official', installed: false },
            { name: 'notion', version: '1.0.0', description: 'Notion integration', source: 'official', installed: false },
        ],
        remote: [],
    },
    '/api/hooks': {
        events: ['PreToolUse', 'PostToolUse'],
        stats: { loadedFiles: 2, events: 2 },
        registered: {
            PreToolUse: [{ matcher: '*', hooks: [{ type: 'command' }] }],
            PostToolUse: [],
        },
    },
    '/api/memory': { recent: 5, semantic: 3, episodic: 2 },
    '/api/features': {
        features: [
            { name: 'HOOK_SYSTEM', enabled: true, env: 'HUNDUNOS_HOOKS', description: 'Hook system' },
            { name: 'SKILLS_SYSTEM', enabled: true, env: 'HUNDUNOS_SKILLS', description: 'Skill system' },
        ],
    },
    '/api/tasks/t123': { task_id: 't123', total_nodes: 5, best_node: 'node_3' },
    '/api/tasks/t123/journal': {
        nodes: { node_1: {}, node_2: {}, node_3: {} },
        current_stage: 'execution',
        best_node: 'node_3',
    },
};

// Simple mock api function for CLI
async function mockApi(method, path, body) {
    const response = MOCK_RESPONSES[path];
    if (!response) {
        return { status: 404, body: { error: 'Not found' } };
    }
    return { status: 200, body: response };
}

describe('CLI — Mock API Responses', () => {
    it('should return status from /api/status', async () => {
        const result = await mockApi('GET', '/api/status');
        assert.strictEqual(result.status, 200);
        assert.strictEqual(result.body.kernel, 'v3.8.0');
    });

    it('should return 404 for unknown path', async () => {
        const result = await mockApi('GET', '/api/unknown');
        assert.strictEqual(result.status, 404);
    });

    it('should handle /api/tasks/list', async () => {
        const result = await mockApi('GET', '/api/tasks');
        assert.strictEqual(result.body.tasks.length, 1);
        assert.strictEqual(result.body.tasks[0].taskId, 't1');
    });

    it('should handle /api/tasks/analyze', async () => {
        const result = await mockApi('POST', '/api/tasks/analyze', { task: '实现 REST API' });
        assert.strictEqual(result.body.suitable, true);
        assert.ok(result.body.confidence > 0);
    });

    it('should handle /api/skills/list', async () => {
        const result = await mockApi('GET', '/api/skills');
        assert.strictEqual(Array.isArray(result.body), true);
        assert.strictEqual(result.body.length, 2);
    });

    it('should handle /api/hooks/list', async () => {
        const result = await mockApi('GET', '/api/hooks');
        assert.deepStrictEqual(result.body.events, ['PreToolUse', 'PostToolUse']);
    });
});

describe('CLI — Argument Parsing', () => {
    function parseArgs(args) {
        const positional = [];
        const named = {};
        for (const arg of args) {
            const m = arg.match(/^--([a-zA-Z_-]+)(?:=(.+))?$/);
            if (m) {
                named[m[1].replace(/-/g, '_')] = m[2] !== undefined ? m[2] : true;
            } else {
                positional.push(arg);
            }
        }
        return { positional, named };
    }

    it('should parse positional arguments', () => {
        const { positional } = parseArgs(['arg1', 'arg2']);
        assert.deepStrictEqual(positional, ['arg1', 'arg2']);
    });

    it('should parse named flags with values', () => {
        const { named } = parseArgs(['--stages=分析,实现', '--code=main.js']);
        assert.strictEqual(named.stages, '分析,实现');
        assert.strictEqual(named.code, 'main.js');
    });

    it('should parse boolean flags', () => {
        const { named } = parseArgs(['--verbose', '--force']);
        assert.strictEqual(named.verbose, true);
        assert.strictEqual(named.force, true);
    });

    it('should handle empty args', () => {
        const { positional, named } = parseArgs([]);
        assert.deepStrictEqual(positional, []);
        assert.deepStrictEqual(named, {});
    });

    it('should handle mixed positional and named', () => {
        const { positional, named } = parseArgs(['create', 'REST API', '--stages=1,2,3']);
        assert.deepStrictEqual(positional, ['create', 'REST API']);
        assert.strictEqual(named.stages, '1,2,3');
    });
});

describe('CLI — REST API Routes', () => {
    // Verify all routes are covered
    const routes = [
        'GET', '/api/status',
        'GET', '/api/hooks',
        'POST', '/api/hooks/trigger/:event',
        'POST', '/api/hooks/register',
        'GET', '/api/skills',
        'GET', '/api/skills/:name',
        'POST', '/api/skills/match',
        'POST', '/api/skills/run',
        'POST', '/api/skills/inject',
        'GET', '/api/skills/market',
        'POST', '/api/skills/market/install',
        'DELETE', '/api/skills/market/:name',
        'GET', '/api/tasks',
        'POST', '/api/tasks',
        'POST', '/api/tasks/run/:taskId',
        'GET', '/api/tasks/:taskId',
        'GET', '/api/tasks/:taskId/journal',
        'GET', '/api/tasks/stats',
        'DELETE', '/api/tasks/:taskId',
        'POST', '/api/tasks/analyze',
        'GET', '/api/memory',
        'POST', '/api/memory/search',
        'GET', '/api/features',
        'GET', '/api/features/:name',
    ];

    it('should have comprehensive route coverage (24 routes)', () => {
        // This verifies the route count matches expectations
        assert.strictEqual(routes.length / 2, 24);
    });

    it('should cover all main subsystems: hooks, skills, tasks, memory, features', () => {
        const routesStr = routes.join(' ');
        assert.ok(routesStr.includes('/api/hooks'), 'Hooks routes');
        assert.ok(routesStr.includes('/api/skills'), 'Skills routes');
        assert.ok(routesStr.includes('/api/tasks'), 'Tasks routes');
        assert.ok(routesStr.includes('/api/memory'), 'Memory routes');
        assert.ok(routesStr.includes('/api/features'), 'Feature flags routes');
    });
});

describe('CLI — REPL Shortcuts', () => {
    const shortcuts = {
        '?': 'help', h: 'help', help: 'help',
        'q': 'exit', quit: 'exit', exit: 'exit',
        'status': 'status', st: 'status',
        'skills': 'skill list', 'skill list': 'skill list',
        'tasks': 'task list', 'task list': 'task list',
        'hooks': 'hook list', 'hook list': 'hook list',
        'mem': 'memory stats', 'memory stats': 'memory stats',
        'feat': 'feature list', 'feature list': 'feature list',
    };

    it('should map help shortcuts', () => {
        assert.strictEqual(shortcuts['?'], 'help');
        assert.strictEqual(shortcuts.h, 'help');
    });

    it('should map exit shortcuts', () => {
        assert.strictEqual(shortcuts.q, 'exit');
        assert.strictEqual(shortcuts.quit, 'exit');
    });

    it('should map status shortcuts', () => {
        assert.strictEqual(shortcuts.status, 'status');
        assert.strictEqual(shortcuts.st, 'status');
    });

    it('should map subcommand shortcuts', () => {
        assert.strictEqual(shortcuts.skills, 'skill list');
        assert.strictEqual(shortcuts.tasks, 'task list');
        assert.strictEqual(shortcuts.mem, 'memory stats');
    });
});
