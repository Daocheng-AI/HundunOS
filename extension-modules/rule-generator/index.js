// hundunos/extension-modules/rule-generator/index.js — 规则自动生成器
// 参考: lifedever/claude-rules
// 功能: 自动检测项目技术栈并生成规则文件

import { readFileSync, existsSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';

export class RuleGenerator {
    constructor(kernel) {
        this.kernel = kernel;
        
        // 技术栈签名
        this.techSignatures = {
            javascript: {
                files: ['package.json', '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'],
                configFiles: ['package.json', 'tsconfig.json', '.eslintrc', '.prettierrc'],
                frameworks: ['react', 'vue', 'angular', 'next', 'nuxt', 'express', 'koa']
            },
            python: {
                files: ['requirements.txt', 'pyproject.toml', 'setup.py', '.py'],
                configFiles: ['requirements.txt', 'pyproject.toml', 'setup.py', 'tox.ini'],
                frameworks: ['django', 'flask', 'fastapi', 'pytest', 'numpy', 'pandas']
            },
            rust: {
                files: ['Cargo.toml', '.rs'],
                configFiles: ['Cargo.toml', 'rustfmt.toml', 'clippy.toml'],
                frameworks: ['tokio', 'actix', 'rocket', 'serde']
            },
            go: {
                files: ['go.mod', '.go'],
                configFiles: ['go.mod', 'go.sum'],
                frameworks: ['gin', 'echo', 'fiber', 'mux']
            },
            java: {
                files: ['pom.xml', 'build.gradle', '.java'],
                configFiles: ['pom.xml', 'build.gradle'],
                frameworks: ['spring', 'springboot', 'quarkus', 'micronaut']
            }
        };
        
        // 规则模板
        this.ruleTemplates = {
            javascript: this._jsTemplate(),
            python: this._pythonTemplate(),
            rust: this._rustTemplate(),
            go: this._goTemplate(),
            java: this._javaTemplate()
        };
    }

    /**
     * 检测项目技术栈
     */
    detectTechStack(projectPath) {
        const result = {
            languages: [],
            frameworks: [],
            configs: {},
            recommendations: []
        };
        
        // 扫描文件
        const files = this._scanFiles(projectPath, 2);
        
        // 检测语言
        for (const [lang, sig] of Object.entries(this.techSignatures)) {
            const match = this._matchSignature(files, sig.files);
            if (match) {
                result.languages.push(lang);
                
                // 检测框架
                const frameworks = this._detectFrameworks(projectPath, lang, sig);
                result.frameworks.push(...frameworks);
            }
        }
        
        // 读取配置
        for (const lang of result.languages) {
            const sig = this.techSignatures[lang];
            for (const configFile of sig.configFiles) {
                const configPath = join(projectPath, configFile);
                if (existsSync(configPath)) {
                    result.configs[configFile] = this._parseConfig(configPath);
                }
            }
        }
        
        // 生成推荐
        result.recommendations = this._generateRecommendations(result);
        
        return result;
    }

    /**
     * 生成规则文件
     */
    generateRules(projectPath, techStack = null) {
        if (!techStack) {
            techStack = this.detectTechStack(projectPath);
        }
        
        const rules = {
            version: 'hundunos-rules-v1',
            generated_at: new Date().toISOString(),
            project_path: projectPath,
            tech_stack: techStack,
            rules: this._buildRules(techStack),
            claude_md: this._generateClaudeMD(techStack)
        };
        
        return rules;
    }

    /**
     * 写入规则文件
     */
    async writeRules(projectPath, rules = null) {
        if (!rules) {
            rules = this.generateRules(projectPath);
        }
        
        // 写入 .hundunos-rules.json
        const rulesPath = join(projectPath, '.hundunos-rules.json');
        writeFileSync(rulesPath, JSON.stringify(rules, null, 2), 'utf-8');
        
        // 写入 CLAUDE.md
        const claudePath = join(projectPath, 'CLAUDE.md');
        writeFileSync(claudePath, rules.claude_md, 'utf-8');
        
        console.log(`[RuleGenerator] Rules written to ${projectPath}`);
        
        return { rulesPath, claudePath };
    }

    /**
     * 扫描文件
     */
    _scanFiles(dir, depth = 2) {
        const files = [];
        
        if (depth <= 0 || !existsSync(dir)) return files;
        
        try {
            const entries = readdirSync(dir);
            for (const entry of entries) {
                if (entry.startsWith('.') || entry === 'node_modules') continue;
                
                const fullPath = join(dir, entry);
                const stat = statSync(fullPath);
                
                if (stat.isDirectory()) {
                    files.push(...this._scanFiles(fullPath, depth - 1));
                } else {
                    files.push(entry);
                }
            }
        } catch (e) {}
        
        return files;
    }

    /**
     * 匹配签名
     */
    _matchSignature(files, signatures) {
        for (const sig of signatures) {
            if (sig.startsWith('.')) {
                // 扩展名匹配
                if (files.some(f => f.endsWith(sig))) return true;
            } else {
                // 文件名匹配
                if (files.includes(sig)) return true;
            }
        }
        return false;
    }

    /**
     * 检测框架
     */
    _detectFrameworks(projectPath, lang, sig) {
        const frameworks = [];
        
        try {
            // 读取 package.json
            if (lang === 'javascript') {
                const pkgPath = join(projectPath, 'package.json');
                if (existsSync(pkgPath)) {
                    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
                    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
                    
                    for (const fw of sig.frameworks) {
                        if (deps[fw]) frameworks.push(fw);
                    }
                }
            }
            
            // 读取 Cargo.toml
            if (lang === 'rust') {
                const cargoPath = join(projectPath, 'Cargo.toml');
                if (existsSync(cargoPath)) {
                    const content = readFileSync(cargoPath, 'utf-8');
                    for (const fw of sig.frameworks) {
                        if (content.includes(fw)) frameworks.push(fw);
                    }
                }
            }
            
            // 读取 requirements.txt
            if (lang === 'python') {
                const reqPath = join(projectPath, 'requirements.txt');
                if (existsSync(reqPath)) {
                    const content = readFileSync(reqPath, 'utf-8').toLowerCase();
                    for (const fw of sig.frameworks) {
                        if (content.includes(fw)) frameworks.push(fw);
                    }
                }
            }
        } catch (e) {}
        
        return [...new Set(frameworks)];
    }

    /**
     * 解析配置
     */
    _parseConfig(configPath) {
        try {
            const content = readFileSync(configPath, 'utf-8');
            const ext = extname(configPath);
            
            if (ext === '.json') {
                return JSON.parse(content);
            }
            
            return { raw: content };
        } catch (e) {
            return { error: e.message };
        }
    }

    /**
     * 生成推荐
     */
    _generateRecommendations(techStack) {
        const recommendations = [];
        
        if (techStack.languages.includes('javascript')) {
            recommendations.push('使用 ESLint + Prettier 进行代码规范化');
            recommendations.push('配置 TypeScript 严格模式');
        }
        
        if (techStack.languages.includes('python')) {
            recommendations.push('使用 Black + isort 进行代码格式化');
            recommendations.push('配置 mypy 类型检查');
        }
        
        if (techStack.languages.includes('rust')) {
            recommendations.push('使用 clippy 进行代码检查');
            recommendations.push('配置 rustfmt 自动格式化');
        }
        
        return recommendations;
    }

    /**
     * 构建规则
     */
    _buildRules(techStack) {
        const rules = {
            coding_style: {},
            best_practices: [],
            avoid_patterns: []
        };
        
        for (const lang of techStack.languages) {
            const template = this.ruleTemplates[lang];
            if (template) {
                rules.coding_style[lang] = template.style;
                rules.best_practices.push(...template.practices);
                rules.avoid_patterns.push(...template.avoid);
            }
        }
        
        return rules;
    }

    /**
     * 生成 CLAUDE.md 内容
     */
    _generateClaudeMD(techStack) {
        const lines = [
            '# 项目规则',
            '',
            '> 自动生成于 ' + new Date().toISOString(),
            '',
            '## 技术栈',
            '',
            '**语言**: ' + techStack.languages.join(', '),
            '',
            '**框架**: ' + (techStack.frameworks.length > 0 ? techStack.frameworks.join(', ') : '无'),
            '',
            '## 编码规范',
            ''
        ];
        
        for (const lang of techStack.languages) {
            const template = this.ruleTemplates[lang];
            if (template) {
                lines.push(`### ${lang.toUpperCase()}`);
                lines.push('');
                lines.push(template.style);
                lines.push('');
            }
        }
        
        lines.push('## 最佳实践');
        lines.push('');
        for (const rec of techStack.recommendations) {
            lines.push(`- ${rec}`);
        }
        
        lines.push('');
        lines.push('---');
        lines.push('*由 HundunOS RuleGenerator 自动生成*');
        
        return lines.join('\n');
    }

    // 模板定义
    _jsTemplate() {
        return {
            style: `
- 缩进: 2空格
- 引号: 单引号
- 分号: 可选 (推荐省略)
- 命名: camelCase (变量/函数), PascalCase (类/组件)
`,
            practices: [
                '使用 const/let 替代 var',
                '异步操作使用 async/await',
                '组件使用函数式写法',
                '使用 ES6+ 语法特性'
            ],
            avoid: [
                '避免使用 any 类型 (TypeScript)',
                '避免嵌套回调，使用 Promise',
                '避免直接操作 DOM'
            ]
        };
    }

    _pythonTemplate() {
        return {
            style: `
- 缩进: 4空格
- 引号: 双引号
- 命名: snake_case (变量/函数), PascalCase (类)
- 最大行宽: 88 (Black 默认)
`,
            practices: [
                '使用类型注解',
                '使用 f-string 格式化',
                '使用 with 语句管理资源',
                '遵循 PEP 8 规范'
            ],
            avoid: [
                '避免使用可变默认参数',
                '避免裸 except',
                '避免全局变量'
            ]
        };
    }

    _rustTemplate() {
        return {
            style: `
- 缩进: 4空格
- 命名: snake_case (函数/变量), PascalCase (类型/特征)
- 错误处理: Result<T, E>
`,
            practices: [
                '使用 ? 运算符传播错误',
                '使用 match 进行模式匹配',
                '优先使用引用避免所有权转移',
                '使用 clippy 检查代码'
            ],
            avoid: [
                '避免 unwrap() 在生产代码',
                '避免不必要的 clone()',
                '避免过度使用 unsafe'
            ]
        };
    }

    _goTemplate() {
        return {
            style: `
- 缩进: Tab
- 命名: camelCase (私有), PascalCase (公开)
- 错误处理: if err != nil
`,
            practices: [
                '使用 gofmt 格式化代码',
                '使用 defer 释放资源',
                '接口定义在消费者处',
                '错误信息小写开头'
            ],
            avoid: [
                '避免 panic',
                '避免空接口 map',
                '避免过度使用 goroutine'
            ]
        };
    }

    _javaTemplate() {
        return {
            style: `
- 缩进: 4空格
- 大括号: K&R 风格
- 命名: camelCase (方法/变量), PascalCase (类)
`,
            practices: [
                '使用 Optional 避免 NPE',
                '使用 Stream API',
                '优先组合而非继承',
                '使用 Lombok 减少样板代码'
            ],
            avoid: [
                '避免过度使用静态方法',
                '避免大类',
                '避免深层嵌套'
            ]
        };
    }
}

export function getRuleGenerator(kernel) {
    return new RuleGenerator(kernel);
}
