import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VoyageAIClient } from 'voyageai';
import { EmbeddingPort, AgentProcessingError } from '@files-assistant/core';
import { withRetry, withCircuitBreaker } from '../utils/resilience';

const MAX_BATCH_SIZE = 128;
const DEFAULT_MODEL = 'voyage-3-lite';

@Injectable()
export class VoyageEmbeddingAdapter implements EmbeddingPort, OnModuleInit {
  private readonly logger = new Logger(VoyageEmbeddingAdapter.name);
  private client!: VoyageAIClient;
  private model!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const apiKey = this.config.get<string>('VOYAGE_API_KEY');
    if (!apiKey) {
      throw new Error('VOYAGE_API_KEY is required');
    }
    this.client = new VoyageAIClient({ apiKey });
    this.model = this.config.get<string>('VOYAGE_MODEL') || DEFAULT_MODEL;
    this.logger.log(`Voyage embedding adapter initialized (model: ${this.model})`);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    try {
      const vectors: number[][] = [];

      for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
        const batch = texts.slice(i, i + MAX_BATCH_SIZE);
        const response = await withCircuitBreaker(
          'voyage_embed_documents',
          async () =>
            withRetry(
              () =>
                this.client.embed({
                  input: batch,
                  model: this.model,
                  inputType: 'document',
                }),
              {
                retries: 3,
                baseDelayMs: 250,
                maxDelayMs: 2500,
                jitterMs: 150,
                shouldRetry: () => true,
              },
            ),
          { failureThreshold: 5, openMs: 10000, stage: 'embedding' },
        );

        if (!response.data) {
          throw new Error('Voyage API returned empty response');
        }

        for (const item of response.data) {
          if (!item.embedding) {
            throw new Error(`Missing embedding at index ${item.index}`);
          }
          vectors.push(item.embedding);
        }
      }

      this.logger.debug(`Embedded ${vectors.length} documents`);
      return vectors;
    } catch (error) {
      if (error instanceof AgentProcessingError) throw error;
      throw new AgentProcessingError(
        `Voyage embedding failed: ${error instanceof Error ? error.message : String(error)}`,
        'embedding',
        true,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async embedQuery(text: string): Promise<number[]> {
    try {
      const response = await withCircuitBreaker(
        'voyage_embed_query',
        async () =>
          withRetry(
            () =>
              this.client.embed({
                input: [text],
                model: this.model,
                inputType: 'query',
              }),
            {
              retries: 2,
              baseDelayMs: 200,
              maxDelayMs: 2000,
              jitterMs: 100,
              shouldRetry: () => true,
            },
          ),
        { failureThreshold: 5, openMs: 10000, stage: 'search' },
      );

      if (!response.data?.[0]?.embedding) {
        throw new Error('Voyage API returned empty query embedding');
      }

      return response.data[0].embedding;
    } catch (error) {
      if (error instanceof AgentProcessingError) throw error;
      throw new AgentProcessingError(
        `Voyage query embedding failed: ${error instanceof Error ? error.message : String(error)}`,
        'search',
        true,
        error instanceof Error ? error : undefined,
      );
    }
  }
}
