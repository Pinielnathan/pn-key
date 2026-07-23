import { useEffect, useRef, useState, type DragEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MicRecorder } from "./MicRecorder";

interface MultiFileDropProps {
  label: string;
  accept?: string;
  files: File[];
  onFilesChange: (files: File[]) => void;
  /** Fired whenever the mic captures a new recording, separately from onFilesChange, so a parent can share it with other tabs. */
  onRecorded?: (file: File) => void;
  /** A recording captured elsewhere (e.g. another tab) that can be reused here via a "Use last recording" button. */
  lastRecording?: File | null;
}

export function MultiFileDrop({
  label,
  accept = "audio/*",
  files,
  onFilesChange,
  onRecorded,
  lastRecording,
}: MultiFileDropProps) {
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
    <div className="space-y-3">
      <div
        className={`group cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
          isDragging
            ? "scale-[1.01] border-brand-lime bg-brand-lime/10 shadow-glow"
            : "border-zinc-700 hover:border-zinc-500 hover:bg-white/[0.02]"
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
        <svg
          className={`mx-auto mb-3 h-8 w-8 transition-colors ${
            isDragging ? "text-brand-lime" : "text-zinc-600 group-hover:text-zinc-400"
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        <p className="text-sm text-zinc-400">
          <span className="font-medium text-zinc-300">{label}.</span> Drag and drop one or more audio
          files here, or click to browse.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {previewUrl && <audio controls src={previewUrl} className="h-9 min-w-[200px] flex-1" />}
        <MicRecorder
          onRecorded={(recorded) => {
            addFiles([recorded]);
            onRecorded?.(recorded);
          }}
        />
        {lastRecording && !files.includes(lastRecording) && (
          <button
            type="button"
            onClick={() => addFiles([lastRecording])}
            className="shrink-0 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
          >
            Use last recording
          </button>
        )}
      </div>

      {files.length > 0 && (
        <ul className="space-y-1.5">
          <AnimatePresence initial={false}>
            {files.map((f, i) => (
              <motion.li
                key={`${f.name}-${i}-${f.size}`}
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: "auto", marginBottom: 6 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center justify-between gap-2 overflow-hidden rounded-lg border border-zinc-700 bg-ink-900 px-3 py-1.5 text-sm text-zinc-300"
              >
                <span className="truncate">
                  {f.name} <span className="text-zinc-500">({(f.size / (1024 * 1024)).toFixed(1)} MB)</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="shrink-0 rounded p-0.5 text-zinc-500 transition-colors hover:text-red-400"
                  aria-label={`Remove ${f.name}`}
                >
                  ✕
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
