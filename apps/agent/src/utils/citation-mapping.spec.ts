import {
  buildClaimsFromAnswer,
  buildEvidence,
  stripThinkingBlocks,
  validateAndRepairCitationMapping,
} from './citation-mapping';

describe('citation-mapping', () => {
  it('builds evidence ids in source order', () => {
    const evidence = buildEvidence([
      {
        fileId: 'f1',
        fileName: 'a.md',
        chunkIndex: 1,
        score: 0.9,
      },
      {
        fileId: 'f2',
        fileName: 'b.md',
        chunkIndex: 2,
        score: 0.8,
      },
    ]);
    expect(evidence.map((e) => e.evidenceId)).toEqual(['E1', 'E2']);
  });

  it('builds claims from citation markers', () => {
    const evidence = buildEvidence([
      {
        fileId: 'f1',
        fileName: 'a.md',
        chunkIndex: 1,
        score: 0.9,
      },
    ]);

    const claims = buildClaimsFromAnswer('Did X [1]\nAnother line', evidence);
    expect(claims).toEqual([{ claimText: 'Did X', evidenceIds: ['E1'] }]);
  });

  it('repairs claims by dropping invalid evidence ids', () => {
    const evidence = buildEvidence([
      {
        fileId: 'f1',
        fileName: 'a.md',
        chunkIndex: 1,
        score: 0.9,
      },
    ]);
    const result = validateAndRepairCitationMapping(
      [{ claimText: 'test', evidenceIds: ['E1', 'E999'] }],
      evidence,
    );
    expect(result.claims[0].evidenceIds).toEqual(['E1']);
  });

  it('strips thinking blocks', () => {
    const cleaned = stripThinkingBlocks('<thinking>hidden</thinking>Answer [1]');
    expect(cleaned).toBe('Answer [1]');
  });
});
