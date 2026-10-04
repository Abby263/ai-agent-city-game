"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, ChevronUp, LoaderCircle, Mic, Send, Square, Volume2, VolumeX } from "lucide-react";
import { askNarrator } from "@/lib/api";
import { unlockAudio } from "@/lib/conversation-audio";
import { NARRATOR_HELP, localReply, narrationBeats, narratorRequest, whatsGoingOn, type NarratorAction, type NarratorTurn, type OnStage } from "@/lib/narrator";
import { kokoroState, loadKokoro, onKokoro } from "@/lib/narrator-kokoro";
import { activeCity } from "@/lib/cities";
import { NarratorAvatar } from "./NarratorAvatar";
import { VOICE_CHANGED, narratorVoiceOn, setNarratorVoice, speakNarration, stopNarration } from "@/lib/narrator-voice";
import { checkPlayerText } from "@/lib/safety";
import { describeNow } from "@/lib/session-simulation";
import { useGameStore } from "@/lib/store";
import { listenOnce, voiceInputSupported } from "@/lib/voice-input";

const noSubscription = () => () => {};

/**
 * The narrator's desk: tap the microphone and say what you want ("what's going on?", "play as Ren and talk to
 * Aoi"), or type it. It answers aloud and the game does it. It also tells you, unasked, what each scene is about.
 */
export function Narrator({ onActions }: {
  /** Carries the actions out, in order; returns anything that could not be done, to tell the player. */
  onActions: (actions: NarratorAction[]) => Promise<string>;
}) {
  const [turns, setTurns] = useState<NarratorTurn[]>([]);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voice, setVoice] = useState(true);
  /** The sentence being said right now, and where it falls among the others. */
  const [beat, setBeat] = useState<{ index: number; count: number; text: string } | null>(null);
  const canListen = useSyncExternalStore(noSubscription, voiceInputSupported, () => false);
  const stopListening = useRef<(() => void) | null>(null);
  const history = useRef<NarratorTurn[]>([]);
  const log = useRef<HTMLDivElement>(null);
  const narration = useGameStore((state) => state.narration);
  // The natural voice is a large download: fetched in the background once the town is up, on devices that can
  // run it. Until it is ready (and wherever it can't run) the narrator speaks with the device's voice.
  const natural = useSyncExternalStore(onKokoro, kokoroState, kokoroState);
  useEffect(() => {
    if (!voice) return;
    const timer = window.setTimeout(() => void loadKokoro(), 4000);
    return () => window.clearTimeout(timer);
  }, [voice]);

  useEffect(() => {
    const sync = () => setVoice(narratorVoiceOn());
    const timer = window.setTimeout(sync, 0);
    window.addEventListener(VOICE_CHANGED, sync);
    return () => { window.clearTimeout(timer); window.removeEventListener(VOICE_CHANGED, sync); };
  }, []);
  // Scenes and the clock wait while the narrator and the player are talking.
  useEffect(() => { useGameStore.getState().setNarratorBusy(listening || thinking || speaking); }, [listening, thinking, speaking]);
  useEffect(() => () => { stopListening.current?.(); stopNarration(); useGameStore.getState().setNarratorBusy(false); }, []);
  useEffect(() => { if (open && log.current) log.current.scrollTop = log.current.scrollHeight; }, [turns, open, interim]);

  const add = useCallback((turn: NarratorTurn) => {
    history.current = [...history.current, turn].slice(-12);
    setTurns(history.current);
  }, []);
  /** Tells it one short sentence at a time, each shown as it is said; resolves when the last has been said or read. */
  const say = useCallback(async (text: string) => {
    add({ role: "narrator", text });
    const beats = narrationBeats(text);
    setSpeaking(true);
    try {
      await speakNarration(beats, (index) => {
        setBeat({ index, count: beats.length, text: beats[index] });
        useGameStore.setState({ narratorBeat: beats[index] });
      });
    } finally {
      setSpeaking(false);
      setBeat(null);
      useGameStore.setState({ narratorBeat: "" });
    }
  }, [add]);

  // Lines the game asks the narrator to say: scene openings, how a scene went, verdicts.
  const said = useRef(0);
  useEffect(() => {
    // Anything already said before this desk appeared (it hides behind the welcome) is not said again.
    if (!narration || narration.id <= Math.max(said.current, useGameStore.getState().narrationDone)) return;
    said.current = narration.id;
    void say(narration.text).then(() => useGameStore.getState().finishNarration(narration.id));
  }, [narration, say]);

  const ask = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const store = useGameStore.getState();
    const city = store.city;
    if (!city) return;
    stopNarration();
    add({ role: "player", text });
    const safety = checkPlayerText(text);
    if (!safety.ok) return void say(safety.message);
    const scene = store.playbackQueue[0];
    const stage: OnStage = scene ? { conversation: scene, line: store.sceneLine } : null;
    let reply = localReply(text, city, stage);
    if (!reply) {
      setThinking(true);
      try {
        reply = await askNarrator(narratorRequest(text, city, stage, history.current.slice(0, -1), describeNow(city)));
      } catch {
        // The narrator model can't be reached: say what the game itself knows, and what can be said.
        reply = { say: whatsGoingOn(city, stage), actions: [] };
      } finally {
        setThinking(false);
      }
    }
    const trouble = reply.actions.length ? await onActions(reply.actions) : "";
    await say(trouble ? `${trouble}` : reply.say);
  }, [add, say, onActions]);

  const toggleMic = () => {
    unlockAudio();
    if (listening) { stopListening.current?.(); return; }
    stopNarration();
    setSpeaking(false);
    setInterim("");
    setListening(true);
    stopListening.current = listenOnce({
      onInterim: setInterim,
      onFinal: (text) => { setListening(false); setInterim(""); if (text) void ask(text); },
      onError: (message) => { setListening(false); setInterim(""); setOpen(true); add({ role: "narrator", text: message }); },
    });
  };
  // V is the push-to-talk key, anywhere outside a text box.
  const mic = useRef(toggleMic);
  useEffect(() => { mic.current = toggleMic; });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key.toLowerCase() !== "v" || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (voiceInputSupported()) mic.current();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const latest = [...turns].reverse().find((t) => t.role === "narrator");
  const telling = speaking && beat && !listening && !thinking ? beat : null;
  // When it has nothing to say it shrinks to its face and a microphone; what it last said stays a few seconds first.
  const [lingering, setLingering] = useState(false);
  useEffect(() => {
    if (speaking || thinking || listening) return;
    const show = window.setTimeout(() => setLingering(true), 0), hide = window.setTimeout(() => setLingering(false), 5000);
    return () => { window.clearTimeout(show); window.clearTimeout(hide); };
  }, [speaking, thinking, listening]);
  const caption = listening ? interim || "Listening…" : thinking ? "Thinking…" : telling?.text ?? latest?.text ?? "I'm your narrator. Tap the mic and ask me anything.";
  return (
    <section className="narrator" aria-label="Narrator" data-open={open} data-listening={listening} data-telling={Boolean(telling)}
      data-quiet={!open && !speaking && !listening && !thinking && !lingering}>
      <div className="narrator-bar">
        {natural.status === "ready" && voice && <NarratorAvatar city={activeCity().id} />}
        <button className="narrator-mic" aria-label={listening ? "Stop listening" : "Talk to the narrator"} aria-pressed={listening}
          title={canListen ? (listening ? "Stop listening (V)" : "Talk to the narrator (V)") : "This browser can't listen: type instead"}
          disabled={!canListen || thinking} onClick={toggleMic}>
          {thinking ? <LoaderCircle size={19} className="reply-spinner" /> : listening ? <Square size={16} /> : <Mic size={19} />}
        </button>
        {/* While it is telling, a tap moves it along; otherwise the caption opens the conversation. */}
        <button className="narrator-caption" aria-expanded={open} title={telling ? "Tap to skip what the narrator is saying" : "Show the conversation with the narrator"}
          onClick={() => (telling ? stopNarration() : setOpen(!open))}>
          <small>Narrator{speaking ? " · speaking" : listening ? " · listening" : natural.status === "loading" && voice ? ` · natural voice loading ${Math.round(natural.progress * 100)}%` : ""}
            {telling && telling.count > 1 && <i aria-hidden="true">{Array.from({ length: telling.count }, (_, i) => <b key={i} data-on={i <= telling.index} />)}</i>}</small>
          <span key={telling ? telling.index : "idle"} aria-live="polite">{caption}</span>
        </button>
        <button className="icon-button" aria-label={voice ? "Mute the narrator's voice" : "Turn on the narrator's voice"} aria-pressed={voice}
          title={voice ? "Mute the narrator's voice" : "Turn on the narrator's voice"} onClick={() => setNarratorVoice(!voice)}>
          {voice ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </button>
        <button className="icon-button" aria-label={open ? "Hide narrator conversation" : "Show narrator conversation"} onClick={() => setOpen(!open)}>
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>
      {open && (
        <>
          <div className="narrator-log" ref={log}>
            {turns.length === 0 && <p data-role="narrator">{NARRATOR_HELP}</p>}
            {turns.map((turn, i) => <p key={i} data-role={turn.role}>{turn.text}</p>)}
            {listening && interim && <p data-role="player" data-interim="true">{interim}</p>}
          </div>
          <form className="narrator-type" onSubmit={(event) => { event.preventDefault(); const text = typed; setTyped(""); void ask(text); }}>
            <input aria-label="Type to the narrator" value={typed} maxLength={400} onChange={(event) => setTyped(event.target.value)}
              placeholder={canListen ? "…or type it" : "Type what you want"} />
            <button className="icon-button" type="submit" aria-label="Send to the narrator" disabled={thinking || !typed.trim()}><Send size={15} /></button>
          </form>
        </>
      )}
    </section>
  );
}
