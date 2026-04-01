import { Controller, Post, Get, Query, Body, Sse, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Observable, EMPTY, merge, interval, of } from 'rxjs';
import { map, timeout, finalize, catchError } from 'rxjs/operators';
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

    const heartbeat$ = interval(15000).pipe(
      map(() => ({ data: { type: 'heartbeat' } } as MessageEvent)),
    );

    return merge(
      responseStream.pipe(
        map((event) => ({ data: event } as MessageEvent)),
      ),
      heartbeat$,
    ).pipe(
      timeout(120000),
      catchError(() =>
        of({ data: { type: 'error', message: 'Stream timeout' } } as MessageEvent),
      ),
      finalize(() => this.chatService.cleanupStream(correlationId)),
    );
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
