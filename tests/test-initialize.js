// HundunOS v3.0 初始化测试脚本
import { CoreKernel } from './kernel/core.js';

// review: removed // review: removed console.log('=== HundunOS v3.0 初始化测试 ===');
// review: removed // review: removed console.log('环境变量 NODE_ENV:', process.env.NODE_ENV || '未设置');

async function testInitialization(env = 'development') {
  // review: removed // review: removed console.log(`\n--- 测试 ${env} 环境初始化 ---`);
  
  // 设置环境变量
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = env;
  
  try {
    const kernel = new CoreKernel({
      environment: env,
      workspace: '.',
      storageDir: './data'
    });
    
    // review: removed // review: removed console.log('✅ 内核对象创建成功');
    // review: removed // review: removed console.log('配置加载统计:', {
      environment: kernel.config?.environment,
      projectRoot: kernel.config?.projectRoot?.substring(0, 50) + '...',
      modulesCount: Object.keys(kernel.config?.system?.modules || {}).length,
      hasCorsConfig: !!(kernel.config?.system?.restApi?.cors),
      hasRateLimit: !!(kernel.config?.system?.rateLimit)
    });
    
    // review: removed // review: removed console.log('状态检查:', {
      initialized: kernel.state?.initialized,
      running: kernel.state?.running,
      environment: kernel.state?.environment
    });
    
    // 尝试初始化（快速测试）
    // review: removed // review: removed console.log('\n正在初始化内核...');
    const startTime = Date.now();
    
    // 设置超时，避免长时间运行
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('初始化超时 (10秒)')), 10000);
    });
    
    const initPromise = kernel.initialize().then(() => {
      const elapsed = Date.now() - startTime;
      // review: removed // review: removed console.log(`✅ 初始化成功 (${elapsed}ms)`);
      return { success: true, elapsed };
    }).catch(error => {
      // review: removed // review: removed console.log('❌ 初始化失败:', error.message);
      return { success: false, error: error.message };
    });
    
    const result = await Promise.race([initPromise, timeoutPromise]);
    
    // review: removed // review: removed console.log('初始化结果:', result);
    
    // 尝试一个简单的处理
    if (result.success) {
      // review: removed // review: removed console.log('\n--- 测试简单请求处理 ---');
      try {
        const processResult = await kernel.process({ content: 'test message' });
        // review: removed // review: removed console.log('✅ 请求处理成功:', {
          success: processResult.success,
          type: processResult.type,
          latency: processResult.latency
        });
      } catch (error) {
        // review: removed // review: removed console.log('⚠️  请求处理失败（可能是预期的）:', error.message);
      }
    }
    
    return { environment: env, success: result.success !== false };
    
  } catch (error) {
    // review: removed // review: removed console.log('❌ 内核创建失败:', error.message);
    return { environment: env, success: false, error: error.message };
  } finally {
    // 恢复环境变量
    process.env.NODE_ENV = originalEnv;
  }
}

// 运行测试
async function runTests() {
  // review: removed // review: removed console.log('开始测试不同环境的初始化...');
  
  const environments = ['development', 'testing'];
  // 注意：生产环境可能需要更多配置，这里暂时跳过
  
  const results = [];
  
  for (const env of environments) {
    const result = await testInitialization(env);
    results.push(result);
    
    // 短暂的暂停
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // review: removed // review: removed console.log('\n=== 测试结果汇总 ===');
  results.forEach(result => {
    // review: removed // review: removed console.log(`${result.environment}: ${result.success ? '✅ 通过' : '❌ 失败'} ${result.error ? `(${result.error})` : ''}`);
  });
  
  const totalPassed = results.filter(r => r.success).length;
  const totalTests = results.length;
  
  // review: removed // review: removed console.log(`\n总测试数: ${totalTests}, 通过: ${totalPassed}, 失败: ${totalTests - totalPassed}`);
  
  if (totalPassed === totalTests) {
    // review: removed // review: removed console.log('✅ 所有环境测试通过！');
  } else {
    // review: removed // review: removed console.log('⚠️  某些测试失败，请检查配置');
  }
  
  // 清理：建议手动关闭内核
  // review: removed // review: removed console.log('\n测试完成。如果内核正在运行，请手动关闭。');
}

// 运行测试
runTests().catch(error => {
  console.error('测试脚本错误:', error);
  process.exit(1);
});