import 'dotenv/config';
import { VoltAgent, Agent } from '@voltagent/core';
import { honoServer } from '@voltagent/server-hono';
import { anthropic } from '@ai-sdk/anthropic';
import {
  hybridSearchTool,
  setSearchAdapter as setHybridSearch,
} from '../../agent/src/tools/hybrid-search.tool';
import {
  keywordSearchTool,
  setSearchAdapter as setKeywordSearch,
} from '../../agent/src/tools/keyword-search.tool';
import { extractTextTool } from '../../agent/src/tools/extract-text.tool';
import { chunkTextTool } from '../../agent/src/tools/chunk-text.tool';
import {
  embedAndStoreTool,
  setEmbeddingAdapter,
} from '../../agent/src/tools/embed-and-store.tool';
import {
  getFileContentTool,
  setSearchAdapter as setGetFileContent,
} from '../../agent/src/tools/get-file-content.tool';
import { compareFilesTool } from '../../agent/src/tools/compare-files.tool';
import { summarizeDocumentTool } from '../../agent/src/tools/summarize-document.tool';
import { evaluateCitationConfidenceTool } from '../../agent/src/tools/evaluate-citation-confidence.tool';
import { StubSearchAdapter, StubEmbeddingAdapter } from './dev-adapters';

const stubSearch = new StubSearchAdapter();
const stubEmbedding = new StubEmbeddingAdapter();

setHybridSearch(stubSearch);
setKeywordSearch(stubSearch);
setGetFileContent(stubSearch as any);
setEmbeddingAdapter(stubEmbedding);

const searchModel =
  process.env['ANTHROPIC_SEARCH_MODEL'] || 'claude-haiku-4-5-20251001';
const ingestionModel =
  process.env['ANTHROPIC_INGESTION_MODEL'] || 'claude-haiku-4-5-20251001';
const analysisModel =
  process.env['ANTHROPIC_ANALYSIS_MODEL'] || 'claude-sonnet-4-20250514';
const summaryModel =
  process.env['ANTHROPIC_SUMMARY_MODEL'] || 'claude-sonnet-4-20250514';
const citationModel =
  process.env['ANTHROPIC_CITATION_MODEL'] || 'claude-haiku-4-5-20251001';
const supervisorModel =
  process.env['ANTHROPIC_SUPERVISOR_MODEL'] || 'claude-sonnet-4-20250514';

const searchAgent = new Agent({
  name: 'SearchAgent',
  instructions: `You search the user's uploaded documents using hybrid search.
    Use hybridSearch for natural language queries.
    Use keywordSearch when the user asks for exact filenames or terms.
    Always include relevant context from search results in your response.`,
  model: anthropic(searchModel),
  tools: [hybridSearchTool, keywordSearchTool],
});

const ingestionAgent = new Agent({
  name: 'IngestionAgent',
  instructions: `You process uploaded files through the ingestion pipeline.
    Extract text based on file type. Chunk using recursive splitting.
    Generate embeddings and store in Weaviate.
    Report the number of chunks and vectors created.`,
  model: anthropic(ingestionModel),
  tools: [extractTextTool, chunkTextTool, embedAndStoreTool],
});

const analysisAgent = new Agent({
  name: 'AnalysisAgent',
  instructions: `You analyze file contents in detail. You can retrieve full
    file content and compare multiple files. Provide thorough analysis
    with specific references to the content.`,
  model: anthropic(analysisModel),
  tools: [getFileContentTool, compareFilesTool],
});

const summaryAgent = new Agent({
  name: 'SummaryAgent',
  instructions: `You produce concise summaries of documents. Adapt summary
    length and detail level based on user request. Include key topics
    and important findings.`,
  model: anthropic(summaryModel),
  tools: [summarizeDocumentTool],
});

const citationAgent = new Agent({
  name: 'CitationAgent',
  instructions: `You are a citation specialist. Your job has TWO phases:

    PHASE 1 - CITE: Take the raw response and source chunks, rewrite with:
    1. INLINE NUMBERED CITATIONS [1], [2] after each factual claim
    2. QUOTED EXCERPTS using blockquote (> "quote" [N]) for key claims
    3. REFERENCES SECTION at the end with file name, chunk index, description

    PHASE 2 - EVALUATE: After producing the cited response:
    1. Count the number of factual claims you made
    2. Call evaluateCitationConfidence with the cited text, source count, and claim count
    3. Report the confidence score and any weaknesses in your response

    If the tool reports needsRevision: true, explicitly state what was weak so the
    supervisor can ask SummaryAgent to improve those areas.

    Rules:
    - Never invent citations. Every [N] must map to a real source.
    - If no sources are available, return the response unchanged with a note.
    - Preserve the original response's structure and meaning.
    - ALWAYS call evaluateCitationConfidence before finishing.`,
  model: anthropic(citationModel),
  tools: [evaluateCitationConfidenceTool],
});

const supervisor = new Agent({
  name: 'FilesAssistant',
  instructions: `You are a files assistant supervisor. You coordinate specialized agents
    to help users search, analyze, and understand their uploaded documents.
    Delegate to the appropriate agent based on the user's request.
    After any response that uses file content, always run CitationAgent as the final step.`,
  model: anthropic(supervisorModel),
  subAgents: [
    searchAgent,
    ingestionAgent,
    analysisAgent,
    summaryAgent,
    citationAgent,
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
});

new VoltAgent({
  agents: {
    supervisor,
  },
  server: honoServer(),
});
