/**
 * HundunOS v3.0 - 熔断器模块
 * 防止故障 provider 持续调用，支持自动恢复
 */

/**
 * 熔断器状态
 */
export const CircuitState = {
    CLOSED: 'CLOSED',     // 正常状态，允许调用
    OPEN: 'OPEN',         // 熔断状态，拒绝调用
    HALF_OPEN: 'HALF_OPEN' // 半开状态，允许试探性调用
};

/**
 * 熔断器
 */
export class CircuitBreaker {
    constructor(config = {}) {
        this.failureThreshold = config.failureThreshold || 5;    // 连续失败阈值
        this.successThreshold = config.successThreshold || 3;   // 恢复成功阈值
        this.timeout = config.timeout || 60000;                  // 熔断超时时间（ms）
        
        this.failures = 0;
        this.successes = 0;
        this.state = CircuitState.CLOSED;
        this.lastFailureTime = null;
        this.lastStateChange = Date.now();
    }

    /**
     * 检查是否允许调用
     */
    canCall() {
        switch (this.state) {
            case CircuitState.CLOSED:
                return true;

            case CircuitState.OPEN:
                // 检查是否超时，可以进入半开状态
                if (Date.now() - this.lastFailureTime > this.timeout) {
                    this._transitionTo(CircuitState.HALF_OPEN);
                    return true;
                }
                return false;

            case CircuitState.HALF_OPEN:
                return true;

            default:
                return false;
        }
    }

    /**
     * 记录成功
     */
    recordSuccess() {
        this.failures = 0;
        
        if (this.state === CircuitState.HALF_OPEN) {
            this.successes++;
            if (this.successes >= this.successThreshold) {
                this._transitionTo(CircuitState.CLOSED);
            }
        }
    }

    /**
     * 记录失败
     */
    recordFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();
        this.successes = 0;

        if (this.failures >= this.failureThreshold) {
            this._transitionTo(CircuitState.OPEN);
        }
    }

    _transitionTo(newState) {
        const oldState = this.state;
        this.state = newState;
        this.lastStateChange = Date.now();

        if (newState === CircuitState.CLOSED) {
            this.failures = 0;
            this.successes = 0;
        }

        console.log(`[CircuitBreaker] ${oldState} -> ${newState}`);
    }

    /**
     * 获取状态
     */
    getStatus() {
        return {
            state: this.state,
            failures: this.failures,
            successes: this.successes,
            canCall: this.canCall(),
            lastFailureTime: this.lastFailureTime,
            lastStateChange: this.lastStateChange
        };
    }

    /**
     * 强制重置
     */
    reset() {
        this.failures = 0;
        this.successes = 0;
        this.state = CircuitState.CLOSED;
        this.lastFailureTime = null;
        this.lastStateChange = Date.now();
    }
}

/**
 * 熔断器管理器
 * 管理多个 provider 的熔断器
 */
export class CircuitBreakerManager {
    constructor() {
        this.breakers = new Map();
    }

    /**
     * 获取或创建熔断器
     */
    getBreaker(providerId, config = {}) {
        if (!this.breakers.has(providerId)) {
            this.breakers.set(providerId, new CircuitBreaker(config));
        }
        return this.breakers.get(providerId);
    }

    /**
     * 检查 provider 是否可调用
     */
    canCall(providerId) {
        const breaker = this.breakers.get(providerId);
        return breaker ? breaker.canCall() : true;
    }

    /**
     * 记录成功
     */
    recordSuccess(providerId) {
        const breaker = this.breakers.get(providerId);
        if (breaker) breaker.recordSuccess();
    }

    /**
     * 记录失败
     */
    recordFailure(providerId) {
        let breaker = this.breakers.get(providerId);
        if (!breaker) {
            breaker = new CircuitBreaker();
            this.breakers.set(providerId, breaker);
        }
        breaker.recordFailure();
    }

    /**
     * 获取所有熔断器状态
     */
    getAllStatus() {
        const status = {};
        for (const [id, breaker] of this.breakers) {
            status[id] = breaker.getStatus();
        }
        return status;
    }

    /**
     * 重置所有熔断器
     */
    resetAll() {
        for (const breaker of this.breakers.values()) {
            breaker.reset();
        }
    }
}

// 单例
let managerInstance = null;

export function getCircuitBreakerManager() {
    if (!managerInstance) {
        managerInstance = new CircuitBreakerManager();
    }
    return managerInstance;
}

export default {
    CircuitBreaker,
    CircuitBreakerManager,
    CircuitState,
    getCircuitBreakerManager
};
