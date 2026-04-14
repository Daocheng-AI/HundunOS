/**
 * HundunOS v3.0 - ModelRouter 统一导出
 */

import { ModelRouter } from './index.js';
import { createStrategy, StrategyType, assessComplexity } from './strategies/index.js';
import { getUsageStats } from './usage-stats.js';
import { getCircuitBreakerManager, CircuitState } from './circuit-breaker.js';

// 重新导出
export { ModelRouter };
export { createStrategy, StrategyType, assessComplexity };
export { getUsageStats };
export { getCircuitBreakerManager, CircuitState };

/**
 * 创建配置好的 ModelRouter
 */
export async function createModelRouter(kernel, config = {}) {
    const router = new ModelRouter(kernel);
    
    // 应用策略
    const strategyType = config.strategy || StrategyType.BALANCED;
    router.strategyEngine = createStrategy(strategyType, config);
    
    // 集成统计
    router.usageStats = getUsageStats();
    
    // 集成熔断器
    router.circuitBreakers = getCircuitBreakerManager();
    
    await router.initialize();
    return router;
}

export default {
    ModelRouter,
    createModelRouter,
    createStrategy,
    StrategyType,
    assessComplexity,
    getUsageStats,
    getCircuitBreakerManager,
    CircuitState
};
