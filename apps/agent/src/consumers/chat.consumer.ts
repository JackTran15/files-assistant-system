import { Controller, Inject, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { TOPICS, ChatRequestEvent } from '@files-assistant/events';
import { GrpcResponseAdapter } from '../adapters/grpc-response.adapter';
import type { Agent } from '@voltagent/core';
import {
  SourceCollector,
  createCollectorHooks,
} from '../utils/source-collector';
import { toolLoggingHooks } from '../hooks/tool-logging.hooks';

@Controller()
export class ChatConsumer {
  private readonly logger = new Logger(ChatConsumer.name);

  constructor(
    private readonly grpcResponseAdapter: GrpcResponseAdapter,
    @Inject('SUPERVISOR_AGENT')
    private readonly supervisorAgent: Agent,
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

  @EventPattern(TOPICS.CHAT_REQUEST)
  async handleChatRequest(@Payload() event: ChatRequestEvent): Promise<void> {
    this.logger.log(
      `Chat request: ${event.correlationId} - "${event.message.slice(0, 50)}..."`,
    );

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

      for await (const chunk of agentResult.textStream) {
        stream.sendChunk(chunk, false);
      }

      const sources = collector.toStreamSources();
      stream.sendChunk('', true, {
        sources: sources?.length ? sources : undefined,
      });

      this.logger.log(
        `Chat request ${event.correlationId} processed (${sources?.length ?? 0} sources)`,
      );
    } catch (error) {
      stream.sendChunk(
        `[Error: ${error instanceof Error ? error.message : String(error)}]`,
        true,
      );
      this.logger.error(`Chat request ${event.correlationId} failed`, error);
    }
  }
}
