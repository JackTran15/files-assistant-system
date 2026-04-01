import { RecursiveTextChunker } from './recursive-text.chunker';
import { DEFAULT_CHUNKING_OPTIONS } from './chunker.interface';

describe('RecursiveTextChunker', () => {
  const chunker = new RecursiveTextChunker();

  it('splits markdown at headings so each heading begins a chunk', () => {
    const text = `# First\n\nBody one.\n\n## Second\n\nBody two.`;
    const { chunks, chunkOffsets } = chunker.chunk(text, {
      chunkSize: 4000,
      chunkOverlap: 0,
    });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].trimStart().startsWith('# First')).toBe(true);
    const second = chunks.find((c) => c.includes('## Second'));
    expect(second).toBeDefined();
    expect(second!.trimStart().startsWith('## Second')).toBe(true);
    for (const c of chunkOffsets) {
      expect(text.slice(c.startOffset, c.endOffset)).toBe(c.content);
    }
  });

  it('splits at form-feed page breaks', () => {
    const text = `pageA\fpageB`;
    const { chunks } = chunker.chunk(text, { chunkSize: 4000, chunkOverlap: 0 });
    expect(chunks).toEqual(['pageA', 'pageB']);
  });

  it('splits at horizontal rules --- and ***', () => {
    const a = `intro\n---\noutro`;
    const r1 = chunker.chunk(a, { chunkSize: 4000, chunkOverlap: 0 });
    expect(r1.chunks.length).toBeGreaterThanOrEqual(2);

    const b = `intro\n***\noutro`;
    const r2 = chunker.chunk(b, { chunkSize: 4000, chunkOverlap: 0 });
    expect(r2.chunks.length).toBeGreaterThanOrEqual(2);
  });

  it('uses double-newline splitting for plain text without structural markers', () => {
    const text = `paragraph one\n\nparagraph two\n\nparagraph three`;
    const { chunks } = chunker.chunk(text, {
      chunkSize: 18,
      chunkOverlap: 0,
    });
    expect(chunks.length).toBe(3);
    expect(chunks[0]).toContain('paragraph one');
    expect(chunks[1]).toContain('paragraph two');
  });

  it('keeps a section smaller than chunkSize as a single chunk', () => {
    const text = 'Short section.';
    const { chunks, totalChunks } = chunker.chunk(text);
    expect(totalChunks).toBe(1);
    expect(chunks[0]).toBe('Short section.');
  });

  it('recursively splits a section larger than chunkSize', () => {
    const part = 'word ';
    const text = part.repeat(400);
    expect(text.length).toBeGreaterThan(DEFAULT_CHUNKING_OPTIONS.chunkSize);
    const { chunks } = chunker.chunk(text, { chunkOverlap: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(DEFAULT_CHUNKING_OPTIONS.chunkSize);
    }
  });

  it('applies overlap between adjacent chunks', () => {
    const part = 'x';
    const text = part.repeat(4000);
    const overlap = 200;
    const { chunkOffsets } = chunker.chunk(text, {
      chunkSize: 1500,
      chunkOverlap: overlap,
    });
    expect(chunkOffsets.length).toBeGreaterThan(1);
    for (let i = 1; i < chunkOffsets.length; i++) {
      const prev = chunkOffsets[i - 1];
      const cur = chunkOffsets[i];
      const o = Math.min(overlap, prev.content.length, cur.content.length);
      expect(cur.content.slice(0, o)).toBe(prev.content.slice(-o));
    }
  });

  it('matches chunk content to original text via offsets', () => {
    const text = `Line one\n\nLine two\n\nLine three`;
    const { chunkOffsets } = chunker.chunk(text, { chunkSize: 500, chunkOverlap: 50 });
    for (const c of chunkOffsets) {
      expect(text.slice(c.startOffset, c.endOffset)).toBe(c.content);
    }
  });

  it('filters empty whitespace-only chunks', () => {
    const text = '\n\n   \n\nreal\n\n';
    const { chunks } = chunker.chunk(text, { chunkSize: 4000, chunkOverlap: 0 });
    for (const c of chunks) {
      expect(/\S/.test(c)).toBe(true);
    }
  });

  it('returns one chunk for a single-line document', () => {
    const text = 'onlyone';
    const { chunks, totalChunks } = chunker.chunk(text);
    expect(totalChunks).toBe(1);
    expect(chunks[0]).toBe('onlyone');
  });

  it('detects Section / Chapter numbered headings as boundaries', () => {
    const text = `Section 1\nAlpha\n\nChapter 2\nBeta`;
    const { chunks } = chunker.chunk(text, { chunkSize: 4000, chunkOverlap: 0 });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it('exposes chunkOffsets parallel to chunks', () => {
    const text = 'a\n\nb';
    const r = chunker.chunk(text, { chunkSize: 100, chunkOverlap: 0 });
    expect(r.chunks.length).toBe(r.chunkOffsets.length);
    for (let i = 0; i < r.chunks.length; i++) {
      expect(r.chunks[i]).toBe(r.chunkOffsets[i].content);
    }
  });
});
