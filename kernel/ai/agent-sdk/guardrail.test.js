/**
 * Agent SDK - 安全护栏测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  GuardrailCheckResult,
  GuardrailType,
  KeywordGuardrail,
  LengthGuardrail,
  SchemaGuardrail,
  CustomGuardrail,
  GuardrailManager,
  SecurityGuardrails,
  createGuardrailManager,
  createKeywordGuardrail,
  createLengthGuardrail,
  createSchemaGuardrail,
  createCustomGuardrail
} from './guardrail.js';
import { z } from 'zod';

describe('GuardrailCheckResult', () => {
  it('should create an allowed result', () => {
    const result = GuardrailCheckResult.allowed();
    
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('should create a blocked result', () => {
    const result = GuardrailCheckResult.blocked('Blocked for safety');
    
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Blocked for safety');
  });

  it('should serialize to JSON', () => {
    const result = GuardrailCheckResult.blocked('Blocked', { type: 'keyword' });
    const json = result.toJSON();
    
    expect(json.allowed).toBe(false);
    expect(json.reason).toBe('Blocked');
    expect(json.metadata.type).toBe('keyword');
  });
});

describe('KeywordGuardrail', () => {
  let guardrail;

  beforeEach(() => {
    guardrail = new KeywordGuardrail({
      blockedKeywords: ['password', 'secret', 'confidential'],
      caseSensitive: false,
      matchWholeWord: false
    });
  });

  it('should allow content without blocked keywords', () => {
    const result = guardrail.check('This is safe content');
    
    expect(result.allowed).toBe(true);
  });

  it('should block content with blocked keywords', () => {
    const result = guardrail.check('This contains a password');
    
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('password');
  });

  it('should be case insensitive by default', () => {
    const result = guardrail.check('This contains PASSWORD');
    
    expect(result.allowed).toBe(false);
  });

  it('should be case sensitive when configured', () => {
    const caseSensitiveGuardrail = new KeywordGuardrail({
      blockedKeywords: ['password'],
      caseSensitive: true
    });
    
    const result = caseSensitiveGuardrail.check('This contains PASSWORD');
    
    expect(result.allowed).toBe(true);
  });

  it('should match whole word when configured', () => {
    const wholeWordGuardrail = new KeywordGuardrail({
      blockedKeywords: ['password'],
      matchWholeWord: true
    });
    
    const result1 = wholeWordGuardrail.check('This contains password123');
    const result2 = wholeWordGuardrail.check('This contains password');
    
    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(false);
  });

  it('should block based on regex patterns', () => {
    const patternGuardrail = new KeywordGuardrail({
      blockedPatterns: ['\\d{16}'] // Credit card pattern
    });
    
    const result = patternGuardrail.check('Card number: 1234567890123456');
    
    expect(result.allowed).toBe(false);
    expect(result.metadata.type).toBe('pattern');
  });

  it('should add blocked keyword', () => {
    guardrail.addBlockedKeyword('forbidden');
    
    const result = guardrail.check('This contains forbidden content');
    
    expect(result.allowed).toBe(false);
  });

  it('should chain methods', () => {
    const chainedGuardrail = new KeywordGuardrail()
      .addBlockedKeyword('test')
      .setCaseSensitive(true)
      .setMatchWholeWord(true);
    
    expect(chainedGuardrail.blockedKeywords).toContain('test');
    expect(chainedGuardrail.caseSensitive).toBe(true);
    expect(chainedGuardrail.matchWholeWord).toBe(true);
  });
});

describe('LengthGuardrail', () => {
  let guardrail;

  beforeEach(() => {
    guardrail = new LengthGuardrail({
      minLength: 10,
      maxLength: 100
    });
  });

  it('should allow content within length limits', () => {
    const result = guardrail.check('This is a valid length');
    
    expect(result.allowed).toBe(true);
  });

  it('should block content that is too short', () => {
    const result = guardrail.check('Short');
    
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('too short');
  });

  it('should block content that is too long', () => {
    const longText = 'a'.repeat(200);
    const result = guardrail.check(longText);
    
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('too long');
  });

  it('should set min length', () => {
    guardrail.setMinLength(50);
    
    const result = guardrail.check('This is too short');
    
    expect(result.allowed).toBe(false);
  });

  it('should set max length', () => {
    guardrail.setMaxLength(20);
    
    const result = guardrail.check('This is way too long content');
    
    expect(result.allowed).toBe(false);
  });
});

describe('SchemaGuardrail', () => {
  let guardrail;

  beforeEach(() => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      email: z.string().email()
    });
    guardrail = new SchemaGuardrail(schema);
  });

  it('should allow content that matches schema', () => {
    const content = {
      name: 'John Doe',
      age: 30,
      email: 'john@example.com'
    };
    
    const result = guardrail.check(content);
    
    expect(result.allowed).toBe(true);
  });

  it('should block content that does not match schema', () => {
    const content = {
      name: 'John Doe',
      age: '30', // Should be number
      email: 'invalid-email'
    };
    
    const result = guardrail.check(content);
    
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Schema validation failed');
  });

  it('should set strict mode', () => {
    guardrail.setStrict(true);
    
    expect(guardrail.strict).toBe(true);
  });
});

describe('CustomGuardrail', () => {
  it('should allow content based on custom check', async () => {
    const checkFn = (content) => {
      return content.includes('approved');
    };
    
    const guardrail = new CustomGuardrail(checkFn);
    const result = await guardrail.check('This is approved content');
    
    expect(result.allowed).toBe(true);
  });

  it('should block content based on custom check', async () => {
    const checkFn = (content) => {
      // Return false to block
      return !content.includes('approved');
    };
    
    const guardrail = new CustomGuardrail(checkFn);
    const result = await guardrail.check('This is not approved');
    
    expect(result.allowed).toBe(false);
  });

  it('should return custom GuardrailCheckResult', async () => {
    const checkFn = (content) => {
      return GuardrailCheckResult.blocked('Custom reason');
    };
    
    const guardrail = new CustomGuardrail(checkFn);
    const result = await guardrail.check('Any content');
    
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Custom reason');
  });

  it('should handle async check functions', async () => {
    const checkFn = async (content) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return content.length > 10;
    };
    
    const guardrail = new CustomGuardrail(checkFn);
    const result = await guardrail.check('Short');
    
    expect(result.allowed).toBe(false);
  });

  it('should handle errors in check function', async () => {
    const checkFn = () => {
      throw new Error('Check failed');
    };
    
    const guardrail = new CustomGuardrail(checkFn);
    const result = await guardrail.check('Any content');
    
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Custom guardrail error');
  });
});

describe('GuardrailManager', () => {
  let manager;

  beforeEach(() => {
    manager = new GuardrailManager();
  });

  it('should add input guardrail', () => {
    const guardrail = new KeywordGuardrail({ blockedKeywords: ['test'] });
    manager.addInputGuardrail(guardrail);
    
    expect(manager.getInputGuardrailCount()).toBe(1);
  });

  it('should add output guardrail', () => {
    const guardrail = new KeywordGuardrail({ blockedKeywords: ['test'] });
    manager.addOutputGuardrail(guardrail);
    
    expect(manager.getOutputGuardrailCount()).toBe(1);
  });

  it('should add guardrail based on type', () => {
    const inputGuardrail = new KeywordGuardrail({ 
      type: GuardrailType.INPUT,
      blockedKeywords: ['test'] 
    });
    const outputGuardrail = new KeywordGuardrail({ 
      type: GuardrailType.OUTPUT,
      blockedKeywords: ['test'] 
    });
    const bothGuardrail = new KeywordGuardrail({ 
      type: GuardrailType.BOTH,
      blockedKeywords: ['test'] 
    });
    
    manager.addGuardrail(inputGuardrail);
    manager.addGuardrail(outputGuardrail);
    manager.addGuardrail(bothGuardrail);
    
    expect(manager.getInputGuardrailCount()).toBe(2); // input + both
    expect(manager.getOutputGuardrailCount()).toBe(2); // output + both
  });

  it('should pass input check with no guardrails', async () => {
    const result = await manager.checkInput('Safe content');
    
    expect(result.allowed).toBe(true);
  });

  it('should pass output check with no guardrails', async () => {
    const result = await manager.checkOutput('Safe content');
    
    expect(result.allowed).toBe(true);
  });

  it('should block input with blocked keyword', async () => {
    const guardrail = new KeywordGuardrail({ blockedKeywords: ['forbidden'] });
    manager.addInputGuardrail(guardrail);
    
    const result = await manager.checkInput('This contains forbidden content');
    
    expect(result.allowed).toBe(false);
    expect(result.blockedBy).toBe('KeywordGuardrail');
  });

  it('should block output with blocked keyword', async () => {
    const guardrail = new KeywordGuardrail({ blockedKeywords: ['forbidden'] });
    manager.addOutputGuardrail(guardrail);
    
    const result = await manager.checkOutput('This contains forbidden content');
    
    expect(result.allowed).toBe(false);
  });

  it('should stop on first block when configured', async () => {
    manager.setStopOnFirstBlock(true);
    
    manager.addInputGuardrail(new KeywordGuardrail({ blockedKeywords: ['first'] }));
    manager.addInputGuardrail(new KeywordGuardrail({ blockedKeywords: ['second'] }));
    
    const result = await manager.checkInput('This contains first and second');
    
    expect(result.allowed).toBe(false);
    expect(result.results.length).toBe(1);
  });

  it('should continue checking all guardrails when configured', async () => {
    manager.setStopOnFirstBlock(false);
    
    manager.addInputGuardrail(new KeywordGuardrail({ blockedKeywords: ['first'] }));
    manager.addInputGuardrail(new KeywordGuardrail({ blockedKeywords: ['second'] }));
    
    const result = await manager.checkInput('This contains first and second');
    
    expect(result.allowed).toBe(false);
    expect(result.results.length).toBe(2);
  });

  it('should clear all guardrails', () => {
    manager.addInputGuardrail(new KeywordGuardrail({ blockedKeywords: ['test'] }));
    manager.addOutputGuardrail(new KeywordGuardrail({ blockedKeywords: ['test'] }));
    
    expect(manager.getInputGuardrailCount()).toBe(1);
    expect(manager.getOutputGuardrailCount()).toBe(1);
    
    manager.clear();
    
    expect(manager.getInputGuardrailCount()).toBe(0);
    expect(manager.getOutputGuardrailCount()).toBe(0);
  });
});

describe('SecurityGuardrails', () => {
  it('should create content safety guardrail', () => {
    const guardrail = SecurityGuardrails.createContentSafetyGuardrail();
    
    expect(guardrail).toBeInstanceOf(KeywordGuardrail);
    
    const result = guardrail.check('This contains malware');
    expect(result.allowed).toBe(false);
  });

  it('should create personal data guardrail', () => {
    const guardrail = SecurityGuardrails.createPersonalDataGuardrail();
    
    expect(guardrail).toBeInstanceOf(KeywordGuardrail);
    
    const result = guardrail.check('SSN: 123-45-6789');
    expect(result.allowed).toBe(false);
  });

  it('should create input length guardrail', () => {
    const guardrail = SecurityGuardrails.createInputLengthGuardrail(100);
    
    expect(guardrail).toBeInstanceOf(LengthGuardrail);
    
    const result = guardrail.check('a'.repeat(200));
    expect(result.allowed).toBe(false);
  });

  it('should create output length guardrail', () => {
    const guardrail = SecurityGuardrails.createOutputLengthGuardrail(100);
    
    expect(guardrail).toBeInstanceOf(LengthGuardrail);
    
    const result = guardrail.check('a'.repeat(200));
    expect(result.allowed).toBe(false);
  });
});

describe('Convenience Functions', () => {
  it('should create guardrail manager', () => {
    const manager = createGuardrailManager({ stopOnFirstBlock: false });
    
    expect(manager).toBeInstanceOf(GuardrailManager);
    expect(manager.stopOnFirstBlock).toBe(false);
  });

  it('should create keyword guardrail', () => {
    const guardrail = createKeywordGuardrail({ blockedKeywords: ['test'] });
    
    expect(guardrail).toBeInstanceOf(KeywordGuardrail);
  });

  it('should create length guardrail', () => {
    const guardrail = createLengthGuardrail({ maxLength: 100 });
    
    expect(guardrail).toBeInstanceOf(LengthGuardrail);
  });

  it('should create schema guardrail', () => {
    const schema = z.object({ name: z.string() });
    const guardrail = createSchemaGuardrail(schema);
    
    expect(guardrail).toBeInstanceOf(SchemaGuardrail);
  });

  it('should create custom guardrail', () => {
    const checkFn = () => true;
    const guardrail = createCustomGuardrail(checkFn);
    
    expect(guardrail).toBeInstanceOf(CustomGuardrail);
  });
});

describe('Edge Cases', () => {
  it('should handle empty content', () => {
    const guardrail = new KeywordGuardrail({ blockedKeywords: ['test'] });
    const result = guardrail.check('');
    
    expect(result.allowed).toBe(true);
  });

  it('should handle null content', () => {
    const guardrail = new KeywordGuardrail({ blockedKeywords: ['test'] });
    const result = guardrail.check(null);
    
    expect(result.allowed).toBe(true);
  });

  it('should handle object content', () => {
    const guardrail = new KeywordGuardrail({ blockedKeywords: ['password'] });
    const result = guardrail.check({ message: 'Enter your password' });
    
    expect(result.allowed).toBe(false);
  });

  it('should handle array content', () => {
    const guardrail = new KeywordGuardrail({ blockedKeywords: ['secret'] });
    const result = guardrail.check(['This is', 'a secret', 'message']);
    
    expect(result.allowed).toBe(false);
  });

  it('should handle invalid regex patterns gracefully', () => {
    const guardrail = new KeywordGuardrail({ 
      blockedPatterns: ['[invalid(regex'] 
    });
    
    // Should not throw error
    const result = guardrail.check('Any content');
    expect(result.allowed).toBe(true);
  });

  it('should handle multiple guardrails of same type', async () => {
    const manager = new GuardrailManager();
    
    manager.addInputGuardrail(new KeywordGuardrail({ blockedKeywords: ['first'] }));
    manager.addInputGuardrail(new KeywordGuardrail({ blockedKeywords: ['second'] }));
    manager.addInputGuardrail(new KeywordGuardrail({ blockedKeywords: ['third'] }));
    
    const result = await manager.checkInput('This contains all three: first second third');
    
    expect(result.allowed).toBe(false);
    expect(result.results).toHaveLength(1); // Stops on first
  });
});
