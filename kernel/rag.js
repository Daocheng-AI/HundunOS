/**
 * HundunOS v4.3 - RAG (Retrieval-Augmented Generation)
 * 实现检索增强生成
 */

import { similarity } from 'ml-distance';

/**
 * RAG 管理器
 */
export class RAGManager {
  constructor(kernel, options = {}) {
    this.kernel = kernel;
    this.options = {
      embeddingModel: options.embeddingModel || 'text-embedding-3-small',
      retrievalTopK: options.retrievalTopK || 5,
      similarityThreshold: options.similarityThreshold || 0.7,
      storageDir: options.storageDir || '.hundunos/rag',
    };
    this.documents = new Map();
  }

  /**
   * 生成嵌入向量
   */
  async generateEmbedding(text) {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: this.options.embeddingModel,
          input: text,
        }),
      });

      const data = await response.json();
      return data.data[0].embedding;
    } catch (e) {
      console.error('[RAG] Generate embedding failed:', e.message);
      throw e;
    }
  }

  /**
   * 添加文档
   */
  async addDocument(id, text, metadata = {}) {
    const embedding = await this.generateEmbedding(text);

    const document = {
      id,
      text,
      embedding,
      metadata,
      createdAt: new Date().toISOString(),
    };

    this.documents.set(id, document);
    await this.kernel.storage.put(`${this.options.storageDir}/${id}.json`, document);

    return document;
  }

  /**
   * 获取文档
   */
  async getDocument(id) {
    if (this.documents.has(id)) {
      return this.documents.get(id);
    }

    const document = await this.kernel.storage.get(`${this.options.storageDir}/${id}.json`);
    if (document) {
      this.documents.set(id, document);
    }
    return document;
  }

  /**
   * 删除文档
   */
  async deleteDocument(id) {
    this.documents.delete(id);
    await this.kernel.storage.del(`${this.options.storageDir}/${id}.json`);
  }

  /**
   * 检索文档
   */
  async retrieve(query) {
    const queryEmbedding = await this.generateEmbedding(query);

    const results = [];
    for (const [id, document] of this.documents) {
      const sim = similarity.cosine(queryEmbedding, document.embedding);
      if (sim >= this.options.similarityThreshold) {
        results.push({ id, document, similarity: sim });
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, this.options.retrievalTopK);
  }

  /**
   * 生成增强提示
   */
  async generateAugmentedPrompt(query, contextWindow = 8000) {
    const retrieved = await this.retrieve(query);

    let context = '';
    let tokensUsed = 0;

    for (const { document } of retrieved) {
      const tokens = document.text.split(' ').length;
      if (tokensUsed + tokens > contextWindow) break;

      context += `\n\n${document.text}`;
      tokensUsed += tokens;
    }

    return {
      prompt: `Context:\n${context}\n\nQuestion: ${query}`,
      retrievedDocs: retrieved.length,
      tokensUsed,
    };
  }

  /**
   * 列出文档
   */
  async listDocuments() {
    const keys = await this.kernel.storage.keys(`${this.options.storageDir}/*.json`);
    const documents = [];
    for (const key of keys) {
      const document = await this.kernel.storage.get(key);
      documents.push(document);
    }
    return documents;
  }
}

export default RAGManager;
