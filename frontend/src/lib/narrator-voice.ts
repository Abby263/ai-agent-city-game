import { soundAllowed, speechChunks } from "./conversation-audio";
import { spokenText } from "./voices";

// The narrator's own voice: the device's speech, calmer and lower than the residents', so you always know who is
// talking. Free and instant; it never calls a model.

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

const PREFERRED = /Daniel|Google UK English Male|Arthur|Oliver|Microsoft (?:Ryan|Guy|George)|Alex|Google US English/i;
function narratorVoice(voices: SpeechSynthesisVoice[]) {
  const english = voices.filter((v) => /^en(?:-|_|$)/i.test(v.lang));
  return english.find((v) => PREFERRED.test(v.name)) ?? english.find((v) => v.default) ?? english[0];
}

export function stopNarration() {
  run++;
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

/** Says it aloud and resolves when finished (or at once, if the narrator can't speak here). */
export function speakNarration(text: string): Promise<void> {
  const words = spokenText(text);
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !narratorVoiceOn() || !soundAllowed() || !words) return Promise.resolve();
  const speech = window.speechSynthesis;
  speech.cancel();
  const mine = ++run;
  const chunks = speechChunks(words, 180);
  const voice = narratorVoice(speech.getVoices());
  return new Promise((resolve) => {
    let settled = false;
    let started = false;
    const done = () => { if (!settled) { settled = true; window.clearTimeout(guard); window.clearTimeout(silent); resolve(); } };
    // A device with no voice (or a tab that isn't allowed to speak) never starts: move on quickly.
    const silent = window.setTimeout(() => { if (!started) done(); }, 2500);
    // Speech engines sometimes never report the end; never leave the game waiting on them.
    const guard = window.setTimeout(done, 3000 + words.length * 95);
    const say = (index: number) => {
      if (mine !== run || index >= chunks.length) return done();
      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
      utterance.pitch = 0.92;
      utterance.rate = 1.04;
      utterance.onstart = () => { started = true; };
      utterance.onend = () => say(index + 1);
      utterance.onerror = done;
      try { speech.speak(utterance); } catch { done(); }
    };
    say(0);
  });
}
