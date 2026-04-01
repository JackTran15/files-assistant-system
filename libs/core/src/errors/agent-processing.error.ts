export class AgentProcessingError extends Error {
  public override readonly cause?: Error;

  constructor(
    message: string,
    public readonly stage:
      | 'extraction'
      | 'chunking'
      | 'embedding'
      | 'search'
      | 'summary'
      | 'citation',
    public readonly retryable: boolean,
    cause?: Error,
  ) {
    super(message, { cause });
    this.name = 'AgentProcessingError';
    this.cause = cause;
  }
}
