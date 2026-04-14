/**
 * Skill 定义系统测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SkillDefinition,
  SkillDefinitionBuilder,
  SkillType,
  SkillExecutionMode,
  SkillConnectionType,
  SkillDefinitionSchema
} from './skill-definition.js';

describe('SkillDefinitionSchema', () => {
  it('should validate a valid skill definition', () => {
    const definition = {
      description: {
        name: 'test-skill',
        displayName: 'Test Skill',
        description: 'A test skill',
        version: 1,
        type: SkillType.EXECUTE,
        executionMode: SkillExecutionMode.MANUAL,
        category: 'test',
        tags: ['test'],
        features: {},
        config: {},
        permissions: [],
        dependencies: []
      },
      inputs: {},
      outputs: {},
      parameters: [],
      returns: [],
      credentials: [],
      tools: []
    };

    const result = SkillDefinitionSchema.safeParse(definition);
    expect(result.success).toBe(true);
  });

  it('should reject invalid skill name', () => {
    const definition = {
      description: {
        name: 'Invalid_Name', // Contains uppercase and underscore
        displayName: 'Test Skill',
        description: 'A test skill',
        version: 1,
        type: SkillType.EXECUTE,
        executionMode: SkillExecutionMode.MANUAL
      },
      inputs: {},
      outputs: {},
      parameters: [],
      returns: [],
      credentials: [],
      tools: []
    };

    const result = SkillDefinitionSchema.safeParse(definition);
    expect(result.success).toBe(false);
  });

  it('should reject invalid skill type', () => {
    const definition = {
      description: {
        name: 'test-skill',
        displayName: 'Test Skill',
        description: 'A test skill',
        version: 1,
        type: 'invalid-type', // Invalid type
        executionMode: SkillExecutionMode.MANUAL
      },
      inputs: {},
      outputs: {},
      parameters: [],
      returns: [],
      credentials: [],
      tools: []
    };

    const result = SkillDefinitionSchema.safeParse(definition);
    expect(result.success).toBe(false);
  });

  it('should accept valid parameter definition', () => {
    const definition = {
      description: {
        name: 'test-skill',
        displayName: 'Test Skill',
        description: 'A test skill',
        version: 1,
        type: SkillType.EXECUTE,
        executionMode: SkillExecutionMode.MANUAL
      },
      inputs: {},
      outputs: {},
      parameters: [{
        displayName: 'Test Parameter',
        name: 'testParameter',
        description: 'A test parameter',
        type: 'string',
        required: true,
        default: 'default-value'
      }],
      returns: [],
      credentials: [],
      tools: []
    };

    const result = SkillDefinitionSchema.safeParse(definition);
    expect(result.success).toBe(true);
  });

  it('should accept valid credential definition', () => {
    const definition = {
      description: {
        name: 'test-skill',
        displayName: 'Test Skill',
        description: 'A test skill',
        version: 1,
        type: SkillType.EXECUTE,
        executionMode: SkillExecutionMode.MANUAL
      },
      inputs: {},
      outputs: {},
      parameters: [],
      returns: [],
      credentials: [{
        name: 'apiCredential',
        displayName: 'API Credential',
        description: 'API authentication',
        required: true,
        authentication: {
          type: 'headerAuth',
          properties: [{
            name: 'apiKey',
            displayName: 'API Key',
            type: 'string',
            required: true,
            typeOptions: {
              password: true
            }
          }]
        }
      }],
      tools: []
    };

    const result = SkillDefinitionSchema.safeParse(definition);
    expect(result.success).toBe(true);
  });
});

describe('SkillDefinition', () => {
  let skillDefinition;

  beforeEach(() => {
    skillDefinition = new SkillDefinition({
      description: {
        name: 'test-skill',
        displayName: 'Test Skill',
        description: 'A test skill',
        version: 1,
        type: SkillType.EXECUTE,
        executionMode: SkillExecutionMode.MANUAL,
        category: 'test',
        tags: ['test', 'example'],
        features: {
          asyncExecution: true,
          retrySupport: false
        },
        config: {
          timeout: 60000,
          isolation: 'process'
        },
        permissions: ['read', 'write'],
        dependencies: ['lodash']
      },
      inputs: {
        main: ['string', 'json'],
        ai: ['string']
      },
      outputs: {
        main: [{
          type: 'json',
          displayName: 'JSON Output',
          description: 'The JSON output'
        }]
      },
      parameters: [
        {
          displayName: 'API Key',
          name: 'apiKey',
          description: 'The API key to use',
          type: 'string',
          required: true,
          typeOptions: {
            password: true
          }
        },
        {
          displayName: 'Timeout',
          name: 'timeout',
          description: 'Request timeout in milliseconds',
          type: 'number',
          required: false,
          default: 30000,
          typeOptions: {
            minValue: 1000,
            maxValue: 300000
          }
        }
      ],
      returns: [
        {
          displayName: 'Response',
          name: 'response',
          description: 'The API response',
          type: 'json'
        }
      ],
      credentials: [
        {
          name: 'apiCredential',
          displayName: 'API Credential',
          description: 'API authentication',
          required: true,
          authentication: {
            type: 'headerAuth',
            properties: [
              {
                name: 'apiKey',
                displayName: 'API Key',
                type: 'string',
                required: true,
                typeOptions: {
                  password: true
                }
              }
            ]
          }
        }
      ],
      tools: [
        {
          id: 'http-request',
          name: 'HTTP Request',
          description: 'Make HTTP requests',
          type: 'http',
          config: {
            method: 'GET',
            url: 'https://api.example.com'
          }
        }
      ]
    });
  });

  it('should create a skill definition', () => {
    expect(skillDefinition).toBeDefined();
    expect(skillDefinition.getName()).toBe('test-skill');
    expect(skillDefinition.getDisplayName()).toBe('Test Skill');
    expect(skillDefinition.getVersion()).toBe(1);
    expect(skillDefinition.getType()).toBe(SkillType.EXECUTE);
  });

  it('should get skill description', () => {
    const description = skillDefinition.description;
    expect(description.name).toBe('test-skill');
    expect(description.displayName).toBe('Test Skill');
    expect(description.description).toBe('A test skill');
    expect(description.category).toBe('test');
    expect(description.tags).toEqual(['test', 'example']);
    expect(description.features.asyncExecution).toBe(true);
    expect(description.features.retrySupport).toBe(false);
  });

  it('should get skill inputs', () => {
    expect(skillDefinition.inputs.main).toEqual(['string', 'json']);
    expect(skillDefinition.inputs.ai).toEqual(['string']);
  });

  it('should get skill outputs', () => {
    expect(skillDefinition.outputs.main).toHaveLength(1);
    expect(skillDefinition.outputs.main[0].type).toBe('json');
    expect(skillDefinition.outputs.main[0].displayName).toBe('JSON Output');
  });

  it('should get parameters', () => {
    expect(skillDefinition.parameters).toHaveLength(2);
    
    const apiKeyParam = skillDefinition.getParameter('apiKey');
    expect(apiKeyParam).toBeDefined();
    expect(apiKeyParam.displayName).toBe('API Key');
    expect(apiKeyParam.required).toBe(true);
    expect(apiKeyParam.typeOptions.password).toBe(true);

    const timeoutParam = skillDefinition.getParameter('timeout');
    expect(timeoutParam).toBeDefined();
    expect(timeoutParam.displayName).toBe('Timeout');
    expect(timeoutParam.required).toBe(false);
    expect(timeoutParam.default).toBe(30000);
  });

  it('should get returns', () => {
    expect(skillDefinition.returns).toHaveLength(1);
    
    const responseReturn = skillDefinition.getReturn('response');
    expect(responseReturn).toBeDefined();
    expect(responseReturn.displayName).toBe('Response');
    expect(responseReturn.type).toBe('json');
  });

  it('should get credentials', () => {
    expect(skillDefinition.credentials).toHaveLength(1);
    
    const apiCredential = skillDefinition.getCredential('apiCredential');
    expect(apiCredential).toBeDefined();
    expect(apiCredential.displayName).toBe('API Credential');
    expect(apiCredential.required).toBe(true);
    expect(apiCredential.authentication.type).toBe('headerAuth');
  });

  it('should get tools', () => {
    expect(skillDefinition.tools).toHaveLength(1);
    expect(skillDefinition.tools[0].id).toBe('http-request');
    expect(skillDefinition.tools[0].type).toBe('http');
  });

  it('should check if parameter is required', () => {
    expect(skillDefinition.isParameterRequired('apiKey')).toBe(true);
    expect(skillDefinition.isParameterRequired('timeout')).toBe(false);
    expect(skillDefinition.isParameterRequired('nonExistent')).toBe(false);
  });

  it('should get required parameters', () => {
    const requiredParams = skillDefinition.getRequiredParameters();
    expect(requiredParams).toEqual(['apiKey']);
  });

  it('should get supported connection types', () => {
    const connectionTypes = skillDefinition.getSupportedConnectionTypes();
    expect(connectionTypes).toContain('main');
    expect(connectionTypes).toContain('ai');
  });

  it('should check connection type support', () => {
    expect(skillDefinition.supportsConnectionType('main', 'input')).toBe(true);
    expect(skillDefinition.supportsConnectionType('ai', 'input')).toBe(true);
    expect(skillDefinition.supportsConnectionType('main', 'output')).toBe(true);
    expect(skillDefinition.supportsConnectionType('ai', 'output')).toBe(false);
  });

  it('should serialize to JSON', () => {
    const json = skillDefinition.toJSON();
    expect(json.description.name).toBe('test-skill');
    expect(json.parameters).toHaveLength(2);
    expect(json.returns).toHaveLength(1);
    expect(json.credentials).toHaveLength(1);
    expect(json.tools).toHaveLength(1);
  });

  it('should deserialize from JSON', () => {
    const json = skillDefinition.toJSON();
    const deserialized = SkillDefinition.fromJSON(json);
    
    expect(deserialized.getName()).toBe('test-skill');
    expect(deserialized.getVersion()).toBe(1);
    expect(deserialized.parameters).toHaveLength(2);
  });
});

describe('SkillDefinitionBuilder', () => {
  it('should build a skill definition using builder pattern', () => {
    const skillDefinition = SkillDefinition.builder()
      .withName('builder-skill')
      .withDisplayName('Builder Skill')
      .withDescription('A skill built with the builder pattern')
      .withVersion(2)
      .withType(SkillType.POLL)
      .withCategory('automation')
      .withTag('polling')
      .withTag('automation')
      .withParameter({
        displayName: 'Interval',
        name: 'interval',
        type: 'string',
        required: true,
        description: 'Polling interval'
      })
      .withReturn({
        displayName: 'Result',
        name: 'result',
        type: 'array'
      })
      .withInputs({
        main: ['string']
      })
      .withOutputs({
        main: [{
          type: 'string',
          displayName: 'Output'
        }]
      })
      .build();

    expect(skillDefinition.getName()).toBe('builder-skill');
    expect(skillDefinition.getDisplayName()).toBe('Builder Skill');
    expect(skillDefinition.getVersion()).toBe(2);
    expect(skillDefinition.getType()).toBe(SkillType.POLL);
    expect(skillDefinition.description.category).toBe('automation');
    expect(skillDefinition.description.tags).toEqual(['polling', 'automation']);
    expect(skillDefinition.getParameter('interval')).toBeDefined();
    expect(skillDefinition.getReturn('result')).toBeDefined();
  });

  it('should allow chaining multiple parameter additions', () => {
    const skillDefinition = SkillDefinition.builder()
      .withName('multi-param-skill')
      .withDisplayName('Multi Parameter Skill')
      .withDescription('A skill with multiple parameters')
      .withParameter({
        displayName: 'First Parameter',
        name: 'param1',
        type: 'string',
        required: true
      })
      .withParameter({
        displayName: 'Second Parameter',
        name: 'param2',
        type: 'number',
        required: false,
        default: 100
      })
      .withParameter({
        displayName: 'Third Parameter',
        name: 'param3',
        type: 'boolean',
        required: true
      })
      .build();

    expect(skillDefinition.parameters).toHaveLength(3);
    expect(skillDefinition.getRequiredParameters()).toEqual(['param1', 'param3']);
  });

  it('should allow chaining multiple credential additions', () => {
    const skillDefinition = SkillDefinition.builder()
      .withName('multi-cred-skill')
      .withDisplayName('Multi Credential Skill')
      .withDescription('A skill with multiple credentials')
      .withCredential({
        name: 'credential1',
        displayName: 'Credential 1',
        required: true,
        authentication: {
          type: 'basicAuth',
          properties: []
        }
      })
      .withCredential({
        name: 'credential2',
        displayName: 'Credential 2',
        required: false,
        authentication: {
          type: 'headerAuth',
          properties: []
        }
      })
      .build();

    expect(skillDefinition.credentials).toHaveLength(2);
    expect(skillDefinition.getCredential('credential1')).toBeDefined();
    expect(skillDefinition.getCredential('credential2')).toBeDefined();
  });

  it('should allow chaining multiple tool additions', () => {
    const skillDefinition = SkillDefinition.builder()
      .withName('multi-tool-skill')
      .withDisplayName('Multi Tool Skill')
      .withDescription('A skill with multiple tools')
      .withTool({
        id: 'tool1',
        name: 'Tool 1',
        type: 'http'
      })
      .withTool({
        id: 'tool2',
        name: 'Tool 2',
        type: 'function'
      })
      .withTool({
        id: 'tool3',
        name: 'Tool 3',
        type: 'ai'
      })
      .build();

    expect(skillDefinition.tools).toHaveLength(3);
    expect(skillDefinition.tools[0].id).toBe('tool1');
    expect(skillDefinition.tools[1].id).toBe('tool2');
    expect(skillDefinition.tools[2].id).toBe('tool3');
  });
});

describe('Skill Type and Mode Enums', () => {
  it('should have correct skill type values', () => {
    expect(SkillType.EXECUTE).toBe('execute');
    expect(SkillType.POLL).toBe('poll');
    expect(SkillType.TRIGGER).toBe('trigger');
    expect(SkillType.WEBHOOK).toBe('webhook');
    expect(SkillType.MANUAL).toBe('manual');
  });

  it('should have correct execution mode values', () => {
    expect(SkillExecutionMode.MANUAL).toBe('manual');
    expect(SkillExecutionMode.TRIGGER).toBe('trigger');
    expect(SkillExecutionMode.WEBHOOK).toBe('webhook');
    expect(SkillExecutionMode.RETRY).toBe('retry');
    expect(SkillExecutionMode.CLI).toBe('cli');
    expect(SkillExecutionMode.EVALUATION).toBe('evaluation');
  });

  it('should have correct connection type values', () => {
    expect(SkillConnectionType.MAIN).toBe('main');
    expect(SkillConnectionType.AI).toBe('ai');
    expect(SkillConnectionType.AI_DOCUMENT).toBe('ai_document');
    expect(SkillConnectionType.AI_IMAGE).toBe('ai_image');
    expect(SkillConnectionType.AI_TEXT).toBe('ai_text');
    expect(SkillConnectionType.AI_EMBEDDING).toBe('ai_embedding');
    expect(SkillConnectionType.AI_VECTOR).toBe('ai_vector');
    expect(SkillConnectionType.AI_LANGUAGE_MODEL).toBe('ai_languageModel');
    expect(SkillConnectionType.AI_TOOL).toBe('ai_tool');
    expect(SkillConnectionType.AI_AGENT).toBe('ai_agent');
    expect(SkillConnectionType.AI_HYBRID).toBe('ai_hybrid');
    expect(SkillConnectionType.AI_CHAIN).toBe('ai_chain');
    expect(SkillConnectionType.AI_MEMORY).toBe('ai_memory');
  });
});
