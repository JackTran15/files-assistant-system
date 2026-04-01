# [Done] - PG-02: Backend Chat fileIds Validation

| Field         | Value                                      |
|---------------|--------------------------------------------|
| **Points**    | 3                                          |
| **Priority**  | P1 — Prevents broken chat responses        |
| **Epic**      | Processing Guardrails                      |
| **Depends on**| —                                          |
| **Blocks**    | PG-04                                      |

---

## Description

Validate that all `fileIds` in a chat request are in `READY` status before publishing the `chat.request` Kafka event. Currently, the backend accepts any fileIds without checking their status, which means the agent may search against files that have no vectors in Weaviate yet (still processing) or files that failed ingestion — producing empty or misleading results.

Inject the `FileEntity` repository into `ChatService` (via `ChatModule`) and query file statuses before proceeding.

---

## Acceptance Criteria

- [ ] `POST /api/chat` with fileIds containing a `processing` file returns `400 Bad Request`
- [ ] `POST /api/chat` with fileIds containing a `failed` file returns `400 Bad Request`
- [ ] `POST /api/chat` with fileIds containing a `pending` file returns `400 Bad Request`
- [ ] `POST /api/chat` with all `ready` fileIds succeeds (publishes to Kafka)
- [ ] `POST /api/chat` with no fileIds succeeds (no validation needed)
- [ ] Error response includes the names of non-ready files
- [ ] `ChatModule` imports `TypeOrmModule.forFeature([FileEntity])` for repository access

---

## Files to Modify

| File | Change |
|------|--------|
| `apps/backend/src/modules/chat/chat.service.ts` | Inject `Repository<FileEntity>`, add validation before `kafkaProducer.publish` |
| `apps/backend/src/modules/chat/chat.module.ts` | Add `TypeOrmModule.forFeature([FileEntity])` to imports |

---

## Implementation Notes

### ChatModule Update

```typescript
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileEntity } from '../files/entities/file.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConversationEntity, MessageEntity, FileEntity]),
    // ...
  ],
})
export class ChatModule {}
```

### ChatService Validation

```typescript
import { In, Not } from 'typeorm';
import { FileEntity } from '../files/entities/file.entity';
import { FileStatus } from '@files-assistant/core';

// In constructor:
@InjectRepository(FileEntity)
private readonly fileRepo: Repository<FileEntity>,

// In sendMessage(), before Kafka publish:
if (dto.fileIds?.length) {
  const nonReady = await this.fileRepo.find({
    where: { id: In(dto.fileIds), status: Not(FileStatus.READY) },
    select: ['id', 'name', 'status'],
  });
  if (nonReady.length > 0) {
    throw new BadRequestException(
      `Files not ready for chat: ${nonReady.map(f => `${f.name} (${f.status})`).join(', ')}`,
    );
  }
}
```

---

## Test Plan

| # | Test | Assert |
|---|------|--------|
| 1 | Send chat with fileIds where one is `processing` | 400, error names the file |
| 2 | Send chat with fileIds where one is `failed` | 400 |
| 3 | Send chat with fileIds all `ready` | 200, Kafka event published |
| 4 | Send chat with no fileIds | 200, no validation triggered |
| 5 | Send chat with mix of ready and processing | 400, only non-ready files listed |
| 6 | Send chat with non-existent fileId | 200 (not found in non-ready query, Kafka event published — agent handles gracefully) |
