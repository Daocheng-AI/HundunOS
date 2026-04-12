/**
 * Supermemory 集成使用示例
 *
 * 本文件展示了如何使用 Supermemory 与 HundunOS 的集成功能。
 */

// 示例 1：基本用法
async function example1_basicUsage() {
  console.log('=== 示例 1：基本用法 ===');

  // 获取用户画像
  const profile = await kernel._modules.supermemory.getUserProfile();
  console.log('用户画像:', profile);

  // 添加记忆
  const memory = await kernel._modules.supermemory.addMemory('用户偏好使用 TypeScript 进行开发');
  console.log('已添加记忆:', memory);

  // 搜索记忆
  const results = await kernel._modules.supermemory.searchMemories('TypeScript');
  console.log('搜索结果:', results);

  // 混合搜索
  const hybridResults = await kernel._modules.supermemory.hybridSearch('认证迁移');
  console.log('混合搜索结果:', hybridResults);
}

// 示例 2：批量操作
async function example2_bulkOperations() {
  console.log('=== 示例 2：批量操作 ===');

  // 批量添加记忆
  const memories = [
    { content: '用户正在处理认证迁移', metadata: { source: 'user' } },
    { content: '用户正在调试速率限制问题', metadata: { source: 'user' } },
    { content: '用户偏好使用 Vim 编辑器', metadata: { source: 'user' } }
  ];

  const batchResult = await kernel._modules.supermemory.batchAddMemories(memories);
  console.log('批量添加结果:', batchResult);

  // 批量搜索
  const queries = [
    { query: '认证', containerTag: 'user_default' },
    { query: '调试', containerTag: 'user_default' },
    { query: 'Vim', containerTag: 'user_default' }
  ];

  const searchResults = await kernel._modules.supermemory.batchSearchMemories(queries);
  console.log('批量搜索结果:', searchResults);
}

// 示例 3：缓存管理
async function example3_cacheManagement() {
  console.log('=== 示例 3：缓存管理 ===');

  // 获取缓存统计
  const stats = await kernel._modules.supermemory.getCacheStats();
  console.log('缓存统计:', stats);

  // 清除特定缓存
  await kernel._modules.supermemory.clearCache('profile:*');
  console.log('已清除用户画像缓存');

  // 预热缓存
  await kernel._modules.supermemory.warmupCache('user_default');
  console.log('缓存预热完成');

  // 再次查看缓存统计
  const newStats = await kernel._modules.supermemory.getCacheStats();
  console.log('预热后的缓存统计:', newStats);
}

// 示例 4：ContextEnhancer 集成
async function example4_contextEnhancerIntegration() {
  console.log('=== 示例 4：ContextEnhancer 集成 ===');

  const { SupermemoryContextEnhancerIntegration } = await import('./kernel/supermemory/integrations/context-enhancer-integration.js');

  // 创建集成实例
  const integration = new SupermemoryContextEnhancerIntegration(kernel);
  await integration.initialize();

  // 构建增强上下文
  const enhancedContext = await integration.buildEnhancedContext({
    query: 'TypeScript 开发',
    maxMemories: 5
  });

  console.log('增强上下文:', enhancedContext);

  // 注入用户画像
  const contextWithProfile = integration.injectUserProfile(
    '原始上下文...',
    enhancedContext.userProfile
  );
  console.log('注入用户画像后的上下文:', contextWithProfile);

  // 注入相关记忆
  const contextWithMemories = integration.injectRelevantMemories(
    contextWithProfile,
    enhancedContext.relevantMemories
  );
  console.log('注入相关记忆后的上下文:', contextWithMemories);

  // 控制上下文长度
  const trimmedContext = integration.controlContextLength(contextWithMemories, 8000);
  console.log('长度控制后的上下文:', trimmedContext);
}

// 示例 5：MemoryGraph 集成
async function example5_memoryGraphIntegration() {
  console.log('=== 示例 5：MemoryGraph 集成 ===');

  const { SupermemoryMemoryGraphIntegration } = await import('./kernel/supermemory/integrations/memory-graph-integration.js');

  // 创建集成实例
  const integration = new SupermemoryMemoryGraphIntegration(kernel);
  await integration.initialize();

  // 配置集成
  integration.configure({
    dualWrite: true,
    sync: false,
    conflictStrategy: 'newest'
  });

  // 记录记忆（带双写）
  const memory = await integration.recordMemory(
    { content: '用户消息：请帮我优化这段代码' },
    { intent: 'code_optimization' },
    { result: '优化后的代码...' }
  );
  console.log('已记录记忆:', memory);

  // 检索记忆（合并本地和云端）
  const memories = await integration.recallMemories('代码优化', { limit: 10 });
  console.log('检索到的记忆:', memories);

  // 获取同步状态
  const syncStatus = integration.getSyncStatus();
  console.log('同步状态:', syncStatus);
}

// 示例 6：错误处理和降级
async function example6_errorHandling() {
  console.log('=== 示例 6：错误处理和降级 ===');

  try {
    // 尝试获取用户画像
    const profile = await kernel._modules.supermemory.getUserProfile();
    console.log('用户画像:', profile);
  } catch (error) {
    console.error('获取用户画像失败:', error.message);

    // 检查是否为离线模式
    const isOffline = kernel._modules.supermemory.isOfflineMode();
    console.log('离线模式:', isOffline);

    // 如果是离线模式，可以启用离线模式
    if (!isOffline) {
      kernel._modules.supermemory.enableOfflineMode();
      console.log('已启用离线模式');
    }
  }

  // 健康检查
  const health = await kernel._modules.supermemory.checkSupermemoryHealth();
  console.log('健康状态:', health);
}

// 示例 7：配置管理
async function example7_configuration() {
  console.log('=== 示例 7：配置管理 ===');

  // 获取配置
  const config = kernel._modules.supermemory.getSupermemoryConfig();
  console.log('Supermemory 配置:', config);

  // 修改配置（需要重新初始化）
  // 注意：这只是一个示例，实际使用中应该在系统配置文件中修改
  console.log('当前容器标签策略:', config.containerTagStrategy);
  console.log('缓存配置:', config.cache);
  console.log('重试配置:', config.retry);
}

// 示例 8：完整的工作流程
async function example8_completeWorkflow() {
  console.log('=== 示例 8：完整的工作流程 ===');

  // 1. 检查健康状态
  const health = await kernel._modules.supermemory.checkSupermemoryHealth();
  console.log('1. 健康状态:', health);

  if (!health.healthy) {
    console.log('Supermemory 不可用，跳过后续操作');
    return;
  }

  // 2. 获取用户画像
  const profile = await kernel._modules.supermemory.getUserProfile();
  console.log('2. 用户画像:', profile);

  // 3. 添加一些记忆
  const memories = [
    '用户正在开发一个 TypeScript 项目',
    '用户偏好使用 VS Code 作为编辑器',
    '用户正在学习 React 框架'
  ];

  for (const content of memories) {
    const memory = await kernel._modules.supermemory.addMemory(content);
    console.log('3. 已添加记忆:', memory.id);
  }

  // 4. 搜索记忆
  const results = await kernel._modules.supermemory.searchMemories('TypeScript');
  console.log('4. 搜索结果:', results.memories.length, '条');

  // 5. 混合搜索
  const hybridResults = await kernel._modules.supermemory.hybridSearch('React');
  console.log('5. 混合搜索结果:', hybridResults);

  // 6. 查看缓存统计
  const stats = await kernel._modules.supermemory.getCacheStats();
  console.log('6. 缓存统计:', stats);

  // 7. 清除缓存
  await kernel._modules.supermemory.clearCache();
  console.log('7. 已清除所有缓存');

  console.log('工作流程完成！');
}

// 主函数
async function main() {
  try {
    // 检查 Supermemory 是否已初始化
    if (!kernel._modules.supermemory) {
      console.error('Supermemory 未初始化，请先在 HundunOS 中注册 SupermemoryMixin');
      return;
    }

    // 运行示例
    await example1_basicUsage();
    console.log('\n');

    await example2_bulkOperations();
    console.log('\n');

    await example3_cacheManagement();
    console.log('\n');

    await example4_contextEnhancerIntegration();
    console.log('\n');

    await example5_memoryGraphIntegration();
    console.log('\n');

    await example6_errorHandling();
    console.log('\n');

    await example7_configuration();
    console.log('\n');

    await example8_completeWorkflow();
  } catch (error) {
    console.error('运行示例时出错:', error);
  }
}

// 如果直接运行此文件，执行主函数
if (require.main === module) {
  main();
}

// 导出示例函数供其他模块使用
module.exports = {
  example1_basicUsage,
  example2_bulkOperations,
  example3_cacheManagement,
  example4_contextEnhancerIntegration,
  example5_memoryGraphIntegration,
  example6_errorHandling,
  example7_configuration,
  example8_completeWorkflow
};
