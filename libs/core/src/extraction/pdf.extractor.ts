import { PDFParse } from 'pdf-parse';
import { TextExtractor } from './extractor.interface';
import { ExtractionResult } from '../types/agent.types';

export class PdfExtractor implements TextExtractor {
  async extract(buffer: Buffer): Promise<ExtractionResult> {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const info = await parser.getInfo();
    const textResult = await parser.getText();
    await parser.destroy();

    return {
      text: textResult.text,
      pageCount: info.total,
      metadata: {
        pages: textResult.total,
      },
    };
  }

  supportedMimeTypes(): string[] {
    return ['application/pdf'];
  }
}
