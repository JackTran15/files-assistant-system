import { createTool } from '@voltagent/core';
import { z } from 'zod';
import * as fs from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import {
  RateLimitError,
  APIConnectionTimeoutError,
  APIError,
} from '@anthropic-ai/sdk';
import { AgentProcessingError } from '@files-assistant/core';

let anthropicClient: Anthropic | null = null;

export function setAnthropicClient(client: Anthropic): void {
  anthropicClient = client;
}

const RAW_MIME_TYPES = ['text/plain', 'text/markdown', 'application/json'];

async function extractPdfWithHaiku(
  buffer: Buffer,
  fileName: string,
): Promise<{ text: string; method: 'haiku' }> {
  if (!anthropicClient) {
    throw new AgentProcessingError(
      'Anthropic client not initialized',
      'extraction',
      false,
    );
  }

  const model =
    process.env['ANTHROPIC_HAIKU_MODEL'] || 'claude-haiku-4-5-20251001';

  try {
    const response = await anthropicClient.messages.create({
      model,
      max_tokens: 16384,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: buffer.toString('base64'),
              },
            },
            {
              type: 'text',
              text: 'Extract all text content from this document. Preserve the structure: headings, paragraphs, lists, and tables. For tables, use markdown table format. Do not summarize or interpret — extract verbatim.',
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text' || !textBlock.text.trim()) {
      throw new AgentProcessingError(
        'PDF extraction returned empty text',
        'extraction',
        false,
      );
    }

    return { text: textBlock.text, method: 'haiku' };
  } catch (error) {
    if (error instanceof AgentProcessingError) throw error;
    if (error instanceof RateLimitError) {
      throw new AgentProcessingError(
        'Haiku rate limited',
        'extraction',
        true,
        error,
      );
    }
    if (error instanceof APIConnectionTimeoutError) {
      throw new AgentProcessingError(
        'Haiku request timed out',
        'extraction',
        true,
        error,
      );
    }
    if (error instanceof APIError) {
      throw new AgentProcessingError(
        `Haiku API error for ${fileName}: ${error.message}`,
        'extraction',
        true,
        error,
      );
    }
    throw new AgentProcessingError(
      `Unexpected error extracting PDF ${fileName}: ${error instanceof Error ? error.message : String(error)}`,
      'extraction',
      false,
      error instanceof Error ? error : undefined,
    );
  }
}

async function extractRawText(
  storagePath: string,
): Promise<{ text: string; method: 'raw' }> {
  try {
    const text = await fs.readFile(storagePath, 'utf-8');
    return { text, method: 'raw' };
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      throw new AgentProcessingError(
        'File not found at storage path',
        'extraction',
        false,
        error,
      );
    }
    throw new AgentProcessingError(
      `Failed to read file at ${storagePath}: ${error instanceof Error ? error.message : String(error)}`,
      'extraction',
      false,
      error instanceof Error ? error : undefined,
    );
  }
}

export const extractTextTool = createTool({
  name: 'extractText',
  description:
    'Extract text content from a file (PDF via Haiku, or raw read for TXT/MD/JSON)',
  parameters: z.object({
    fileId: z.string().describe('File ID to extract text from'),
    storagePath: z.string().describe('Path to the stored file'),
    mimeType: z.string().describe('MIME type of the file'),
  }),
  execute: async (input) => {
    let result: { text: string; method: 'haiku' | 'raw' };

    if (input.mimeType === 'application/pdf') {
      const buffer = await fs.readFile(input.storagePath).catch((error) => {
        if (
          error instanceof Error &&
          'code' in error &&
          (error as NodeJS.ErrnoException).code === 'ENOENT'
        ) {
          throw new AgentProcessingError(
            'File not found at storage path',
            'extraction',
            false,
            error,
          );
        }
        throw new AgentProcessingError(
          `Failed to read PDF file: ${error instanceof Error ? error.message : String(error)}`,
          'extraction',
          false,
          error instanceof Error ? error : undefined,
        );
      });
      result = await extractPdfWithHaiku(buffer, input.fileId);
    } else if (RAW_MIME_TYPES.includes(input.mimeType)) {
      result = await extractRawText(input.storagePath);
    } else {
      throw new AgentProcessingError(
        `Unsupported MIME type for extraction: ${input.mimeType}`,
        'extraction',
        false,
      );
    }

    if (!result.text.trim()) {
      throw new AgentProcessingError(
        'Extraction produced empty text',
        'extraction',
        false,
      );
    }

    return {
      fileId: input.fileId,
      text: result.text,
      method: result.method,
      characterCount: result.text.length,
    };
  },
});
