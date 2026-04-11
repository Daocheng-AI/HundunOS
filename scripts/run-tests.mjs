// run-tests.mjs — Run TaskScientist tests and save output
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const testFiles = [
    '__tests__/task-scientist.test.js',
    '__tests__/task-scientist-adapter.test.js',
];

let allPassed = true;

for (const file of testFiles) {
    // review: removed // review: removed console.log(`\n📋 Running: ${file}`);
    try {
        const out = execSync(`node --test ${file}`, { encoding: 'utf-8', cwd: 'C:/Users/Lin/.qclaw/workspace/hundunos' });
        // review: removed // review: removed console.log(out);
    } catch (e) {
        console.error(e.stdout || e.message);
        allPassed = false;
    }
}

writeFileSync('C:/Users/Lin/.qclaw/workspace/hundunos/scripts/test-output.txt',
    allPassed ? 'PASS\n' : 'FAIL\n');
// review: removed // review: removed console.log(allPassed ? '\n🎉 All tests passed!' : '\n⚠️  Some tests failed');
process.exit(allPassed ? 0 : 1);
