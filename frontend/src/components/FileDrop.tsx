import { useRef, useState, type DragEvent } from "react";

interface FileDropProps {
  label: string;
  accept?: string;
  file: File | null;
  onFileSelected: (file: File) => void;
}

export function FileDrop({ label, accept = "audio/*", file, onFileSelected }: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) onFileSelected(dropped);
  }

  return (
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
        className="hidden"
        onChange={(event) => {
          const selected = event.target.files?.[0];
          if (selected) onFileSelected(selected);
        }}
      />
      {file ? (
        <p className="text-sm text-zinc-200">
          <span className="font-medium">{file.name}</span>{" "}
          <span className="text-zinc-400">({(file.size / (1024 * 1024)).toFixed(1)} MB)</span>
        </p>
      ) : (
        <p className="text-sm text-zinc-400">
          {label}. Drag and drop an audio file here, or click to browse.
        </p>
      )}
    </div>
  );
}
