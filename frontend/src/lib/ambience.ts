// The sound of the neighbourhood, made in the browser (no audio files): a soft city hum, birdsong by day, crickets
// at night, rain when it rains, and a quiet score underneath. It ducks while people are talking.

const KEY = "agentcity.sound";
type Layers = { master: GainNode; city: GainNode; rain: GainNode; crickets: GainNode; music: GainNode; birds: GainNode };

let context: AudioContext | null = null;
let layers: Layers | null = null;
let scene = { night: 0, rain: 0, talking: false };
let timers: number[] = [];

export function ambienceEnabled() {
  try { return window.localStorage.getItem(KEY) !== "off"; } catch { return true; }
}

function noise(ctx: AudioContext, brown: boolean) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = brown ? (last + 0.02 * white) / 1.02 : white;
    data[i] = brown ? last * 3.5 : white;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.start();
  return source;
}

const gain = (ctx: AudioContext, value: number, to: AudioNode) => {
  const node = ctx.createGain();
  node.gain.value = value;
  node.connect(to);
  return node;
};

function build(ctx: AudioContext): Layers {
  const master = gain(ctx, 0, ctx.destination);
  const city = gain(ctx, 0.05, master);
  const hum = ctx.createBiquadFilter();
  hum.type = "lowpass";
  hum.frequency.value = 420;
  noise(ctx, true).connect(hum).connect(city);
  const rain = gain(ctx, 0, master);
  const patter = ctx.createBiquadFilter();
  patter.type = "bandpass";
  patter.frequency.value = 2400;
  patter.Q.value = 0.4;
  noise(ctx, false).connect(patter).connect(rain);
  // Crickets: a high tone chopped into a steady trill.
  const crickets = gain(ctx, 0, master);
  const trill = gain(ctx, 0.5, crickets);
  const tone = ctx.createOscillator();
  tone.frequency.value = 4300;
  tone.connect(trill);
  tone.start();
  const chop = ctx.createOscillator();
  chop.type = "square";
  chop.frequency.value = 28;
  const depth = ctx.createGain();
  depth.gain.value = 0.5;
  chop.connect(depth);
  depth.connect(trill.gain);
  chop.start();
  return { master, city, rain, crickets, music: gain(ctx, 0.5, master), birds: gain(ctx, 1, master) };
}

/** A short bird phrase: a few quick falling or rising chirps. */
function chirp(ctx: AudioContext, out: AudioNode) {
  const base = 2600 + Math.random() * 1800, count = 2 + Math.floor(Math.random() * 4), rising = Math.random() < 0.5;
  let at = ctx.currentTime + 0.05;
  for (let i = 0; i < count; i++) {
    const osc = ctx.createOscillator(), env = ctx.createGain();
    osc.frequency.setValueAtTime(base * (rising ? 0.85 : 1.15), at);
    osc.frequency.exponentialRampToValueAtTime(base * (rising ? 1.2 : 0.8), at + 0.07);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.018 + Math.random() * 0.012, at + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
    osc.connect(env).connect(out);
    osc.start(at);
    osc.stop(at + 0.12);
    at += 0.11 + Math.random() * 0.08;
  }
}

// The score: slow, warm chords with a few plucked notes over them, in a pentatonic key so nothing clashes.
const CHORDS = [[174.61, 220, 261.63, 329.63], [146.83, 220, 261.63, 349.23], [130.81, 196, 246.94, 329.63], [164.81, 196, 246.94, 293.66]];
const NOTES = [392, 440, 523.25, 587.33, 659.25, 783.99];

function chord(ctx: AudioContext, out: AudioNode, notes: number[], seconds: number) {
  const now = ctx.currentTime;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(0.03, now + seconds * 0.35);
  env.gain.linearRampToValueAtTime(0, now + seconds * 1.25);
  filter.connect(env).connect(out);
  for (const frequency of notes) for (const detune of [-5, 5]) {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = frequency;
    osc.detune.value = detune;
    osc.connect(filter);
    osc.start(now);
    osc.stop(now + seconds * 1.3);
  }
}

function pluck(ctx: AudioContext, out: AudioNode) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator(), env = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = NOTES[Math.floor(Math.random() * NOTES.length)];
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(0.035, now + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
  osc.connect(env).connect(out);
  osc.start(now);
  osc.stop(now + 2.3);
}

function apply() {
  if (!context || !layers) return;
  const now = context.currentTime;
  const on = ambienceEnabled();
  const to = (node: GainNode, value: number, seconds = 2) => node.gain.setTargetAtTime(value, now, seconds / 3);
  to(layers.master, on ? (scene.talking ? 0.45 : 1) : 0, 0.8);
  to(layers.city, 0.05 - scene.night * 0.022);
  to(layers.rain, scene.rain * 0.07);
  to(layers.crickets, scene.night * (1 - scene.rain) * 0.012);
  to(layers.birds, (1 - scene.night) * (1 - scene.rain));
}

/** Must be called from a tap or key press, or the browser keeps the town silent. Safe to call again. */
export function startAmbience() {
  if (typeof window === "undefined") return;
  try {
    context ??= new AudioContext();
    void context.resume();
  } catch {
    return;
  }
  if (layers) return apply();
  const ctx = context;
  layers = build(ctx);
  let bar = 0;
  const loop = (fn: () => void, wait: () => number) => {
    const run = () => { if (ctx.state === "running" && ambienceEnabled() && !document.hidden) fn(); timers.push(window.setTimeout(run, wait())); };
    timers.push(window.setTimeout(run, wait()));
  };
  loop(() => chirp(ctx, layers!.birds), () => 2500 + Math.random() * 6000);
  loop(() => chord(ctx, layers!.music, CHORDS[bar++ % CHORDS.length], 10), () => 10000);
  loop(() => pluck(ctx, layers!.music), () => 2800 + Math.random() * 5200);
  apply();
}

export function setAmbienceEnabled(on: boolean) {
  try { window.localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* remembered for this visit only */ }
  if (on) startAmbience();
  apply();
}

/** What the town sounds like right now: how dark it is, how hard it rains, and whether people are talking. */
export function setAmbienceScene(next: Partial<typeof scene>) {
  scene = { ...scene, ...next };
  apply();
}

export function stopAmbience() {
  timers.forEach((timer) => window.clearTimeout(timer));
  timers = [];
  void context?.close();
  context = null;
  layers = null;
}
