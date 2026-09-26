import { API_URL } from "./api-url";
import { deviceVoice, spokenText, type Casting, type DeviceVoice } from "./voices";
import { pulse, setSpeaker } from "./speech-level";

export type Voice = DeviceVoice;

// Short utterances avoid long-line stalls on mobile speech engines. The subtitle
// remains the original full line until every chunk has been spoken.
export function speechChunks(text: string, limit = 160) {
  const chunks: string[] = [];
  let part = "";
  for (const word of text.trim().split(/\s+/u)) {
    if (part && part.length + word.length + 1 > limit) { chunks.push(part); part = ""; }
    part += `${part ? " " : ""}${word}`;
  }
  if (part) chunks.push(part);
  return chunks;
}

type SpeechPort = Pick<SpeechSynthesis, "cancel" | "speak" | "getVoices">;
export type Line = {
  key: string; text: string; citizenId: string; volume: number; casting: Casting; style?: string;
  onEnd: () => void; onError: () => void; onStart?: () => void;
};

// Natural voices are fetched once per line and shared across replays; failures fall back to device voices.
const naturalCache = new Map<string, Promise<string>>();
let naturalDownUntil = 0;
function naturalUrl(line: Pick<Line, "text" | "casting" | "style">) {
  const text = spokenText(line.text).slice(0, 420);
  const key = `${line.casting.natural}|${line.style}|${text}`;
  if (!naturalCache.has(key)) {
    naturalCache.set(key, fetch(`${API_URL}/speech`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ text, voice: line.casting.natural, style: line.style ?? "" }),
    }).then(async (response) => {
      if (!response.ok) throw new Error(`voice ${response.status}`);
      return URL.createObjectURL(await response.blob());
    }).catch((error) => {
      naturalCache.delete(key);
      naturalDownUntil = Date.now() + 60_000;
      throw error;
    }));
  }
  return naturalCache.get(key)!;
}

let context: AudioContext | null = null;
/** Must run inside a user gesture (the voices button) so browsers allow playback. */
export function unlockAudio() {
  try {
    context ??= new AudioContext();
    void context.resume();
  } catch {
    context = null;
  }
}

export class ConversationAudio {
  private version = 0;
  private key: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private utterance: SpeechSynthesisUtterance | null = null;
  private element: HTMLAudioElement | null = null;
  private volume = 0.8;

  constructor(
    private speech: SpeechPort | null,
    private create: (text: string) => SpeechSynthesisUtterance = (text) => new SpeechSynthesisUtterance(text),
    private engine: () => "natural" | "device" = () => conversationAudioPreference.engine,
  ) {}

  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.utterance) this.utterance.volume = this.volume;
    if (this.element) this.element.volume = this.volume;
  }

  stop() {
    this.version++;
    this.key = null;
    clearTimeout(this.timer);
    this.utterance = null;
    if (this.element) { this.element.pause(); this.element = null; }
    this.speech?.cancel();
    setSpeaker(null);
  }

  /** Starts fetching a line's natural voice early so the next speaker answers without a gap. */
  prefetch(line: Pick<Line, "text" | "casting" | "style">) {
    if (this.engine() === "natural" && Date.now() > naturalDownUntil && spokenText(line.text)) void naturalUrl(line).catch(() => undefined);
  }

  play(line: Line) {
    if (this.key === line.key) return;
    this.stop();
    this.key = line.key;
    this.setVolume(line.volume);
    if (!spokenText(line.text)) {
      // A pure action like *hugs Leo* has nothing to say aloud.
      const version = this.version;
      this.timer = setTimeout(() => { if (version === this.version) line.onEnd(); }, 1200);
      return;
    }
    if (this.engine() === "natural" && Date.now() > naturalDownUntil) this.playNatural(line);
    else this.playDevice(line);
  }

  private playNatural(line: Line) {
    const version = this.version;
    naturalUrl(line).then((url) => {
      if (version !== this.version) return;
      const element = new Audio(url);
      this.element = element;
      element.volume = this.volume;
      let level: (() => number) | null = null;
      if (context?.state === "running") {
        try {
          const analyser = context.createAnalyser();
          analyser.fftSize = 512;
          context.createMediaElementSource(element).connect(analyser);
          analyser.connect(context.destination);
          const data = new Uint8Array(analyser.fftSize);
          level = () => {
            analyser.getByteTimeDomainData(data);
            let sum = 0;
            for (const v of data) sum += ((v - 128) / 128) ** 2;
            return Math.sqrt(sum / data.length) * 4.5;
          };
        } catch {
          level = null;
        }
      }
      element.onplay = () => { if (version === this.version) { setSpeaker(line.citizenId, level ?? (() => 0.35 + Math.abs(Math.sin(performance.now() / 90)) * 0.5)); line.onStart?.(); } };
      element.onended = () => {
        if (version !== this.version) return;
        setSpeaker(null);
        this.timer = setTimeout(() => { if (version === this.version) line.onEnd(); }, 350);
      };
      element.onerror = () => { if (version === this.version) this.playDevice(line); };
      element.play().catch(() => { if (version === this.version) this.playDevice(line); });
    }).catch(() => { if (version === this.version) this.playDevice(line); });
  }

  private playDevice(line: Line) {
    const version = this.version;
    if (!this.speech) { line.onError(); return; }
    const chunks = speechChunks(spokenText(line.text));
    const voice = deviceVoice(line.casting, this.speech.getVoices(), line.citizenId);
    const fail = () => { if (version === this.version) { this.stop(); line.onError(); } };
    const speak = (index: number) => {
      if (version !== this.version) return;
      if (index >= chunks.length) {
        this.utterance = null;
        setSpeaker(null);
        this.timer = setTimeout(() => { if (version === this.version) line.onEnd(); }, 400);
        return;
      }
      const utterance = this.create(chunks[index]);
      let settled = false;
      this.utterance = utterance;
      utterance.lang = voice?.lang ?? "en-US";
      if (voice) utterance.voice = voice as SpeechSynthesisVoice;
      utterance.pitch = line.casting.pitch;
      utterance.rate = line.casting.rate;
      utterance.volume = this.volume;
      utterance.onstart = () => {
        if (version !== this.version || settled) return;
        clearTimeout(this.timer);
        setSpeaker(line.citizenId);
        pulse(0.8);
        this.timer = setTimeout(fail, Math.max(15000, chunks[index].length * 160));
        line.onStart?.();
      };
      utterance.onboundary = () => pulse(0.9);
      utterance.onend = () => {
        if (version !== this.version || settled) return;
        settled = true;
        clearTimeout(this.timer);
        speak(index + 1);
      };
      utterance.onerror = () => { if (!settled) { settled = true; fail(); } };
      this.timer = setTimeout(fail, 7000);
      try { this.speech!.speak(utterance); } catch { fail(); }
    };
    speak(0);
  }
}

const ENGINE_KEY = "agentcity.voiceEngine";
function savedEngine(): "natural" | "device" {
  try { return typeof window !== "undefined" && window.localStorage.getItem(ENGINE_KEY) === "device" ? "device" : "natural"; } catch { return "natural"; }
}
// A reload requires a fresh opt-in gesture; subsequent scenes keep the choice.
export const conversationAudioPreference = {
  enabled: false,
  volume: 0.8,
  engine: savedEngine(),
  setEngine(engine: "natural" | "device") {
    this.engine = engine;
    try { window.localStorage.setItem(ENGINE_KEY, engine); } catch { /* remembered for this visit */ }
  },
};
