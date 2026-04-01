import 'dotenv/config';
import { VoltAgent, Agent } from '@voltagent/core';
import { honoServer } from '@voltagent/server-hono';
import { anthropic } from '@ai-sdk/anthropic';
import {
  searchFilesTool,
  setSearchAdapter,
} from '../../agent/src/tools/search-files.tool';
import {
  readFileTool,
  setWeaviateAdapter,
} from '../../agent/src/tools/read-file.tool';
import { filesAssistantAgentConfig } from '../../agent/src/agents/files-assistant.agent';
import { StubSearchAdapter } from './dev-adapters';
import { toolLoggingHooks } from '../../agent/src/hooks/tool-logging.hooks';

const stubSearch = new StubSearchAdapter();

setSearchAdapter(stubSearch);
setWeaviateAdapter(stubSearch);

const modelId =
  process.env['ANTHROPIC_MODEL'] || 'claude-sonnet-4-20250514';

const filesAssistant = new Agent({
  name: filesAssistantAgentConfig.name,
  instructions: filesAssistantAgentConfig.instructions,
  model: anthropic(modelId),
  tools: filesAssistantAgentConfig.tools,
  hooks: toolLoggingHooks,
});

new VoltAgent({
  agents: {
    supervisor: filesAssistant,
  },
  server: honoServer(),
});
