import {
  Injectable,
  Inject,
  OnModuleInit,
  Logger,
  Optional,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';

export interface StreamChunkOptions {
  sources?: Array<{
    fileId: string;
    fileName: string;
    chunkIndex: number;
    score: number;
  }>;
  confidenceScore?: number;
  revision?: number;
}

export interface ChatResponseStream {
  sendChunk(content: string, done: boolean, options?: StreamChunkOptions): void;
  cancel(): void;
}

interface ChatStreamService {
  StreamChatResponse(): {
    write(data: Record<string, unknown>): void;
    end(): void;
    cancel(): void;
  };
}

@Injectable()
export class GrpcResponseAdapter implements OnModuleInit {
  private readonly logger = new Logger(GrpcResponseAdapter.name);
  private chatStreamService: ChatStreamService | null = null;

  constructor(
    @Optional() @Inject('CHAT_STREAM_PACKAGE') private client?: ClientGrpc,
  ) {}

  onModuleInit() {
    if (this.client) {
      this.chatStreamService =
        this.client.getService<ChatStreamService>('ChatStream');
    } else {
      this.logger.warn(
        'gRPC client not available; chat streaming will use fallback logging',
      );
    }
  }

  createStream(
    correlationId: string,
    conversationId: string,
  ): ChatResponseStream {
    if (!this.chatStreamService) {
      return this.createFallbackStream(correlationId, conversationId);
    }

    const grpcStream = this.chatStreamService.StreamChatResponse();
    return {
      sendChunk: (
        content: string,
        done: boolean,
        options?: StreamChunkOptions,
      ) => {
        grpcStream.write({
          correlationId,
          conversationId,
          content,
          done,
          sources: options?.sources || [],
          confidenceScore: options?.confidenceScore,
          revision: options?.revision,
        });
        if (done) grpcStream.end();
      },
      cancel: () => grpcStream.cancel(),
    };
  }

  private createFallbackStream(
    correlationId: string,
    conversationId: string,
  ): ChatResponseStream {
    return {
      sendChunk: (content: string, done: boolean) => {
        this.logger.debug(
          `[${correlationId}/${conversationId}] chunk(done=${done}): ${content.slice(0, 100)}`,
        );
      },
      cancel: () => {
        this.logger.debug(
          `[${correlationId}/${conversationId}] stream cancelled`,
        );
      },
    };
  }
}
