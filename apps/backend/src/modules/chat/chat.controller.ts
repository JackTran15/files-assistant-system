import { Controller, Post, Get, Query, Body, Sse, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Observable, EMPTY, merge, interval, of } from 'rxjs';
import { map, timeout, finalize, catchError, filter, share, take, takeUntil } from 'rxjs/operators';
import { ChatService } from './chat.service';
import { ChatMessageDto } from './dto/chat-message.dto';
import { ChatResponseDto } from './dto/chat-response.dto';

@ApiTags('Chat')
@Controller('api/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send message and receive response' })
  @ApiResponse({ status: 200, type: ChatResponseDto })
  async sendMessage(@Body() dto: ChatMessageDto) {
    return this.chatService.sendMessage(dto);
  }

  @Sse('stream/:correlationId')
  @ApiOperation({ summary: 'SSE: stream agent response tokens' })
  stream(@Param('correlationId') correlationId: string): Observable<MessageEvent> {
    const responseStream = this.chatService.getResponseStream(correlationId);
    if (!responseStream) return EMPTY;

    const streamEvents$ = responseStream.pipe(
      timeout({ first: 120000, each: 120000 }),
      catchError(() =>
        of({
          correlationId,
          conversationId: '',
          chunk: '[Error: Stream timeout]',
          done: true,
          cancelled: true,
          timestamp: new Date().toISOString(),
        }),
      ),
      finalize(() => this.chatService.cleanupStream(correlationId)),
      share(),
    );

    const terminal$ = streamEvents$.pipe(
      filter((event) => event.done),
      take(1),
    );

    const heartbeat$ = interval(15000).pipe(
      takeUntil(terminal$),
      map(() => ({ data: { type: 'heartbeat' } } as MessageEvent)),
    );

    return merge(
      streamEvents$.pipe(
        map((event) => ({ data: event } as MessageEvent)),
      ),
      heartbeat$,
    );
  }

  @Post('cancel/:correlationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel an active chat stream' })
  @ApiResponse({ status: 204, description: 'Stream cancelled' })
  async cancelStream(@Param('correlationId') correlationId: string) {
    await this.chatService.cancelStream(correlationId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Conversation history (paginated)' })
  async getHistory(
    @Query('tenantId') tenantId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.chatService.getHistory(tenantId, page, limit);
  }
}
