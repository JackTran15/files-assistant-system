import {
  Injectable,
  Inject,
  OnModuleInit,
  Logger,
  Optional,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Subject, Observable, lastValueFrom } from 'rxjs';

export interface StreamChunkOptions {
  sources?: Array<{
    fileId: string;
    fileName: string;
    chunkIndex: number;
    score: number;
    excerpt?: string;
    pageNumber?: number;
    citationContent?: string;
  }>;
  confidenceScore?: number;
  revision?: number;
  evidence?: Array<{
    evidenceId: string;
    fileId: string;
    fileName: string;
    chunkIndex: number;
    score: number;
    excerpt?: string;
    pageNumber?: number;
    citationContent?: string;
  }>;
  claims?: Array<{
    claimText: string;
    evidenceIds: string[];
  }>;
  renderedAnswer?: string;
  citationWarnings?: string[];
}

export interface ChatResponseStream {
  sendChunk(content: string, done: boolean, options?: StreamChunkOptions): void;
  cancel(): void;
}

interface ChatResponseChunk {
  correlationId: string;
  conversationId: string;
  content: string;
  done: boolean;
  sources: Array<{
    fileId: string;
    fileName: string;
    chunkIndex: number;
    score: number;
    excerpt?: string;
    pageNumber?: number;
    citationContent?: string;
  }>;
  confidenceScore?: number;
  revision?: number;
  evidence?: Array<{
    evidenceId: string;
    fileId: string;
    fileName: string;
    chunkIndex: number;
    score: number;
    excerpt?: string;
    pageNumber?: number;
    citationContent?: string;
  }>;
  claims?: Array<{
    claimText: string;
    evidenceIds: string[];
  }>;
  renderedAnswer?: string;
  citationWarnings?: string[];
}

interface StreamResponseAck {
  received: boolean;
}

interface ChatStreamService {
  streamChatResponse(
    data: Observable<ChatResponseChunk>,
  ): Observable<StreamResponseAck>;
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
      this.logger.log('gRPC ChatStream service initialized');
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

    const subject = new Subject<ChatResponseChunk>();

    const response$ =
      this.chatStreamService.streamChatResponse(subject.asObservable());

    lastValueFrom(response$).catch((err) => {
      this.logger.error(
        `gRPC stream error for ${correlationId}: ${err instanceof Error ? err.message : err}`,
      );
    });

    return {
      sendChunk: (
        content: string,
        done: boolean,
        options?: StreamChunkOptions,
      ) => {
        subject.next({
          correlationId,
          conversationId,
          content,
          done,
          sources: options?.sources || [],
          confidenceScore: options?.confidenceScore,
          revision: options?.revision,
          evidence: options?.evidence || [],
          claims: options?.claims || [],
          renderedAnswer: options?.renderedAnswer,
          citationWarnings: options?.citationWarnings || [],
        });
        if (done) {
          subject.complete();
        }
      },
      cancel: () => {
        subject.complete();
      },
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
