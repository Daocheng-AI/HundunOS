/**
 * HundunOS v4.3 - Agent 思维链
 * 实现 Agent 思维链推理
 */

/**
 * Agent 思维链管理器
 */
export class AgentChainOfThought {
  constructor(kernel, options = {}) {
    this.kernel = kernel;
    this.options = {
      maxSteps: options.maxSteps || 10,
      temperature: options.temperature || 0.7,
      stopTokens: options.stopTokens || ['\n\nObservation:'],
    };
  }

  /**
   * 生成思维链提示
   */
  generateCoTPrompt(task, context = '') {
    return `You are a helpful assistant with strong reasoning capabilities. You will be given a task, and you need to think step by step to solve it.

Task: ${task}

${context ? `Context:\n${context}\n\n` : ''}Instructions:
1. Break down the task into smaller steps.
2. Think through each step carefully.
3. Use available tools when needed.
4. Provide a clear, final answer.

Let's think step by step.`;
  }

  /**
   * 执行思维链推理
   */
  async execute(task, context = '') {
    const prompt = this.generateCoTPrompt(task, context);
    const messages = [{ role: 'user', content: prompt }];

    let steps = [];
    let stepCount = 0;

    while (stepCount < this.options.maxSteps) {
      stepCount++;

      // 调用 LLM
      const response = await this.kernel.modelRouter.route({
        content: messages,
      }, {
        context: {
          systemPrompt: 'You are a helpful assistant with strong reasoning capabilities.',
        },
      });

      if (!response.success) {
        throw new Error('LLM call failed');
      }

      const content = response.content;
      steps.push({ step: stepCount, thought: content });

      // 检查是否完成
      if (content.includes('Final Answer:') || content.includes('Answer:')) {
        break;
      }

      // 提取工具调用
      const toolCall = this.extractToolCall(content);
      if (toolCall) {
        const toolResult = await this.kernel.toolBridge.callTool(toolCall.name, toolCall.arguments);
        messages.push({ role: 'assistant', content });
        messages.push({ role: 'user', content: `Observation: ${JSON.stringify(toolResult)}` });
      } else {
        messages.push({ role: 'assistant', content });
        messages.push({ role: 'user', content: 'Continue thinking...' });
      }
    }

    return {
      steps,
      finalAnswer: this.extractFinalAnswer(steps[steps.length - 1].thought),
    };
  }

  /**
   * 提取工具调用
   */
  extractToolCall(content) {
    const match = content.match(/Action:\s*(\w+)\nAction Input:\s*({.*})/s);
    if (!match) return null;

    return {
      name: match[1],
      arguments: JSON.parse(match[2]),
    };
  }

  /**
   * 提取最终答案
   */
  extractFinalAnswer(content) {
    const match = content.match(/(?:Final Answer|Answer):\s*(.*)/s);
    return match ? match[1].trim() : content;
  }
}

/**
 * Agent 树搜索
 */
export class AgentTreeOfThoughts {
  constructor(kernel, options = {}) {
    this.kernel = kernel;
    this.options = {
      maxDepth: options.maxDepth || 3,
      branchingFactor: options.branchingFactor || 3,
      temperature: options.temperature || 0.7,
    };
  }

  /**
   * 生成思维树提示
   */
  generateToTPrompt(task, thoughts = []) {
    let prompt = `You are a helpful assistant with strong reasoning capabilities. You will be given a task, and you need to think step by step to solve it.

Task: ${task}

Instructions:
1. Generate multiple possible next steps or thoughts.
2. Evaluate each thought for its potential to solve the task.
3. Choose the most promising thought to continue.

`;

    if (thoughts.length > 0) {
      prompt += `Previous thoughts:\n${thoughts.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n`;
    }

    prompt += `Generate ${this.options.branchingFactor} possible next thoughts, each on a new line.`;
    return prompt;
  }

  /**
   * 执行思维树搜索
   */
  async execute(task) {
    const root = {
      thought: '',
      children: [],
      depth: 0,
      score: 0,
    };

    await this.expandNode(root, task);

    const bestPath = this.findBestPath(root);
    return {
      thoughts: bestPath,
      finalAnswer: bestPath[bestPath.length - 1],
    };
  }

  /**
   * 扩展节点
   */
  async expandNode(node, task) {
    if (node.depth >= this.options.maxDepth) {
      return;
    }

    const prompt = this.generateToTPrompt(task, this.getPathThoughts(node));
    const response = await this.kernel.modelRouter.route({
      content: [{ role: 'user', content: prompt }],
    }, {
      context: {
        systemPrompt: 'You are a helpful assistant with strong reasoning capabilities.',
      },
    });

    if (!response.success) {
      return;
    }

    const thoughts = response.content.split('\n').filter(t => t.trim());
    for (const thought of thoughts.slice(0, this.options.branchingFactor)) {
      const child = {
        thought: thought.trim(),
        children: [],
        depth: node.depth + 1,
        score: await this.evaluateThought(thought, task),
      };
      node.children.push(child);
      await this.expandNode(child, task);
    }
  }

  /**
   * 评估思维
   */
  async evaluateThought(thought, task) {
    const prompt = `Evaluate the following thought for solving the given task. Rate it from 0 to 10, where 10 is the best.

Task: ${task}

Thought: ${thought}

Provide only the score (0-10).`;

    const response = await this.kernel.modelRouter.route({
      content: [{ role: 'user', content: prompt }],
    }, {
      context: {
        systemPrompt: 'You are a helpful assistant with strong reasoning capabilities.',
      },
    });

    if (!response.success) {
      return 0;
    }

    const match = response.content.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  }

  /**
   * 获取路径思维
   */
  getPathThoughts(node) {
    const thoughts = [];
    let current = node;
    while (current.thought) {
      thoughts.unshift(current.thought);
      current = current.parent;
    }
    return thoughts;
  }

  /**
   * 查找最佳路径
   */
  findBestPath(node) {
    if (!node.children || node.children.length === 0) {
      return this.getPathThoughts(node);
    }

    let bestChild = node.children[0];
    for (const child of node.children) {
      if (child.score > bestChild.score) {
        bestChild = child;
      }
    }

    return this.findBestPath(bestChild);
  }
}

export default { AgentChainOfThought, AgentTreeOfThoughts };
