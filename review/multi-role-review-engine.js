/**
 * HundunOS v3.0 - 多角色评估引擎 v2
 * Multi-Role Review Engine v2
 *
 * 8 个专业角色视角持续迭代评审
 * 评分基准：有问题的文件占比（而非问题数量），避免大量问题导致全0分
 *
 * Usage: node review/multi-role-review-engine.js [--round N] [--fix]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join, relative, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_ROOT = process.env.HUNDUNOS_WS || __dirname;
const REPORT_DIR = join(PROJECT_ROOT, 'review', 'reports');

// ── CLI ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const opts = { maxRounds: 3, autoFix: false };
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--round') opts.maxRounds = parseInt(args[i+1]) || 3, i++;
    else if (args[i] === '--fix') opts.autoFix = true;
}

// ── Scanner ──────────────────────────────────────────────────────────

const IGNORE = ['node_modules', '.git', 'dist', '__pycache__', '.bin', 'vendor',
    'tests/data', 'shell/client/node_modules', 'logs', 'snapshots', 'data/snapshots', '.hundunos',
    'review/reports'];
const RE_EXT = /\.(js|mjs|ts|json|md|yaml|yml)$/;

function* walk(root, base = root) {
    for (const e of readdirSync(root, { withFileTypes: true })) {
        const fp = join(root, e.name);
        const rp = relative(base, fp).replace(/\\/g, '/'); // normalize to forward slashes for cross-platform
        if (e.isDirectory()) { if (!IGNORE.some(p => rp.includes(p))) yield* walk(fp, base); }
        else if (RE_EXT.test(e.name)) yield { path: fp, rel: rp };
    }
}

function rfile(f) { try { return readFileSync(f.path, 'utf8'); } catch { return null; } }

// ── Severity / Category ──────────────────────────────────────────────

const SEV = { CRIT: '🔴CRIT', HIGH: '🟠HIGH', MED: '🟡MED', LOW: '🟢LOW', INFO: '⚪INFO' };
const CAT = {
    SYNTAX:'syntax', SECURITY:'security', PERFORMANCE:'performance',
    ARCHITECTURE:'architecture', CODE_QUALITY:'codeQuality',
    RELIABILITY:'reliability', TESTABILITY:'testability',
    DOCUMENTATION:'documentation', DEPENDENCY:'dependency', CONFIG:'config'
};

const ROLES = [
    { id:'architect',    name:'系统架构师', nameEn:'Architect',         w:1.0 },
    { id:'security',     name:'安全专家',   nameEn:'Security Expert',   w:1.0 },
    { id:'codeAuditor',  name:'代码审计员', nameEn:'Code Auditor',      w:1.0 },
    { id:'perfEngineer',name:'性能工程师', nameEn:'Performance Eng.',   w:1.0 },
    { id:'productMgr',   name:'产品经理',   nameEn:'Product Manager',  w:0.8 },
    { id:'testEngineer',name:'测试工程师', nameEn:'Test Engineer',      w:0.9 },
    { id:'uxReviewer',  name:'UX评审',     nameEn:'UX Reviewer',      w:0.7 },
    { id:'economist',   name:'经济学家',   nameEn:'Economist',         w:0.6 }
];

// ── Base Analyzer ────────────────────────────────────────────────────

class Analyzer {
    constructor(role, files) { this.role = role; this.files = files; this.issues = []; }
    analyze() { return []; }
    // 评分：有问题的文件比例（最多扣50分）+ 严重问题加权额外扣分
    score() {
        if (this.issues.length === 0) return 100;
        const bad = new Set(this.issues.map(i => i.file)).size;
        const ratio = bad / Math.max(this.files.length, 1);
        const base = Math.round(Math.min(45, ratio * 100));
        const severities = [SEV.CRIT, SEV.HIGH, SEV.MED, SEV.LOW, SEV.INFO];
        const w = [8, 5, 2.5, 1, 0.3];
        let extra = 0;
        for (let i = 0; i < severities.length; i++) {
            const cnt = this.issues.filter(i => i.severity === severities[i]).length;
            extra += Math.min(w[i], Math.ceil(Math.log2(cnt + 1) * w[i] * 0.4));
        }
        return Math.max(0, 100 - base - extra);
    }
}

// ── Architect ────────────────────────────────────────────────────────

class ArchitectAnalyzer extends Analyzer {
    analyze() {
        const issues = [];
        const kf = this.files.filter(f => f.rel.startsWith('kernel/'));
        if (kf.length > 60) issues.push({ sev: SEV.HIGH, cat: CAT.ARCHITECTURE, file:'kernel/', line:0,
            msg:`内核模块过多（${kf.length} 文件）`, sug:'按功能领域进一步拆分', fixable:true });

        for (const f of this.files) {
            const c = rfile(f);
            if (!c) continue;
            const ln = c.split('\n').length;
            if (ln > 2000) issues.push({ sev: ln>5000?SEV.CRIT:ln>3000?SEV.HIGH:SEV.MED, cat:CAT.ARCHITECTURE,
                file:f.rel, line:0, msg:`文件过大（${ln} 行）`, sug:`建议拆分 ${Math.ceil(ln/500)} 个子模块`, fixable:false });
            else if (ln > 1000) issues.push({ sev:SEV.MED, cat:CAT.ARCHITECTURE, file:f.rel, line:0,
                msg:`文件较大（${ln} 行）`, sug:'超过1000行评估拆分可行性', fixable:false });
        }
        const mixinFiles = this.files.filter(f => f.rel.includes('mixins/'));
        if (mixinFiles.length === 0) issues.push({ sev:SEV.INFO, cat:CAT.ARCHITECTURE, file:'kernel/mixins/', line:0,
            msg:'未发现 Mixin 模式', sug:'考虑使用 Mixin 提升可组合性', fixable:false });
        return issues;
    }
}

// ── Security ─────────────────────────────────────────────────────────

class SecurityAnalyzer extends Analyzer {
    analyze() {
        const issues = [];
        for (const f of this.files) {
            const c = rfile(f);
            if (!c) continue;
            const isTest = f.rel.includes('__tests__') || f.rel.includes('tests/') ||
                           f.rel.includes('test-') || f.rel.includes('.test.');
            const isRule = f.rel.includes('hooks/security') || f.rel.includes('hooks/audit') ||
                           f.rel.includes('security.yaml') || f.rel.includes('security.md');

            if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(c)) {
                // 测试文件中的 eval 测试用例排除
                if (!isTest) issues.push({ sev:SEV.CRIT, cat:CAT.SECURITY, file:f.rel, line:0,
                    msg:'发现eval/动态代码执行', sug:'避免eval，使用安全模板或沙箱', fixable:false });
            }
            if (/\bexec\s*\(|\bexecSync\s*\(/.test(c)) {
                // scripts 和 kernel 中的合法 exec 降低为 MED（合法工具调用）
                const sev = (f.rel.includes('scripts/') || f.rel.includes('kernel/')) ? SEV.MED : SEV.HIGH;
                issues.push({ sev, cat:CAT.SECURITY, file:f.rel, line:0, msg:'发现shell执行调用',
                    sug:'使用execFile或严格参数校验', fixable:false });
            }
            if (/sk-[a-zA-Z0-9]{20,}/.test(c) && !isTest && !isRule)
                issues.push({ sev:SEV.CRIT, cat:CAT.SECURITY, file:f.rel, line:0, msg:'发现疑似API密钥',
                    sug:'使用环境变量代替硬编码密钥', fixable:false });
            // 排除误报：PASSWORD: 'password' 是字典常量定义，value 等于 key 本身就不是真实密钥
            // 真实密钥通常 >= 12 字符；占位符通常 < 15 字符
            if (/\b(password|secret|token)\s*:\s*(['"])[^'"]{12,}\2/i.test(c) && !isTest && !isRule &&
                !/\bPASSWORD\s*:\s*['"]password['"]/.test(c))
                issues.push({ sev:SEV.CRIT, cat:CAT.SECURITY, file:f.rel, line:0, msg:'发现硬编码密钥或令牌',
                    sug:'使用环境变量或密钥管理服务', fixable:false });
            if (/Access-Control-Allow-Origin\s*:\s*['"]?\*['"]?/.test(c))
                issues.push({ sev:SEV.HIGH, cat:CAT.SECURITY, file:f.rel, line:0, msg:'CORS允许所有来源',
                    sug:'设置明确的域名白名单', fixable:true });
            if (/\bconsole\.(log|debug)\s*\(.*(?:token|password|secret|key)/gi.test(c))
                issues.push({ sev:SEV.HIGH, cat:CAT.SECURITY, file:f.rel, line:0, msg:'控制台可能输出敏感信息',
                    sug:'生产环境禁用敏感日志', fixable:true });
            if (f.rel.includes('rest') && !c.includes('rateLimit') && !c.includes('RateLimiter'))
                issues.push({ sev:SEV.MED, cat:CAT.SECURITY, file:f.rel, line:0, msg:'REST API缺少速率限制',
                    sug:'集成RateLimiter保护API', fixable:true });
        }
        return issues;
    }
}

// ── Code Auditor ────────────────────────────────────────────────────

class CodeAuditorAnalyzer extends Analyzer {
    analyze() {
        const issues = [];
        for (const f of this.files) {
            const c = rfile(f);
            if (!c) continue;
            if (/\bconsole\.(log|debug|info)\s*\(/g.test(c) && !f.rel.includes('__tests__') && !f.rel.includes('tests/'))
                issues.push({ sev:SEV.LOW, cat:CAT.CODE_QUALITY, file:f.rel, line:0,
                    msg:`残留${c.match(/\bconsole\.(log|debug|info)\s*\(/g).length}处console调用`, sug:'使用结构化日志', fixable:true });
            if (/\/\/\s*(TODO|FIXME|HACK|XXX|BUG)/gi.test(c))
                issues.push({ sev:SEV.LOW, cat:CAT.DOCUMENTATION, file:f.rel, line:0,
                    msg:'发现TODO/FIXME注释', sug:'将TODO录入issue tracker', fixable:true });
            const nested = (c.match(/\n {10,}/g) || []).length;
            if (nested > 5) issues.push({ sev:SEV.MED, cat:CAT.CODE_QUALITY, file:f.rel, line:0,
                msg:`深层嵌套${nested}处（缩进>=10）`, sug:'重构为早期返回或提取函数', fixable:false });
            const magic = [...new Set(c.match(/(?<![.\w])\b\d{3,}\b(?!\s*[.%\d])/g) || [])];
            if (magic.length > 3) issues.push({ sev:SEV.LOW, cat:CAT.CODE_QUALITY, file:f.rel, line:0,
                msg:`发现${magic.length}个魔法数字`, sug:'提取为命名常量', fixable:true });
        }
        return issues;
    }
}

// ── Performance ────────────────────────────────────────────────────

class PerfEngineerAnalyzer extends Analyzer {
    analyze() {
        const issues = [];
        for (const f of this.files) {
            const c = rfile(f);
            if (!c) continue;
            if (/\bwriteFileSync\b|\breadFileSync\b/.test(c) && f.rel.includes('kernel/'))
                issues.push({ sev:SEV.HIGH, cat:CAT.PERFORMANCE, file:f.rel, line:0,
                    msg:'热路径使用同步I/O', sug:'使用fs.promises异步API', fixable:true });
            if (/\bJSON\.parse\s*\(.*(?:readFile)/i.test(c))
                issues.push({ sev:SEV.MED, cat:CAT.PERFORMANCE, file:f.rel, line:0,
                    msg:'JSON.parse解析可能的大文件', sug:'考虑流式JSON解析器', fixable:false });
            const inlineRe = (c.match(/\b(?:match|replace|split|test)\s*\(\s*\/[^\/]+\//g) || []).length;
            if (inlineRe > 5) issues.push({ sev:SEV.LOW, cat:CAT.PERFORMANCE, file:f.rel, line:0,
                msg:`${inlineRe}处内联正则未预编译`, sug:'预编译为模块级常量', fixable:true });
        }
        return issues;
    }
}

// ── Product Manager ────────────────────────────────────────────────

class ProductMgrAnalyzer extends Analyzer {
    analyze() {
        const issues = [];
        if (!existsSync(join(PROJECT_ROOT, 'README.md')))
            issues.push({ sev:SEV.HIGH, cat:CAT.DOCUMENTATION, file:'README.md', line:0,
                msg:'缺少README.md', sug:'创建包含项目介绍和快速开始的README', fixable:true });
        if (!existsSync(join(PROJECT_ROOT, 'CHANGELOG.md')))
            issues.push({ sev:SEV.MED, cat:CAT.DOCUMENTATION, file:'CHANGELOG.md', line:0,
                msg:'缺少CHANGELOG.md', sug:'按Keep a Changelog规范维护', fixable:true });
        return issues;
    }
}

// ── Test Engineer ──────────────────────────────────────────────────

class TestEngineerAnalyzer extends Analyzer {
    analyze() {
        const issues = [];
        const srcFiles = this.files.filter(f => /\.(js|mjs)$/.test(f.rel) && !f.rel.includes('tests/') && !f.rel.includes('__tests__') && !f.rel.includes('node_modules') && !f.rel.includes('shell/client/'));
        const testFiles = this.files.filter(f => f.rel.includes('__tests__') || f.rel.includes('tests/') || /\.test\.(js|ts)$/.test(f.rel));
        if (srcFiles.length > 0) {
            const cov = (testFiles.length / srcFiles.length);
            if (cov < 0.1)
                issues.push({ sev:SEV.HIGH, cat:CAT.TESTABILITY, file:'tests/', line:0,
                    msg:`测试覆盖率极低（${testFiles.length}/${srcFiles.length}）`, sug:'核心模块需80%+覆盖', fixable:false });
            else if (cov < 0.3)
                issues.push({ sev:SEV.MED, cat:CAT.TESTABILITY, file:'tests/', line:0,
                    msg:`测试覆盖率偏低（${(cov*100).toFixed(1)}%）`, sug:'补充核心模块测试', fixable:false });
        }
        const pkgFiles = this.files.filter(f => basename(f.path) === 'package.json');
        let hasTestFramework = false;
        for (const pf of pkgFiles) {
            try { const pkg = JSON.parse(rfile(pf)); if (pkg.devDependencies && Object.keys(pkg.devDependencies).some(k => ['jest','mocha','vitest'].includes(k))) hasTestFramework = true; } catch {}
        }
        if (!hasTestFramework && srcFiles.length > 5)
            issues.push({ sev:SEV.MED, cat:CAT.TESTABILITY, file:'package.json', line:0,
                msg:'未发现测试框架依赖', sug:'安装jest/mocha/vitest之一', fixable:true });
        return issues;
    }
}

// ── UX Reviewer ────────────────────────────────────────────────────

class UXReviewerAnalyzer extends Analyzer {
    analyze() {
        const issues = [];
        for (const f of this.files) {
            const c = rfile(f);
            if (!c) continue;
            const emptyCatch = (c.match(/catch\s*\([^)]*\)\s*\{\s*\}/g) || []).length;
            if (emptyCatch > 0) issues.push({ sev:SEV.LOW, cat:CAT.CODE_QUALITY, file:f.rel, line:0,
                msg:`${emptyCatch}个空catch块静默吞异常`, sug:'提供有意义的错误处理', fixable:true });
        }
        return issues;
    }
}

// ── Economist ──────────────────────────────────────────────────────

class EconomistAnalyzer extends Analyzer {
    analyze() {
        const issues = [];
        const pkgFiles = this.files.filter(f => basename(f.path) === 'package.json');
        for (const pf of pkgFiles) {
            try {
                const pkg = JSON.parse(rfile(pf));
                const deps = { ...pkg.dependencies, ...pkg.devDependencies };
                for (const [name, ver] of Object.entries(deps)) {
                    if (!ver.startsWith('^') && !ver.startsWith('~') && ver !== '*' && ver !== 'latest') continue;
                    if (ver.startsWith('*')) issues.push({ sev:SEV.MED, cat:CAT.DEPENDENCY, file:pf.rel, line:0,
                        msg:`依赖${name}使用通配符版本${ver}`, sug:'使用精确版本保证构建可复现', fixable:true });
                }
            } catch {}
        }
        return issues;
    }
}

// ── Analyzer Registry ──────────────────────────────────────────────

const ANALYZERS = {
    architect:    ArchitectAnalyzer,
    security:     SecurityAnalyzer,
    codeAuditor:  CodeAuditorAnalyzer,
    perfEngineer: PerfEngineerAnalyzer,
    productMgr:   ProductMgrAnalyzer,
    testEngineer: TestEngineerAnalyzer,
    uxReviewer:   UXReviewerAnalyzer,
    economist:    EconomistAnalyzer
};

// ── Deduplicate ────────────────────────────────────────────────────

function dedup(issues) {
    const seen = new Set();
    return issues.filter(iss => {
        const key = `${iss.file}:${iss.cat}:${iss.msg.substring(0,50)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function sortIssues(issues) {
    const order = [SEV.CRIT, SEV.HIGH, SEV.MED, SEV.LOW, SEV.INFO];
    return [...issues].sort((a, b) => (order.indexOf(a.sev) - order.indexOf(b.sev)));
}

// ── Auto-fix ───────────────────────────────────────────────────────

async function fixIssues(issues, root) {
    let fixed = 0, failed = 0;
    for (const iss of issues.filter(i => i.fixable)) {
        try {
            const fp = join(root, iss.file);
            if (!existsSync(fp)) continue;
            let c = readFileSync(fp, 'utf8');
            let newC = c;
            if (iss.msg.includes('console')) {
                newC = c.replace(/\bconsole\.(log|debug|info)\s*\([^)]*\)\s*;?\n?/g, '// $&');
            } else if (iss.msg.includes('TODO') || iss.msg.includes('FIXME')) {
                newC = c.replace(/\/\/\s*(TODO|FIXME|HACK|XXX|BUG):?\s*.*/gi, '// $1: tracked');
            } else if (iss.msg.includes('CORS')) {
                newC = c.replace(/Access-Control-Allow-Origin\s*:\s*['"]?\*['"]?/g,
                    "Access-Control-Allow-Origin: process.env.ALLOWED_ORIGIN || 'localhost'");
            }
            if (newC !== c) { writeFileSync(fp, newC, 'utf8'); fixed++; }
        } catch { failed++; }
    }
    return { fixed, failed };
}

// ── Report ─────────────────────────────────────────────────────────

function genReport(round, results, allIssues) {
    let md = `# HundunOS 多角色评审报告 · 第${round}轮\n\n`;
    md += `**时间**: ${new Date().toLocaleString('zh-CN')}  **项目**: ${PROJECT_ROOT}\n\n`;
    md += `## 📊 各角色评分\n\n`;
    md += `| 角色 | 评分 | 问题数 |\n|------|------|--------|\n`;
    for (const r of results) {
        const badge = r.score>=90?'✅':r.score>=70?'🟡':r.score>=50?'🟠':'🔴';
        md += `| ${r.role.name}（${r.role.nameEn}） | ${badge} **${r.score}** | ${r.issues.length} |\n`;
    }
    const avg = Math.round(results.reduce((s, r) => s+r.score, 0) / results.length);
    md += `\n**综合评分**: ${avg >= 90 ? '✅' : avg >= 70 ? '🟡' : avg >= 50 ? '🟠' : '🔴'} **${avg}/100**\n\n`;

    const crits = allIssues.filter(i => i.sev === SEV.CRIT);
    const highs = allIssues.filter(i => i.sev === SEV.HIGH);
    md += `## 🐛 问题清单（共${allIssues.length}个）\n\n`;
    md += `> 🔴CRIT:${crits.length} | 🟠HIGH:${highs.length} | 🟡MED:${allIssues.filter(i=>i.sev===SEV.MED).length} | 🟢LOW:${allIssues.filter(i=>i.sev===SEV.LOW).length} | ⚪INFO:${allIssues.filter(i=>i.sev===SEV.INFO).length}\n\n`;

    if (crits.length > 0) {
        md += `### 🔴 严重问题\n\n`;
        md += `| 文件 | 类别 | 问题 |\n|------|------|------|\n`;
        for (const iss of crits.slice(0,20)) md += `| \`${iss.file}\` | ${iss.cat} | ${iss.msg} |\n`;
    }
    if (highs.length > 0) {
        md += `\n### 🟠 高优先级\n\n`;
        md += `| 文件 | 类别 | 问题 |\n|------|------|------|\n`;
        for (const iss of highs.slice(0,20)) md += `| \`${iss.file}\` | ${iss.cat} | ${iss.msg} |\n`;
    }

    const fixable = allIssues.filter(i => i.fixable);
    md += `\n## 🔧 可修复问题（${fixable.length}个）\n\n`;
    if (fixable.length > 0) {
        for (const iss of fixable.slice(0,15))
            md += `- \`${iss.file}\` → ${iss.sug}\n`;
    }

    return md;
}

// ── Main Engine ────────────────────────────────────────────────────

async function scan() {
    // console.log(`\n📁 扫描 ${PROJECT_ROOT}...`);
    const files = [...walk(PROJECT_ROOT)];
    // console.log(`📄 找到 ${files.length} 个可审查文件`);
    return files;
}

async function runRound(files, round) {
    // console.log(`\n${'═'.repeat(56)}`);
    // console.log(`🔍 第 ${round} 轮评审`);
    // console.log('═'.repeat(56));

    const results = [];
    let allIssues = [];

    for (const role of ROLES) {
        const Cls = ANALYZERS[role.id];
        if (!Cls) continue;
        const inst = new Cls(role, files);
        const issues = dedup(inst.analyze());
        inst.issues = issues;
        const score = inst.score();
        results.push({ role, issues, score });
        allIssues = allIssues.concat(issues);

        const icon = score >= 90 ? '✅' : score >= 70 ? '🟡' : score >= 50 ? '🟠' : '🔴';
        // console.log(`  ${icon} [${role.name}] ${score}/100 — ${issues.length}个问题`);
    }

    allIssues = sortIssues(dedup(allIssues));

    const critHigh = allIssues.filter(i => i.sev === SEV.CRIT || i.sev === SEV.HIGH).length;
    const avg = Math.round(results.reduce((s, r) => s+r.score, 0) / results.length);
    // console.log(`\n  📋 共${allIssues.length}个问题（🔴CRIT:${allIssues.filter(i=>i.sev===SEV.CRIT).length} | 🟠HIGH:${allIssues.filter(i=>i.sev===SEV.HIGH).length}）综合: ${avg}/100`);

    mkdirSync(REPORT_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
    const mdPath = join(REPORT_DIR, `round${round}_${ts}.md`);
    writeFileSync(mdPath, genReport(round, results, allIssues), 'utf8');
    // console.log(`  📝 报告: ${mdPath}`);

    if (opts.autoFix && allIssues.some(i => i.fixable)) {
        const { fixed, failed } = await fixIssues(allIssues, PROJECT_ROOT);
        // console.log(`  🔧 修复: ✅${fixed} ❌${failed}`);
    }

    return { results, allIssues, avg };
}

async function main() {
    // console.log(`\n🚀 HundunOS 多角色评审引擎 v2`);
    // console.log(`   项目: ${PROJECT_ROOT}`);
    // console.log(`   最大轮次: ${opts.maxRounds}`);
    // console.log(`   自动修复: ${opts.autoFix ? '开启' : '关闭'}`);

    let files = await scan();
    let history = [];

    for (let r = 1; r <= opts.maxRounds; r++) {
        const { results, allIssues, avg } = await runRound(files, r);
        history.push({ round:r, results, allIssues, avg });

        if (r < opts.maxRounds) {
            const prev = history[history.length - 2];
            const prevAvg = prev ? prev.avg : 100;
            const delta = Math.abs(avg - prevAvg);
            if (delta > 2 && avg < 90) {
                // console.log(`\n⏭️ 第${r}轮评分${avg}（较上轮Δ${delta.toFixed(1)}），重新扫描...`);
                files = await scan();
            } else {
                // console.log(`\n✅ 评分收敛（Δ${delta.toFixed(1)}），评审完成`);
                break;
            }
        }
    }

    // Final summary
    const final = history[history.length - 1];
    // console.log(`\n${'═'.repeat(56)}`);
    // console.log(`📊 最终评审摘要`);
    // console.log('═'.repeat(56));
    for (const { role, score, issues } of final.results) {
        const badge = score>=90?'优秀':score>=70?'良好':score>=50?'待改进':'严重';
        // console.log(`  ${score>=90?'✅':score>=70?'🟡':score>=50?'🟠':'🔴'} ${role.name}: ${score}/100 ${badge} — ${issues.length}问题`);
    }
    // console.log(`\n  综合评分: ${final.avg >= 90 ? '✅' : final.avg >= 70 ? '🟡' : final.avg >= 50 ? '🟠' : '🔴'} ${final.avg}/100`);
    const bySev = [SEV.CRIT, SEV.HIGH, SEV.MED, SEV.LOW, SEV.INFO].map(s => final.allIssues.filter(i=>i.sev===s).length);
    // console.log(`  问题分布: 🔴${bySev[0]} 🟠${bySev[1]} 🟡${bySev[2]} 🟢${bySev[3]} ⚪${bySev[4]}`);
    // console.log(`  报告目录: ${REPORT_DIR}`);
}

main().catch(e => { console.error('❌ 错误:', e.message); process.exit(1); });
