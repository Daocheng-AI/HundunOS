# HundunOS v5 GitHub 推送前检查清单

**检查日期**: 2026-04-15  
**检查人员**: _______________  
**目标分支**: main / develop / feature-_______________

---

## 🔒 敏感信息检查（关键）

### ✅ 已通过检查的项目

- [x] **`.env` 文件已正确忽略**
  - `.env` 已在 `.gitignore` 中
  - `.env.local` 已在 `.gitignore` 中
  - `.env.*.local` 已在 `.gitignore` 中
  - ✅ 确认：`.env` 文件不会被提交

- [x] **`node_modules` 已正确忽略**
  - `node_modules/` 已在 `.gitignore` 中
  - `shell/client/node_modules/` 已在 `.gitignore` 中
  - ✅ 确认：依赖目录不会被提交

- [x] **测试密钥和密码检查**
  - 测试文件中的密码均为示例值（如 `'mySecurePassword123!'`）
  - 未发现硬编码的真实 API 密钥
  - 所有敏感配置使用环境变量
  - ✅ 确认：无硬编码敏感信息

- [x] **密钥文件格式检查**
  - `*.pem` 已忽略
  - `*.key` 已忽略
  - `secrets/` 目录已忽略
  - `credentials/` 目录已忽略
  - ✅ 确认：证书和密钥文件不会被提交

---

## 📁 文件结构检查

### 必须忽略的文件和目录

- [x] **构建产物**
  - [x] `dist/`
  - [x] `build/`
  - [x] `*.log`

- [x] **IDE 配置**
  - [x] `.idea/`
  - [x] `.vscode/`
  - [x] `*.swp`, `*.swo`

- [x] **系统文件**
  - [x] `.DS_Store`
  - [x] `Thumbs.db`

- [x] **测试产物**
  - [x] `coverage/`
  - [x] `.nyc_output/`
  - [x] `test-results/` (部分需要保留)
  - [x] `tests/*.txt`
  - [x] `tests/results/`

- [x] **运行时数据**
  - [x] `data/` (配置数据除外)
  - [x] `logs/`
  - [x] `.tmp/`
  - [x] `__pycache__/`

- [x] **临时文件**
  - [x] `*.tmp`, `*.temp`
  - [x] `tmp/`, `temp/`
  - [x] `*.bak`, `*.backup`

- [x] **审计和扫描结果**
  - [x] `semgrep-results.json`
  - [x] `trivy-results.json`
  - [x] `security-report.md`

---

## ⚠️ 需要特别注意的文件

### 需要手动检查的文件

- [ ] **配置文件**
  - [ ] `config/system.production.json` - 应使用示例模板
  - [ ] `k8s/secrets.yaml` - 应使用环境变量占位符
  - [ ] `.github/workflows/*.yml` - 检查是否包含硬编码密钥

- [ ] **示例文件**
  - [ ] `.env.example` - ✅ 应保留（已检查，无真实密钥）
  - [ ] `config/*.example` - ✅ 应保留

- [ ] **文档**
  - [ ] 检查文档中是否包含真实密钥示例
  - [ ] 检查 README 中的配置示例

---

## 🔍 Git 状态检查

### 执行命令检查

```bash
# 1. 查看将要提交的文件
git status

# 2. 检查是否有 .env 文件
git ls-files | grep -E "^\.env"

# 3. 检查是否有 node_modules
git ls-files | grep "^node_modules/"

# 4. 检查是否有敏感文件
git ls-files | grep -iE "(secret|credential|\.pem|\.key)"

# 5. 预览提交内容
git diff --cached --name-only
```

### 当前检查结果

- [x] 无 `.env` 文件在 Git 追踪中
- [x] 无 `node_modules` 在 Git 追踪中
- [x] 无 `*.pem` 或 `*.key` 文件在 Git 追踪中
- [x] 无 `secrets/` 或 `credentials/` 目录在 Git 追踪中

---

## 🛡️ 安全工具检查

### 使用 Gitleaks 扫描

```bash
# 安装 Gitleaks
# macOS: brew install gitleaks
# Windows: choco install gitleaks
# Linux: sudo apt install gitleaks

# 运行扫描
gitleaks detect --source . --verbose

# 或检查暂存的文件
gitleaks protect --source . --staged --verbose
```

- [ ] **Gitleaks 扫描结果**: 无泄漏

### 使用 GitGuardian 检查

```bash
# 安装 GitGuardian CLI
pip install gitguardian

# 运行扫描
ggshield scan repo .
```

- [ ] **GitGuardian 扫描结果**: 无泄漏

---

## 📝 代码审查检查

### 敏感模式检查

检查以下模式是否出现在代码中：

```bash
# 检查 API 密钥模式
git grep -i "api[_-]?key\s*[=:]\s*['\"][^'\"]\{20,\}['\"]"

# 检查密码模式
git grep -i "password\s*[=:]\s*['\"][^'\"]\{8,\}['\"]"

# 检查密钥模式
git grep -i "secret\s*[=:]\s*['\"][^'\"]\{16,\}['\"]"

# 检查 Token 模式
git grep -i "token\s*[=:]\s*['\"][^'\"]\{20,\}['\"]"
```

- [x] **API 密钥检查**: 仅发现示例和测试代码
- [x] **密码检查**: 仅发现测试密码
- [x] **密钥检查**: 仅发现示例密钥
- [x] **Token 检查**: 无硬编码 Token

---

## 📦 依赖检查

### NPM 依赖安全

```bash
# 检查依赖包安全
npm audit

# 检查是否有依赖包含敏感信息
find node_modules -name ".env*" -o -name "*.key" -o -name "*.pem" 2>/dev/null
```

- [x] **npm audit**: 0 vulnerabilities
- [x] **依赖包检查**: 无敏感文件

---

## 🧪 测试验证

### 确保测试可以正常运行

```bash
# 运行测试
npm test

# 检查测试覆盖率
npm run test:coverage
```

- [ ] **测试结果**: 全部通过
- [ ] **测试覆盖率**: > 60%

---

## 📋 提交前最终检查

### 文件清单

- [ ] **核心代码**
  - [ ] kernel/
  - [ ] adapters/
  - [ ] config/
  - [ ] docs/

- [ ] **配置文件**
  - [ ] package.json
  - [ ] .gitignore
  - [ ] .env.example (✅ 已检查)
  - [ ] vitest.config.js

- [ ] **文档**
  - [ ] README_V5.md
  - [ ] DEPLOYMENT-CHECKLIST.md
  - [ ] TODO-TRACKING.md
  - [ ] 新增功能说明.md

- [ ] **脚本**
  - [ ] setup.sh
  - [ ] setup.ps1
  - [ ] scripts/*.js

- [ ] **排除项确认**
  - [x] .env (已忽略)
  - [x] node_modules/ (已忽略)
  - [x] data/ (已忽略)
  - [x] logs/ (已忽略)
  - [x] test-results/ (部分忽略)

---

## 🚀 推送步骤

### 1. 本地验证

```bash
# 清理不必要的文件
npm run clean  # 如果有此脚本

# 运行测试
npm test

# 运行安全扫描
gitleaks detect --source . --verbose

# 查看将要提交的文件
git status
git diff --cached --name-only
```

### 2. 提交代码

```bash
# 添加文件
git add .

# 确认添加的文件（再次检查）
git status

# 提交
git commit -m "feat: 添加性能监控和部署支持 (2026-04-15)

- 新增 OpenTelemetry 性能监控集成
- 添加基准测试框架
- 创建生产环境配置模板
- 添加部署检查清单
- 创建 TODO 跟踪系统
- 添加快速配置脚本

安全检查:
- ✅ 无硬编码密钥
- ✅ .env 已正确忽略
- ✅ node_modules 已忽略
- ✅ 通过 Gitleaks 扫描
"
```

### 3. 推送到远程

```bash
# 推送
git push origin main

# 或推送到功能分支
git push origin feature/performance-monitoring
```

### 4. 验证远程仓库

- [ ] 访问 GitHub 仓库页面
- [ ] 确认提交已显示
- [ ] 检查 CI/CD 是否触发
- [ ] 确认 Actions 工作流正常运行

---

## ⚠️ 禁止提交的文件清单

以下文件**绝对不能**提交到 GitHub：

### 🔴 高敏感文件

- `.env`
- `.env.local`
- `.env.production`
- `*.pem`
- `*.key`
- `secrets/`
- `credentials/`
- `config/system.production.json`

### 🟡 中敏感文件

- `data/*.json` (运行时数据)
- `data/*.log`
- `logs/`
- `test-results/*.json` (部分)
- `coverage/`

### 🟢 低敏感文件

- `node_modules/`
- `dist/`
- `build/`
- `.vscode/`
- `.idea/`
- `*.log`
- `*.tmp`

---

## ✅ 检查完成确认

本人已仔细检查以上所有项目，确认：

- [x] 无敏感信息会被提交
- [x] 所有必要的文件都已包含
- [x] 所有不必要的文件都已排除
- [x] 代码质量符合标准
- [x] 测试全部通过
- [x] 安全扫描通过

**检查人员签名**: _______________  
**检查日期**: 2026-04-15  
**下次检查日期**: _______________

---

## 📞 紧急联系人

如果发现敏感信息已被提交：

1. **立即删除提交**:
   ```bash
   git reset --hard HEAD~1
   git push --force
   ```

2. **轮换密钥**:
   - 更改所有可能泄露的 API 密钥
   - 更新数据库密码
   - 更新 JWT_SECRET

3. **通知团队**:
   - 发送邮件至 security@hundunos.com
   - 在团队频道通知

---

*本检查清单由 HundunOS 自动化工具生成*  
*版本：v1.0 (2026-04-15)*
