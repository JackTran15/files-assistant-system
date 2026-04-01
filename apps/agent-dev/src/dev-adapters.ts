import {
  SearchResult,
  EmbeddingResult,
  SearchPort,
  EmbeddingPort,
  ChunkMetadata,
} from '@files-assistant/core';

export class StubSearchAdapter implements SearchPort {
  async hybridSearch(
    query: string,
    _tenantId: string,
    limit = 5,
  ): Promise<SearchResult[]> {
    return [
      {
        fileId: 'stub-file-1',
        fileName: 'quarterly-report-q4.pdf',
        chunkIndex: 0,
        content: `Revenue increased by 15% year-over-year, driven primarily by expansion in the enterprise segment. The total revenue for Q4 reached $2.3M. Query: "${query}"`,
        score: 0.95,
        metadata: { startOffset: 0, endOffset: 150 },
      },
      {
        fileId: 'stub-file-1',
        fileName: 'quarterly-report-q4.pdf',
        chunkIndex: 1,
        content:
          'Operating expenses were reduced by 8% through automation initiatives and vendor consolidation efforts across all departments.',
        score: 0.87,
        metadata: { startOffset: 150, endOffset: 280 },
      },
      {
        fileId: 'stub-file-2',
        fileName: 'market-analysis.docx',
        chunkIndex: 0,
        content:
          'The addressable market is projected to grow at a 12% CAGR through 2027, with significant opportunities in the SMB segment.',
        score: 0.82,
        metadata: { startOffset: 0, endOffset: 130 },
      },
    ].slice(0, limit);
  }

  async keywordSearch(
    query: string,
    _tenantId: string,
    limit = 5,
  ): Promise<SearchResult[]> {
    return [
      {
        fileId: 'stub-file-1',
        fileName: 'quarterly-report-q4.pdf',
        chunkIndex: 0,
        content: `Exact match result for keyword: "${query}". This section discusses the financial performance metrics.`,
        score: 1.0,
        metadata: { startOffset: 0, endOffset: 100 },
      },
    ].slice(0, limit);
  }
}

export class StubEmbeddingAdapter implements EmbeddingPort {
  async embedAndStore(
    chunks: string[],
    _metadata: ChunkMetadata[],
    _tenantId: string,
  ): Promise<EmbeddingResult> {
    return {
      vectorsStored: chunks.length,
      collectionName: 'StubCollection',
    };
  }

  async deleteByFileId(_fileId: string, _tenantId: string): Promise<void> {
    // no-op in stub
  }
}
