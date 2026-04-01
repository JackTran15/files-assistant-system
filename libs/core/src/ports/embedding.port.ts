export interface EmbeddingPort {
  /** Embed document texts for indexing. Voyage uses input_type 'document'. */
  embedDocuments(texts: string[]): Promise<number[][]>;

  /** Embed a search query. Voyage uses input_type 'query'. */
  embedQuery(text: string): Promise<number[]>;
}

export const EMBEDDING_PORT = Symbol('EMBEDDING_PORT');
