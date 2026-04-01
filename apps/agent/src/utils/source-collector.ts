import type { AgentHooks } from '@voltagent/core';
import type { StreamChunkOptions } from '../adapters/grpc-response.adapter';

interface CollectedSearchResult {
  fileId: string;
  fileName: string;
  chunkIndex: number;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

const MAX_EXCERPT_CHARS = 400;
const MIN_RELEVANCE_SCORE = 0.5;

export class SourceCollector {
  private results: CollectedSearchResult[] = [];

  collect(output: unknown): void {
    if (!output || typeof output !== 'object') return;
    const payload = output as { results?: CollectedSearchResult[] };
    if (!Array.isArray(payload.results)) return;

    for (const r of payload.results) {
      if (r.fileId && r.fileName != null && r.score != null) {
        this.results.push(r);
      }
    }
  }

  collectFromReadFile(output: unknown): void {
    if (!output || typeof output !== 'object') return;
    const payload = output as { _sourceChunks?: CollectedSearchResult[] };
    if (!Array.isArray(payload._sourceChunks)) return;

    for (const c of payload._sourceChunks) {
      if (c.fileId && c.fileName != null) {
        this.results.push({
          ...c,
          score: c.score > 0 ? c.score : 1.0,
          metadata: c.metadata ?? {},
        });
      }
    }
  }

  toStreamSources(): StreamChunkOptions['sources'] {
    const seen = new Map<string, (typeof deduped)[number]>();
    const deduped: Array<{
      fileId: string;
      fileName: string;
      chunkIndex: number;
      score: number;
      excerpt?: string;
      pageNumber?: number;
    }> = [];

    for (const r of this.results) {
      if (r.score < MIN_RELEVANCE_SCORE) continue;

      const key = `${r.fileId}:${r.chunkIndex}`;
      const existing = seen.get(key);
      if (existing) {
        if (r.score > existing.score) {
          existing.score = r.score;
        }
        continue;
      }

      const entry = {
        fileId: r.fileId,
        fileName: r.fileName,
        chunkIndex: r.chunkIndex,
        score: r.score,
        excerpt: r.content
          ? r.content.length > MAX_EXCERPT_CHARS
            ? r.content.slice(0, MAX_EXCERPT_CHARS) + '…'
            : r.content
          : undefined,
        pageNumber:
          typeof r.metadata?.pageNumber === 'number'
            ? r.metadata.pageNumber
            : undefined,
      };

      deduped.push(entry);
      seen.set(key, entry);
    }

    return deduped;
  }

  get size(): number {
    return this.results.length;
  }
}

export function createCollectorHooks(
  collector: SourceCollector,
  existingHooks?: AgentHooks,
): AgentHooks {
  return {
    ...existingHooks,
    onToolEnd(args) {
      if (args.tool.name === 'searchFiles' && args.output && !args.error) {
        collector.collect(args.output);
      }
      if (args.tool.name === 'readFile' && args.output && !args.error) {
        collector.collectFromReadFile(args.output);
      }
      return existingHooks?.onToolEnd?.(args);
    },
    onToolStart: existingHooks?.onToolStart,
    onToolError: existingHooks?.onToolError,
  };
}
