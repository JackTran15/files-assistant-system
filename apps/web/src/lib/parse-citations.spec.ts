import { buildMessageParts } from './parse-citations';
import type { ChatResponseSource } from '@/types/chat.types';

const sources: ChatResponseSource[] = [
  { fileId: 'f1', fileName: 'a.pdf', chunkIndex: 0, score: 0.9 },
  { fileId: 'f2', fileName: 'b.pdf', chunkIndex: 1, score: 0.8 },
  { fileId: 'f3', fileName: 'c.pdf', chunkIndex: 2, score: 0.7 },
];

describe('buildMessageParts', () => {
  it('should return single text part when no sources', () => {
    const parts = buildMessageParts('Hello world');
    expect(parts).toEqual([{ type: 'text', content: 'Hello world' }]);
  });

  it('should return single text part when no citations in content', () => {
    const parts = buildMessageParts('No citations here.', sources);
    expect(parts).toEqual([{ type: 'text', content: 'No citations here.' }]);
  });

  it('should parse inline citation refs', () => {
    const parts = buildMessageParts('Claim A [1] and claim B [2].', sources);

    expect(parts).toEqual([
      { type: 'text', content: 'Claim A ' },
      { type: 'citation-ref', refIndex: 1, sourceId: 'f1:0' },
      { type: 'text', content: ' and claim B ' },
      { type: 'citation-ref', refIndex: 2, sourceId: 'f2:1' },
      { type: 'text', content: '.' },
    ]);
  });

  it('should ignore out-of-range refs', () => {
    const parts = buildMessageParts('Ref [5] is out of range.', sources);
    expect(parts).toEqual([
      { type: 'text', content: 'Ref [5] is out of range.' },
    ]);
  });

  it('should ignore ref [0]', () => {
    const parts = buildMessageParts('Ref [0] is invalid.', sources);
    expect(parts).toEqual([
      { type: 'text', content: 'Ref [0] is invalid.' },
    ]);
  });

  it('should handle multiple refs to same source', () => {
    const parts = buildMessageParts('A [1] B [1]', sources);
    expect(parts.filter((p) => p.type === 'citation-ref')).toHaveLength(2);
    expect(
      parts
        .filter((p) => p.type === 'citation-ref')
        .every((p) => p.type === 'citation-ref' && p.refIndex === 1),
    ).toBe(true);
  });

  it('should handle adjacent refs', () => {
    const parts = buildMessageParts('Both [1][2] apply.', sources);
    expect(parts).toEqual([
      { type: 'text', content: 'Both ' },
      { type: 'citation-ref', refIndex: 1, sourceId: 'f1:0' },
      { type: 'citation-ref', refIndex: 2, sourceId: 'f2:1' },
      { type: 'text', content: ' apply.' },
    ]);
  });

  it('should strip thinking blocks before parsing citations', () => {
    const parts = buildMessageParts(
      '<thinking>internal reasoning</thinking>Answer [1] here.',
      sources,
    );
    expect(parts).toEqual([
      { type: 'text', content: 'Answer ' },
      { type: 'citation-ref', refIndex: 1, sourceId: 'f1:0' },
      { type: 'text', content: ' here.' },
    ]);
  });
});
