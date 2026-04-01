export interface SSEOptions {
  onMessage: (data: unknown) => void;
  onError?: (error: Event) => void;
  onOpen?: () => void;
}

export function createSSEConnection(url: string, options: SSEOptions) {
  const eventSource = new EventSource(url);

  eventSource.onopen = () => {
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
    if (eventSource.readyState === EventSource.CLOSED) {
      eventSource.close();
    }
  };

  return {
    close: () => eventSource.close(),
    get readyState() {
      return eventSource.readyState;
    },
  };
}
