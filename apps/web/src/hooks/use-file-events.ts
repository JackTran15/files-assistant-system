import { useEffect, useRef } from 'react';
import { createSSEConnection } from '@/lib/sse';
import { api } from '@/lib/api';
import { useFilesStore } from '@/stores/files-store';
import type { FileStatusEvent } from '@/types/file.types';
import { FileStatus } from '@/types/file.types';

export function useFileEvents(fileId: string | null) {
  const updateFileStatus = useFilesStore((s) => s.updateFileStatus);
  const connectionRef = useRef<ReturnType<typeof createSSEConnection> | null>(
    null,
  );

  useEffect(() => {
    if (!fileId) return;

    const url = api.files.eventsUrl(fileId);
    const connection = createSSEConnection(url, {
      onMessage: (data) => {
        const event = data as FileStatusEvent;
        updateFileStatus(event.fileId, event.status as FileStatus, event.error);

        if (
          event.status === FileStatus.READY ||
          event.status === FileStatus.FAILED
        ) {
          connection.close();
        }
      },
      onError: () => {
        connection.close();
      },
    });

    connectionRef.current = connection;

    return () => {
      connection.close();
    };
  }, [fileId, updateFileStatus]);
}
