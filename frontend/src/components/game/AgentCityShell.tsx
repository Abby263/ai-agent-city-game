"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Compass,
  Download,
  Footprints,
  Heart,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Hand,
  ScrollText,
  Wand2,
  Newspaper,
  Pause,
  Play,
  Send,
  Sparkles,
  Sun,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { GameCanvas } from "./GameCanvas";
import { CitizenPortrait } from "./CitizenPortrait";
import { SocialPanel } from "./SocialPanel";
import { BondNetwork } from "./BondNetwork";
import { ConversationImpact } from "./ConversationImpact";
import { CitizenNature } from "./CitizenNature";
import { AutonomyStatus, type PendingExchange } from "./AutonomyStatus";
import { BadgesPanel } from "./BadgesPanel";
import { LifeDetails } from "./LifeDetails";
import { NewsPanel } from "./NewsPanel";
import { WelcomeGuide, WELCOME_KEY } from "./WelcomeGuide";
import { WorldClock } from "./WorldClock";
import { GodPanel } from "./GodPanel";
import { StoryTracker } from "./StoryTracker";
import { liveElection, playerTurn } from "@/lib/elections";
import { ActionPanel } from "./ActionPanel";
import { PersonBar } from "./PersonBar";
import { CharacterPromptPanel } from "./CharacterPromptPanel";
import { NextMoveCard } from "./NextChoices";
import { intendedTarget, nextMoves, type NextMove } from "@/lib/next-moves";
import { activeStories } from "@/lib/stories";
import { minutesBehindRealTime } from "@/lib/session-simulation";
import { calendarDay, calendarStartFor } from "@/lib/calendar";
import { dayWeather } from "@/lib/weather";
import { ConversationAudio, conversationAudioPreference, unlockAudio } from "@/lib/conversation-audio";
import { displayText, subtitleDuration } from "@/lib/conversation-playback";
import { castVoices, deliveryStyle } from "@/lib/voices";
import { parsePlan } from "@/lib/plans";
import { api } from "@/lib/api";
import { exportSession, sessionMemoryEnabled, sessionRelationships } from "@/lib/session-simulation";
import { readUnlocked, unlockNew, type Achievement, type Unlocked } from "@/lib/achievements";
import { isWeekend, weekday } from "@/lib/routine";
import { checkPlayerText } from "@/lib/safety";
import { useGameStore } from "@/lib/store";
import type {
  CitizenAgent,
  CityState,
  Conversation,
  Relationship,
} from "@/lib/types";

type Panel = "citizens" | "journal" | "city" | "social" | "news" | "create" | "badges" | null;
type Page = "act" | "prompt" | "life" | "memories" | "bonds";
type OutgoingSpeech = {
  id: string;
  actor: CitizenAgent;
  target: CitizenAgent;
  text: string;
  status: "pending" | "failed";
  error?: string;
};
const time = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const shortName = (citizen?: CitizenAgent) =>
  citizen?.name.split(" ")[0] ?? "Citizen";
function chapterLine(day: number, minute: number) {
  if (isWeekend(day)) return minute < 720 ? "The weekend. Everyone follows their own hobbies." : "A lazy weekend afternoon. Who will meet whom?";
  if (minute < 450) return "Morning at home. Work ahead. Plans still unwritten.";
  if (minute < 900) return "The working day. Friendships are tested over coffee breaks.";
  if (minute < 1080) return "Late afternoon. Errands, gyms and chance meetings.";
  return "Evening settles over Nakameguro. Windows glow one by one.";
}

function usePhoneViewport() {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      // Follow browser chrome and the keyboard, but do not undo accessibility zoom.
      if (!root.current || viewport.scale !== 1) return;
      root.current.style.setProperty("--game-height", `${viewport.height}px`);
      root.current.style.setProperty("--game-offset", `${viewport.offsetTop}px`);
      root.current.dataset.keyboard = String(window.innerHeight - viewport.height > 140);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return root;
}

export function AgentCityShell() {
  const viewport = usePhoneViewport();
  const {
    city,
    selectedCitizenId,
    memories,
    cityConversations,
    playbackQueue,
    error,
    loadInitialState,
    setCity,
    selectCitizen,
    refreshCityConversations,
  } = useGameStore();
  const [panel, setPanel] = useState<Panel>(null);
  const [page, setPage] = useState<Page>("life");
  const [busy, setBusy] = useState(false);
  const [pendingExchange, setPendingExchange] = useState<PendingExchange | null>(null);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState("");
  const [outgoing, setOutgoing] = useState<OutgoingSpeech | null>(null);
  const speechInput = useRef<HTMLTextAreaElement>(null);
  const [taskDraft, setTaskDraft] = useState("");
  const [recipient, setRecipient] = useState("");
  // Tapping someone opens a small bar of things to do with them, not a full panel.
  const [personId, setPersonId] = useState<string | null>(null);
  const [actTarget, setActTarget] = useState<string | undefined>();
  const lastScene = useGameStore((state) => state.lastScene);
  const [filter, setFilter] = useState("all");
  const [focusedConversation, setFocusedConversation] = useState<string | null>(null);
  const [cityBonds, setCityBonds] = useState<Relationship[]>([]);
  const [speed, setSpeed] = useState(1);
  const [unlocked, setUnlocked] = useState<Unlocked>({});
  const [celebration, setCelebration] = useState<Achievement[]>([]);
  const [welcome, setWelcome] = useState(false);
  const [alertSeen, setAlertSeen] = useState("");
  const [voiceOn, setVoiceOn] = useState(conversationAudioPreference.enabled);
  const setInlineTalk = useGameStore((state) => state.setInlineTalk);
  const inlineTalk = useGameStore((state) => state.inlineTalk);
  const inlineAudio = useRef<ConversationAudio | null>(null);
  const inlineRun = useRef(0);
  const seenChats = useRef<Set<string> | null>(null);
  const latestCity = useRef(city);
  useEffect(() => { latestCity.current = city; }, [city]);

  /** Voices the player's chat where they stand: lines, lips and gestures, no cutscene. */
  const playInline = useCallback((conversation: Pick<Conversation, "conversation_id" | "actor_ids" | "transcript">, start = 0, waitAfter = false) => {
    const run = ++inlineRun.current;
    inlineAudio.current?.stop();
    const people = latestCity.current?.citizens ?? [];
    const cast = castVoices(people);
    const lines = conversation.transcript;
    let index = start;
    const step = () => {
      if (run !== inlineRun.current) return;
      if (index >= lines.length) {
        setInlineTalk(waitAfter ? { actorIds: conversation.actor_ids, speakerId: null, line: "", key: `${conversation.conversation_id}:wait` } : null);
        return;
      }
      const line = lines[index];
      const key = `${conversation.conversation_id}:${index}`;
      setInlineTalk({ actorIds: conversation.actor_ids, speakerId: line.speaker_id, line: line.text, key });
      const advance = () => { if (run === inlineRun.current) { index++; step(); } };
      const casting = cast.get(line.speaker_id);
      if (conversationAudioPreference.enabled && casting) {
        inlineAudio.current ??= new ConversationAudio(typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null);
        inlineAudio.current.play({ key, text: line.text, citizenId: line.speaker_id, volume: conversationAudioPreference.volume, casting,
          style: deliveryStyle(casting, line.text, people.find((c) => c.citizen_id === line.speaker_id)?.mood),
          onEnd: advance, onError: () => window.setTimeout(advance, subtitleDuration(line.text) * 0.5) });
      } else window.setTimeout(advance, Math.min(6000, subtitleDuration(line.text) * 0.6));
    };
    step();
  }, [setInlineTalk]);

  // New player chats (typed words or the player's own actions) are voiced inline.
  useEffect(() => {
    if (!city) return;
    if (!seenChats.current) { seenChats.current = new Set(cityConversations.map((c) => c.conversation_id)); return; }
    const fresh = cityConversations.filter((c) => c.player_chat && !seenChats.current!.has(c.conversation_id));
    cityConversations.forEach((c) => seenChats.current!.add(c.conversation_id));
    const newest = fresh[0];
    // After the reply they stay facing each other, ready for your next line.
    if (newest) playInline(newest, newest.transcript[0]?.speaker_id === newest.actor_ids[0] ? 1 : 0, true);
  }, [city, cityConversations, playInline]);
  const flight = useRef(false);
  const player = city?.citizens.find(
    (c) => c.citizen_id === city.policy.player_citizen_id,
  );
  const selected =
    city?.citizens.find((c) => c.citizen_id === selectedCitizenId) ??
    city?.citizens[0];
  const nearby =
    city?.citizens.filter(
      (c) =>
        c.citizen_id !== player?.citizen_id &&
        c.current_location_id === player?.current_location_id,
    ) ?? [];
  const targetId = nearby.some((c) => c.citizen_id === recipient)
    ? recipient
    : (nearby[0]?.citizen_id ?? "");
  // While you chat as someone, other scenes wait in the queue instead of closing your chat.
  const playbackHeld = useGameStore((state) => state.playbackHeld);
  const chattingAsResident = panel === "journal" && Boolean(player);
  useEffect(() => { useGameStore.getState().setPlaybackHeld(chattingAsResident); }, [chattingAsResident]);
  const scenePlaying = playbackQueue.length > 0 && !(playbackHeld && !playbackQueue[0]?.replay);
  const personCitizen = personId ? city?.citizens.find((c) => c.citizen_id === personId) : undefined;
  // After a scene that isn't already part of a story (stories offer their own choices), ask what happens next.
  const sceneInStory = !!lastScene && !!city && activeStories(city).some((s) => s.beats.some((b) => b.conversation_id === lastScene.conversationId));
  const showScene = Boolean(lastScene && city && !sceneInStory);
  const sceneChoices = showScene ? nextMoves(city!, cityConversations.find((c) => c.conversation_id === lastScene!.conversationId)) : [];
  const scenePeople = (lastScene?.actorIds ?? []).map((id) => city?.citizens.find((c) => c.citizen_id === id)).filter((c) => c !== undefined);
  const sceneNames = (lastScene?.actorIds ?? []).map((id) => shortName(city?.citizens.find((c) => c.citizen_id === id))).join(" and ");
  const activeTask = selected?.personality.player_task as
    { task: string; status: string; plan_summary?: string } | undefined;

  useEffect(() => {
    void loadInitialState();
  }, [loadInitialState]);
  useEffect(() => {
    // Browser-only storage is read after mount so the server render stays deterministic.
    let first = true;
    try { first = !localStorage.getItem(WELCOME_KEY); } catch { /* storage blocked: show the guide */ }
    const timer = window.setTimeout(() => { setUnlocked(readUnlocked()); setWelcome(first); }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!city) return;
    const relationships = sessionMemoryEnabled() ? sessionRelationships() : cityBonds;
    const { fresh, unlocked: next } = unlockNew({ city, conversations: cityConversations, relationships });
    if (!fresh.length) return;
    // Unlocks are already saved, so this update must not be cancelled by a quick re-render.
    window.setTimeout(() => {
      setUnlocked(next);
      setCelebration((current) => [...current, ...fresh]);
    }, 0);
  }, [city, cityConversations, cityBonds]);
  useEffect(() => {
    if (!celebration.length) return;
    const timer = window.setTimeout(() => setCelebration([]), 5200);
    return () => window.clearTimeout(timer);
  }, [celebration]);
  // Leaving the chat (closing Talk, switching person, returning control) ends the conversation stance.
  useEffect(() => {
    const talk = useGameStore.getState().inlineTalk;
    if (!talk) return;
    const chatting = panel === "journal" && player && talk.actorIds.includes(player.citizen_id) && talk.actorIds.includes(targetId);
    if (!chatting) { inlineRun.current++; inlineAudio.current?.stop(); setInlineTalk(null); }
  }, [panel, player, targetId, setInlineTalk]);
  const closeWelcome = useCallback(() => {
    setWelcome(false);
    try { localStorage.setItem(WELCOME_KEY, "1"); } catch { /* the guide can show again next visit */ }
  }, []);
  useEffect(() => useGameStore.subscribe((state, previous) => {
    const held = state.playbackHeld && !state.playbackQueue[0]?.replay;
    const started = state.playbackQueue[0] && (state.playbackQueue[0].conversation_id !== previous.playbackQueue[0]?.conversation_id || previous.playbackHeld !== state.playbackHeld);
    if (started && !held) setPanel(null);
  }), []);
  useEffect(() => {
    if (!city) return;
    void refreshCityConversations();
    const id = selectedCitizenId ?? city.citizens[0]?.citizen_id;
    if (id) void selectCitizen(id);
  }, [city, selectedCitizenId, selectCitizen, refreshCityConversations]);
  useEffect(() => {
    if (!city || (panel !== "social" && !(panel === "citizens" && page === "bonds"))) return;
    let cancelled = false;
    Promise.all(city.citizens.map((c) => api.getRelationships(c.citizen_id)))
      .then((rows) => { if (!cancelled) setCityBonds(rows.flat()); })
      .catch(() => { if (!cancelled) setMessage("Relationships could not be loaded."); });
    return () => { cancelled = true; };
  }, [city, panel, page]);

  const act = useCallback(
    async (action: () => Promise<CityState>) => {
      if (flight.current) return false;
      flight.current = true;
      setBusy(true);
      setMessage("");
      try {
        setCity(await action());
        return true;
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "This action could not finish.",
        );
        return false;
      } finally {
        flight.current = false;
        setBusy(false);
      }
    },
    [setCity],
  );
  // Elections created from Create play out step by step, pausing while a campaign conversation is on screen.
  useEffect(() => {
    const election = city ? liveElection(city) : undefined;
    if (!election?.auto || busy || playbackQueue.length || election.error || playerTurn(city!)?.waiting) return;
    const timer = window.setTimeout(() => void act(api.advanceElection), 2500);
    return () => window.clearTimeout(timer);
  }, [city, busy, playbackQueue.length, act]);

  const live = city?.policy.time_mode === "live";
  const lastBeat = useRef(0);
  const onCognitionStart = useCallback((request: import("@/lib/types").SessionCognitionRequest) => {
    if (request.conversation_mode !== "autonomous" || !request.target_id) return;
    const people = [request.actor_id, request.target_id].map((id) => request.city.citizens.find((c) => c.citizen_id === id)?.name.split(" ")[0] ?? "Resident");
    setPendingExchange({ names: people.join(" and "), startedAt: Date.now() });
  }, []);
  const tickOnce = useCallback(async () => {
    try {
      return await api.tick(onCognitionStart);
    } finally {
      setPendingExchange(null);
    }
  }, [onCognitionStart]);
  // Live mode: the clock follows real Tokyo time; conversations happen between ticks when Auto is on.
  useEffect(() => {
    if (!live) return;
    const check = () => {
      const current = useGameStore.getState().city;
      // While you chat as a resident the town waits for you, so your words are never stuck behind its AI calls.
      if (!current || document.hidden || useGameStore.getState().playbackQueue.length || useGameStore.getState().playbackHeld || flight.current) return;
      const behind = minutesBehindRealTime(current);
      if (behind >= 60) void act(api.syncToRealTime);
      else if (behind >= 15 || current.policy.player_destination) void act(tickOnce);
      else if (current.simulation_mode === "autonomous" && current.clock.running && Date.now() - lastBeat.current > 40000) {
        lastBeat.current = Date.now();
        void act(async () => {
          try { return await api.socialBeat(onCognitionStart); } finally { setPendingExchange(null); }
        });
      }
    };
    const first = window.setTimeout(check, 800);
    const timer = window.setInterval(check, 3000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [live, act, tickOnce, onCognitionStart]);
  useEffect(() => {
    if (live || !city?.clock.running) return;
    const advance = () => {
      if (document.hidden || useGameStore.getState().playbackQueue.length || useGameStore.getState().playbackHeld) return;
      void act(tickOnce);
    };
    const firstTick = window.setTimeout(advance, 1000);
    const timer = window.setInterval(
      advance,
      city.policy.player_destination ? 850 : 8000 / speed,
    );
    return () => { window.clearTimeout(firstTick); window.clearInterval(timer); };
  }, [live, city?.clock.running, city?.policy.player_destination, speed, act, tickOnce]);

  // A paused or hidden game must not keep scheduling model calls.
  useEffect(() => {
    const hide = () => {
      if (document.hidden) void api.pause().then(setCity);
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [setCity]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setPanel(null); closeWelcome(); }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [closeWelcome]);

  const choose = useCallback(
    (id: string) => {
      void selectCitizen(id);
      setPage("life");
      setPanel("citizens");
    },
    [selectCitizen],
  );

  /** A tap on someone in town or in the strip: quick actions, unless you're browsing profiles. */
  const tap = useCallback((id: string) => {
    if (panel === "citizens") { choose(id); return; }
    void selectCitizen(id);
    setPersonId(id);
    setPanel(null);
  }, [panel, choose, selectCitizen]);
  /** Opens the chat with someone, walking the character you play over first if needed. */
  const openChat = useCallback((id: string) => {
    setPersonId(null);
    // Starting a chat brings the two of you into view once, if you can't already see them.
    const you = latestCity.current?.policy.player_citizen_id as string | undefined;
    if (you) useGameStore.getState().focusOn([id, you], true);
    setRecipient(id);
    setFilter("all");
    setPanel("journal");
    window.setTimeout(() => speechInput.current?.focus(), 60);
  }, []);
  const talkTo = useCallback((id: string) => {
    const current = latestCity.current;
    const you = current?.citizens.find((c) => c.citizen_id === current.policy.player_citizen_id);
    const them = current?.citizens.find((c) => c.citizen_id === id);
    if (you && them && you.current_location_id === them.current_location_id) openChat(id);
    // The person you're going to comes first, so the camera frames where you'll arrive.
    else void act(() => api.approach(id)).then((ok) => { if (ok) { openChat(id); if (you) useGameStore.getState().focusOn([id, you.citizen_id]); } });
  }, [act, openChat]);
  /** Anyone does anything, in the player's own words; no actor means it simply happens. */
  const runAct = useCallback((actorId: string | null, targetId: string | null, text: string, storyId?: string) => {
    useGameStore.getState().clearLastScene();
    setPersonId(null);
    const yours = actorId !== null && actorId === latestCity.current?.policy.player_citizen_id;
    void act(async () => {
      const { city: next, headline, talked, error } = await api.act(actorId, targetId, text, storyId ? { storyId } : {});
      setMessage(error ? `${headline} (${error})` : talked && !yours ? `${headline} Watch what happens.` : headline);
      return next;
    }).then((ok) => { if (ok && yours && targetId) openChat(targetId); });
  }, [act, openChat]);
  /** What you write in "what happens next": aimed at whoever it names, else the other person in the scene. */
  const writeAct = useCallback((actorId: string | null, text: string, people: string[], storyId?: string) => {
    const current = latestCity.current;
    const actor = actorId ? current?.citizens.find((c) => c.citizen_id === actorId) : undefined;
    const other = people.find((id) => id !== actorId) ?? null;
    runAct(actorId, actor && current ? intendedTarget(current, actor, text, other) : null, text, storyId);
  }, [runAct]);
  const pickChoice = useCallback((move: NextMove, storyId?: string) => runAct(move.actor_id, move.target_id, move.text, storyId), [runAct]);
  const openActions = useCallback((id: string) => {
    const you = latestCity.current?.policy.player_citizen_id as string | undefined;
    void selectCitizen(you ?? id);
    setActTarget(you ? id : undefined);
    setPage("act");
    setPanel("citizens");
    setPersonId(null);
  }, [selectCitizen]);
  // An unanswered "what next?" fades after a while so the town keeps moving.
  useEffect(() => {
    if (!lastScene) return;
    const timer = window.setTimeout(() => useGameStore.getState().clearLastScene(), 45000);
    return () => window.clearTimeout(timer);
  }, [lastScene]);

  async function pause() {
    // Pause can invalidate a pending AI response immediately.
    setCity(await api.pause());
  }
  /** Like a line you say, a trip waits for a town moment in progress instead of being dropped. */
  async function goTo(locationId: string) {
    for (let waited = 0; flight.current && waited < 60; waited++) await new Promise((resolve) => window.setTimeout(resolve, 500));
    if (flight.current) { setMessage("The town is still busy. Try again in a moment."); return; }
    await act(() => api.walkTo(locationId));
  }
  async function speak(event: FormEvent) {
    event.preventDefault();
    const target = nearby.find((citizen) => citizen.citizen_id === targetId);
    if (!player || !target || !draft.trim()) return;
    // A town moment already in progress finishes first; your line is sent right after, never dropped.
    for (let waited = 0; flight.current && waited < 60; waited++) await new Promise((resolve) => window.setTimeout(resolve, 500));
    if (flight.current) { setMessage("The town is still busy. Try sending again in a moment."); return; }
    const text = draft.trim();
    if (/sleep/i.test(target.current_activity)) {
      setMessage(`${shortName(target)} is asleep 😴. Try again when they're up, or talk to someone who's awake.`);
      return;
    }
    const safety = checkPlayerText(text);
    if (!safety.ok) {
      setMessage(safety.message);
      return;
    }
    const submission: OutgoingSpeech = {
      id: crypto.randomUUID(),
      actor: player,
      target,
      text,
      status: "pending",
    };
    const existingIds = new Set(
      cityConversations.map((c) => c.conversation_id),
    );
    playInline({ conversation_id: submission.id, actor_ids: [player.citizen_id, target.citizen_id], transcript: [{ speaker_id: player.citizen_id, text }] }, 0, true);
    // Starting a chat brings the two of you into view once, only if you can't already see them.
    useGameStore.getState().focusOn([player.citizen_id, target.citizen_id], true);
    await act(async () => {
      // Only clear an accepted submission, never a draft entered during the request.
      setDraft("");
      setFilter("all");
      setOutgoing(submission);
      speechInput.current?.focus();
      try {
        const next = await api.speak(target.citizen_id, text);
        await refreshCityConversations();
        const confirmed = useGameStore
          .getState()
          .cityConversations.some(
            (c) =>
              !existingIds.has(c.conversation_id) &&
              c.actor_ids.includes(player.citizen_id) &&
              c.actor_ids.includes(target.citizen_id) &&
              c.transcript.some(
                (line) =>
                  line.speaker_id === player.citizen_id && line.text === text,
              ),
          );
        if (!confirmed)
          throw new Error("This exchange was interrupted. No reply was saved.");
        setOutgoing(null);
        return next;
      } catch (error) {
        setOutgoing({
          ...submission,
          status: "failed",
          error: error instanceof Error ? error.message : "No reply arrived.",
        });
        throw error;
      }
    });
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(exportSession(), null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `navora-day-${city?.clock.day ?? 1}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("World snapshot downloaded.");
  }

  return (
    <main className="city-game" ref={viewport}>
      <header className="game-header">
        <div className="game-brand">
          <span className="brand-mark">
            <Compass size={24} />
          </span>
          <h1>
            AgentCity<span>STORIES OF NAKAMEGURO</span>
          </h1>
        </div>
        <WorldClock city={city} />
        <div className="header-actions">
          <div className="mode-switch" aria-label="World mode">
            <button
              aria-pressed={city?.simulation_mode === "manual"}
              disabled={busy}
              onClick={() => void act(() => api.setMode("manual"))}
            >
              Manual
            </button>
            <button
              aria-pressed={city?.simulation_mode === "autonomous"}
              disabled={busy}
              onClick={() => {
                setPanel(null);
                setFilter("all");
                setFocusedConversation(null);
                void act(() => api.setMode("autonomous"));
              }}
            >
              <Sparkles size={13} />
              Auto
            </button>
          </div>
          <button
            className="icon-button"
            aria-label={city?.clock.running ? "Pause" : "Play"}
            title={city?.clock.running ? (live ? "Pause conversations" : "Pause the city") : "Play: the city comes to life"}
            onClick={() => {
              if (city?.clock.running) return void pause();
              // Play always does something: with no tasks waiting, it switches to Auto life.
              const tasks = city?.citizens.some((c) => (c.personality.player_task as { status?: string } | undefined)?.status === "active");
              void act(() => (city?.simulation_mode === "manual" && !tasks ? api.setMode("autonomous") : api.start()));
            }}
          >
            <span>
              {city?.clock.running ? <Pause size={18} /> : <Play size={18} />}
            </span>
          </button>
          <select
            className="speed-select"
            aria-label="Time"
            title="Live follows real Tokyo time; fast-forward speeds life up"
            value={live ? "live" : String(speed)}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "live") return void act(() => api.setTimeMode("live"));
              setSpeed(Number(value));
              if (live) void act(() => api.setTimeMode("fast"));
            }}
          >
            <option value="live">🔴 Live</option>
            <option value="1">⏩ 1x</option>
            <option value="2">⏩ 2x</option>
            <option value="4">⏩ 4x</option>
          </select>
          <button
            className="icon-button"
            aria-label="How to play"
            title="How to play"
            onClick={() => setWelcome(true)}
          >
            <span>
              <CircleHelp size={18} />
            </span>
          </button>
        </div>
      </header>

      <div className={`game-workspace ${panel ? "with-panel" : ""}`}>
        <section className={`world-stage ${scenePlaying ? "conversation-on-stage" : ""}`} aria-label="Nakameguro city map">
          <GameCanvas
            city={city}
            selectedCitizenId={player?.citizen_id ?? selectedCitizenId}
            onSelectCitizen={tap}
          />
          {pendingExchange && !scenePlaying && (
            <div className="world-conversation-pending" role="status">
              <LoaderCircle size={17} className="reply-spinner" />
              <span>{pendingExchange.names}<small>Preparing conversation...</small></span>
            </div>
          )}
          {city?.encounter && !pendingExchange && !scenePlaying && (
            <div className="world-encounter" role="status"><Footprints size={18} /><div>
              <strong>{city.citizens.find((c) => c.citizen_id === city.encounter?.actor_id)?.name.split(" ")[0]} is approaching {city.citizens.find((c) => c.citizen_id === city.encounter?.target_id)?.name.split(" ")[0]}</strong>
              <p>{city.encounter.reason}</p>
            </div></div>
          )}
          <div className="world-caption">
            <span className="map-pin">
              <MapPin size={16} />
            </span>
            <div>
              <strong>{city?.city_name ?? "Nakameguro"}</strong>
              <span>{city ? `Meguro City, Tokyo · ${city.citizens.length} residents` : "Waking up..."}</span>
            </div>
          </div>
          {live && city && (city.clock.minute_of_day >= 1380 || city.clock.minute_of_day < 330) && alertSeen !== "night" && !scenePlaying && !player && (
            <div className="weather-alert night-card" role="status">
              <span aria-hidden="true">😴</span>
              <p>It&apos;s night in Tokyo, so most of Nakameguro is asleep. Come back in daylight, or fast-forward to watch a day unfold.</p>
              <button className="outline-action" onClick={() => { setSpeed(4); void act(() => api.setTimeMode("fast")); setAlertSeen("night"); }}>⏩ Fast-forward</button>
              <button className="icon-button" aria-label="Dismiss" onClick={() => setAlertSeen("night")}><X size={15} /></button>
            </div>
          )}
          {city?.weather?.alert && alertSeen !== city.weather.alert.text && !scenePlaying && (
            <div className="weather-alert" role="alert" data-kind={city.weather.alert.kind}>
              <span aria-hidden="true">{city.weather.alert.kind === "earthquake" ? "🫨" : city.weather.icon}</span>
              <p>{city.weather.alert.text}</p>
              <button className="icon-button" aria-label="Dismiss alert" onClick={() => setAlertSeen(city.weather?.alert?.text ?? "")}><X size={15} /></button>
            </div>
          )}
          <div className="world-state">
            <span className={busy ? "thinking-dot" : "state-dot"} />
            {scenePlaying ? playbackQueue[0].replay ? "Replaying conversation" : "In conversation" : inlineTalk && player
              ? `💬 Chatting with ${shortName(city?.citizens.find((c) => inlineTalk.actorIds.includes(c.citizen_id) && c.citizen_id !== player.citizen_id))}`
              : busy
              ? pendingExchange ? `${pendingExchange.names} are talking` : "Thinking..."
              : city?.clock.running
                ? "City is living"
                : city?.simulation_mode === "autonomous" ? "Auto paused" : "A moment of stillness"}
          </div>
          {player && (
            <div className="playing-banner">
              <CitizenPortrait citizen={player} size={36} />
              <div>
                <small>YOU ARE</small>
                <strong>{player.name}</strong>
              </div>
              <label className="banner-go" title="Go somewhere">
                <MapPin size={15} />
                <select aria-label="Go to a place" value=""
                  onChange={(event) => event.target.value && void goTo(event.target.value)}>
                  <option value="">Go to…</option>
                  {city?.locations.filter((l) => l.location_id !== player.current_location_id).map((l) => (
                    <option key={l.location_id} value={l.location_id}>{l.name}</option>
                  ))}
                </select>
              </label>
              <button
                className="icon-button"
                aria-label="Return to observer"
                title="Return to observer"
                onClick={() => void api.takeControl(null).then(setCity)}
              >
                <ArrowLeft size={18} />
              </button>
            </div>
          )}
          {city && personCitizen && !scenePlaying && (
            <PersonBar city={city} citizen={personCitizen} player={player} busy={busy} onClose={() => setPersonId(null)}
              onTalk={talkTo} onDo={(id, text) => runAct(latestCity.current?.policy.player_citizen_id as string, id, text)} onMore={openActions}
              onPrompt={(id) => { setPersonId(null); void selectCitizen(id); setPage("prompt"); setPanel("citizens"); }}
              onProfile={(id) => { setPersonId(null); choose(id); }}
              onPlayAs={(id) => { void api.takeControl(id).then(setCity); setPersonId(id); }}
              onWatch={(id) => useGameStore.getState().focusOn([id])}
              onGoTo={(locationId) => { setPersonId(null); void goTo(locationId); }} />
          )}
          {city && !personCitizen && !scenePlaying && showScene && (
            <NextMoveCard names={sceneNames} moves={sceneChoices} people={scenePeople} busy={busy} onPick={(m) => pickChoice(m)}
              onWrite={(actorId, text) => writeAct(actorId, text, lastScene?.actorIds ?? [])}
              onDismiss={() => useGameStore.getState().clearLastScene()} />
          )}
          {city && !personCitizen && !showScene && !scenePlaying && <StoryTracker city={city} conversations={cityConversations} onOpenAll={() => setPanel("news")} busy={busy}
            onRetryElection={() => void act(api.advanceElection)}
            onOpenBallots={() => void act(api.openBallots)} onVote={(id) => void act(() => api.castBallot(id))}
            onAsk={(id) => void act(() => api.callCandidate(id)).then((ok) => { if (ok) openChat(id); })}
            onChoose={pickChoice}
            onWrite={(actorId, text, storyId) => writeAct(actorId, text, city.stories?.find((s) => s.id === storyId)?.focus_ids ?? [], storyId)} />}
          {!city && (
            <div className="world-loading">{error || "Opening Nakameguro..."}</div>
          )}
          <div className="citizen-strip" aria-label="Citizens">
            {city?.citizens.map((citizen) => (
              <button
                key={citizen.citizen_id}
                aria-label={`Meet ${citizen.name}`}
                aria-pressed={
                  selected?.citizen_id === citizen.citizen_id &&
                  panel === "citizens"
                }
                onClick={() => tap(citizen.citizen_id)}
              >
                <CitizenPortrait citizen={citizen} size={44} />
                <span>
                  <strong>{shortName(citizen)}</strong>
                  <small>
                    {citizen.citizen_id === player?.citizen_id
                      ? "Playing as"
                      : citizen.mood}
                  </small>
                </span>
                {citizen.citizen_id === player?.citizen_id && (
                  <span className="you-dot" />
                )}
              </button>
            ))}
          </div>
        </section>

        <nav className="game-nav" aria-label="Game views">
          {(
            [
              { id: "city", icon: Compass, label: "City" },
              { id: "create", icon: Wand2, label: "Create" },
              { id: "citizens", icon: Users, label: "People" },
              { id: "journal", icon: MessageCircle, label: "Talk" },
              { id: "news", icon: Newspaper, label: "News" },
              { id: "social", icon: Heart, label: "Bonds" },
              { id: "badges", icon: Trophy, label: "Badges" },
            ] as const
          ).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              aria-label={label}
              aria-pressed={panel === id}
              onClick={() => {
                if (id === "journal") setFocusedConversation(null);
                setPanel(panel === id ? null : id);
              }}
            >
              <Icon size={21} />
              <span>{label}</span>
              {id === "journal" && cityConversations.length > 0 && (
                <i>{cityConversations.length}</i>
              )}
              {id === "badges" && Object.keys(unlocked).length > 0 && (
                <i>{Object.keys(unlocked).length}</i>
              )}
            </button>
          ))}
          <button
            className="save-button"
            onClick={download}
            aria-label="Download world snapshot"
            title="Download world snapshot"
          >
            <Download size={19} />
            <span>Save</span>
          </button>
        </nav>

        {panel && (
          <aside
            className="game-panel"
            aria-label={
              panel === "create" ? "Create a situation" : panel === "news" ? "Town news" : panel === "badges" ? "Badges" : panel === "social" ? "Relationships" : panel === "journal"
                ? "Conversations"
                : panel === "city"
                  ? "City"
                  : "Citizen profile"
            }
          >
            <header className="panel-header">
              <div>
                <small>
                  {panel === "create" ? "YOU CONTROL THE WORLD" : panel === "news" ? "LIFE IN NAKAMEGURO" : panel === "badges" ? "TRY SOMETHING NEW" : panel === "social" ? "FEELINGS ARE NOT ALWAYS MUTUAL" : panel === "journal"
                    ? "THE THREADS BETWEEN US"
                    : panel === "city"
                      ? "YOUR NEIGHBORHOOD"
                      : "EVERYONE HAS A STORY"}
                </small>
                <h2>
                  {panel === "create" ? "Create" : panel === "news" ? "Town news" : panel === "badges" ? "Your badges" : panel === "social" ? "Bonds & feelings" : panel === "journal"
                    ? "Conversations"
                    : panel === "city"
                      ? "Around town"
                      : "The citizens"}
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close panel"
                onClick={() => setPanel(null)}
              >
                <X size={19} />
              </button>
            </header>

            {panel === "badges" && <BadgesPanel unlocked={unlocked} />}

            {panel === "news" && city && <NewsPanel city={city} onSelect={choose} />}

            {panel === "create" && city && <GodPanel city={city} busy={busy} act={act} onMessage={setMessage}
              onStarted={(ids, locationId) => { setPanel(null); useGameStore.getState().focusOn(ids.filter(Boolean), false, locationId); }} />}

            {panel === "social" && city && <SocialPanel city={city} relationships={cityBonds} conversations={cityConversations} onConversation={(id) => {
              setFocusedConversation(id);
              setFilter("all");
              setPanel("journal");
            }} />}

            {panel === "citizens" && selected && (
              <>
                <div className="profile-picker">
                  {city?.citizens.map((citizen) => (
                    <button
                      key={citizen.citizen_id}
                      title={citizen.name}
                      aria-label={`Select ${citizen.name}`}
                      aria-pressed={citizen.citizen_id === selected.citizen_id}
                      onClick={() => choose(citizen.citizen_id)}
                    >
                      <CitizenPortrait citizen={citizen} size={42} />
                    </button>
                  ))}
                </div>
                <div className="profile-heading">
                  <CitizenPortrait citizen={selected} size={64} />
                  <div>
                    <h3>{selected.name}</h3>
                    <p>
                      {selected.age} years old · {selected.profession}
                    </p>
                    <span className="mood-label">{selected.mood}</span>
                  </div>
                </div>
                <div className="profile-actions">
                  <button
                    className="primary-action"
                    disabled={!sessionMemoryEnabled() || selected.age < 3}
                    title={selected.age < 3 ? "Babies and toddlers can't be played yet" : undefined}
                    onClick={() =>
                      void api
                        .takeControl(
                          player?.citizen_id === selected.citizen_id
                            ? null
                            : selected.citizen_id,
                        )
                        .then(setCity)
                    }
                  >
                    <Footprints size={16} />
                    {player?.citizen_id === selected.citizen_id
                      ? "Return to AI"
                      : `Play as ${shortName(selected)}`}
                  </button>
                  <button
                    className="outline-action"
                    onClick={() => {
                      setFilter(selected.citizen_id);
                      setPanel("journal");
                    }}
                  >
                    <MessageCircle size={16} />
                    Talks
                  </button>
                </div>
                <div
                  className="page-tabs"
                  role="tablist"
                  aria-label="Citizen details"
                >
                  {(
                    [
                      { id: "life", label: "Life", icon: Sun },
                      { id: "act", label: "Act", icon: Hand },
                      { id: "prompt", label: "Prompt", icon: ScrollText },
                      { id: "memories", label: "Memories", icon: BookOpen },
                      { id: "bonds", label: "Bonds", icon: Heart },
                    ] as const
                  ).map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={page === id}
                      onClick={() => setPage(id)}
                    >
                      <Icon size={14} />
                      {label}
                    </button>
                  ))}
                </div>
                <div
                  className="panel-scroll"
                  role="tabpanel"
                  key={`${selected.citizen_id}-${page}`}
                >
                  {page === "life" && (
                    <>
                      <div className="activity-line">
                        <MapPin size={15} />
                        <span>
                          {
                            city?.locations.find(
                              (l) =>
                                l.location_id === selected.current_location_id,
                            )?.name
                          }{" "}
                          · {selected.current_activity}
                        </span>
                      </div>
                      {player?.citizen_id !== selected.citizen_id && (
                        <blockquote className="private-thought">
                          {selected.current_thought}
                        </blockquote>
                      )}
                      <CitizenNature citizen={selected} />
                      {city && <LifeDetails citizen={selected} city={city} onSelect={choose} />}
                      <div className="needs-grid">
                        <Need
                          label="Energy"
                          value={selected.energy}
                          tone="mint"
                        />
                        <Need
                          label="Health"
                          value={selected.health}
                          tone="coral"
                        />
                        <Need
                          label="Happiness"
                          value={selected.happiness}
                          tone="gold"
                        />
                        <Need
                          label="Fullness"
                          value={100 - selected.hunger}
                          tone="blue"
                        />
                      </div>
                      <div className="pocket-money">
                        <span>{selected.age >= 18 ? "Money" : "Pocket money"}</span>
                        <strong>${selected.money.toFixed(0)}</strong>
                      </div>
                      <h4>On their mind</h4>
                      <ul className="goal-list">
                        {selected.short_term_goals.map((goal, index) => (
                          <li key={index}>
                            <span />
                            {goal}
                          </li>
                        ))}
                      </ul>
                      {player?.citizen_id === selected.citizen_id ? (
                        <>
                          <h4>Where next?</h4>
                          <div className="destination-grid">
                            {city?.locations.map((location) => (
                              <button
                                key={location.location_id}
                                onClick={() =>
                                  void goTo(location.location_id)
                                }
                              >
                                <MapPin size={13} />
                                {location.name}
                                <ArrowRight size={13} />
                              </button>
                            ))}
                          </div>
                          <button
                            className="primary-action full-width"
                            onClick={() => {
                              setFilter("all");
                              setPanel("journal");
                            }}
                          >
                            Start a conversation
                            <MessageCircle size={16} />
                          </button>
                        </>
                      ) : selected.age < 3 ? null : (
                        <form
                          className="task-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            if (taskDraft.trim().length < 3) return;
                            const safety = checkPlayerText(taskDraft);
                            if (!safety.ok) {
                              setMessage(safety.message);
                              return;
                            }
                            void act(async () => {
                              const task = taskDraft;
                              setTaskDraft("");
                              try {
                                return await api.assignTask(
                                  selected.citizen_id,
                                  { task },
                                );
                              } catch (error) {
                                setTaskDraft((current) => current || task);
                                throw error;
                              }
                            });
                          }}
                        >
                          <label htmlFor="citizen-task">
                            Ask {shortName(selected)} something
                          </label>
                          <textarea
                            id="citizen-task"
                            maxLength={320}
                            minLength={3}
                            required
                            value={taskDraft}
                            onChange={(event) =>
                              setTaskDraft(event.target.value)
                            }
                            placeholder="Invite someone to work on your science project..."
                          />
                          <button
                            className="primary-action"
                            disabled={busy || taskDraft.trim().length < 3}
                          >
                            <Send size={14} />
                            Give task
                          </button>
                        </form>
                      )}
                      {activeTask?.task && (
                        <div className="task-status">
                          <small>{activeTask.status}</small>
                          <p>{activeTask.task}</p>
                          {activeTask.status === "active" && (
                            <button
                              className="text-action"
                              onClick={() =>
                                void api
                                  .closeTask(selected.citizen_id)
                                  .then(setCity)
                              }
                            >
                              Cancel task
                            </button>
                          )}
                        </div>
                      )}
                      <h4>A typical day</h4>
                      <ol className="schedule-list">
                        {selected.daily_schedule.map((entry, index) => (
                          <li key={index}>
                            <time>{time(Number(entry.start))}</time>
                            <span>{String(entry.activity)}</span>
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                  {page === "prompt" && (
                    <CharacterPromptPanel key={`${selected.citizen_id}-${String(selected.personality.prompt_edited ?? "")}`} citizen={selected} busy={busy} act={act} onMessage={setMessage} />
                  )}
                  {page === "act" && city && (
                    <ActionPanel key={`${selected.citizen_id}-${actTarget ?? ""}`} city={city} actor={selected} initialTargetId={actTarget} busy={busy} act={act} onMessage={setMessage} />
                  )}
                  {page === "memories" && (
                    <>
                      <h4>Private journal</h4>
                      {memories.length === 0 ? (
                        <Empty text="No memories yet." />
                      ) : (
                        memories.map((memory) => (
                          <article
                            className="memory-entry"
                            key={memory.memory_id}
                          >
                            <div>
                              <BookOpen size={14} />
                              <span>{memory.kind.replaceAll("_", " ")}</span>
                              {memory.importance >= 0.75 && (
                                <span className="important-mark">
                                  Important
                                </span>
                              )}
                            </div>
                            <p>{memory.content}</p>
                            {Boolean(memory.extra.reflection) && (
                              <details>
                                <summary>Reflection</summary>
                                <p>{String(memory.extra.reflection)}</p>
                              </details>
                            )}
                          </article>
                        ))
                      )}
                    </>
                  )}
                  {page === "bonds" && (
                    <BondNetwork key={selected.citizen_id} citizens={city?.citizens ?? []} relationships={cityBonds} initialFocus={selected.citizen_id} />
                  )}
                </div>
              </>
            )}

            {panel === "journal" && city && (
              <>
                <div className="conversation-filter">
                  <label htmlFor="conversation-filter">Following</label>
                  <select
                    id="conversation-filter"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                  >
                    <option value="all">Everyone</option>
                    {city.citizens.map((citizen) => (
                      <option
                        key={citizen.citizen_id}
                        value={citizen.citizen_id}
                      >
                        {citizen.name}
                      </option>
                    ))}
                  </select>
                </div>
                <AutonomyStatus city={city} pending={pendingExchange} busy={busy} onResume={() => void act(api.start)} />
                <ConversationThread
                  city={city}
                  conversations={cityConversations}
                  focusedConversation={focusedConversation}
                  filter={filter}
                  outgoing={outgoing}
                  canEditOutgoing={
                    !draft.trim() &&
                    outgoing?.actor.citizen_id === player?.citizen_id &&
                    nearby.some(
                      (c) => c.citizen_id === outgoing?.target.citizen_id,
                    )
                  }
                  onEditOutgoing={() => {
                    if (!outgoing || draft.trim()) return;
                    setDraft(outgoing.text);
                    setRecipient(outgoing.target.citizen_id);
                    setOutgoing(null);
                    speechInput.current?.focus();
                  }}
                  onDismissOutgoing={() => setOutgoing(null)}
                  onAddPlan={(conversation, plan) => void act(async () => {
                    const topic = conversation.summary.replace(/[.!?\s]+$/, "");
                    const next = await api.addPlan(conversation.actor_ids[0], conversation.actor_ids[1], plan, topic);
                    setMessage(`📅 Saved: ${plan.label}.`);
                    return next;
                  })}
                />
                {player ? (
                  <form className="speech-form" onSubmit={speak}>
                    <div className="speaking-as">
                      <button type="button" className="icon-button watch-us" title="Watch the two of you" aria-label="Watch the conversation"
                        disabled={!targetId} onClick={() => useGameStore.getState().focusOn([player.citizen_id, targetId])}>
                        <span>👀</span>
                      </button>
                      <CitizenPortrait citizen={player} size={28} />
                      <strong>{shortName(player)}</strong>
                      <ArrowRight size={13} />
                      <select
                        aria-label="Speak to"
                        value={targetId}
                        disabled={busy}
                        onChange={(event) => {
                          const id = event.target.value;
                          // Someone elsewhere: go to them first, then talk.
                          if (nearby.some((c) => c.citizen_id === id)) setRecipient(id);
                          else talkTo(id);
                        }}
                      >
                        <option value="" disabled>
                          {nearby.length ? "Choose someone" : "Nobody nearby: pick anyone below"}
                        </option>
                        {nearby.length > 0 && (
                          <optgroup label="Here with you">
                            {nearby.map((citizen) => (
                              <option key={citizen.citizen_id} value={citizen.citizen_id}>
                                {citizen.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="Elsewhere (you'll go to them)">
                          {city?.citizens.filter((c) => c.citizen_id !== player.citizen_id && !nearby.includes(c)).map((citizen) => (
                            <option key={citizen.citizen_id} value={citizen.citizen_id}>
                              {citizen.name} · {city.locations.find((l) => l.location_id === citizen.current_location_id)?.name}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                    <div className="speech-input">
                      <textarea
                        ref={speechInput}
                        aria-label="Your spoken words"
                        maxLength={600}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (
                            event.key === "Enter" &&
                            !event.shiftKey &&
                            !event.nativeEvent.isComposing
                          ) {
                            event.preventDefault();
                            if (!busy && draft.trim())
                              event.currentTarget.form?.requestSubmit();
                          }
                        }}
                        placeholder={
                          outgoing?.status === "pending"
                            ? "Write your next message..."
                            : /sleep/i.test(nearby.find((c) => c.citizen_id === targetId)?.current_activity ?? "")
                              ? `${shortName(nearby.find((c) => c.citizen_id === targetId))} is asleep 😴`
                              : "What do you say?"
                        }
                        disabled={
                          !targetId || Boolean(city.policy.player_destination)
                        }
                      />
                      <button
                        type="button"
                        className="icon-button voice-toggle"
                        aria-pressed={voiceOn}
                        aria-label={voiceOn ? "Mute voices" : "Hear voices"}
                        title={voiceOn ? "Mute voices" : "Hear voices"}
                        onClick={() => {
                          const on = !conversationAudioPreference.enabled;
                          conversationAudioPreference.enabled = on;
                          if (on) unlockAudio(); else inlineAudio.current?.stop();
                          setVoiceOn(on);
                        }}
                      >
                        <span>{voiceOn ? <Volume2 size={17} /> : <VolumeX size={17} />}</span>
                      </button>
                      <button
                        className="primary-action"
                        aria-label={
                          outgoing?.status === "pending"
                            ? "Waiting for reply"
                            : "Say this"
                        }
                        disabled={
                          busy ||
                          !draft.trim() ||
                          !targetId ||
                          Boolean(city.policy.player_destination)
                        }
                      >
                        {outgoing?.status === "pending" ? (
                          <LoaderCircle className="reply-spinner" size={17} />
                        ) : (
                          <Send size={17} />
                        )}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="journal-footer">
                    <BookOpen size={15} />
                    <span>
                      {cityConversations.length} conversations remembered
                    </span>
                  </div>
                )}
              </>
            )}

            {panel === "city" && city && (
              <div className="panel-scroll">
                <div className="chapter-heading">
                  <span>CHAPTER {String(city.clock.day).padStart(2, "0")}</span>
                  <h3>{weekday(city.clock.day)} in Nakameguro</h3>
                  <p>{chapterLine(city.clock.day, city.clock.minute_of_day)}</p>
                </div>
                <h4>Weather forecast</h4>
                <div className="forecast">
                  {[0, 1, 2, 3].map((offset) => {
                    const start = city.calendar_start ?? calendarStartFor(city.clock.day);
                    const w = dayWeather(start, city.clock.day + offset);
                    const d = calendarDay(start, city.clock.day + offset);
                    const icon = { clear: "☀️", partly_cloudy: "⛅", cloudy: "☁️", fog: "🌫️", rain: "🌧️", heavy_rain: "🌧️", thunderstorm: "⛈️", snow: "🌨️", typhoon: "🌀" }[w.afternoonThunder ? "thunderstorm" : w.condition];
                    return (
                      <div key={offset} className="forecast-day" data-alert={w.condition === "typhoon" || w.heatwave || w.condition === "heavy_rain"}>
                        <small>{offset === 0 ? "Today" : weekday(city.clock.day + offset).slice(0, 3)}</small>
                        <span aria-hidden="true">{icon}</span>
                        <strong>{Math.round(w.high)}°</strong>
                        <small>{Math.round(w.low)}°</small>
                        {d.holiday && <em title={d.holiday}>🎌</em>}
                      </div>
                    );
                  })}
                </div>
                <h4>Plans between people</h4>
                {city.meetings?.length ? city.meetings.slice().reverse().map((meeting) => <div className="meeting-entry" key={meeting.id}>
                  <strong>{meeting.actor_ids.map((id) => shortName(city.citizens.find((c) => c.citizen_id === id))).join(" & ")}</strong>
                  <span>Day {meeting.game_day} · {time(meeting.game_minute)} · {city.locations.find((p) => p.location_id === meeting.location_id)?.name}</span>
                  <p>{meeting.topic}</p><small>{meeting.status === "scheduled" ? "Agreed by both" : meeting.status === "completed" ? "Met as planned" : "Meeting missed"}</small>
                </div>) : <p className="muted-copy">No shared plans yet.</p>}
                <h4>Make something happen</h4>
                <button
                  className="event-choice"
                  disabled={busy}
                  onClick={() =>
                    void act(() =>
                      api.triggerEvent({
                        event_type: "school_exam",
                        severity: "low",
                      }),
                    )
                  }
                >
                  <BookOpen />
                  <span>
                    <strong>Exam day</strong>
                    <small>Qualification tests for everyone studying</small>
                  </span>
                  <ArrowRight size={16} />
                </button>
                <button
                  className="event-choice"
                  disabled={busy}
                  onClick={() =>
                    void act(() =>
                      api.triggerEvent({
                        event_type: "city_festival",
                        severity: "low",
                      }),
                    )
                  }
                >
                  <Sparkles />
                  <span>
                    <strong>Neighborhood festival</strong>
                    <small>Something to look forward to</small>
                  </span>
                  <ArrowRight size={16} />
                </button>
                <h4>Places & people</h4>
                {city.locations.map((location) => (
                  <div className="place-row" key={location.location_id}>
                    <MapPin size={15} />
                    <div>
                      <strong>{location.name}</strong>
                      <small>
                        {city.citizens
                          .filter(
                            (citizen) =>
                              citizen.current_location_id ===
                              location.location_id,
                          )
                          .map(shortName)
                          .join(", ") || "Quiet right now"}
                      </small>
                    </div>
                    {player && (
                      <button
                        className="icon-button"
                        title={`Walk to ${location.name}`}
                        aria-label={`Walk to ${location.name}`}
                        onClick={() =>
                          void goTo(location.location_id)
                        }
                      >
                        <Footprints size={17} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </aside>
        )}
      </div>
      <footer className="game-footer">
        <span>
          <Check size={12} />
          Local world
        </span>
        <span>{player ? `Playing as ${shortName(player)}` : "Observer"}</span>
        <span>AgentCity · early access</span>
      </footer>
      {celebration.length > 0 && (
        <button className="badge-toast" role="status" onClick={() => { setCelebration([]); setPanel("badges"); }}>
          <span aria-hidden="true">{celebration[0].icon}</span>
          <div>
            <small>{celebration.length > 1 ? `${celebration.length} BADGES UNLOCKED` : "BADGE UNLOCKED"}</small>
            <strong>{celebration.map((a) => a.title).join(" · ")}</strong>
          </div>
        </button>
      )}
      {welcome && <WelcomeGuide onClose={closeWelcome} />}
      {(message || error) && (
        <div className="game-toast" role="status">
          <span>{message || error}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setMessage("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </main>
  );
}

function Need({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="need">
      <span>
        {label}
        <b>{Math.round(value)}%</b>
      </span>
      <meter
        className={tone}
        min="0"
        max="100"
        value={value}
        aria-label={label}
      />
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty-journal">
      <MessageCircle size={28} />
      <p>{text}</p>
    </div>
  );
}
function ConversationThread({
  city,
  conversations,
  filter,
  focusedConversation,
  outgoing,
  canEditOutgoing,
  onEditOutgoing,
  onDismissOutgoing,
  onAddPlan,
}: {
  city: CityState;
  conversations: Conversation[];
  filter: string;
  focusedConversation: string | null;
  outgoing: OutgoingSpeech | null;
  canEditOutgoing: boolean;
  onEditOutgoing: () => void;
  onDismissOutgoing: () => void;
  onAddPlan: (conversation: Conversation, plan: NonNullable<ReturnType<typeof parsePlan>>) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(!focusedConversation);
  const names = Object.fromEntries(
    city.citizens.map((citizen) => [citizen.citizen_id, citizen]),
  );
  const entries = city.events
    .filter((event) =>
      [
        "player_task",
        "player_task_completed",
        "task_unresolved",
        "agent_cognition_blocked",
        "invitation_unresolved",
        "election_started",
        "campaign_plan",
        "campaign_approach",
        "election_voting",
        "election_cancelled",
        "election_result",
      ].includes(event.event_type),
    )
    .map((event) => ({
      key: event.event_id,
      day: event.game_day,
      minute: event.game_minute,
      timestamp: event.timestamp,
      actors: event.actors,
      event,
      conversation: null as Conversation | null,
    }));
  for (const conversation of conversations) {
    const event = city.events.find(
      (event) => event.payload.conversation_id === conversation.conversation_id,
    );
    entries.push({
      key: conversation.conversation_id,
      day: conversation.game_day,
      minute: conversation.game_minute,
      timestamp: event?.timestamp ?? "",
      actors: conversation.actor_ids,
      event: null as never,
      conversation,
    });
  }
  const visible = entries
    .filter((entry) => filter === "all" || entry.actors.includes(filter))
    .sort(
      (a, b) =>
        a.day - b.day ||
        a.minute - b.minute ||
        a.timestamp.localeCompare(b.timestamp),
    );
  useEffect(() => {
    if (following && viewport.current)
      viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [visible.length, following, filter, outgoing?.id, outgoing?.status]);
  useEffect(() => {
    if (outgoing?.id && viewport.current)
      viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [outgoing?.id]);
  useEffect(() => {
    if (!focusedConversation || !viewport.current) return;
    const entry = Array.from(viewport.current.querySelectorAll<HTMLElement>("[data-conversation]"))
      .find((el) => el.dataset.conversation === focusedConversation);
    if (entry) {
      viewport.current.scrollTop = entry.offsetTop - viewport.current.offsetTop;
    }
  }, [focusedConversation]);
  return (
    <div className="thread-wrapper">
      <div
        className="panel-scroll conversation-thread"
        ref={viewport}
        onScroll={() => {
          const el = viewport.current;
          if (el)
            setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight < 70);
        }}
      >
        {visible.length === 0 && !outgoing && (
          <Empty text={city.simulation_mode === "autonomous" ? "No conversations in this view yet." : "The next conversation is still unwritten."} />
        )}
        {visible.map((entry, index) => {
          // Back-and-forth chat with the same person reads as one thread, not separate scenes.
          const previous = visible[index - 1];
          const continued = Boolean(entry.conversation?.player_chat && previous?.conversation?.player_chat
            && previous.actors.join() === entry.actors.join()
            && (entry.day * 1440 + entry.minute) - (previous.day * 1440 + previous.minute) <= 60);
          return entry.conversation ? (
            <div className={`exchange ${focusedConversation === entry.key ? "focused-exchange" : ""} ${continued ? "continued-exchange" : ""}`} data-conversation={entry.key} key={entry.key}>
              {!continued && <div className="exchange-time">
                <button className="replay-exchange" aria-label={`Replay conversation from day ${entry.day} at ${time(entry.minute)}`} title="Watch this conversation in the city" onClick={() => useGameStore.getState().replayConversation(entry.key)}><Play size={14} /></button>
                <span>
                  Day {entry.day} · {time(entry.minute)}
                </span>
                <span>
                  {
                    city.locations.find(
                      (location) =>
                        location.location_id ===
                        entry.conversation?.location_id,
                    )?.name
                  }
                </span>
              </div>}
              {entry.conversation.encounter && <p className="exchange-context">{entry.conversation.encounter.reason}</p>}
              {entry.conversation.transcript.map((line, index) => (
                <article
                  className="dialogue-line"
                  key={`${entry.key}-${index}`}
                >
                  <CitizenPortrait
                    citizen={
                      names[line.speaker_id] ?? {
                        citizen_id: line.speaker_id,
                        name: "Citizen",
                      }
                    }
                    size={32}
                  />
                  <div>
                    <div className="speaker-name">
                      <strong>{shortName(names[line.speaker_id])}</strong>
                      <ArrowRight size={11} />
                      <span>
                        {entry.actors
                          .filter((id) => id !== line.speaker_id)
                          .map((id) => shortName(names[id]))
                          .join(", ")}
                      </span>
                    </div>
                    <p>{displayText(line.text)}</p>
                  </div>
                </article>
              ))}
              <ConversationImpact conversation={entry.conversation} citizens={city.citizens} />
              {entry.conversation.player_chat && index === visible.length - 1 && (() => {
                // A day and time agreed in the chat can become a real plan.
                // Read the whole back-and-forth with this person, not only the last exchange.
                const thread: string[] = [];
                for (let i = index; i >= 0 && visible[i].conversation?.player_chat && visible[i].actors.join() === entry.actors.join(); i--)
                  thread.unshift(...visible[i].conversation!.transcript.map((l) => l.text));
                const plan = parsePlan(thread.slice(-8).join(" "), city);
                const saved = plan && (city.meetings ?? []).some((m) => m.status === "scheduled" && entry.actors.every((id) => m.actor_ids.includes(id)) && m.game_day === plan.day && Math.abs(m.game_minute - plan.minute) < 60);
                const invitation = thread.find((l) => /\b(want to|wanna|let's|grab|meet|join me|come with)\b/i.test(l)) ?? thread[0] ?? "a meet-up";
                return plan && !saved ? <button className="outline-action plan-button" onClick={() => onAddPlan({ ...entry.conversation!, summary: invitation }, plan)}>📅 Add to plans: {plan.label}</button> : null;
              })()}
            </div>
          ) : (
            <div className="task-divider" key={entry.key}>
              <span>
                {entry.event.event_type === "player_task"
                  ? "TASK ASSIGNED"
                  : entry.event.event_type === "player_task_completed"
                    ? "COMPLETED"
                    : ["task_unresolved", "invitation_unresolved"].includes(entry.event.event_type)
                      ? "UNRESOLVED"
                      : entry.event.event_type.replaceAll("_", " ").toUpperCase()}{" "}
                · {time(entry.minute)}
              </span>
              <p>{entry.event.description}</p>
            </div>
          );
        })}
        {outgoing && (
          <div className="outgoing-exchange" aria-label="Outgoing message">
            <article className="dialogue-line">
              <CitizenPortrait citizen={outgoing.actor} size={32} />
              <div>
                <div className="speaker-name">
                  <strong>{shortName(outgoing.actor)}</strong>
                  <ArrowRight size={11} />
                  <span>{shortName(outgoing.target)}</span>
                </div>
                <p>{outgoing.text}</p>
              </div>
            </article>
            <div
              className={`reply-status ${outgoing.status}`}
              role="status"
              aria-live="polite"
            >
              {outgoing.status === "pending" ? (
                <>
                  <LoaderCircle size={14} className="reply-spinner" />
                  Waiting for {shortName(outgoing.target)}...
                </>
              ) : (
                <span>{outgoing.error} Message not completed.</span>
              )}
            </div>
            {outgoing.status === "failed" && (
              <div className="failed-speech-actions">
                <button
                  className="outline-action"
                  disabled={!canEditOutgoing}
                  onClick={onEditOutgoing}
                >
                  Edit message
                </button>
                <button className="text-action" onClick={onDismissOutgoing}>
                  Dismiss
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {!following && (
        <button className="latest-button" onClick={() => setFollowing(true)}>
          Latest
          <ChevronDown size={14} />
        </button>
      )}
    </div>
  );
}
