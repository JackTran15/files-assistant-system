import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CitedMarkdown } from './cited-markdown';
import type { ChatResponseSource } from '@/types/chat.types';

describe('CitedMarkdown', () => {
  it('renders citation chips even for low-score sources', () => {
    const sources: ChatResponseSource[] = [
      {
        fileId: 'file-1',
        fileName: 'resume.md',
        chunkIndex: 0,
        score: 0.12,
        excerpt: 'JavaScript and TypeScript',
      },
    ];

    const html = renderToStaticMarkup(
      createElement(CitedMarkdown, {
        content: 'Jack knows TypeScript [1].',
        sources,
      }),
    );

    expect(html).toContain('TypeScript');
    expect(html).toContain('>1<');
    expect(html).not.toContain('[1]');
  });

  it('keeps rendering citations across repeated renders', () => {
    const sources: ChatResponseSource[] = [
      {
        fileId: 'file-1',
        fileName: 'resume.md',
        chunkIndex: 0,
        score: 0.8,
        excerpt: 'TypeScript and React',
      },
    ];

    const renderOutput = () =>
      renderToStaticMarkup(
        createElement(CitedMarkdown, {
          content: 'Answer with citation [1].',
          sources,
        }),
      );

    const first = renderOutput();
    const second = renderOutput();

    expect(first).toContain('>1<');
    expect(second).toContain('>1<');
    expect(first).not.toContain('[1]');
    expect(second).not.toContain('[1]');
  });

  it('renders grouped citation refs like [1, 2] as chips', () => {
    const sources: ChatResponseSource[] = [
      {
        fileId: 'file-1',
        fileName: 'resume.md',
        chunkIndex: 0,
        score: 0.8,
        excerpt: 'TypeScript and React',
      },
      {
        fileId: 'file-2',
        fileName: 'design.md',
        chunkIndex: 3,
        score: 0.7,
        excerpt: 'System design notes',
      },
    ];

    const html = renderToStaticMarkup(
      createElement(CitedMarkdown, {
        content: 'Answer with grouped refs [1, 2].',
        sources,
      }),
    );

    expect(html).toContain('>1<');
    expect(html).toContain('>2<');
    expect(html).not.toContain('[1, 2]');
  });
});
