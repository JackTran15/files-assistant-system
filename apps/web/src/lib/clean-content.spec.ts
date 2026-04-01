import {
  cleanAssistantContent,
  stripProcessLeadIn,
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

describe('stripProcessLeadIn', () => {
  it('should remove leading "I will search" narration', () => {
    const input =
      "I'll search the selected file first. The answer is that Jack is not mentioned.";
    expect(stripProcessLeadIn(input)).toBe(
      'The answer is that Jack is not mentioned.',
    );
  });

  it('should remove multiple lead-in narration sentences', () => {
    const input =
      'I will search the selected file. Let me search more specifically: Final answer [1].';
    expect(stripProcessLeadIn(input)).toBe('Final answer [1].');
  });

  it('should not alter a clean answer', () => {
    const input = 'Next.js supports SSR and SSG [1].';
    expect(stripProcessLeadIn(input)).toBe(input);
  });
});

describe('cleanAssistantContent', () => {
  it('should strip both thinking blocks and process lead-in', () => {
    const input =
      "<thinking>internal</thinking>I'll search now. Let me check quickly: Final answer [1].";
    expect(cleanAssistantContent(input)).toBe('Final answer [1].');
  });
});

describe('extractThinkingAndContent', () => {
  it('should extract latest narration and strip all narrations during streaming', () => {
    const input =
      "Let me try a different search approach to find information about Jack's hobbies." +
      "Let me read the full content of Jack's resume." +
      "Let me search in the other file to see if there's personal information.";

    const result = extractThinkingAndContent(input, true);

    expect(result.thinking).toBe(
      "Let me search in the other file to see if there's personal information.",
    );
    expect(result.content).toBe('');
  });

  it('should return content separately from narration', () => {
    const input =
      "Let me search for Jack's skills. Based on the resume, Jack knows TypeScript and React.";

    const result = extractThinkingAndContent(input, true);

    expect(result.thinking).toBe("Let me search for Jack's skills.");
    expect(result.content).toBe(
      'Based on the resume, Jack knows TypeScript and React.',
    );
  });

  it('should return null thinking when no narration found', () => {
    const input = 'Based on the documents, here are the key points.';
    const result = extractThinkingAndContent(input, true);

    expect(result.thinking).toBeNull();
    expect(result.content).toBe(input);
  });

  it('should handle thinking tags + narration together', () => {
    const input =
      "<thinking>reasoning</thinking>Let me check the file. Here's the answer.";

    const result = extractThinkingAndContent(input, true);

    expect(result.thinking).toBe('Let me check the file.');
    expect(result.content).toBe("Here's the answer.");
  });

  it('should strip narration from finalized (non-streaming) content', () => {
    const input =
      "Let me search for the data. Here's what I found in the documents [1].";
    const result = extractThinkingAndContent(input, false);

    expect(result.thinking).toBeNull();
    expect(result.content).toBe(
      "Here's what I found in the documents [1].",
    );
  });

  it('should handle "I will read" narration pattern', () => {
    const input = "I'll read the document to find relevant sections. The skills section mentions Python.";
    const result = extractThinkingAndContent(input, true);

    expect(result.thinking).toBe("I'll read the document to find relevant sections.");
    expect(result.content).toBe('The skills section mentions Python.');
  });

  it('should show thinking when only narration exists (no content yet)', () => {
    const input = "Let me search the uploaded files for information about hobbies.";
    const result = extractThinkingAndContent(input, true);

    expect(result.thinking).toBe(input);
    expect(result.content).toBe('');
  });
});
