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
  category: string;
}

export interface EffectCategory {
  id: string;
  name: string;
}

export interface EffectPresetsResponse {
  presets: EffectPreset[];
  categories: EffectCategory[];
}

export async function fetchEffectPresets(): Promise<EffectPresetsResponse> {
  const res = await fetch(`${API_BASE}/api/effects/presets`);
  return parseJsonOrThrow<EffectPresetsResponse>(res);
}

export async function submitEffectJob(file: File, presets: string[]): Promise<{ job_id: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("presets", JSON.stringify(presets));

  const res = await fetch(`${API_BASE}/api/jobs/effects`, {
    method: "POST",
    body: form,
  });
  return parseJsonOrThrow(res);
}

async function blobOrThrow(res: Response): Promise<Blob> {
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
  return res.blob();
}

export async function previewEffect(file: File, presets: string[]): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("presets", JSON.stringify(presets));

  const res = await fetch(`${API_BASE}/api/effects/preview`, {
    method: "POST",
    body: form,
  });
  return blobOrThrow(res);
}

export async function previewRetune(params: {
  file: File;
  sourceBpm: number;
  targetBpm: number;
  semitoneShift: number;
}): Promise<Blob> {
  const form = new FormData();
  form.append("file", params.file);
  form.append("source_bpm", String(params.sourceBpm));
  form.append("target_bpm", String(params.targetBpm));
  form.append("semitone_shift", String(params.semitoneShift));

  const res = await fetch(`${API_BASE}/api/retune/preview`, {
    method: "POST",
    body: form,
  });
  return blobOrThrow(res);
}

export type FeedbackKind = "feature" | "bug" | "other";

export interface FeedbackReply {
  id: string;
  name: string;
  text: string;
  created_at: number;
}

export interface FeedbackItem {
  id: string;
  name: string;
  kind: FeedbackKind;
  text: string;
  votes: number;
  status: string;
  replies?: FeedbackReply[];
  created_at: number;
}

export interface FeedbackResponse {
  items: FeedbackItem[];
  count: number;
  features: number;
  bugs: number;
}

export async function fetchFeedback(): Promise<FeedbackResponse> {
  const res = await fetch(`${API_BASE}/api/feedback`);
  return parseJsonOrThrow<FeedbackResponse>(res);
}

export async function submitFeedback(input: {
  name: string;
  kind: FeedbackKind;
  text: string;
}): Promise<FeedbackItem> {
  const res = await fetch(`${API_BASE}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow<FeedbackItem>(res);
}

export async function voteFeedback(id: string): Promise<FeedbackItem> {
  const res = await fetch(`${API_BASE}/api/feedback/${id}/vote`, { method: "POST" });
  return parseJsonOrThrow<FeedbackItem>(res);
}

export async function replyToFeedback(
  id: string,
  input: { name: string; text: string },
): Promise<FeedbackItem> {
  const res = await fetch(`${API_BASE}/api/feedback/${id}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow<FeedbackItem>(res);
}

// ---- Admin ----
// The key is passed per request rather than exchanged for a session: there's
// one operator and no login flow to build, and this way nothing is left signed
// in on a shared machine after the tab closes unless it was explicitly saved.

export interface AdminOverview {
  items: FeedbackItem[];
  counts: Record<string, number>;
  jobs_in_memory: Record<string, number>;
  storage: string;
}

function adminHeaders(key: string): HeadersInit {
  return { "X-Admin-Token": key, "Content-Type": "application/json" };
}

export async function checkAdminKey(key: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/admin/check`, { headers: adminHeaders(key) });
  if (res.ok) return true;
  if (res.status === 401) return false;
  await parseJsonOrThrow(res); // surfaces "not configured" and other real errors
  return false;
}

export async function fetchAdminOverview(key: string): Promise<AdminOverview> {
  const res = await fetch(`${API_BASE}/api/admin/overview`, { headers: adminHeaders(key) });
  return parseJsonOrThrow<AdminOverview>(res);
}

export async function adminDeleteItem(key: string, id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/feedback/${id}`, {
    method: "DELETE",
    headers: adminHeaders(key),
  });
  await parseJsonOrThrow(res);
}

export async function adminDeleteReply(key: string, id: string, replyId: string): Promise<FeedbackItem> {
  const res = await fetch(`${API_BASE}/api/admin/feedback/${id}/replies/${replyId}`, {
    method: "DELETE",
    headers: adminHeaders(key),
  });
  return parseJsonOrThrow<FeedbackItem>(res);
}

export async function adminSetStatus(key: string, id: string, status: string): Promise<FeedbackItem> {
  const res = await fetch(`${API_BASE}/api/admin/feedback/${id}/status`, {
    method: "PATCH",
    headers: adminHeaders(key),
    body: JSON.stringify({ status }),
  });
  return parseJsonOrThrow<FeedbackItem>(res);
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}`);
  return parseJsonOrThrow(res);
}

export type AudioFormat = "wav" | "mp3";

export function downloadUrl(jobId: string, stem: string, format: AudioFormat = "wav"): string {
  return `${API_BASE}/api/jobs/${jobId}/download/${stem}?format=${format}`;
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
