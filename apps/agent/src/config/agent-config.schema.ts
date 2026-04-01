import { z } from 'zod';

export const agentConfigSchema = z.object({
  REDPANDA_BROKER: z.string().default('localhost:19092'),
  ANTHROPIC_API_KEY: z.string(),
  VOYAGE_API_KEY: z.string(),
  ANTHROPIC_INGESTION_MODEL: z.string().default('claude-haiku-4-5-20251001'),
  ANTHROPIC_SUMMARY_MODEL: z.string().default('claude-sonnet-4-20250514'),
  ANTHROPIC_ANALYSIS_MODEL: z.string().default('claude-sonnet-4-20250514'),
  ANTHROPIC_SEARCH_MODEL: z.string().default('claude-haiku-4-5-20251001'),
  ANTHROPIC_CITATION_MODEL: z.string().default('claude-haiku-4-5-20251001'),
  ANTHROPIC_SUPERVISOR_MODEL: z.string().default('claude-sonnet-4-20250514'),
  BACKEND_GRPC_URL: z.string().default('localhost:5050'),
  CITATION_CONFIDENCE_THRESHOLD: z.coerce.number().default(0.7),
  CITATION_MAX_RETRIES: z.coerce.number().default(1),
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
