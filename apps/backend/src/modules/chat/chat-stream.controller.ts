import { Controller } from '@nestjs/common';
import { GrpcStreamMethod } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import { ChatService } from './chat.service';

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
    content?: string;
  }>;
  confidenceScore?: number;
  revision?: number;
}

interface StreamResponseAck {
  received: boolean;
}

@Controller()
export class ChatStreamController {
  constructor(private readonly chatService: ChatService) {}

  @GrpcStreamMethod('ChatStream', 'StreamChatResponse')
  streamChatResponse(
    messages: Observable<ChatResponseChunk>,
  ): Promise<StreamResponseAck> {
    return new Promise((resolve, reject) => {
      messages.subscribe({
        next: (chunk) => {
          this.chatService.handleResponseChunk({
            correlationId: chunk.correlationId,
            conversationId: chunk.conversationId,
            chunk: chunk.content,
            done: chunk.done,
            sources: chunk.sources?.map((s) => ({
              fileId: s.fileId,
              fileName: s.fileName,
              chunkIndex: s.chunkIndex,
              score: s.score,
              excerpt: s.excerpt,
              pageNumber: s.pageNumber,
              content: s.content,
            })),
            confidenceScore: chunk.confidenceScore,
            revision: chunk.revision,
            timestamp: new Date().toISOString(),
          });
        },
        error: (err) => reject(err),
        complete: () => resolve({ received: true }),
      });
    });
  }
}
