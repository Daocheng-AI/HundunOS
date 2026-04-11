---
name: research
description: 跨平台趋势研究工具 - 整合 last30days-skill 能力，提供 Reddit、X、YouTube、HN 等平台的趋势分析
priority: high
version: 1.0.0
author: HundunOS
tags:
  - research
  - trends
  - analysis
  - ai
requires: []
related_skills:
  - search
  - browser
---

# Research Skill v1.0

跨平台趋势研究工具，为 HundunOS 提供信息收集与趋势分析能力。

## 功能

- **趋势搜索**: 跨 Reddit、X、YouTube、HN 等平台搜索
- **话题分析**: 提取讨论热点和趋势
- **摘要生成**: AI 合成带引用的分析报告

## 使用方式

```
用户: 过去30天关于 AI Agent 的讨论热点是什么?
-> 调用 research skill
-> 跨平台收集数据
-> 生成分析报告
```

## 配置

需要以下环境变量（可选，部分功能需要）:
- `SCRAPECREATORS_API_KEY` - 必需
- `OPENAI_API_KEY` - 用于 AI 摘要生成
- `XAI_API_KEY` - 用于访问 X 平台数据

## 实现

本 Skill 作为 facade，实际调用 last30days-skill 或其他研究工具。

Level 1 (元数据): 上面已提供
Level 2 (指令): 在触发时从 references/ 获取详细使用说明
Level 3 (资源): references/ 目录下包含:
- usage.md - 详细使用指南
- platforms.md - 支持的平台说明
- examples.md - 使用示例