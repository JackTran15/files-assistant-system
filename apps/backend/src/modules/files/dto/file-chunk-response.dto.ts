import { ApiProperty } from '@nestjs/swagger';

export class FileChunkResponseDto {
  @ApiProperty()
  fileId: string;

  @ApiProperty()
  chunkIndex: number;

  @ApiProperty()
  content: string;
}
