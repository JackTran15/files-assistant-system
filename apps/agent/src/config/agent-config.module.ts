import { Module, OnModuleInit } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { Agent } from '@voltagent/core';
import { anthropic } from '@ai-sdk/anthropic';
import { WeaviateStorageAdapter } from '../adapters/weaviate-storage.adapter';
import { WeaviateAdapter } from '../adapters/weaviate.adapter';
import { GrpcResponseAdapter } from '../adapters/grpc-response.adapter';
import { KafkaEventAdapter } from '../adapters/kafka-event.adapter';
import { STORAGE_PORT, SEARCH_PORT, EMBEDDING_PORT } from '@files-assistant/core';
import { VoyageEmbeddingAdapter } from '../adapters/voyage-embedding.adapter';
import { setSearchAdapter } from '../tools/search-files.tool';
import { setWeaviateAdapter } from '../tools/read-file.tool';
import { setChunkReader } from '../tools/read-chunk.tool';
import { setAnthropicClient } from '../tools/extract-text.tool';
import { filesAssistantAgentConfig } from '../agents/files-assistant.agent';
import { toolLoggingHooks } from '../hooks/tool-logging.hooks';
import Anthropic from '@anthropic-ai/sdk';

function createFilesAssistantAgent() {
  const modelId =
    process.env['ANTHROPIC_MODEL'] || 'claude-sonnet-4-20250514';

  return new Agent({
    name: filesAssistantAgentConfig.name,
    instructions: filesAssistantAgentConfig.instructions,
    model: anthropic(modelId),
    tools: filesAssistantAgentConfig.tools,
    hooks: toolLoggingHooks,
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
    WeaviateStorageAdapter,
    WeaviateAdapter,
    GrpcResponseAdapter,
    KafkaEventAdapter,
    {
      provide: EMBEDDING_PORT,
      useExisting: VoyageEmbeddingAdapter,
    },
    {
      provide: STORAGE_PORT,
      useExisting: WeaviateStorageAdapter,
    },
    {
      provide: SEARCH_PORT,
      useExisting: WeaviateAdapter,
    },
    {
      provide: 'SUPERVISOR_AGENT',
      useFactory: () => createFilesAssistantAgent(),
    },
  ],
  exports: [
    VoyageEmbeddingAdapter,
    WeaviateStorageAdapter,
    WeaviateAdapter,
    GrpcResponseAdapter,
    KafkaEventAdapter,
    EMBEDDING_PORT,
    STORAGE_PORT,
    SEARCH_PORT,
    'SUPERVISOR_AGENT',
  ],
})
export class AgentConfigModule implements OnModuleInit {
  constructor(private readonly weaviateAdapter: WeaviateAdapter) {}

  onModuleInit() {
    setSearchAdapter(this.weaviateAdapter);
    setWeaviateAdapter(this.weaviateAdapter);
    setChunkReader(this.weaviateAdapter);
    setAnthropicClient(new Anthropic());
  }
}
