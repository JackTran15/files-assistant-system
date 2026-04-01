import { SourceCollector, createCollectorHooks } from './source-collector';

describe('SourceCollector', () => {
  let collector: SourceCollector;

  beforeEach(() => {
    collector = new SourceCollector();
  });

  it('should collect search results from tool output', () => {
    collector.collect({
      results: [
        {
          fileId: 'f1',
          fileName: 'doc.pdf',
          chunkIndex: 0,
          content: 'chunk text',
          score: 0.9,
          metadata: {},
        },
      ],
      query: 'test',
    });

    expect(collector.size).toBe(1);
    const sources = collector.toStreamSources();
    expect(sources).toHaveLength(1);
    expect(sources![0]).toEqual(
      expect.objectContaining({
        fileId: 'f1',
        fileName: 'doc.pdf',
        chunkIndex: 0,
        score: 0.9,
      }),
    );
  });

  it('should deduplicate by fileId:chunkIndex keeping highest score', () => {
    collector.collect({
      results: [
        {
          fileId: 'f1',
          fileName: 'doc.pdf',
          chunkIndex: 0,
          content: 'text',
          score: 0.5,
          metadata: {},
        },
        {
          fileId: 'f1',
          fileName: 'doc.pdf',
          chunkIndex: 0,
          content: 'text',
          score: 0.9,
          metadata: {},
        },
      ],
      query: 'test',
    });

    const sources = collector.toStreamSources();
    expect(sources).toHaveLength(1);
    expect(sources![0].score).toBe(0.9);
  });

  it('should sort results by score descending', () => {
    collector.collect({
      results: [
        {
          fileId: 'f1',
          fileName: 'a.pdf',
          chunkIndex: 0,
          content: 'text',
          score: 0.6,
          metadata: {},
        },
        {
          fileId: 'f2',
          fileName: 'b.pdf',
          chunkIndex: 0,
          content: 'text',
          score: 0.9,
          metadata: {},
        },
      ],
      query: 'test',
    });

    const sources = collector.toStreamSources();
    expect(sources).toHaveLength(2);
    expect(sources![0].fileId).toBe('f2');
    expect(sources![1].fileId).toBe('f1');
  });

  it('should filter out sources with score below 50%', () => {
    collector.collect({
      results: [
        {
          fileId: 'f1',
          fileName: 'good.pdf',
          chunkIndex: 0,
          content: 'text',
          score: 0.7,
          metadata: {},
        },
        {
          fileId: 'f2',
          fileName: 'weak.pdf',
          chunkIndex: 0,
          content: 'text',
          score: 0.3,
          metadata: {},
        },
        {
          fileId: 'f3',
          fileName: 'borderline.pdf',
          chunkIndex: 0,
          content: 'text',
          score: 0.5,
          metadata: {},
        },
      ],
      query: 'test',
    });

    const sources = collector.toStreamSources();
    expect(sources).toHaveLength(2);
    expect(sources!.map((s) => s.fileId)).toEqual(['f1', 'f3']);
  });

  it('should truncate long excerpts', () => {
    const longContent = 'a'.repeat(300);
    collector.collect({
      results: [
        {
          fileId: 'f1',
          fileName: 'doc.pdf',
          chunkIndex: 0,
          content: longContent,
          score: 0.9,
          metadata: {},
        },
      ],
      query: 'test',
    });

    const sources = collector.toStreamSources();
    expect(sources![0].excerpt!.length).toBeLessThanOrEqual(201);
    expect(sources![0].excerpt!.endsWith('…')).toBe(true);
  });

  it('should extract pageNumber from metadata', () => {
    collector.collect({
      results: [
        {
          fileId: 'f1',
          fileName: 'doc.pdf',
          chunkIndex: 0,
          content: 'text',
          score: 0.9,
          metadata: { pageNumber: 5 },
        },
      ],
      query: 'test',
    });

    const sources = collector.toStreamSources();
    expect(sources![0].pageNumber).toBe(5);
  });

  it('should ignore invalid output', () => {
    collector.collect(null);
    collector.collect(undefined);
    collector.collect('not an object');
    collector.collect({ results: 'not array' });
    collector.collect({ results: [{ invalid: true }] });

    expect(collector.size).toBe(0);
    expect(collector.toStreamSources()).toEqual([]);
  });

  it('should accumulate results across multiple collect calls', () => {
    collector.collect({
      results: [
        {
          fileId: 'f1',
          fileName: 'a.pdf',
          chunkIndex: 0,
          content: 'text',
          score: 0.9,
          metadata: {},
        },
      ],
      query: 'q1',
    });
    collector.collect({
      results: [
        {
          fileId: 'f2',
          fileName: 'b.pdf',
          chunkIndex: 0,
          content: 'text',
          score: 0.8,
          metadata: {},
        },
      ],
      query: 'q2',
    });

    expect(collector.size).toBe(2);
    expect(collector.toStreamSources()).toHaveLength(2);
  });
});

describe('createCollectorHooks', () => {
  it('should collect from searchFiles tool end events', () => {
    const collector = new SourceCollector();
    const hooks = createCollectorHooks(collector);

    hooks.onToolEnd!({
      agent: {} as never,
      tool: { name: 'searchFiles' } as never,
      output: {
        results: [
          {
            fileId: 'f1',
            fileName: 'doc.pdf',
            chunkIndex: 0,
            content: 'text',
            score: 0.9,
            metadata: {},
          },
        ],
      },
      error: undefined,
      context: {} as never,
    });

    expect(collector.size).toBe(1);
  });

  it('should not collect from non-searchFiles tools', () => {
    const collector = new SourceCollector();
    const hooks = createCollectorHooks(collector);

    hooks.onToolEnd!({
      agent: {} as never,
      tool: { name: 'readFile' } as never,
      output: {
        results: [
          {
            fileId: 'f1',
            fileName: 'doc.pdf',
            chunkIndex: 0,
            content: 'text',
            score: 0.9,
            metadata: {},
          },
        ],
      },
      error: undefined,
      context: {} as never,
    });

    expect(collector.size).toBe(0);
  });

  it('should not collect on error', () => {
    const collector = new SourceCollector();
    const hooks = createCollectorHooks(collector);

    hooks.onToolEnd!({
      agent: {} as never,
      tool: { name: 'searchFiles' } as never,
      output: undefined,
      error: new Error('fail') as never,
      context: {} as never,
    });

    expect(collector.size).toBe(0);
  });

  it('should preserve existing hooks', () => {
    const collector = new SourceCollector();
    const startSpy = jest.fn();
    const errorSpy = jest.fn();
    const hooks = createCollectorHooks(collector, {
      onToolStart: startSpy,
      onToolError: errorSpy,
    });

    expect(hooks.onToolStart).toBe(startSpy);
    expect(hooks.onToolError).toBe(errorSpy);
  });
});
