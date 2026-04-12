/**
 * HundunOS v4.3 - PlanApprovalManager 计划审批管理器
 * 参考 learn-claude-code s16 Team Protocols
 * 实现团队协作的计划审批机制
 */

/**
 * PlanApprovalManager - 计划审批管理器
 * v4.3: 参考 learn-claude-code s16
 */
export class PlanApprovalManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.pendingRequests = new Map(); // requestId -> request
  }

  /**
   * 请求审批
   * @param {string} teammateName - 队友名称
   * @param {Object} plan - 计划内容
   * @returns {string} 请求 ID
   */
  async requestApproval(teammateName, plan) {
    const requestId = `plan_${Date.now()}`;

    const request = {
      id: requestId,
      requester: teammateName,
      plan,
      status: 'pending',
      createdAt: Date.now(),
    };

    this.pendingRequests.set(requestId, request);

    // 发送给 lead
    const messageBus = this.kernel?.agentTeams?.messageBus;
    if (messageBus) {
      messageBus.send(
        teammateName,
        'lead',
        JSON.stringify(plan),
        'plan_approval_request',
        { requestId }
      );
    }

    return requestId;
  }

  /**
   * 响应审批
   * @param {string} requestId - 请求 ID
   * @param {string} decision - 审批决定 ('approve' | 'reject')
   * @param {string} reason - 审批原因
   * @returns {Object} 响应结果
   */
  async respond(requestId, decision, reason = '') {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      throw new Error(`Request not found: ${requestId}`);
    }

    request.status = decision === 'approve' ? 'approved' : 'rejected';
    request.decision = decision;
    request.reason = reason;
    request.respondedAt = Date.now();

    // 通知 requester
    const messageBus = this.kernel?.agentTeams?.messageBus;
    if (messageBus) {
      messageBus.send(
        'lead',
        request.requester,
        reason,
        'plan_approval_response',
        { requestId, decision }
      );
    }

    this.pendingRequests.delete(requestId);

    return {
      requestId,
      status: request.status,
      decision,
      reason,
    };
  }

  /**
   * 获取待审批请求
   * @param {string} teammateName - 队友名称
   * @returns {Array} 待审批请求列表
   */
  getPendingRequests(teammateName = null) {
    const requests = Array.from(this.pendingRequests.values());
    if (teammateName) {
      return requests.filter(r => r.requester === teammateName && r.status === 'pending');
    }
    return requests.filter(r => r.status === 'pending');
  }

  /**
   * 获取请求详情
   * @param {string} requestId - 请求 ID
   * @returns {Object|null} 请求详情
   */
  getRequest(requestId) {
    return this.pendingRequests.get(requestId) || null;
  }

  /**
   * 获取统计
   */
  getStats() {
    const requests = Array.from(this.pendingRequests.values());
    return {
      total: requests.length,
      pending: requests.filter(r => r.status === 'pending').length,
      approved: requests.filter(r => r.status === 'approved').length,
      rejected: requests.filter(r => r.status === 'rejected').length,
    };
  }
}
