# Files Assistant

AI-powered files assistant that enables semantic search and Q&A over uploaded documents. Upload files (PDF, DOCX, plain text), the system extracts, chunks, and embeds the content, then a multi-agent AI system answers natural language questions grounded in the retrieved context (RAG).

## Architecture

Two independent services communicating through Redpanda (Kafka):

- **Backend** (`apps/backend`) -- NestJS CRUD API, Multer uploads, Swagger docs, SSE streaming
- **Agent** (`apps/agent`) -- VoltAgent multi-agent system (supervisor + 4 sub-agents), Kafka consumer
- **Agent Dev** (`apps/agent-dev`) -- Standalone VoltAgent dev server with VoltOps dashboard

Shared libraries:

- `libs/core` -- Pure TypeScript: ports, types, extraction, chunking
- `libs/events` -- Kafka event schemas (shared between services)
- `libs/weaviate` -- Weaviate client wrapper and collection schemas

## Prerequisites

- Node.js 22+
- pnpm 10+
- Docker & Docker Compose

## Quick Start

```bash
# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL, Weaviate, Redpanda)
docker compose up -d

# Copy environment variables
cp .env.example .env
# Edit .env with your OPENAI_API_KEY

# Start backend API (:3000)
pnpm exec nx serve backend

# Start agent service (Kafka consumer)
pnpm exec nx serve agent

# Start agent dev server with VoltOps dashboard (:3141)
pnpm exec nx serve agent-dev
```

## Development Commands

```bash
# Serve
pnpm exec nx serve backend              # NestJS API (:3000)
pnpm exec nx serve agent                # Kafka consumer agent
pnpm exec nx serve agent-dev            # VoltAgent + VoltOps (:3141)

# Build
pnpm exec nx build backend --configuration=production
pnpm exec nx build agent --configuration=production

# Test
pnpm exec nx test core                  # libs unit tests
pnpm exec nx test events                # event schema tests
pnpm exec nx test backend               # backend tests
pnpm exec nx test agent                 # agent tests

# Affected (CI)
pnpm exec nx affected -t lint,test,build

# Dependency graph
pnpm exec nx graph
```

## API Documentation

When the backend is running, Swagger UI is available at:

```
http://localhost:3000/api/docs
```

### Endpoints

| Method   | Path                    | Description                        |
|----------|-------------------------|------------------------------------|
| `POST`   | `/api/files/upload`     | Upload a file for processing       |
| `GET`    | `/api/files`            | List files (paginated)             |
| `GET`    | `/api/files/:id`        | File details + status              |
| `DELETE` | `/api/files/:id`        | Delete file + vectors              |
| `GET`    | `/api/files/:id/events` | SSE: processing status             |
| `POST`   | `/api/chat`             | Send chat message                  |
| `GET`    | `/api/chat/stream/:id`  | SSE: stream response tokens        |
| `GET`    | `/api/chat/history`     | Conversation history               |
| `GET`    | `/api/health`           | Liveness probe                     |
| `GET`    | `/api/ready`            | Readiness probe                    |

## Infrastructure

```bash
docker compose up -d     # Start all services
docker compose down      # Stop all services
docker compose logs -f   # View logs
```

| Service           | Port  | Dashboard            |
|-------------------|-------|----------------------|
| PostgreSQL        | 5432  | --                   |
| Weaviate          | 8080  | --                   |
| Redpanda (Kafka)  | 19092 | --                   |
| Redpanda Console  | 8888  | http://localhost:8888|

## Project Structure

```
files-assistant/
  apps/
    backend/          NestJS CRUD API + Kafka producer
    agent/            VoltAgent multi-agent + Kafka consumer
    agent-dev/        VoltAgent standalone dev server
  libs/
    core/             Pure TS: ports, types, extraction, chunking
    events/           Kafka event schemas
    weaviate/         Weaviate client wrapper
```

## Tech Stack

| Layer              | Technology                           |
|--------------------|--------------------------------------|
| Monorepo           | Nx                                   |
| Backend            | NestJS, TypeORM, Swagger, Multer     |
| Agent              | VoltAgent, Zod                       |
| Vector DB          | Weaviate                             |
| Relational DB      | PostgreSQL                           |
| Event Streaming    | Redpanda (Kafka-compatible)          |
| Document Processing| pdf-parse, mammoth                   |
| LLM                | OpenAI (via Vercel AI SDK)           |
