import { create } from 'zustand';
import type { FileItem, FileStatus } from '@/types/file.types';
import { api } from '@/lib/api';

interface FilesState {
  files: FileItem[];
  selectedFileIds: Set<string>;
  isUploading: boolean;
  error: string | null;

  fetchFiles: (tenantId: string) => Promise<void>;
  uploadFile: (file: File, tenantId: string) => Promise<FileItem>;
  toggleFileSelection: (fileId: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  updateFileStatus: (
    fileId: string,
    status: FileStatus,
    error?: string,
  ) => void;
  removeFile: (fileId: string) => Promise<void>;
}

export const useFilesStore = create<FilesState>((set, get) => ({
  files: [],
  selectedFileIds: new Set(),
  isUploading: false,
  error: null,

  fetchFiles: async (tenantId) => {
    try {
      const result = await api.files.list(tenantId);
      set({ files: result.data, error: null });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch files',
      });
    }
  },

  uploadFile: async (file, tenantId) => {
    set({ isUploading: true, error: null });
    try {
      const uploaded = await api.files.upload(file, tenantId);
      set((state) => ({
        files: [uploaded, ...state.files],
        isUploading: false,
      }));
      return uploaded;
    } catch (err) {
      set({
        isUploading: false,
        error: err instanceof Error ? err.message : 'Upload failed',
      });
      throw err;
    }
  },

  toggleFileSelection: (fileId) => {
    set((state) => {
      const next = new Set(state.selectedFileIds);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return { selectedFileIds: next };
    });
  },

  selectAll: () => {
    set((state) => ({
      selectedFileIds: new Set(
        state.files.filter((f) => f.status === 'ready').map((f) => f.id),
      ),
    }));
  },

  deselectAll: () => {
    set({ selectedFileIds: new Set() });
  },

  updateFileStatus: (fileId, status, error) => {
    set((state) => ({
      files: state.files.map((f) =>
        f.id === fileId
          ? { ...f, status, ...(error ? { errorMessage: error } : {}) }
          : f,
      ),
    }));
  },

  removeFile: async (fileId) => {
    try {
      await api.files.delete(fileId);
      set((state) => ({
        files: state.files.filter((f) => f.id !== fileId),
        selectedFileIds: (() => {
          const next = new Set(state.selectedFileIds);
          next.delete(fileId);
          return next;
        })(),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Delete failed' });
    }
  },
}));
