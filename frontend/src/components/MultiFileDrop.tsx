import { useEffect, useRef, useState, type DragEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { formatBytes, MAX_UPLOAD_BYTES, rejectionReason } from "../lib/limits";
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
  const [rejected, setRejected] = useState<string[]>([]);

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
    const incoming = Array.from(newFiles);
    const reasons = incoming.map(rejectionReason);
    const accepted = incoming.filter((_, i) => reasons[i] === null);

    setRejected(reasons.filter((reason): reason is string => reason !== null));
    if (accepted.length > 0) onFilesChange([...files, ...accepted]);
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
      <motion.div
        animate={isDragging ? { scale: 1.015 } : { scale: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 28 }}
        className={`group relative cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed p-8 text-center transition-colors duration-200 ${
          isDragging
            ? "border-brand-lime bg-brand-lime/10 shadow-glow"
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
        {/* Light sweeps across the zone on hover — the whole panel reads as one
            button rather than a static box with a click handler. */}
        <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.04] to-transparent transition-transform duration-700 group-hover:translate-x-full" />

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

        {/* An equaliser that idles flat and jumps to life while a file is over
            the zone, so the drop target visibly anticipates the drop. */}
        <div className="mb-3 flex h-8 items-end justify-center gap-1" aria-hidden>
          {[0.45, 0.8, 0.35, 1, 0.6, 0.9, 0.4].map((peak, i) => (
            <motion.span
              key={i}
              className={`w-1.5 rounded-full transition-colors ${
                isDragging ? "bg-brand-lime" : "bg-zinc-600 group-hover:bg-zinc-400"
              }`}
              animate={
                isDragging
                  ? { height: [`${peak * 40}%`, "100%", `${peak * 55}%`] }
                  : { height: `${peak * 45}%` }
              }
              transition={
                isDragging
                  ? { duration: 0.55, repeat: Infinity, repeatType: "mirror", delay: i * 0.06, ease: "easeInOut" }
                  : { duration: 0.3 }
              }
              style={{ height: `${peak * 45}%` }}
            />
          ))}
        </div>

        <p className="text-sm text-zinc-400">
          <span className="font-medium text-zinc-300">{label}.</span>{" "}
          {isDragging ? "Drop it." : "Drag and drop one or more audio files here, or click to browse."}
        </p>
        <p className="mt-1 text-xs text-zinc-600">MP3, WAV, M4A, FLAC and more · up to {formatBytes(MAX_UPLOAD_BYTES)} per file</p>
      </motion.div>

      <AnimatePresence>
        {rejected.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              {rejected.map((reason) => (
                <p key={reason} className="text-sm text-amber-300">
                  {reason}
                </p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
