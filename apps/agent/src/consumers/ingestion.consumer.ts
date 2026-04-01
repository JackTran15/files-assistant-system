import { Controller, Inject, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { TOPICS, FileUploadedEvent } from '@files-assistant/events';
import {
  AgentProcessingError,
  RecursiveTextChunker,
  EMBEDDING_PORT,
  EmbeddingPort,
  ParentChunkData,
  ChildChunkData,
} from '@files-assistant/core';
import { KafkaEventAdapter } from '../adapters/kafka-event.adapter';
import { extractTextTool } from '../tools/extract-text.tool';
import { detectSemanticBoundaries } from '../tools/semantic-chunker.tool';
import { summarizeChunks } from '../tools/chunk-summarizer.tool';
import Anthropic from '@anthropic-ai/sdk';

let anthropicClient: Anthropic | null = null;

export function setIngestionAnthropicClient(client: Anthropic): void {
  anthropicClient = client;
}

const CHILD_CHUNK_SIZE = 500;
const CHILD_CHUNK_OVERLAP = 100;

@Controller()
export class IngestionConsumer {
  private readonly logger = new Logger(IngestionConsumer.name);
  private readonly childChunker = new RecursiveTextChunker();

  constructor(
    private readonly kafkaEventAdapter: KafkaEventAdapter,
    @Inject(EMBEDDING_PORT)
    private readonly embeddingAdapter: EmbeddingPort,
  ) {}

  @EventPattern(TOPICS.FILE_UPLOADED)
  async handleFileUploaded(
    @Payload() event: FileUploadedEvent,
  ): Promise<void> {
    this.logger.log(
      `[${event.fileId}] Starting ingestion: ${event.fileName}`,
    );

    try {
      this.logger.log(
        `[${event.fileId}] Extracting text (${event.mimeType})`,
      );
      const { text, method } = (await extractTextTool.execute!({
        fileId: event.fileId,
        storagePath: event.storagePath,
        mimeType: event.mimeType,
      })) as { text: string; method: 'haiku' | 'raw'; fileId: string; characterCount: number };
      this.logger.log(
        `[${event.fileId}] Extracted ${text.length} chars via ${method}`,
      );

      await this.kafkaEventAdapter.publishFileExtracted({
        fileId: event.fileId,
        tenantId: event.tenantId,
        parsedText: text,
        extractionMethod: method,
        characterCount: text.length,
      });

      const haikuModel =
        process.env['ANTHROPIC_HAIKU_MODEL'] || 'claude-haiku-4-5-20250414';

      if (!anthropicClient) {
        throw new AgentProcessingError(
          'Anthropic client not initialized for ingestion',
          'chunking',
          false,
        );
      }

      this.logger.log(`[${event.fileId}] Detecting semantic boundaries`);
      const boundaries = await detectSemanticBoundaries(
        text,
        anthropicClient,
        haikuModel,
      );
      this.logger.log(
        `[${event.fileId}] Found ${boundaries.length} semantic sections`,
      );

      const validBoundaries = boundaries.filter(
        (b) => text.slice(b.startOffset, b.endOffset).trim().length > 0,
      );
      const parentTexts = validBoundaries.map((b) =>
        text.slice(b.startOffset, b.endOffset),
      );

      this.logger.log(`[${event.fileId}] Summarizing ${parentTexts.length} parent chunks`);
      const summaries = await summarizeChunks(
        parentTexts,
        anthropicClient,
        haikuModel,
      );

      const parents: ParentChunkData[] = validBoundaries.map((b, i) => ({
        content: parentTexts[i],
        summary: summaries[i],
        chunkIndex: i,
        startOffset: b.startOffset,
        endOffset: b.endOffset,
        fileId: event.fileId,
        fileName: event.fileName,
      }));

      const children: ChildChunkData[] = [];
      let childIndex = 0;
      for (let pi = 0; pi < parents.length; pi++) {
        const { chunks: childTexts } = this.childChunker.chunk(
          parents[pi].content,
          { chunkSize: CHILD_CHUNK_SIZE, chunkOverlap: CHILD_CHUNK_OVERLAP },
        );

        let localOffset = parents[pi].startOffset;
        for (const childText of childTexts) {
          children.push({
            content: childText,
            chunkIndex: childIndex++,
            parentChunkIndex: pi,
            startOffset: localOffset,
            endOffset: localOffset + childText.length,
            fileId: event.fileId,
            fileName: event.fileName,
          });
          localOffset += childText.length - CHILD_CHUNK_OVERLAP;
        }
      }

      if (parents.length === 0) {
        throw new AgentProcessingError(
          'Text produced zero parent chunks',
          'chunking',
          false,
        );
      }

      this.logger.log(
        `[${event.fileId}] Embedding ${parents.length} parent summaries, storing ${children.length} child chunks`,
      );

      const result = await this.embeddingAdapter.embedAndStoreHierarchical(
        parents,
        children,
        event.tenantId,
      );

      await this.kafkaEventAdapter.publishFileReady({
        fileId: event.fileId,
        tenantId: event.tenantId,
        chunksCreated: parents.length + children.length,
        vectorsStored: result.vectorsStored,
      });

      this.logger.log(`[${event.fileId}] Ingestion complete`);
    } catch (error) {
      const stage =
        error instanceof AgentProcessingError ? error.stage : 'extraction';
      const validStage = (
        ['extraction', 'chunking', 'embedding'] as const
      ).includes(stage as 'extraction' | 'chunking' | 'embedding')
        ? (stage as 'extraction' | 'chunking' | 'embedding')
        : 'extraction';

      await this.kafkaEventAdapter.publishFileFailed({
        fileId: event.fileId,
        tenantId: event.tenantId,
        error: error instanceof Error ? error.message : String(error),
        stage: validStage,
      });

      this.logger.error(
        `[${event.fileId}] Ingestion failed at ${validStage}`,
        error,
      );
    }
  }
}
