import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { loadAudioPeaks, type AudioPeaks } from "../lib/audioPeaks";
import { Waveform } from "./Waveform";

export interface StemTrack {
  id: string;
  label: string;
  url: string;
  accent: string;
}

interface StemPlayerProps {
  tracks: StemTrack[];
}

type LoadState = { status: "loading" } | { status: "ready"; peaks: AudioPeaks } | { status: "error"; message: string };

/** Past this much drift, a track is nudged back onto the clock track's time. */
const DRIFT_TOLERANCE_SECONDS = 0.08;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * Plays one or more stems of the same song together on a single transport —
 * one play button, one playhead, but independent volume per stem so you can
 * hear the vocal against its instrumental, or mute one and audition the other.
 *
 * Each stem is its own <audio> element rather than a Web Audio graph: the
 * elements handle streaming and seeking, and the first track acts as the clock
 * that the rest are corrected against when they drift.
 */
export function StemPlayer({ tracks }: StemPlayerProps) {
  const [loads, setLoads] = useState<Record<string, LoadState>>({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [muted, setMuted] = useState<Record<string, boolean>>({});

  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});

  useEffect(() => {
    let cancelled = false;
    setLoads(Object.fromEntries(tracks.map((t) => [t.id, { status: "loading" as const }])));

    tracks.forEach((track) => {
      loadAudioPeaks(track.url)
        .then((peaks) => {
          if (cancelled) return;
          setLoads((prev) => ({ ...prev, [track.id]: { status: "ready", peaks } }));
          setDuration((prev) => (peaks.duration > prev ? peaks.duration : prev));
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setLoads((prev) => ({
            ...prev,
            [track.id]: { status: "error", message: error instanceof Error ? error.message : "Couldn't load audio" },
          }));
        });
    });

    return () => {
      cancelled = true;
    };
    // Track identity is the url set; rebuild when that changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks.map((t) => t.url).join("|")]);

  const readyIds = tracks.filter((t) => loads[t.id]?.status === "ready").map((t) => t.id);
  const allReady = readyIds.length === tracks.length && tracks.length > 0;

  // Advance the displayed playhead and keep the non-clock tracks aligned.
  useEffect(() => {
    if (!isPlaying) return;
    let frame = 0;
    const tick = () => {
      const clock = audioRefs.current[readyIds[0]];
      if (clock) {
        setCurrentTime(clock.currentTime);
        readyIds.slice(1).forEach((id) => {
          const audio = audioRefs.current[id];
          if (audio && Math.abs(audio.currentTime - clock.currentTime) > DRIFT_TOLERANCE_SECONDS) {
            audio.currentTime = clock.currentTime;
          }
        });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, readyIds]);

  const togglePlay = useCallback(() => {
    const audios = readyIds.map((id) => audioRefs.current[id]).filter(Boolean);
    if (audios.length === 0) return;
    if (isPlaying) {
      audios.forEach((audio) => audio.pause());
      setIsPlaying(false);
    } else {
      // Re-align before starting so a paused-then-resumed group stays together.
      const from = audios[0].currentTime;
      audios.forEach((audio) => {
        audio.currentTime = from;
        void audio.play().catch(() => {});
      });
      setIsPlaying(true);
    }
  }, [isPlaying, readyIds]);

  const seekTo = useCallback(
    (fraction: number) => {
      const target = fraction * duration;
      readyIds.forEach((id) => {
        const audio = audioRefs.current[id];
        if (audio) audio.currentTime = target;
      });
      setCurrentTime(target);
    },
    [duration, readyIds],
  );

  const setVolume = useCallback((id: string, value: number) => {
    setVolumes((prev) => ({ ...prev, [id]: value }));
    const audio = audioRefs.current[id];
    if (audio) audio.volume = value;
  }, []);

  const toggleMute = useCallback((id: string) => {
    setMuted((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      const audio = audioRefs.current[id];
      if (audio) audio.muted = next[id];
      return next;
    });
  }, []);

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-ink-900/70 backdrop-blur">
      <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
        <motion.button
          type="button"
          onClick={togglePlay}
          disabled={!allReady}
          whileTap={allReady ? { scale: 0.92 } : undefined}
          whileHover={allReady ? { scale: 1.06 } : undefined}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-lime text-ink-950 shadow-glow transition-colors hover:bg-brand-limeDark disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-zinc-500 disabled:shadow-none"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.3-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14z" />
            </svg>
          )}
        </motion.button>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-200">
            {tracks.length > 1 ? `${tracks.length} stems · played together` : tracks[0]?.label}
          </p>
          <p className="font-mono text-xs tabular-nums text-zinc-500">
            {formatTime(currentTime)} / {formatTime(duration)}
          </p>
        </div>
      </div>

      <div className="divide-y divide-white/5">
        {tracks.map((track) => {
          const load = loads[track.id];
          const volume = volumes[track.id] ?? 1;
          const isMuted = muted[track.id] ?? false;

          return (
            <div key={track.id} className="px-4 py-3">
              <div className="mb-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggleMute(track.id)}
                  disabled={load?.status !== "ready"}
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${
                    isMuted ? "bg-white/5 text-zinc-500" : "text-zinc-200 hover:bg-white/5"
                  }`}
                  aria-pressed={isMuted}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: isMuted ? "#52525b" : track.accent }} />
                  {track.label}
                </button>

                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  disabled={load?.status !== "ready"}
                  onChange={(event) => setVolume(track.id, Number(event.target.value))}
                  className="ml-auto h-1 w-24 cursor-pointer appearance-none rounded-full bg-ink-700 accent-brand-lime disabled:opacity-40"
                  aria-label={`${track.label} volume`}
                />
              </div>

              {load?.status === "loading" && (
                <div className="h-[72px] w-full animate-pulse rounded-lg bg-white/[0.03]" />
              )}
              {load?.status === "error" && (
                <p className="flex h-[72px] items-center text-sm text-red-400">{load.message}</p>
              )}
              {load?.status === "ready" && (
                <>
                  <Waveform
                    peaks={load.peaks.peaks}
                    progress={progress}
                    accent={isMuted ? "rgba(148, 163, 152, 0.5)" : track.accent}
                    onSeek={seekTo}
                  />
                  <audio
                    ref={(element) => {
                      if (element) {
                        audioRefs.current[track.id] = element;
                        element.volume = volume;
                        element.muted = isMuted;
                      }
                    }}
                    src={load.peaks.url}
                    preload="auto"
                    onLoadedMetadata={(event) => {
                      const value = event.currentTarget.duration;
                      if (Number.isFinite(value)) setDuration((prev) => (value > prev ? value : prev));
                    }}
                    onEnded={() => {
                      setIsPlaying(false);
                      setCurrentTime(0);
                      readyIds.forEach((id) => {
                        const audio = audioRefs.current[id];
                        if (audio) audio.currentTime = 0;
                      });
                    }}
                    className="hidden"
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
