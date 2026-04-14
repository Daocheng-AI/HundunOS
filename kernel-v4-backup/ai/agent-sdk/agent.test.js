/**
 * Agent SDK - Agent 构建器测试
 */

import { describe, it, expect } from 'vitest';
import {
  AgentBuilder,
  Agent,
  createAgent
} from './agent.js';
import { z } from 'zod';

describe('AgentBuilder', () => {
  it('should create an agent builder with name and type', () => {
    const builder = new AgentBuilder('test-agent', 'assistant');
    
    const config = builder.getConfig();
    expect(config.name).toBe('test-agent');
    expect(config.type).toBe('assistant');
    expect(config.description).toBe('Agent: test-agent');
  });

  it('should chain configuration methods', () => {
    const builder = new AgentBuilder('test-agent', 'assistant')
      .withDescription('A test agent')
      .withVersion('2.0.0')
      .withAuthor('Test Author');
    
    const config = builder.getConfig();
    expect(config.description).toBe('A test agent');
    expect(config.version).toBe('2.0.0');
    expect(config.author).toBe('Test Author');
  });

  it('should configure model', () => {
    const builder = new AgentBuilder('test-agent', 'assistant')
      .withModel('openai', 'gpt-4', {
        temperature: 0.8,
        maxTokens: 4000
      });
    
    const config = builder.getConfig();
    expect(config.modelConfig).toBeDefined();
    expect(config.modelConfig.provider).toBe('openai');
    expect(config.modelConfig.model).toBe('gpt-4');
    expect(config.modelConfig.temperature).toBe(0.8);
    expect(config.modelConfig.maxTokens).toBe(4000);
  });

  it('should add instructions', () => {
    const builder = new AgentBuilder('test-agent', 'assistant')
      .withInstruction('You are a helpful assistant.')
      .withInstruction('Always be polite.', 'context');
    
    const config = builder.getConfig();
    expect(config.instructions).toHaveLength(2);
    expect(config.instructions[0].text).toBe('You are a helpful assistant.');
    expect(config.instructions[1].text).toBe('Always be polite.');
  });

  it('should add instruction objects with examples', () => {
    const builder = new AgentBuilder('test-agent', 'assistant')
      .withInstructionObject({
        text: 'Translate text to Spanish.',
        context: 'Translation task',
        examples: [
          { input: 'Hello', output: 'Hola' },
          { input: 'Goodbye', output: 'Adiós' }
        ]
      });
    
    const config = builder.getConfig();
    expect(config.instructions).toHaveLength(1);
    expect(config.instructions[0].examples).toHaveLength(2);
  });

  it('should add tools', () => {
    const tool = {
      name: 'search',
      description: 'Search the web',
      execute: async () => ({ results: [] })
    };

    const builder = new AgentBuilder('test-agent', 'assistant')
      .withTool(tool);
    
    const config = builder.getConfig();
    expect(config.tools).toHaveLength(1);
    expect(config.tools[0].name).toBe('search');
  });

  it('should add multiple tools', () => {
    const tools = [
      {
        name: 'search',
        description: 'Search the web',
        execute: async () => ({ results: [] })
      },
      {
        name: 'calculate',
        description: 'Perform calculations',
        execute: async () => ({ result: 0 })
      }
    ];

    const builder = new AgentBuilder('test-agent', 'assistant')
      .withTools(tools);
    
    const config = builder.getConfig();
    expect(config.tools).toHaveLength(2);
  });

  it('should configure memory', () => {
    const builder = new AgentBuilder('test-agent', 'assistant')
      .withMemory({
        type: 'buffer',
        maxSize: 1000,
        maxMessages: 50
      });
    
    const config = builder.getConfig();
    expect(config.memoryConfig).toBeDefined();
    expect(config.memoryConfig.type).toBe('buffer');
    expect(config.memoryConfig.maxSize).toBe(1000);
  });

  it('should add guardrails', () => {
    const inputGuardrail = {
      name: 'content-filter',
      type: 'input',
      check: async () => ({ allowed: true })
    };

    const outputGuardrail = {
      name: 'output-filter',
      type: 'output',
      check: async () => ({ allowed: true })
    };

    const builder = new AgentBuilder('test-agent', 'assistant')
      .withInputGuardrail(inputGuardrail)
      .withOutputGuardrail(outputGuardrail);
    
    const config = builder.getConfig();
    expect(config.inputGuardrails).toHaveLength(1);
    expect(config.outputGuardrails).toHaveLength(1);
  });

  it('should set output schema', () => {
    const schema = z.object({
      answer: z.string(),
      confidence: z.number()
    });

    const builder = new AgentBuilder('test-agent', 'assistant')
      .withOutputSchema(schema);
    
    const config = builder.getConfig();
    expect(config.outputSchema).toBeDefined();
  });

  it('should throw error when building without model config', () => {
    const builder = new AgentBuilder('test-agent', 'assistant');
    
    expect(() => builder.build()).toThrow('Model configuration is required');
  });

  it('should build an agent successfully', () => {
    const agent = new AgentBuilder('test-agent', 'assistant')
      .withModel('openai', 'gpt-4')
      .build();
    
    expect(agent).toBeInstanceOf(Agent);
  });
});

describe('Agent', () => {
  let agent;

  beforeEach(() => {
    agent = new AgentBuilder('test-agent', 'assistant')
      .withModel('openai', 'gpt-4')
      .withInstruction('You are a helpful assistant.')
      .build();
  });

  it('should get config', () => {
    const config = agent.getConfig();
    expect(config.name).toBe('test-agent');
    expect(config.type).toBe('assistant');
  });

  it('should get model config', () => {
    const modelConfig = agent.getModelConfig();
    expect(modelConfig.provider).toBe('openai');
    expect(modelConfig.model).toBe('gpt-4');
  });

  it('should get instructions', () => {
    const instructions = agent.getInstructions();
    expect(instructions).toHaveLength(1);
    expect(instructions[0].text).toBe('You are a helpful assistant.');
  });

  it('should get tools', () => {
    const tool = {
      name: 'test-tool',
      description: 'A test tool',
      execute: async () => ({ result: 'test' })
    };

    const agentWithTools = new AgentBuilder('test-agent', 'assistant')
      .withModel('openai', 'gpt-4')
      .withTool(tool)
      .build();
    
    const tools = agentWithTools.getTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('test-tool');
  });

  it('should get memory config', () => {
    const agentWithMemory = new AgentBuilder('test-agent', 'assistant')
      .withModel('openai', 'gpt-4')
      .withMemory({
        type: 'buffer',
        maxSize: 1000
      })
      .build();
    
    const memoryConfig = agentWithMemory.getMemoryConfig();
    expect(memoryConfig).toBeDefined();
    expect(memoryConfig.type).toBe('buffer');
  });

  it('should get guardrails', () => {
    const inputGuardrail = {
      name: 'test-input',
      type: 'input',
      check: async () => ({ allowed: true })
    };

    const outputGuardrail = {
      name: 'test-output',
      type: 'output',
      check: async () => ({ allowed: true })
    };

    const agentWithGuardrails = new AgentBuilder('test-agent', 'assistant')
      .withModel('openai', 'gpt-4')
      .withInputGuardrail(inputGuardrail)
      .withOutputGuardrail(outputGuardrail)
      .build();
    
    expect(agentWithGuardrails.getInputGuardrails()).toHaveLength(1);
    expect(agentWithGuardrails.getOutputGuardrails()).toHaveLength(1);
  });

  it('should get output schema', () => {
    const schema = z.object({
      answer: z.string()
    });

    const agentWithSchema = new AgentBuilder('test-agent', 'assistant')
      .withModel('openai', 'gpt-4')
      .withOutputSchema(schema)
      .build();
    
    const outputSchema = agentWithSchema.getOutputSchema();
    expect(outputSchema).toBeDefined();
  });

  it('should run agent with simple input', async () => {
    const result = await agent.run({
      input: 'Hello, how are you?'
    });
    
    expect(result.success).toBe(true);
    expect(result.output).toContain('Hello, how are you?');
    expect(result.metadata.model).toBe('gpt-4');
  });

  it('should block input with guardrail', async () => {
    const inputGuardrail = {
      name: 'content-filter',
      type: 'input',
      check: async () => ({ allowed: false, reason: 'Inappropriate content' })
    };

    const agentWithGuardrail = new AgentBuilder('test-agent', 'assistant')
      .withModel('openai', 'gpt-4')
      .withInputGuardrail(inputGuardrail)
      .build();
    
    const result = await agentWithGuardrail.run({
      input: 'Bad content'
    });
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Input blocked by guardrail');
    expect(result.error).toContain('Inappropriate content');
  });

  it('should block output with guardrail', async () => {
    const outputGuardrail = {
      name: 'output-filter',
      type: 'output',
      check: async () => ({ allowed: false, reason: 'Inappropriate output' })
    };

    const agentWithGuardrail = new AgentBuilder('test-agent', 'assistant')
      .withModel('openai', 'gpt-4')
      .withOutputGuardrail(outputGuardrail)
      .build();
    
    const result = await agentWithGuardrail.run({
      input: 'Test input'
    });
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Output blocked by guardrail');
  });

  it('should validate output with schema', async () => {
    const schema = z.object({
      answer: z.string(),
      confidence: z.number()
    });

    const agentWithSchema = new AgentBuilder('test-agent', 'assistant')
      .withModel('openai', 'gpt-4')
      .withOutputSchema(schema)
      .build();
    
    // This will fail because the mock output doesn't match the schema
    const result = await agentWithSchema.run({
      input: 'Test input'
    });
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Output validation failed');
  });

  it('should maintain execution history', async () => {
    await agent.run({ input: 'First input' });
    await agent.run({ input: 'Second input' });
    
    const history = agent.getExecutionHistory();
    expect(history).toHaveLength(2);
    expect(history[0].metadata.iterations).toBe(1);
    expect(history[1].metadata.iterations).toBe(1);
  });

  it('should serialize to JSON', () => {
    const agentWithTools = new AgentBuilder('test-agent', 'assistant')
      .withModel('openai', 'gpt-4')
      .withInstruction('Test instruction')
      .withTool({
        name: 'test-tool',
        description: 'Test tool',
        execute: async () => ({})
      })
      .withMemory({
        type: 'buffer',
        maxSize: 1000
      })
      .build();
    
    const json = agentWithTools.toJSON();
    
    expect(json.config.name).toBe('test-agent');
    expect(json.modelConfig.model).toBe('gpt-4');
    expect(json.instructions).toHaveLength(1);
    expect(json.tools).toHaveLength(1);
    expect(json.memoryConfig).toBeDefined();
    expect(json.executionHistory).toEqual([]);
  });
});

describe('createAgent', () => {
  it('should create an agent builder with default type', () => {
    const builder = createAgent('test-agent');
    
    expect(builder).toBeInstanceOf(AgentBuilder);
    expect(builder.getConfig().type).toBe('assistant');
  });

  it('should create an agent builder with custom type', () => {
    const builder = createAgent('test-agent', 'tool');
    
    expect(builder.getConfig().type).toBe('tool');
  });

  it('should support fluent API', () => {
    const agent = createAgent('test-agent', 'assistant')
      .withDescription('Test agent')
      .withModel('openai', 'gpt-4')
      .withInstruction('Test instruction')
      .build();
    
    expect(agent).toBeInstanceOf(Agent);
    expect(agent.getConfig().description).toBe('Test agent');
  });
});

describe('Edge Cases', () => {
  it('should handle empty instructions', () => {
    const agent = new AgentBuilder('test-agent', 'assistant')
      .withModel('openai', 'gpt-4')
      .build();
    
    const instructions = agent.getInstructions();
    expect(instructions).toEqual([]);
  });

  it('should handle empty tools', () => {
    const agent = new AgentBuilder('test-agent', 'assistant')
      .withModel('openai', 'gpt-4')
      .build();
    
    const tools = agent.getTools();
    expect(tools).toEqual([]);
  });

  it('should handle empty guardrails', () => {
    const agent = new AgentBuilder('test-agent', 'assistant')
      .withModel('openai', 'gpt-4')
      .build();
    
    expect(agent.getInputGuardrails()).toEqual([]);
    expect(agent.getOutputGuardrails()).toEqual([]);
  });

  it('should handle no output schema', () => {
    const agent = new AgentBuilder('test-agent', 'assistant')
      .withModel('openai', 'gpt-4')
      .build();
    
    const outputSchema = agent.getOutputSchema();
    expect(outputSchema).toBeUndefined();
  });
});
