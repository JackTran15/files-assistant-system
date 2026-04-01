import 'multer';
import { extname } from 'path';
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  Body,
  HttpCode,
  HttpStatus,
  Sse,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { Observable, map } from 'rxjs';
import { FilesService } from './files.service';
import { UploadFileDto } from './dto/upload-file.dto';
import { SearchFilesDto } from './dto/search-files.dto';
import { FileResponseDto, PaginatedFilesResponseDto } from './dto/file-response.dto';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/json',
]);

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.txt', '.md', '.json']);

@ApiTags('Files')
@Controller('api/files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor('file', {
    fileFilter: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      if (ALLOWED_MIME_TYPES.has(file.mimetype) || ALLOWED_EXTENSIONS.has(ext)) {
        cb(null, true);
      } else {
        cb(
          new BadRequestException(
            'Unsupported file type. Allowed: PDF, TXT, MD, JSON',
          ),
          false,
        );
      }
    },
    limits: { fileSize: 50 * 1024 * 1024 },
  }))
  @ApiOperation({ summary: 'Upload a file for processing (PDF, TXT, MD, JSON)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Accepted file types: .pdf, .txt, .md, .json (max 50 MB)',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'PDF, TXT, MD, or JSON file' },
        tenantId: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 202, type: FileResponseDto, description: 'File accepted for processing' })
  @ApiResponse({ status: 400, description: 'Unsupported file type. Allowed: PDF, TXT, MD, JSON' })
  @ApiResponse({ status: 413, description: 'File exceeds 50 MB size limit' })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
  ) {
    return this.filesService.upload(file, dto.tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'List files (paginated, filterable)' })
  @ApiResponse({ status: 200, type: PaginatedFilesResponseDto })
  async findAll(@Query() query: SearchFilesDto) {
    return this.filesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get file details' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, type: FileResponseDto })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.filesService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete file, vectors, and chunks' })
  @ApiParam({ name: 'id', type: 'string' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.filesService.remove(id);
  }

  @Sse(':id/events')
  @ApiOperation({ summary: 'SSE: processing status updates' })
  @ApiParam({ name: 'id', type: 'string' })
  events(@Param('id', ParseUUIDPipe) id: string): Observable<MessageEvent> {
    return this.filesService.getFileStatusStream(id).pipe(
      map((event) => ({ data: event } as MessageEvent)),
    );
  }
}
