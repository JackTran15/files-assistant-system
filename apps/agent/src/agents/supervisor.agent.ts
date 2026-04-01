import { searchAgentConfig } from './search.agent';
import { ingestionAgentConfig } from './ingestion.agent';
import { analysisAgentConfig } from './analysis.agent';
import { summaryAgentConfig } from './summary.agent';
import { citationAgentConfig } from './citation.agent';

export const supervisorAgentConfig = {
  name: 'FilesAssistant',
  instructions: `Files assistant supervisor. Coordinate agents to search, analyze, and summarize uploaded documents. After any file-content response, run CitationAgent as final step.`,
  subAgents: [
    searchAgentConfig,
    ingestionAgentConfig,
    analysisAgentConfig,
    summaryAgentConfig,
    citationAgentConfig,
  ],
  supervisorConfig: {
    customGuidelines: [
      'User messages have [Context] lines with tenantId and optional selectedFileIds. Pass tenantId to all tool calls. Pass fileIds when present.',
      'Routing: search→SearchAgent, file processing→IngestionAgent (no citation), analysis/comparison→AnalysisAgent, summarization→SummaryAgent.',
      'After file-content responses, delegate to CitationAgent. If needsRevision and retries remain, re-delegate to SummaryAgent then CitationAgent.',
      `Max citation retries: ${process.env['CITATION_MAX_RETRIES'] || '1'}. If exhausted, accept as-is with confidence score.`,
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
