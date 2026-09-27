// Graphics quality: one preset per class of device, chosen automatically and lowered if the town stutters.
// Override with ?q=low|medium|high in the URL; a lowered preset is remembered for the next visit.

export type QualityLevel = "low" | "medium" | "high";
export type QualityPreset = {
  level: QualityLevel;
  /** Upper bound on device pixels per CSS pixel. */
  pixelRatio: number;
  /** Hardware anti-aliasing samples for the scene (0 = none). */
  msaa: number;
  /** Screen-space ambient occlusion that grounds buildings, trees and people. */
  ao: boolean;
  aoHalfRes: boolean;
  aoMode: "Performance" | "Low" | "Medium" | "High";
  shadowMap: number;
};

export const presets: Record<QualityLevel, QualityPreset> = {
  low: { level: "low", pixelRatio: 1, msaa: 0, ao: false, aoHalfRes: true, aoMode: "Performance", shadowMap: 1024 },
  medium: { level: "medium", pixelRatio: 1.35, msaa: 2, ao: true, aoHalfRes: true, aoMode: "Performance", shadowMap: 2048 },
  high: { level: "high", pixelRatio: 1.75, msaa: 4, ao: true, aoHalfRes: false, aoMode: "Medium", shadowMap: 2048 },
};

const KEY = "agentcity.quality";
const order: QualityLevel[] = ["low", "medium", "high"];

function stored(): QualityLevel | null {
  try {
    const value = localStorage.getItem(KEY);
    return order.includes(value as QualityLevel) ? (value as QualityLevel) : null;
  } catch {
    return null;
  }
}

/** The preset to start with: URL override, then what this device settled on last time, then a guess from the device. */
export function initialQuality(): QualityPreset {
  const asked = typeof location !== "undefined" ? new URLSearchParams(location.search).get("q") : null;
  const fromUrl = asked === "med" ? "medium" : asked;
  if (order.includes(fromUrl as QualityLevel)) return presets[fromUrl as QualityLevel];
  const remembered = stored();
  if (remembered) return presets[remembered];
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { deviceMemory?: number }) : undefined;
  const weak = (nav?.hardwareConcurrency ?? 8) <= 4 || (nav?.deviceMemory ?? 8) <= 3;
  const phone = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches && innerWidth < 900;
  return presets[weak ? "low" : phone ? "medium" : "high"];
}

/** One level down, remembered so the next visit starts there; null when already at the lowest. */
export function lowerQuality(current: QualityLevel): QualityPreset | null {
  const next = order[order.indexOf(current) - 1];
  if (!next) return null;
  try { localStorage.setItem(KEY, next); } catch { /* storage blocked: only this visit is lowered */ }
  return presets[next];
}

/**
 * Watches frame times and asks for a lower preset when the town can't keep up (the loop targets 30 fps).
 * Slow frames right after loading or a camera cut are ignored.
 */
export class FrameMonitor {
  private samples: number[] = [];
  private since = 0;
  constructor(private readonly onSlow: () => void, private readonly budgetMs = 45, private readonly windowMs = 5000) {}
  sample(now: number, frameMs: number) {
    if (!this.since) this.since = now + 4000;
    if (now < this.since) return;
    this.samples.push(frameMs);
    if (now - this.since < this.windowMs) return;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    this.samples = [];
    this.since = now;
    if (median > this.budgetMs) this.onSlow();
  }
  /** Ignore the next few seconds (a preset change or a long pause). */
  reset(now: number) {
    this.samples = [];
    this.since = now + 3000;
  }
}
