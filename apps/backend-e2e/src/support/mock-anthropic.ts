const EXTRACTED_PDF_TEXT = [
  '# Test PDF Document',
  '',
  'This is a test PDF document for E2E ingestion pipeline testing.',
  'It contains text that should be extracted by the Haiku model.',
  '',
  '## Section 1',
  '',
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
].join('\n');

export function getExpectedPdfText(): string {
  return EXTRACTED_PDF_TEXT;
}

export function createMockAnthropicClient() {
  let shouldFail = false;

  const mock = {
    messages: {
      create: jest.fn().mockImplementation(async () => {
        if (shouldFail) {
          throw new Error('Mock Haiku extraction error: corrupt or unreadable PDF');
        }
        return {
          content: [{ type: 'text' as const, text: EXTRACTED_PDF_TEXT }],
          model: 'claude-haiku-4-5-20250414',
          role: 'assistant',
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 200 },
        };
      }),
    },

    setFailMode(fail: boolean) {
      shouldFail = fail;
    },

    reset() {
      shouldFail = false;
      mock.messages.create.mockClear();
    },
  };

  return mock;
}

export type MockAnthropicClient = ReturnType<typeof createMockAnthropicClient>;
