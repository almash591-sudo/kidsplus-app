export type ImageSource = 'claude-svg' | 'openmoji' | 'twemoji' | 'pixabay' | 'upload';

export interface ImageCandidate {
  source: ImageSource;
  mimeType: string;
  data: Uint8Array;
  license: string;
  attribution: string | null;
}

export interface ImageProvider {
  readonly source: ImageSource;
  /** Подбирает картинки по описанию (например, «три красных яблока»). */
  find(description: string, limit: number): Promise<ImageCandidate[]>;
}
