import type { MessagePart, ChatResponseSource } from '@/types/chat.types';
import { cleanAssistantContent } from './clean-content';

const CITATION_RE = /\[(\d+)\]/g;

export function buildMessageParts(
  content: string,
  sources?: ChatResponseSource[],
): MessagePart[] {
  const cleaned = cleanAssistantContent(content);
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
