import { BasePlugin } from '../../core/BasePlugin.js';
import { randomUUID } from 'crypto';

export class RagPlugin extends BasePlugin {
  #vectorStores = new Map();
  #documentProcessors = new Map();
  #config = null;
  #models = null;
  #db = null;
  #cache = null;

  get name() {
    return 'rag';
  }

  get version() {
    return '2.0.0';
  }

  get dependencies() {
    return ['logger', 'config', 'models', 'db', 'cache'];
  }

  async onInit() {
    this.#config = this.kernel.get('config');
    this.#models = this.kernel.get('models');
    this.#db = this.kernel.get('db');
    this.#cache = this.kernel.get('cache');

    this.#registerDocumentProcessors();
    await this.#initializeVectorStore();

    this.kernel.services.register('rag', () => ({
      indexDocument: this.indexDocument.bind(this),
      search: this.search.bind(this),
      query: this.query.bind(this),
      createCollection: this.createCollection.bind(this),
      deleteCollection: this.deleteCollection.bind(this),
      listCollections: this.listCollections.bind(this)
    }), { singleton: true, lazy: true });

    this.logger.info('RAG Plugin initialized');
  }

  #registerDocumentProcessors() {
    this.#documentProcessors.set('text', new TextProcessor());
    this.#documentProcessors.set('markdown', new MarkdownProcessor());
    this.#documentProcessors.set('code', new CodeProcessor());
  }

  async #initializeVectorStore() {
    const storeType = this.#config.get('rag.vectorStore', 'memory');
    
    if (storeType === 'pgvector') {
      await this.#initPgVectorStore();
    } else {
      this.#vectorStores.set('default', new MemoryVectorStore());
    }
  }

  async #initPgVectorStore() {
    try {
      await this.#db.query(`
        CREATE EXTENSION IF NOT EXISTS vector;
        
        CREATE TABLE IF NOT EXISTS rag_collections (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) UNIQUE NOT NULL,
          dimension INTEGER NOT NULL DEFAULT 1536,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS rag_documents (
          id SERIAL PRIMARY KEY,
          collection_id INTEGER REFERENCES rag_collections(id),
          doc_id VARCHAR(255) NOT NULL,
          content TEXT NOT NULL,
          embedding vector(1536),
          metadata JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(collection_id, doc_id)
        );
        
        CREATE INDEX IF NOT EXISTS idx_rag_documents_embedding 
        ON rag_documents USING ivfflat (embedding vector_cosine_ops);
      `);
      
      this.#vectorStores.set('pgvector', new PgVectorStore(this.#db));
      this.logger.info('PgVector store initialized');
    } catch (err) {
      this.logger.warn('Failed to initialize PgVector, falling back to memory:', err.message);
      this.#vectorStores.set('default', new MemoryVectorStore());
    }
  }

  async createCollection(name, options = {}) {
    const dimension = options.dimension || 1536;
    
    const store = this.#getVectorStore();
    await store.createCollection(name, dimension);
    
    this.logger.info(`Created RAG collection: ${name}`);
    return { name, dimension };
  }

  async deleteCollection(name) {
    const store = this.#getVectorStore();
    await store.deleteCollection(name);
    
    this.logger.info(`Deleted RAG collection: ${name}`);
  }

  listCollections() {
    const store = this.#getVectorStore();
    return store.listCollections();
  }

  async indexDocument(collection, document, options = {}) {
    const docId = document.id || randomUUID();
    const processor = this.#documentProcessors.get(options.format || 'text');
    
    // 分块处理
    const chunks = processor.chunk(document.content, {
      chunkSize: options.chunkSize || 1000,
      overlap: options.overlap || 200
    });

    // 生成嵌入向量
    const embeddings = await this.#models.embed(
      chunks.map(c => c.text),
      { model: options.embeddingModel }
    );

    // 存储到向量数据库
    const store = this.#getVectorStore();
    for (let i = 0; i < chunks.length; i++) {
      await store.addDocument(collection, {
        id: `${docId}_${i}`,
        content: chunks[i].text,
        embedding: embeddings[i],
        metadata: {
          ...document.metadata,
          docId,
          chunkIndex: i,
          totalChunks: chunks.length
        }
      });
    }

    this.logger.info(`Indexed document ${docId} into ${collection} (${chunks.length} chunks)`);
    return { docId, chunks: chunks.length };
  }

  async search(collection, query, options = {}) {
    const limit = options.limit || 5;
    
    // 生成查询向量
    const [queryEmbedding] = await this.#models.embed([query], {
      model: options.embeddingModel
    });

    // 搜索相似文档
    const store = this.#getVectorStore();
    const results = await store.search(collection, queryEmbedding, limit);

    return results.map(r => ({
      content: r.content,
      score: r.score,
      metadata: r.metadata
    }));
  }

  async query(collection, question, options = {}) {
    const cacheKey = `rag:query:${collection}:${this.#hashString(question)}`;
    
    return this.#cache.remember(cacheKey, options.cacheTtl || 300, async () => {
      // 检索相关文档
      const contexts = await this.search(collection, question, {
        limit: options.contextLimit || 5
      });

      if (contexts.length === 0) {
        return {
          answer: 'I could not find relevant information to answer your question.',
          contexts: [],
          sources: []
        };
      }

      // 构建提示
      const contextText = contexts.map((c, i) => 
        `[${i + 1}] ${c.content}`
      ).join('\n\n');

      const prompt = `Based on the following context, answer the question. If the answer cannot be found in the context, say so.

Context:
${contextText}

Question: ${question}

Answer:`;

      // 生成回答
      const response = await this.#models.complete(prompt, {
        model: options.model || 'gpt-3.5-turbo',
        temperature: options.temperature || 0.3,
        maxTokens: options.maxTokens || 500
      });

      return {
        answer: response.content,
        contexts: contexts.map(c => c.content),
        sources: contexts.map(c => c.metadata)
      };
    });
  }

  #getVectorStore() {
    const storeName = this.#config.get('rag.vectorStore', 'default');
    const store = this.#vectorStores.get(storeName) || this.#vectorStores.get('default');
    return store;
  }

  #hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  async onDestroy() {
    for (const store of this.#vectorStores.values()) {
      if (typeof store.close === 'function') {
        await store.close();
      }
    }
    this.#vectorStores.clear();
  }
}

class TextProcessor {
  chunk(text, options = {}) {
    const chunkSize = options.chunkSize || 1000;
    const overlap = options.overlap || 200;
    const chunks = [];

    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push({
        text: text.slice(start, end),
        start,
        end
      });
      start += chunkSize - overlap;
    }

    return chunks;
  }
}

class MarkdownProcessor extends TextProcessor {
  chunk(text, options = {}) {
    // 按标题分割
    const sections = text.split(/(?=^#{1,6}\s)/m);
    const chunks = [];

    for (const section of sections) {
      if (section.trim()) {
        chunks.push(...super.chunk(section, options));
      }
    }

    return chunks;
  }
}

class CodeProcessor extends TextProcessor {
  chunk(text, options = {}) {
    // 尝试按函数/类分割
    const functionRegex = /(?:function|class|const|let|var)\s+\w+\s*\([^)]*\)\s*\{/g;
    const chunks = [];
    let lastIndex = 0;
    let match;

    while ((match = functionRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        chunks.push(...super.chunk(text.slice(lastIndex, match.index), options));
      }
      lastIndex = match.index;
    }

    if (lastIndex < text.length) {
      chunks.push(...super.chunk(text.slice(lastIndex), options));
    }

    return chunks.length > 0 ? chunks : super.chunk(text, options);
  }
}

class MemoryVectorStore {
  #collections = new Map();

  async createCollection(name, dimension) {
    this.#collections.set(name, {
      dimension,
      documents: []
    });
  }

  async deleteCollection(name) {
    this.#collections.delete(name);
  }

  listCollections() {
    return Array.from(this.#collections.keys());
  }

  async addDocument(collection, doc) {
    const coll = this.#collections.get(collection);
    if (!coll) throw new Error(`Collection not found: ${collection}`);
    coll.documents.push(doc);
  }

  async search(collection, queryEmbedding, limit = 5) {
    const coll = this.#collections.get(collection);
    if (!coll) return [];

    const scored = coll.documents.map(doc => ({
      ...doc,
      score: this.#cosineSimilarity(queryEmbedding, doc.embedding)
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  #cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

class PgVectorStore {
  #db = null;

  constructor(db) {
    this.#db = db;
  }

  async createCollection(name, dimension) {
    await this.#db.query(
      'INSERT INTO rag_collections (name, dimension) VALUES (?, ?) ON CONFLICT DO NOTHING',
      [name, dimension]
    );
  }

  async deleteCollection(name) {
    const coll = await this.#db.query(
      'SELECT id FROM rag_collections WHERE name = ?',
      [name]
    );
    
    if (coll.length > 0) {
      await this.#db.query(
        'DELETE FROM rag_documents WHERE collection_id = ?',
        [coll[0].id]
      );
      await this.#db.query(
        'DELETE FROM rag_collections WHERE id = ?',
        [coll[0].id]
      );
    }
  }

  listCollections() {
    return this.#db.query('SELECT name, dimension FROM rag_collections');
  }

  async addDocument(collection, doc) {
    const coll = await this.#db.query(
      'SELECT id FROM rag_collections WHERE name = ?',
      [collection]
    );
    
    if (coll.length === 0) {
      throw new Error(`Collection not found: ${collection}`);
    }

    await this.#db.query(
      `INSERT INTO rag_documents (collection_id, doc_id, content, embedding, metadata)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (collection_id, doc_id) DO UPDATE SET
       content = EXCLUDED.content,
       embedding = EXCLUDED.embedding,
       metadata = EXCLUDED.metadata`,
      [
        coll[0].id,
        doc.id,
        doc.content,
        JSON.stringify(doc.embedding),
        JSON.stringify(doc.metadata)
      ]
    );
  }

  async search(collection, queryEmbedding, limit = 5) {
    const coll = await this.#db.query(
      'SELECT id FROM rag_collections WHERE name = ?',
      [collection]
    );
    
    if (coll.length === 0) return [];

    const results = await this.#db.query(
      `SELECT content, metadata, 
              1 - (embedding <=> ?::vector) as score
       FROM rag_documents
       WHERE collection_id = ?
       ORDER BY embedding <=> ?::vector
       LIMIT ?`,
      [JSON.stringify(queryEmbedding), coll[0].id, JSON.stringify(queryEmbedding), limit]
    );

    return results;
  }
}
