import { useEffect, useRef } from "react";

interface LiveWaveformProps {
  height?: number;
  barCount?: number;
  className?: string;
}

/**
 * The idle waveform band in the hero. It drifts on its own, and swells toward
 * the pointer — the page reacts to you before you've uploaded anything, which
 * is the whole point of it being here.
 *
 * Pointer position is tracked in a ref and read inside the animation loop, so
 * moving the mouse never triggers a React render.
 */
export function LiveWaveform({ height = 96, barCount = 64, className }: LiveWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef<{ x: number; active: boolean }>({ x: -1, active: false });
  // Each bar keeps its own current height so it eases toward the target
  // rather than snapping — that easing is what makes it feel physical.
  const heightsRef = useRef<Float32Array>(new Float32Array(barCount));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let start = 0;

    const render = (timestamp: number) => {
      if (!start) start = timestamp;
      const elapsed = (timestamp - start) / 1000;

      const dpr = window.devicePixelRatio || 1;
      const cssWidth = canvas.clientWidth;
      const cssHeight = height;
      if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
        canvas.width = Math.round(cssWidth * dpr);
        canvas.height = Math.round(cssHeight * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      const step = cssWidth / barCount;
      const barWidth = Math.max(2, step * 0.55);
      const midY = cssHeight / 2;
      const pointer = pointerRef.current;

      for (let i = 0; i < barCount; i += 1) {
        const x = i * step + (step - barWidth) / 2;

        // Two out-of-phase sines give a rolling shape that never visibly loops.
        const base = reduceMotion
          ? 0.35
          : 0.32 + 0.26 * Math.sin(elapsed * 1.6 + i * 0.28) + 0.14 * Math.sin(elapsed * 0.9 - i * 0.11);

        let target = base;
        if (pointer.active && !reduceMotion) {
          // Bell curve around the cursor, so the swell has soft shoulders
          // instead of a hard edge at some radius.
          const distance = Math.abs(x + barWidth / 2 - pointer.x);
          const influence = Math.exp(-(distance * distance) / (2 * 90 * 90));
          target += influence * 0.75;
        }

        const previous = heightsRef.current[i];
        const eased = previous + (target - previous) * 0.18;
        heightsRef.current[i] = eased;

        const barHeight = Math.max(3, Math.min(1, eased) * (cssHeight - 8));
        const intensity = Math.min(1, eased);

        const gradient = ctx.createLinearGradient(0, midY - barHeight / 2, 0, midY + barHeight / 2);
        gradient.addColorStop(0, `rgba(212, 224, 28, ${0.25 + intensity * 0.65})`);
        gradient.addColorStop(1, `rgba(201, 162, 39, ${0.15 + intensity * 0.45})`);
        ctx.fillStyle = gradient;

        ctx.beginPath();
        ctx.roundRect(x, midY - barHeight / 2, barWidth, barHeight, barWidth / 2);
        ctx.fill();
      }

      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [barCount, height]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ height, width: "100%" }}
      aria-hidden
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        pointerRef.current = { x: event.clientX - rect.left, active: true };
      }}
      onPointerLeave={() => {
        pointerRef.current = { x: -1, active: false };
      }}
    />
  );
}
