import { AgentProcessingError } from '@files-assistant/core';
import { withRetry, withCircuitBreaker } from './resilience';

describe('resilience helpers', () => {
  it('retries transient failures and succeeds', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) {
          throw new Error('temporary');
        }
        return 'ok';
      },
      {
        retries: 3,
        baseDelayMs: 1,
        maxDelayMs: 2,
        shouldRetry: () => true,
      },
    );

    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('opens circuit after threshold failures', async () => {
    await expect(
      withCircuitBreaker(
        'test_circuit',
        async () => {
          throw new Error('boom');
        },
        { failureThreshold: 1, openMs: 10000, stage: 'search' },
      ),
    ).rejects.toThrow('boom');

    await expect(
      withCircuitBreaker(
        'test_circuit',
        async () => 'ok',
        { failureThreshold: 1, openMs: 10000, stage: 'search' },
      ),
    ).rejects.toBeInstanceOf(AgentProcessingError);
  });
});
