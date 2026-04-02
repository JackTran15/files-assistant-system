export interface SSEOptions {
  onMessage: (data: unknown) => void;
  onError?: (error: Event) => void;
  onOpen?: () => void;
  onReconnectAttempt?: (attempt: number) => void;
  maxReconnectAttempts?: number;
  reconnectBaseDelayMs?: number;
}

export function createSSEConnection(url: string, options: SSEOptions) {
  const maxReconnectAttempts = options.maxReconnectAttempts ?? 3;
  const reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? 400;
  let reconnectAttempt = 0;
  let closedByUser = false;
  let eventSource: EventSource | null = null;

  const connect = () => {
    eventSource = new EventSource(url);

    eventSource.onopen = () => {
      reconnectAttempt = 0;
      options.onOpen?.();
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'heartbeat') return;
        options.onMessage(data);
      } catch {
        // non-JSON data, ignore
      }
    };

    eventSource.onerror = (error) => {
      options.onError?.(error);
      if (closedByUser) {
        eventSource?.close();
        return;
      }
      if (reconnectAttempt >= maxReconnectAttempts) {
        eventSource?.close();
        return;
      }
      reconnectAttempt += 1;
      options.onReconnectAttempt?.(reconnectAttempt);
      const delay = reconnectBaseDelayMs * 2 ** (reconnectAttempt - 1);
      eventSource?.close();
      setTimeout(() => {
        if (!closedByUser) connect();
      }, delay);
    };
  };
  connect();

  return {
    close: () => {
      closedByUser = true;
      eventSource?.close();
    },
    get readyState() {
      return eventSource?.readyState ?? EventSource.CLOSED;
    },
  };
}
