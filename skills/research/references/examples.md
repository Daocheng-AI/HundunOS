# Research Skill 使用示例

## 示例 1: AI 趋势分析

```bash
/last30days AI Agent trends
```

输出:
- Reddit: r/programming, r/MachineLearning 热门讨论
- X: AI 研究者分享的技术趋势
- YouTube: 教程和演示视频
- HN: 技术新闻和讨论

## 示例 2: 竞品分析

```bash
/last30days Claude Code vs Cursor
```

## 示例 3: 技术栈调研

```bash
/last30days Rust AI frameworks 2026
```

## HundunOS 代码调用示例

```javascript
// 在 HundunOS 内核中使用
const researchResult = await kernel.skills.execute('research', {
  topic: 'LLM optimization techniques',
  platforms: ['reddit', 'hn'],
  minVotes: 10,
  limit: 20
});

// review: removed // review: removed console.log(researchResult.summary);
// review: removed // review: removed console.log(researchResult.sources);
```

## 输出格式

```json
{
  "topic": "搜索主题",
  "results": [
    {
      "platform": "reddit",
      "title": "讨论标题",
      "url": "链接",
      "votes": 100,
      "comments": 50,
      "summary": "AI 摘要"
    }
  ],
  "generatedAt": "2026-04-08T07:10:00Z"
}
```