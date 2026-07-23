const KIND_LABELS: Record<string, string> = {
  retune: "Retune",
  effects: "Effects",
};

interface PresetEnvelope<T> {
  app: "pnkey";
  kind: string;
  version: number;
  data: T;
}

export function downloadPresetFile<T>(filename: string, kind: string, data: T): void {
  const envelope: PresetEnvelope<T> = { app: "pnkey", kind, version: 1, data };
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function readPresetFile<T>(file: File, kind: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch {
        reject(new Error("That doesn't look like a valid .pnkey preset file."));
        return;
      }
      if (!parsed || typeof parsed !== "object" || (parsed as PresetEnvelope<T>).app !== "pnkey") {
        reject(new Error("That doesn't look like a PN Key preset file."));
        return;
      }
      const envelope = parsed as PresetEnvelope<T>;
      if (envelope.kind !== kind) {
        const gotLabel = KIND_LABELS[envelope.kind] ?? envelope.kind;
        reject(new Error(`That's a ${gotLabel} preset — load it from the ${gotLabel} tab instead.`));
        return;
      }
      resolve(envelope.data);
    };
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsText(file);
  });
}
