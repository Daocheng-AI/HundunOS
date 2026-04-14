// hundunos/kernel/providers/provider-compat.js — 多 Provider 兼容层 v1.0
// 借鉴 Claude Code OpenAI/Gemini 兼容层设计
// 参考: claude-code-best/src/services/api/openai/, src/services/api/gemini/
//
// 支持：
//   - OpenAI Chat Completions API 兼容
//   - Google Gemini API 兼容
//   - Anthropic 官方 API（原有）
//   - 自动 Provider 检测与路由

import { feature } from '../feature-flags.js';

/**
 * Provider 类型
 */
export const ProviderType = {
  ANTHROPIC: 'anthropic',
  OPENAI: 'openai',
  GEMINI: 'gemini',
  OLLAMA: 'ollama',     // OpenAI 兼容
  VERTEX: 'vertex',
  BEDROCK: 'bedrock',
};

/**
 * 统一 API 响应格式（Anthropic 格式）
 */
export class UnifiedResponse {
  constructor(type = ProviderType.ANTHROPIC) {
    this.type = type;
    this.content = [];
    this.usage = { inputTokens: 0, outputTokens: 0 };
    this.stopReason = 'end_turn';
    this.model = '';
    this.id = '';
  }
}

/**
 * OpenAI → Anthropic 请求转换器
 */
export class OpenAiAdapter {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    this.model = options.model || process.env.OPENAI_MODEL || 'gpt-4o';
    this.timeout = options.timeout || 60000;
  }

  /**
   * 将 Anthropic 格式请求转为 OpenAI 格式
   */
  toOpenAiRequest(anthropicRequest) {
    const { model, messages, maxTokens, system, tools, stream } = anthropicRequest;

    return {
      model: model || this.model,
      messages: this._convertMessages(messages, system),
      max_tokens: maxTokens || 4096,
      tools: tools?.map(t => this._convertTool(t)).filter(Boolean),
      stream: stream ?? true,
      temperature: anthropicRequest.temperature,
      top_p: anthropicRequest.topP,
      stop: anthropicRequest.stopSequences,
    };
  }

  _convertMessages(messages, system) {
    const result = [];
    if (system) {
      result.push({ role: 'system', content: system });
    }
    for (const msg of messages) {
      if (msg.role === 'user') {
        const content = msg.content?.map
          ? msg.content.map(b => b.type === 'text' ? b.text : `[${b.type}]`)
            .join('\n')
          : msg.content || '';
        result.push({ role: 'user', content });
      } else if (msg.role === 'assistant') {
        const content = msg.content?.map
          ? msg.content.map(b => b.type === 'text' ? b.text : `{${b.type}: ${JSON.stringify(b)}}`)
            .join('\n')
          : msg.content || '';
        result.push({ role: 'assistant', content });
      }
    }
    return result;
  }

  _convertTool(tool) {
    if (!tool?.input_schema) return null;
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.input_schema,
      },
    };
  }

  /**
   * 将 OpenAI SSE 流转换为 Anthropic BetaRawMessageStreamEvent
   */
  *fromOpenAiStream(events) {
    for (const event of events) {
      if (event.choices?.[0]?.delta?.content) {
        yield {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: event.choices[0].delta.content },
        };
      } else if (event.choices?.[0]?.finish_reason) {
        yield {
          type: 'message_stop',
          stopReason: event.choices[0].finish_reason,
        };
      } else if (event.usage) {
        yield {
          type: 'message_delta',
          usage: {
            inputTokens: event.usage.prompt_tokens || 0,
            outputTokens: event.usage.completion_tokens || 0,
          },
          delta: { stopReason: event.choices?.[0]?.finish_reason },
        };
      }
    }
  }
}

/**
 * Gemini → Anthropic 请求转换器
 */
export class GeminiAdapter {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.GEMINI_BASE_URL
      || 'https://generativelanguage.googleapis.com/v1beta';
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    this.model = options.model || process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    this.timeout = options.timeout || 60000;
  }

  /**
   * 将 Anthropic 格式转为 Gemini 格式
   */
  toGeminiRequest(anthropicRequest) {
    const { model, messages, maxTokens, system, tools, stream } = anthropicRequest;
    const modelName = (model || this.model).replace('gemini-', 'models/');

    return {
      model: modelName,
      contents: this._convertMessages(messages, system),
      generationConfig: {
        maxOutputTokens: maxTokens || 8192,
        temperature: anthropicRequest.temperature,
        topP: anthropicRequest.topP,
        stopSequences: anthropicRequest.stopSequences,
        responseModalities: ['TEXT'],
      },
      tools: tools?.map(t => this._convertTool(t)).filter(Boolean),
    };
  }

  _convertMessages(messages, system) {
    const contents = [];
    let systemInstruction = system ? [{ parts: [{ text: system }] }] : null;

    for (const msg of messages) {
      if (msg.role === 'user') {
        const text = msg.content?.map
          ? msg.content.map(b => b.type === 'text' ? b.text : `[${b.type}]`).join('\n')
          : msg.content || '';
        contents.push({ role: 'user', parts: [{ text }] });
      } else if (msg.role === 'assistant') {
        const text = msg.content?.map
          ? msg.content.map(b => b.type === 'text' ? b.text : '').join('\n')
          : msg.content || '';
        contents.push({ role: 'model', parts: [{ text }] });
      }
    }

    return { systemInstruction, contents };
  }

  _convertTool(tool) {
    if (!tool?.input_schema) return null;
    return {
      functionDeclarations: [{
        name: tool.name,
        description: tool.description || '',
        parameters: tool.input_schema,
      }],
    };
  }

  /**
   * 从 Gemini 流事件提取 Anthropic 格式
   */
  *fromGeminiStream(events) {
    for (const event of events) {
      if (event.candidates?.[0]?.content?.parts?.[0]?.text) {
        yield {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: event.candidates[0].content.parts[0].text },
        };
      } else if (event.candidates?.[0]?.finishReason) {
        yield { type: 'message_stop', stopReason: event.candidates[0].finishReason };
      } else if (event.usageMetadata) {
        yield {
          type: 'message_delta',
          usage: {
            inputTokens: event.usageMetadata.promptTokenCount || 0,
            outputTokens: event.usageMetadata.candidatesTokenCount || 0,
          },
        };
      }
    }
  }
}

/**
 * UnifiedProvider — 统一 Provider 接口
 * 无论底层是 Anthropic/OpenAI/Gemini，接口一致
 */
export class UnifiedProvider {
  constructor(kernel) {
    this.kernel = kernel;
    this.providers = new Map();
    this.activeProvider = null;
    this._initProviders();
  }

  _initProviders() {
    // FIX-M2: 改为"有 API Key 或显式 feature flag"时注册 provider
    // 避免 feature flag 默认关闭导致 OpenAI/Gemini 永远不可用

    const openaiEnabled = feature('OPENAI_COMPAT') || !!process.env.OPENAI_API_KEY;
    const geminiEnabled = feature('GEMINI_COMPAT') || !!process.env.GEMINI_API_KEY;

    if (openaiEnabled) {
      this.providers.set(ProviderType.OPENAI, new OpenAiAdapter({
        baseUrl: process.env.OPENAI_BASE_URL,
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL,
      }));
    }

    if (geminiEnabled) {
      this.providers.set(ProviderType.GEMINI, new GeminiAdapter({
        baseUrl: process.env.GEMINI_BASE_URL,
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL,
      }));
    }

    // Anthropic 总是可用（作为最终 fallback）
    this.providers.set(ProviderType.ANTHROPIC, {
      type: ProviderType.ANTHROPIC,
      name: 'Anthropic',
    });
  }

  /**
   * 自动选择 Provider（根据模型名）
   */
  selectProvider(model = '') {
    const m = model.toLowerCase();

    if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3')) {
      if (this.providers.has(ProviderType.OPENAI)) {
        return { type: ProviderType.OPENAI, adapter: this.providers.get(ProviderType.OPENAI) };
      }
    }

    if (m.startsWith('gemini')) {
      if (this.providers.has(ProviderType.GEMINI)) {
        return { type: ProviderType.GEMINI, adapter: this.providers.get(ProviderType.GEMINI) };
      }
    }

    // 默认 Anthropic
    return { type: ProviderType.ANTHROPIC, adapter: this.providers.get(ProviderType.ANTHROPIC) };
  }

  /**
   * 获取当前可用 Provider 列表
   * FIX-M2: 修正之前 filter 逻辑恒真（`p !== X || true` 等价于 `true`）
   */
  listProviders() {
    return Array.from(this.providers.keys());
  }
}

export default { UnifiedProvider, OpenAiAdapter, GeminiAdapter, ProviderType };
