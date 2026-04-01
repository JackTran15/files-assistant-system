import { extractTextTool } from '../tools/extract-text.tool';
import { chunkTextTool } from '../tools/chunk-text.tool';
import { embedAndStoreTool } from '../tools/embed-and-store.tool';

export const ingestionAgentConfig = {
  name: 'IngestionAgent',
  description:
    'Process uploaded files: extract text, chunk, embed, store vectors',
  model: 'ingestion' as const,
  instructions: `You process uploaded files through the ingestion pipeline.
    Extract text based on file type. Chunk using recursive splitting.
    Generate embeddings and store in Weaviate.
    Report the number of chunks and vectors created.`,
  tools: [extractTextTool, chunkTextTool, embedAndStoreTool],
};
