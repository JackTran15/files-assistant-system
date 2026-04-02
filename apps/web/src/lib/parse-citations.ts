import type {
  MessagePart,
  ChatResponseSource,
  ChatResponseClaim,
  ChatResponseEvidence,
} from '@/types/chat.types';
import { cleanAssistantContent } from './clean-content';

const CITATION_RE = /\[(\d+)\]/g;

export function deriveClaimsFromText(
  content: string,
  evidence?: ChatResponseEvidence[],
): ChatResponseClaim[] {
  if (!evidence?.length) return [];
  const cleaned = cleanAssistantContent(content);
  const lines = cleaned.split('\n').map((l) => l.trim()).filter(Boolean);
  const claims: ChatResponseClaim[] = [];

  for (const line of lines) {
    const evidenceIds = [...line.matchAll(CITATION_RE)]
      .map((m) => Number.parseInt(m[1], 10))
      .filter((n) => Number.isFinite(n) && n >= 1)
      .map((n) => evidence[n - 1]?.evidenceId)
      .filter((id): id is string => Boolean(id));
    if (!evidenceIds.length) continue;
    const claimText = line.replace(CITATION_RE, '').trim();
    if (!claimText) continue;
    claims.push({
      claimText,
      evidenceIds: Array.from(new Set(evidenceIds)),
    });
  }

  return claims;
}

export function buildMessageParts(
  content: string,
  sources?: ChatResponseSource[],
  claims?: ChatResponseClaim[],
  evidence?: ChatResponseEvidence[],
): MessagePart[] {
  const cleaned = cleanAssistantContent(content);
  if (claims?.length && evidence?.length) {
    const sourceByEvidence = new Map<string, number>(
      evidence.map((e, i) => [e.evidenceId, i + 1]),
    );
    const parts: MessagePart[] = [];
    let cursor = 0;

    for (const claim of claims) {
      const claimIndex = cleaned.indexOf(claim.claimText, cursor);
      if (claimIndex === -1) continue;

      if (claimIndex > cursor) {
        parts.push({ type: 'text', content: cleaned.slice(cursor, claimIndex) });
      }
      parts.push({ type: 'text', content: claim.claimText });

      for (const evidenceId of claim.evidenceIds) {
        const refIndex = sourceByEvidence.get(evidenceId);
        if (!refIndex) continue;
        const source = sources?.[refIndex - 1];
        parts.push({
          type: 'citation-ref',
          refIndex,
          sourceId: source ? `${source.fileId}:${source.chunkIndex}` : undefined,
        });
      }
      cursor = claimIndex + claim.claimText.length;
    }

    if (cursor < cleaned.length) {
      parts.push({ type: 'text', content: cleaned.slice(cursor) });
    }
    if (parts.length) return parts;
  }

  if (!sources?.length) return [{ type: 'text', content: cleaned }];

  const parts: MessagePart[] = [];
  let lastIndex = 0;

  for (const match of cleaned.matchAll(CITATION_RE)) {
    const refIndex = parseInt(match[1], 10);
    if (refIndex < 1 || refIndex > sources.length) continue;

    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: cleaned.slice(lastIndex, match.index) });
    }

    parts.push({
      type: 'citation-ref',
      refIndex,
      sourceId: `${sources[refIndex - 1].fileId}:${sources[refIndex - 1].chunkIndex}`,
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < cleaned.length) {
    parts.push({ type: 'text', content: cleaned.slice(lastIndex) });
  }

  return parts.length ? parts : [{ type: 'text', content: cleaned }];
}
