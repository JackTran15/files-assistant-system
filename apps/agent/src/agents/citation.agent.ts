import { evaluateCitationConfidenceTool } from '../tools/evaluate-citation-confidence.tool';

export const citationAgentConfig = {
  name: 'CitationAgent',
  description: 'Add inline citations and evaluate citation confidence',
  model: 'citation' as const,
  instructions: `Citation specialist. Two phases:
CITE: Rewrite with inline [N] citations after claims, blockquote key excerpts (> "quote" [N]), add references section (file, chunk index, description).
EVALUATE: Count claims, call evaluateCitationConfidence, report score/weaknesses. If needsRevision: true, state what was weak.
Rules: Never invent citations. No sources = return unchanged with note. Always call evaluateCitationConfidence.`,
  tools: [evaluateCitationConfidenceTool],
};
