/**
 * Agent SDK - 结构化输出测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ValidationResult,
  StructuredOutputValidator,
  StructuredOutputGenerator,
  OutputParser,
  createStructuredOutputValidator,
  createStructuredOutputGenerator
} from './structured-output.js';
import { z } from 'zod';

describe('ValidationResult', () => {
  it('should create a successful result', () => {
    const result = ValidationResult.success({ test: 'data' });
    
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ test: 'data' });
    expect(result.errors).toEqual([]);
  });

  it('should create a failed result', () => {
    const result = ValidationResult.failure(['Error 1', 'Error 2']);
    
    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.errors).toEqual(['Error 1', 'Error 2']);
  });

  it('should get first error', () => {
    const result = ValidationResult.failure(['Error 1', 'Error 2']);
    
    expect(result.getFirstError()).toBe('Error 1');
  });

  it('should return null for first error when no errors', () => {
    const result = ValidationResult.success({});
    
    expect(result.getFirstError()).toBeNull();
  });

  it('should get all errors', () => {
    const result = ValidationResult.failure(['Error 1', 'Error 2']);
    
    expect(result.getAllErrors()).toBe('Error 1; Error 2');
  });

  it('should serialize to JSON', () => {
    const result = ValidationResult.success({ test: 'data' });
    const json = result.toJSON();
    
    expect(json.success).toBe(true);
    expect(json.data).toEqual({ test: 'data' });
    expect(json.errors).toEqual([]);
  });
});

describe('StructuredOutputValidator', () => {
  let validator;

  beforeEach(() => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      email: z.string().email()
    });
    validator = new StructuredOutputValidator(schema);
  });

  it('should validate valid output', () => {
    const output = {
      name: 'John Doe',
      age: 30,
      email: 'john@example.com'
    };
    
    const result = validator.validate(output);
    
    expect(result.success).toBe(true);
    expect(result.data).toEqual(output);
  });

  it('should validate valid JSON string', () => {
    const output = JSON.stringify({
      name: 'John Doe',
      age: 30,
      email: 'john@example.com'
    });
    
    const result = validator.validate(output);
    
    expect(result.success).toBe(true);
    expect(result.data.name).toBe('John Doe');
  });

  it('should fail on invalid output', () => {
    const output = {
      name: 'John Doe',
      age: '30', // Should be number
      email: 'invalid-email'
    };
    
    const result = validator.validate(output);
    
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should fail on invalid JSON string', () => {
    const output = 'invalid json';
    
    const result = validator.validate(output);
    
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('Failed to parse');
  });

  it('should set strict mode', () => {
    const schema = z.object({
      count: z.number()
    });
    const strictValidator = new StructuredOutputValidator(schema).setStrict(true);
    
    const result = strictValidator.validate({ count: '42' });
    
    // In strict mode, string '42' should not be coerced to number
    expect(result.success).toBe(false);
  });

  it('should set coerce mode', () => {
    const schema = z.object({
      count: z.coerce.number()
    });
    const coerceValidator = new StructuredOutputValidator(schema).setCoerce(true);
    
    const result = coerceValidator.validate({ count: '42' });
    
    // With coerce enabled, string '42' should be coerced to number
    expect(result.success).toBe(true);
    expect(result.data.count).toBe(42);
  });

  it('should validate and transform output', () => {
    const output = {
      name: 'John Doe',
      age: 30,
      email: 'john@example.com'
    };
    
    const result = validator.validateAndTransform(output);
    
    expect(result.success).toBe(true);
    expect(typeof result.data).toBe('string');
    expect(() => JSON.parse(result.data)).not.toThrow();
  });

  it('should fail validation and transform on invalid output', () => {
    const output = {
      name: 'John Doe',
      age: 'invalid',
      email: 'john@example.com'
    };
    
    const result = validator.validateAndTransform(output);
    
    expect(result.success).toBe(false);
  });

  it('should get schema JSON', () => {
    const schemaJSON = validator.getSchemaJSON();
    
    expect(schemaJSON).toBeDefined();
  });
});

describe('StructuredOutputGenerator', () => {
  let generator;

  beforeEach(() => {
    const schema = z.object({
      summary: z.string(),
      sentiment: z.enum(['positive', 'negative', 'neutral']),
      keywords: z.array(z.string())
    });
    generator = new StructuredOutputGenerator(schema);
  });

  it('should generate prompt with schema', () => {
    const prompt = generator.generatePrompt('Analyze this text');
    
    expect(prompt).toContain('Output Schema');
    expect(prompt).toContain('Input');
    expect(prompt).toContain('Analyze this text');
  });

  it('should add example', () => {
    generator.addExample(
      { text: 'Great product!' },
      { summary: 'Positive review', sentiment: 'positive', keywords: ['great', 'product'] }
    );
    
    const prompt = generator.generatePrompt('Test input');
    
    expect(prompt).toContain('Examples');
    expect(prompt).toContain('Example 1');
  });

  it('should add multiple examples', () => {
    generator.addExample({ text: 'Bad' }, { summary: 'Negative', sentiment: 'negative', keywords: ['bad'] });
    generator.addExample({ text: 'Good' }, { summary: 'Positive', sentiment: 'positive', keywords: ['good'] });
    
    const prompt = generator.generatePrompt('Test input');
    
    expect(prompt).toContain('Example 1');
    expect(prompt).toContain('Example 2');
  });

  it('should set instructions', () => {
    generator.setInstructions('Provide a detailed analysis');
    
    const prompt = generator.generatePrompt('Test input');
    
    expect(prompt).toContain('Instructions');
    expect(prompt).toContain('Provide a detailed analysis');
  });

  it('should validate output', () => {
    const output = {
      summary: 'Test summary',
      sentiment: 'positive',
      keywords: ['test', 'keyword']
    };
    
    const result = generator.validate(output);
    
    expect(result.success).toBe(true);
  });

  it('should validate and transform output', () => {
    const output = {
      summary: 'Test summary',
      sentiment: 'positive',
      keywords: ['test']
    };
    
    const result = generator.validateAndTransform(output);
    
    expect(result.success).toBe(true);
    expect(typeof result.data).toBe('string');
  });

  it('should get schema', () => {
    const schema = generator.getSchema();
    
    expect(schema).toBeDefined();
  });

  it('should chain methods', () => {
    const result = generator
      .setInstructions('Test instructions')
      .addExample({ text: 'Test' }, { summary: 'Test', sentiment: 'neutral', keywords: [] })
      .setStrict(true)
      .setCoerce(false)
      .generatePrompt('Test input');
    
    expect(result).toContain('Instructions');
    expect(result).toContain('Examples');
  });
});

describe('OutputParser', () => {
  describe('parseJSON', () => {
    it('should parse valid JSON', () => {
      const result = OutputParser.parseJSON('{"test": "value"}');
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ test: 'value' });
    });

    it('should fail on invalid JSON', () => {
      const result = OutputParser.parseJSON('invalid json');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('extractJSONBlocks', () => {
    it('should extract JSON from markdown code blocks', () => {
      const text = '```json\n{"key": "value"}\n```';
      const blocks = OutputParser.extractJSONBlocks(text);
      
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toBe('{"key": "value"}');
    });

    it('should extract JSON from plain code blocks', () => {
      const text = '```\n{"key": "value"}\n```';
      const blocks = OutputParser.extractJSONBlocks(text);
      
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toBe('{"key": "value"}');
    });

    it('should extract multiple JSON blocks', () => {
      const text = '```json\n{"key1": "value1"}\n```\nSome text\n```json\n{"key2": "value2"}\n```';
      const blocks = OutputParser.extractJSONBlocks(text);
      
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toBe('{"key1": "value1"}');
      expect(blocks[1]).toBe('{"key2": "value2"}');
    });

    it('should return empty array when no JSON blocks found', () => {
      const text = 'No JSON blocks here';
      const blocks = OutputParser.extractJSONBlocks(text);
      
      expect(blocks).toHaveLength(0);
    });
  });

  describe('tryParseJSON', () => {
    it('should parse direct JSON', () => {
      const result = OutputParser.tryParseJSON('{"test": "value"}');
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ test: 'value' });
    });

    it('should parse JSON from markdown block', () => {
      const text = 'Here is the result:\n```json\n{"test": "value"}\n```\nDone';
      const result = OutputParser.tryParseJSON(text);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ test: 'value' });
    });

    it('should parse JSON from braces', () => {
      const text = 'The result is {"test": "value"} and that\'s it';
      const result = OutputParser.tryParseJSON(text);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ test: 'value' });
    });

    it('should fail when no valid JSON found', () => {
      const text = 'No JSON here at all';
      const result = OutputParser.tryParseJSON(text);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Could not extract valid JSON');
    });
  });

  describe('cleanOutput', () => {
    it('should remove markdown code block markers', () => {
      const text = '```json\n{"test": "value"}\n```';
      const cleaned = OutputParser.cleanOutput(text);
      
      expect(cleaned).toBe('{"test": "value"}');
    });

    it('should trim whitespace', () => {
      const text = '  {"test": "value"}  ';
      const cleaned = OutputParser.cleanOutput(text);
      
      expect(cleaned).toBe('{"test": "value"}');
    });

    it('should remove surrounding quotes', () => {
      const text = '"{"test": "value"}"';
      const cleaned = OutputParser.cleanOutput(text);
      
      expect(cleaned).toBe('{"test": "value"}');
    });

    it('should handle plain text', () => {
      const text = 'plain text';
      const cleaned = OutputParser.cleanOutput(text);
      
      expect(cleaned).toBe('plain text');
    });
  });
});

describe('createStructuredOutputValidator', () => {
  it('should create a validator', () => {
    const schema = z.object({ test: z.string() });
    const validator = createStructuredOutputValidator(schema);
    
    expect(validator).toBeInstanceOf(StructuredOutputValidator);
  });
});

describe('createStructuredOutputGenerator', () => {
  it('should create a generator', () => {
    const schema = z.object({ test: z.string() });
    const generator = createStructuredOutputGenerator(schema);
    
    expect(generator).toBeInstanceOf(StructuredOutputGenerator);
  });
});

describe('Edge Cases', () => {
  it('should handle null output', () => {
    const schema = z.object({ test: z.string() });
    const validator = new StructuredOutputValidator(schema);
    
    const result = validator.validate(null);
    
    expect(result.success).toBe(false);
  });

  it('should handle undefined output', () => {
    const schema = z.object({ test: z.string() });
    const validator = new StructuredOutputValidator(schema);
    
    const result = validator.validate(undefined);
    
    expect(result.success).toBe(false);
  });

  it('should handle empty string', () => {
    const schema = z.object({ test: z.string() });
    const validator = new StructuredOutputValidator(schema);
    
    const result = validator.validate('');
    
    expect(result.success).toBe(false);
  });

  it('should handle nested objects', () => {
    const schema = z.object({
      user: z.object({
        name: z.string(),
        address: z.object({
          city: z.string(),
          country: z.string()
        })
      })
    });
    const validator = new StructuredOutputValidator(schema);
    
    const output = {
      user: {
        name: 'John',
        address: {
          city: 'New York',
          country: 'USA'
        }
      }
    };
    
    const result = validator.validate(output);
    
    expect(result.success).toBe(true);
  });

  it('should handle arrays', () => {
    const schema = z.object({
      items: z.array(z.object({
        id: z.number(),
        name: z.string()
      }))
    });
    const validator = new StructuredOutputValidator(schema);
    
    const output = {
      items: [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' }
      ]
    };
    
    const result = validator.validate(output);
    
    expect(result.success).toBe(true);
  });

  it('should handle optional fields', () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional()
    });
    const validator = new StructuredOutputValidator(schema);
    
    const output = { required: 'value' };
    
    const result = validator.validate(output);
    
    expect(result.success).toBe(true);
  });

  it('should handle enum values', () => {
    const schema = z.object({
      status: z.enum(['active', 'inactive', 'pending'])
    });
    const validator = new StructuredOutputValidator(schema);
    
    const validOutput = { status: 'active' };
    const invalidOutput = { status: 'unknown' };
    
    const validResult = validator.validate(validOutput);
    const invalidResult = validator.validate(invalidOutput);
    
    expect(validResult.success).toBe(true);
    expect(invalidResult.success).toBe(false);
  });
});
