import { activeCity } from "./cities";
import { soundAllowed } from "./conversation-audio";
import { spokenText } from "./voices";

// The narrator's own voice: the device's speech, slower and calmer than the residents', so you always know who is
// talking. It tells a story one short sentence at a time. Free and instant; it never calls a model.

const KEY = "agentcity.narratorVoice";
let run = 0;

export function narratorVoiceOn() {
  try { return window.localStorage.getItem(KEY) !== "off"; } catch { return true; }
}
export function setNarratorVoice(on: boolean) {
  try { window.localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* remembered for this visit only */ }
  if (!on) stopNarration();
  window.dispatchEvent(new Event(VOICE_CHANGED));
}
/** Fired when the narrator's voice is switched on or off from anywhere (the button, or "mute" said aloud). */
export const VOICE_CHANGED = "agentcity:narrator-voice";

// The best voice the device has. Newer "natural" voices sound like a person reading a story; the old ones like a
// timetable. In Lucknow an Indian English voice tells the story, if there is one.
const NATURAL = /natural|neural|online|enhanced|premium|siri/i;
const PREFERRED = /Daniel|Google UK English Male|Arthur|Oliver|Microsoft (?:Ryan|Guy|George)|Alex|Google US English/i;
const INDIAN = /Rishi|Prabhat|Neerja|Veena|Isha|Sangeeta/i;
export function narratorVoice(voices: Array<Pick<SpeechSynthesisVoice, "name" | "lang" | "default">>, city = activeCity().id) {
  const english = voices.filter((v) => /^en(?:-|_|$)/i.test(v.lang));
  const local = city === "lucknow" ? english.filter((v) => /^en[-_]IN/i.test(v.lang) || INDIAN.test(v.name)) : [];
  const score = (v: Pick<SpeechSynthesisVoice, "name" | "lang" | "default">) =>
    (local.includes(v) ? 8 : 0) + (NATURAL.test(v.name) ? 4 : 0) + (PREFERRED.test(v.name) ? 2 : 0) + (v.default ? 1 : 0);
  return [...english].sort((a, b) => score(b) - score(a))[0];
}

export function stopNarration() {
  run++;
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

/** Waits, but gives up at once if the narrator is told to stop. */
async function wait(ms: number, mine: number) {
  const until = performance.now() + ms;
  while (mine === run && performance.now() < until) await new Promise((resolve) => window.setTimeout(resolve, Math.min(120, until - performance.now())));
}
/** How long a beat stays up when it is only read, not heard. */
export const readingTime = (beat: string) => Math.max(1700, 700 + beat.split(/\s+/).length * 330);
// An unhurried storyteller: a little under normal speed, and a breath between sentences.
const RATE = 0.9, BREATH = 420;

/** Says one beat; resolves true when it was heard, false if the device stayed silent. */
function sayBeat(beat: string, mine: number, voice: SpeechSynthesisVoice | undefined, index: number): Promise<boolean> {
  const speech = window.speechSynthesis;
  return new Promise((resolve) => {
    let settled = false, started = false;
    const done = (heard: boolean) => { if (!settled) { settled = true; window.clearTimeout(guard); window.clearTimeout(silent); resolve(heard); } };
    // A device with no voice (or a tab that isn't allowed to speak) never starts: move on quickly.
    const silent = window.setTimeout(() => { if (!started) { speech.cancel(); done(false); } }, 2200);
    // Speech engines sometimes never report the end; never leave the game waiting on them.
    const guard = window.setTimeout(() => done(started), 3500 + beat.length * 110);
    const utterance = new SpeechSynthesisUtterance(spokenText(beat));
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
    // The place name that opens a scene is said low and slow, like a title; a question lifts; the rest varies a
    // little from line to line, so it never drones.
    const question = /\?\s*$/.test(beat), title = index === 0 && beat.split(/\s+/).length <= 4;
    utterance.rate = title ? RATE - 0.06 : question ? RATE + 0.02 : RATE + (index % 2 ? 0.03 : 0);
    utterance.pitch = title ? 0.9 : question ? 1.08 : index % 2 ? 1.02 : 0.96;
    utterance.onstart = () => { started = true; };
    utterance.onend = () => done(true);
    utterance.onerror = () => done(false);
    if (mine !== run) return done(false);
    try { speech.speak(utterance); } catch { done(false); }
  });
}

/**
 * Tells the beats one at a time: `onBeat` fires as each begins (so the caption can show just that sentence), then
 * it is spoken, then a breath. Where the device can't speak, or the voice is off, each beat is held long enough to
 * read instead. Resolves when the last is done, or at once if `stopNarration` cuts in.
 */
export async function speakNarration(beats: string[], onBeat: (index: number) => void = () => {}): Promise<void> {
  if (typeof window === "undefined" || !beats.length) return;
  const canSpeak = "speechSynthesis" in window && narratorVoiceOn() && soundAllowed();
  if (canSpeak) window.speechSynthesis.cancel();
  const mine = ++run;
  const voice = canSpeak ? narratorVoice(window.speechSynthesis.getVoices()) as SpeechSynthesisVoice | undefined : undefined;
  let voiced = canSpeak;
  for (let i = 0; i < beats.length; i++) {
    if (mine !== run) return;
    onBeat(i);
    const began = performance.now();
    if (voiced) voiced = await sayBeat(beats[i], mine, voice, i);
    if (mine !== run) return;
    // Unheard (or cut short by a silent device): leave it up for as long as it takes to read.
    if (!voiced) await wait(Math.max(0, readingTime(beats[i]) - (performance.now() - began)), mine);
    else if (i < beats.length - 1) await wait(i === 0 ? BREATH + 180 : BREATH, mine);
  }
}
