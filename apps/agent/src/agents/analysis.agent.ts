import { getFileContentTool } from '../tools/get-file-content.tool';
import { compareFilesTool } from '../tools/compare-files.tool';

export const analysisAgentConfig = {
  name: 'AnalysisAgent',
  description: 'Deep analysis and comparison of file contents',
  model: 'analysis' as const,
  instructions: `Analyze file contents in detail. Retrieve full content or compare multiple files. Provide thorough analysis with specific content references.`,
  tools: [getFileContentTool, compareFilesTool],
};
