# HundunOS 贡献指南

**版本**: v1.0  
**更新日期**: 2026-04-07

---

## 欢迎贡献

感谢您对 HundunOS 的关注！我们欢迎各种形式的贡献，包括但不限于：
- 代码贡献
- Bug 报告
- 功能建议
- 文档改进
- 测试用例

---

## 开发环境设置

### 前置要求

- Node.js >= 18.0.0
- npm >= 9.0.0
- Rust (用于编译 Rust 模块，可选)

### 克隆项目

```bash
git clone https://github.com/your-repo/hundunos.git
cd hundunos
npm install
```

### 运行开发模式

```bash
npm run dev
```

### 运行测试

```bash
npm test
```

---

## 项目结构

```
hundunos/
├── kernel/              # 核心内核模块
│   ├── core.js         # 内核入口
│   ├── memory-graph.js # 记忆图谱
│   └── ...
├── stable-modules/     # 稳定模块
├── extension-modules/   # 扩展模块
├── config/            # 配置文件
├── docs/             # 文档
└── tests/           # 测试
```

---

## 代码规范

### JavaScript

- 使用 ES6+ 语法
- 使用 4 空格缩进
- 变量命名使用 camelCase
- 常量使用 UPPER_SNAKE_CASE
- 类名使用 PascalCase

```javascript
// Good
const MAX_RETRY_COUNT = 3;
class MemoryGraph {}

// Bad
const maxretrycount = 3;
class memory_graph {}
```

### Rust

- 遵循 Rust 官方代码规范
- 使用 `cargo fmt` 格式化
- 使用 `cargo clippy` 检查

```bash
cargo fmt
cargo clippy -- -D warnings
```

---

## 分支管理

| 分支 | 用途 |
|------|------|
| `main` | 主分支，稳定版本 |
| `develop` | 开发分支 |
| `feature/*` | 功能分支 |
| `fix/*` | Bug 修复分支 |
| `refactor/*` | 重构分支 |

### 创建功能分支

```bash
git checkout develop
git checkout -b feature/your-feature-name
```

### 提交规范

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type**:
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档变更
- `style`: 代码格式
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具变更

**Example**:
```
feat(memory): 添加层级化上下文支持

- 添加 session/project/user/global 四层上下文
- 实现上下文自演进机制
- 添加 TTL 支持

Closes #123
```

---

## Pull Request 流程

### 1. Fork 项目

点击 GitHub 上的 Fork 按钮创建您自己的副本。

### 2. 创建分支

```bash
git checkout -b feature/your-feature
```

### 3. 编写代码

- 遵循代码规范
- 添加必要的注释
- 更新相关文档

### 4. 编写测试

```javascript
describe('MemoryGraph', () => {
    it('should record and recall', () => {
        const graph = new MemoryGraph();
        graph.record('test content', 'test', true);
        const results = graph.recall('test');
        expect(results.recent.length).toBeGreaterThan(0);
    });
});
```

### 5. 提交并推送

```bash
git add .
git commit -m "feat(module): add new feature"
git push origin feature/your-feature
```

### 6. 创建 Pull Request

在 GitHub 上创建 PR，填写以下信息：
- 清晰的标题和描述
- 关联的 Issue（如果有）
- 截图或演示（如果涉及 UI）

---

## 测试要求

### 单元测试

所有核心模块必须有单元测试覆盖：

```bash
npm run test:unit
```

### 集成测试

涉及多模块交互的功能需要集成测试：

```bash
npm run test:integration
```

### 覆盖率要求

| 模块类型 | 最低覆盖率 |
|----------|------------|
| Kernel | 80% |
| Stable Modules | 70% |
| Extension Modules | 60% |

```bash
npm run test:coverage
```

---

## 审核标准

PR 审核时会检查：

1. **代码质量** - 是否遵循代码规范
2. **测试覆盖** - 是否有充分的测试
3. **文档更新** - 是否更新了相关文档
4. **性能影响** - 是否有性能问题
5. **安全性** - 是否有安全风险

---

## 问题反馈

### Bug 报告

请提供以下信息：
- 环境信息（Node 版本、操作系统等）
- 复现步骤
- 预期行为 vs 实际行为
- 相关日志或截图

### 功能建议

请描述：
- 解决的问题
- 可能的解决方案
- 替代方案（如果有）

---

## 许可证

通过贡献代码，您同意将您的作品按照项目的 MIT 许可证发布。

---

## 联系方式

- GitHub Issues: [链接]
- 讨论群: [链接]

感谢您的贡献！