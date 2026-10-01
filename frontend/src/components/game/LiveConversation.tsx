"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, Focus, LoaderCircle, Pause, Play, SkipForward, Volume2, VolumeX } from "lucide-react";
import type { CitizenAgent } from "@/lib/types";
import { displayText, subtitleDuration, type ConversationFrame, type PlaybackConversation } from "@/lib/conversation-playback";
import { CitizenPortrait } from "./CitizenPortrait";
import { useGameStore } from "@/lib/store";
import { ConversationAudio, conversationAudioPreference, unlockAudio } from "@/lib/conversation-audio";
import { castVoices, deliveryStyle } from "@/lib/voices";

const subscribeToSupport = () => () => {};
const supportsVoices = () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

export function LiveConversation({ conversation, citizens, location, dateLabel, onFrame, onFinish, onFocus }: {
  conversation: PlaybackConversation;
  citizens: CitizenAgent[];
  location: string;
  dateLabel?: string;
  onFrame: (frame: ConversationFrame | null, onReady?: () => void) => void;
  onFinish: (id: string) => void;
  onFocus: () => void;
}) {
  const [lineIndex, setLineIndex] = useState(0);
  const [arrived, setArrived] = useState(false);
  const [paused, setPaused] = useState(false);
  const [introduced, setIntroduced] = useState(!conversation.encounter);
  const [audioEnabled, setAudioEnabled] = useState(conversationAudioPreference.enabled);
  const [volume, setVolume] = useState(conversationAudioPreference.volume);
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

  useEffect(() => {
    if (audioEnabled && !paused) speak();
    else audio.current?.stop();
  }, [audioEnabled, paused, speak]);
  useEffect(() => () => audio.current?.stop(), []);

  const toggleAudio = () => {
    const enabled = !audioEnabled;
    conversationAudioPreference.enabled = enabled;
    setAudioEnabled(enabled);
    setAudioStatus(enabled ? "Voices on" : "Voices off");
    if (enabled) { unlockAudio(); speak(); } // Speak within the tap gesture for mobile autoplay policies.
    else audio.current?.stop();
  };
  const togglePause = () => {
    audio.current?.stop();
    if (paused && audioEnabled) speak(true);
    setPaused((value) => !value);
  };

  useEffect(() => {
    onFrame({ id: conversation.conversation_id, actorIds: conversation.actor_ids,
      locationId: conversation.location_id, speakerId: arrived && introduced ? line?.speaker_id ?? null : null, paused,
      line: line?.text, lineKey: `${conversation.conversation_id}:${lineIndex}`,
      phase: !arrived ? "arrival" : introduced ? "dialogue" : "establishing" }, ready);
  }, [conversation, line?.speaker_id, line?.text, lineIndex, arrived, introduced, paused, onFrame, ready]);
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
    const timer = window.setTimeout(() => { if (!document.hidden) { if (introduced) next(); else setIntroduced(true); } }, subtitleDuration(introduced ? line.text : conversation.encounter?.reason ?? ""));
    return () => window.clearTimeout(timer);
  }, [arrived, paused, line, next, introduced, audioEnabled, conversation.encounter?.reason]);
  useEffect(() => {
    const hide = () => { if (document.hidden) { audio.current?.stop(); setPaused(true); } };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);

  return (
    <><div className="scene-setting"><span>{location}</span><small>{dateLabel ?? `Day ${conversation.game_day}`} · {String(Math.floor(conversation.game_minute / 60)).padStart(2, "0")}:{String(conversation.game_minute % 60).padStart(2, "0")}</small></div>
    <section className="live-dialogue" aria-label="Live conversation">
      <div className="live-dialogue-heading">
        <span className="live-scene-label"><i />{conversation.replay ? paused ? "Replay paused" : "Replay" : arrived ? paused ? "Conversation paused" : "In conversation" : "Meeting up"}</span>
        <span>{participants.map((c) => c.name.split(" ")[0]).join(" & ")}</span>
        <button aria-label="Focus on speakers" title="Focus on speakers" onClick={onFocus}><Focus size={18} /></button>
        <button aria-label="Skip conversation playback" title="Skip playback; keep conversation in history" onClick={() => { audio.current?.stop(); onFinish(conversation.conversation_id); }}><SkipForward size={18} /></button>
      </div>
      {arrived && !introduced ? <div className="encounter-introduction"><small>{conversation.encounter?.kind === "planned" ? "A promise kept" : "What's going on"}</small><p>{conversation.encounter?.reason}</p>
        <div className="live-dialogue-controls"><button aria-label={paused ? "Resume introduction" : "Pause introduction"} title="Pause or resume" onClick={togglePause}>{paused ? <Play size={18} /> : <Pause size={18} />}</button><button aria-label="Begin conversation" title="Begin conversation" onClick={() => setIntroduced(true)}><ArrowRight size={19} /></button></div></div> : arrived && line ? (
        <>
          <div className="live-subtitle" aria-live="polite" aria-atomic="true">
            {speaker && <CitizenPortrait citizen={speaker} size={48} />}
            <div><strong>{speaker?.name ?? "Resident"}</strong><p key={lineIndex}>{displayText(line.text)}</p></div>
          </div>
          <div className="live-dialogue-controls">
            <span>{lineIndex + 1} / {conversation.transcript.length}</span>
            <div className="dialogue-progress" aria-hidden="true">{conversation.transcript.map((_, i) => <i key={i} data-read={i <= lineIndex} />)}</div>
            <button aria-label={paused ? "Resume conversation" : "Pause conversation"} title={paused ? "Resume conversation" : "Pause conversation"} onClick={togglePause}>{paused ? <Play size={18} /> : <Pause size={18} />}</button>
            <button aria-label={lineIndex + 1 === conversation.transcript.length ? "Finish conversation" : "Next dialogue line"} title="Next line" onClick={next}><ArrowRight size={19} /></button>
          </div>
        </>
      ) : <div className="live-meeting"><LoaderCircle size={18} className="reply-spinner" />{participants.map((c) => c.name.split(" ")[0]).join(" and ")} are getting together.</div>}
      <div className="dialogue-audio" aria-label="Conversation audio">
        <button disabled={!voicesAvailable && engine === "device"} aria-label={audioEnabled ? "Mute voices" : "Enable voices"} aria-pressed={audioEnabled} title={!voicesAvailable ? "Voices unavailable in this browser" : audioEnabled ? "Mute voices" : "Enable voices"} onClick={toggleAudio}>{audioEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
        <span role="status">{!voicesAvailable ? "Voices unavailable in this browser" : audioEnabled && paused ? "Voices paused" : audioStatus}</span>
        {audioEnabled && <select aria-label="Voice type" title="Natural voices sound human (AI); device voices work offline" value={engine}
          onChange={(event) => { const value = event.target.value as "natural" | "device"; conversationAudioPreference.setEngine(value); setEngine(value); audio.current?.stop(); speak(true); }}>
          <option value="natural">Natural voices</option><option value="device">Device voices</option>
        </select>}
        {audioEnabled && <input aria-label="Voice volume" title="Voice volume" type="range" min="0" max="100" value={Math.round(volume * 100)} onChange={(event) => { const value = Number(event.target.value) / 100; conversationAudioPreference.volume = value; audio.current?.setVolume(value); setVolume(value); }} />}
      </div>
    </section></>
  );
}
