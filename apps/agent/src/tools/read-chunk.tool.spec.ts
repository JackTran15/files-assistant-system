import { AgentProcessingError } from '@files-assistant/core';
import { readChunkTool, setChunkReader } from './read-chunk.tool';

describe('readChunkTool', () => {
  afterEach(() => {
    setChunkReader(null as never);
  });

  it('throws when reader is not configured', async () => {
    setChunkReader(null as never);

    await expect(
      readChunkTool.execute!({
        fileId: 'f-1',
        tenantId: 'tenant-1',
        chunkIndex: 0,
      }),
    ).rejects.toBeInstanceOf(AgentProcessingError);
  });

  it('returns exact chunk payload with authoritative _sourceChunks', async () => {
    setChunkReader({
      getChunk: jest.fn().mockResolvedValue({
        fileId: 'f-1',
        fileName: 'doc.md',
        chunkIndex: 3,
        content: 'Exact full chunk content',
        score: 0,
        metadata: { pageNumber: 2 },
      }),
    });

    const result = await readChunkTool.execute!({
      fileId: 'f-1',
      tenantId: 'tenant-1',
      chunkIndex: 3,
    });

    expect(result).toEqual({
      fileId: 'f-1',
      fileName: 'doc.md',
      chunkIndex: 3,
      content: 'Exact full chunk content',
      _sourceChunks: [
        {
          fileId: 'f-1',
          fileName: 'doc.md',
          chunkIndex: 3,
          content: 'Exact full chunk content',
          score: 1,
          metadata: { pageNumber: 2 },
        },
      ],
    });
  });
});
