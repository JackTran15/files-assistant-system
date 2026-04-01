import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';

export class ChatMessageDto {
  @ApiProperty({
    description: 'User message',
    example: 'What does the quarterly report say about revenue?',
  })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiProperty({
    description: 'Conversation ID (omit to start new)',
    required: false,
  })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiProperty({ description: 'Tenant identifier' })
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @ApiProperty({
    description: 'File IDs to use as context',
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileIds?: string[];
}
