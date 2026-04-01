import { TextExtractor } from './extractor.interface';
import { PdfExtractor } from './pdf.extractor';
import { PlainTextExtractor } from './plaintext.extractor';

export class ExtractorRegistry {
  private extractors: TextExtractor[] = [];

  constructor() {
    this.extractors = [
      new PdfExtractor(),
      new PlainTextExtractor(),
    ];
  }

  getExtractor(mimeType: string): TextExtractor | undefined {
    return this.extractors.find((e) =>
      e.supportedMimeTypes().includes(mimeType),
    );
  }

  getSupportedMimeTypes(): string[] {
    return this.extractors.flatMap((e) => e.supportedMimeTypes());
  }

  register(extractor: TextExtractor): void {
    this.extractors.push(extractor);
  }
}
