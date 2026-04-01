import * as http from 'http';

export interface SseEvent {
  status: string;
  fileId: string;
  error?: string;
  timestamp?: string;
}

export interface SseConnection {
  events: SseEvent[];
  closed: boolean;
  close(): void;
  waitForEvent(
    predicate: (e: SseEvent) => boolean,
    timeoutMs?: number,
  ): Promise<SseEvent>;
  waitForClose(timeoutMs?: number): Promise<void>;
}

export function connectSse(httpServer: http.Server, fileId: string): Promise<SseConnection> {
  return new Promise((resolve, reject) => {
    const address = httpServer.address();
    if (!address || typeof address === 'string') {
      reject(new Error('Server not listening'));
      return;
    }

    const events: SseEvent[] = [];
    let closed = false;
    const closeCallbacks: Array<() => void> = [];
    const eventCallbacks: Array<(e: SseEvent) => void> = [];

    const req = http.request(
      {
        hostname: 'localhost',
        port: address.port,
        path: `/api/files/${fileId}/events`,
        method: 'GET',
        headers: { Accept: 'text/event-stream' },
      },
      (res) => {
        let buffer = '';

        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();

          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            const dataLine = part
              .split('\n')
              .find((l) => l.startsWith('data:'));
            if (!dataLine) continue;

            try {
              const event = JSON.parse(dataLine.slice(5).trim()) as SseEvent;
              events.push(event);
              for (const cb of eventCallbacks) cb(event);
            } catch {
              // skip non-JSON data lines
            }
          }
        });

        res.on('end', () => {
          closed = true;
          for (const cb of closeCallbacks) cb();
        });

        res.on('error', () => {
          closed = true;
          for (const cb of closeCallbacks) cb();
        });

        const connection: SseConnection = {
          events,
          get closed() { return closed; },
          close() {
            req.destroy();
            closed = true;
            for (const cb of closeCallbacks) cb();
          },
          waitForEvent(predicate, timeoutMs = 30000) {
            const existing = events.find(predicate);
            if (existing) return Promise.resolve(existing);

            return new Promise<SseEvent>((res, rej) => {
              const timer = setTimeout(() => {
                rej(new Error(
                  `SSE: timed out waiting for event after ${timeoutMs}ms. ` +
                  `Received ${events.length} events: ${JSON.stringify(events.map(e => e.status))}`,
                ));
              }, timeoutMs);

              eventCallbacks.push((e) => {
                if (predicate(e)) {
                  clearTimeout(timer);
                  res(e);
                }
              });
            });
          },
          waitForClose(timeoutMs = 30000) {
            if (closed) return Promise.resolve();
            return new Promise<void>((res, rej) => {
              const timer = setTimeout(() => {
                rej(new Error(`SSE: stream did not close within ${timeoutMs}ms`));
              }, timeoutMs);

              closeCallbacks.push(() => {
                clearTimeout(timer);
                res();
              });
            });
          },
        };

        resolve(connection);
      },
    );

    req.on('error', reject);
    req.end();
  });
}
