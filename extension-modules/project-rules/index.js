// hundunos/extension-modules/project-rules/index.js — Project Rules Auto-Generator v2.0
// 功能: 自动检测技术栈，生成项目规则文件
// 参考: lifedever/claude-rules, claude-code-best 设计
// 状态: 增强

import { readdirSync, readFileSync, existsSync, writeFileSync, statSync } from 'fs';
import { join, dirname, extname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 技术栈签名库
const TECH_SIGNATURES = {
    // 语言检测
    languages: {
        javascript: {
            files: ['package.json'],
            extensions: ['.js', '.jsx', '.mjs', '.cjs'],
            priority: 1
        },
        typescript: {
            files: ['tsconfig.json'],
            extensions: ['.ts', '.tsx'],
            priority: 2
        },
        python: {
            files: ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'],
            extensions: ['.py', '.pyi', '.pyw'],
            priority: 1
        },
        rust: {
            files: ['Cargo.toml'],
            extensions: ['.rs'],
            priority: 1
        },
        go: {
            files: ['go.mod', 'go.sum'],
            extensions: ['.go'],
            priority: 1
        },
        java: {
            files: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
            extensions: ['.java', '.kt'],
            priority: 1
        },
        csharp: {
            files: ['*.csproj', '*.sln'],
            extensions: ['.cs'],
            priority: 1
        },
        ruby: {
            files: ['Gemfile', 'Rakefile'],
            extensions: ['.rb', '.rake'],
            priority: 2
        },
        php: {
            files: ['composer.json'],
            extensions: ['.php'],
            priority: 2
        },
        swift: {
            files: ['Package.swift'],
            extensions: ['.swift'],
            priority: 2
        },
        kotlin: {
            files: ['build.gradle.kts'],
            extensions: ['.kt', '.kts'],
            priority: 2
        }
    },
    
    // 框架检测
    frameworks: {
        react: { deps: ['react'], files: ['jsx'] },
        vue: { deps: ['vue'], files: ['.vue'] },
        angular: { deps: ['@angular/core'], files: [] },
        svelte: { deps: ['svelte'], files: ['.svelte'] },
        next: { deps: ['next'], files: [] },
        nuxt: { deps: ['nuxt'], files: [] },
        express: { deps: ['express'], files: [] },
        fastify: { deps: ['fastify'], files: [] },
        nestjs: { deps: ['@nestjs/core'], files: [] },
        django: { deps: ['django'], files: ['settings.py'] },
        flask: { deps: ['flask'], files: [] },
        fastapi: { deps: ['fastapi'], files: [] },
        actix: { deps: ['actix-web'], files: [] },
        axum: { deps: ['axum'], files: [] },
        gin: { deps: ['gin'], files: [] },
        spring: { deps: ['spring-boot'], files: [] }
    },
    
    // 测试框架
    testing: {
        jest: { deps: ['jest'], files: ['jest.config.js'] },
        vitest: { deps: ['vitest'], files: ['vitest.config.ts'] },
        mocha: { deps: ['mocha'], files: ['.mocharc'] },
        pytest: { deps: ['pytest'], files: ['pytest.ini'] },
        unittest: { deps: [], files: ['test_*.py', '*_test.py'] },
        cargo_test: { deps: [], files: [] },
        go_test: { deps: [], files: ['*_test.go'] },
        junit: { deps: ['junit'], files: [] }
    },
    
    // 代码质量工具
    quality: {
        eslint: { deps: ['eslint'], files: ['.eslintrc', '.eslintrc.js', '.eslintrc.json'] },
        prettier: { deps: ['prettier'], files: ['.prettierrc', '.prettierrc.js'] },
        black: { deps: ['black'], files: ['pyproject.toml'] },
        ruff: { deps: ['ruff'], files: ['ruff.toml'] },
        rustfmt: { deps: [], files: ['rustfmt.toml'] },
        clippy: { deps: [], files: ['.clippy.toml'] },
        gofmt: { deps: [], files: [] },
        checkstyle: { deps: [], files: ['checkstyle.xml'] }
    }
};

// 规则模板
const RULE_TEMPLATES = {
    javascript: {
        indent: 2,
        semi: true,
        quotes: 'single',
        trailingComma: 'es5',
        arrowParens: 'always'
    },
    typescript: {
        indent: 2,
        semi: true,
        quotes: 'single',
        strict: true,
        noImplicitAny: true
    },
    python: {
        indent: 4,
        maxLineLength: 88,
        docstringStyle: 'google',
        typeHints: true
    },
    rust: {
        indent: 4,
        maxLineLength: 100,
        edition: '2021',
        clippy: true
    },
    go: {
        indent: 4,
        tabWidth: 4,
        useTabs: true
    },
    java: {
        indent: 4,
        maxLineLength: 120,
        googleJavaFormat: true
    }
};

export class ProjectRules {
    constructor(kernel) {
        this.kernel = kernel;
        this.workspaceRoot = kernel?.config?.workspace || process.cwd();
        this.detectedStack = null;
    }

    async initialize() {
        // console.log('[ProjectRules] v2.0 Initializing...');
    }

    /**
     * 检测所有技术栈
     */
    detectTechStack() {
        const stack = {
            languages: [],
            frameworks: [],
            packageManagers: [],
            buildTools: [],
            testing: [],
            quality: [],
            databases: [],
            deployment: []
        };

        // 1. 检测语言
        stack.languages = this._detectLanguages();

        // 2. 检测框架
        stack.frameworks = this._detectFrameworks();

        // 3. 检测包管理器
        stack.packageManagers = this._detectPackageManagers();

        // 4. 检测构建工具
        stack.buildTools = this._detectBuildTools();

        // 5. 检测测试框架
        stack.testing = this._detectTesting();

        // 6. 检测代码质量工具
        stack.quality = this._detectQuality();

        // 7. 检测数据库
        stack.databases = this._detectDatabases();

        // 8. 检测部署
        stack.deployment = this._detectDeployment();

        this.detectedStack = stack;
        return stack;
    }

    /**
     * 检测语言
     */
    _detectLanguages() {
        const detected = [];
        
        for (const [lang, sig] of Object.entries(TECH_SIGNATURES.languages)) {
            // 检查配置文件
            for (const file of sig.files) {
                if (file.includes('*')) {
                    // 通配符匹配
                    const files = this._globMatch(file);
                    if (files.length > 0) {
                        detected.push(lang);
                        break;
                    }
                } else if (existsSync(join(this.workspaceRoot, file))) {
                    detected.push(lang);
                    break;
                }
            }
            
            // 检查扩展名
            if (!detected.includes(lang)) {
                const extensions = this._scanExtensions();
                for (const ext of sig.extensions) {
                    if (extensions.has(ext)) {
                        detected.push(lang);
                        break;
                    }
                }
            }
        }
        
        return detected;
    }

    /**
     * 检测框架
     */
    _detectFrameworks() {
        const detected = [];
        const pkgDeps = this._getPackageDeps();
        
        for (const [framework, sig] of Object.entries(TECH_SIGNATURES.frameworks)) {
            // 检查依赖
            for (const dep of sig.deps) {
                if (pkgDeps.has(dep)) {
                    detected.push(framework);
                    break;
                }
            }
        }
        
        return detected;
    }

    /**
     * 检测包管理器
     */
    _detectPackageManagers() {
        const managers = [];
        
        const lockFiles = {
            'package-lock.json': 'npm',
            'yarn.lock': 'yarn',
            'pnpm-lock.yaml': 'pnpm',
            'bun.lockb': 'bun',
            'Cargo.lock': 'cargo',
            'go.sum': 'go mod',
            'poetry.lock': 'poetry',
            'Pipfile.lock': 'pipenv',
            'composer.lock': 'composer',
            'Gemfile.lock': 'bundler'
        };
        
        for (const [file, manager] of Object.entries(lockFiles)) {
            if (existsSync(join(this.workspaceRoot, file))) {
                managers.push(manager);
            }
        }
        
        return managers;
    }

    /**
     * 检测构建工具
     */
    _detectBuildTools() {
        const tools = [];
        
        const buildFiles = {
            'webpack.config.js': 'webpack',
            'vite.config.js': 'vite',
            'vite.config.ts': 'vite',
            'rollup.config.js': 'rollup',
            'esbuild.config.js': 'esbuild',
            'turbo.json': 'turbo',
            'nx.json': 'nx',
            'Makefile': 'make',
            'CMakeLists.txt': 'cmake',
            'build.gradle': 'gradle',
            'pom.xml': 'maven',
            'Cargo.toml': 'cargo'
        };
        
        for (const [file, tool] of Object.entries(buildFiles)) {
            if (existsSync(join(this.workspaceRoot, file))) {
                tools.push(tool);
            }
        }
        
        return tools;
    }

    /**
     * 检测测试框架
     */
    _detectTesting() {
        const detected = [];
        const pkgDeps = this._getPackageDeps();
        
        for (const [framework, sig] of Object.entries(TECH_SIGNATURES.testing)) {
            for (const dep of sig.deps) {
                if (pkgDeps.has(dep)) {
                    detected.push(framework);
                    break;
                }
            }
            
            for (const file of sig.files) {
                if (file.includes('*')) {
                    const files = this._globMatch(file);
                    if (files.length > 0 && !detected.includes(framework)) {
                        detected.push(framework);
                        break;
                    }
                } else if (existsSync(join(this.workspaceRoot, file))) {
                    if (!detected.includes(framework)) {
                        detected.push(framework);
                    }
                }
            }
        }
        
        return detected;
    }

    /**
     * 检测代码质量工具
     */
    _detectQuality() {
        const detected = [];
        const pkgDeps = this._getPackageDeps();
        
        for (const [tool, sig] of Object.entries(TECH_SIGNATURES.quality)) {
            for (const dep of sig.deps) {
                if (pkgDeps.has(dep)) {
                    detected.push(tool);
                    break;
                }
            }
            
            for (const file of sig.files) {
                if (existsSync(join(this.workspaceRoot, file))) {
                    if (!detected.includes(tool)) {
                        detected.push(tool);
                    }
                }
            }
        }
        
        return detected;
    }

    /**
     * 检测数据库
     */
    _detectDatabases() {
        const databases = [];
        const pkgDeps = this._getPackageDeps();
        
        const dbDeps = {
            'pg': 'PostgreSQL',
            'mysql2': 'MySQL',
            'mysql': 'MySQL',
            'mongodb': 'MongoDB',
            'mongoose': 'MongoDB',
            'redis': 'Redis',
            'ioredis': 'Redis',
            'sqlite3': 'SQLite',
            'better-sqlite3': 'SQLite',
            'prisma': 'Prisma',
            'typeorm': 'TypeORM',
            'sequelize': 'Sequelize',
            'knex': 'Knex',
            'sqlalchemy': 'SQLAlchemy',
            'pymongo': 'MongoDB',
            'diesel': 'Diesel (Rust)',
            'sea-orm': 'SeaORM (Rust)'
        };
        
        for (const [dep, db] of Object.entries(dbDeps)) {
            if (pkgDeps.has(dep) && !databases.includes(db)) {
                databases.push(db);
            }
        }
        
        return databases;
    }

    /**
     * 检测部署工具
     */
    _detectDeployment() {
        const deployment = [];
        
        const deployFiles = {
            'Dockerfile': 'Docker',
            'docker-compose.yml': 'Docker Compose',
            'docker-compose.yaml': 'Docker Compose',
            '.github/workflows': 'GitHub Actions',
            '.gitlab-ci.yml': 'GitLab CI',
            'Jenkinsfile': 'Jenkins',
            'vercel.json': 'Vercel',
            'netlify.toml': 'Netlify',
            'terraform': 'Terraform',
            'k8s': 'Kubernetes',
            'kubernetes': 'Kubernetes',
            'helm': 'Helm'
        };
        
        for (const [file, tool] of Object.entries(deployFiles)) {
            if (existsSync(join(this.workspaceRoot, file))) {
                deployment.push(tool);
            }
        }
        
        return deployment;
    }

    /**
     * 获取包依赖列表
     */
    _getPackageDeps() {
        const deps = new Set();
        
        // npm/yarn/pnpm
        const pkgPath = join(this.workspaceRoot, 'package.json');
        if (existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
                Object.keys(pkg.dependencies || {}).forEach(d => deps.add(d));
                Object.keys(pkg.devDependencies || {}).forEach(d => deps.add(d));
            } catch (e) {}
        }
        
        // Python requirements.txt
        const reqPath = join(this.workspaceRoot, 'requirements.txt');
        if (existsSync(reqPath)) {
            try {
                const lines = readFileSync(reqPath, 'utf8').split('\n');
                lines.forEach(line => {
                    const pkg = line.split(/[=<>]/)[0].trim();
                    if (pkg) deps.add(pkg);
                });
            } catch (e) {}
        }
        
        // Cargo.toml
        const cargoPath = join(this.workspaceRoot, 'Cargo.toml');
        if (existsSync(cargoPath)) {
            try {
                const content = readFileSync(cargoPath, 'utf8');
                const depMatch = content.match(/\[dependencies\]([\s\S]*?)(\[|$)/);
                if (depMatch) {
                    const lines = depMatch[1].split('\n');
                    lines.forEach(line => {
                        const pkg = line.split('=')[0].trim();
                        if (pkg) deps.add(pkg);
                    });
                }
            } catch (e) {}
        }
        
        // go.mod
        const goModPath = join(this.workspaceRoot, 'go.mod');
        if (existsSync(goModPath)) {
            try {
                const content = readFileSync(goModPath, 'utf8');
                const lines = content.split('\n');
                lines.forEach(line => {
                    if (line.includes(' ')) {
                        const pkg = line.split(' ')[0].trim();
                        if (pkg && !pkg.startsWith('module') && !pkg.startsWith('go')) {
                            deps.add(pkg);
                        }
                    }
                });
            } catch (e) {}
        }
        
        return deps;
    }

    /**
     * 扫描文件扩展名
     */
    _scanExtensions() {
        const extensions = new Set();
        
        try {
            const files = this._walkDir(this.workspaceRoot, 3);
            files.forEach(f => extensions.add(extname(f)));
        } catch (e) {}
        
        return extensions;
    }

    /**
     * 遍历目录
     */
    _walkDir(dir, depth = 2) {
        const files = [];
        if (depth <= 0) return files;
        
        try {
            const entries = readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
                
                const fullPath = join(dir, entry.name);
                if (entry.isDirectory()) {
                    files.push(...this._walkDir(fullPath, depth - 1));
                } else {
                    files.push(fullPath);
                }
            }
        } catch (e) {}
        
        return files;
    }

    /**
     * 通配符匹配
     */
    _globMatch(pattern) {
        const files = [];
        const dir = this.workspaceRoot;
        
        try {
            const entries = readdirSync(dir);
            for (const entry of entries) {
                if (pattern.includes('*.csproj') && entry.endsWith('.csproj')) {
                    files.push(entry);
                } else if (pattern.includes('*.sln') && entry.endsWith('.sln')) {
                    files.push(entry);
                } else if (pattern.includes('test_*.py') && entry.startsWith('test_') && entry.endsWith('.py')) {
                    files.push(entry);
                } else if (pattern.includes('*_test.py') && entry.endsWith('_test.py')) {
                    files.push(entry);
                } else if (pattern.includes('*_test.go') && entry.endsWith('_test.go')) {
                    files.push(entry);
                }
            }
        } catch (e) {}
        
        return files;
    }

    /**
     * 生成 CLAUDE.md
     */
    generateClaudeMd(stack) {
        const lines = [
            '# 项目规则',
            '',
            '> 自动生成于 ' + new Date().toISOString(),
            '',
            '## 技术栈',
            ''
        ];
        
        if (stack.languages.length > 0) {
            lines.push('### 语言');
            stack.languages.forEach(l => lines.push(`- ${l}`));
            lines.push('');
        }
        
        if (stack.frameworks.length > 0) {
            lines.push('### 框架');
            stack.frameworks.forEach(f => lines.push(`- ${f}`));
            lines.push('');
        }
        
        if (stack.packageManagers.length > 0) {
            lines.push('### 包管理');
            stack.packageManagers.forEach(p => lines.push(`- ${p}`));
            lines.push('');
        }
        
        if (stack.testing.length > 0) {
            lines.push('### 测试');
            stack.testing.forEach(t => lines.push(`- ${t}`));
            lines.push('');
        }
        
        if (stack.quality.length > 0) {
            lines.push('### 代码质量');
            stack.quality.forEach(q => lines.push(`- ${q}`));
            lines.push('');
        }
        
        // 编码规范
        lines.push('## 编码规范', '');
        
        const primaryLang = stack.languages[0];
        if (primaryLang && RULE_TEMPLATES[primaryLang.toLowerCase()]) {
            const rules = RULE_TEMPLATES[primaryLang.toLowerCase()];
            lines.push('```json');
            lines.push(JSON.stringify(rules, null, 2));
            lines.push('```');
        }
        
        lines.push('');
        
        // 最佳实践
        lines.push('## 最佳实践', '');
        lines.push('- 保持代码简洁');
        lines.push('- 编写单元测试');
        lines.push('- 遵循项目结构');
        lines.push('- 使用版本控制');
        lines.push('');
        
        return lines.join('\n');
    }

    /**
     * 生成 .hundunos-rules.json
     */
    generateRulesJson(stack) {
        const primaryLang = stack.languages[0];
        const rules = primaryLang ? RULE_TEMPLATES[primaryLang.toLowerCase()] || {} : {};
        
        return {
            version: '2.0',
            generated: new Date().toISOString(),
            techStack: stack,
            rules: {
                formatting: rules,
                testing: {
                    frameworks: stack.testing,
                    coverageThreshold: 80
                },
                linting: {
                    enabled: stack.quality.length > 0,
                    tools: stack.quality
                },
                deployment: {
                    methods: stack.deployment,
                    containerization: stack.deployment.includes('Docker')
                }
            },
            recommendations: this._generateRecommendations(stack)
        };
    }

    /**
     * 生成建议
     */
    _generateRecommendations(stack) {
        const recommendations = [];
        
        if (stack.languages.length === 0) {
            recommendations.push('未检测到主要语言，请手动配置');
        }
        
        if (stack.testing.length === 0) {
            recommendations.push('建议添加测试框架以提高代码质量');
        }
        
        if (stack.quality.length === 0) {
            recommendations.push('建议添加代码质量工具（如ESLint、Prettier）');
        }
        
        if (stack.deployment.length === 0) {
            recommendations.push('建议配置部署流程');
        }
        
        return recommendations;
    }

    /**
     * 生成规则文件
     */
    async generate() {
        // console.log('[ProjectRules] Detecting tech stack...');
        const stack = this.detectTechStack();

        // console.log('[ProjectRules] Detected:', JSON.stringify(stack, null, 2));

        // 生成 CLAUDE.md
        const claudeMdPath = join(this.workspaceRoot, 'CLAUDE.md');
        const claudeContent = this.generateClaudeMd(stack);
        writeFileSync(claudeMdPath, claudeContent, 'utf8');
        // console.log('[ProjectRules] Generated CLAUDE.md');

        // 生成 .hundunos-rules.json
        const rulesPath = join(this.workspaceRoot, '.hundunos-rules.json');
        const rulesContent = this.generateRulesJson(stack);
        writeFileSync(rulesPath, JSON.stringify(rulesContent, null, 2), 'utf8');
        // console.log('[ProjectRules] Generated .hundunos-rules.json');

        return {
            success: true,
            techStack: stack,
            files: [claudeMdPath, rulesPath]
        };
    }

    /**
     * 加载已存在的规则
     */
    loadExisting() {
        const claudeMdPath = join(this.workspaceRoot, 'CLAUDE.md');
        const rulesPath = join(this.workspaceRoot, '.hundunos-rules.json');

        const result = {
            claudeMd: null,
            rules: null
        };

        if (existsSync(claudeMdPath)) {
            result.claudeMd = readFileSync(claudeMdPath, 'utf8');
        }

        if (existsSync(rulesPath)) {
            try {
                result.rules = JSON.parse(readFileSync(rulesPath, 'utf8'));
            } catch (e) {}
        }

        return result;
    }

    getStats() {
        return {
            workspace: this.workspaceRoot,
            detected: this.detectedStack,
            existing: this.loadExisting()
        };
    }
}

export function getProjectRules(kernel) {
    return new ProjectRules(kernel);
}
