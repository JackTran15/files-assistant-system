import { AgentProcessingError } from '@files-assistant/core';

interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs?: number;
  shouldRetry?: (error: unknown) => boolean;
}

interface CircuitBreakerOptions {
  failureThreshold: number;
  openMs: number;
}

interface CircuitState {
  failures: number;
  openedAt?: number;
}

const circuitStates = new Map<string, CircuitState>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextDelay(attempt: number, opts: RetryOptions): number {
  const exp = opts.baseDelayMs * 2 ** (attempt - 1);
  const jitter = opts.jitterMs ? Math.floor(Math.random() * opts.jitterMs) : 0;
  return Math.min(exp + jitter, opts.maxDelayMs);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  let attempt = 0;
  let lastErr: unknown;

  while (attempt <= opts.retries) {
    try {
      return await fn();
    } catch (error) {
      lastErr = error;
      attempt += 1;
      const shouldRetry = opts.shouldRetry ? opts.shouldRetry(error) : true;
      if (!shouldRetry || attempt > opts.retries) break;
      await sleep(nextDelay(attempt, opts));
    }
  }

  throw lastErr;
}

function canCallCircuit(name: string, opts: CircuitBreakerOptions): boolean {
  const state = circuitStates.get(name);
  if (!state?.openedAt) return true;
  if (Date.now() - state.openedAt >= opts.openMs) {
    circuitStates.set(name, { failures: 0 });
    return true;
  }
  return false;
}

function markSuccess(name: string): void {
  const state = circuitStates.get(name);
  if (!state) return;
  state.failures = 0;
  state.openedAt = undefined;
}

function markFailure(name: string, opts: CircuitBreakerOptions): void {
  const state = circuitStates.get(name) ?? { failures: 0 };
  state.failures += 1;
  if (state.failures >= opts.failureThreshold) {
    state.openedAt = Date.now();
  }
  circuitStates.set(name, state);
}

export async function withCircuitBreaker<T>(
  name: string,
  fn: () => Promise<T>,
  opts: CircuitBreakerOptions & { stage?: 'extraction' | 'chunking' | 'embedding' | 'search' },
): Promise<T> {
  if (!canCallCircuit(name, opts)) {
    throw new AgentProcessingError(
      `${name} circuit is open`,
      opts.stage ?? 'embedding',
      true,
    );
  }
  try {
    const result = await fn();
    markSuccess(name);
    return result;
  } catch (error) {
    markFailure(name, opts);
    throw error;
  }
}
