export interface WeaviateConfig {
  host: string;
  httpPort: number;
  grpcPort: number;
  scheme: 'http' | 'https';
}

export const defaultWeaviateConfig: WeaviateConfig = {
  host: 'localhost',
  httpPort: 8080,
  grpcPort: 50051,
  scheme: 'http',
};
