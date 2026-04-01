import { TextChunker } from './chunker.interface';
import {
  ChunkingOptions,
  DEFAULT_CHUNKING_OPTIONS,
  STRUCTURAL_SEPARATORS,
} from './chunker.interface';
import { ChunkingResult, ChunkWithOffset } from '../types/agent.types';

export class RecursiveTextChunker implements TextChunker {
  chunk(
    text: string,
    options?: Partial<ChunkingOptions>,
  ): ChunkingResult {
    const opts: ChunkingOptions = {
      ...DEFAULT_CHUNKING_OPTIONS,
      ...options,
      separators: options?.separators ?? DEFAULT_CHUNKING_OPTIONS.separators,
      structuralSeparators:
        options?.structuralSeparators ??
        DEFAULT_CHUNKING_OPTIONS.structuralSeparators,
    };

    const structural = opts.structuralSeparators ?? STRUCTURAL_SEPARATORS;
    const sections = this.splitStructural(text, structural);
    let chunkOffsets: ChunkWithOffset[] = [];

    for (const { start, end } of sections) {
      const segment = text.slice(start, end);
      chunkOffsets.push(...this.chunkSegment(segment, start, opts));
    }

    chunkOffsets = this.applyOverlap(chunkOffsets, text, opts.chunkOverlap);
    chunkOffsets = chunkOffsets.filter(
      (c) => c.content.length > 0 && /\S/.test(c.content),
    );

    const chunks = chunkOffsets.map((c) => c.content);

    return {
      chunks,
      chunkOffsets,
      totalChunks: chunks.length,
      averageChunkSize:
        chunks.length > 0
          ? Math.round(
              chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length,
            )
          : 0,
    };
  }

  private splitStructural(
    fullText: string,
    patterns: RegExp[],
  ): Array<{ start: number; end: number }> {
    const bounds = new Set<number>([0, fullText.length]);

    for (const pattern of patterns) {
      if (pattern.source === '\\f') {
        let m: RegExpExecArray | null;
        const re = /\f/g;
        while ((m = re.exec(fullText)) !== null) {
          bounds.add(m.index);
          bounds.add(m.index + 1);
        }
        continue;
      }

      const flags = pattern.flags.includes('g')
        ? pattern.flags
        : `${pattern.flags}g`;
      const re = new RegExp(pattern.source, flags);
      let m: RegExpExecArray | null;
      while ((m = re.exec(fullText)) !== null) {
        bounds.add(m.index);
      }
    }

    const sorted = [...bounds].sort((a, b) => a - b);
    const sections: Array<{ start: number; end: number }> = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const start = sorted[i];
      const end = sorted[i + 1];
      if (start < end) {
        sections.push({ start, end });
      }
    }
    return sections;
  }

  private chunkSegment(
    text: string,
    baseOffset: number,
    options: ChunkingOptions,
  ): ChunkWithOffset[] {
    if (!/\S/.test(text)) {
      return [];
    }

    if (text.length <= options.chunkSize) {
      return [
        {
          content: text,
          startOffset: baseOffset,
          endOffset: baseOffset + text.length,
        },
      ];
    }

    const separators = options.separators ?? [];
    const sep = separators.find((s) => text.includes(s));

    if (sep === undefined || sep === '') {
      return this.splitByFixedSize(text, baseOffset, options.chunkSize);
    }

    const pieces = this.splitWithSeparator(text, sep);
    const out: ChunkWithOffset[] = [];
    for (const { fragment, start } of pieces) {
      out.push(
        ...this.chunkSegment(fragment, baseOffset + start, options),
      );
    }
    return out;
  }

  private splitWithSeparator(
    text: string,
    sep: string,
  ): Array<{ fragment: string; start: number }> {
    const out: Array<{ fragment: string; start: number }> = [];
    let pos = 0;
    while (pos <= text.length) {
      const found = text.indexOf(sep, pos);
      if (found === -1) {
        const fragment = text.slice(pos);
        if (fragment.length > 0) {
          out.push({ fragment, start: pos });
        }
        break;
      }
      const fragment = text.slice(pos, found);
      if (fragment.length > 0) {
        out.push({ fragment, start: pos });
      }
      pos = found + sep.length;
    }
    return out;
  }

  private splitByFixedSize(
    text: string,
    baseOffset: number,
    chunkSize: number,
  ): ChunkWithOffset[] {
    const out: ChunkWithOffset[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      const slice = text.slice(i, i + chunkSize);
      if (/\S/.test(slice)) {
        out.push({
          content: slice,
          startOffset: baseOffset + i,
          endOffset: baseOffset + i + slice.length,
        });
      }
    }
    return out;
  }

  private applyOverlap(
    chunks: ChunkWithOffset[],
    fullText: string,
    overlap: number,
  ): ChunkWithOffset[] {
    if (overlap <= 0 || chunks.length <= 1) {
      return chunks;
    }

    const result: ChunkWithOffset[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const ch = chunks[i];
      if (i === 0) {
        result.push(ch);
        continue;
      }
      const prev = result[result.length - 1];
      const newStart = Math.max(ch.startOffset, prev.endOffset - overlap);
      result.push({
        content: fullText.slice(newStart, ch.endOffset),
        startOffset: newStart,
        endOffset: ch.endOffset,
      });
    }
    return result;
  }
}
