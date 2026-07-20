import { useEffect, useRef, useState, type DragEvent } from "react";
import { MicRecorder } from "./MicRecorder";

interface MultiFileDropProps {
  label: string;
  accept?: string;
  files: File[];
  onFilesChange: (files: File[]) => void;
}

export function MultiFileDrop({ label, accept = "audio/*", files, onFilesChange }: MultiFileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const singleFile = files.length === 1 ? files[0] : null;

  useEffect(() => {
    if (!singleFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(singleFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [singleFile]);

  function addFiles(newFiles: FileList | File[]) {
    onFilesChange([...files, ...Array.from(newFiles)]);
  }

  function removeFile(index: number) {
    onFilesChange(files.filter((_, i) => i !== index));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
  }

  return (
    <div className="space-y-2">
      <div
        className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          isDragging ? "border-brand-lime bg-brand-lime/10" : "border-zinc-700 hover:border-zinc-500"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <p className="text-sm text-zinc-400">
          {label}. Drag and drop one or more audio files here, or click to browse.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {previewUrl && <audio controls src={previewUrl} className="h-9 min-w-[200px] flex-1" />}
        <MicRecorder onRecorded={(recorded) => addFiles([recorded])} />
      </div>

      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}-${f.size}`}
              className="flex items-center justify-between gap-2 rounded-md border border-zinc-700 bg-ink-900 px-3 py-1.5 text-sm text-zinc-300"
            >
              <span className="truncate">
                {f.name} <span className="text-zinc-500">({(f.size / (1024 * 1024)).toFixed(1)} MB)</span>
              </span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="shrink-0 text-zinc-500 hover:text-red-400"
                aria-label={`Remove ${f.name}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
