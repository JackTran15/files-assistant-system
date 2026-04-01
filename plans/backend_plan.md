# Backend Service Plan

Isolated plan for the NestJS backend service (`apps/backend`). Can be built independently by a sub-agent. Covers HTTP API hardening, gRPC server for agent streaming, Kafka consumer completion, SSE improvements, and error handling.

**Depends on shared libs**: This plan creates `libs/proto/` and updates `libs/events/`. The Agent plan creates `libs/core/src/errors/` and updates `libs/weaviate/`. Both can run in parallel -- shared lib changes are in separate directories.

---

## Checklist

- [ ] B0: Dependencies and config
- [ ] B1: Shared libs owned by backend (proto, events)
- [ ] B2: Multer validation (reject video, size limit)
- [ ] B3: gRPC server setup (hybrid HTTP + gRPC)
- [ ] B4: gRPC ChatStreamController
- [ ] B5: Kafka consumer -- handle FILE_READY/FILE_FAILED, remove chat.response subscription
- [ ] B6: Real SSE for file status updates
- [ ] B7: Chat SSE -- heartbeat, timeout, Subject cleanup
- [ ] B8: Store assistant messages + sources on stream done
- [ ] B9: Global HttpExceptionFilter
- [ ] B10: Kafka producer resilience (retry config)

---

## B0: Dependencies and Config

### Root `package.json`

Add:

```
@grpc/grpc-js
@grpc/proto-loader
```

Remove:

```
@ai-sdk/openai
```

### `.env.example`

Add:

```
GRPC_PORT=5000
BACKEND_GRPC_URL=localhost:5000
CITATION_CONFIDENCE_THRESHOLD=0.7
CITATION_MAX_RETRIES=1
```

### `apps/backend/src/modules/config/config.schema.ts`

Add `GRPC_PORT` to the Zod config schema.

---

## B1: Shared Libs Owned by Backend

### `libs/proto/chat-stream.proto` (NEW)

```protobuf
syntax = "proto3";

package chatstream;

service ChatStream {
  rpc StreamChatResponse (stream ChatResponseChunk) returns (StreamResponseAck);
}

message ChatResponseChunk {
  string correlation_id = 1;
  string conversation_id = 2;
  string content = 3;
  bool done = 4;
  repeated SourceRef sources = 5;
  optional double confidence_score = 6;
  optional int32 revision = 7;
}

message SourceRef {
  string file_id = 1;
  string file_name = 2;
  int32 chunk_index = 3;
  double score = 4;
  optional string excerpt = 5;
}

message StreamResponseAck {
  bool received = 1;
}
```

### `libs/events/src/lib/topics.ts`

- Remove `CHAT_RESPONSE` and `CHAT_RESPONSE_DONE` from `TOPICS` (replaced by gRPC)
- Add DLQ topics:

```typescript
export const DLQ_TOPICS = {
  FILE_UPLOADED: 'dlq.file.uploaded',
  CHAT_REQUEST: 'dlq.chat.request',
} as const;
```

### `libs/events/src/schemas/chat-response.event.ts`

Extend `ChatResponseSource` with:

```typescript
excerpt?: string;
pageNumber?: number;
```

Extend `ChatResponseEvent` with:

```typescript
confidenceScore?: number;  // 0.0-1.0, on done event
revision?: number;         // 0 = first attempt, 1+ = refined
```

Keep `ChatResponseEvent` as a shared interface -- it no longer travels through Kafka but is used by both gRPC and SSE layers.

---

## B2: Multer Validation

File: `apps/backend/src/modules/files/files.controller.ts`

Add `fileFilter` and `limits` to the `FileInterceptor`:

```typescript
@UseInterceptors(FileInterceptor('file', {
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(new BadRequestException('Video files are not allowed'), false);
    } else {
      cb(null, true);
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
}))
```

---

## B3: gRPC Server Setup

File: `apps/backend/src/main.ts`

Convert to hybrid app (HTTP + gRPC):

```typescript
import { join } from 'path';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ... existing HTTP setup (validation, swagger) ...

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'chatstream',
      protoPath: join(__dirname, '../../../libs/proto/chat-stream.proto'),
      url: `0.0.0.0:${process.env.GRPC_PORT || 5000}`,
    },
  });

  await app.startAllMicroservices();
  await app.listen(port);
}
```

---

## B4: gRPC ChatStreamController

New file: `apps/backend/src/modules/chat/chat-stream.controller.ts`

Receives gRPC chunks from agent, routes to `ChatService.handleResponseChunk()`:

```typescript
@Controller()
export class ChatStreamController {
  constructor(private readonly chatService: ChatService) {}

  @GrpcStreamMethod('ChatStream', 'StreamChatResponse')
  streamChatResponse(messages: Observable<ChatResponseChunk>): Promise<StreamResponseAck> {
    return new Promise((resolve, reject) => {
      messages.subscribe({
        next: (chunk) => {
          this.chatService.handleResponseChunk({
            correlationId: chunk.correlationId,
            conversationId: chunk.conversationId,
            chunk: chunk.content,
            done: chunk.done,
            sources: chunk.sources,
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
```

Register in `ChatModule`.

---

## B5: Kafka Consumer Updates

File: `apps/backend/src/modules/kafka/kafka.consumer.ts`

- Remove subscription to `TOPICS.CHAT_RESPONSE` and `TOPICS.CHAT_RESPONSE_DONE` (now via gRPC)
- Implement `FILE_READY` handler: update file status to `READY` + set `chunkCount` in DB
- Implement `FILE_FAILED` handler: update file status to `FAILED` + store error message in DB

```typescript
case TOPICS.FILE_READY:
  await this.filesService.updateStatus(value.fileId, FileStatus.READY, {
    chunkCount: value.chunksCreated,
  });
  break;
case TOPICS.FILE_FAILED:
  await this.filesService.updateStatus(value.fileId, FileStatus.FAILED, {
    errorMessage: value.error,
    errorStage: value.stage,
  });
  break;
```

Inject `FilesService` into `KafkaConsumerService`. Add `updateStatus` method to `FilesService`.

---

## B6: Real SSE for File Status

File: `apps/backend/src/modules/files/files.controller.ts`

Replace the fake `interval(2000)` SSE with a real event-driven approach:

- Add an in-memory `Map<fileId, Subject>` to `FilesService` (similar pattern to chat)
- When Kafka consumer receives `file.ready` or `file.failed`, push to the Subject
- SSE endpoint subscribes to the Subject for the given fileId
- Clean up Subject after terminal state (ready/failed) or timeout

---

## B7: Chat SSE Improvements

File: `apps/backend/src/modules/chat/chat.controller.ts`

- Add 15-second heartbeat (`: keepalive\n\n` comment event) to detect dead connections
- Add 120-second timeout: auto-close SSE if no `done` event received
- On client disconnect: detect via Observable teardown, clean up Subject from map

File: `apps/backend/src/modules/chat/chat.service.ts`

- Add timeout logic: schedule cleanup after 120s, cancel on completion
- Log and handle orphaned Subjects (correlationId with no matching stream)

---

## B8: Store Assistant Messages

File: `apps/backend/src/modules/chat/chat.service.ts`

In `handleResponseChunk`, when `event.done === true`:

- Accumulate streamed chunks into full response text
- Save assistant message to DB (MessageEntity with role ASSISTANT)
- Store sources as JSON column or related entity
- Include `confidenceScore` if present

---

## B9: Global HttpExceptionFilter

New file: `apps/backend/src/common/filters/http-exception.filter.ts`

Consistent error response format for all API errors:

```typescript
{
  error: string,
  message: string,
  statusCode: number,
  timestamp: string,
  path: string
}
```

Register globally in `main.ts` via `app.useGlobalFilters()`.

---

## B10: Kafka Producer Resilience

File: `apps/backend/src/modules/kafka/kafka.producer.ts`

- Add retry config: 5 retries, exponential backoff (300ms initial, 30s max)
- Wrap `publish()` with try/catch that propagates meaningful errors to callers
- In `FilesService.upload()`: if Kafka publish fails after retries, rollback DB insert

---

## Error Handling Summary (Backend)

| Error | Where | Response |
|-------|-------|----------|
| Video upload | Multer fileFilter | 400 |
| File too large | Multer limits | 413 |
| Missing file | Controller | 400 |
| Storage write failure | FilesService | 500, no Kafka event |
| Kafka produce failure | FilesService | 500, rollback DB |
| Client SSE disconnect | ChatController | Cleanup Subject |
| Stream timeout (120s) | ChatService | Auto-close, error event |
| gRPC receive error | ChatStreamController | Log, let gRPC handle retry |
