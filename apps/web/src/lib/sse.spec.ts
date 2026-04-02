import { createSSEConnection } from './sse';
import { vi } from 'vitest';

class MockEventSource {
  static instances: MockEventSource[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  public readyState = MockEventSource.CONNECTING;
  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;

  constructor(_url: string) {
    MockEventSource.instances.push(this);
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }
}

describe('createSSEConnection', () => {
  beforeEach(() => {
    // @ts-expect-error test shim
    global.EventSource = MockEventSource;
    MockEventSource.instances.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reconnects with exponential backoff and forwards messages', () => {
    const onMessage = vi.fn();
    const onReconnectAttempt = vi.fn();

    createSSEConnection('http://localhost:3000/sse', {
      onMessage,
      onReconnectAttempt,
      maxReconnectAttempts: 2,
      reconnectBaseDelayMs: 100,
    });

    const first = MockEventSource.instances[0];
    first.onerror?.(new Event('error'));
    expect(onReconnectAttempt).toHaveBeenCalledWith(1);

    vi.advanceTimersByTime(100);
    const second = MockEventSource.instances[1];
    second.onmessage?.({ data: JSON.stringify({ chunk: 'hello' }) });

    expect(onMessage).toHaveBeenCalledWith({ chunk: 'hello' });
  });
});
