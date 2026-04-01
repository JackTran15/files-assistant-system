const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }
  return res.json();
}

export const api = {
  chat: {
    send(body: {
      message: string;
      tenantId: string;
      conversationId?: string;
      fileIds?: string[];
    }) {
      return request<{ correlationId: string; conversationId: string }>(
        '/api/chat',
        { method: 'POST', body: JSON.stringify(body) },
      );
    },

    history(tenantId: string, page = 1, limit = 20) {
      return request<{
        data: import('@/types/chat.types').Conversation[];
        meta: { page: number; limit: number; total: number };
      }>(`/api/chat/history?tenantId=${tenantId}&page=${page}&limit=${limit}`);
    },

    cancel(correlationId: string) {
      return request<void>(`/api/chat/cancel/${correlationId}`, {
        method: 'POST',
      });
    },

    streamUrl(correlationId: string) {
      return `${API_BASE}/api/chat/stream/${correlationId}`;
    },
  },

  files: {
    list(tenantId: string) {
      return request<{
        data: import('@/types/file.types').FileItem[];
        meta: { page: number; limit: number; total: number };
      }>(`/api/files?tenantId=${tenantId}`);
    },

    get(id: string) {
      return request<import('@/types/file.types').FileItem>(`/api/files/${id}`);
    },

    async upload(file: File, tenantId: string) {
      const form = new FormData();
      form.append('file', file);
      form.append('tenantId', tenantId);

      const res = await fetch(`${API_BASE}/api/files/upload`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Upload failed: ${res.status}`);
      }
      return res.json() as Promise<import('@/types/file.types').FileItem>;
    },

    delete(id: string) {
      return request<void>(`/api/files/${id}`, { method: 'DELETE' });
    },

    retry(id: string) {
      return request<import('@/types/file.types').FileItem>(
        `/api/files/${id}/retry`,
        { method: 'POST' },
      );
    },

    eventsUrl(id: string) {
      return `${API_BASE}/api/files/${id}/events`;
    },
  },
};
