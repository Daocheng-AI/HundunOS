# minimax-xlsx — HundunOS 扩展模块
# 移植自 MiniMax-AI/skills (MIT License)

专业级 Excel/XLSX 电子表格处理引擎，使用 XML 直接操作管线（零损编辑）。

## 目录结构

```
extension-modules/minimax-xlsx/
├── scripts/
│   ├── xlsx_reader.py   # 结构发现 + 数据质量审计
│   ├── xlsx_unpack.py   # XLSX → XML 目录解包
│   └── xlsx_pack.py     # XML 目录 → XLSX 打包
└── README.md
```

## 依赖

- Python 3.8+
- `pandas`（用于数据分析）
- **不需要** openpyxl（使用原生 XML 操作，保留 VBA/数据透视表）

## 核心特性

| 特性 | 说明 |
|------|------|
| 零损编辑 | 不经过 openpyxl round-trip，保留所有原生功能 |
| VBA 保留 | 宏和 VBA 代码完整保留 |
| 数据透视 | PivotTable 结构不受影响 |
| 公式验证 | 检测循环引用、#REF!、#VALUE! 等错误 |
| 财务格式化 | 蓝(输入)/黑(公式)/绿(跨表引用) 颜色标准 |

## 使用方式

### 通过 HundunOS Skill 系统
Skill 已注册到 `kernel/skills/skills/minimax-xlsx.yaml`

### 命令行直接调用
```bash
# 读取分析
python scripts/xlsx_reader.py data.xlsx

# 解包编辑
python scripts/xlsx_unpack.py --input data.xlsx --output-dir ./edit_dir
# (编辑 XML 文件...)
python scripts/xlsx_pack.py --input-dir ./edit_dir --output fixed.xlsx
```

## 许可证

MIT License
