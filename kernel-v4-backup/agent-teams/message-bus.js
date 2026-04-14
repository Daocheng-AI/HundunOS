/**
 * HundunOS v4.3 - MessageBus 团队消息总线
 * 参考 learn-claude-code s15 Agent Teams
 * 支持团队间结构化消息传递
 */

import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, rmSync } from 'fs';
import { join } from 'path';

/**
 * 消息类型
 * v4.3: 参考 learn-claude-code s16
 */
export const VALID_MSG_TYPES = [
  'message',
  'broadcast',
  'shutdown_request',
  'shutdown_response',
  'plan_approval_request',
  'plan_approval_response',
];

/**
 * MessageBus - 团队消息总线
 * v4.3: 参考 learn-claude-code s15
 */
export class MessageBus {
  constructor(kernel, options = {}) {
    this.kernel = kernel;
    this.inboxDir = join(kernel?.config?.storageDir || '.hundunos', 'teams', 'inbox');
    mkdirSync(this.inboxDir, { recursive: true });
  }

  /**
   * 发送消息
   * @param {string} sender - 发送者名称
   * @param {string} to - 接收者名称
   * @param {string} content - 消息内容
   * @param {string} msgType - 消息类型
   * @param {Object} extra - 额外信息
   @returns {string} 发送结果
   */
  send(sender, to, content, msgType = 'message', extra = {}) {
    if (!VALID_MSG_TYPES.includes(msgType)) {
      return `Error: Invalid message type '${msgType}'. Valid types: ${VALID_MSG_TYPES.join(', ')}`;
    }

    const msg = {
      id: randomUUID(),
      type: msgType,
      from: sender,
      to,
      content,
      timestamp: Date.now(),
      ...extra,
    };

    const inboxPath = join(this.inboxDir, `${to}.jsonl`);
    appendFileSync(inboxPath, JSON.stringify(msg) + '\n', 'utf8');

    return `Sent ${msgType} to ${to}`;
  }

  /**
   * 读取收件箱
   * @param {string} name - 收件人名称
   * @returns {Array} 消息列表
   */
  readInbox(name) {
    const inboxPath = join(this.inboxDir, `${name}.jsonl`);
    if (!existsSync(inboxPath)) {
      return [];
    }

    const messages = [];
    const lines = readFileSync(inboxPath, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      if (line) {
        try {
          messages.push(JSON.parse(line));
        } catch (e) {
          console.warn('[MessageBus] Failed to parse message:', line);
        }
      }
    }

    // 清空收件箱
    writeFileSync(inboxPath, '', 'utf8');

    return messages;
  }

  /**
   * 广播消息
   * @param {string} sender - 发送者名称
   * @param {string} content - 消息内容
   * @param {Array} teammates - 团队成员列表
   * @returns {string} 发送结果
   */
  broadcast(sender, content, teammates) {
    let count = 0;
    for (const name of teammates) {
      if (name !== sender) {
        this.send(sender, name, content, 'broadcast');
        count++;
      }
    }
    return `Broadcast to ${count} teammates`;
  }
}
