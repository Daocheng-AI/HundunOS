// hundunos/extension-modules/best-practices/index.js — 最佳实践库
// 参考: claude-code-best/claude-code, luongnv89/claude-howto
// 功能: 提供编程最佳实践集合和学习路径

export class BestPractices {
    constructor(kernel) {
        this.kernel = kernel;
        this.practices = this._loadPractices();
        this.learningPaths = this._loadLearningPaths();
    }

    /**
     * 加载最佳实践
     */
    _loadPractices() {
        return {
            // 编码实践
            coding: {
                general: {
                    title: '通用编码实践',
                    items: [
                        {
                            id: 'clean-code',
                            title: 'Clean Code 原则',
                            description: '代码应简洁、可读、自解释',
                            examples: [
                                '// 好: 函数名表达意图\nfunction getUserAge(user) { return user.age; }\n\n// 避免: 意图不明\nfunction f(u) { return u.a; }'
                            ]
                        },
                        {
                            id: 'dry',
                            title: 'DRY 原则',
                            description: 'Don\'t Repeat Yourself - 避免重复代码',
                            examples: [
                                '// 好: 提取公共逻辑\nfunction formatPrice(amount, currency = "USD") {\n  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);\n}'
                            ]
                        },
                        {
                            id: 'solid',
                            title: 'SOLID 原则',
                            description: '面向对象设计五大原则',
                            items: [
                                'S - Single Responsibility (单一职责)',
                                'O - Open/Closed (开闭原则)',
                                'L - Liskov Substitution (里氏替换)',
                                'I - Interface Segregation (接口隔离)',
                                'D - Dependency Inversion (依赖反转)'
                            ]
                        }
                    ]
                },
                
                javascript: {
                    title: 'JavaScript/TypeScript 最佳实践',
                    items: [
                        {
                            id: 'async-await',
                            title: '使用 async/await',
                            examples: [
                                '// 好\nasync function fetchUser(id) {\n  try {\n    const response = await fetch(`/users/${id}`);\n    return await response.json();\n  } catch (error) {\n    console.error("Failed to fetch user:", error);\n    throw error;\n  }\n}'
                            ]
                        },
                        {
                            id: 'destructuring',
                            title: '使用解构赋值',
                            examples: [
                                '// 好\nconst { name, age } = user;\nconst [first, ...rest] = items;\n\n// 函数参数解构\nfunction greet({ name, age }) {\n  return `Hello, ${name}!`;\n}'
                            ]
                        },
                        {
                            id: 'optional-chaining',
                            title: '使用可选链',
                            examples: [
                                '// 好: 安全访问嵌套属性\nconst city = user?.address?.city;\n\n// 安全调用方法\nconst result = obj.method?.();'
                            ]
                        }
                    ]
                },
                
                python: {
                    title: 'Python 最佳实践',
                    items: [
                        {
                            id: 'type-hints',
                            title: '使用类型注解',
                            examples: [
                                'from typing import List, Optional\n\ndef process_items(items: List[str]) -> Optional[str]:\n    if not items:\n        return None\n    return items[0]'
                            ]
                        },
                        {
                            id: 'context-managers',
                            title: '使用上下文管理器',
                            examples: [
                                '# 好: 自动资源管理\nwith open("file.txt", "r") as f:\n    content = f.read()\n\n# 自定义上下文管理器\nfrom contextlib import contextmanager\n\n@contextmanager\ndef timer():\n    start = time.time()\n    yield\n    print(f"Elapsed: {time.time() - start}s")'
                            ]
                        }
                    ]
                },
                
                rust: {
                    title: 'Rust 最佳实践',
                    items: [
                        {
                            id: 'error-handling',
                            title: '错误处理',
                            examples: [
                                '// 好: 使用 ? 运算符\nfn read_config(path: &str) -> Result<Config, Box<dyn Error>> {\n    let content = fs::read_to_string(path)?;\n    let config: Config = toml::from_str(&content)?;\n    Ok(config)\n}'
                            ]
                        },
                        {
                            id: 'ownership',
                            title: '所有权与借用',
                            examples: [
                                '// 好: 使用引用避免所有权转移\nfn get_length(s: &String) -> usize {\n    s.len()\n}\n\n// 迭代时使用迭代器\nfor item in vec.iter() { /* ... */ }'
                            ]
                        }
                    ]
                }
            },
            
            // 架构实践
            architecture: {
                modularity: {
                    title: '模块化设计',
                    items: [
                        {
                            id: 'high-cohesion',
                            title: '高内聚低耦合',
                            description: '模块应职责单一，接口简洁'
                        },
                        {
                            id: 'dependency-injection',
                            title: '依赖注入',
                            description: '依赖通过参数传入，而非内部创建'
                        }
                    ]
                },
                
                error_handling: {
                    title: '错误处理策略',
                    items: [
                        {
                            id: 'fail-fast',
                            title: '快速失败',
                            description: '尽早发现并报告错误'
                        },
                        {
                            id: 'graceful-degradation',
                            title: '优雅降级',
                            description: '非核心功能失败时系统仍可运行'
                        }
                    ]
                }
            },
            
            // Agent 实践
            agent: {
                design: {
                    title: 'Agent 设计模式',
                    items: [
                        {
                            id: 'single-responsibility-agent',
                            title: '单一职责 Agent',
                            description: '每个 Agent 只负责一类任务',
                            examples: [
                                '// 好: 专用 Agent\nconst weatherAgent = new Agent({ name: "weather", tasks: ["get_weather"] });\nconst emailAgent = new Agent({ name: "email", tasks: ["send_email", "read_emails"] });'
                            ]
                        },
                        {
                            id: 'tool-abstraction',
                            title: '工具抽象',
                            description: 'Agent 通过工具接口与外部交互',
                            examples: [
                                'class Agent {\n  constructor(tools) {\n    this.tools = new Map(tools.map(t => [t.name, t]));\n  }\n  \n  async use(toolName, params) {\n    const tool = this.tools.get(toolName);\n    return tool ? tool.execute(params) : null;\n  }\n}'
                            ]
                        },
                        {
                            id: 'context-management',
                            title: '上下文管理',
                            description: '有效管理对话上下文和记忆'
                        }
                    ]
                },
                
                coordination: {
                    title: '多 Agent 协作',
                    items: [
                        {
                            id: 'message-passing',
                            title: '消息传递',
                            description: 'Agent 间通过消息队列通信'
                        },
                        {
                            id: 'shared-state',
                            title: '共享状态',
                            description: '通过共享存储协作'
                        }
                    ]
                }
            }
        };
    }

    /**
     * 加载学习路径
     */
    _loadLearningPaths() {
        return {
            beginner: {
                title: '入门路径',
                steps: [
                    { title: '了解 AI Agent 基础概念', duration: '30min' },
                    { title: '学习提示词工程基础', duration: '1h' },
                    { title: '掌握基本对话技巧', duration: '1h' },
                    { title: '实践第一个 Skill', duration: '2h' }
                ]
            },
            
            intermediate: {
                title: '进阶路径',
                steps: [
                    { title: '理解上下文管理', duration: '1h' },
                    { title: '学习多 Agent 协作', duration: '2h' },
                    { title: '掌握工具集成', duration: '2h' },
                    { title: '优化 Agent 性能', duration: '2h' }
                ]
            },
            
            advanced: {
                title: '高级路径',
                steps: [
                    { title: '设计复杂工作流', duration: '3h' },
                    { title: '实现自定义工具', duration: '3h' },
                    { title: '构建企业级应用', duration: '4h' },
                    { title: '性能调优与监控', duration: '2h' }
                ]
            }
        };
    }

    /**
     * 获取实践
     */
    getPractice(category, subCategory, id) {
        const cat = this.practices[category];
        if (!cat) return null;
        
        const sub = cat[subCategory];
        if (!sub) return null;
        
        return sub.items.find(item => item.id === id);
    }

    /**
     * 获取学习路径
     */
    getLearningPath(level) {
        return this.learningPaths[level] || null;
    }

    /**
     * 搜索实践
     */
    searchPractices(query) {
        const results = [];
        const q = query.toLowerCase();
        
        for (const [catName, cat] of Object.entries(this.practices)) {
            for (const [subName, sub] of Object.entries(cat)) {
                for (const item of sub.items) {
                    if (item.title.toLowerCase().includes(q) ||
                        (item.description && item.description.toLowerCase().includes(q))) {
                        results.push({
                            category: catName,
                            subCategory: subName,
                            ...item
                        });
                    }
                }
            }
        }
        
        return results;
    }

    /**
     * 获取推荐
     */
    getRecommendations(context) {
        const recommendations = [];
        
        // 基于上下文推荐
        if (context.language === 'javascript') {
            recommendations.push(...this.practices.coding.javascript.items);
        }
        
        if (context.isAgent) {
            recommendations.push(...this.practices.agent.design.items);
        }
        
        return recommendations;
    }
}

export function getBestPractices(kernel) {
    return new BestPractices(kernel);
}
