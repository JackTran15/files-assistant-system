import { getFileContentTool } from '../tools/get-file-content.tool';
import { compareFilesTool } from '../tools/compare-files.tool';

export const analysisAgentConfig = {
  name: 'AnalysisAgent',
  description: 'Deep analysis and comparison of file contents',
  model: 'analysis' as const,
  instructions: `You analyze file contents in detail. You can retrieve full
    file content and compare multiple files. Provide thorough analysis
    with specific references to the content.`,
  tools: [getFileContentTool, compareFilesTool],
};
