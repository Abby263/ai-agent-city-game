import type { CitizenAgent } from "./types";

// Casting: every resident gets a stable, distinct voice that fits their sex, age and personality.
// Natural voices are Gemini TTS prebuilt voices; device voices are the browser's speechSynthesis fallback.

type Pools = { young: string[]; adult: string[]; elder: string[] };
const naturalVoices: Record<"female" | "male", Pools> = {
  female: { young: ["Leda", "Laomedeia", "Autonoe", "Zephyr"], adult: ["Kore", "Aoede", "Despina", "Erinome", "Callirrhoe", "Sulafat", "Pulcherrima"], elder: ["Gacrux", "Vindemiatrix", "Achernar"] },
  male: { young: ["Puck", "Fenrir", "Sadachbia"], adult: ["Charon", "Orus", "Iapetus", "Umbriel", "Algieba", "Achird", "Zubenelgenubi", "Alnilam", "Schedar", "Rasalgethi"], elder: ["Algenib", "Sadaltager", "Enceladus"] },
};

export type Casting = { natural: string; sex: "female" | "male"; age: number; describe: string; voiceTag: string; pitch: number; rate: number };

const hash = (text: string) => [...text].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
const band = (age: number): keyof Pools => (age < 25 ? "young" : age >= 62 ? "elder" : "adult");

/** Assigns voices across the whole town so two people in the same age band rarely sound alike. */
export function castVoices(citizens: Array<Pick<CitizenAgent, "citizen_id" | "name" | "age" | "profession" | "personality" | "life">>) {
  const used = new Set<string>();
  const cast = new Map<string, Casting>();
  for (const c of [...citizens].sort((a, b) => a.citizen_id.localeCompare(b.citizen_id))) {
    const sex = c.life?.sex ?? (hash(c.citizen_id) % 2 ? "female" : "male");
    const preferred = naturalVoices[sex][band(c.age)];
    // Use another adult-compatible voice before repeating one in a large cast.
    const pool = [...preferred, ...naturalVoices[sex].adult.filter((v) => !preferred.includes(v))];
    const start = hash(c.citizen_id) % pool.length;
    const natural = pool.map((_, i) => pool[(start + i) % pool.length]).find((v) => !used.has(v)) ?? pool[start];
    used.add(natural);
    const traits = ((c.personality.nature as { traits?: string[] } | undefined)?.traits ?? []).slice(0, 2).join(" and ").toLowerCase();
    const who = c.age < 13 ? (sex === "female" ? "girl" : "boy") : c.age < 18 ? `teenage ${sex === "female" ? "girl" : "boy"}` : c.age >= 62 ? `older ${sex === "female" ? "woman" : "man"}` : sex === "female" ? "woman" : "man";
    const jitter = ((hash(c.name) % 5) - 2) * 0.02;
    cast.set(c.citizen_id, {
      natural, sex, age: c.age,
      voiceTag: c.age < 2 ? "baby" : `${c.age}-year-old ${who}`,
      describe: `a ${c.age < 2 ? "baby" : `${c.age}-year-old ${who}`}${traits ? `, ${traits}` : ""}${c.age >= 18 ? `, who works as a ${c.profession.toLowerCase()}` : ""}`,
      pitch: (c.age < 13 ? 1.22 : c.age < 18 ? 1.1 : c.age >= 70 ? 0.88 : 1) + jitter,
      rate: (c.age >= 70 ? 0.88 : c.age < 13 ? 1.04 : 0.98) + jitter / 2,
    });
  }
  return cast;
}

/** How the line should sound: a short direction for natural voices, derived from the words and mood. */
export function deliveryStyle(casting: Casting, text: string, mood = "") {
  const t = text.toLowerCase();
  const tone = /sorry|miss|sad|lonely|hurt|cry/.test(t) || /grie|sad|lonely/i.test(mood) ? "soft, a little sad"
    : /!|haha|amazing|awesome|yay|great|love/.test(t) ? "warm, excited"
      : /angry|how dare|stop it|leave me|unfair|hate/.test(t) || /angry|annoyed/i.test(mood) ? "sharp, upset"
        : /\?$/.test(text.trim()) ? "curious, casual"
          : /\.\.\.|um|uh|well,/.test(t) ? "hesitant, thoughtful" : "natural, conversational";
  // A short tag, e.g. "warm, excited, 14-year-old girl": the voice model treats it as delivery, not words.
  return `${tone}, ${casting.voiceTag}`.slice(0, 120);
}

/** Words for the ear: drop stage directions like *hugs Leo*, emojis and extra symbols. */
export function spokenText(text: string) {
  return text
    .replace(/\*[^*]{0,120}\*/g, " ")
    .replace(/\([^)]{0,80}\)/g, " ")
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Apple ships joke voices (Bubbles, Zarvox...) and robotic legacy voices; never cast them.
const novelty = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|princess|fred|junior|kathy|ralph|grandma|grandpa|rocko|eddy|flo|reed|sandy|shelley)\b/i;
const femaleNames = /\b(samantha|ava|allison|susan|zoe|nicky|joelle|kate|stephanie|serena|martha|matilda|karen|catherine|tara|isha|sangeeta|veena|moira|tessa|fiona|zira|hazel|heera|linda|emma|jenny|aria|michelle|ana|sonia|libby|maisie|natasha|hayley|clara|heather|neerja|emily|leah|molly|rosa|luna|imani|female|victoria|kyoko|o-ren)\b/i;
const maleNames = /\b(alex|daniel|tom|evan|nathan|aaron|oliver|jamie|arthur|lee|gordon|rishi|aman|david|mark|george|richard|ravi|sean|andrew|brian|guy|eric|steffan|christopher|roger|ryan|thomas|william|liam|prabhat|connor|luke|sam|mitchell|james|wayne|male|otoya|hattori)\b/i;

export type DeviceVoice = Pick<SpeechSynthesisVoice, "voiceURI" | "lang" | "localService" | "name">;

function quality(v: DeviceVoice) {
  return (/natural|premium|neural/i.test(v.name) ? 40 : 0) + (/enhanced|google|online/i.test(v.name) ? 25 : 0) + (/^en-(us|gb)/i.test(v.lang) ? 5 : 0) + (v.localService ? 2 : 0);
}

/** Picks a matching, good-quality device voice, spreading residents across the voices available. */
export function deviceVoice(casting: Casting, voices: DeviceVoice[], seed: string) {
  const english = voices.filter((v) => /^en(?:-|_|$)/i.test(v.lang) && !novelty.test(v.name));
  const gendered = english.filter((v) => (casting.sex === "female" ? femaleNames : maleNames).test(v.name));
  const pool = (gendered.length ? gendered : english).sort((a, b) => quality(b) - quality(a) || a.voiceURI.localeCompare(b.voiceURI));
  const top = pool.filter((v) => quality(v) >= quality(pool[0] ?? v) - 10).slice(0, 4);
  const choices = top.length ? top : pool;
  return choices.length ? choices[hash(seed) % choices.length] : undefined;
}
