import { useEffect } from 'react';
import { Files, CheckSquare, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FileUploadButton } from './file-upload-button';
import { FileList } from './file-list';
import { useFilesStore } from '@/stores/files-store';

const TENANT_ID = import.meta.env.VITE_TENANT_ID ?? 'default-tenant';

export function FileExplorerPanel() {
  const { files, selectedFileIds, fetchFiles, selectAll, deselectAll } =
    useFilesStore();

  useEffect(() => {
    fetchFiles(TENANT_ID);
  }, [fetchFiles]);

  const readyCount = files.filter((f) => f.status === 'ready').length;
  const allReadySelected =
    readyCount > 0 && selectedFileIds.size === readyCount;

  return (
    <aside className="flex h-full w-[300px] min-w-[240px] flex-col border-r bg-card">
      <div className="flex items-center justify-between border-b px-3 py-3">
        <div className="flex items-center gap-2">
          <Files className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Files</h2>
          {files.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({files.length})
            </span>
          )}
        </div>
        <FileUploadButton />
      </div>

      {readyCount > 0 && (
        <div className="flex items-center justify-between border-b px-3 py-1.5">
          <span className="text-xs text-muted-foreground">
            {selectedFileIds.size} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={allReadySelected ? deselectAll : selectAll}
          >
            {allReadySelected ? (
              <>
                <Square className="h-3 w-3" />
                Deselect all
              </>
            ) : (
              <>
                <CheckSquare className="h-3 w-3" />
                Select all
              </>
            )}
          </Button>
        </div>
      )}

      <FileList />
    </aside>
  );
}
