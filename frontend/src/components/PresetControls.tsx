import { useRef } from "react";
import { downloadPresetFile, readPresetFile } from "../lib/presetFile";

interface PresetControlsProps<T> {
  filename: string;
  getData: () => T;
  onLoad: (data: T) => void;
  onError?: (message: string) => void;
}

export function PresetControls<T>({ filename, getData, onLoad, onError }: PresetControlsProps<T>) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    try {
      const data = await readPresetFile<T>(file);
      onLoad(data);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Couldn't load that preset file.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-zinc-500">Preset file:</span>
      <button
        type="button"
        onClick={() => downloadPresetFile(filename, getData())}
        className="rounded-md border border-zinc-700 px-2.5 py-1 text-zinc-300 hover:border-zinc-500"
      >
        Save current settings
      </button>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="rounded-md border border-zinc-700 px-2.5 py-1 text-zinc-300 hover:border-zinc-500"
      >
        Load from file
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const selected = event.target.files?.[0];
          if (selected) void handleFile(selected);
          event.target.value = "";
        }}
      />
    </div>
  );
}
