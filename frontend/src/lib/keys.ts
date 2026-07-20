export const NOTE_NAMES = [
  "C",
  "C# / Db",
  "D",
  "D# / Eb",
  "E",
  "F",
  "F# / Gb",
  "G",
  "G# / Ab",
  "A",
  "A# / Bb",
  "B",
] as const;

/** Shortest semitone path from sourceIndex to targetIndex, in the range [-6, 6]. */
export function semitoneShiftBetween(sourceIndex: number, targetIndex: number): number {
  let diff = (targetIndex - sourceIndex) % 12;
  if (diff > 6) diff -= 12;
  if (diff < -6) diff += 12;
  return diff;
}
