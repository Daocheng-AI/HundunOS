// hundunos/kernel/core.js
// HundunOS v4.1 — Facade: CoreKernel via Mixin Composition
//
// 本文件是向后兼容的 facade：
// - 导出名称仍为 CoreKernel（所有现有 import 路径不变）
// - 实际实现在 core.v4.js（Mixin 组合架构）
// - 81KB monolith → 14KB facade + 5 个独立 Mixin
//
// 如需直接使用 Mixin 架构，导入 CoreKernelV4：
//   import { CoreKernelV4 } from './core.v4.js';
//
// Mixin 组成：CoreMixin + ModuleMixin + ProcessMixin + SessionMixin + RestMixin

export { CoreKernelV4 as CoreKernel } from './core.v4.js';
export { default } from './core.v4.js';
