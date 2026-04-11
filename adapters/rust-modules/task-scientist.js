// adapters/rust-modules/task-scientist.js
// HundunOS Task Scientist Adapter v1.1 (Phase 5 协议修复)
// Rust binary 协议对齐（JSON-RPC over transport）：
//   - Rust 使用 #[serde(tag = "action")]，顶层字段为 "action"
//   - CreateTask: { action: 'CreateTask', task_id, description }
//   - RunBfts:    { action: 'RunBfts', task_id }
//   - GetJournal: { action: 'GetJournal', task_id }
//   - GetStats:   { action: 'GetStats' } 或 { action: 'GetStats', task_id }
//   - GetConfig:  { action: 'GetConfig' }

export class TaskScientistAdapter {
  constructor(transport) {
    this.transport = transport;
  }

  /**
   * 创建 AI 实验任务（BFTS Search Journal）
   * @param {string} task - 任务描述文本（将作为 title）
   * @param {Object} context - 上下文（stages / initial_code 等）
   * @returns {Promise<{task_id: string}>}
   */
  async createTask(task, context = {}) {
    const { v4: uuidv4 } = await import('uuid').catch(() => ({ v4: () => `ts_${Date.now()}_${Math.random().toString(36).slice(2,9)}` }));
    const taskId = context.task_id || uuidv4();

    // Phase 5 修复：严格对齐 Rust TaskDescription 结构
    const description = {
      title:       context.title       || task,
      description: context.description || task,
      stages:      context.stages      || [],
      initial_code: context.initial_code || null,
    };

    // Rust 协议：{ action: 'CreateTask', task_id, description }
    const resp = await this.transport.send('scientist', {
      action: 'CreateTask',
      task_id: taskId,
      description,
    });
    return { task_id: taskId, ...(resp.data ?? resp) };
  }

  /**
   * 运行最佳优先树搜索（BFTS）
   * @param {string} taskId
   * @returns {Promise<TaskJournal>}
   */
  async runBFTS(taskId) {
    const resp = await this.transport.send('scientist', {
      action: 'RunBfts',
      task_id: taskId,
    });
    return resp.data ?? resp;
  }

  /**
   * 获取任务 Journal（含完整树结构）
   * @param {string} taskId
   * @returns {Promise<TaskJournal>}
   */
  async getJournal(taskId) {
    const resp = await this.transport.send('scientist', {
      action: 'GetJournal',
      task_id: taskId,
    });
    return resp.data ?? resp;
  }

  /**
   * 获取任务统计（全局或指定任务）
   * @param {string} [taskId]
   */
  async getStats(taskId) {
    const payload = taskId ? { action: 'GetStats', task_id: taskId } : { action: 'GetStats' };
    const resp = await this.transport.send('scientist', payload);
    return resp.data ?? resp;
  }

  /**
   * 列出所有活跃任务
   */
  async listTasks() {
    const resp = await this.transport.send('scientist', { action: 'ListTasks' });
    return resp.data ?? resp;
  }

  /**
   * 删除指定任务
   * @param {string} taskId
   */
  async deleteTask(taskId) {
    const resp = await this.transport.send('scientist', { action: 'DeleteTask', task_id: taskId });
    return resp.data ?? resp;
  }

  /**
   * 获取配置参数
   */
  async getConfig() {
    const resp = await this.transport.send('scientist', { action: 'GetConfig' });
    return resp.data ?? resp;
  }

  /**
   * 树可视化文本
   * @param {string} taskId
   */
  async visualizeTree(taskId) {
    const resp = await this.transport.send('scientist', { action: 'VisualizeTree', task_id: taskId });
    return resp.data ?? resp;
  }

  /**
   * 便捷方法：创建任务 + 运行 BFTS（全自动）
   * @param {string} task - 任务描述
   * @param {Object} context - 上下文
   * @returns {Promise<{taskId, journal, stats, visualization}>}
   */
  async runTask(task, context = {}) {
    const { task_id: taskId } = await this.createTask(task, context);
    const journal = await this.runBFTS(taskId);
    const stats = await this.getStats(taskId).catch(() => null);
    const visualization = await this.visualizeTree(taskId).catch(() => null);
    return {
      taskId,
      journal,
      stats,
      visualization,
    };
  }
}

export default TaskScientistAdapter;
