const COMPLETE_THINKING_RE = /<thinking>[\s\S]*?<\/thinking>\s*/g;
const PARTIAL_THINKING_RE = /<thinking>[\s\S]*$/;
const LAST_THINKING_CONTENT_RE = /<thinking>([\s\S]*?)<\/thinking>/g;

/**
 * Remove `<thinking>...</thinking>` blocks from content.
 * In streaming mode, also strips a trailing unclosed `<thinking>...` block.
 * In finalize mode, strips both complete and trailing partial blocks.
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
 * Extract the content of the latest `<thinking>` block for display
 * in the thinking indicator. Returns null if no thinking block exists.
 */
function extractLatestThinking(text: string): string | null {
  const withoutComplete = text.replace(COMPLETE_THINKING_RE, '');
  const partialMatch = PARTIAL_THINKING_RE.exec(withoutComplete);
  if (partialMatch) {
    const inner = partialMatch[0].replace(/^<thinking>\s*/, '').trim();
    if (inner) return inner;
  }

  let latest: string | null = null;
  const re = new RegExp(LAST_THINKING_CONTENT_RE.source, LAST_THINKING_CONTENT_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    latest = match[1].trim();
  }

  return latest || null;
}

/**
 * Extract the latest thinking text and displayable content from streamed text.
 * Strict tag-only mode: only `<thinking>...</thinking>` blocks are treated as thinking.
 */
export function extractThinkingAndContent(
  text: string,
  isStreaming = false,
): { thinking: string | null; content: string } {
  if (!isStreaming) {
    const content = stripThinkingBlocks(text, false)
      .replace(PARTIAL_THINKING_RE, '')
      .trim();
    return { thinking: null, content };
  }

  const thinking = extractLatestThinking(text);
  const content = stripThinkingBlocks(text, true).trim();

  return { thinking, content };
}

/**
 * Full response cleanup for display. Strips all thinking blocks
 * (complete and partial) from content.
 */
export function cleanAssistantContent(text: string): string {
  return text
    .replace(COMPLETE_THINKING_RE, '')
    .replace(PARTIAL_THINKING_RE, '')
    .trim();
}
