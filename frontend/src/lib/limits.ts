/**
 * The host the API runs on rejects request bodies over 32 MiB at its own edge,
 * before the app ever sees them — and it answers with an HTML error page, not
 * the app's JSON, so an oversized upload surfaced as an unreadable error with
 * nothing pointing at the file size. Catching it here instead means the user
 * finds out which file is too big, before waiting through the upload.
 *
 * Keep this in step with MAX_UPLOAD_BYTES in the backend config.
 */
export const MAX_UPLOAD_BYTES = 31 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isTooLarge(file: File): boolean {
  return file.size > MAX_UPLOAD_BYTES;
}

/** Human-readable reason for a rejected file, or null if it's fine. */
export function rejectionReason(file: File): string | null {
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (isTooLarge(file)) {
    return `"${file.name}" is ${formatBytes(file.size)}. The server accepts up to ${formatBytes(
      MAX_UPLOAD_BYTES,
    )}. Convert it to MP3 (or trim it) and try again.`;
  }
  return null;
}
