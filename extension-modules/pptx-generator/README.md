# pptx-generator — HundunOS 扩展模块
# 移植自 MiniMax-AI/skills (MIT License)

专业级 PPTX 演示文稿生成引擎，基于 PptxGenJS，已适配 HundunOS Skill 系统。

## 目录结构

```
extension-modules/pptx-generator/
├── scripts/
│   └── generate.js       # 核心 PptxGenJS 生成引擎
└── references/
    ├── design-system.md  # 完整设计系统文档（18 套配色）
    ├── slide-types.md    # 5 种幻灯片类型详解
    ├── editing.md        # XML 编辑模式参考
    ├── pitfalls.md       # 常见陷阱与反模式
    └── pptxgenjs.md      # PptxGenJS API 速查
```

## 依赖

- Node.js 14+
- `pptxgenjs`: `npm install pptxgenjs`

## 使用方式

### 通过 HundunOS Skill 系统（推荐）

Skill 已注册到 `kernel/skills/skills/pptx-generator.yaml`，
匹配触发词时自动激活。

### 命令行直接调用

```bash
node scripts/generate.js --input slides.json --out presentation.pptx
```

## 支持的幻灯片类型

`Cover`(封面) · `TOC`(目录) · `SectionDivider`(章节分隔) ·
`Content`(内容页) · `Summary`(总结页)

## 许可证

MIT License
