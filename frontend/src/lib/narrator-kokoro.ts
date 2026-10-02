// The narrator's natural voice: Kokoro, an open-source neural voice (Apache 2.0), run on the player's own
// graphics card by HeadTTS (MIT) in a web worker. Nothing is sent to a server and nothing costs anything per line.
// Besides the audio it returns when each word and each mouth shape falls, which is what moves the avatar's lips.
//
// The model is a big download (about 325 MB, kept by the browser afterwards) and needs WebGPU to keep up with
// speech, so it is only fetched on desktop browsers that have it; everywhere else the device's voice is used.

export type Clip = {
  audio: AudioBuffer;
  words: string[]; wtimes: number[]; wdurations: number[];
  visemes: string[]; vtimes: number[]; vdurations: number[];
};
export type KokoroState = { status: "idle" | "unsupported" | "loading" | "ready" | "failed"; progress: number };

type HeadTTSClient = {
  connect: (settings?: null, onprogress?: (event: ProgressEvent) => void) => Promise<void>;
  setup: (data: Record<string, unknown>) => Promise<unknown>;
  synthesize: (data: { input: string }) => Promise<Array<{ type: string; data: Clip & { error?: string } }>>;
  clear: () => void;
};

/** A warm, clear storyteller: Kokoro's best-rated English voice, a touch under normal speed. */
const VOICE = "af_heart", SPEED = 0.94;
const MODULE = "/vendor/headtts/modules/headtts.mjs";

let state: KokoroState = { status: "idle", progress: 0 };
const listeners = new Set<() => void>();
const update = (next: Partial<KokoroState>) => { state = { ...state, ...next }; listeners.forEach((listener) => listener()); };
export const kokoroState = () => state;
export function onKokoro(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

/** Desktop browsers with WebGPU, not asked to save data, and not switched off by the player. */
export function kokoroSupported() {
  if (typeof window === "undefined" || !("gpu" in navigator) || typeof Worker === "undefined") return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) return false;
  try { return window.localStorage.getItem("agentcity.narratorEngine") !== "device"; } catch { return true; }
}

let client: HeadTTSClient | null = null;
let loading: Promise<boolean> | null = null;
/** Fetches and starts the voice (once). Resolves true when it can speak. */
export function loadKokoro(): Promise<boolean> {
  if (loading) return loading;
  if (!kokoroSupported()) { update({ status: "unsupported" }); return Promise.resolve(false); }
  update({ status: "loading", progress: 0 });
  loading = (async () => {
    try {
      const adapter = await (navigator as Navigator & { gpu: { requestAdapter: () => Promise<unknown> } }).gpu.requestAdapter();
      if (!adapter) throw new Error("no graphics adapter");
      // Loaded at run time from /public, outside the bundle: it starts its own module worker next to itself.
      const { HeadTTS } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ MODULE) as { HeadTTS: new (options: Record<string, unknown>) => HeadTTSClient };
      // Full precision: the half-precision model comes out silent on WebGPU.
      const tts = new HeadTTS({ endpoints: ["webgpu"], languages: ["en-us"], voices: [VOICE], dtypeWebgpu: "fp32", defaultVoice: VOICE, splitSentences: false });
      await tts.connect(null, (event) => { if (event.total) update({ progress: Math.min(0.99, event.loaded / event.total) }); });
      await tts.setup({ voice: VOICE, language: "en-us", speed: SPEED, audioEncoding: "wav" });
      client = tts;
      // The first sentence compiles the model's shaders; do that now, not while the player waits.
      await tts.synthesize({ input: "Ready." });
      update({ status: "ready", progress: 1 });
      return true;
    } catch {
      client = null;
      update({ status: "failed" });
      return false;
    }
  })();
  return loading;
}

const clips = new Map<string, Promise<Clip>>();
/** The spoken sentence, with its word and mouth-shape timings. Sentences already made are kept and reused. */
export function kokoroClip(text: string): Promise<Clip> {
  const known = clips.get(text);
  if (known) return known;
  if (!client) return Promise.reject(new Error("voice not loaded"));
  const made = client.synthesize({ input: text }).then((messages) => {
    const audio = messages.find((m) => m.type === "audio");
    if (!audio?.data.audio) throw new Error(messages[0]?.data.error ?? "no audio");
    return audio.data;
  });
  clips.set(text, made);
  made.catch(() => clips.delete(text));
  if (clips.size > 80) { const oldest = clips.keys().next().value; if (oldest !== undefined) clips.delete(oldest); }
  return made;
}

// Who plays a clip: the narrator's avatar when it is on screen (so its lips move), else a plain audio source.
type Speaker = { play: (clip: Clip) => Promise<boolean>; stop: () => void };
let avatar: Speaker | null = null;
export function setAvatarSpeaker(speaker: Speaker | null) { avatar = speaker; }

let context: AudioContext | null = null, source: AudioBufferSourceNode | null = null;
const plain: Speaker = {
  play: (clip) => new Promise((resolve) => {
    try {
      context ??= new AudioContext();
      void context.resume();
      const node = context.createBufferSource();
      node.buffer = clip.audio;
      node.connect(context.destination);
      node.onended = () => { if (source === node) source = null; resolve(true); };
      source = node;
      node.start();
    } catch { resolve(false); }
  }),
  stop: () => { try { source?.stop(); } catch { /* already stopped */ } source = null; },
};
/** Plays a clip to the end; resolves false if it could not be played. */
export const playClip = (clip: Clip) => (avatar ?? plain).play(clip);
export function stopClip() { avatar?.stop(); plain.stop(); }
