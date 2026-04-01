import weaviate, { WeaviateClient } from 'weaviate-client';
import { WeaviateConfig, defaultWeaviateConfig } from './weaviate.config';

let clientInstance: WeaviateClient | null = null;

export async function getWeaviateClient(
  config: Partial<WeaviateConfig> = {},
): Promise<WeaviateClient> {
  if (clientInstance) return clientInstance;

  const mergedConfig = { ...defaultWeaviateConfig, ...config };

  clientInstance = await weaviate.connectToLocal({
    host: mergedConfig.host,
    port: mergedConfig.httpPort,
    grpcPort: mergedConfig.grpcPort,
  });

  return clientInstance;
}

export async function closeWeaviateClient(): Promise<void> {
  if (clientInstance) {
    clientInstance.close();
    clientInstance = null;
  }
}
