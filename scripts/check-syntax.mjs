// syntax-check.mjs — 批量语法检查
import { execSync } from 'node:child_process';

const files = [
    'kernel/skills/skill-registry.js',
    'kernel/skills/skill-runner.js',
    'kernel/skills/skill-context-injector.js',
    'scripts/ts-cli.js',
    '__tests__/task-scientist.test.js',
    '__tests__/task-scientist-adapter.test.js',
];

let allOk = true;
for (const file of files) {
    try {
        execSync(`node --check ${file}`, { encoding: 'utf-8' });
        // console.log(`✅ ${file}`);
    } catch (e) {
        console.error(`❌ ${file}: ${e.message.split('\n').slice(0,2).join(' ')}`);
        allOk = false;
    }
}

// console.log(allOk ? '\n🎉 All syntax checks passed!' : '\n⚠️  Some files have errors');
process.exit(allOk ? 0 : 1);
