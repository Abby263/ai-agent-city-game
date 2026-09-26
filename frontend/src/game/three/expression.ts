import type { CitizenAgent } from "@/lib/types";

// Body language for conversations: an emotion from mood, feelings and the words themselves,
// and a gesture chosen per line, so no two residents (or lines) look the same.

export type Emotion = "neutral" | "happy" | "excited" | "sad" | "angry" | "worried" | "curious";
export type Gesture = "none" | "explain" | "point" | "open" | "shrug" | "hips" | "heart" | "wave" | "fists" | "fidget";
export type ListenPose = "relaxed" | "crossed" | "clasped" | "attentive";

export function emotionOf(citizen: Pick<CitizenAgent, "mood" | "life">): Emotion {
  const e = citizen.life?.emotions;
  if (e) {
    if (e.anger >= 45) return "angry";
    if (e.sadness >= 50) return "sad";
    if (e.fear >= 50) return "worried";
    if (e.joy >= 70) return "happy";
  }
  const mood = citizen.mood.toLowerCase();
  if (/angr|annoy|frustrat|furious/.test(mood)) return "angry";
  if (/sad|griev|lonely|down|hurt/.test(mood)) return "sad";
  if (/worr|nervous|anxious|scared|shy/.test(mood)) return "worried";
  if (/excit|thrill|overjoy/.test(mood)) return "excited";
  if (/happy|cheer|proud|playful|grateful|hopeful|energetic/.test(mood)) return "happy";
  if (/curious|thoughtful|observant/.test(mood)) return "curious";
  return "neutral";
}

/** The words can override the resting mood for a single line. */
export function lineEmotion(text: string, base: Emotion): Emotion {
  const t = text.toLowerCase();
  if (/how dare|stop it|leave me|unfair|i hate|shut up|seriously\?!/.test(t)) return "angry";
  if (/sorry|miss (you|him|her)|sad|lonely|cry|hurts/.test(t)) return "sad";
  if (/worried|scared|afraid|nervous|what if/.test(t)) return "worried";
  if (/!/.test(t) && /amazing|awesome|yay|great|love|can't wait|congrat|wow|yes/.test(t)) return "excited";
  if (/\?\s*$/.test(t.trim())) return base === "neutral" ? "curious" : base;
  return base;
}

const hash = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 11);

export function gestureFor(text: string, emotion: Emotion, lineIndex: number, seed: string): Gesture {
  const t = text.toLowerCase().trim();
  if (lineIndex <= 1 && /^(hi|hey|hello|yo|good (morning|evening|afternoon)|konnichiwa|ohayo)\b/.test(t)) return "wave";
  const pick = (options: Gesture[]) => options[hash(seed + t) % options.length];
  if (emotion === "angry") return pick(["hips", "point", "fists"]);
  if (emotion === "sad") return pick(["none", "fidget", "heart"]);
  if (emotion === "worried") return pick(["fidget", "shrug", "none"]);
  if (emotion === "excited") return pick(["open", "explain", "heart"]);
  if (/\b(you|look|there|that one)\b/.test(t) && t.length < 60) return pick(["point", "open"]);
  if (/\?\s*$/.test(t)) return pick(["shrug", "open", "explain"]);
  if (/\b(because|so|i think|actually|basically|the thing is)\b/.test(t) || t.length > 90) return pick(["explain", "open", "explain"]);
  return pick(["explain", "open", "none", "explain"]);
}

export function listenPoseFor(emotion: Emotion): ListenPose {
  return emotion === "angry" ? "crossed" : emotion === "sad" || emotion === "worried" ? "clasped" : emotion === "curious" ? "attentive" : "relaxed";
}

/** Target arm angles for a gesture: [x, outward z] for left and right arms, with motion amplitude. */
export function armPose(gesture: Gesture | ListenPose, t: number): { left: [number, number]; right: [number, number] } {
  const s = Math.sin(t * 3.1), c = Math.sin(t * 2.3 + 1.2);
  switch (gesture) {
    case "explain": return { left: [-0.75 + s * 0.22, 0.22], right: [-0.7 - s * 0.22, 0.25 + c * 0.08] };
    case "open": return { left: [-0.55, 0.55 + s * 0.08], right: [-0.55, 0.55 - s * 0.08] };
    case "point": return { left: [0, 0.05], right: [-1.45 + s * 0.05, 0.08] };
    case "shrug": return { left: [-0.35, 0.75 + s * 0.05], right: [-0.35, 0.75 - s * 0.05] };
    case "hips": return { left: [0.3, 0.55], right: [0.3, 0.55] };
    case "heart": return { left: [-0.2, 0.05], right: [-1.25, -0.4] };
    case "wave": return { left: [0, 0.05], right: [-0.35, 2.55 + Math.sin(t * 9) * 0.28] };
    case "fists": return { left: [-0.25 + Math.sin(t * 11) * 0.06, 0.18], right: [-0.25 - Math.sin(t * 11) * 0.06, 0.18] };
    case "fidget": return { left: [-0.85 + s * 0.05, -0.42], right: [-0.85 - s * 0.05, -0.42] };
    case "crossed": return { left: [-1.2, -0.62], right: [-1.15, -0.55] };
    case "clasped": return { left: [-0.45, -0.3], right: [-0.45, -0.3] };
    case "attentive": return { left: [-0.1, 0.06], right: [-0.1, 0.06] };
    default: return { left: [0, 0.05], right: [0, 0.05] };
  }
}
