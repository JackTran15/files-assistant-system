import { summarizeDocumentTool } from '../tools/summarize-document.tool';

export const summaryAgentConfig = {
  name: 'SummaryAgent',
  description: 'Summarize documents at different levels of detail',
  model: 'summary' as const,
  instructions: `Summarize documents concisely. Adapt length/detail to user request. Include key topics and important findings.`,
  tools: [summarizeDocumentTool],
};
