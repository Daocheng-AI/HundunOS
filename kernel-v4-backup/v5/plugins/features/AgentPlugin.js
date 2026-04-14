import { BasePlugin } from '../../core/BasePlugin.js';
import { randomUUID } from 'crypto';

export class AgentPlugin extends BasePlugin {
  #agents = new Map();
  #sessions = new Map();
  #tools = new Map();
  #config = null;
  #models = null;
  #cache = null;

  get name() {
    return 'agent';
  }

  get version() {
    return '2.0.0';
  }

  get dependencies() {
    return ['logger', 'config', 'models', 'cache'];
  }

  async onInit() {
    this.#config = this.kernel.get('config');
    this.#models = this.kernel.get('models');
    this.#cache = this.kernel.get('cache');

    this.#registerBuiltInTools();

    this.kernel.services.register('agent', () => ({
      createAgent: this.createAgent.bind(this),
      getAgent: this.getAgent.bind(this),
      createSession: this.createSession.bind(this),
      execute: this.execute.bind(this),
      registerTool: this.registerTool.bind(this),
      listTools: this.listTools.bind(this)
    }), { singleton: true, lazy: true });

    this.logger.info('Agent Plugin initialized');
  }

  #registerBuiltInTools() {
    this.registerTool('search', {
      description: 'Search for information',
      parameters: {
        query: { type: 'string', required: true }
      },
      handler: async (params) => {
        // 实现搜索逻辑
        return { results: [] };
      }
    });

    this.registerTool('calculator', {
      description: 'Perform calculations',
      parameters: {
        expression: { type: 'string', required: true }
      },
      handler: async (params) => {
        try {
          // 安全计算
          const result = this.#safeCalculate(params.expression);
          return { result };
        } catch (err) {
          return { error: err.message };
        }
      }
    });

    this.registerTool('memory', {
      description: 'Store or retrieve information from memory',
      parameters: {
        action: { type: 'string', enum: ['get', 'set'], required: true },
        key: { type: 'string', required: true },
        value: { type: 'string' }
      },
      handler: async (params) => {
        if (params.action === 'get') {
          const value = await this.#cache.get(`agent:memory:${params.key}`);
          return { value };
        } else {
          await this.#cache.set(`agent:memory:${params.key}`, params.value, 86400);
          return { success: true };
        }
      }
    });
  }

  #safeCalculate(expression) {
    const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
    return Function(`"use strict"; return (${sanitized})`)();
  }

  createAgent(config = {}) {
    const agentId = randomUUID();
    const agent = new Agent({
      id: agentId,
      name: config.name || 'Assistant',
      model: config.model || 'gpt-3.5-turbo',
      provider: config.provider || 'openai',
      systemPrompt: config.systemPrompt || 'You are a helpful assistant.',
      tools: config.tools || [],
      maxIterations: config.maxIterations || 10,
      temperature: config.temperature || 0.7,
      kernel: this.kernel,
      models: this.#models,
      tools: this.#tools,
      cache: this.#cache,
      logger: this.logger
    });

    this.#agents.set(agentId, agent);
    this.logger.info(`Agent created: ${agentId}`);
    
    return agent;
  }

  getAgent(agentId) {
    return this.#agents.get(agentId);
  }

  createSession(agentId, metadata = {}) {
    const sessionId = randomUUID();
    const session = {
      id: sessionId,
      agentId,
      messages: [],
      metadata,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.#sessions.set(sessionId, session);
    return session;
  }

  async execute(agentId, input, options = {}) {
    const agent = this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const sessionId = options.sessionId;
    const session = sessionId ? this.#sessions.get(sessionId) : null;

    return await agent.execute(input, { ...options, session });
  }

  registerTool(name, tool) {
    if (this.#tools.has(name)) {
      this.logger.warn(`Tool ${name} already registered, overwriting`);
    }
    this.#tools.set(name, tool);
    this.logger.debug(`Registered tool: ${name}`);
  }

  listTools() {
    return Array.from(this.#tools.entries()).map(([name, tool]) => ({
      name,
      description: tool.description,
      parameters: tool.parameters
    }));
  }

  async onDestroy() {
    for (const agent of this.#agents.values()) {
      await agent.destroy();
    }
    this.#agents.clear();
    this.#sessions.clear();
    this.#tools.clear();
  }
}

class Agent {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.model = config.model;
    this.provider = config.provider;
    this.systemPrompt = config.systemPrompt;
    this.tools = config.tools;
    this.maxIterations = config.maxIterations;
    this.temperature = config.temperature;
    this.kernel = config.kernel;
    this.models = config.models;
    this.availableTools = config.tools;
    this.cache = config.cache;
    this.logger = config.logger;
  }

  async execute(input, options = {}) {
    const session = options.session;
    const messages = session ? [...session.messages] : [];

    if (messages.length === 0 && this.systemPrompt) {
      messages.push({ role: 'system', content: this.systemPrompt });
    }

    messages.push({ role: 'user', content: input });

    let iterations = 0;
    const maxIterations = Math.min(options.maxIterations || this.maxIterations, 20);

    while (iterations < maxIterations) {
      iterations++;

      const response = await this.models.chat(messages, {
        model: this.model,
        provider: this.provider,
        temperature: this.temperature
      });

      const content = response.content;
      messages.push({ role: 'assistant', content });

      const toolCalls = this.#parseToolCalls(content);

      if (toolCalls.length === 0) {
        if (session) {
          session.messages = messages;
          session.updatedAt = Date.now();
        }
        return {
          content,
          messages,
          iterations,
          toolCalls: []
        };
      }

      const toolResults = await this.#executeToolCalls(toolCalls);

      for (const result of toolResults) {
        messages.push({
          role: 'tool',
          content: JSON.stringify(result.result),
          tool_call_id: result.id
        });
      }
    }

    return {
      content: 'Maximum iterations reached',
      messages,
      iterations,
      toolCalls: []
    };
  }

  #parseToolCalls(content) {
    const toolCalls = [];
    const regex = /<tool>(\w+)<\/tool>\s*<params>([\s\S]*?)<\/params>/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      try {
        const toolName = match[1];
        const params = JSON.parse(match[2]);
        toolCalls.push({
          id: randomUUID(),
          name: toolName,
          params
        });
      } catch (err) {
        this.logger.warn('Failed to parse tool call:', err.message);
      }
    }

    return toolCalls;
  }

  async #executeToolCalls(toolCalls) {
    const results = [];

    for (const call of toolCalls) {
      try {
        const result = await this.#executeTool(call.name, call.params);
        results.push({ id: call.id, result });
      } catch (err) {
        results.push({ id: call.id, result: { error: err.message } });
      }
    }

    return results;
  }

  async #executeTool(toolName, params) {
    const tool = this.availableTools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    this.logger.debug(`Executing tool: ${toolName}`, params);
    return await tool.handler(params);
  }

  async destroy() {
    this.logger.debug(`Agent destroyed: ${this.id}`);
  }
}
