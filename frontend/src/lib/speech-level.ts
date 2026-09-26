// Who is speaking and how loudly right now (0-1). Audio writes it; the 3D renderer reads it every frame
// to open and close that resident's mouth, so lips follow the real sound.

let current = { speakerId: null as string | null, level: 0, updated: 0 };
let source: (() => number) | null = null;

export function setSpeaker(speakerId: string | null, levelSource: (() => number) | null = null) {
  current = { speakerId, level: 0, updated: performance.now() };
  source = levelSource;
}

/** For engines without an audio stream (device voices), each spoken word gives the mouth a pulse. */
export function pulse(amount = 1) {
  current = { ...current, level: Math.max(current.level, amount), updated: performance.now() };
}

export function speechLevel() {
  if (source) return { speakerId: current.speakerId, level: Math.min(1, source()) };
  const age = (performance.now() - current.updated) / 1000;
  return { speakerId: current.speakerId, level: current.level * Math.max(0, 1 - age * 5) };
}
