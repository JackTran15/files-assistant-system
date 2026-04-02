import { SearchResult, SearchPort } from '@files-assistant/core';

export class StubSearchAdapter implements SearchPort {
  async search(
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

  async getFileChunks(
    fileId: string,
    _tenantId: string,
  ): Promise<SearchResult[]> {
    return [
      {
        fileId,
        fileName: 'quarterly-report-q4.pdf',
        chunkIndex: 0,
        content: 'Stub file chunk content for dev mode.',
        score: 0,
        metadata: { startOffset: 0, endOffset: 40 },
      },
    ];
  }

  async getChunk(
    fileId: string,
    _tenantId: string,
    chunkIndex: number,
  ): Promise<SearchResult> {
    return {
      fileId,
      fileName: 'quarterly-report-q4.pdf',
      chunkIndex,
      content: `Stub exact chunk content for index ${chunkIndex}.`,
      score: 1.0,
      metadata: { startOffset: chunkIndex * 40, endOffset: chunkIndex * 40 + 40 },
    };
  }
}
