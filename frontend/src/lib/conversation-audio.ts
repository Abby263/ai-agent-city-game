export type Voice = Pick<SpeechSynthesisVoice, "voiceURI" | "lang" | "localService" | "name">;

export function voiceStyle(citizenId: string, voices: Voice[]) {
  const seed = [...citizenId].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
  const english = voices.filter((v) => /^en(?:-|_)/i.test(v.lang) || v.lang === "en");
  const local = english.filter((v) => v.localService);
  const pool = [...(local.length ? local : english)].sort((a, b) => a.voiceURI.localeCompare(b.voiceURI));
  return { voice: pool.length ? pool[seed % pool.length] : undefined, pitch: 0.96 + (seed % 5) * 0.04, rate: 0.92 + (seed % 4) * 0.03 };
}

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
type Line = { key: string; text: string; citizenId: string; volume: number; onEnd: () => void; onError: () => void; onStart?: () => void };

export class ConversationAudio {
  private version = 0;
  private key: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private utterance: SpeechSynthesisUtterance | null = null;
  private volume = 0.8;

  constructor(private speech: SpeechPort, private create: (text: string) => SpeechSynthesisUtterance = (text) => new SpeechSynthesisUtterance(text)) {}

  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.utterance) this.utterance.volume = this.volume;
  }

  stop() {
    this.version++;
    this.key = null;
    clearTimeout(this.timer);
    this.utterance = null;
    this.speech.cancel();
  }

  play(line: Line) {
    if (this.key === line.key) return;
    this.stop();
    this.key = line.key;
    this.setVolume(line.volume);
    const version = this.version;
    const chunks = speechChunks(line.text);
    const style = voiceStyle(line.citizenId, this.speech.getVoices());
    const fail = () => { if (version === this.version) { this.stop(); line.onError(); } };
    const speak = (index: number) => {
      if (version !== this.version) return;
      if (index >= chunks.length) {
        this.utterance = null;
        this.timer = setTimeout(() => { if (version === this.version) line.onEnd(); }, 500);
        return;
      }
      const utterance = this.create(chunks[index]);
      let settled = false;
      this.utterance = utterance;
      utterance.lang = style.voice?.lang ?? "en-US";
      if (style.voice) utterance.voice = style.voice as SpeechSynthesisVoice;
      utterance.pitch = style.pitch;
      utterance.rate = style.rate;
      utterance.volume = this.volume;
      utterance.onstart = () => {
        if (version !== this.version || settled) return;
        clearTimeout(this.timer);
        this.timer = setTimeout(fail, Math.max(15000, chunks[index].length * 160));
        line.onStart?.();
      };
      utterance.onend = () => {
        if (version !== this.version || settled) return;
        settled = true;
        clearTimeout(this.timer);
        speak(index + 1);
      };
      utterance.onerror = () => { if (!settled) { settled = true; fail(); } };
      this.timer = setTimeout(fail, 7000);
      try { this.speech.speak(utterance); } catch { fail(); }
    };
    speak(0);
  }
}

// A reload requires a fresh opt-in gesture; subsequent scenes keep the choice.
export const conversationAudioPreference = { enabled: false, volume: 0.8 };
