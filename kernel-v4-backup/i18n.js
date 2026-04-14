/**
 * HundunOS v4.3 - 国际化支持
 */

const translations = {
  zh: {
    todo: {
      title: '任务清单',
      noPlan: '暂无会话计划',
      completed: '已完成',
      reminder: '<reminder>请刷新您的当前计划，然后继续。</reminder>',
    },
    task: {
      title: '任务',
      status: {
        pending: '待处理',
        in_progress: '进行中',
        completed: '已完成',
        deleted: '已删除',
      },
      owner: '所有者',
      blockedBy: '被阻塞',
      blocks: '阻塞',
      created: '创建时间',
      updated: '更新时间',
    },
    agent: {
      title: '代理',
      status: {
        idle: '空闲',
        working: '工作中',
        waiting: '等待中',
        shutdown: '已关闭',
      },
      stats: {
        tasksCompleted: '已完成任务',
        tasksFailed: '失败任务',
        totalDuration: '总耗时',
      },
    },
    error: {
      title: '错误',
      message: '消息',
      module: '模块',
      timestamp: '时间戳',
    },
    health: {
      title: '健康检查',
      status: {
        healthy: '健康',
        unhealthy: '不健康',
        degraded: '降级',
      },
      checks: '检查项',
      overall: '总体状态',
    },
    metrics: {
      title: '指标',
      toolExecutions: '工具执行次数',
      llmRequests: 'LLM 请求次数',
      compactions: '压缩次数',
      errors: '错误次数',
      activeSessions: '活跃会话',
      pendingTasks: '待处理任务',
      queueDepth: '队列深度',
    },
  },
  en: {
    todo: {
      title: 'Todo List',
      noPlan: 'No session plan yet',
      completed: 'completed',
      reminder: '<reminder>Refresh your current plan before continuing.</reminder>',
    },
    task: {
      title: 'Task',
      status: {
        pending: 'pending',
        in_progress: 'in_progress',
        completed: 'completed',
        deleted: 'deleted',
      },
      owner: 'Owner',
      blockedBy: 'Blocked by',
      blocks: 'Blocks',
      created: 'Created',
      updated: 'Updated',
    },
    agent: {
      title: 'Agent',
      status: {
        idle: 'idle',
        working: 'working',
        waiting: 'waiting',
        shutdown: 'shutdown',
      },
      stats: {
        tasksCompleted: 'Tasks completed',
        tasksFailed: 'Tasks failed',
        totalDuration: 'Total duration',
      },
    },
    error: {
      title: 'Error',
      message: 'Message',
      module: 'Module',
      timestamp: 'Timestamp',
    },
    health: {
      title: 'Health Check',
      status: {
        healthy: 'healthy',
        unhealthy: 'unhealthy',
        degraded: 'degraded',
      },
      checks: 'Checks',
      overall: 'Overall status',
    },
    metrics: {
      title: 'Metrics',
      toolExecutions: 'Tool executions',
      llmRequests: 'LLM requests',
      compactions: 'Compactions',
      errors: 'Errors',
      activeSessions: 'Active sessions',
      pendingTasks: 'Pending tasks',
      queueDepth: 'Queue depth',
    },
  },
};

/**
 * 国际化管理器
 */
export class I18nManager {
  constructor() {
    this.currentLocale = 'zh';
    this.translations = translations;
  }

  /**
   * 设置语言
   */
  setLocale(locale) {
    if (this.translations[locale]) {
      this.currentLocale = locale;
    } else {
      console.warn(`[I18n] Locale not supported: ${locale}`);
    }
  }

  /**
   * 获取当前语言
   */
  getLocale() {
    return this.currentLocale;
  }

  /**
   * 翻译
   */
  t(key, params = {}) {
    const keys = key.split('.');
    let value = this.translations[this.currentLocale];

    for (const k of keys) {
      if (value && value[k]) {
        value = value[k];
      } else {
        // 回退到英文
        value = this.translations.en;
        for (const k2 of keys) {
          if (value && value[k2]) {
            value = value[k2];
          } else {
            return key;
          }
        }
        break;
      }
    }

    if (typeof value === 'string') {
      return value;
    }

    return value;
  }

  /**
   * 格式化 todo
   */
  formatTodo(todo) {
    const t = this.t.bind(this);
    const markers = {
      pending: '[ ]',
      in_progress: '[>]',
      completed: '[x]',
    };

    const lines = [t('todo.title')];
    for (const item of todo.items) {
      const marker = markers[item.status] || '[ ]';
      const line = `${marker} ${item.content}`;
      if (item.status === 'in_progress' && item.activeForm) {
        lines.push(`${line} (${item.activeForm})`);
      } else {
        lines.push(line);
      }
    }

    const completed = todo.items.filter(i => i.status === 'completed').length;
    lines.push(`\n(${completed}/${todo.items.length} ${t('todo.completed')})`);

    return lines.join('\n');
  }

  /**
   * 格式化任务
   */
  formatTask(task) {
    const t = this.t.bind(this);
    const statusIcons = {
      pending: '[ ]',
      in_progress: '[>]',
      completed: '[x]',
      deleted: '[!]',
    };

    const lines = [
      `${t('task.title')} ${task.id}: ${task.subject}`,
      `${t('task.status.${task.status}')}: ${task.description || 'N/A'}`,
      `${t('task.owner')}: ${task.owner || 'N/A'}`,
      `${t('task.blockedBy')}: [${task.blockedBy?.join(', ') || 'none'}]`,
      `${t('task.blocks')}: [${task.blocks?.join(', ') || 'none'}]`,
      `${t('task.created')}: ${new Date(task.createdAt).toISOString()}`,
      `${t('task.updated')}: ${new Date(task.updatedAt).toISOString()}`,
    ];

    return lines.join('\n');
  }

  /**
   * 格式化代理统计
   */
  formatAgentStats(stats) {
    const t = this.t.bind(this);
    return {
      id: stats.id,
      name: stats.name,
      capabilities: stats.capabilities,
      status: t(`agent.status.${stats.status}`),
      currentTask: stats.currentTask,
      stats: {
        [t('agent.stats.tasksCompleted')]: stats.stats.tasksCompleted,
        [t('agent.stats.tasksFailed')]: stats.stats.tasksFailed,
        [t('agent.stats.totalDuration')]: stats.stats.totalDuration,
      },
    };
  }

  /**
   * 格式化健康检查
   */
  formatHealth(health) {
    const t = this.t.bind(this);
    const status = t(`health.status.${health.status}`);

    const checks = {};
    for (const [name, check] of Object.entries(health.checks)) {
      checks[name] = {
        ...check,
        status: check.status ? t(`health.status.${check.status}`) : check.status,
      };
    }

    return {
      [t('health.overall')]: status,
      timestamp: health.timestamp,
      [t('health.checks')]: checks,
    };
  }

  /**
   * 格式化错误统计
   */
  formatErrorStats(stats) {
    const t = this.t.bind(this);
    const recent = stats.recent.map(error => ({
      ...error,
      [t('error.module')]: error.context?.module || 'unknown',
    }));

    return {
      total: stats.total,
      recent,
    };
  }
}

export default I18nManager;
