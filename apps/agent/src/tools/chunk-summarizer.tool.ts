import Anthropic from '@anthropic-ai/sdk';

const BATCH_SIZE = 5;

const SUMMARY_PROMPT = `For each numbered section below, write a 2-3 sentence summary capturing the key topics, claims, and any important details. The summary should be useful for search — include specific terms, names, and concepts mentioned.

Return ONLY a JSON array of strings, one summary per section, in the same order.

`;

export async function summarizeChunks(
  chunks: string[],
  client: Anthropic,
  model: string,
): Promise<string[]> {
  const summaries: string[] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const batchSummaries = await summarizeBatch(batch, client, model);
    summaries.push(...batchSummaries);
  }

  return summaries;
}

async function summarizeBatch(
  chunks: string[],
  client: Anthropic,
  model: string,
): Promise<string[]> {
  const sectionsText = chunks
    .map((chunk, i) => `--- SECTION ${i + 1} ---\n${chunk}`)
    .join('\n\n');

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: SUMMARY_PROMPT + sectionsText }],
    });

    const content = response.content.find((b) => b.type === 'text');
    if (!content || content.type !== 'text') {
      return chunks.map(fallbackSummary);
    }

    return parseSummaryResponse(content.text, chunks);
  } catch {
    return chunks.map(fallbackSummary);
  }
}

function parseSummaryResponse(
  responseText: string,
  originalChunks: string[],
): string[] {
  let cleaned = responseText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length === originalChunks.length) {
      return parsed.map((s: unknown) =>
        typeof s === 'string' && s.trim() ? s.trim() : fallbackSummary(originalChunks[0]),
      );
    }
    if (Array.isArray(parsed) && parsed.length > 0) {
      return originalChunks.map((chunk, i) =>
        i < parsed.length && typeof parsed[i] === 'string' && (parsed[i] as string).trim()
          ? (parsed[i] as string).trim()
          : fallbackSummary(chunk),
      );
    }
  } catch {
    // fall through
  }

  return originalChunks.map(fallbackSummary);
}

function fallbackSummary(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Empty section';
  return cleaned.length <= 300 ? cleaned : cleaned.slice(0, 297) + '...';
}
