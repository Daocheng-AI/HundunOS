# Research Skill 使用指南

## 基本使用

```bash
# 安装 last30days-skill
git clone https://github.com/mvanhorn/last30days-skill.git ~/.openclaw/workspace/skills/last30days-skill

# 使用方式
/last30days <搜索主题>
```

## API 配置

### 必需
- `SCRAPECREATORS_API_KEY` - 从 https://scrapecreators.com 获取

### 可选
- `OPENAI_API_KEY` - 用于 AI 摘要生成
- `XAI_API_KEY` - 访问 X 平台数据
- `REDDIT_CLIENT_ID` - Reddit API
- `REDDIT_CLIENT_SECRET` - Reddit API

## HundunOS 集成

在 HundunOS 中使用:

```javascript
// 通过 Skills 系统调用
const result = await skillExecutor.execute('research', {
  topic: 'AI Agent',
  platforms: ['reddit', 'hn', 'youtube'],
  timeRange: '30d'
});
```

## 速率限制

- Reddit: 60 requests/minute
- X: 根据 API 套餐
- YouTube: 配额限制

缓存策略: 热门话题缓存 1-2 小时