// __tests__/skill-tester.test.js
// HundunOS Skill Testing Framework 测试

import {
    MockTool,
    createMockTools,
    testSkill,
    assertions,
    TestSuite,
    describe,
    expect,
} from '../kernel/skills/skill-tester.js';

// ================================================================
// MockTool 测试
// ================================================================

async function testMockTool() {
    console.log('\n📋 MockTool Tests\n');
    
    // Test 1: Basic execution
    const tool = new MockTool('test-tool');
    const result = await tool.execute({ arg: 'value' });
    console.log('  ✅ MockTool: basic execution');
    expect(result.success).toBe(true);
    
    // Test 2: Custom response
    const tool2 = new MockTool('test-tool', {
        defaultResponse: { data: 'custom' },
    });
    const result2 = await tool2.execute({});
    console.log('  ✅ MockTool: custom response');
    expect(result2.data).toBe('custom');
    
    // Test 3: Pattern responses
    const tool3 = new MockTool('test-tool', {
        responses: {
            '*': { matched: true },
        },
    });
    const result3 = await tool3.execute({ any: 'params' });
    console.log('  ✅ MockTool: pattern response');
    expect(result3.matched).toBe(true);
    
    // Test 4: Call tracking
    tool.reset();
    await tool.execute({ a: 1 });
    await tool.execute({ b: 2 });
    console.log('  ✅ MockTool: call tracking');
    expect(tool.getCallCount()).toBe(2);
    expect(tool.getLastCall()).toEqual({ b: 2 });
}

// ================================================================
// createMockTools 测试
// ================================================================

async function testCreateMockTools() {
    console.log('\n📋 createMockTools Tests\n');
    
    const tools = createMockTools(['tool1', 'tool2', 'tool3']);
    
    console.log('  ✅ createMockTools: creates all tools');
    expect(Object.keys(tools).length).toBe(3);
    expect(tools.tool1).toBeTruthy();
    expect(tools.tool2).toBeTruthy();
    expect(tools.tool3).toBeTruthy();
}

// ================================================================
// testSkill 测试
// ================================================================

async function testTestSkill() {
    console.log('\n📋 testSkill Tests\n');
    
    const skillDef = {
        name: 'test-skill',
        triggers: ['test'],
        tools: ['echo', 'log'],
        system_prompt: 'You are a test assistant.',
    };
    
    const tools = createMockTools(['echo', 'log']);
    
    const result = await testSkill(skillDef, {
        input: 'test input',
        tools,
    });
    
    console.log('  ✅ testSkill: creates result');
    expect(result).toBeTruthy();
    expect(result.context).toBeTruthy();
    expect(result.context.skill).toEqual(skillDef);
}

// ================================================================
// Assertions 测试
// ================================================================

async function testAssertions() {
    console.log('\n📋 Assertions Tests\n');
    
    // Create a mock result
    const context = {
        getToolCalls: (name) => name ? [] : [{ tool: 'test', params: {} }],
        getToolCallCount: (name) => name ? 0 : 1,
        errors: [],
        getDuration: () => 100,
    };
    
    const result = {
        success: true,
        context,
        error: null,
        assertions: [],
    };
    
    // Test noErrors
    const noErr = assertions.noErrors(result);
    console.log('  ✅ assertions.noErrors: passes when no errors');
    expect(noErr).toBe(true);
    
    // Test succeeded
    const succ = assertions.succeeded(result);
    console.log('  ✅ assertions.succeeded: passes when success');
    expect(succ).toBe(true);
    
    // Test durationLessThan
    const dur = assertions.durationLessThan(result, 200);
    console.log('  ✅ assertions.durationLessThan: passes when within limit');
    expect(dur).toBe(true);
}

// ================================================================
// Expect 测试
// ================================================================

async function testExpect() {
    console.log('\n📋 Expect Tests\n');
    
    // toBe
    expect(1).toBe(1);
    console.log('  ✅ expect: toBe');
    
    // toEqual
    expect({ a: 1 }).toEqual({ a: 1 });
    console.log('  ✅ expect: toEqual');
    
    // toContain
    expect([1, 2, 3]).toContain(2);
    console.log('  ✅ expect: toContain');
    
    // toBeTruthy
    expect(true).toBeTruthy();
    console.log('  ✅ expect: toBeTruthy');
    
    // toBeFalsy
    expect(false).toBeFalsy();
    console.log('  ✅ expect: toBeFalsy');
    
    // toBeGreaterThan
    expect(5).toBeGreaterThan(3);
    console.log('  ✅ expect: toBeGreaterThan');
    
    // toBeLessThan
    expect(3).toBeLessThan(5);
    console.log('  ✅ expect: toBeLessThan');
}

// ================================================================
// TestSuite 测试
// ================================================================

async function testTestSuite() {
    console.log('\n📋 TestSuite Tests\n');
    
    const suite = describe('Sample Suite', (s) => {
        s.addTest('test 1', async () => {
            return { success: true, context: { errors: [], assertions: [] } };
        });
        
        s.addTest('test 2', async () => {
            return { success: true, context: { errors: [], assertions: [] } };
        });
    });
    
    const results = await suite.run();
    
    console.log('  ✅ TestSuite: runs all tests');
    expect(results.passed).toBe(2);
    expect(results.failed).toBe(0);
}

// ================================================================
// 主测试运行器
// ================================================================

async function main() {
    console.log('========================================');
    console.log('  Skill Testing Framework Tests');
    console.log('========================================');
    
    try {
        await testMockTool();
        await testCreateMockTools();
        await testTestSkill();
        await testAssertions();
        await testExpect();
        await testTestSuite();
        
        console.log('\n========================================');
        console.log('  ✅ All Tests Passed!');
        console.log('========================================\n');
        
    } catch (error) {
        console.error('\n❌ Test Failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

main();
