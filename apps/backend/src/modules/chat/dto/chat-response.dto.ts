import { ApiProperty } from '@nestjs/swagger';

export class ChatResponseDto {
  @ApiProperty()
  conversationId: string;

  @ApiProperty()
  response: string;

  @ApiProperty({ required: false })
  sources?: {
    fileId: string;
    fileName: string;
    chunkIndex: number;
    score: number;
  }[];
}
