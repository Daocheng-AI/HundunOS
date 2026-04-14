import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

try {
  const r = execSync('node node_modules/vitest/vitest.mjs run', {
    stdio: 'pipe',
    timeout: 120000,
    encoding: 'utf8'
  });
  writeFileSync('test-results/run3.txt', r);
  console.log('SUCCESS: output written');
} catch(e) {
  const out = e.stdout || '';
  const err = e.stderr || '';
  writeFileSync('test-results/run3.txt', out + '\nSTDERR:\n' + err);
  console.log('FAIL count from summary lines:');
  const lines = (out + '\n' + err).split('\n');
  for (const l of lines) {
    if (/Test Files|passed|failed|pass:|fail:|PASS|FAIL/.test(l)) console.log(l.trim());
  }
}
