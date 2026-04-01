import type { AgentHooks } from '@voltagent/core';

const MAX_LOG_CHARS = 1000;

function truncate(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  const str =
    typeof value === 'string' ? value : JSON.stringify(value, null, 0);
  if (!str) return 'undefined';
  if (str.length <= MAX_LOG_CHARS) return str;
  return str.slice(0, MAX_LOG_CHARS) + `... [truncated, ${str.length} chars]`;
}

export const toolLoggingHooks: AgentHooks = {
  onToolStart({ agent, tool, args }) {
    console.log(
      `[ToolCall] [${agent.name}] >> ${tool.name} called\n  args: ${truncate(args)}`,
    );
  },

  onToolEnd({ agent, tool, output, error }) {
    if (error) {
      console.error(
        `[ToolCall] [${agent.name}] !! ${tool.name} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } else {
      console.log(
        `[ToolCall] [${agent.name}] << ${tool.name} returned\n  result: ${truncate(output)}`,
      );
    }
    return undefined;
  },

  onToolError({ agent, tool, error }) {
    console.error(
      `[ToolCall] [${agent.name}] !! ${tool.name} error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  },
};
