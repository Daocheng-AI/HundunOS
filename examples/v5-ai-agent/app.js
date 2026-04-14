/**
 * HundunOS v5 - AI Agent示例
 * 展示Agent、ModelRouter和RAG插件的使用
 */

import {
  createKernel,
  LoggerPlugin,
  SecurityPlugin,
  ConfigPlugin,
  EventsPlugin,
  CachePlugin,
  DatabasePlugin,
  ApiPlugin,
  ModelRouterPlugin,
  AgentPlugin,
  RagPlugin
} from '../../kernel/v5/index.js';

async function main() {
  console.log('🤖 Starting HundunOS v5 AI Agent Example...\n');

  // 1. 创建内核
  const kernel = createKernel({
    logger: { level: 'info' },
    api: { port: 3001 },
    database: { type: 'sqlite', path: './data/agent.db' },
    models: {
      defaultProvider: 'openai',
      providers: {
        openai: {
          apiKey: process.env.OPENAI_API_KEY || 'sk-test-key'
        }
      }
    },
    rag: {
      vectorStore: 'memory'
    }
  });

  // 2. 注册插件
  console.log('📦 Registering plugins...');
  await kernel.plugins.register(LoggerPlugin);
  await kernel.plugins.register(ConfigPlugin);
  await kernel.plugins.register(EventsPlugin);
  await kernel.plugins.register(SecurityPlugin);
  await kernel.plugins.register(CachePlugin);
  await kernel.plugins.register(DatabasePlugin);
  await kernel.plugins.register(ApiPlugin);
  await kernel.plugins.register(ModelRouterPlugin);
  await kernel.plugins.register(AgentPlugin);
  await kernel.plugins.register(RagPlugin);

  // 3. 初始化
  await kernel.initialize();
  console.log('✅ Kernel initialized\n');

  // 4. 获取服务
  const models = kernel.get('models');
  const agent = kernel.get('agent');
  const rag = kernel.get('rag');
  const api = kernel.get('api');

  // 5. 列出可用模型
  console.log('🧠 Available Models:');
  const availableModels = models.listModels();
  availableModels.slice(0, 5).forEach(m => {
    console.log(`  - ${m.id} (${m.provider})`);
  });
  console.log();

  // 6. 创建知识库
  console.log('📚 Setting up Knowledge Base...');
  await rag.createCollection('docs');
  
  // 索引一些文档
  await rag.indexDocument('docs', {
    id: 'doc-1',
    content: `
      HundunOS is a next-generation AI operating system.
      It provides a microkernel architecture with plugin system.
      Key features include: AI Agent support, RAG capabilities, multi-tenancy.
    `,
    metadata: { source: 'intro', category: 'overview' }
  });

  await rag.indexDocument('docs', {
    id: 'doc-2',
    content: `
      The v5 architecture uses a microkernel design.
      Core components: Kernel, EventBus, ServiceRegistry, PluginManager.
      Plugins are lazy-loaded for better performance.
    `,
    metadata: { source: 'architecture', category: 'technical' }
  });
  console.log('✅ Knowledge base ready\n');

  // 7. 创建AI Agent
  console.log('🤖 Creating AI Agent...');
  const myAgent = agent.createAgent({
    name: 'Hundun Assistant',
    model: 'gpt-3.5-turbo',
    provider: 'openai',
    systemPrompt: `You are HundunOS Assistant. You help users understand the system.
Available tools: search, calculator, memory.
Be concise and helpful.`,
    tools: ['search', 'calculator', 'memory'],
    maxIterations: 5
  });
  console.log('✅ Agent created:', myAgent.id, '\n');

  // 8. 注册自定义工具
  agent.registerTool('search_docs', {
    description: 'Search the knowledge base',
    parameters: {
      query: { type: 'string', required: true }
    },
    handler: async (params) => {
      const results = await rag.search('docs', params.query, { limit: 3 });
      return {
        results: results.map(r => ({
          content: r.content.substring(0, 200) + '...',
          score: r.score
        }))
      };
    }
  });

  // 9. 使用RAG查询
  console.log('🔍 RAG Query Example:');
  const ragResult = await rag.query('docs', 'What is HundunOS?', {
    model: 'gpt-3.5-turbo'
  });
  console.log('  Question: What is HundunOS?');
  console.log('  Answer:', ragResult.answer);
  console.log('  Sources:', ragResult.sources.length);
  console.log();

  // 10. 设置API端点
  api.get('/agent/info', async (ctx) => {
    return {
      agent: {
        id: myAgent.id,
        name: myAgent.name,
        model: myAgent.model
      },
      tools: agent.listTools()
    };
  });

  api.post('/agent/chat', async (ctx) => {
    const { message, sessionId } = ctx.body;
    
    try {
      const result = await agent.execute(myAgent.id, message, { sessionId });
      return {
        success: true,
        response: result.content,
        iterations: result.iterations
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  });

  api.post('/rag/query', async (ctx) => {
    const { question } = ctx.body;
    const result = await rag.query('docs', question);
    return result;
  });

  // 11. 启动API
  await api.start();
  console.log('🌐 API endpoints:');
  console.log('  GET  /agent/info');
  console.log('  POST /agent/chat');
  console.log('  POST /rag/query');
  console.log();

  // 12. 模拟Agent对话
  console.log('💬 Agent Conversation Example:');
  console.log('  User: What can you tell me about the architecture?');
  
  try {
    // 这里会实际调用模型，如果没有API key会失败
    // 所以用try-catch包裹
    const result = await agent.execute(
      myAgent.id,
      'What can you tell me about the architecture?'
    );
    console.log('  Agent:', result.content.substring(0, 200) + '...');
  } catch (err) {
    console.log('  (Agent execution skipped - no API key)');
    console.log('  Set OPENAI_API_KEY environment variable to test');
  }

  console.log('\n✨ AI Agent example completed!');
  console.log('Press Ctrl+C to stop');

  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    await kernel.shutdown();
    console.log('👋 Goodbye!');
    process.exit(0);
  });
}

main().catch(console.error);
