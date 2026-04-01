import { Controller, Inject, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { TOPICS, ChatRequestEvent } from '@files-assistant/events';
import {
  GrpcResponseAdapter,
  StreamChunkOptions,
} from '../adapters/grpc-response.adapter';

interface SupervisorStreamResult {
  textStream: AsyncIterable<string>;
  sources?: Array<{
    fileId: string;
    fileName: string;
    chunkIndex: number;
    score: number;
    excerpt?: string;
  }>;
  confidenceScore?: number;
  revision?: number;
}

@Controller()
export class ChatConsumer {
  private readonly logger = new Logger(ChatConsumer.name);

  constructor(
    private readonly grpcResponseAdapter: GrpcResponseAdapter,
    @Inject('SUPERVISOR_AGENT')
    private readonly supervisorAgent: {
      streamText: (opts: { input: string }) => Promise<SupervisorStreamResult>;
    },
  ) {}

  @EventPattern(TOPICS.CHAT_REQUEST)
  async handleChatRequest(@Payload() event: ChatRequestEvent): Promise<void> {
    this.logger.log(
      `Chat request: ${event.correlationId} - "${event.message.slice(0, 50)}..."`,
    );

    const stream = this.grpcResponseAdapter.createStream(
      event.correlationId,
      event.conversationId,
    );

    try {
      const agentResult = await this.supervisorAgent.streamText({
        input: event.message,
      });

      for await (const chunk of agentResult.textStream) {
        stream.sendChunk(chunk, false);
      }

      const finalOptions: StreamChunkOptions = {};
      if (agentResult.sources?.length) {
        finalOptions.sources = agentResult.sources;
      }
      if (agentResult.confidenceScore !== undefined) {
        finalOptions.confidenceScore = agentResult.confidenceScore;
      }
      if (agentResult.revision !== undefined) {
        finalOptions.revision = agentResult.revision;
      }

      stream.sendChunk('', true, finalOptions);

      this.logger.log(
        `Chat request ${event.correlationId} processed` +
          (finalOptions.confidenceScore !== undefined
            ? ` (confidence: ${finalOptions.confidenceScore})`
            : ''),
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
