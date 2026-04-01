import weaviate, { WeaviateClient } from 'weaviate-client';

export const FILE_CHUNKS_COLLECTION = 'FileChunks';

export interface FileChunkProperties {
  content: string;
  fileId: string;
  fileName: string;
  chunkIndex: number;
  tenantId: string;
  startOffset: number;
  endOffset: number;
}

export async function ensureFileChunksCollection(
  client: WeaviateClient,
): Promise<void> {
  const exists = await client.collections.exists(FILE_CHUNKS_COLLECTION);
  if (exists) return;

  await client.collections.create({
    name: FILE_CHUNKS_COLLECTION,
    vectorizers: weaviate.configure.vectorizer.none({
      vectorIndexConfig: weaviate.configure.vectorIndex.hnsw({
        distanceMetric: 'cosine',
      }),
    }),
    properties: [
      { name: 'content', dataType: 'text' },
      { name: 'fileId', dataType: 'text' },
      { name: 'fileName', dataType: 'text' },
      { name: 'chunkIndex', dataType: 'int' },
      { name: 'tenantId', dataType: 'text' },
      { name: 'startOffset', dataType: 'int' },
      { name: 'endOffset', dataType: 'int' },
    ],
  });
}

export async function resetFileChunksCollection(
  client: WeaviateClient,
): Promise<void> {
  const exists = await client.collections.exists(FILE_CHUNKS_COLLECTION);
  if (exists) {
    await client.collections.delete(FILE_CHUNKS_COLLECTION);
  }
  await ensureFileChunksCollection(client);
}
