import { TextChunker } from './chunker.interface';
import {
  ChunkingOptions,
  DEFAULT_CHUNKING_OPTIONS,
} from './chunker.interface';
import { ChunkingResult } from '../types/agent.types';

export class RecursiveTextChunker implements TextChunker {
  chunk(
    text: string,
    options?: Partial<ChunkingOptions>,
  ): ChunkingResult {
    const opts = { ...DEFAULT_CHUNKING_OPTIONS, ...options };
    const chunks = this.splitText(text, opts);

    return {
      chunks,
      totalChunks: chunks.length,
      averageChunkSize:
        chunks.length > 0
          ? Math.round(
              chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length,
            )
          : 0,
    };
  }

  private splitText(text: string, options: ChunkingOptions): string[] {
    const { chunkSize, chunkOverlap, separators = [] } = options;

    if (text.length <= chunkSize) {
      return text.trim() ? [text.trim()] : [];
    }

    const separator = this.findBestSeparator(text, separators);
    const splits = separator
      ? text.split(separator).filter((s) => s.trim())
      : [text];

    const chunks: string[] = [];
    let currentChunk = '';

    for (const split of splits) {
      const candidate = currentChunk
        ? `${currentChunk}${separator ?? ''}${split}`
        : split;

      if (candidate.length > chunkSize && currentChunk) {
        chunks.push(currentChunk.trim());

        const overlapText = this.getOverlapText(
          currentChunk,
          chunkOverlap,
        );
        currentChunk = overlapText ? `${overlapText}${separator ?? ''}${split}` : split;
      } else {
        currentChunk = candidate;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  private findBestSeparator(
    text: string,
    separators: string[],
  ): string | undefined {
    return separators.find((sep) => text.includes(sep));
  }

  private getOverlapText(text: string, overlapSize: number): string {
    if (overlapSize <= 0) return '';
    return text.slice(-overlapSize);
  }
}
