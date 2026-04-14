import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join, relative, basename, dirname } from 'path';

const PROJECT_ROOT = process.cwd();
const REPORT_DIR = join(PROJECT_ROOT, 'review', 'reports');
mkdirSync(REPORT_DIR, { recursive: true });

// 忽略的目录
const IGNORE = ['node_modules', '.git', 'dist', '__pycache__', '.bin', 'vendor',
    'tests/data', 'shell/client/node_modules', 'logs', 'snapshots', 'data/snapshots', '.hundunos',
    'review/reports'];
const RE_EXT = /\.(js|mjs|ts|json|md|yaml|yml)$/;

// 扫描文件
function walk(root, base = root) {
    const files = [];
    function _walk(current) {
        const entries = readdirSync(current, { withFileTypes: true });
        for (const e of entries) {
            const fp = join(current, e.name);
            const rp = relative(base, fp).replace(/\\/g, '/');
            if (e.isDirectory()) {
                if (!IGNORE.some(p => rp.includes(p))) {
                    _walk(fp);
                }
            } else if (RE_EXT.test(e.name)) {
                files.push({ path: fp, rel: rp });
            }
        }
    }
    _walk(root);
    return files;
}

// 读取文件
function rfile(f) {
    try {
        return readFileSync(f.path, 'utf8');
    } catch {
        return null;
    }
}

// 角色定义
const ROLES = [
    { id: 'architect', name: '系统架构师', nameEn: 'Architect', w: 1.0 },
    { id: 'security', name: '安全专家', nameEn: 'Security Expert', w: 1.0 },
    { id: 'codeAuditor', name: '代码审计员', nameEn: 'Code Auditor', w: 1.0 },
    { id: 'perfEngineer', name: '性能工程师', nameEn: 'Performance Eng.', w: 1.0 },
    { id: 'productMgr', name: '产品经理', nameEn: 'Product Manager', w: 0.8 },
    { id: 'testEngineer', name: '测试工程师', nameEn: 'Test Engineer', w: 0.9 },
    { id: 'uxReviewer', name: 'UX评审', nameEn: 'UX Reviewer', w: 0.7 },
    { id: 'economist', name: '经济学家', nameEn: 'Economist', w: 0.6 }
];

// 严重程度
const SEV = { CRIT: '🔴CRIT', HIGH: '🟠HIGH', MED: '🟡MED', LOW: '🟢LOW', INFO: '⚪INFO' };
const CAT = {
    SYNTAX: 'syntax', SECURITY: 'security', PERFORMANCE: 'performance',
    ARCHITECTURE: 'architecture', CODE_QUALITY: 'codeQuality',
    RELIABILITY: 'reliability', TESTABILITY: 'testability',
    DOCUMENTATION: 'documentation', DEPENDENCY: 'dependency', CONFIG: 'config'
};

// 基础分析器
class Analyzer {
    constructor(role, files) {
        this.role = role;
        this.files = files;
        this.issues = [];
    }
    analyze() { return []; }
    score() {
        if (this.issues.length === 0) return 100;
        const bad = new Set(this.issues.map(i => i.file)).size;
        const ratio = bad / Math.max(this.files.length, 1);
        const base = Math.round(Math.min(45, ratio * 100));
        const severities = [SEV.CRIT, SEV.HIGH, SEV.MED, SEV.LOW, SEV.INFO];
        const w = [8, 5, 2.5, 1, 0.3];
        let extra = 0;
        for (let i = 0; i < severities.length; i++) {
            const cnt = this.issues.filter(i => i.sev === severities[i]).length;
            extra += Math.min(w[i], Math.ceil(Math.log2(cnt + 1) * w[i] * 0.4));
        }
        return Math.max(0, 100 - base - extra);
    }
}

// 架构师分析器
class ArchitectAnalyzer extends Analyzer {
    analyze() {
        const issues = [];
        const kf = this.files.filter(f => f.rel.startsWith('kernel/'));
        if (kf.length > 60) issues.push({ sev: SEV.HIGH, cat: CAT.ARCHITECTURE, file: 'kernel/', line: 0,
            msg: `内核模块过多（${kf.length} 文件）`, sug: '按功能领域进一步拆分', fixable: true });

        for (const f of this.files) {
            const c = rfile(f);
            if (!c) continue;
            const ln = c.split('\n').length;
            if (ln > 2000) issues.push({ sev: ln > 5000 ? SEV.CRIT : ln > 3000 ? SEV.HIGH : SEV.MED, cat: CAT.ARCHITECTURE,
                file: f.rel, line: 0, msg: `文件过大（${ln} 行）`, sug: `建议拆分 ${Math.ceil(ln / 500)} 个子模块`, fixable: false });
            else if (ln > 1000) issues.push({ sev: SEV.MED, cat: CAT.ARCHITECTURE, file: f.rel, line: 0,
                msg: `文件较大（${ln} 行）`, sug: '超过1000行评估拆分可行性', fixable: false });
        }
        return issues;
    }
}

// 安全专家分析器
class SecurityAnalyzer extends Analyzer {
    analyze() {
        const issues = [];
        for (const f of this.files) {
            const c = rfile(f);
            if (!c) continue;
            const isTest = f.rel.includes('__tests__') || f.rel.includes('tests/') ||
                           f.rel.includes('test-') || f.rel.includes('.test.');

            if (eval && /\beval\s*\(|\bnew\s+Function\s*\(/.test(c)) {
                if (!isTest) issues.push({ sev: SEV.CRIT, cat: CAT.SECURITY, file: f.rel, line: 0,
                    msg: '发现eval/动态代码执行', sug: '避免eval，使用安全模板或沙箱', fixable: false });
            }
            if (/\bexec\s*\(|\bexecSync\s*\(/.test(c)) {
                const sev = (f.rel.includes('scripts/') || f.rel.includes('kernel/')) ? SEV.MED : SEV.HIGH;
                issues.push({ sev, cat: CAT.SECURITY, file: f.rel, line: 0, msg: '发现shell执行调用',
                    sug: '使用execFile或严格参数校验', fixable: false });
            }
            if (/sk-[a-zA-Z0-9]{20,}/.test(c) && !isTest)
                issues.push({ sev: SEV.CRIT, cat: CAT.SECURITY, file: f.rel, line: 0, msg: '发现疑似API密钥',
                    sug: '使用环境变量代替硬编码密钥', fixable: false });
            if (/\b(password|secret|token)\s*:\s*(['"])[^'"]{12,}\2/i.test(c) && !isTest &&
                !/\bPASSWORD\s*:\s*['"]password['"]/.test(c))
                issues.push({ sev: SEV.CRIT, cat: CAT.SECURITY, file: f.rel, line: 0, msg: '发现硬编码密钥或令牌',
                    sug: '使用环境变量或密钥管理服务', fixable: false });
        }
        return issues;
    }
}

// 代码审计员分析器
class CodeAuditorAnalyzer extends Analyzer {
    analyze() {
        const issues = [];
        for (const f of this.files) {
            const c = rfile(f);
            if (!c) continue;
            if (console && /\bconsole\.(log|debug|info)\s*\(/g.test(c) && !f.rel.includes('__tests__') && !f.rel.includes('tests/'))
                issues.push({ sev: SEV.LOW, cat: CAT.CODE_QUALITY, file: f.rel, line: 0,
                    msg: `残留${(c.match(/\bconsole\.(log|debug|info)\s*\(/g) || []).length}处console调用`, sug: '使用结构化日志', fixable: true });
            if (/\/\/\s*(TODO|FIXME|HACK|XXX|BUG)/gi.test(c))
                issues.push({ sev: SEV.LOW, cat: CAT.DOCUMENTATION, file: f.rel, line: 0,
                    msg: '发现TODO/FIXME注释', sug: '将TODO录入issue tracker', fixable: true });
        }
        return issues;
    }
}

// 性能工程师分析器
class PerfEngineerAnalyzer extends Analyzer {
    analyze() {
        const issues = [];
        for (const f of this.files) {
            const c = rfile(f);
            if (!c) continue;
            if (/\bwriteFileSync\b|\breadFileSync\b/.test(c) && f.rel.includes('kernel/'))
                issues.push({ sev: SEV.HIGH, cat: CAT.PERFORMANCE, file: f.rel, line: 0,
                    msg: '热路径使用同步I/O', sug: '使用fs.promises异步API', fixable: true });
        }
        return issues;
    }
}

// 产品经理分析器
class ProductMgrAnalyzer extends Analyzer {
    analyze() {
        const issues = [];
        if (!existsSync(join(PROJECT_ROOT, 'README.md')))
            issues.push({ sev: SEV.HIGH, cat: CAT.DOCUMENTATION, file: 'README.md', line: 0,
                msg: '缺少README.md', sug: '创建包含项目介绍和快速开始的README', fixable: true });
        if (!existsSync(join(PROJECT_ROOT, 'CHANGELOG.md')))
            issues.push({ sev: SEV.MED, cat: CAT.DOCUMENTATION, file: 'CHANGELOG.md', line: 0,
                msg: '缺少CHANGELOG.md', sug: '按Keep a Changelog规范维护', fixable: true });
        return issues;
    }
}

// 测试工程师分析器
class TestEngineerAnalyzer extends Analyzer {
    analyze() {
        const issues = [];
        const srcFiles = this.files.filter(f => /\.(js|mjs)$/.test(f.rel) && !f.rel.includes('tests/') && !f.rel.includes('__tests__') && !f.rel.includes('node_modules'));
        const testFiles = this.files.filter(f => f.rel.includes('__tests__') || f.rel.includes('tests/') || /\.test\.(js|ts)$/.test(f.rel));
        if (srcFiles.length > 0) {
            const cov = (testFiles.length / srcFiles.length);
            if (cov < 0.1)
                issues.push({ sev: SEV.HIGH, cat: CAT.TESTABILITY, file: 'tests/', line: 0,
                    msg: `测试覆盖率极低（${testFiles.length}/${srcFiles.length}）`, sug: '核心模块需80%+覆盖', fixable: false });
            else if (cov < 0.3)
                issues.push({ sev: SEV.MED, cat: CAT.TESTABILITY, file: 'tests/', line: 0,
                    msg: `测试覆盖率偏低（${(cov * 100).toFixed(1)}%）`, sug: '补充核心模块测试', fixable: false });
        }
        return issues;
    }
}

// UX评审分析器
class UXReviewerAnalyzer extends Analyzer {
    analyze() {
        const issues = [];
        for (const f of this.files) {
            const c = rfile(f);
            if (!c) continue;
            const emptyCatch = (c.match(/catch\s*\([^)]*\)\s*\{\s*\}/g) || []).length;
            if (emptyCatch > 0) issues.push({ sev: SEV.LOW, cat: CAT.CODE_QUALITY, file: f.rel, line: 0,
                msg: `${emptyCatch}个空catch块静默吞异常`, sug: '提供有意义的错误处理', fixable: true });
        }
        return issues;
    }
}

// 经济学家分析器
class EconomistAnalyzer extends Analyzer {
    analyze() {
        const issues = [];
        const pkgFiles = this.files.filter(f => basename(f.path) === 'package.json');
        for (const pf of pkgFiles) {
            try {
                const pkg = JSON.parse(rfile(pf));
                const deps = { ...pkg.dependencies, ...pkg.devDependencies };
                for (const [name, ver] of Object.entries(deps)) {
                    if (ver === '*') issues.push({ sev: SEV.MED, cat: CAT.DEPENDENCY, file: pf.rel, line: 0,
                        msg: `依赖${name}使用通配符版本${ver}`, sug: '使用精确版本保证构建可复现', fixable: true });
                }
            } catch {}
        }
        return issues;
    }
}

// 分析器注册表
const ANALYZERS = {
    architect: ArchitectAnalyzer,
    security: SecurityAnalyzer,
    codeAuditor: CodeAuditorAnalyzer,
    perfEngineer: PerfEngineerAnalyzer,
    productMgr: ProductMgrAnalyzer,
    testEngineer: TestEngineerAnalyzer,
    uxReviewer: UXReviewerAnalyzer,
    economist: EconomistAnalyzer
};

// 去重
function dedup(issues) {
    const seen = new Set();
    return issues.filter(iss => {
        const key = `${iss.file}:${iss.cat}:${iss.msg.substring(0, 50)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// 排序
function sortIssues(issues) {
    const order = [SEV.CRIT, SEV.HIGH, SEV.MED, SEV.LOW, SEV.INFO];
    return [...issues].sort((a, b) => (order.indexOf(a.sev) - order.indexOf(b.sev)));
}

// 自动修复
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
            }
            if (newC !== c) {
                writeFileSync(fp, newC, 'utf8');
                fixed++;
            }
        } catch {
            failed++;
        }
    }
    return { fixed, failed };
}

// 生成报告
function genReport(round, results, allIssues) {
    let md = `# HundunOS 多角色评审报告 · 第${round}轮\n\n`;
    md += `**时间**: ${new Date().toLocaleString('zh-CN')}  **项目**: ${PROJECT_ROOT}\n\n`;
    md += `## 📊 各角色评分\n\n`;
    md += `| 角色 | 评分 | 问题数 |\n|------|------|--------|\n`;
    for (const r of results) {
        const badge = r.score >= 90 ? '✅' : r.score >= 70 ? '🟡' : r.score >= 50 ? '🟠' : '🔴';
        md += `| ${r.role.name}（${r.role.nameEn}） | ${badge} **${r.score}** | ${r.issues.length} |\n`;
    }
    const avg = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
    md += `\n**综合评分**: ${avg >= 90 ? '✅' : avg >= 70 ? '🟡' : avg >= 50 ? '🟠' : '🔴'} **${avg}/100**\n\n`;

    const crits = allIssues.filter(i => i.sev === SEV.CRIT);
    const highs = allIssues.filter(i => i.sev === SEV.HIGH);
    md += `## 🐛 问题清单（共${allIssues.length}个）\n\n`;
    md += `> 🔴CRIT:${crits.length} | 🟠HIGH:${highs.length} | 🟡MED:${allIssues.filter(i => i.sev === SEV.MED).length} | 🟢LOW:${allIssues.filter(i => i.sev === SEV.LOW).length} | ⚪INFO:${allIssues.filter(i => i.sev === SEV.INFO).length}\n\n`;

    if (crits.length > 0) {
        md += `### 🔴 严重问题\n\n`;
        md += `| 文件 | 类别 | 问题 |\n|------|------|------|\n`;
        for (const iss of crits.slice(0, 20)) md += `| \`${iss.file}\` | ${iss.cat} | ${iss.msg} |\n`;
    }
    if (highs.length > 0) {
        md += `\n### 🟠 高优先级\n\n`;
        md += `| 文件 | 类别 | 问题 |\n|------|------|------|\n`;
        for (const iss of highs.slice(0, 20)) md += `| \`${iss.file}\` | ${iss.cat} | ${iss.msg} |\n`;
    }

    const fixable = allIssues.filter(i => i.fixable);
    md += `\n## 🔧 可修复问题（${fixable.length}个）\n\n`;
    if (fixable.length > 0) {
        for (const iss of fixable.slice(0, 15))
            md += `- \`${iss.file}\` → ${iss.sug}\n`;
    }

    return md;
}

// 扫描
async function scan() {
    // console.log(`\n📁 扫描 ${PROJECT_ROOT}...`);
    const files = walk(PROJECT_ROOT);
    // console.log(`📄 找到 ${files.length} 个可审查文件`);
    return files;
}

// 运行一轮评估
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
    const avg = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
    // console.log(`\n  📋 共${allIssues.length}个问题（🔴CRIT:${allIssues.filter(i => i.sev === SEV.CRIT).length} | 🟠HIGH:${allIssues.filter(i => i.sev === SEV.HIGH).length}）综合: ${avg}/100`);

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const mdPath = join(REPORT_DIR, `round${round}_${ts}.md`);
    writeFileSync(mdPath, genReport(round, results, allIssues), 'utf8');
    // console.log(`  📝 报告: ${mdPath}`);

    const { fixed, failed } = await fixIssues(allIssues, PROJECT_ROOT);
    // console.log(`  🔧 修复: ✅${fixed} ❌${failed}`);

    return { results, allIssues, avg };
}

// 主函数
async function main() {
    // console.log('\n🚀 HundunOS 多角色评审引擎');
    // console.log('   项目:', PROJECT_ROOT);
    // console.log('   最大轮次: 10');
    // console.log('   自动修复: 开启');

    try {
        let files = await scan();
        let history = [];

        for (let r = 1; r <= 10; r++) {
            const { results, allIssues, avg } = await runRound(files, r);
            history.push({ round: r, results, allIssues, avg });

            if (r < 10) {
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
        if (final) {
            // console.log(`\n${'═'.repeat(56)}`);
            // console.log('📊 最终评审摘要');
            // console.log('═'.repeat(56));
            for (const { role, score, issues } of final.results) {
                const badge = score >= 90 ? '优秀' : score >= 70 ? '良好' : score >= 50 ? '待改进' : '严重';
                // console.log(`  ${score >= 90 ? '✅' : score >= 70 ? '🟡' : score >= 50 ? '🟠' : '🔴'} ${role.name}: ${score}/100 ${badge} — ${issues.length}问题`);
            }
            // console.log(`\n  综合评分: ${final.avg >= 90 ? '✅' : final.avg >= 70 ? '🟡' : final.avg >= 50 ? '🟠' : '🔴'} ${final.avg}/100`);
            const bySev = [SEV.CRIT, SEV.HIGH, SEV.MED, SEV.LOW, SEV.INFO].map(s => final.allIssues.filter(i => i.sev === s).length);
            // console.log(`  问题分布: 🔴${bySev[0]} 🟠${bySev[1]} 🟡${bySev[2]} 🟢${bySev[3]} ⚪${bySev[4]}`);
            // console.log(`  报告目录: ${REPORT_DIR}`);
        }
    } catch (e) {
        console.error('❌ 错误:', e.message);
        console.error('错误堆栈:', e.stack);
    }
}

// 运行主函数
main();
