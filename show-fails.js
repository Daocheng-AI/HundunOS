import { readFileSync } from 'fs';
const r = JSON.parse(readFileSync('./test-results/results.json', 'utf8'));
const fails = r.testResults.filter(t => t.status === 'failed');
console.log('===== FAILED TEST SUITES =====');
fails.forEach(f => {
  const shortPath = (f.name || '').replace(/.*hundunos[/\\]/, '');
  console.log('\nFILE:', shortPath);
  // Find failed assertions
  (f.assertionResults || []).filter(a => a.status === 'failed').forEach(a => {
    const msg = (a.failureMessages[0] || '').split('\n')[0].slice(0, 120);
    console.log('  FAIL:', a.fullName.slice(0, 80));
    console.log('  MSG :', msg);
  });
  // Suite-level error
  if (f.message) {
    console.log('  SUITE ERROR:', f.message.slice(0, 120));
  }
});
console.log('\n===== SUMMARY =====');
console.log('Total:', r.numTotalTests, '| Passed:', r.numPassedTests, '| Failed:', r.numFailedTests);
