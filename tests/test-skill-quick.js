// HundunOS v3.6 Phase 1 — Skill System Quick Test
import { CoreKernel } from './kernel/core.js';
import { writeFileSync, appendFileSync } from 'fs';

const LOG = 'C:/Users/Lin/.qclaw/workspace/hundunos/test-out.txt';
const log = (msg) => appendFileSync(LOG, (new Date().toISOString().slice(11,19) + ' ' + msg) + '\n');

async function run() {
  // Clear log
  writeFileSync(LOG, '');
  log('=== Test Start ===');

  const kernel = new CoreKernel({
    environment: 'testing',
    workspace: '.',
    storageDir: './data'
  });

  log('Kernel created: v' + kernel.state?.version);

  try {
    await Promise.race([
      kernel.initialize(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 10000))
    ]);
    log('Init completed OK');
  } catch (err) {
    if (err.message === 'TIMEOUT') {
      log('Init TIMED OUT after 10s - checking partial state...');
    } else {
      log('Init FAILED: ' + err.message);
    }
  }

  const sm = kernel.skills;
  if (!sm) {
    log('RESULT: SkillManager NOT initialized');
    process.exit(1);
  }

  const stats = sm.registry?.getStats?.() || {};
  log('RESULT: SkillManager OK - Skills=' + (stats.loaded||0) + ' Tools=' + (stats.toolCount||0));
  log('Skill names: ' + ((stats.skillNames||[]).join(', ') || '(none)'));

  for (const name of stats.skillNames || []) {
    const s = sm.registry?.get?.(name);
    log('  ' + name + ': ' + (s?.tools?.length||0) + ' tools');
  }

  log('=== TEST PASSED ===');
  process.exit(0);
}

run().catch(e => {
  appendFileSync(LOG, 'FATAL: ' + e.message + '\n');
  process.exit(1);
});
