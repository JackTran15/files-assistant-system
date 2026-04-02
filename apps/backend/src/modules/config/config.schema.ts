import { z } from 'zod';

export const configSchema = z.object({
  DATABASE_HOST: z.string().default('localhost'),
  DATABASE_PORT: z.coerce.number().default(5432),
  DATABASE_NAME: z.string().default('files_assistant'),
  DATABASE_USER: z.string().default('postgres'),
  DATABASE_PASSWORD: z.string().default('postgres'),
  WEAVIATE_HOST: z.string().default('localhost'),
  WEAVIATE_HTTP_PORT: z.coerce.number().default(8080),
  WEAVIATE_GRPC_PORT: z.coerce.number().default(50051),
  WEAVIATE_SCHEME: z.enum(['http', 'https']).default('http'),
  REDPANDA_BROKER: z.string().default('localhost:19092'),
  GRPC_PORT: z.coerce.number().default(5050),
  BACKEND_PORT: z.coerce.number().default(3000),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:4300,http://localhost:4200'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  STORAGE_TYPE: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./uploads'),
});

export type AppConfig = z.infer<typeof configSchema>;
