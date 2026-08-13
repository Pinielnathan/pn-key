/**
 * Fetches an audio file once and derives both what we need to *draw* it (a peak
 * envelope) and what we need to *play* it (an object URL).
 *
 * Doing it in that order matters: decodeAudioData detaches the ArrayBuffer it's
 * given, so the Blob is kept as the source of truth and the buffer for decoding
 * is taken from it, rather than trying to reuse one buffer for both.
 */

export interface AudioPeaks {
  /** Max absolute amplitude per bucket, 0..1, length = BUCKET_COUNT. */
  peaks: Float32Array;
  duration: number;
  /** Object URL backed by the same bytes, for an <audio> element to play. */
  url: string;
}

const BUCKET_COUNT = 480;

const cache = new Map<string, Promise<AudioPeaks>>();

let sharedContext: AudioContext | null = null;

function getContext(): AudioContext {
  if (!sharedContext) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedContext = new Ctor();
  }
  return sharedContext;
}

function computePeaks(buffer: AudioBuffer): Float32Array {
  const peaks = new Float32Array(BUCKET_COUNT);
  const channelCount = buffer.numberOfChannels;
  const samplesPerBucket = Math.max(1, Math.floor(buffer.length / BUCKET_COUNT));

  // Walk each channel once rather than materialising a mixdown — for a
  // multi-minute stereo stem that copy would be tens of megabytes for no gain,
  // since we only ever want the louder of the two channels per bucket.
  for (let channel = 0; channel < channelCount; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let bucket = 0; bucket < BUCKET_COUNT; bucket += 1) {
      const start = bucket * samplesPerBucket;
      const end = Math.min(start + samplesPerBucket, data.length);
      let max = peaks[bucket];
      for (let i = start; i < end; i += 1) {
        const value = data[i] < 0 ? -data[i] : data[i];
        if (value > max) max = value;
      }
      peaks[bucket] = max;
    }
  }

  // Normalise so a quiet stem still draws as a readable shape. An isolated
  // vocal is often much quieter than its instrumental, and drawing both at
  // absolute scale makes the vocal look like a flat line next to it.
  let loudest = 0;
  for (let i = 0; i < peaks.length; i += 1) if (peaks[i] > loudest) loudest = peaks[i];
  if (loudest > 0) {
    for (let i = 0; i < peaks.length; i += 1) peaks[i] /= loudest;
  }
  return peaks;
}

async function load(url: string): Promise<AudioPeaks> {
  const response = await fetch(url);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      detail = (await response.json()).detail ?? detail;
    } catch {
      // not JSON — keep statusText
    }
    throw new Error(detail);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const buffer = await getContext().decodeAudioData(await blob.arrayBuffer());
    return { peaks: computePeaks(buffer), duration: buffer.duration, url: objectUrl };
  } catch {
    // Playback can still work off the object URL even when decoding for the
    // waveform fails, so fall back to a flat envelope instead of failing the
    // whole player. Duration comes from the <audio> element in that case.
    return { peaks: new Float32Array(BUCKET_COUNT).fill(0.35), duration: 0, url: objectUrl };
  }
}

export function loadAudioPeaks(url: string): Promise<AudioPeaks> {
  const existing = cache.get(url);
  if (existing) return existing;
  const promise = load(url).catch((error) => {
    // A failed load shouldn't be cached — the next attempt (e.g. after the
    // backend finishes waking up) deserves a real retry.
    cache.delete(url);
    throw error;
  });
  cache.set(url, promise);
  return promise;
}

export { BUCKET_COUNT };
