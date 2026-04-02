import { Controller, Inject, Logger, Optional } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { TOPICS, ChatRequestEvent } from '@files-assistant/events';
import { GrpcResponseAdapter } from '../adapters/grpc-response.adapter';
import type { Agent } from '@voltagent/core';
import {
  SourceCollector,
  createCollectorHooks,
} from '../utils/source-collector';
import { toolLoggingHooks } from '../hooks/tool-logging.hooks';
import {
  buildClaimsFromAnswer,
  buildEvidence,
  stripThinkingBlocks,
  validateAndRepairCitationMapping,
} from '../utils/citation-mapping';
import { logMetric } from '../utils/metric-log';
import { KafkaEventAdapter } from '../adapters/kafka-event.adapter';

@Controller()
export class ChatConsumer {
  private readonly logger = new Logger(ChatConsumer.name);

  constructor(
    private readonly grpcResponseAdapter: GrpcResponseAdapter,
    private readonly kafkaEventAdapter: KafkaEventAdapter,
    @Inject('SUPERVISOR_AGENT')
    private readonly supervisorAgent: Agent,
    @Optional()
    @Inject('CITATION_AGENT')
    private readonly citationAgent?: Agent,
  ) {}

  private buildEnrichedPrompt(event: ChatRequestEvent): string {
    const contextLines = [`[Context] tenantId: ${event.tenantId}`];
    if (event.fileIds?.length) {
      contextLines.push(
        `[Context] selectedFileIds: ${event.fileIds.join(', ')}`,
      );
    }
    return [...contextLines, `[User] ${event.message}`].join('\n');
  }

  private buildCitationRemapPrompt(
    answer: string,
    sources: NonNullable<ReturnType<SourceCollector['toStreamSources']>>,
  ): string {
    const formattedSources = sources
      .map((s, i) => {
        const text = (s.citationContent ?? s.excerpt ?? '').trim();
        return [
          `[${i + 1}] ${s.fileName} (fileId=${s.fileId}, chunkIndex=${s.chunkIndex}, score=${s.score.toFixed(3)})`,
          text ? text : '[EMPTY_SOURCE_TEXT]',
        ].join('\n');
      })
      .join('\n\n');

    return [
      'Rewrite the answer with better citation mapping using SOURCES.',
      'Return only rewritten answer text with inline [N] markers.',
      '',
      '[ANSWER]',
      answer,
      '',
      '[SOURCES]',
      formattedSources,
    ].join('\n');
  }

  @EventPattern(TOPICS.CHAT_REQUEST)
  async handleChatRequest(@Payload() event: ChatRequestEvent): Promise<void> {
    const startedAt = Date.now();
    this.logger.log(
      `Chat request: ${event.correlationId} - "${event.message.slice(0, 50)}..."`,
    );
    this.logger.log(
      `Chat request ${event.correlationId} context: tenant=${event.tenantId}, conversation=${event.conversationId}`,
    );
    logMetric(this.logger, 'agent_chat_started', {
      correlationId: event.correlationId,
      conversationId: event.conversationId,
      tenantId: event.tenantId,
    });

    if (event.fileIds?.length) {
      this.logger.log(
        `Chat request ${event.correlationId} includes ${event.fileIds.length} file(s): [${event.fileIds.join(', ')}]`,
      );
    }

    const stream = this.grpcResponseAdapter.createStream(
      event.correlationId,
      event.conversationId,
    );

    try {
      const collector = new SourceCollector();
      const enrichedPrompt = this.buildEnrichedPrompt(event);
      const agentResult = await this.supervisorAgent.streamText(
        enrichedPrompt,
        {
          hooks: createCollectorHooks(collector, toolLoggingHooks),
        },
      );

      const streamedChunks: string[] = [];
      for await (const chunk of agentResult.textStream) {
        streamedChunks.push(chunk);
        stream.sendChunk(chunk, false);
      }
      this.logger.log(
        `Chat request ${event.correlationId} streamed ${streamedChunks.length} chunk(s)`,
      );

      const sources = collector.toStreamSources() ?? [];
      const draftAnswer = stripThinkingBlocks(streamedChunks.join(''));
      let renderedAnswer = draftAnswer;
      if (this.citationAgent && sources.length > 0) {
        try {
          const remapPrompt = this.buildCitationRemapPrompt(draftAnswer, sources);
          const remapResult = await this.citationAgent.streamText(remapPrompt);
          const remappedChunks: string[] = [];
          for await (const remappedChunk of remapResult.textStream) {
            remappedChunks.push(remappedChunk);
          }
          const remapped = stripThinkingBlocks(remappedChunks.join(''));
          if (remapped.length > 0) {
            renderedAnswer = remapped;
          }
        } catch (error) {
          this.logger.warn(
            `Citation remap failed for ${event.correlationId}; using draft answer`,
          );
          this.logger.warn(error instanceof Error ? error.message : String(error));
        }
      }
      const evidence = buildEvidence(sources);
      const claims = buildClaimsFromAnswer(renderedAnswer, evidence);
      const mapping = validateAndRepairCitationMapping(claims, evidence);
      if (mapping.warnings?.length) {
        this.logger.warn(
          `Citation mapping warnings for ${event.correlationId}: ${mapping.warnings.join(' | ')}`,
        );
      }
      stream.sendChunk('', true, {
        sources: sources.length ? sources : undefined,
        renderedAnswer,
        evidence: mapping.evidence.length ? mapping.evidence : undefined,
        claims: mapping.claims.length ? mapping.claims : undefined,
        citationWarnings: mapping.warnings,
      });

      this.logger.log(
        `Chat request ${event.correlationId} processed (${sources.length} sources, ${mapping.claims.length} claims, ${Date.now() - startedAt}ms)`,
      );
      logMetric(this.logger, 'agent_chat_completed', {
        correlationId: event.correlationId,
        conversationId: event.conversationId,
        durationMs: Date.now() - startedAt,
        sourceCount: sources.length,
        claimCount: mapping.claims.length,
      });
    } catch (error) {
      try {
        await this.kafkaEventAdapter.publishDlq(
          'CHAT_REQUEST',
          event.correlationId,
          {
            event,
            reason: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          },
        );
      } catch (dlqError) {
        this.logger.error(
          `Failed to publish chat DLQ for ${event.correlationId}`,
          dlqError instanceof Error ? dlqError.stack : String(dlqError),
        );
      }
      stream.sendChunk(
        `[Error: ${error instanceof Error ? error.message : String(error)}]`,
        true,
      );
      this.logger.error(
        `Chat request ${event.correlationId} failed after ${Date.now() - startedAt}ms`,
        error,
      );
      logMetric(this.logger, 'agent_chat_failed', {
        correlationId: event.correlationId,
        conversationId: event.conversationId,
        durationMs: Date.now() - startedAt,
      });
    }
  }
}
