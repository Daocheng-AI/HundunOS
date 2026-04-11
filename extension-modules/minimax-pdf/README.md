# minimax-pdf — HundunOS 扩展模块
# 移植自 MiniMax-AI/skills (MIT License)

专业级 PDF 文档生成引擎，已适配 HundunOS Skill 系统。

## 目录结构

```
extension-modules/minimax-pdf/
├── make.ps1              # Windows PowerShell 统一 CLI（check/fix/run/demo）
├── scripts/
│   ├── palette.py        # 15 种调色板定义 + 字体配对映射
│   ├── cover.py          # 13 种封面图案实现（HTML/CSS 输出）
│   ├── render_cover.js   # Playwright 封面渲染（HTML → PDF）
│   ├── render_body.py    # ReportLab 正文页生成（18 种内容块）
│   ├── merge.py          # pypdf 封面+正文合并
│   ├── fill_inspect.py   # PDF 表单字段检查
│   ├── fill_write.py     # PDF 表单字段写入
│   └── reformat_parse.py # Markdown/文本/PDF → content.json 转换
└── design/
    └── design.md         # 完整设计系统文档
```

## 依赖

- Python 3.9+
- Node.js 18+
- Python 包: `reportlab`, `pypdf`
- Node.js: `playwright` (+ Chromium)
- 安装: `.\make.ps1 fix`

## 使用方式

### 通过 HundunOS Skill 系统（推荐）

Skill 已注册到 `kernel/skills/skills/minimax-pdf.yaml`，
当用户查询匹配触发词时自动激活。

### 命令行直接调用

```powershell
# 环境检查
.\make.ps1 check

# 安装依赖
.\make.ps1 fix

# 创建 PDF
.\make.ps1 run -Title "My Report" -Type report -Out output.pdf

# 构建演示 PDF
.\make.ps1 demo
```

## 支持的文档类型

`report` · `proposal` · `resume` · `portfolio` · `academic` · `general` ·
`minimal` · `stripe` · `diagonal` · `frame` · `editorial` · `magazine` ·
`darkroom` · `terminal` · `poster`

## 许可证

MIT License — 源自 MiniMax-AI/skills，移植至 HundunOS
