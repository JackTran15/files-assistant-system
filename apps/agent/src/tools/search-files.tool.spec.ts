import type { SearchPort, SearchResult } from '@files-assistant/core';
import { searchFilesTool, setSearchAdapter } from './search-files.tool';

interface SearchFilesToolOutput {
  results: SearchResult[];
  _sourceChunks: SearchResult[];
}

describe('searchFilesTool', () => {
  afterEach(() => {
    setSearchAdapter(null as unknown as SearchPort);
  });

  it('filters low-signal heading-only chunks when better chunks exist', async () => {
    const adapter: SearchPort = {
      search: jest.fn().mockResolvedValue([
        {
          fileId: 'f1',
          fileName: 'resume.md',
          chunkIndex: 0,
          content: 'Experience\n--',
          score: 0.91,
          metadata: {},
        },
        {
          fileId: 'f1',
          fileName: 'resume.md',
          chunkIndex: 1,
          content:
            'Led a team of five engineers to ship a billing workflow that reduced processing time by 28%.',
          score: 0.88,
          metadata: {},
        },
      ] satisfies SearchResult[]),
    };

    setSearchAdapter(adapter);

    const result = (await searchFilesTool.execute!({
      query: 'experience',
      tenantId: 'tenant-1',
      limit: 10,
    })) as SearchFilesToolOutput;

    expect(result.results).toHaveLength(1);
    expect(result.results[0].chunkIndex).toBe(1);
    expect(result._sourceChunks).toHaveLength(1);
    expect(result._sourceChunks[0].chunkIndex).toBe(1);
  });

  it('keeps original results when everything is low-signal', async () => {
    const adapter: SearchPort = {
      search: jest.fn().mockResolvedValue([
        {
          fileId: 'f1',
          fileName: 'resume.md',
          chunkIndex: 0,
          content: 'Experience\n--',
          score: 0.91,
          metadata: {},
        },
      ] satisfies SearchResult[]),
    };

    setSearchAdapter(adapter);

    const result = (await searchFilesTool.execute!({
      query: 'experience',
      tenantId: 'tenant-1',
      limit: 10,
    })) as SearchFilesToolOutput;

    expect(result.results).toHaveLength(1);
    expect(result._sourceChunks).toHaveLength(1);
    expect(result.results[0].chunkIndex).toBe(0);
  });
});
