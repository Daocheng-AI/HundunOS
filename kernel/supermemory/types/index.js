/**
 * Supermemory 集成核心类型定义
 *
 * 本文件定义了 Supermemory 集成所需的所有核心类型接口。
 */

/**
 * 用户画像 - 包含静态特征和动态上下文
 * @typedef {Object} UserProfile
 * @property {string[]} static - 静态特征（长期偏好），如 ["用户偏好 TypeScript", "用户使用 Vim"]
 * @property {string[]} dynamic - 动态上下文（最近活动），如 ["正在处理认证迁移", "正在调试速率限制"]
 * @property {string} containerTag - 容器标签
 * @property {number} lastUpdated - 最后更新时间（时间戳）
 * @property {string} version - 版本号
 */

/**
 * 事实信息 - 从对话中提取的结构化事实
 * @typedef {Object} Fact
 * @property {'preference'|'project'|'goal'|'fact'} type - 事实类型
 * @property {string} value - 事实值
 * @property {number} confidence - 置信度（0-1）
 * @property {number} extractedAt - 提取时间（时间戳）
 */

/**
 * 矛盾记录 - 记忆冲突信息
 * @typedef {Object} Contradiction
 * @property {string} oldMemoryId - 旧记忆 ID
 * @property {string} newMemoryId - 新记忆 ID
 * @property {boolean} resolved - 是否已解决
 * @property {number} [resolvedAt] - 解决时间（时间戳）
 */

/**
 * 记忆元数据
 * @typedef {Object} MemoryMetadata
 * @property {'user'|'system'|'import'} source - 来源
 * @property {string[]} [tags] - 标签
 * @property {number} [importance] - 重要性（0-1）
 * @property {string[]} [relatedDocuments] - 相关文档
 */

/**
 * 记忆对象
 * @typedef {Object} Memory
 * @property {string} id - 记忆 ID
 * @property {string} content - 记忆内容
 * @property {string} containerTag - 容器标签
 * @property {number} createdAt - 创建时间（时间戳）
 * @property {number} updatedAt - 更新时间（时间戳）
 * @property {number} [expiresAt] - 过期时间（时间戳，用于临时事实）
 * @property {Fact[]} [facts] - 提取的事实
 * @property {Contradiction[]} [contradictions] - 矛盾记录
 * @property {number} accessCount - 访问次数
 * @property {number} lastAccessedAt - 最后访问时间（时间戳）
 * @property {MemoryMetadata} metadata - 元数据
 */

/**
 * 搜索过滤器
 * @typedef {Object} SearchFilter
 * @property {{start: number, end: number}} [dateRange] - 日期范围
 * @property {string[]} [tags] - 标签过滤
 * @property {{min: number}} [importance] - 重要性过滤
 */

/**
 * 搜索查询
 * @typedef {Object} SearchQuery
 * @property {string} query - 查询字符串
 * @property {string} containerTag - 容器标签
 * @property {'hybrid'|'memories'|'documents'} searchMode - 搜索模式
 * @property {number} [limit] - 结果数量限制
 * @property {boolean} [includeFullDocs] - 是否包含完整文档
 * @property {SearchFilter} [filters] - 过滤器
 */

/**
 * 记忆结果
 * @typedef {Object} MemoryResult
 * @property {Memory} memory - 记忆对象
 * @property {number} relevanceScore - 相关性评分
 * @property {string} [snippet] - 摘要片段
 */

/**
 * 文档结果
 * @typedef {Object} DocumentResult
 * @property {string} id - 文档 ID
 * @property {string} title - 标题
 * @property {string} content - 内容
 * @property {Object} metadata - 元数据
 * @property {string} [metadata.filePath] - 文件路径
 * @property {number} [metadata.modifiedAt] - 修改时间（时间戳）
 * @property {string} [metadata.fileType] - 文件类型
 * @property {number} relevanceScore - 相关性评分
 */

/**
 * 搜索结果
 * @typedef {Object} SearchResult
 * @property {MemoryResult[]} memories - 记忆结果
 * @property {DocumentResult[]} documents - 文档结果（RAG）
 * @property {UserProfile} [profile] - 用户画像
 * @property {string} query - 查询字符串
 * @property {number} totalResults - 总结果数
 * @property {number} searchTime - 搜索耗时（毫秒）
 */

/**
 * 缓存配置
 * @typedef {Object} CacheConfig
 * @property {boolean} enabled - 是否启用缓存
 * @property {number} ttl - 缓存过期时间（毫秒，默认 600000ms = 10分钟）
 * @property {number} maxSize - 最大缓存条目数（默认 1000）
 * @property {boolean} persistent - 是否持久化到 SQLite
 */

/**
 * 重试配置
 * @typedef {Object} RetryConfig
 * @property {number} maxAttempts - 最大重试次数（默认 3）
 * @property {number} delay - 初始延迟（毫秒，默认 1000）
 * @property {number} backoffMultiplier - 退避倍数（默认 2）
 */

/**
 * 超时配置
 * @typedef {Object} TimeoutConfig
 * @property {number} connect - 连接超时（毫秒，默认 5000）
 * @property {number} read - 读取超时（毫秒，默认 5000）
 */

/**
 * 批量操作配置
 * @typedef {Object} BatchConfig
 * @property {boolean} enabled - 是否启用批量操作
 * @property {number} maxBatchSize - 每批最大数量（默认 100）
 * @property {number} maxConcurrentBatches - 最大并发批数（默认 5）
 */

/**
 * 同步配置
 * @typedef {Object} SyncConfig
 * @property {boolean} enabled - 是否启用同步
 * @property {number} interval - 同步间隔（毫秒，默认 3600000ms = 1小时）
 * @property {boolean} autoResolveConflicts - 是否自动解决冲突
 */

/**
 * 自动保存配置
 * @typedef {Object} AutoSaveConfig
 * @property {boolean} enabled - 是否启用自动保存
 * @property {'always'|'smart'} mode - 保存模式（smart: 仅保存包含事实的消息）
 */

/**
 * 离线模式配置
 * @typedef {Object} OfflineConfig
 * @property {boolean} enabled - 是否启用离线模式
 * @property {boolean} autoReconnect - 是否自动重连
 * @property {number} reconnectInterval - 重连间隔（毫秒，默认 30000）
 */

/**
 * 监控配置
 * @typedef {Object} MonitoringConfig
 * @property {boolean} enabled - 是否启用监控
 * @property {'debug'|'info'|'warn'|'error'} logLevel - 日志级别
 * @property {Object} alertThreshold - 告警阈值
 * @property {number} alertThreshold.errorRate - 错误率阈值（默认 0.1 = 10%）
 * @property {number} alertThreshold.responseTime - 响应时间阈值（默认 5000ms）
 */

/**
 * Supermemory 配置
 * @typedef {Object} SupermemoryConfig
 * @property {string} apiKey - API 密钥
 * @property {string} [baseUrl] - API 基础 URL（默认 https://api.supermemory.ai/v3）
 * @property {string} apiVersion - API 版本（默认 v3）
 * @property {'user'|'project'|'custom'} containerTagStrategy - 容器标签策略
 * @property {string} [customContainerTag] - 自定义容器标签
 * @property {CacheConfig} cache - 缓存配置
 * @property {RetryConfig} retry - 重试配置
 * @property {TimeoutConfig} timeout - 超时配置
 * @property {BatchConfig} batch - 批量操作配置
 * @property {SyncConfig} sync - 同步配置
 * @property {AutoSaveConfig} autoSave - 自动保存配置
 * @property {OfflineConfig} offline - 离线模式配置
 * @property {MonitoringConfig} monitoring - 监控配置
 */

/**
 * 健康状态
 * @typedef {Object} HealthStatus
 * @property {boolean} healthy - 是否健康
 * @property {'ok'|'degraded'|'unhealthy'|'not_initialized'} status - 状态
 * @property {string} [error] - 错误信息
 * @property {number} timestamp - 时间戳
 */

/**
 * 批量结果
 * @typedef {Object} BatchResult
 * @property {number} successCount - 成功数量
 * @property {number} failCount - 失败数量
 * @property {Array<{error: string, data: any}>} errors - 错误列表
 */

/**
 * 批量搜索结果
 * @typedef {Object} BatchSearchResult
 * @property {SearchResult[]} results - 搜索结果列表
 * @property {number} totalResults - 总结果数
 */

/**
 * 同步状态
 * @typedef {Object} SyncStatus
 * @property {number} lastSyncTime - 最后同步时间（时间戳）
 * @property {'success'|'failed'|'in_progress'} syncStatus - 同步状态
 * @property {number} syncedCount - 同步成功数量
 * @property {number} failedCount - 同步失败数量
 * @property {string} [errorMessage] - 错误信息
 */

/**
 * 同步历史
 * @typedef {Object} SyncHistory
 * @property {number} timestamp - 时间戳
 * @property {string} status - 状态
 * @property {number} syncedCount - 同步成功数量
 * @property {number} failedCount - 同步失败数量
 */

/**
 * 冲突对象
 * @typedef {Object} Conflict
 * @property {number} id - 冲突 ID
 * @property {string} localMemoryId - 本地记忆 ID
 * @property {string} cloudMemoryId - 云端记忆 ID
 * @property {'timestamp'|'content'|'metadata'} conflictType - 冲突类型
 * @property {string} localData - 本地数据
 * @property {string} cloudData - 云端数据
 * @property {boolean} resolved - 是否已解决
 * @property {number} [resolvedAt] - 解决时间（时间戳）
 * @property {'local'|'cloud'|'manual'} [resolution] - 解决方案
 * @property {number} createdAt - 创建时间（时间戳）
 */

/**
 * 同步结果
 * @typedef {Object} SyncResult
 * @property {number} syncedCount - 同步成功数量
 * @property {number} failedCount - 同步失败数量
 * @property {number} conflictsCount - 冲突数量
 * @property {number} duration - 耗时（毫秒）
 */

/**
 * 批量进度
 * @typedef {Object} BatchProgress
 * @property {string} taskId - 任务 ID
 * @property {number} total - 总数
 * @property {number} completed - 已完成数
 * @property {number} failed - 失败数
 * @property {'pending'|'in_progress'|'completed'|'cancelled'} status - 状态
 * @property {number} startTime - 开始时间（时间戳）
 * @property {number} [endTime] - 结束时间（时间戳）
 */

/**
 * 缓存统计
 * @typedef {Object} CacheStats
 * @property {number} size - 缓存大小
 * @property {number} hitCount - 命中次数
 * @property {number} missCount - 未命中次数
 * @property {number} hitRate - 命中率（0-1）
 */

/**
 * 缓存条目
 * @typedef {Object} CacheEntry
 * @property {any} value - 缓存值
 * @property {number} createdAt - 创建时间（时间戳）
 * @property {number} expiresAt - 过期时间（时间戳）
 * @property {number} accessCount - 访问次数
 * @property {number} lastAccessedAt - 最后访问时间（时间戳）
 */

/**
 * 错误上下文
 * @typedef {Object} ErrorContext
 * @property {string} operation - 操作名称
 * @property {Object} [metadata] - 元数据
 */

/**
 * 错误结果
 * @typedef {Object} ErrorResult
 * @property {boolean} handled - 是否已处理
 * @property {'retry'|'abort'|'wait'|'fallback'} action - 处理动作
 * @property {number} [waitTime] - 等待时间（毫秒）
 */

/**
 * 重试选项
 * @typedef {Object} RetryOptions
 * @property {number} [maxAttempts] - 最大重试次数
 * @property {number} [delay] - 初始延迟（毫秒）
 * @property {number} [backoffMultiplier] - 退避倍数
 */

/**
 * 批量选项
 * @typedef {Object} BatchOptions
 * @property {number} [maxBatchSize] - 每批最大数量
 * @property {number} [maxConcurrentBatches] - 最大并发批数
 */

/**
 * 记忆选项
 * @typedef {Object} MemoryOptions
 * @property {string} [containerTag] - 容器标签
 * @property {MemoryMetadata} [metadata] - 元数据
 */

/**
 * 搜索选项
 * @typedef {Object} SearchOptions
 * @property {string} [containerTag] - 容器标签
 * @property {'hybrid'|'memories'|'documents'} [searchMode] - 搜索模式
 * @property {number} [limit] - 结果数量限制
 * @property {boolean} [includeFullDocs] - 是否包含完整文档
 * @property {SearchFilter} [filters] - 过滤器
 */

/**
 * 混合搜索选项
 * @typedef {Object} HybridSearchOptions
 * @property {string} [containerTag] - 容器标签
 * @property {number} [limit] - 结果数量限制
 * @property {boolean} [includeFullDocs] - 是否包含完整文档
 * @property {SearchFilter} [filters] - 过滤器
 */

/**
 * 混合搜索结果
 * @typedef {Object} HybridSearchResult
 * @property {MemoryResult[]} memories - 记忆结果
 * @property {DocumentResult[]} documents - 文档结果
 * @property {number} totalResults - 总结果数
 * @property {number} searchTime - 搜索耗时（毫秒）
 */

/**
 * 记忆输入
 * @typedef {Object} MemoryInput
 * @property {string} content - 记忆内容
 * @property {string} [containerTag] - 容器标签
 * @property {MemoryMetadata} [metadata] - 元数据
 */

/**
 * 迁移选项
 * @typedef {Object} MigrationOptions
 * @property {boolean} [dryRun] - 是否试运行（不实际迁移）
 * @property {number} [batchSize] - 批量大小
 * @property {Function} [onProgress] - 进度回调
 */

/**
 * 迁移结果
 * @typedef {Object} MigrationResult
 * @property {number} total - 总数
 * @property {number} migrated - 已迁移数
 * @property {number} failed - 失败数
 * @property {Array<{error: string, data: any}>} errors - 错误列表
 * @property {number} duration - 耗时（毫秒）
 */

/**
 * 解决方案
 * @typedef {'local'|'cloud'|'newest'|'longest'|'manual'} Resolution
 */

/**
 * 相关上下文
 * @typedef {Object} RelevantContext
 * @property {DocumentResult[]} documents - 相关文档
 * @property {MemoryResult[]} memories - 相关记忆
 * @property {UserProfile} userProfile - 用户画像
 * @property {string} combinedContext - 合并的上下文
 */

/**
 * 增强上下文
 * @typedef {Object} EnhancedContext
 * @property {string} systemPrompt - 系统提示词
 * @property {UserProfile} userProfile - 用户画像
 * @property {Memory[]} relevantMemories - 相关记忆
 * @property {Object} [gitContext] - Git 上下文
 * @property {Object} [fileContext] - 文件上下文
 * @property {Object} metadata - 元数据
 * @property {number} metadata.injectedAt - 注入时间（时间戳）
 * @property {boolean} metadata.cacheHit - 是否命中缓存
 * @property {number} metadata.responseTime - 响应时间（毫秒）
 * @property {string} [metadata.error] - 错误信息
 */

/**
 * 上下文选项
 * @typedef {Object} ContextOptions
 * @property {string} [containerTag] - 容器标签
 * @property {string} [query] - 查询字符串
 * @property {number} [maxLength] - 最大长度（token 数）
 */

/**
 * Git 上下文
 * @typedef {Object} GitContext
 * @property {string} branch - 分支名称
 * @property {string} commit - 提交 ID
 * @property {string[]} files - 修改的文件列表
 */

/**
 * 文件上下文
 * @typedef {Object} FileContext
 * @property {string} filePath - 文件路径
 * @property {string} content - 文件内容
 * @property {number} size - 文件大小
 */

module.exports = {
  // 导出类型定义（用于 JSDoc）
  UserProfile,
  Fact,
  Contradiction,
  MemoryMetadata,
  Memory,
  SearchFilter,
  SearchQuery,
  MemoryResult,
  DocumentResult,
  SearchResult,
  CacheConfig,
  RetryConfig,
  TimeoutConfig,
  BatchConfig,
  SyncConfig,
  AutoSaveConfig,
  OfflineConfig,
  MonitoringConfig,
  SupermemoryConfig,
  HealthStatus,
  BatchResult,
  BatchSearchResult,
  SyncStatus,
  SyncHistory,
  Conflict,
  SyncResult,
  BatchProgress,
  CacheStats,
  CacheEntry,
  ErrorContext,
  ErrorResult,
  RetryOptions,
  BatchOptions,
  MemoryOptions,
  SearchOptions,
  HybridSearchOptions,
  HybridSearchResult,
  MemoryInput,
  MigrationOptions,
  MigrationResult,
  Resolution,
  RelevantContext,
  EnhancedContext,
  ContextOptions,
  GitContext,
  FileContext
};
