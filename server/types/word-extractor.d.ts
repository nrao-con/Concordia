declare module "word-extractor" {
  interface ExtractedDocument {
    getBody(): string;
  }

  export default class WordExtractor {
    extract(source: Buffer): Promise<ExtractedDocument>;
  }
}