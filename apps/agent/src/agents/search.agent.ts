import { hybridSearchTool } from '../tools/hybrid-search.tool';
import { keywordSearchTool } from '../tools/keyword-search.tool';

export const searchAgentConfig = {
  name: 'SearchAgent',
  description: 'Semantic and keyword search over uploaded files',
  model: 'search' as const,
  instructions: `Search user documents. Use hybridSearch for natural language queries, keywordSearch for exact filenames/terms. Include relevant context from results.`,
  tools: [hybridSearchTool, keywordSearchTool],
};
