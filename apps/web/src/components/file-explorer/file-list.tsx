import { ScrollArea } from '@/components/ui/scroll-area';
import { useFilesStore } from '@/stores/files-store';
import { FileItemRow } from './file-item';
import { FileText } from 'lucide-react';

export function FileList() {
  const files = useFilesStore((s) => s.files);

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
        <FileText className="h-8 w-8" />
        <p className="text-sm">No files uploaded yet</p>
        <p className="text-xs">Upload files to use as context</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-0.5 p-5">
        {files.map((file) => (
          <FileItemRow key={file.id} file={file} />
        ))}
      </div>
    </ScrollArea>
  );
}
