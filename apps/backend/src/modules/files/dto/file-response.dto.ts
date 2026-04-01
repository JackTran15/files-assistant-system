import { ApiProperty } from '@nestjs/swagger';
import { FileStatus, FileType } from '@files-assistant/core';

export class FileResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  mimeType: string;

  @ApiProperty({ enum: FileType })
  fileType: FileType;

  @ApiProperty()
  size: number;

  @ApiProperty({ enum: FileStatus })
  status: FileStatus;

  @ApiProperty()
  chunkCount: number;

  @ApiProperty({ required: false, nullable: true })
  parsedText?: string;

  @ApiProperty({ required: false, nullable: true })
  extractionMethod?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class PaginatedFilesResponseDto {
  @ApiProperty({ type: [FileResponseDto] })
  data: FileResponseDto[];

  @ApiProperty()
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
