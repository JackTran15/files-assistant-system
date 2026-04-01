import { extractTextTool } from '../tools/extract-text.tool';
import { chunkTextTool } from '../tools/chunk-text.tool';
import { embedAndStoreTool } from '../tools/embed-and-store.tool';

export const ingestionAgentConfig = {
  name: 'IngestionAgent',
  description:
    'Process uploaded files: extract text, chunk, embed, store vectors',
  model: 'ingestion' as const,
  instructions: `Process uploaded files: extract text by type, chunk recursively, embed and store in Weaviate. Report chunk/vector counts.`,
  tools: [extractTextTool, chunkTextTool, embedAndStoreTool],
};
