// hundunos/kernel/mixins/MixinFactory.js
// HundunOS v4.1 — Mixin 组合工厂
// 将多个关注点 mixin 类组合为单个 Kernel 基类
// 源自 MemOS BaseScheduler 架构设计：职责清晰、可插拔

/**
 * MixinFactory — 功能组合工厂
 *
 * 设计原则（MemOS Mixin Pattern）：
 * - 每个 Mixin 独立内聚，只做一件事
 * - 组合顺序决定初始化顺序（由 subMixinInits 定义）
 * - 所有 Mixin 共享 kernel 实例引用（this.kernel）
 * - 支持可选 Mixin（soft=true）缺失不报错
 *
 * @example
 *   const KernelBase = MixinFactory.create(
 *     CoreMixin,
 *     ModuleMixin,
 *     RestMixin,
 *     { soft: true, mixin: OptionalMixin }
 *   );
 */
export class MixinFactory {
    /**
     * 组合多个 Mixin 类为一个新基类
     * @param  {...MixinType | { soft: boolean, mixin: MixinType }} mixins
     * @returns {typeof CoreKernelBase}
     */
    static create(...mixins) {
        // 1. 分离硬依赖和软依赖
        const hardMixins = mixins.filter(m => !m || typeof m !== 'object' || !m.soft);
        const softMixinDefs = mixins
            .filter(m => m && typeof m === 'object' && m.soft)
            .map(m => m.mixin);

        // 2. 验证所有 Mixin 有 init 方法
        for (const M of hardMixins) {
            if (!M || typeof M !== 'function') {
                throw new Error(`[MixinFactory] Invalid mixin: ${M}`);
            }
            if (typeof M.prototype.init !== 'function') {
                throw new Error(`[MixinFactory] Mixin ${M.name} must define init(kernel, phase)`);
            }
        }

        // 3. 提取所有 Mixin 的 init 方法（保持声明顺序）
        const allMixins = [...hardMixins, ...softMixinDefs];
        const subMixinInits = allMixins
            .map(M => M.prototype.init)
            .filter(Boolean);

        // 4. 收集所有 Mixin 方法（跳过 constructor）
        // 注意：保留 'init' — ModuleMixin 用 init_modules() 做真实实现，init() 作为 MixinFactory 验证桩
        const mixinMethods = {};
        for (const M of allMixins) {
            const proto = M.prototype;
            for (const name of Object.getOwnPropertyNames(proto)) {
                if (name === 'constructor') continue;
                const descriptor = Object.getOwnPropertyDescriptor(proto, name);
                if (descriptor) {
                    mixinMethods[name] = descriptor;
                }
            }
        }

        // 5. 构建组合基类
        class CoreKernelBase {
            /**
             * 执行所有 Mixin 的 init，按声明顺序分 phase
             * phase 顺序：'config' → 'platform' → 'core' → 'modules' → 'extended' → 'rest'
             */
            async _initMixins(phases = ['config', 'platform', 'core', 'modules', 'extended', 'rest']) {
                for (const initFn of subMixinInits) {
                    try {
                        // 每个 Mixin.init 接收 kernel + 当前 phase
                        await initFn.call(this, this, phases);
                    } catch (e) {
                        // Mixin 初始化失败 → 降级，不阻断启动
                        console.warn(`[MixinFactory] ${initFn.name || 'anonymous'} init failed: ${e.message}`);
                    }
                }
            }

            /**
             * 收集所有 Mixin 贡献的 getStatus 字段
             * 各 Mixin 定义 getMixinStatus() → 返回子状态对象
             */
            _collectMixinStatus() {
                const status = {};
                for (const name of Object.getOwnPropertyNames(mixinMethods)) {
                    if (name.startsWith('getMixinStatus_')) {
                        try {
                            const fn = this[name];
                            if (typeof fn === 'function') {
                                const key = name.replace('getMixinStatus_', '');
                                Object.assign(status, fn.call(this));
                            }
                        } catch (_) { /* ignore */ }
                    }
                }
                return status;
            }
        }

        // 6. 应用所有 Mixin 方法到基类
        Object.defineProperties(CoreKernelBase.prototype, mixinMethods);

        // 7. 标记组合信息（供调试/元编程）
        CoreKernelBase._mixinSources = allMixins.map(M => M.name);

        return CoreKernelBase;
    }

    /**
     * 验证组合后的类是否包含预期方法
     * @param {typeof CoreKernelBase} KernelClass
     * @param {string[]} requiredMethods
     */
    static validate(KernelClass, requiredMethods = []) {
        const missing = requiredMethods.filter(
            m => typeof KernelClass.prototype[m] !== 'function'
        );
        if (missing.length > 0) {
            console.warn(`[MixinFactory] Missing methods: ${missing.join(', ')}`);
        }
        return missing.length === 0;
    }
}

export default MixinFactory;
