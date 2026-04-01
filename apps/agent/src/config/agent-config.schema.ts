import { z } from 'zod';

/** Documented env surface for the agent service (optional validation wiring). */
export const agentConfigSchema = z.object({
  REDPANDA_BROKER: z.string().default('localhost:19092'),
  ANTHROPIC_API_KEY: z.string(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-20250514'),
  ANTHROPIC_HAIKU_MODEL: z.string().default('claude-haiku-4-5-20251001'),
  BACKEND_GRPC_URL: z.string().default('localhost:5050'),
  MAX_FILE_CONTENT_CHARS: z.coerce.number().default(20000),
  MAX_SEARCH_CHUNK_CHARS: z.coerce.number().default(1200),
  WEAVIATE_HOST: z.string().default('localhost'),
  WEAVIATE_HTTP_PORT: z.coerce.number().default(8080),
  WEAVIATE_GRPC_PORT: z.coerce.number().default(50051),
  DATABASE_HOST: z.string().default('localhost'),
  DATABASE_PORT: z.coerce.number().default(5432),
  DATABASE_NAME: z.string().default('files_assistant'),
  DATABASE_USER: z.string().default('postgres'),
  DATABASE_PASSWORD: z.string().default('postgres'),
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;
