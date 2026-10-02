"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, ChevronDown, ChevronUp, Focus, LoaderCircle, Pause, Play, Share2, SkipForward, Volume2, VolumeX } from "lucide-react";
import type { CitizenAgent } from "@/lib/types";
import { displayText, subtitleDuration, type ConversationFrame, type PlaybackConversation } from "@/lib/conversation-playback";
import { CitizenPortrait } from "./CitizenPortrait";
import { useGameStore } from "@/lib/store";
import { ConversationAudio, conversationAudioPreference, soundAllowed, unlockAudio } from "@/lib/conversation-audio";
import { setAmbienceScene } from "@/lib/ambience";
import { stopNarration } from "@/lib/narrator-voice";
import { captureScene } from "@/lib/scene-capture";
import { shareCard } from "@/lib/share";
import { STORYLINES } from "@/lib/storyteller";
import { activeCity } from "@/lib/cities";
import { castVoices, deliveryStyle } from "@/lib/voices";

const subscribeToSupport = () => () => {};
const TRANSCRIPT_KEY = "agentcity.transcript";
const transcriptOpen = () => {
  try { return window.localStorage.getItem(TRANSCRIPT_KEY) === "open"; } catch { return false; }
};
const supportsVoices = () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

export function LiveConversation({ conversation, citizens, location, dateLabel, intro, onFrame, onFinish, onFocus, faraway }: {
  conversation: PlaybackConversation;
  citizens: CitizenAgent[];
  location: string;
  dateLabel?: string;
  /** What the narrator says as the scene opens: who, where and why it matters. */
  intro: string;
  onFrame: (frame: ConversationFrame | null, onReady?: () => void) => void;
  onFinish: (id: string) => void;
  onFocus: () => void;
  /** Street view: you're too far away to hear; walk there (or replay it later from Talk). */
  faraway?: { metres: number; onGo: () => void } | null;
}) {
  const [lineIndex, setLineIndex] = useState(0);
  const [arrived, setArrived] = useState(false);
  const [userPaused, setPaused] = useState(false);
  // The scene also waits while the player and the narrator are talking.
  const narratorBusy = useGameStore((state) => state.narratorBusy);
  const [introduced, setIntroduced] = useState(!conversation.encounter);
  const paused = userPaused || (narratorBusy && introduced);
  const [voicesWanted, setAudioEnabled] = useState(conversationAudioPreference.enabled);
  // Until the player has tapped something the browser won't speak: subtitles carry the scene on their own.
  const [allowed, setAllowed] = useState(soundAllowed);
  useEffect(() => {
    if (allowed) return;
    const allow = () => setAllowed(true);
    window.addEventListener("pointerdown", allow, { once: true });
    window.addEventListener("keydown", allow, { once: true });
    return () => { window.removeEventListener("pointerdown", allow); window.removeEventListener("keydown", allow); };
  }, [allowed]);
  const audioEnabled = voicesWanted && allowed;
  const [shared, setShared] = useState("");
  // The narrator and the voices carry the scene; the written lines stay folded to one line until asked for.
  const [transcript, setTranscript] = useState(transcriptOpen);
  const toggleTranscript = () => {
    try { window.localStorage.setItem(TRANSCRIPT_KEY, transcript ? "closed" : "open"); } catch { /* remembered for this visit only */ }
    setTranscript(!transcript);
  };
  const volume = conversationAudioPreference.volume;
  const [audioStatus, setAudioStatus] = useState(conversationAudioPreference.enabled ? "Voices on" : "Voices off");
  const [engine, setEngine] = useState(conversationAudioPreference.engine);
  const cast = useMemo(() => castVoices(citizens), [citizens]);
  const audio = useRef<ConversationAudio | null>(null);
  const voicesAvailable = useSyncExternalStore(subscribeToSupport, supportsVoices, () => false);
  const line = conversation.transcript[lineIndex];
  const speaker = citizens.find((c) => c.citizen_id === line?.speaker_id);
  const participants = conversation.actor_ids.map((id) => citizens.find((c) => c.citizen_id === id)).filter((c) => c !== undefined);
  const ready = useCallback(() => setArrived(true), []);
  const next = useCallback(() => {
    audio.current?.stop();
    if (lineIndex + 1 >= conversation.transcript.length) onFinish(conversation.conversation_id);
    else setLineIndex((i) => i + 1);
  }, [lineIndex, conversation, onFinish]);

  const speak = useCallback((resuming = false) => {
    if (!arrived || !introduced || !line || (paused && !resuming) || document.hidden) return;
    if (!audio.current) audio.current = new ConversationAudio(supportsVoices() ? window.speechSynthesis : null);
    const casting = cast.get(line.speaker_id);
    if (!casting) return;
    const speakerMood = citizens.find((c) => c.citizen_id === line.speaker_id)?.mood;
    audio.current.play({ key: `${conversation.conversation_id}:${lineIndex}`, text: line.text, citizenId: line.speaker_id, volume, casting,
      style: deliveryStyle(casting, line.text, speakerMood),
      onStart: () => {
        setAudioStatus("Speaking");
        // Fetch the next voice while this one plays, so replies follow without a pause.
        const upcoming = conversation.transcript[lineIndex + 1];
        const nextCasting = upcoming && cast.get(upcoming.speaker_id);
        if (nextCasting) audio.current?.prefetch({ text: upcoming.text, casting: nextCasting, style: deliveryStyle(nextCasting, upcoming.text, citizens.find((c) => c.citizen_id === upcoming.speaker_id)?.mood) });
      },
      onEnd: next,
      onError: () => {
        conversationAudioPreference.enabled = false;
        setAudioEnabled(false);
        setAudioStatus("Voice unavailable. Subtitles continue.");
      },
    });
  }, [arrived, introduced, line, paused, conversation.conversation_id, conversation.transcript, lineIndex, volume, next, cast, citizens]);

  const outOfEarshot = Boolean(faraway);
  useEffect(() => {
    if (audioEnabled && !paused && !outOfEarshot) speak();
    else audio.current?.stop();
  }, [audioEnabled, paused, speak, outOfEarshot]);
  useEffect(() => () => audio.current?.stop(), []);
  // The town's own sound steps back while people talk.
  useEffect(() => { setAmbienceScene({ talking: true }); return () => setAmbienceScene({ talking: false }); }, []);
  const share = () => {
    const name = (id: string) => citizens.find((c) => c.citizen_id === id)?.name.split(" ")[0] ?? "Resident";
    const title = STORYLINES.find((s) => s.id === conversation.encounter?.story?.id)?.title ?? `${participants.map((c) => c.name.split(" ")[0]).join(" and ")} at ${location}`;
    const from = Math.max(0, lineIndex - 1);
    void shareCard({ kicker: `Overheard in ${activeCity().name}`, title, backdrop: captureScene(),
      lines: conversation.transcript.slice(from, lineIndex + 1).map((l) => ({ name: name(l.speaker_id), text: displayText(l.text) })) })
      .then((how) => setShared(how === "saved" ? "Picture saved" : how === "failed" ? "Couldn't make the picture" : ""));
  };

  const toggleAudio = () => {
    const enabled = !audioEnabled;
    conversationAudioPreference.remember(enabled);
    setAudioEnabled(enabled);
    setAudioStatus(enabled ? "Voices on" : "Voices off");
    if (enabled) { unlockAudio(); speak(); } // Speak within the tap gesture for mobile autoplay policies.
    else audio.current?.stop();
  };
  const togglePause = () => {
    audio.current?.stop();
    if (userPaused && audioEnabled) speak(true);
    setPaused((value) => !value);
  };

  useEffect(() => {
    onFrame({ id: conversation.conversation_id, actorIds: conversation.actor_ids,
      locationId: conversation.location_id, speakerId: arrived && introduced ? line?.speaker_id ?? null : null, paused,
      line: line?.text, lineKey: `${conversation.conversation_id}:${lineIndex}`,
      phase: !arrived ? "arrival" : introduced ? "dialogue" : "establishing" }, ready);
    useGameStore.setState({ sceneLine: introduced ? lineIndex : -1 });
  }, [conversation, line?.speaker_id, line?.text, lineIndex, arrived, introduced, paused, onFrame, ready]);
  // The narrator sets the scene; the dialogue starts when it has finished (or the player moves on).
  const introId = useRef(0);
  const narrationDone = useGameStore((state) => state.narrationDone);
  useEffect(() => {
    if (!arrived || introduced || introId.current || document.hidden) return;
    introId.current = useGameStore.getState().narrate(intro);
  }, [arrived, introduced, intro]);
  useEffect(() => {
    if (!introduced && introId.current && narrationDone >= introId.current) {
      const timer = window.setTimeout(() => setIntroduced(true), 350);
      return () => window.clearTimeout(timer);
    }
  }, [narrationDone, introduced]);
  useEffect(() => () => onFrame(null), [onFrame]);
  // If the walk-over can't finish (a blocked path, a slow device), the scene starts anyway rather than hanging.
  useEffect(() => {
    if (arrived) return;
    const timer = window.setTimeout(() => { if (!document.hidden) ready(); }, 8000);
    return () => window.clearTimeout(timer);
  }, [arrived, ready]);
  useEffect(() => useGameStore.subscribe((state, previous) => {
    if (state.city?.clock.running !== previous.city?.clock.running) setPaused(!state.city?.clock.running);
  }), []);
  useEffect(() => {
    if (!arrived || paused || !line || (introduced && audioEnabled)) return;
    // Reading time never advances in a background tab, even if a timer fires late.
    // The introduction has a long stop of its own, in case the narrator never reports back.
    const timer = window.setTimeout(() => { if (!document.hidden) { if (introduced) next(); else setIntroduced(true); } }, introduced ? subtitleDuration(line.text) : subtitleDuration(intro) + 9000);
    return () => window.clearTimeout(timer);
  }, [arrived, paused, line, next, introduced, audioEnabled, intro]);
  useEffect(() => {
    const hide = () => { if (document.hidden) { audio.current?.stop(); setPaused(true); } };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);

  const names = participants.map((c) => c.name.split(" ")[0]);
  const label = conversation.replay ? paused ? "Replay paused" : "Replay" : arrived ? paused ? "Paused" : "In conversation" : "Meeting up";
  const last = lineIndex + 1 === conversation.transcript.length;
  return (
    <><div className="scene-setting"><span>{location}</span><small>{dateLabel ?? `Day ${conversation.game_day}`} · {String(Math.floor(conversation.game_minute / 60)).padStart(2, "0")}:{String(conversation.game_minute % 60).padStart(2, "0")}</small></div>
    <section className="live-dialogue" aria-label="Live conversation" data-compact={!transcript}>
      <div className="live-dialogue-heading">
        <span className="live-scene-label"><i />{label}</span>
        <span>{names.join(" & ")}</span>
        {shared && <span className="live-shared" role="status">{shared}</span>}
        {audioEnabled && <select aria-label="Voice type" title="Natural voices sound human (AI); device voices work offline" value={engine}
          onChange={(event) => { const value = event.target.value as "natural" | "device"; conversationAudioPreference.setEngine(value); setEngine(value); audio.current?.stop(); speak(true); }}>
          <option value="device">Device voices</option><option value="natural">Natural voices</option>
        </select>}
        <button disabled={!voicesAvailable && engine === "device"} aria-label={voicesWanted ? "Mute voices" : "Enable voices"} aria-pressed={voicesWanted}
          title={!voicesAvailable ? "Voices unavailable in this browser" : voicesWanted ? "Mute voices" : "Enable voices"} onClick={toggleAudio}>{voicesWanted ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
        <button aria-label={transcript ? "Fold the transcript" : "Show the full transcript"} aria-expanded={transcript} title={transcript ? "Fold the transcript to one line" : "Show the full transcript"} onClick={toggleTranscript}>{transcript ? <ChevronDown size={17} /> : <ChevronUp size={17} />}</button>
        {arrived && introduced && <button aria-label="Share this scene" title="Share this scene as a picture" onClick={share}><Share2 size={16} /></button>}
        <button aria-label="Focus on speakers" title="Focus on speakers" onClick={onFocus}><Focus size={17} /></button>
        <button aria-label="Skip conversation playback" title="Skip playback; keep conversation in history" onClick={() => { audio.current?.stop(); onFinish(conversation.conversation_id); }}><SkipForward size={17} /></button>
      </div>
      {arrived && !introduced ? <div className="encounter-introduction"><div><small>{conversation.encounter?.kind === "planned" ? "A promise kept" : "What's going on"}</small><p>{intro}</p></div>
        <div className="live-dialogue-controls"><button aria-label={paused ? "Resume introduction" : "Pause introduction"} title="Pause or resume" onClick={togglePause}>{paused ? <Play size={17} /> : <Pause size={17} />}</button><button aria-label="Begin conversation" title="Begin conversation" onClick={() => { stopNarration(); setIntroduced(true); }}><ArrowRight size={18} /></button></div></div> : arrived && line ? (
        <div className="live-line">
          <div className="live-subtitle" aria-live="polite" aria-atomic="true">
            {speaker && <CitizenPortrait citizen={speaker} size={40} />}
            {faraway ? (
              <div className="overhear-far"><strong>{speaker?.name ?? "Resident"}</strong>
                <p>Too far to hear. {names.join(" and ")} are talking about {faraway.metres} m away.</p>
                <button className="outline-action" onClick={faraway.onGo}>Go there</button></div>
            ) : <div><strong>{speaker?.name ?? "Resident"}</strong><p key={lineIndex}>{displayText(line.text)}</p></div>}
          </div>
          <div className="live-dialogue-controls">
            <div className="dialogue-progress" aria-label={`Line ${lineIndex + 1} of ${conversation.transcript.length}`}>{conversation.transcript.map((_, i) => <i key={i} data-read={i <= lineIndex} />)}</div>
            <button aria-label={paused ? "Resume conversation" : "Pause conversation"} title={paused ? "Resume conversation" : "Pause conversation"} onClick={togglePause}>{paused ? <Play size={17} /> : <Pause size={17} />}</button>
            <button aria-label={last ? "Finish conversation" : "Next dialogue line"} title="Next line" onClick={next}><ArrowRight size={18} /></button>
          </div>
        </div>
      ) : <div className="live-meeting"><LoaderCircle size={18} className="reply-spinner" />{names.join(" and ")} are getting together.</div>}
      <span className="visually-hidden" role="status">{!voicesAvailable ? "Voices unavailable in this browser" : audioEnabled && paused ? "Voices paused" : audioStatus}</span>
    </section></>
  );
}
