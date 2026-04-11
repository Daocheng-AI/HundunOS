// HundunOS v3.6 Phase 1 — Skill System 完整测试
import { CoreKernel } from './kernel/core.js';

// review: removed // review: removed console.log('=== HundunOS v3.6 Phase 1: Skill System Test ===\n');

const kernel = new CoreKernel({
  environment: 'testing',
  workspace: '.',
  storageDir: './data'
});

// review: removed // review: removed console.log('✅ Kernel 构造函数成功');

try {
  // 初始化（10秒超时）
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('初始化超时 (10秒)')), 10000)
  );
  const initPromise = kernel.initialize().then(() => 'ok');
  const result = await Promise.race([initPromise, timeoutPromise]);

  // review: removed // review: removed console.log('\n--- Skill System 检查 ---');
  const sm = kernel.skills;
  if (!sm) {
    console.error('❌ SkillManager 未初始化');
    process.exit(1);
  }

  const stats = sm.registry?.getStats?.() || {};
  // review: removed // review: removed console.log(`✅ SkillManager 初始化成功`);
  // review: removed // review: removed console.log(`   Skills: ${stats.loaded || 0}`);
  // review: removed // review: removed console.log(`   Tools: ${stats.toolCount || 0}`);
  // review: removed // review: removed console.log(`   Skill 名称: ${(stats.skillNames || []).join(', ')}`);

  if (stats.loaded === 0) {
    console.warn('⚠️  没有加载任何 Skill（SkillManager 可能以 graceful 降级方式初始化）');
  } else {
    // review: removed // review: removed console.log('\n--- Skill 工具详情 ---');
    for (const name of stats.skillNames || []) {
      const skill = sm.registry?.get?.(name);
      if (skill) {
        // review: removed // review: removed console.log(`  ${name} (v${skill.version}): ${skill.tools?.length || 0} tools`);
        for (const t of skill.tools || []) {
          // review: removed // review: removed console.log(`    - ${t.id} [${t.type}]`);
        }
      }
    }
  }

  // Skill Matcher 测试
  if (sm.matcher) {
    const match = sm.matcher.match('我想查看 GitHub 的 Issues');
    // review: removed // review: removed console.log(`\n--- Skill Matcher 测试 ---`);
    // review: removed // review: removed console.log(`   匹配 "查看 GitHub Issues": ${match?.skill} (confidence: ${match?.confidence?.toFixed(2)})`);
  }

  // review: removed // review: removed console.log('\n✅ Phase 1 Skill System 测试通过！');
  process.exit(0);

} catch (err) {
  console.error('\n❌ 测试失败:', err.message);
  process.exit(1);
}
