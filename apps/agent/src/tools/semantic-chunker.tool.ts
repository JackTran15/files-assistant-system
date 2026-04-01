import Anthropic from '@anthropic-ai/sdk';
import { RecursiveTextChunker } from '@files-assistant/core';

export interface SemanticBoundary {
  title: string;
  startOffset: number;
  endOffset: number;
}

const WINDOW_SIZE = 20000;
const WINDOW_OVERLAP = 500;
const FALLBACK_CHUNK_SIZE = 3000;

const fallbackChunker = new RecursiveTextChunker();

const BOUNDARY_PROMPT = `You are a document segmentation specialist. Analyze the following text and identify natural semantic boundaries — places where the topic, speaker focus, or subject matter shifts meaningfully.

Return ONLY a JSON array of section objects. Each object has:
- "title": a short descriptive title for the section (5-10 words)
- "startPhrase": the first 6-10 words of the section (exact text match)

Example output:
[
  {"title": "Introduction to the topic", "startPhrase": "Welcome everyone today we are going"},
  {"title": "Technical implementation details", "startPhrase": "So the way this actually works"},
  {"title": "Performance considerations and benchmarks", "startPhrase": "Now let us talk about performance"}
]

Rules:
- Aim for sections of roughly 1000-4000 characters each
- Do NOT create sections smaller than 500 characters
- Each startPhrase must be a verbatim excerpt from the text
- Return valid JSON only, no markdown fences or extra text

TEXT:
`;

export async function detectSemanticBoundaries(
  text: string,
  client: Anthropic,
  model: string,
): Promise<SemanticBoundary[]> {
  try {
    if (text.length <= FALLBACK_CHUNK_SIZE) {
      return [{ title: 'Full document', startOffset: 0, endOffset: text.length }];
    }

    const rawBoundaries =
      text.length > WINDOW_SIZE * 1.5
        ? await detectWithWindows(text, client, model)
        : await detectSinglePass(text, client, model);

    if (rawBoundaries.length === 0) {
      return fallbackBoundaries(text);
    }

    return rawBoundaries;
  } catch {
    return fallbackBoundaries(text);
  }
}

async function detectSinglePass(
  text: string,
  client: Anthropic,
  model: string,
): Promise<SemanticBoundary[]> {
  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    messages: [{ role: 'user', content: BOUNDARY_PROMPT + text }],
  });

  const content = response.content.find((b) => b.type === 'text');
  if (!content || content.type !== 'text') return [];

  return parseBoundaryResponse(content.text, text);
}

async function detectWithWindows(
  text: string,
  client: Anthropic,
  model: string,
): Promise<SemanticBoundary[]> {
  const allBoundaries: SemanticBoundary[] = [];

  for (let offset = 0; offset < text.length; offset += WINDOW_SIZE - WINDOW_OVERLAP) {
    const windowEnd = Math.min(offset + WINDOW_SIZE, text.length);
    const window = text.slice(offset, windowEnd);

    const windowBoundaries = await detectSinglePass(window, client, model);

    for (const b of windowBoundaries) {
      const adjusted: SemanticBoundary = {
        title: b.title,
        startOffset: b.startOffset + offset,
        endOffset: b.endOffset + offset,
      };
      const isDuplicate = allBoundaries.some(
        (existing) => Math.abs(existing.startOffset - adjusted.startOffset) < 200,
      );
      if (!isDuplicate) {
        allBoundaries.push(adjusted);
      }
    }
  }

  allBoundaries.sort((a, b) => a.startOffset - b.startOffset);

  if (allBoundaries.length > 0) {
    allBoundaries[0].startOffset = 0;
    allBoundaries[allBoundaries.length - 1].endOffset = text.length;
    for (let i = 1; i < allBoundaries.length; i++) {
      allBoundaries[i].startOffset = allBoundaries[i - 1].endOffset;
    }
  }

  return allBoundaries;
}

function parseBoundaryResponse(
  responseText: string,
  fullText: string,
): SemanticBoundary[] {
  let cleaned = responseText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  let parsed: Array<{ title: string; startPhrase: string }>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return [];

  const boundaries: SemanticBoundary[] = [];
  const lowerText = fullText.toLowerCase();

  for (const section of parsed) {
    if (!section.startPhrase || !section.title) continue;

    const phraseIndex = lowerText.indexOf(
      section.startPhrase.toLowerCase(),
      boundaries.length > 0
        ? boundaries[boundaries.length - 1].startOffset + 100
        : 0,
    );

    if (phraseIndex >= 0) {
      boundaries.push({
        title: section.title,
        startOffset: phraseIndex,
        endOffset: fullText.length,
      });
    }
  }

  if (boundaries.length === 0) return [];

  boundaries[0].startOffset = 0;
  for (let i = 0; i < boundaries.length - 1; i++) {
    boundaries[i].endOffset = boundaries[i + 1].startOffset;
  }
  boundaries[boundaries.length - 1].endOffset = fullText.length;

  return boundaries.filter(
    (b) => b.endOffset - b.startOffset >= 200,
  );
}

function fallbackBoundaries(text: string): SemanticBoundary[] {
  const { chunks } = fallbackChunker.chunk(text, {
    chunkSize: FALLBACK_CHUNK_SIZE,
    chunkOverlap: 200,
  });

  let offset = 0;
  return chunks.map((chunk, i) => {
    const startOffset = text.indexOf(chunk.slice(0, 50), offset);
    const start = startOffset >= 0 ? startOffset : offset;
    const end = start + chunk.length;
    offset = end;
    return {
      title: `Section ${i + 1}`,
      startOffset: start,
      endOffset: Math.min(end, text.length),
    };
  });
}
