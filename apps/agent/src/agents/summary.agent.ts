import { summarizeDocumentTool } from '../tools/summarize-document.tool';

export const summaryAgentConfig = {
  name: 'SummaryAgent',
  description: 'Summarize documents at different levels of detail',
  model: 'summary' as const,
  instructions: `You produce concise summaries of documents. Adapt summary
    length and detail level based on user request. Include key topics
    and important findings.`,
  tools: [summarizeDocumentTool],
};
