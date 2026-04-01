import { Controller, Inject, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { TOPICS, ChatRequestEvent } from '@files-assistant/events';
import { GrpcResponseAdapter } from '../adapters/grpc-response.adapter';
import type { Agent } from '@voltagent/core';

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
      const enrichedPrompt = this.buildEnrichedPrompt(event);
      const agentResult = await this.supervisorAgent.streamText(
        enrichedPrompt,
      );

      for await (const chunk of agentResult.textStream) {
        stream.sendChunk(chunk, false);
      }

      stream.sendChunk('', true);

      this.logger.log(`Chat request ${event.correlationId} processed`);
    } catch (error) {
      stream.sendChunk(
        `[Error: ${error instanceof Error ? error.message : String(error)}]`,
        true,
      );
      this.logger.error(`Chat request ${event.correlationId} failed`, error);
    }
  }
}
