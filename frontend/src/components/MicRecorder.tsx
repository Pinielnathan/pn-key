import { useRef, useState } from "react";

interface MicRecorderProps {
  onRecorded: (file: File) => void;
}

const CANDIDATE_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return CANDIDATE_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function MicRecorder({ onRecorded }: MicRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  async function start() {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Recording isn't supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const extension = blob.type.includes("mp4") ? "mp4" : "webm";
        onRecorded(new File([blob], `recording.${extension}`, { type: blob.type }));
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };

      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError("Microphone access was denied or unavailable.");
    }
  }

  function stop() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      {isRecording ? (
        <button
          type="button"
          onClick={stop}
          className="flex items-center gap-2 rounded-md border border-red-500 bg-red-500/10 px-3 py-1.5 text-red-400"
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
          Stop recording ({seconds}s)
        </button>
      ) : (
        <button
          type="button"
          onClick={start}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-zinc-500"
        >
          Record from mic
        </button>
      )}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
