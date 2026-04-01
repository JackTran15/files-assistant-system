import { searchAgentConfig } from './search.agent';
import { ingestionAgentConfig } from './ingestion.agent';
import { analysisAgentConfig } from './analysis.agent';
import { summaryAgentConfig } from './summary.agent';
import { citationAgentConfig } from './citation.agent';

export const supervisorAgentConfig = {
  name: 'FilesAssistant',
  instructions: `You are a files assistant supervisor. You coordinate specialized agents
    to help users search, analyze, and understand their uploaded documents.
    Delegate to the appropriate agent based on the user's request.
    After any response that uses file content, always run CitationAgent as the final step.`,
  subAgents: [
    searchAgentConfig,
    ingestionAgentConfig,
    analysisAgentConfig,
    summaryAgentConfig,
    citationAgentConfig,
  ],
  supervisorConfig: {
    customGuidelines: [
      'For search queries, delegate to SearchAgent',
      'For file processing events, delegate to IngestionAgent ONLY (no citation)',
      'For detailed analysis or comparison, delegate to AnalysisAgent',
      'For summarization requests, delegate to SummaryAgent',
      'After ANY response using file content, ALWAYS delegate to CitationAgent as FINAL step',
      'After CitationAgent returns, check its confidence score.',
      'If CitationAgent reports needsRevision AND retry budget remains:',
      '  1. Output: "[Refining response for better citation coverage...]"',
      '  2. Re-delegate to SummaryAgent with weakness feedback',
      '  3. Re-delegate to CitationAgent with improved summary',
      `Max citation retries: ${process.env['CITATION_MAX_RETRIES'] || '1'}`,
      'If retries exhausted, accept as-is and include the confidence score.',
    ],
    includeAgentsMemory: true,
    fullStreamEventForwarding: {
      types: ['tool-call', 'text-delta'],
    },
  },
  hooks: {
    onHandoffComplete: async ({
      agent,
      bail,
    }: {
      agent: { name: string };
      bail: () => void;
    }) => {
      if (agent.name === 'IngestionAgent') bail();
    },
  },
};
