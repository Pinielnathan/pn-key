import { useCallback, useEffect, useRef, useState } from "react";

interface WaveformProps {
  peaks: Float32Array;
  /** 0..1 playback position. */
  progress: number;
  /** Bar colour for the portion already played. */
  accent: string;
  height?: number;
  onSeek?: (fraction: number) => void;
  disabled?: boolean;
}

const BAR_GAP = 1;
const MIN_BAR_WIDTH = 2;

/**
 * Canvas waveform with click/drag seeking.
 *
 * Canvas rather than a few hundred DOM nodes: these are drawn per stem, and
 * repainting on every animation frame of playback is what keeps the playhead
 * smooth. The bars also animate in on first paint, which is why the component
 * owns a rAF loop rather than only redrawing when props change.
 */
export function Waveform({ peaks, progress, accent, height = 72, onSeek, disabled = false }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef(0);
  const revealStartRef = useRef<number | null>(null);
  const [hoverFraction, setHoverFraction] = useState<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Latest values, read by the rAF loop without re-subscribing it every render.
  const stateRef = useRef({ peaks, progress, accent, hoverFraction });
  stateRef.current = { peaks, progress, accent, hoverFraction };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = container.clientWidth;
    if (cssWidth === 0) return;

    if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(height * dpr);
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, height);

    const current = stateRef.current;
    const barWidth = Math.max(MIN_BAR_WIDTH, Math.floor(cssWidth / current.peaks.length) - BAR_GAP);
    const step = barWidth + BAR_GAP;
    const barCount = Math.floor(cssWidth / step);
    const midY = height / 2;
    const reveal = revealRef.current;
    const playedX = current.progress * cssWidth;

    for (let i = 0; i < barCount; i += 1) {
      // Map this bar back onto the peak array so the shape stays correct at any width.
      const peakIndex = Math.floor((i / barCount) * current.peaks.length);
      const amplitude = current.peaks[peakIndex] ?? 0;

      // Bars settle in left-to-right rather than all at once.
      const barReveal = Math.max(0, Math.min(1, reveal * 1.6 - (i / barCount) * 0.6));
      const barHeight = Math.max(2, amplitude * (height - 6) * barReveal);
      const x = i * step;
      const y = midY - barHeight / 2;

      ctx.fillStyle = x + barWidth <= playedX ? current.accent : "rgba(148, 163, 152, 0.28)";
      // Straddling the playhead: draw the unplayed base, then overpaint the played part.
      if (x < playedX && x + barWidth > playedX) {
        ctx.fillStyle = "rgba(148, 163, 152, 0.28)";
        ctx.fillRect(x, y, barWidth, barHeight);
        ctx.fillStyle = current.accent;
        ctx.fillRect(x, y, playedX - x, barHeight);
      } else {
        ctx.fillRect(x, y, barWidth, barHeight);
      }
    }

    if (current.hoverFraction !== null) {
      const hoverX = current.hoverFraction * cssWidth;
      ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
      ctx.fillRect(hoverX - 0.5, 0, 1, height);
    }

    if (current.progress > 0) {
      ctx.fillStyle = current.accent;
      ctx.fillRect(playedX - 1, 0, 2, height);
    }
  }, [height]);

  useEffect(() => {
    let frame = 0;
    const tick = (timestamp: number) => {
      if (revealStartRef.current === null) revealStartRef.current = timestamp;
      const elapsed = timestamp - revealStartRef.current;
      revealRef.current = Math.min(1, elapsed / 600);
      draw();
      // Keep animating while the intro is still running; after that the loop is
      // what advances the playhead, so it stays on.
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [draw]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(container);
    return () => observer.disconnect();
  }, [draw]);

  const fractionFromEvent = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return 0;
    const rect = container.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  useEffect(() => {
    if (!isScrubbing) return;
    const onMove = (event: PointerEvent) => {
      const fraction = fractionFromEvent(event.clientX);
      setHoverFraction(fraction);
      onSeek?.(fraction);
    };
    const onUp = () => setIsScrubbing(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [isScrubbing, fractionFromEvent, onSeek]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full touch-none select-none ${disabled ? "opacity-40" : "cursor-pointer"}`}
      style={{ height }}
      onPointerDown={(event) => {
        if (disabled || !onSeek) return;
        event.preventDefault();
        setIsScrubbing(true);
        onSeek(fractionFromEvent(event.clientX));
      }}
      onPointerMove={(event) => {
        if (disabled || isScrubbing) return;
        setHoverFraction(fractionFromEvent(event.clientX));
      }}
      onPointerLeave={() => {
        if (!isScrubbing) setHoverFraction(null);
      }}
    >
      <canvas ref={canvasRef} className="h-full w-full" style={{ height }} />
    </div>
  );
}
