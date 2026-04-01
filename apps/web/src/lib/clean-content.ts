const COMPLETE_THINKING_RE = /<thinking>[\s\S]*?<\/thinking>\s*/g;
const PARTIAL_THINKING_RE = /<thinking>[\s\S]*$/;

const NARRATION_VERBS =
  'search|look|check|find|scan|review|read|try|analy[zs]e|examine|explore|investigate';

/** Matches a single narration sentence anywhere in text. */
const NARRATION_SENTENCE_RE = new RegExp(
  `(?:(?:I(?:'|')ll|I will|Let me)\\s+(?:${NARRATION_VERBS})[^.!?\\n]{0,200}[.!?])\\s*`,
  'gi',
);

/** Anchored version for stripping only leading narration (finalized content). */
const LEADING_NARRATION_RE = new RegExp(
  `^\\s*(?:(?:(?:I(?:'|')ll|I will)\\s+(?:${NARRATION_VERBS})[^.!?\\[\\]\\n]{0,200}[.!?:]\\s*)|(?:Let me\\s+(?:${NARRATION_VERBS})[^.!?\\[\\]\\n]{0,200}[.!?:]\\s*))+`,
  'i',
);

/**
 * Remove `<thinking>...</thinking>` blocks from streamed content.
 * Handles both fully closed blocks and a trailing open block
 * that hasn't received its closing tag yet (streaming case).
 */
export function stripThinkingBlocks(
  text: string,
  isStreaming = false,
): string {
  let cleaned = text.replace(COMPLETE_THINKING_RE, '');
  if (isStreaming) {
    cleaned = cleaned.replace(PARTIAL_THINKING_RE, '');
  }
  return cleaned;
}

/**
 * Remove procedural lead-ins like:
 * "I'll search..." / "Let me search..."
 * from the start of the assistant response.
 */
export function stripProcessLeadIn(text: string): string {
  return text.replace(LEADING_NARRATION_RE, '').trimStart();
}

/**
 * Extract the latest thinking narration and the displayable content
 * from streamed text. During streaming, narration sentences are stripped
 * globally and the most recent one is returned for the thinking indicator.
 */
export function extractThinkingAndContent(
  text: string,
  isStreaming = false,
): { thinking: string | null; content: string } {
  const withoutThinkingTags = stripThinkingBlocks(text, isStreaming);

  if (!isStreaming) {
    return {
      thinking: null,
      content: stripProcessLeadIn(withoutThinkingTags),
    };
  }

  let latestNarration: string | null = null;
  let match: RegExpExecArray | null;
  const re = new RegExp(NARRATION_SENTENCE_RE.source, NARRATION_SENTENCE_RE.flags);
  while ((match = re.exec(withoutThinkingTags)) !== null) {
    latestNarration = match[0].trim();
  }

  const content = withoutThinkingTags.replace(NARRATION_SENTENCE_RE, '').trimStart();

  if (!content && latestNarration) {
    return { thinking: latestNarration, content: '' };
  }

  return { thinking: latestNarration, content };
}

/**
 * Full response cleanup for display.
 */
export function cleanAssistantContent(
  text: string,
  isStreaming = false,
): string {
  return stripProcessLeadIn(stripThinkingBlocks(text, isStreaming));
}
