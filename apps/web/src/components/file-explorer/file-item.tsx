import { FileText, FileType2, File, Trash2, RotateCcw } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';
import type { FileItem as FileItemType } from '@/types/file.types';
import { FileStatus, FileType } from '@/types/file.types';
import { useFilesStore } from '@/stores/files-store';
import { cn } from '@/lib/cn';
import { useFileEvents } from '@/hooks/use-file-events';

const statusConfig: Record<
  FileStatus,
  {
    label: string;
    variant: 'muted' | 'warning' | 'success' | 'destructive';
    pulse?: boolean;
  }
> = {
  [FileStatus.PENDING]: { label: 'Pending', variant: 'muted' },
  [FileStatus.PROCESSING]: {
    label: 'Processing',
    variant: 'warning',
    pulse: true,
  },
  [FileStatus.EXTRACTING]: {
    label: 'Extracting',
    variant: 'warning',
    pulse: true,
  },
  [FileStatus.EXTRACTED]: {
    label: 'Extracted',
    variant: 'warning',
    pulse: true,
  },
  [FileStatus.EMBEDDING]: {
    label: 'Embedding',
    variant: 'warning',
    pulse: true,
  },
  [FileStatus.READY]: { label: 'Ready', variant: 'success' },
  [FileStatus.FAILED]: { label: 'Failed', variant: 'destructive' },
};

function FileIcon({ fileType }: { fileType: FileType }) {
  switch (fileType) {
    case FileType.PDF:
      return <FileText className="h-4 w-4 shrink-0 text-red-500" />;
    case FileType.DOCX:
      return <FileType2 className="h-4 w-4 shrink-0 text-blue-500" />;
    case FileType.TXT:
      return <File className="h-4 w-4 shrink-0 text-gray-500" />;
    default:
      return <File className="h-4 w-4 shrink-0 text-gray-400" />;
  }
}

interface FileItemProps {
  file: FileItemType;
}

export function FileItemRow({ file }: FileItemProps) {
  const {
    selectedFileIds,
    toggleFileSelection,
    removeFile,
    retryFile,
    highlightedFileId,
  } = useFilesStore();
  const isSelected = selectedFileIds.has(file.id);
  const isHighlighted = highlightedFileId === file.id;
  const config = statusConfig[file.status];
  const isReady = file.status === FileStatus.READY;
  const isInProgress = [
    FileStatus.PROCESSING,
    FileStatus.EXTRACTING,
    FileStatus.EXTRACTED,
    FileStatus.EMBEDDING,
  ].includes(file.status);
  const canRetry =
    file.status === FileStatus.FAILED || file.status === FileStatus.READY;

  useFileEvents(isInProgress ? file.id : null);

  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent',
        isSelected && 'bg-accent/50',
        isHighlighted && 'ring-1 ring-primary bg-primary/5',
      )}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => toggleFileSelection(file.id)}
        disabled={!isReady}
        aria-label={`Select ${file.name}`}
      />
      <FileIcon fileType={file.fileType} />
      <Tooltip content={file.name}>
        <span className="flex-1 truncate max-w-[140px]">{file.name}</span>
      </Tooltip>
      <Badge
        variant={config?.variant}
        className={cn(
          'text-[10px] px-1.5 py-0',
          config?.pulse && 'animate-pulse',
        )}
      >
        {config?.label}
      </Badge>
      <Tooltip
        content={
          isInProgress ? 'Cannot delete while processing' : `Delete ${file.name}`
        }
      >
        <button
          onClick={() => removeFile(file.id)}
          disabled={isInProgress}
          className={cn(
            'p-0.5 rounded transition-opacity',
            isInProgress
              ? 'opacity-30 cursor-not-allowed'
              : 'opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive',
          )}
          aria-label={`Delete ${file.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
      <Tooltip
        content={
          canRetry
            ? `Restart embedding for ${file.name}`
            : 'Retry is available when file is ready or failed'
        }
      >
        <button
          onClick={() => {
            void retryFile(file.id);
          }}
          disabled={!canRetry || isInProgress}
          className={cn(
            'p-0.5 rounded transition-opacity',
            !canRetry || isInProgress
              ? 'opacity-30 cursor-not-allowed'
              : 'opacity-0 group-hover:opacity-100 hover:bg-primary/10 text-muted-foreground hover:text-primary',
          )}
          aria-label={`Retry ${file.name}`}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
    </div>
  );
}
