/**
 * HundunOS v4.3 - 移动端 SDK TypeScript 类型定义
 */

export interface HundunOSSDKConfig {
  baseUrl?: string;
  apiKey: string;
  deviceId?: string;
  platform: 'ios' | 'android' | 'web' | 'unknown';
}

export interface SessionOptions {
  context?: Record<string, any>;
  systemPrompt?: string;
}

export interface Session {
  sessionId: string;
  createdAt: string;
  context: Record<string, any>;
  systemPrompt: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface StreamChunk {
  delta?: string;
  finishReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class HundunOSSDK {
  constructor(config: HundunOSSDKConfig);

  createSession(options?: SessionOptions): Promise<Session>;
  getSession(): Promise<Session>;
  sendMessage(message: string): Promise<Message>;
  registerPushNotification(token: string): Promise<{ success: boolean }>;
  unregisterPushNotification(): Promise<{ success: boolean }>;
  syncOfflineData(): Promise<{ messages: Message[]; syncedAt: number }>;
  streamMessage(message: string): AsyncGenerator<StreamChunk>;
}
