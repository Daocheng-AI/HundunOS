// kernel/skills/skill-tester.js
// HundunOS v3.9 — Skill 测试框架
// 
// 用法：
//   import { testSkill, createMockTools } from './skill-tester.js';
//   
//   test('my-skill creates issues', async () => {
//     const result = await testSkill('my-skill', {
//       input: 'create an issue about bug',
//       tools: createMockTools(['create_issue']),
//     });
//     expect(result.toolCalls).toContain('create_issue');
//   });

import { SkillRegistry } from './skill-registry.js';
import { SkillRunner } from './skill-runner.js';

/**
 * Mock tool implementation
 */
export class MockTool {
    constructor(name, options = {}) {
        this.name = name;
        this.options = options;
        this.calls = [];
        this.responses = options.responses || {};
        this.defaultResponse = options.defaultResponse || { success: true };
    }
    
    async execute(params) {
        this.calls.push(params);
        
        // Check for specific response
        const key = JSON.stringify(params);
        if (this.responses[key]) {
            return this.responses[key];
        }
        
        // Check for pattern match
        for (const [pattern, response] of Object.entries(this.responses)) {
            if (this._matchPattern(pattern, params)) {
                return response;
            }
        }
        
        return this.defaultResponse;
    }
    
    _matchPattern(pattern, params) {
        // Simple pattern matching
        if (pattern === '*') return true;
        if (typeof pattern === 'string') {
            return JSON.stringify(params).includes(pattern);
        }
        return false;
    }
    
    reset() {
        this.calls = [];
    }
    
    getCallCount() {
        return this.calls.length;
    }
    
    getLastCall() {
        return this.calls[this.calls.length - 1];
    }
}

/**
 * Create mock tools for testing
 */
export function createMockTools(toolNames, options = {}) {
    const tools = {};
    
    for (const name of toolNames) {
        tools[name] = new MockTool(name, options[name] || {});
    }
    
    return tools;
}

/**
 * Test execution context
 */
export class TestContext {
    constructor(skill, options = {}) {
        this.skill = skill;
        this.options = options;
        this.toolCalls = [];
        this.logMessages = [];
        this.errors = [];
        this.startTime = null;
        this.endTime = null;
    }
    
    log(message) {
        this.logMessages.push({
            time: new Date().toISOString(),
            message,
        });
    }
    
    addToolCall(toolName, params, result) {
        this.toolCalls.push({
            tool: toolName,
            params,
            result,
            timestamp: new Date().toISOString(),
        });
    }
    
    addError(error) {
        this.errors.push({
            error: error.message || error,
            timestamp: new Date().toISOString(),
        });
    }
    
    getDuration() {
        if (!this.startTime || !this.endTime) return null;
        return this.endTime - this.startTime;
    }
    
    getToolCalls(toolName = null) {
        if (toolName) {
            return this.toolCalls.filter(c => c.tool === toolName);
        }
        return this.toolCalls;
    }
    
    getToolCallCount(toolName = null) {
        return this.getToolCalls(toolName).length;
    }
}

/**
 * Test result
 */
export class TestResult {
    constructor(success, context, error = null) {
        this.success = success;
        this.context = context;
        this.error = error;
        this.assertions = [];
    }
    
    addAssertion(description, passed, details = null) {
        this.assertions.push({
            description,
            passed,
            details,
        });
    }
    
    getSummary() {
        const passed = this.assertions.filter(a => a.passed).length;
        const failed = this.assertions.filter(a => !a.passed).length;
        
        return {
            success: this.success,
            passed,
            failed,
            total: this.assertions.length,
            toolCalls: this.context.toolCalls.length,
            errors: this.context.errors.length,
            duration: this.context.getDuration(),
        };
    }
}

/**
 * Test a skill
 */
export async function testSkill(skillNameOrDef, options = {}) {
    const {
        input = '',
        tools = {},
        context = {},
        timeout = 30000,
        skillRegistry = null,
    } = options;
    
    // Get skill definition
    let skill;
    if (typeof skillNameOrDef === 'string') {
        if (!skillRegistry) {
            throw new Error('skillRegistry required when using skill name');
        }
        const reg = new SkillRegistry();
        skill = reg.get(skillNameOrDef);
        if (!skill) {
            throw new Error(`Skill not found: ${skillNameOrDef}`);
        }
    } else {
        skill = skillNameOrDef;
    }
    
    // Create test context
    const testCtx = new TestContext(skill, options);
    testCtx.startTime = Date.now();
    
    try {
        // Create mock environment
        const mockEnv = {
            tools,
            context,
            log: (msg) => testCtx.log(msg),
            callTool: async (toolName, params) => {
                const tool = tools[toolName];
                if (!tool) {
                    throw new Error(`Tool not found: ${toolName}`);
                }
                
                const result = await tool.execute(params);
                testCtx.addToolCall(toolName, params, result);
                return result;
            },
        };
        
        // Run skill
        const runner = new SkillRunner();
        const result = await Promise.race([
            runner.run(skill, input, mockEnv),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Test timeout')), timeout)
            ),
        ]);
        
        testCtx.endTime = Date.now();
        
        return new TestResult(true, testCtx);
        
    } catch (error) {
        testCtx.endTime = Date.now();
        testCtx.addError(error);
        
        return new TestResult(false, testCtx, error);
    }
}

/**
 * Assertion helpers
 */
export const assertions = {
    /**
     * Assert tool was called
     */
    toolCalled: (result, toolName) => {
        const calls = result.context.getToolCalls(toolName);
        const passed = calls.length > 0;
        result.addAssertion(
            `Tool '${toolName}' was called`,
            passed,
            passed ? `Called ${calls.length} time(s)` : 'Not called'
        );
        return passed;
    },
    
    /**
     * Assert tool was called with params
     */
    toolCalledWith: (result, toolName, expectedParams) => {
        const calls = result.context.getToolCalls(toolName);
        const matchingCall = calls.find(c => 
            JSON.stringify(c.params).includes(JSON.stringify(expectedParams))
        );
        const passed = !!matchingCall;
        result.addAssertion(
            `Tool '${toolName}' was called with ${JSON.stringify(expectedParams)}`,
            passed,
            passed ? matchingCall.params : 'No matching call'
        );
        return passed;
    },
    
    /**
     * Assert tool call count
     */
    toolCallCount: (result, toolName, expected) => {
        const count = result.context.getToolCallCount(toolName);
        const passed = count === expected;
        result.addAssertion(
            `Tool '${toolName}' was called ${expected} time(s)`,
            passed,
            `Actual: ${count}`
        );
        return passed;
    },
    
    /**
     * Assert no errors
     */
    noErrors: (result) => {
        const passed = result.context.errors.length === 0;
        result.addAssertion(
            'No errors occurred',
            passed,
            passed ? null : result.context.errors
        );
        return passed;
    },
    
    /**
     * Assert execution time
     */
    durationLessThan: (result, maxMs) => {
        const duration = result.context.getDuration();
        const passed = duration !== null && duration < maxMs;
        result.addAssertion(
            `Execution completed in under ${maxMs}ms`,
            passed,
            `Actual: ${duration}ms`
        );
        return passed;
    },
    
    /**
     * Assert success
     */
    succeeded: (result) => {
        const passed = result.success;
        result.addAssertion(
            'Test succeeded',
            passed,
            passed ? null : result.error?.message
        );
        return passed;
    },
};

/**
 * Test suite runner
 */
export class TestSuite {
    constructor(name) {
        this.name = name;
        this.tests = [];
        this.beforeAll = null;
        this.afterAll = null;
        this.beforeEach = null;
        this.afterEach = null;
    }
    
    addTest(name, fn) {
        this.tests.push({ name, fn });
    }
    
    async run() {
        // review: removed // review: removed console.log(`\n🧪 Test Suite: ${this.name}\n`);
        
        const results = [];
        
        // beforeAll
        if (this.beforeAll) {
            await this.beforeAll();
        }
        
        for (const test of this.tests) {
            // beforeEach
            if (this.beforeEach) {
                await this.beforeEach();
            }
            
            // review: removed // review: removed console.log(`  ${test.name}...`);
            const startTime = Date.now();
            
            try {
                const result = await test.fn();
                const duration = Date.now() - startTime;
                
                if (result.success) {
                    // review: removed // review: removed console.log(`  ✅ PASS (${duration}ms)`);
                } else {
                    // review: removed // review: removed console.log(`  ❌ FAIL (${duration}ms)`);
                    if (result.error) {
                        // review: removed // review: removed console.log(`     Error: ${result.error.message}`);
                    }
                }
                
                results.push({
                    name: test.name,
                    success: result.success,
                    duration,
                    assertions: result.assertions,
                });
                
            } catch (error) {
                const duration = Date.now() - startTime;
                // review: removed // review: removed console.log(`  ❌ ERROR (${duration}ms)`);
                // review: removed // review: removed console.log(`     ${error.message}`);
                
                results.push({
                    name: test.name,
                    success: false,
                    duration,
                    error: error.message,
                });
            }
            
            // afterEach
            if (this.afterEach) {
                await this.afterEach();
            }
        }
        
        // afterAll
        if (this.afterAll) {
            await this.afterAll();
        }
        
        // Summary
        const passed = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        // review: removed // review: removed console.log(`\n📊 Summary: ${passed} passed, ${failed} failed\n`);
        
        return {
            suite: this.name,
            passed,
            failed,
            total: results.length,
            results,
        };
    }
}

/**
 * Create a test suite
 */
export function describe(name, fn) {
    const suite = new TestSuite(name);
    fn(suite);
    return suite;
}

/**
 * Add test to suite
 */
export function it(suite, name, fn) {
    suite.addTest(name, fn);
}

/**
 * Simple expect/assert for testing
 */
export function expect(actual) {
    return {
        toBe(expected) {
            if (actual !== expected) {
                throw new Error(`Expected ${expected}, got ${actual}`);
            }
        },
        
        toEqual(expected) {
            const actualJson = JSON.stringify(actual);
            const expectedJson = JSON.stringify(expected);
            if (actualJson !== expectedJson) {
                throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
            }
        },
        
        toContain(expected) {
            if (!actual.includes(expected)) {
                throw new Error(`Expected to contain ${expected}`);
            }
        },
        
        toBeGreaterThan(expected) {
            if (actual <= expected) {
                throw new Error(`Expected ${actual} to be greater than ${expected}`);
            }
        },
        
        toBeLessThan(expected) {
            if (actual >= expected) {
                throw new Error(`Expected ${actual} to be less than ${expected}`);
            }
        },
        
        toBeTruthy() {
            if (!actual) {
                throw new Error(`Expected truthy value, got ${actual}`);
            }
        },
        
        toBeFalsy() {
            if (actual) {
                throw new Error(`Expected falsy value, got ${actual}`);
            }
        },
        
        toThrow() {
            let threw = false;
            try {
                actual();
            } catch (e) {
                threw = true;
            }
            if (!threw) {
                throw new Error('Expected function to throw');
            }
        },
    };
}

export default {
    MockTool,
    createMockTools,
    TestContext,
    TestResult,
    testSkill,
    assertions,
    TestSuite,
    describe,
    it,
    expect,
};
