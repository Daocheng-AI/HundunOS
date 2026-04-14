// hundunos/kernel/mixins/index.js
// HundunOS v4.1 — Mixins 汇总导出
// 提供统一的 Mixin 组合入口

export { MixinFactory } from './MixinFactory.js';
export { CoreMixin } from './CoreMixin.js';
export { ModuleMixin } from './ModuleMixin.js';
export { ProcessMixin } from './ProcessMixin.js';
export { SessionMixin } from './SessionMixin.js';
export { RestMixin } from './RestMixin.js';

import { MixinFactory } from './MixinFactory.js';
import { CoreMixin } from './CoreMixin.js';
import { ModuleMixin } from './ModuleMixin.js';
import { ProcessMixin } from './ProcessMixin.js';
import { SessionMixin } from './SessionMixin.js';
import { RestMixin } from './RestMixin.js';

/**
 * 默认 Mixin 组合（推荐配置）
 * 包含所有 Mixin，覆盖全部功能
 */
export const DEFAULT_MIXINS = [
    CoreMixin,      // 配置 + 状态 + 生命周期
    ModuleMixin,    // 20+ 模块初始化
    ProcessMixin,   // 主处理管线
    SessionMixin,   // 会话 + Agent 管理
    RestMixin,      // REST API + Hook
];

/**
 * 创建完整的 Mixin 组合 Kernel 基类
 * @returns {typeof CoreKernelV4}
 */
export function createFullKernel() {
    return MixinFactory.create(...DEFAULT_MIXINS);
}

/**
 * 创建最小化 Kernel（仅核心）
 * 用于测试或最小化场景
 */
export function createMinimalKernel() {
    return MixinFactory.create(CoreMixin, ModuleMixin, ProcessMixin, SessionMixin);
}

/**
 * 创建标准 Kernel（不含 REST，用于 CLI 场景）
 */
export function createStandardKernel() {
    return MixinFactory.create(CoreMixin, ModuleMixin, ProcessMixin, SessionMixin);
}
