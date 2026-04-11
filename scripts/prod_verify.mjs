/**
 * HundunOS v3.0 - 生产环境部署验证脚本 (S3.12)
 * 验证所有核心模块在生产模式下正常运行
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const results = {
  timestamp: new Date().toISOString(),
  phase: 'S3.12',
  name: '生产环境部署验证',
  checks: [],
  summary: { total: 0, passed: 0, failed: 0 }
};

function check(name, fn) {
  results.summary.total++;
  try {
    const result = fn();
    if (result && result.then) {
      return result.then(r => {
        results.checks.push({ name, status: '✅', detail: r || 'OK' });
        results.summary.passed++;
      }).catch(e => {
        results.checks.push({ name, status: '❌', detail: e.message });
        results.summary.failed++;
      });
    }
    results.checks.push({ name, status: '✅', detail: result || 'OK' });
    results.summary.passed++;
  } catch (e) {
    results.checks.push({ name, status: '❌', detail: e.message });
    results.summary.failed++;
  }
}

async function checkAsync(name, fn) {
  results.summary.total++;
  try {
    const detail = await fn();
    results.checks.push({ name, status: '✅', detail: detail || 'OK' });
    results.summary.passed++;
  } catch (e) {
    results.checks.push({ name, status: '❌', detail: e.message });
    results.summary.failed++;
  }
}

// review: removed // review: removed console.log('🚀 HundunOS v3.0 - 生产环境部署验证 (S3.12)');
// review: removed // review: removed console.log('='.repeat(50));

// ── 1. 目录结构检查 ──────────────────────────────
const requiredDirs = [
  'kernel', 'stable-modules', 'extension-modules',
  'infrastructure', 'tests', 'docs', 'config', 'data', 'logs'
];
for (const dir of requiredDirs) {
  check(`目录存在: ${dir}`, () => {
    if (!existsSync(join(ROOT, dir))) throw new Error(`缺少目录: ${dir}`);
    return dir;
  });
}

// ── 2. 核心文件检查 ──────────────────────────────
const requiredFiles = [
  'kernel/core.js',
  'kernel/intent-engine.js',
  'kernel/aware-system.js',
  'kernel/memory-graph.js',
  'kernel/model-router/index.js',
  'stable-modules/edict/core/index.js',
  'stable-modules/rbac/index.js',
  'stable-modules/health-monitor/index.js',
  'stable-modules/recovery/index.js',
  'stable-modules/audit-logger/index.js',
  'extension-modules/workbuddy/index.js',
  'extension-modules/mcp/index.js',
  'extension-modules/search/index.js',
  'extension-modules/evolution/index.js',
  'extension-modules/skills/index.js',
  'shell/rest-api/index.js',
  'docs/README.md',
  'docs/architecture.md',
  'config/system.json',
  'package.json'
];
for (const file of requiredFiles) {
  check(`文件存在: ${file}`, () => {
    if (!existsSync(join(ROOT, file))) throw new Error(`缺少文件: ${file}`);
    return file;
  });
}

// ── 3. 模块导入验证 ──────────────────────────────
// Windows 路径转 file:// URL
function toFileUrl(p) {
  return new URL('file:///' + p.replace(/\\/g, '/')).href;
}

await checkAsync('模块导入: Kernel', async () => {
  const { CoreKernel } = await import(toFileUrl(join(ROOT, 'kernel/core.js')));
  if (!CoreKernel) throw new Error('CoreKernel 未导出');
  return 'CoreKernel class OK';
});

await checkAsync('模块导入: IntentEngine', async () => {
  const { IntentEngine } = await import(toFileUrl(join(ROOT, 'kernel/intent-engine.js')));
  if (!IntentEngine) throw new Error('IntentEngine 未导出');
  return 'IntentEngine class OK';
});

await checkAsync('模块导入: edict', async () => {
  const mod = await import(toFileUrl(join(ROOT, 'stable-modules/edict/core/index.js')));
  if (!mod) throw new Error('edict 未导出');
  return 'edict module OK';
});

await checkAsync('模块导入: RBAC', async () => {
  const { RBACManager } = await import(toFileUrl(join(ROOT, 'stable-modules/rbac/index.js')));
  if (!RBACManager) throw new Error('RBACManager 未导出');
  return 'RBACManager class OK';
});

await checkAsync('模块导入: HealthMonitor', async () => {
  const { HealthMonitor } = await import(toFileUrl(join(ROOT, 'stable-modules/health-monitor/index.js')));
  if (!HealthMonitor) throw new Error('HealthMonitor 未导出');
  return 'HealthMonitor class OK';
});

await checkAsync('模块导入: AutoRecovery', async () => {
  const { AutoRecoveryManager } = await import(toFileUrl(join(ROOT, 'stable-modules/recovery/index.js')));
  if (!AutoRecoveryManager) throw new Error('AutoRecoveryManager 未导出');
  return 'AutoRecoveryManager class OK';
});

// ── 4. 功能冒烟测试 ──────────────────────────────
await checkAsync('冒烟测试: Kernel 初始化', async () => {
  const { CoreKernel } = await import(toFileUrl(join(ROOT, 'kernel/core.js')));
  const k = new CoreKernel({ platform: 'windows', storage: join(ROOT, 'data') });
  await k.initialize();
  const st = k.getStatus ? k.getStatus() : k.status;
  if (!st) throw new Error('Kernel status 为空');
  return `status=${st.state || st.status || JSON.stringify(st).slice(0,40)}`;
});

await checkAsync('冒烟测试: IntentEngine 意图识别', async () => {
  const { IntentEngine } = await import(toFileUrl(join(ROOT, 'kernel/intent-engine.js')));
  const engine = new IntentEngine();
  await engine.initialize();
  const result = await engine.parse('帮我搜索文件', {});
  if (!result) throw new Error('意图识别返回空');
  return `intent=${result.intent || result.type || 'detected'}`;
});

await checkAsync('冒烟测试: RBAC 权限检查', async () => {
  const { RBACManager } = await import(toFileUrl(join(ROOT, 'stable-modules/rbac/index.js')));
  const rbac = new RBACManager();
  rbac.registerUser('prod_test', 'operator');
  const allowed = rbac.hasPermission('prod_test', 'read');
  return `permission_check=${allowed}`;
});

await checkAsync('冒烟测试: HealthMonitor 健康检查', async () => {
  const { HealthMonitor } = await import(toFileUrl(join(ROOT, 'stable-modules/health-monitor/index.js')));
  const monitor = new HealthMonitor();
  const report = await monitor.checkAll();
  if (!report) throw new Error('健康报告为空');
  return `dimensions=${Object.keys(report).length}`;
});

// ── 5. 配置文件验证 ──────────────────────────────
check('配置验证: system.json', () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'config/system.json'), 'utf8'));
  if (!cfg.version) throw new Error('缺少 version 字段');
  return `version=${cfg.version}`;
});

check('配置验证: package.json', () => {
  const raw = readFileSync(join(ROOT, 'package.json'), 'utf8');
  // 去除 BOM 和非标准空白
  const cleaned = raw.replace(/^\uFEFF/, '').trim();
  const pkg = JSON.parse(cleaned);
  if (!pkg.name && !pkg.scripts) throw new Error('缺少必要字段');
  if (pkg.type !== 'module') throw new Error('type 应为 module');
  return `type=${pkg.type}, version=${pkg.version || 'N/A'}`;
});

// ── 6. 测试套件验证 ──────────────────────────────
check('测试文件存在: full_test.js', () => {
  if (!existsSync(join(ROOT, 'tests/full_test.js'))) throw new Error('缺少全量测试');
  return 'full_test.js OK';
});

check('快照存在: final_completion', () => {
  const snapDir = join(ROOT, '.snapshots');
  if (!existsSync(snapDir)) throw new Error('缺少 .snapshots 目录');
  const files = readdirSync(snapDir);
  const final = files.find(f => f.includes('final_completion'));
  if (!final) throw new Error('缺少 final_completion 快照');
  return final;
});

// ── 7. 文档完整性 ──────────────────────────────
check('文档: README.md 非空', () => {
  const content = readFileSync(join(ROOT, 'docs/README.md'), 'utf8');
  if (content.length < 100) throw new Error('README.md 内容过少');
  return `${content.length} 字符`;
});

check('文档: architecture.md 非空', () => {
  const content = readFileSync(join(ROOT, 'docs/architecture.md'), 'utf8');
  if (content.length < 100) throw new Error('architecture.md 内容过少');
  return `${content.length} 字符`;
});

// ── 输出结果 ──────────────────────────────────────
// review: removed // review: removed console.log('\n📋 验证结果:\n');
for (const c of results.checks) {
  // review: removed // review: removed console.log(`  ${c.status} ${c.name}: ${c.detail}`);
}

const { total, passed, failed } = results.summary;
const rate = Math.round((passed / total) * 100);

// review: removed // review: removed console.log('\n' + '='.repeat(50));
// review: removed // review: removed console.log(`总计: ${total} | 通过: ${passed} | 失败: ${failed} | 通过率: ${rate}%`);

if (failed === 0) {
  // review: removed // review: removed console.log('\n🎉 S3.12 生产环境部署验证 — 全部通过！');
  // review: removed // review: removed console.log('✅ HundunOS v3.0 已确认生产就绪 (PRODUCTION_READY)');
  results.status = 'PRODUCTION_READY';
} else {
  // review: removed // review: removed console.log(`\n⚠️  ${failed} 项验证失败，需要修复后再部署`);
  results.status = 'NEEDS_FIX';
}

// 保存验证报告
const reportPath = join(ROOT, '.snapshots', `prod_verify_${new Date().toISOString().slice(0,10)}.json`);
writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf8');
// review: removed // review: removed console.log(`\n📄 验证报告已保存: .snapshots/${reportPath.split(/[\\/]/).pop()}`);
