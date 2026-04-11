// hundunos/__tests__/skill-market.test.js
// HundunOS v3.8 Phase 7 — SkillMarket 测试

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert';

// Mock SkillRegistry
class MockSkillRegistry extends EventTarget {
    constructor() {
        super();
        this.skills = new Map();
    }
    register(spec) {
        if (!spec?.name) return;
        spec._loadedAt = Date.now();
        this.skills.set(spec.name, spec);
    }
    unregister(name) { return this.skills.delete(name); }
    get(name) { return this.skills.get(name) || null; }
}

async function getSkillMarket() {
    const module = await import('../kernel/skills/skill-market.js');
    return module.SkillMarket;
}

describe('SkillMarket — Official Skills', async () => {
    const SkillMarket = await getSkillMarket();
    let market;
    let registry;

    beforeEach(() => {
        registry = new MockSkillRegistry();
        market = new SkillMarket(registry);
    });

    it('should list official skills', () => {
        const list = market.list();
        assert.ok(list.length >= 4, 'Should have at least 4 official skills');
        const names = list.map(s => s.name);
        assert.ok(names.includes('slack'), 'slack official skill');
        assert.ok(names.includes('notion'), 'notion official skill');
        assert.ok(names.includes('email'), 'email official skill');
        assert.ok(names.includes('sentry'), 'sentry official skill');
    });

    it('should mark all official skills as not installed initially', () => {
        const list = market.list();
        for (const skill of list) {
            assert.strictEqual(skill.installed, false, `${skill.name} should not be installed initially`);
        }
    });

    it('should install official skill by name', () => {
        const result = market.installOfficial('slack');
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.name, 'slack');
        assert.strictEqual(result.source, 'official');
        assert.strictEqual(registry.get('slack')?.name, 'slack');
    });

    it('should fail to install unknown official skill', () => {
        const result = market.installOfficial('unknown-skill-xyz');
        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('Unknown official skill'));
    });
});

describe('SkillMarket — install from content', async () => {
    const SkillMarket = await getSkillMarket();
    let market;
    let registry;

    beforeEach(() => {
        registry = new MockSkillRegistry();
        market = new SkillMarket(registry);
    });

    it('should install from YAML content', async () => {
        const yaml = `
name: my-custom-skill
version: 1.0.0
description: A custom skill from test
trigger:
  patterns:
    - custom
    - test
tools:
  - id: custom_tool
    type: function
    function: customFunction
`;
        const result = await market._installFromContent(yaml, 'test-source');
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.name, 'my-custom-skill');
        assert.strictEqual(registry.get('my-custom-skill')?.name, 'my-custom-skill');
    });

    it('should install from JSON content', async () => {
        const json = JSON.stringify({
            name: 'json-skill',
            version: '0.1.0',
            description: 'A JSON skill',
            trigger: { patterns: ['json'], semantic: false },
            tools: [],
        });
        const result = await market._installFromContent(json, 'test-source');
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.name, 'json-skill');
    });

    it('should reject content without name field', async () => {
        const yaml = `
version: 1.0.0
description: Missing name field
`;
        const result = await market._installFromContent(yaml, 'test-source');
        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('name'));
    });

    it('should handle YAML block scalars (|) correctly', async () => {
        const yaml = `
name: block-scalar-skill
version: 1.0.0
description: Test block scalar
system_prompt: |
  This is a
  multi-line
  prompt
trigger:
  patterns:
    - block
`;
        const result = await market._installFromContent(yaml, 'test-source');
        assert.strictEqual(result.success, true);
        const skill = registry.get('block-scalar-skill');
        assert.ok(skill.system_prompt.includes('multi-line'));
    });
});

describe('SkillMarket — simple YAML parser', async () => {
    const SkillMarket = await getSkillMarket();
    let market;
    let registry;

    beforeEach(() => {
        registry = new MockSkillRegistry();
        market = new SkillMarket(registry);
    });

    it('should parse simple key-value pairs', () => {
        const yaml = `name: test
version: "1.0.0"
enabled: true`;
        const result = market._simpleYamlParse(yaml);
        assert.strictEqual(result.name, 'test');
        assert.strictEqual(result.version, '1.0.0');
        assert.strictEqual(result.enabled, true);
    });

    it('should parse nested objects', () => {
        const yaml = `name: nested
trigger:
  patterns:
    - test
  semantic: false`;
        const result = market._simpleYamlParse(yaml);
        assert.strictEqual(result.name, 'nested');
        assert.deepStrictEqual(result.trigger, { patterns: ['test'], semantic: false });
    });

    it('should parse arrays', () => {
        const yaml = `name: array-test
tools:
  - id: tool1
    type: http
  - id: tool2
    type: function`;
        const result = market._simpleYamlParse(yaml);
        assert.strictEqual(result.tools.length, 2);
        assert.strictEqual(result.tools[0].id, 'tool1');
        assert.strictEqual(result.tools[1].type, 'function');
    });

    it('should ignore comments and blank lines', () => {
        const yaml = `# This is a comment
name: comment-test

# Another comment
version: "2.0.0"
`;
        const result = market._simpleYamlParse(yaml);
        assert.strictEqual(result.name, 'comment-test');
        assert.strictEqual(result.version, '2.0.0');
    });
});

describe('SkillMarket — GitHub reference', async () => {
    const SkillMarket = await getSkillMarket();
    let market;
    let registry;

    beforeEach(() => {
        registry = new MockSkillRegistry();
        market = new SkillMarket(registry);
    });

    it('should not crash on github: reference format', async () => {
        // Use very short timeout to avoid hanging on network calls in CI/test environments
        const installResult = await market.install('github:octocat/repo/skills/test.yaml@main', { timeout: 1000 });
        // Will fail because no network, but URL parsing should not throw
        assert.strictEqual(typeof installResult.success, 'boolean');
    });
});

describe('SkillMarket — cache management', async () => {
    const SkillMarket = await getSkillMarket();
    let market;
    let registry;

    beforeEach(() => {
        registry = new MockSkillRegistry();
        market = new SkillMarket(registry);
    });

    it('should track installed remote skills', () => {
        market.installOfficial('slack');
        assert.strictEqual(market.isInstalled('slack'), true);
        assert.strictEqual(market.isInstalled('notion'), false);
    });

    it('should uninstall skill from registry', () => {
        market.installOfficial('notion');
        assert.strictEqual(market.isInstalled('notion'), true);
        market.uninstall('notion');
        assert.strictEqual(market.isInstalled('notion'), false);
        assert.strictEqual(registry.get('notion'), null);
    });

    it('should report cache stats', () => {
        market.installOfficial('email');
        market.installOfficial('sentry');
        const stats = market.getCacheStats();
        assert.strictEqual(stats.total >= 2, true);
        assert.strictEqual(typeof stats.entries, 'object');
        assert.ok(Array.isArray(stats.entries));
    });

    it('should clean expired cache entries', () => {
        market.installOfficial('slack');
        // Manually add a stale cache entry
        market.cache.set('stale-skill', {
            spec: { name: 'stale-skill', version: '0.0.1' },
            downloadedAt: Date.now() - 48 * 60 * 60 * 1000,
            version: '0.0.1',
            source: 'http://example.com',
        });
        const result = market.cleanCache(24 * 60 * 60 * 1000);
        assert.strictEqual(result.cleaned >= 1, true);
        assert.strictEqual(market.cache.has('stale-skill'), false);
    });

    it('should listAll with official + remote', () => {
        market.installOfficial('slack');
        const all = market.listAll();
        assert.ok(all.official.length >= 4);
        assert.ok(Array.isArray(all.remote));
    });
});
