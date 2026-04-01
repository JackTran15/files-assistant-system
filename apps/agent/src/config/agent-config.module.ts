import { Module, OnModuleInit } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { Agent } from '@voltagent/core';
import { anthropic } from '@ai-sdk/anthropic';
import { VoyageEmbeddingAdapter } from '../adapters/voyage-embedding.adapter';
import { WeaviateAdapter } from '../adapters/weaviate.adapter';
import { PostgresAdapter } from '../adapters/postgres.adapter';
import { GrpcResponseAdapter } from '../adapters/grpc-response.adapter';
import { KafkaEventAdapter } from '../adapters/kafka-event.adapter';
import { EMBEDDING_PORT, SEARCH_PORT } from '@files-assistant/core';
import { setEmbeddingAdapter } from '../tools/embed-and-store.tool';
import { setSearchAdapter as setHybridSearchAdapter } from '../tools/hybrid-search.tool';
import { setSearchAdapter as setKeywordSearchAdapter } from '../tools/keyword-search.tool';
import { setSearchAdapter as setGetFileContentAdapter } from '../tools/get-file-content.tool';
import { setAnthropicClient } from '../tools/extract-text.tool';
import { setIngestionAnthropicClient } from '../consumers/ingestion.consumer';
import { supervisorAgentConfig } from '../agents/supervisor.agent';
import Anthropic from '@anthropic-ai/sdk';

const MODEL_ENV_MAP: Record<string, { env: string; fallback: string }> = {
  search: {
    env: 'ANTHROPIC_SEARCH_MODEL',
    fallback: 'claude-haiku-4-5-20251001',
  },
  ingestion: {
    env: 'ANTHROPIC_INGESTION_MODEL',
    fallback: 'claude-haiku-4-5-20251001',
  },
  analysis: {
    env: 'ANTHROPIC_ANALYSIS_MODEL',
    fallback: 'claude-sonnet-4-20250514',
  },
  summary: {
    env: 'ANTHROPIC_SUMMARY_MODEL',
    fallback: 'claude-sonnet-4-20250514',
  },
  citation: {
    env: 'ANTHROPIC_CITATION_MODEL',
    fallback: 'claude-haiku-4-5-20251001',
  },
};

function resolveModel(label: string) {
  const entry = MODEL_ENV_MAP[label];
  const modelId = entry
    ? process.env[entry.env] || entry.fallback
    : 'claude-sonnet-4-20250514';
  return anthropic(modelId);
}

function createSupervisorAgent() {
  const subAgents = supervisorAgentConfig.subAgents.map(
    (config) =>
      new Agent({
        name: config.name,
        instructions: config.instructions,
        model: resolveModel(config.model),
        tools: config.tools,
      }),
  );

  return new Agent({
    name: supervisorAgentConfig.name,
    instructions: supervisorAgentConfig.instructions,
    model: anthropic(
      process.env['ANTHROPIC_SUPERVISOR_MODEL'] || 'claude-haiku-4-5-20251001',
    ),
    subAgents,
    supervisorConfig: {
      ...supervisorAgentConfig.supervisorConfig,
      fullStreamEventForwarding: {
        types: ['tool-call', 'text-delta'] as const,
      },
    },
  });
}

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'CHAT_STREAM_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'chatstream',
          protoPath: join(__dirname, '../../../libs/proto/chat-stream.proto'),
          url: process.env['BACKEND_GRPC_URL'] || 'localhost:5050',
        },
      },
    ]),
  ],
  providers: [
    VoyageEmbeddingAdapter,
    WeaviateAdapter,
    PostgresAdapter,
    GrpcResponseAdapter,
    KafkaEventAdapter,
    {
      provide: EMBEDDING_PORT,
      useExisting: VoyageEmbeddingAdapter,
    },
    {
      provide: SEARCH_PORT,
      useExisting: WeaviateAdapter,
    },
    {
      provide: 'SUPERVISOR_AGENT',
      useFactory: () => createSupervisorAgent(),
    },
  ],
  exports: [
    VoyageEmbeddingAdapter,
    WeaviateAdapter,
    PostgresAdapter,
    GrpcResponseAdapter,
    KafkaEventAdapter,
    EMBEDDING_PORT,
    SEARCH_PORT,
    'SUPERVISOR_AGENT',
  ],
})
export class AgentConfigModule implements OnModuleInit {
  constructor(
    private readonly voyageAdapter: VoyageEmbeddingAdapter,
    private readonly weaviateAdapter: WeaviateAdapter,
  ) {}

  onModuleInit() {
    setEmbeddingAdapter(this.voyageAdapter);
    setHybridSearchAdapter(this.weaviateAdapter);
    setKeywordSearchAdapter(this.weaviateAdapter);
    setGetFileContentAdapter(this.weaviateAdapter);
    const client = new Anthropic();
    setAnthropicClient(client);
    setIngestionAnthropicClient(client);
  }
}
