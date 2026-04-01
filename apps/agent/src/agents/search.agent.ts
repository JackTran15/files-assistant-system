import { hybridSearchTool } from '../tools/hybrid-search.tool';
import { keywordSearchTool } from '../tools/keyword-search.tool';

export const searchAgentConfig = {
  name: 'SearchAgent',
  description: 'Semantic and keyword search over uploaded files',
  model: 'search' as const,
  instructions: `You search the user's uploaded documents using hybrid search.
    Use hybridSearch for natural language queries.
    Use keywordSearch when the user asks for exact filenames or terms.
    Always include relevant context from search results in your response.`,
  tools: [hybridSearchTool, keywordSearchTool],
};
