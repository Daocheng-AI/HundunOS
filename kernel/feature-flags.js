// hundunos/kernel/feature-flags.js — Feature Flag System v1.1
// 借鉴 Claude Code feature() 系统设计
// 参考: claude-code-best/src/tools.ts feature() + bun:bundle
// v3.8 Phase 6: 新增 SKILLS_SYSTEM flag
// 使用方式：
//   import { feature, setFeature, listFeatures } from './feature-flags.js'
//   if (feature('BUDDY')) { /* ... */ }
//   setFeature('DEBUG_MODE', true)  // 运行时覆盖
//
// 环境变量启用：
//   HUNDUNOS_BUDDY=1 hundunos start
//   HUNDUNOS_AUTO_MODE=1 hundunos start

/**
 * Feature Flag 定义表
 * 每个 flag: { env, description, default, type }
 * env: 环境变量名（HUNDUNOS_ 前缀自动添加）
 * default: 默认值（布尔）
 * description: 功能说明
 */
const FEATURE_REGISTRY = {
  // ─── P0: 基础能力 ────────────────────────────────
  
  /** 渐进式功能发布开关（总开关）*/
  FEATURE_SYSTEM: {
    env: 'HUNDUNOS_FEATURE_SYSTEM',
    description: 'Feature Flag 系统总开关',
    default: true,
    type: 'boolean',
  },

  /** Buddy 陪伴模式 — 次级 AI 协作者 */
  BUDDY: {
    env: 'HUNDUNOS_BUDDY',
    description: 'Buddy 陪伴 AI 协作者（次级 Agent，提供建议）',
    default: false,
    type: 'boolean',
  },

  /** 自动模式 — 无需人工确认执行危险操作 */
  AUTO_MODE: {
    env: 'HUNDUNOS_AUTO_MODE',
    description: 'Auto Mode（危险操作自动执行，无需确认）',
    default: false,
    type: 'boolean',
  },

  /** 主动建议 — Proactive/SleepTool */
  PROACTIVE: {
    env: 'HUNDUNOS_PROACTIVE',
    description: '主动建议时机检测与摘要生成',
    default: false,
    type: 'boolean',
  },

  /** 读写分离 Tool 调度 */
  TOOL_RW_SPLIT: {
    env: 'HUNDUNOS_TOOL_RW_SPLIT',
    description: 'Tool 执行器读写分离（读并发/写串行）',
    default: true,
    type: 'boolean',
  },

  // v3.6: hundunos-rust 集成
  RUST_BRIDGE: {
    env: 'HUNDUNOS_RUST_BRIDGE',
    description: 'hundunos-rust tool-bridge 三层命令执行（+shortcut / .api / raw）',
    default: false,
    type: 'boolean',
  },

  // ─── P1: 协作与生态 ────────────────────────────────

  /** Phase 1: 自定义 Skill 系统 */
  SKILL_SYSTEM: {
    env: 'HUNDUNOS_SKILL_SYSTEM',
    description: 'Phase 1 自定义 Skill 系统（YAML 定义/工具注册/LLM 匹配）',
    default: true,
    type: 'boolean',
  },

  /** Agent Team 多代理协作 */
  AGENT_TEAMS: {
    env: 'HUNDUNOS_AGENT_TEAMS',
    description: '多代理协作系统（角色分配/任务分发/结果汇总）',
    default: false,
    type: 'boolean',
  },

  /** MCP 生态集成 */
  MCP_CLIENT: {
    env: 'HUNDUNOS_MCP_CLIENT',
    description: 'MCP (Model Context Protocol) 客户端支持',
    default: false,
    type: 'boolean',
  },

  /** MCP OAuth 认证 */
  MCP_OAUTH: {
    env: 'HUNDUNOS_MCP_OAUTH',
    description: 'MCP OAuth 认证流程',
    default: false,
    type: 'boolean',
  },

  /** Git Worktree 隔离执行 */
  WORKTREE_ISOLATION: {
    env: 'HUNDUNOS_WORKTREE_ISOLATION',
    description: 'Git Worktree 隔离执行 Agent',
    default: false,
    type: 'boolean',
  },

  // ─── P2: 高级能力 ─────────────────────────────────

  /** Computer Use — GUI 键鼠操控 */
  COMPUTER_USE: {
    env: 'HUNDUNOS_COMPUTER_USE',
    description: '跨平台 GUI 键鼠操控（截图/鼠标/键盘）',
    default: false,
    type: 'boolean',
  },

  /** OpenAI 兼容 API */
  OPENAI_COMPAT: {
    env: 'HUNDUNOS_OPENAI_COMPAT',
    description: 'OpenAI Chat Completions 兼容层',
    default: false,
    type: 'boolean',
  },

  /** Gemini 兼容 API */
  GEMINI_COMPAT: {
    env: 'HUNDUNOS_GEMINI_COMPAT',
    description: 'Google Gemini API 兼容层',
    default: false,
    type: 'boolean',
  },

  /** 长会话消息压缩 */
  CONTEXT_COMPACT: {
    env: 'HUNDUNOS_CONTEXT_COMPACT',
    description: '长会话消息压缩（摘要生成 + 上下文折叠）',
    default: false,
    type: 'boolean',
  },

  /** 响应式压缩（按 token 使用率触发）*/
  REACTIVE_COMPACT: {
    env: 'HUNDUNOS_REACTIVE_COMPACT',
    description: '响应式压缩（token 使用率 > 70% 时触发）',
    default: false,
    type: 'boolean',
  },

  /** 上下文折叠 */
  CONTEXT_COLLAPSE: {
    env: 'HUNDUNOS_CONTEXT_COLLAPSE',
    description: '上下文折叠（保留关键决策，折叠重复内容）',
    default: false,
    type: 'boolean',
  },

  /** Bridge Mode — 远程控制 */
  BRIDGE_MODE: {
    env: 'HUNDUNOS_BRIDGE_MODE',
    description: 'Bridge 远程控制模式（JWT 认证 + WebSocket）',
    default: false,
    type: 'boolean',
  },

  /** 后台会话支持 */
  BG_SESSIONS: {
    env: 'HUNDUNOS_BG_SESSIONS',
    description: '后台会话（daemon / ps / logs / attach / kill）',
    default: false,
    type: 'boolean',
  },

  /** Skill 搜索实验 */
  EXPERIMENTAL_SKILL_SEARCH: {
    env: 'HUNDUNOS_EXPERIMENTAL_SKILL_SEARCH',
    description: '实验性 Skill 搜索预取',
    default: false,
    type: 'boolean',
  },

  /** 模板任务分类 */
  TEMPLATES: {
    env: 'HUNDUNOS_TEMPLATES',
    description: '任务模板分类器（按类型路由到专业 Agent）',
    default: false,
    type: 'boolean',
  },

  // ─── 调试 / 实验 ──────────────────────────────────

  /** 调试模式 */
  DEBUG_MODE: {
    env: 'HUNDUNOS_DEBUG',
    description: '调试模式（verbose 日志 / trace 输出）',
    default: false,
    type: 'boolean',
  },

  /** 追踪模式 */
  TRACING: {
    env: 'HUNDUNOS_TRACING',
    description: '执行追踪（记录每步耗时 / 调用栈）',
    default: false,
    type: 'boolean',
  },

  // ─── Phase 3: Rust Core 集成 ─────────────────────────

  /** Rust Core — Unix Socket 连接 hundunos-core 守护进程（推荐，性能最优） */
  RUST_CORE_SOCKET: {
    env: 'HUNDUNOS_RUST_SOCKET',
    description: '使用 TCP:38082 连接 hundunos-core 守护进程（推荐 ~0ms 调用）',
    default: false,
    type: 'boolean',
  },

  /** Rust Tool Bridge — 使用 Rust 版本的 tool-bridge（替代 JS） */
  RUST_TOOL_BRIDGE: {
    env: 'HUNDUNOS_RUST_TOOL',
    description: 'Rust Tool Bridge（hundunos-tool.exe）替代 JS tool-bridge.js',
    default: true,
    type: 'boolean',
  },

  /** Rust Memory Graph — 使用 Rust 版本的 memory-graph */
  RUST_MEMORY_GRAPH: {
    env: 'HUNDUNOS_RUST_MEMORY',
    description: 'Rust Memory Graph（hundunos-memory.exe）替代 JS memory-graph.js',
    default: true,
    type: 'boolean',
  },

  /** Rust Model Router — 使用 Rust 版本的 model-router */
  RUST_MODEL_ROUTER: {
    env: 'HUNDUNOS_RUST_ROUTER',
    description: 'Rust Model Router（hundunos-router.exe）替代 JS model-router.js',
    default: true,
    type: 'boolean',
  },

  /** Rust Policy Engine — 使用 Rust 版本的 policy-engine */
  RUST_POLICY_ENGINE: {
    env: 'HUNDUNOS_RUST_POLICY',
    description: 'Rust Policy Engine（hundunos-policy.exe）替代 JS policy-engine.js',
    default: true,
    type: 'boolean',
  },

  /** Rust Task Scientist — 使用 Rust 版本的 task-scientist（实验性） */
  RUST_TASK_SCIENTIST: {
    env: 'HUNDUNOS_RUST_SCIENTIST',
    description: 'Rust Task Scientist（hundunos-scientist.exe）— 实验性',
    default: false,
    type: 'boolean',
  },

  // Phase 7: Hook System
  HOOK_SYSTEM: {
    env: 'HUNDUNOS_HOOKS',
    description: 'Hook 事件系统（YAML 配置 + 工具执行拦截）',
    default: true,
    type: 'boolean',
  },

  // Phase 6: Custom Skill 系统
  SKILLS_SYSTEM: {
    env: 'HUNDUNOS_SKILLS',
    description: '自定义 Skill 系统（YAML Skill 注册表 + 隔离执行引擎）',
    default: true,
    type: 'boolean',
  },

  // Phase 7: REST API Server
  REST_SERVER: {
    env: 'HUNDUNOS_REST_SERVER',
    description: 'REST API HTTP 服务器（端口 38080，API Key + RateLimiter + Feature Flag 门控）',
    default: true,
    type: 'boolean',
  },
};

/**
 * 运行时覆盖（优先级最高）
 * 允许代码中动态 setFeature()，覆盖环境变量
 */
const _runtimeOverrides = {};

/**
 * 内核引用（延迟注入，避免循环依赖）
 */
let _kernelRef = null;

/**
 * 初始化 — 由 core.js 在启动时调用
 */
export function initFeatureFlags(kernel) {
  _kernelRef = kernel;
  
  // 从 kernel.config 读取 flag 默认值覆盖
  const configFlags = kernel?.config?.system?.featureFlags || {};
  for (const [name, override] of Object.entries(configFlags)) {
    if (typeof override === 'boolean') {
      _runtimeOverrides[name] = override;
    }
  }

  const enabled = Array.from(_kernelRef ? Object.keys(FEATURE_REGISTRY) : [])
    .filter(name => feature(name));

  console.log(`[FeatureFlags] ${enabled.length}/${Object.keys(FEATURE_REGISTRY).length} features enabled`);
  return enabled;
}

/**
 * 查询一个 feature 是否启用
 * 优先级：运行时覆盖 > 环境变量 > config > 默认值
 */
export function feature(name) {
  if (!_kernelRef && !_isBootstrapMode()) {
    // Bootstrap 阶段（core.js 初始化前），仅用环境变量
    return _resolveFromEnv(name);
  }

  // 1. 运行时覆盖
  if (name in _runtimeOverrides) {
    return _runtimeOverrides[name];
  }

  // 2. 内核配置（config/system.featureFlags）
  if (_kernelRef?.config?.system?.featureFlags?.[name] !== undefined) {
    return !!_kernelRef.config.system.featureFlags[name];
  }

  // 3. 环境变量
  return _resolveFromEnv(name);
}

function _resolveFromEnv(name) {
  const def = FEATURE_REGISTRY[name];
  if (!def) {
    // 未知 flag，默认关闭（安全策略）
    if (process.env.HUNDUNOS_STRICT_MODE !== '1') {
      console.warn(`[FeatureFlags] Unknown flag: ${name} (default: false)`);
    }
    return false;
  }

  const val = process.env[def.env];
  if (val !== undefined) {
    return _parseEnvValue(val);
  }
  return def.default;
}

function _parseEnvValue(val) {
  if (val === '1' || val === 'true' || val === 'yes') return true;
  if (val === '0' || val === 'false' || val === 'no') return false;
  return false;
}

function _isBootstrapMode() {
  return !_kernelRef && typeof process !== 'undefined' && !!process.env;
}

/**
 * 运行时设置 feature（覆盖环境变量，仅当前进程生效）
 */
export function setFeature(name, value) {
  const def = FEATURE_REGISTRY[name];
  if (!def) {
    console.warn(`[FeatureFlags] setFeature: unknown flag "${name}"`);
    return false;
  }
  _runtimeOverrides[name] = !!value;
  return true;
}

/**
 * 批量设置 features
 */
export function setFeatures(flags) {
  for (const [name, value] of Object.entries(flags)) {
    setFeature(name, value);
  }
}

/**
 * 查询当前状态（用于调试 / UI 显示）
 */
export function getFeatureInfo(name) {
  const def = FEATURE_REGISTRY[name];
  if (!def) return null;
  return {
    name,
    enabled: feature(name),
    env: def.env,
    default: def.default,
    description: def.description,
    type: def.type,
    runtimeOverride: name in _runtimeOverrides ? _runtimeOverrides[name] : null,
  };
}

/**
 * 列出所有已启用的 features
 */
export function listEnabledFeatures() {
  return Object.keys(FEATURE_REGISTRY).filter(name => feature(name));
}

/**
 * 列出所有 features 的详细信息
 */
export function listAllFeatures() {
  return Object.keys(FEATURE_REGISTRY).map(name => getFeatureInfo(name));
}

/**
 * 按类别列出 features
 */
export function listFeaturesByCategory() {
  return {
    P0: ['FEATURE_SYSTEM', 'BUDDY', 'AUTO_MODE', 'PROACTIVE', 'TOOL_RW_SPLIT', 'RUST_BRIDGE']
      .map(n => getFeatureInfo(n)).filter(Boolean),
    P1: ['SKILL_SYSTEM', 'AGENT_TEAMS', 'MCP_CLIENT', 'MCP_OAUTH', 'WORKTREE_ISOLATION']
      .map(n => getFeatureInfo(n)).filter(Boolean),
    P2: ['COMPUTER_USE', 'OPENAI_COMPAT', 'GEMINI_COMPAT', 'CONTEXT_COMPACT',
         'REACTIVE_COMPACT', 'CONTEXT_COLLAPSE', 'BRIDGE_MODE', 'BG_SESSIONS',
         'EXPERIMENTAL_SKILL_SEARCH', 'TEMPLATES']
      .map(n => getFeatureInfo(n)).filter(Boolean),
    RUST: ['RUST_CORE_SOCKET', 'RUST_TOOL_BRIDGE', 'RUST_MEMORY_GRAPH',
            'RUST_MODEL_ROUTER', 'RUST_POLICY_ENGINE', 'RUST_TASK_SCIENTIST']
      .map(n => getFeatureInfo(n)).filter(Boolean),
    SKILLS: ['SKILLS_SYSTEM'],
    HOOKS: ['HOOK_SYSTEM']
      .map(n => getFeatureInfo(n)).filter(Boolean),
    DEBUG: ['DEBUG_MODE', 'TRACING']
      .map(n => getFeatureInfo(n)).filter(Boolean),
  };
}

// ─── 系统级 API ─────────────────────────────────────

/**
 * 检查所有 features 状态（返回诊断报告）
 */
export function diagnoseFeatures() {
  const all = listAllFeatures();
  const enabled = all.filter(f => f.enabled);
  const disabled = all.filter(f => !f.enabled);

  return {
    total: all.length,
    enabled: enabled.length,
    disabled: disabled.length,
    features: all,
    recommendations: _generateRecommendations(enabled),
  };
}

function _generateRecommendations(enabled) {
  const recs = [];

  if (!enabled.includes(f => f.name === 'TOOL_RW_SPLIT')) {
    recs.push({ flag: 'TOOL_RW_SPLIT', priority: 'P0', reason: '推荐开启，提升多工具并发场景性能' });
  }
  if (enabled.find(f => f.name === 'MCP_CLIENT') && !enabled.find(f => f.name === 'MCP_OAUTH')) {
    recs.push({ flag: 'MCP_OAUTH', priority: 'P1', reason: '开启 MCP_CLIENT 后推荐同时开启 OAuth' });
  }
  if (enabled.find(f => f.name === 'CONTEXT_COMPACT') && !enabled.find(f => f.name === 'REACTIVE_COMPACT')) {
    recs.push({ flag: 'REACTIVE_COMPACT', priority: 'P2', reason: '开启 CONTEXT_COMPACT 后推荐开启响应式压缩' });
  }

  return recs;
}

/**
 * 安全解析（用于配置文件）
 * 解析字符串值，返回布尔或原始值
 */
export function parseFeatureValue(raw) {
  if (raw === true || raw === 1 || raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === false || raw === 0 || raw === 'false' || raw === '0' || raw === 'no') return false;
  return raw; // 原样返回
}

// 导出默认对象（方便 tree-shaking）
export default {
  feature,
  setFeature,
  setFeatures,
  getFeatureInfo,
  listEnabledFeatures,
  listAllFeatures,
  listFeaturesByCategory,
  initFeatureFlags,
  diagnoseFeatures,
  parseFeatureValue,
  FEATURE_REGISTRY,
};
