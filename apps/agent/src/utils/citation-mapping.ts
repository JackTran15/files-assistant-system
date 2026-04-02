import type { StreamChunkOptions } from '../adapters/grpc-response.adapter';

export interface CitationEvidence {
  evidenceId: string;
  fileId: string;
  fileName: string;
  chunkIndex: number;
  score: number;
  excerpt?: string;
  pageNumber?: number;
  citationContent?: string;
}

export interface CitationClaim {
  claimText: string;
  evidenceIds: string[];
}

export interface CitationMappingResult {
  evidence: CitationEvidence[];
  claims: CitationClaim[];
  warnings?: string[];
}

const COMPLETE_THINKING_RE = /<thinking>[\s\S]*?<\/thinking>\s*/g;
const PARTIAL_THINKING_RE = /<thinking>[\s\S]*$/;
const CITATION_MARKER_RE = /\[(\d+)\]/g;

export function stripThinkingBlocks(text: string): string {
  return text
    .replace(COMPLETE_THINKING_RE, '')
    .replace(PARTIAL_THINKING_RE, '')
    .trim();
}

export function buildEvidence(
  sources: NonNullable<StreamChunkOptions['sources']>,
): CitationEvidence[] {
  return sources.map((s, i) => ({
    evidenceId: `E${i + 1}`,
    fileId: s.fileId,
    fileName: s.fileName,
    chunkIndex: s.chunkIndex,
    score: s.score,
    excerpt: s.excerpt,
    pageNumber: s.pageNumber,
    citationContent: s.citationContent,
  }));
}

export function buildClaimsFromAnswer(
  answer: string,
  evidence: CitationEvidence[],
): CitationClaim[] {
  if (!answer || evidence.length === 0) return [];

  const lines = answer
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const claims: CitationClaim[] = [];

  for (const line of lines) {
    const evidenceIds = [...line.matchAll(CITATION_MARKER_RE)]
      .map((match) => Number.parseInt(match[1], 10))
      .filter((refIndex) => Number.isFinite(refIndex) && refIndex >= 1)
      .map((refIndex) => evidence[refIndex - 1]?.evidenceId)
      .filter((id): id is string => Boolean(id));

    if (evidenceIds.length === 0) continue;

    const claimText = line.replace(CITATION_MARKER_RE, '').trim();
    if (!claimText) continue;
    claims.push({
      claimText,
      evidenceIds: Array.from(new Set(evidenceIds)),
    });
  }

  return claims;
}

export function validateAndRepairCitationMapping(
  claims: CitationClaim[],
  evidence: CitationEvidence[],
): CitationMappingResult {
  const validEvidence = new Set(evidence.map((e) => e.evidenceId));
  const warnings: string[] = [];
  const repairedClaims: CitationClaim[] = [];

  for (const claim of claims) {
    const repairedIds = claim.evidenceIds.filter((id) => validEvidence.has(id));
    if (repairedIds.length === 0) {
      warnings.push(`Dropped claim with no valid evidence: "${claim.claimText}"`);
      continue;
    }

    repairedClaims.push({
      claimText: claim.claimText,
      evidenceIds: Array.from(new Set(repairedIds)),
    });
  }

  return {
    evidence,
    claims: repairedClaims,
    warnings: warnings.length ? warnings : undefined,
  };
}
