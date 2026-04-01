import {
  cleanAssistantContent,
  stripThinkingBlocks,
  extractThinkingAndContent,
} from './clean-content';

describe('stripThinkingBlocks', () => {
  it('should remove complete thinking blocks', () => {
    const input = '<thinking>internal reasoning here</thinking>The actual answer.';
    expect(stripThinkingBlocks(input)).toBe('The actual answer.');
  });

  it('should remove multiple thinking blocks', () => {
    const input =
      '<thinking>step 1</thinking>Part one. <thinking>step 2</thinking>Part two.';
    expect(stripThinkingBlocks(input)).toBe('Part one. Part two.');
  });

  it('should remove multiline thinking blocks', () => {
    const input = `<thinking>
I need to search for files.
Let me analyze the results.
</thinking>
Here is the answer.`;
    expect(stripThinkingBlocks(input)).toBe('Here is the answer.');
  });

  it('should not remove partial open tag when not streaming', () => {
    const input = 'Answer so far <thinking>partial reasoning';
    expect(stripThinkingBlocks(input, false)).toBe(
      'Answer so far <thinking>partial reasoning',
    );
  });

  it('should remove partial trailing block when streaming', () => {
    const input = 'Answer so far <thinking>partial reasoning still going';
    expect(stripThinkingBlocks(input, true)).toBe('Answer so far ');
  });

  it('should handle content with no thinking blocks', () => {
    const input = 'Just a normal response [1] with citations.';
    expect(stripThinkingBlocks(input)).toBe(input);
  });

  it('should handle empty string', () => {
    expect(stripThinkingBlocks('')).toBe('');
  });

  it('should handle thinking block at the very start', () => {
    const input = '<thinking>reasoning</thinking>Answer here.';
    expect(stripThinkingBlocks(input)).toBe('Answer here.');
  });

  it('should strip trailing whitespace after thinking block', () => {
    const input = '<thinking>reasoning</thinking>  Clean answer.';
    expect(stripThinkingBlocks(input)).toBe('Clean answer.');
  });
});

describe('cleanAssistantContent', () => {
  it('should strip complete thinking blocks', () => {
    const input =
      '<thinking>internal</thinking>Final answer [1].';
    expect(cleanAssistantContent(input)).toBe('Final answer [1].');
  });

  it('should strip trailing partial thinking block', () => {
    const input = 'Answer so far <thinking>unfinished reasoning';
    expect(cleanAssistantContent(input)).toBe('Answer so far');
  });

  it('should strip both complete and partial blocks', () => {
    const input =
      '<thinking>step 1</thinking>Content. <thinking>step 2 unfinished';
    expect(cleanAssistantContent(input)).toBe('Content.');
  });

  it('should not strip untagged narration', () => {
    const input = "I'll search the files. Here is the answer.";
    expect(cleanAssistantContent(input)).toBe(input);
  });

  it('should handle content with no thinking blocks', () => {
    const input = 'Clean content only.';
    expect(cleanAssistantContent(input)).toBe(input);
  });
});

describe('extractThinkingAndContent', () => {
  it('should extract latest thinking block content during streaming', () => {
    const input =
      '<thinking>first thought</thinking>Part one. <thinking>second thought</thinking>Part two.';
    const result = extractThinkingAndContent(input, true);

    expect(result.thinking).toBe('second thought');
    expect(result.content).toBe('Part one. Part two.');
  });

  it('should extract partial thinking block content during streaming', () => {
    const input = '<thinking>completed</thinking>Answer. <thinking>still thinking about this';
    const result = extractThinkingAndContent(input, true);

    expect(result.thinking).toBe('still thinking about this');
    expect(result.content).toBe('Answer.');
  });

  it('should return only thinking when no content yet (streaming)', () => {
    const input = '<thinking>I need to search the files for information</thinking>';
    const result = extractThinkingAndContent(input, true);

    expect(result.thinking).toBe('I need to search the files for information');
    expect(result.content).toBe('');
  });

  it('should return only thinking for partial block with no content (streaming)', () => {
    const input = '<thinking>searching for relevant information';
    const result = extractThinkingAndContent(input, true);

    expect(result.thinking).toBe('searching for relevant information');
    expect(result.content).toBe('');
  });

  it('should return null thinking when no thinking blocks exist (streaming)', () => {
    const input = 'Based on the documents, here are the key points.';
    const result = extractThinkingAndContent(input, true);

    expect(result.thinking).toBeNull();
    expect(result.content).toBe(input);
  });

  it('should not treat untagged narration as thinking (streaming)', () => {
    const input = "I'll search the files. Here is the answer.";
    const result = extractThinkingAndContent(input, true);

    expect(result.thinking).toBeNull();
    expect(result.content).toBe(input);
  });

  it('should return null thinking in finalized (non-streaming) mode', () => {
    const input =
      '<thinking>reasoning</thinking>The final answer is here.';
    const result = extractThinkingAndContent(input, false);

    expect(result.thinking).toBeNull();
    expect(result.content).toBe('The final answer is here.');
  });

  it('should strip trailing partial in finalized mode', () => {
    const input = 'Answer <thinking>leftover partial';
    const result = extractThinkingAndContent(input, false);

    expect(result.thinking).toBeNull();
    expect(result.content).toBe('Answer');
  });

  it('should handle multiline thinking blocks during streaming', () => {
    const input = `<thinking>
Let me analyze this document.
I see several key sections.
</thinking>
The document contains three main sections.`;
    const result = extractThinkingAndContent(input, true);

    expect(result.thinking).toBe(
      'Let me analyze this document.\nI see several key sections.',
    );
    expect(result.content).toBe('The document contains three main sections.');
  });

  it('should handle empty thinking block', () => {
    const input = '<thinking></thinking>Answer.';
    const result = extractThinkingAndContent(input, true);

    expect(result.content).toBe('Answer.');
  });
});
