const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

export type JobKind = "retune" | "separate" | "effects";
export type JobStatusValue = "queued" | "processing" | "done" | "error";

export interface JobStatus {
  job_id: string;
  kind: JobKind;
  status: JobStatusValue;
  error: string | null;
  outputs: string[];
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // response wasn't JSON — fall back to statusText
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export interface AnalyzeResult {
  bpm: number;
  key_index: number;
}

export async function analyzeAudio(file: File): Promise<AnalyzeResult> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    body: form,
  });
  return parseJsonOrThrow(res);
}

export async function submitRetuneJob(params: {
  file: File;
  sourceBpm: number;
  targetBpm: number;
  semitoneShift: number;
}): Promise<{ job_id: string }> {
  const form = new FormData();
  form.append("file", params.file);
  form.append("source_bpm", String(params.sourceBpm));
  form.append("target_bpm", String(params.targetBpm));
  form.append("semitone_shift", String(params.semitoneShift));

  const res = await fetch(`${API_BASE}/api/jobs/retune`, {
    method: "POST",
    body: form,
  });
  return parseJsonOrThrow(res);
}

export async function submitSeparateJob(file: File): Promise<{ job_id: string }> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE}/api/jobs/separate`, {
    method: "POST",
    body: form,
  });
  return parseJsonOrThrow(res);
}

export interface EffectPreset {
  slug: string;
  name: string;
  description: string;
}

export async function fetchEffectPresets(): Promise<EffectPreset[]> {
  const res = await fetch(`${API_BASE}/api/effects/presets`);
  const body = await parseJsonOrThrow<{ presets: EffectPreset[] }>(res);
  return body.presets;
}

export async function submitEffectJob(file: File, preset: string): Promise<{ job_id: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("preset", preset);

  const res = await fetch(`${API_BASE}/api/jobs/effects`, {
    method: "POST",
    body: form,
  });
  return parseJsonOrThrow(res);
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}`);
  return parseJsonOrThrow(res);
}

export function downloadUrl(jobId: string, stem: string): string {
  return `${API_BASE}/api/jobs/${jobId}/download/${stem}`;
}

export async function pollJobUntilDone(
  jobId: string,
  onUpdate: (status: JobStatus) => void,
  intervalMs = 1500,
): Promise<JobStatus> {
  for (;;) {
    const status = await getJobStatus(jobId);
    onUpdate(status);
    if (status.status === "done" || status.status === "error") {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
