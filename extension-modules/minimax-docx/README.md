# minimax-docx — HundunOS 扩展模块（高级）
# 移植自 MiniMax-AI/skills (MIT License)

专业级 Word/DOCX 文档处理引擎，基于 .NET OpenXML SDK。

## ⚠️ 前置条件

- **.NET 8+ SDK**（必须）
- Windows / Linux / macOS（跨平台）

## 目录结构

```
extension-modules/minimax-docx/
├── scripts/
│   ├── setup.ps1           # 环境初始化脚本（NuGet + 编译）
│   ├── env_check.sh        # 环境检查
│   ├── doc_to_docx.sh      # DOC → DOCX 转换
│   └── dotnet/
│       ├── MiniMaxAIDocx.slnx
│       └── MiniMaxAIDocx.Cli/
│           ├── Program.cs  # CLI 入口
│           ├── *.cs        # 核心实现
│           └── *.csproj    # 项目文件
└── README.md
```

## 初始化

```powershell
.\scripts\setup.ps1
```

这会：
1. 检测 .NET SDK 版本
2. 还原 NuGet 依赖包
3. 编译 C# 项目
4. 验证可执行性

## 13 种美学配方

`ieee` · `acm` · `apa` · `nature` · `hbr` · `gb-t9704` ·
`modern` · `classic` · `minimal` · `editorial` · `technical` · `legal` · `creative`

## 许可证

MIT License
