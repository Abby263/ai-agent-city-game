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

export type ArmPose = { left: [number, number]; right: [number, number]; /** Elbow bend, left and right (0 is straight). */ bend: [number, number] };

/**
 * Target arm angles for a gesture: [forward swing, outward lift] for the left and right upper arms, plus how far
 * each elbow bends. People talk with their forearms: the upper arms stay near the body and the hands move.
 */
export function armPose(gesture: Gesture | ListenPose, t: number): ArmPose {
  const s = Math.sin(t * 3.1), c = Math.sin(t * 2.3 + 1.2);
  switch (gesture) {
    case "explain": return { left: [-0.32 + s * 0.08, 0.1], right: [-0.36 - s * 0.08, 0.12 + c * 0.05], bend: [1.25 + s * 0.28, 1.35 - s * 0.28] };
    case "open": return { left: [-0.22, 0.3 + s * 0.05], right: [-0.22, 0.3 - s * 0.05], bend: [1.05 + c * 0.12, 1.05 - c * 0.12] };
    case "point": return { left: [0.02, 0.05], right: [-1.05 + s * 0.04, 0.06], bend: [0.25, 0.35 + c * 0.08] };
    case "shrug": return { left: [-0.12, 0.34 + s * 0.04], right: [-0.12, 0.34 - s * 0.04], bend: [1.45, 1.45] };
    case "hips": return { left: [0.22, 0.52], right: [0.22, 0.52], bend: [1.35, 1.35] };
    case "heart": return { left: [0, 0.05], right: [-0.5, -0.22], bend: [0.25, 1.95] };
    case "wave": return { left: [0, 0.05], right: [-0.35, 2.55 + Math.sin(t * 9) * 0.28], bend: [0.2, 0.5] };
    case "fists": return { left: [-0.08 + Math.sin(t * 11) * 0.04, 0.16], right: [-0.08 - Math.sin(t * 11) * 0.04, 0.16], bend: [0.6, 0.6] };
    case "fidget": return { left: [-0.28 + s * 0.03, -0.16], right: [-0.28 - s * 0.03, -0.16], bend: [1.2 + c * 0.06, 1.2 - c * 0.06] };
    case "crossed": return { left: [-0.42, -0.3], right: [-0.4, -0.26], bend: [1.75, 1.7] };
    case "clasped": return { left: [-0.14, -0.16], right: [-0.14, -0.16], bend: [0.85, 0.85] };
    case "attentive": return { left: [-0.04, 0.06], right: [-0.04, 0.06], bend: [0.3, 0.3] };
    default: return { left: [0, 0.05], right: [0, 0.05], bend: [0.2, 0.2] };
  }
}

/** How a listener takes what they just heard. */
export function reactionTo(heard: Emotion, own: Emotion): Emotion {
  if (heard === "angry") return own === "angry" ? "angry" : "worried";
  if (heard === "sad" || heard === "worried") return "worried";
  if (heard === "excited" || heard === "happy") return own === "sad" || own === "angry" ? own : "happy";
  return own;
}
