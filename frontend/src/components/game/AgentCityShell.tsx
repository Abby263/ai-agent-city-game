"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import {
  Activity,
  AlertTriangle,
  Banknote,
  BookOpen,
  Brain,
  BriefcaseBusiness,
  Building2,
  Bus,
  CircleDollarSign,
  Cloud,
  Coffee,
  Eye,
  Factory,
  FlaskConical,
  GalleryHorizontalEnd,
  Gauge,
  Handshake,
  HeartPulse,
  HelpCircle,
  Home,
  Library,
  Megaphone,
  MapPin,
  MessageCircle,
  MessageSquareText,
  Moon,
  MousePointerClick,
  Pause,
  PiggyBank,
  Pill,
  Play,
  Radio,
  Route,
  Shield,
  ShoppingBag,
  Sparkles,
  Stethoscope,
  Sun,
  Sunrise,
  Sunset,
  Target,
  TreePine,
  TrendingUp,
  UserRound,
  Users,
  Wheat,
  Wifi,
  WifiOff,
  Wind,
  Zap,
} from "lucide-react";

import { GameCanvas } from "@/components/game/GameCanvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ProgressTone } from "@/components/ui/progress";
import { api } from "@/lib/api";
import { useGameStore } from "@/lib/store";
import type {
  CitizenAgent,
  CityEvent,
  CityState,
  Conversation,
  Location,
  Memory,
  Relationship,
  TimelineItem,
  TriggerEventPayload,
} from "@/lib/types";

type Tone = "accent" | "warning" | "danger" | "success" | "violet";
type InspectorTab = "life" | "memory" | "social";
type SpeedKey = "paused" | "1x" | "2x" | "4x";
type HoverInfo =
  | { kind: "location"; data: Location }
  | { kind: "citizen"; data: { name: string; subtitle: string } }
  | null;

const SPEED_INTERVALS: Record<SpeedKey, number | null> = {
  paused: null,
  "1x": 1800,
  "2x": 900,
  "4x": 450,
};

const eventButtons: Array<{
  label: string;
  detail: string;
  event_type: TriggerEventPayload["event_type"];
  icon: ComponentType<{ className?: string }>;
  tone: "default" | "secondary" | "danger" | "warning";
}> = [
  { label: "Flu Outbreak", detail: "Health system stress", event_type: "flu_outbreak", icon: Stethoscope, tone: "danger" },
  { label: "Traffic Accident", detail: "Police & driver call", event_type: "traffic_accident", icon: Bus, tone: "warning" },
  { label: "Food Shortage", detail: "Farm & market squeeze", event_type: "food_shortage", icon: Wheat, tone: "warning" },
  { label: "School Exam", detail: "Teacher & student push", event_type: "school_exam", icon: BookOpen, tone: "secondary" },
  { label: "City Festival", detail: "Mood surge at park", event_type: "city_festival", icon: Sparkles, tone: "default" },
  { label: "Bank Policy", detail: "Loan rate ripples", event_type: "bank_policy_change", icon: PiggyBank, tone: "secondary" },
  { label: "Power Outage", detail: "Engineer scramble", event_type: "power_outage", icon: Zap, tone: "danger" },
];

const systemRows = [
  { key: "city_health", label: "City Health", icon: HeartPulse, tone: "success" as ProgressTone },
  { key: "average_happiness", label: "Public Mood", icon: Sparkles, tone: "accent" as ProgressTone },
  { key: "economy_status", label: "Local Economy", icon: CircleDollarSign, tone: "warning" as ProgressTone },
  { key: "education_status", label: "Education", icon: BookOpen, tone: "violet" as ProgressTone },
  { key: "traffic_status", label: "Traffic Flow", icon: Bus, tone: "water" as ProgressTone },
];

const professionFilters = ["All", "Doctor", "Teacher", "Student", "Engineer", "Driver", "Shopkeeper", "Farmer", "Mayor"];

const AUTO_EVENT_TYPES: TriggerEventPayload["event_type"][] = [
  "city_festival",
  "flu_outbreak",
  "traffic_accident",
  "food_shortage",
  "school_exam",
  "bank_policy_change",
  "power_outage",
];

export function AgentCityShell() {
  const {
    city,
    timeline,
    selectedCitizenId,
    memories,
    relationships,
    conversations,
    connectionStatus,
    error,
    loadInitialState,
    connectWebSocket,
    setCity,
    selectCitizen,
  } = useGameStore();
  const [busy, setBusy] = useState(false);
  const [speed, setSpeed] = useState<SpeedKey>("1x");
  const [autoDirector, setAutoDirector] = useState(true);
  const [autoFollow, setAutoFollow] = useState(true);
  const [professionFilter, setProfessionFilter] = useState("All");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("life");
  const [hoverInfo, setHoverInfo] = useState<HoverInfo>(null);
  const [showGuide, setShowGuide] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem("agentcity-guide-dismissed") !== "true",
  );
  const lastUserSelectRef = useRef<number>(0);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    loadInitialState();
    socketRef.current = connectWebSocket();
    return () => socketRef.current?.close();
  }, [connectWebSocket, loadInitialState]);

  // Auto-start the simulation as soon as we have city state.
  useEffect(() => {
    if (!city) return;
    if (!city.clock.running && speed !== "paused") {
      void api.start().then(setCity).catch(() => undefined);
    }
  }, [city, setCity, speed]);

  // Tick loop driven by selected speed.
  useEffect(() => {
    const interval = SPEED_INTERVALS[speed];
    if (!interval || !city?.clock.running) return;
    const id = window.setInterval(async () => {
      try {
        const next = await api.tick();
        setCity(next);
      } catch {
        setSpeed("paused");
      }
    }, interval);
    return () => window.clearInterval(id);
  }, [speed, city?.clock.running, setCity]);

  // Auto-director: trigger random ambient events when on.
  useEffect(() => {
    if (!autoDirector || !city?.clock.running) return;
    const id = window.setInterval(async () => {
      const recentHigh = city.events.some((event) => event.priority >= 3);
      if (recentHigh) return;
      const eventType = AUTO_EVENT_TYPES[Math.floor(Math.random() * AUTO_EVENT_TYPES.length)];
      try {
        const next = await api.triggerEvent({ event_type: eventType, severity: "low" });
        setCity(next);
      } catch {
        // silently ignore
      }
    }, 36000);
    return () => window.clearInterval(id);
  }, [autoDirector, city?.clock.running, city?.events, setCity]);

  // Auto-follow: rotate selected citizen to keep things lively.
  useEffect(() => {
    if (!autoFollow || !city) return;
    const id = window.setInterval(() => {
      // Only rotate if user hasn't picked someone in the last 25s.
      if (Date.now() - lastUserSelectRef.current < 25000) return;
      const candidates = city.citizens
        .map((citizen) => ({
          citizen,
          score: citizenInterestScore(citizen),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
      if (candidates.length === 0) return;
      const pick = candidates[Math.floor(Math.random() * candidates.length)].citizen;
      if (pick.citizen_id !== selectedCitizenId) {
        void selectCitizen(pick.citizen_id);
      }
    }, 9000);
    return () => window.clearInterval(id);
  }, [autoFollow, city, selectedCitizenId, selectCitizen]);

  useEffect(() => {
    if (!city || selectedCitizenId || !city.citizens[0]) return;
    void selectCitizen(city.citizens[0].citizen_id);
  }, [city, selectedCitizenId, selectCitizen]);

  const handleSelectCitizen = useCallback(
    (citizenId: string) => {
      lastUserSelectRef.current = Date.now();
      void selectCitizen(citizenId);
    },
    [selectCitizen],
  );

  const selectedCitizen = useMemo(
    () => city?.citizens.find((citizen) => citizen.citizen_id === selectedCitizenId) ?? city?.citizens[0],
    [city, selectedCitizenId],
  );
  const locationById = useMemo(
    () => Object.fromEntries(city?.locations.map((location) => [location.location_id, location]) ?? []),
    [city?.locations],
  );
  const citizenNames = useMemo(
    () => Object.fromEntries(city?.citizens.map((citizen) => [citizen.citizen_id, citizen.name]) ?? []),
    [city?.citizens],
  );
  const visibleCitizens = useMemo(() => {
    const citizens = city?.citizens ?? [];
    if (professionFilter === "All") return citizens;
    return citizens.filter((citizen) => citizen.profession === professionFilter);
  }, [city?.citizens, professionFilter]);
  const activeEvent = city?.events.find((event) => event.priority >= 2) ?? city?.events[0] ?? null;

  async function runAction(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      const result = await action();
      if (result && typeof result === "object" && "city_id" in result) {
        setCity(result as CityState);
      }
    } finally {
      setBusy(false);
    }
  }

  function closeGuide() {
    window.localStorage.setItem("agentcity-guide-dismissed", "true");
    setShowGuide(false);
  }

  const clockLabel = city ? minutesLabel(city.clock.minute_of_day) : "--:--";
  const period = periodInfo(city?.clock.minute_of_day ?? 0);

  return (
    <main className="agentcity-shell grid h-[100dvh] w-screen grid-rows-[68px_1fr_220px] overflow-hidden text-[rgb(var(--foreground))]">
      <TopHeader
        cityName={city?.city_name}
        connectionStatus={connectionStatus}
        clock={clockLabel}
        day={city?.clock.day ?? 1}
        period={period}
        running={Boolean(city?.clock.running)}
        speed={speed}
        onSpeed={(next) => {
          setSpeed(next);
          if (next === "paused") {
            void runAction(api.pause);
          } else if (!city?.clock.running) {
            void runAction(api.start);
          }
        }}
        autoDirector={autoDirector}
        onAutoDirector={setAutoDirector}
        autoFollow={autoFollow}
        onAutoFollow={setAutoFollow}
        busy={busy}
        runAction={runAction}
        onShowGuide={() => setShowGuide(true)}
      />

      <section className="grid min-h-0 grid-cols-[300px_minmax(420px,1fr)_380px] gap-3 px-3 pt-2 pb-1">
        <aside className="glass-panel min-h-0 overflow-y-auto rounded-xl p-3 scrollbar-thin">
          <PlayerGuideCard
            city={city}
            selectedCitizen={selectedCitizen ?? null}
            busy={busy}
            onOpenGuide={() => setShowGuide(true)}
            runAction={runAction}
          />
          <HeroStats city={city} />
          <CitySystems city={city} />
          <CitizenRoster
            citizens={visibleCitizens}
            totalCitizens={city?.citizens.length ?? 0}
            selectedCitizenId={selectedCitizen?.citizen_id ?? null}
            professionFilter={professionFilter}
            onFilter={setProfessionFilter}
            onSelect={handleSelectCitizen}
          />
        </aside>

        <div className="glass-panel relative min-h-0 overflow-hidden rounded-xl bg-[#0a1226]">
          <GameCanvas
            city={city}
            selectedCitizenId={selectedCitizen?.citizen_id ?? null}
            onSelectCitizen={handleSelectCitizen}
            onHoverChange={setHoverInfo}
          />
          <SceneOverlay
            citizen={selectedCitizen ?? null}
            city={city}
            event={activeEvent}
            period={period}
            hover={hoverInfo}
          />
          {showGuide ? <HowToPlayOverlay onClose={closeGuide} /> : null}
          <SceneLegend />
        </div>

        <aside className="glass-panel min-h-0 overflow-y-auto rounded-xl p-4 scrollbar-thin">
          {error ? (
            <div className="mb-3 rounded-lg border border-[rgba(244,89,89,0.4)] bg-[rgba(244,89,89,0.1)] p-3 text-sm text-[rgb(252,165,165)]">
              {error}
            </div>
          ) : null}
          {selectedCitizen ? (
            <CitizenPanel
              citizen={selectedCitizen}
              memories={memories}
              relationships={relationships}
              conversations={conversations}
              citizenNames={citizenNames}
              locationById={locationById}
              tab={inspectorTab}
              onTab={setInspectorTab}
            />
          ) : null}

          <ActionPanel busy={busy} city={city} runAction={runAction} />
        </aside>
      </section>

      <StoryTimeline timeline={timeline} />
    </main>
  );
}

function TopHeader({
  cityName,
  connectionStatus,
  clock,
  day,
  period,
  running,
  speed,
  onSpeed,
  autoDirector,
  onAutoDirector,
  autoFollow,
  onAutoFollow,
  busy,
  runAction,
  onShowGuide,
}: {
  cityName: string | undefined;
  connectionStatus: string;
  clock: string;
  day: number;
  period: ReturnType<typeof periodInfo>;
  running: boolean;
  speed: SpeedKey;
  onSpeed: (next: SpeedKey) => void;
  autoDirector: boolean;
  onAutoDirector: (value: boolean) => void;
  autoFollow: boolean;
  onAutoFollow: (value: boolean) => void;
  busy: boolean;
  runAction: (action: () => Promise<unknown>) => Promise<void>;
  onShowGuide: () => void;
}) {
  const PeriodIcon = period.icon;
  const isStreaming = connectionStatus === "connected";
  return (
    <header className="z-10 flex min-w-0 items-center justify-between gap-3 border-b border-[rgba(var(--border),0.7)] bg-[rgba(8,12,24,0.85)] px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[rgb(var(--accent))] via-[rgb(125_211_252)] to-[rgb(var(--violet))] text-[#06121f] shadow-[0_0_24px_rgba(56,189,248,0.32)]">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-bold tracking-tight text-grad-accent">{cityName ?? "Navora"}</h1>
            <Badge tone="accent">AgentCity</Badge>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">
            {isStreaming ? (
              <>
                <Wifi className="h-3 w-3 text-[rgb(var(--success))]" />
                <span className="live-dot text-[rgb(var(--success))]">live stream</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3 text-[rgb(var(--accent-2))]" />
                <span>cloud actions</span>
              </>
            )}
            <span className="opacity-60">·</span>
            <span>city clock {speed === "paused" ? "paused" : `running ${speed}`}</span>
          </div>
        </div>
      </div>

      <div className="hidden min-w-0 items-center gap-3 lg:flex">
        <ClockBlock day={day} time={clock} period={period} running={running} icon={PeriodIcon} />
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <SpeedControl speed={speed} onSpeed={onSpeed} busy={busy} />
        <button
          className={`btn-pill ${autoDirector ? "" : ""}`}
          data-active={autoDirector}
          onClick={() => onAutoDirector(!autoDirector)}
          title="Auto Events creates occasional city incidents and celebrations"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Auto Events
        </button>
        <button
          className="btn-pill"
          data-active={autoFollow}
          onClick={() => onAutoFollow(!autoFollow)}
          title="Follow interesting citizens automatically"
        >
          <UserRound className="h-3.5 w-3.5" />
          Follow Citizen
        </button>
        <button className="btn-pill" onClick={onShowGuide} title="Show how to play AgentCity">
          <HelpCircle className="h-3.5 w-3.5" />
          How to Play
        </button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => runAction(api.tick)} title="Advance one 15-minute game tick">
          <Radio className="h-4 w-4" />
          <span className="hidden xl:inline">Step 15m</span>
        </Button>
      </div>
    </header>
  );
}

function SpeedControl({
  speed,
  onSpeed,
  busy,
}: {
  speed: SpeedKey;
  onSpeed: (next: SpeedKey) => void;
  busy: boolean;
}) {
  const choices: Array<{ key: SpeedKey; label: string; icon: ComponentType<{ className?: string }> }> = [
    { key: "paused", label: "Pause", icon: Pause },
    { key: "1x", label: "1×", icon: Play },
    { key: "2x", label: "2×", icon: Play },
    { key: "4x", label: "4×", icon: Play },
  ];
  return (
    <div className="flex items-center gap-1 rounded-full border border-[rgba(var(--border),0.85)] bg-[rgba(var(--panel-strong),0.85)] p-1">
      {choices.map((choice) => {
        const Icon = choice.icon;
        const active = speed === choice.key;
        return (
          <button
            key={choice.key}
            disabled={busy}
            onClick={() => onSpeed(choice.key)}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition ${
              active
                ? "bg-[rgb(var(--accent))] text-[#06121f] shadow-[0_4px_14px_rgba(56,189,248,0.45)]"
                : "text-[rgb(var(--muted-strong))] hover:bg-white/5"
            }`}
          >
            <Icon className="h-3 w-3" />
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}

function ClockBlock({
  day,
  time,
  period,
  running,
  icon: Icon,
}: {
  day: number;
  time: string;
  period: ReturnType<typeof periodInfo>;
  running: boolean;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[rgba(var(--border),0.85)] bg-[rgba(var(--panel),0.85)] px-4 py-1.5">
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${period.tint}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="leading-tight">
        <div className="flex items-center gap-2">
          <span className="font-mono text-2xl font-semibold tabular-nums">{time}</span>
          <span className={`mb-0.5 inline-block h-2 w-2 rounded-full ${running ? "bg-[rgb(var(--success))] live-dot" : "bg-[rgb(var(--muted))]"}`} />
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">
          <span>Day {day}</span>
          <span>·</span>
          <span className="text-[rgb(var(--muted-strong))]">{period.label}</span>
        </div>
      </div>
    </div>
  );
}

function PlayerGuideCard({
  city,
  selectedCitizen,
  busy,
  onOpenGuide,
  runAction,
}: {
  city: CityState | null;
  selectedCitizen: CitizenAgent | null;
  busy: boolean;
  onOpenGuide: () => void;
  runAction: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const running = Boolean(city?.clock.running);
  const focusName = selectedCitizen?.name ?? "a citizen";
  return (
    <div className="mb-3 rounded-xl border border-[rgba(var(--accent),0.45)] bg-[linear-gradient(160deg,rgba(56,189,248,0.14),rgba(167,139,250,0.08)_55%,rgba(8,12,24,0.64))] p-3 shadow-[0_12px_34px_rgba(0,0,0,0.28)]">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Target className="h-4 w-4 text-[rgb(var(--accent))]" />
            Play as mayor-observer
          </div>
          <p className="mt-1 text-xs leading-snug text-[rgb(var(--muted-strong))]">
            Watch citizens live, click people to inspect them, then create events and see how memories and relationships change.
          </p>
        </div>
        <Badge tone={running ? "success" : "default"}>{running ? "live" : "paused"}</Badge>
      </div>

      <div className="grid gap-1.5 text-[11px]">
        <GuideStep icon={Eye} label="Watch" detail="Citizens walk to work, school, food, home, and each other." />
        <GuideStep icon={MousePointerClick} label="Inspect" detail={`Click ${focusName} or any dot on the map for thoughts, needs, memory, and social life.`} />
        <GuideStep icon={Megaphone} label="Intervene" detail="Use event cards or mayor tools to create a story and observe reactions." />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          size="sm"
          variant={running ? "secondary" : "default"}
          disabled={busy}
          onClick={() => runAction(running ? api.tick : api.start)}
        >
          {running ? <Radio className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {running ? "Advance 15m" : "Start City"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onOpenGuide}>
          <HelpCircle className="h-4 w-4" />
          Full Guide
        </Button>
      </div>
    </div>
  );
}

function GuideStep({
  icon: Icon,
  label,
  detail,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex gap-2 rounded-lg bg-black/20 p-2">
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[rgba(56,189,248,0.16)] text-[rgb(var(--accent))]">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-[rgb(var(--foreground))]">{label}</div>
        <div className="leading-snug text-[rgb(var(--muted))]">{detail}</div>
      </div>
    </div>
  );
}

function HowToPlayOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute left-4 top-4 z-20 max-w-[430px] rounded-2xl border border-[rgba(var(--accent),0.55)] bg-[rgba(8,12,24,0.93)] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.55)] backdrop-blur">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold">
            <HelpCircle className="h-5 w-5 text-[rgb(var(--accent))]" />
            How to play AgentCity
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[rgb(var(--muted-strong))]">
            You do not control citizens directly. They are autonomous AI people with jobs, needs, memories, and relationships.
          </p>
        </div>
        <button className="btn-pill px-2 py-1" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="grid gap-2 text-xs">
        <HowToRow icon={Play} title="Let the city run" body="Use 1x, 2x, or 4x in the top bar. Step 15m advances one simulation tick." />
        <HowToRow icon={MousePointerClick} title="Click a citizen" body="The right panel shows their thought, mood, money, needs, schedule, goals, memories, relationships, and conversations." />
        <HowToRow icon={MessageSquareText} title="Read the story" body="The bottom feed explains what just happened. Conversations show what two agents discussed and how their relationship changed." />
        <HowToRow icon={Sparkles} title="Create a situation" body="Use the event cards for flu, traffic, festival, school exam, food shortage, policy changes, or power outage." />
        <HowToRow icon={Handshake} title="Watch relationships develop" body="Citizens who meet repeatedly become acquaintances, then friends, then trusted friends as memories accumulate." />
      </div>
    </div>
  );
}

function HowToRow({
  icon: Icon,
  title,
  body,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-[rgba(var(--border-soft),0.85)] bg-black/20 p-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--accent))]" />
      <div>
        <div className="font-semibold">{title}</div>
        <p className="mt-0.5 leading-snug text-[rgb(var(--muted))]">{body}</p>
      </div>
    </div>
  );
}

function HeroStats({ city }: { city: CityState | null }) {
  const happy = Math.round(city?.metrics.average_happiness ?? 0);
  const health = Math.round(city?.metrics.city_health ?? 0);
  const sick = Number(city?.metrics.sick_count ?? 0);
  const tone = happy >= 70 ? "success" : happy >= 50 ? "warning" : "danger";

  return (
    <div className="mb-3 grid grid-cols-2 gap-2">
      <HeroStatCard
        label="Happiness"
        value={`${happy}%`}
        progress={happy}
        tone={tone}
        icon={Sparkles}
        delta={city?.metrics.average_happiness && city.metrics.average_happiness > 65 ? "rising" : "steady"}
      />
      <HeroStatCard
        label="Health"
        value={`${health}%`}
        progress={health}
        tone={health >= 70 ? "success" : "warning"}
        icon={HeartPulse}
        delta={sick > 0 ? `${sick} sick` : "steady"}
      />
      <HeroStatCard
        label="People"
        value={String(city?.metrics.population ?? 0)}
        progress={Math.min(100, ((city?.metrics.population ?? 0) / 50) * 100)}
        tone="accent"
        icon={Users}
        delta="active"
      />
      <HeroStatCard
        label="Events"
        value={String(city?.metrics.active_events ?? 0)}
        progress={Math.min(100, (city?.metrics.active_events ?? 0) * 25)}
        tone={(city?.metrics.active_events ?? 0) > 1 ? "warning" : "accent"}
        icon={Activity}
        delta={(city?.metrics.active_events ?? 0) > 0 ? "active" : "calm"}
      />
    </div>
  );
}

function HeroStatCard({
  label,
  value,
  progress,
  tone,
  icon: Icon,
  delta,
}: {
  label: string;
  value: string;
  progress: number;
  tone: ProgressTone;
  icon: ComponentType<{ className?: string }>;
  delta?: string;
}) {
  return (
    <div className="metric-card">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">
            <Icon className="h-3 w-3" />
            {label}
          </div>
          <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{value}</div>
        </div>
        {delta ? (
          <span className="rounded-full bg-black/30 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-[rgb(var(--muted-strong))]">
            {delta}
          </span>
        ) : null}
      </div>
      <div className="mt-2">
        <Progress value={progress} tone={tone} glow height={6} />
      </div>
    </div>
  );
}

function CitySystems({ city }: { city: CityState | null }) {
  return (
    <div className="my-3 space-y-2">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted-strong))]">City Pulse</h2>
        <Badge tone="violet">tick {city?.clock.tick ?? 0}</Badge>
      </div>
      {systemRows.map((row) => {
        const Icon = row.icon;
        const value = Number(city?.metrics[row.key as keyof CityState["metrics"]] ?? 0);
        return (
          <div key={row.key} className="rounded-md bg-black/15 px-2 py-1.5">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5">
                <Icon className="h-3 w-3 text-[rgb(var(--muted))]" />
                {row.label}
              </span>
              <span className="font-mono text-[rgb(var(--muted-strong))]">{Math.round(value)}</span>
            </div>
            <Progress value={value} tone={row.tone} height={5} />
          </div>
        );
      })}
    </div>
  );
}

function CitizenRoster({
  citizens,
  totalCitizens,
  selectedCitizenId,
  professionFilter,
  onFilter,
  onSelect,
}: {
  citizens: CitizenAgent[];
  totalCitizens: number;
  selectedCitizenId: string | null;
  professionFilter: string;
  onFilter: (filter: string) => void;
  onSelect: (citizenId: string) => void;
}) {
  return (
    <div className="my-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted-strong))]">Citizens</h2>
        <Badge>
          {citizens.length}/{totalCitizens}
        </Badge>
      </div>
      <div className="mb-2 flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
        {professionFilters.map((filter) => (
          <button
            key={filter}
            className="btn-pill"
            data-active={professionFilter === filter}
            onClick={() => onFilter(filter)}
          >
            {filter}
          </button>
        ))}
      </div>
      <div className="space-y-1">
        {citizens.slice(0, 25).map((citizen) => (
          <button
            key={citizen.citizen_id}
            className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-all ${
              selectedCitizenId === citizen.citizen_id
                ? "border-[rgba(56,189,248,0.6)] bg-[rgba(56,189,248,0.12)] shadow-[0_0_18px_rgba(56,189,248,0.18)]"
                : "border-transparent bg-black/15 hover:border-[rgba(var(--border),0.85)] hover:bg-black/25"
            }`}
            onClick={() => onSelect(citizen.citizen_id)}
          >
            <CitizenAvatar citizen={citizen} small />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{citizen.name}</span>
              <span className="block truncate font-mono text-[10px] text-[rgb(var(--muted))]">
                {citizen.profession} · {citizen.current_activity}
              </span>
            </span>
            <span className="flex flex-col items-end gap-0.5">
              <span className="font-mono text-[9px] text-[rgb(var(--muted))]">{Math.round(citizen.happiness)}%</span>
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  citizen.health < 55
                    ? "bg-[rgb(var(--danger))]"
                    : citizen.stress > 70
                      ? "bg-[rgb(var(--warning))]"
                      : "bg-[rgb(var(--success))]"
                }`}
              />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SceneOverlay({
  citizen,
  city,
  event,
  period,
  hover,
}: {
  citizen: CitizenAgent | null;
  city: CityState | null;
  event: CityEvent | null;
  period: ReturnType<typeof periodInfo>;
  hover: HoverInfo;
}) {
  const PeriodIcon = period.icon;
  return (
    <>
      <div className="pointer-events-none absolute left-3 top-3 max-w-[380px] rounded-xl border border-[rgba(var(--border),0.7)] bg-[rgba(8,12,24,0.86)] p-3 shadow-2xl backdrop-blur">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">
            <Route className="h-3.5 w-3.5" />
            Live focus
          </div>
          <Badge tone={city?.clock.running ? "success" : "default"}>
            {city?.clock.running ? "running" : "paused"}
          </Badge>
        </div>
        <div className="text-sm font-semibold leading-snug">
          {citizen ? `${citizen.name} is ${citizen.current_activity.toLowerCase()}` : "Navora is loading"}
        </div>
        <p className="mt-1 line-clamp-3 text-xs leading-snug text-[rgb(var(--muted))]">
          {citizen?.current_thought ?? "Citizens move, work, react, remember, and form plans as the simulation runs."}
        </p>
        <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-black/25 px-2 py-1.5 text-[11px] text-[rgb(var(--muted-strong))]">
          <MousePointerClick className="h-3.5 w-3.5 text-[rgb(var(--accent))]" />
          Click a person on the map or roster to follow their life.
        </div>
      </div>

      <div className="pointer-events-none absolute right-3 top-3 w-[260px] rounded-xl border border-[rgba(var(--border),0.7)] bg-[rgba(8,12,24,0.86)] p-3 shadow-2xl backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">
            <PeriodIcon className="h-3.5 w-3.5" />
            {period.label}
          </span>
          <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--muted-strong))]">
            <Cloud className="h-3 w-3" />
            {weatherFor(city?.clock.day ?? 1, city?.clock.minute_of_day ?? 0)}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <MiniNumber label="Happy" value={`${Math.round(city?.metrics.average_happiness ?? 0)}%`} />
          <MiniNumber label="Sick" value={String(city?.metrics.sick_count ?? 0)} />
          <MiniNumber label="Events" value={String(city?.metrics.active_events ?? 0)} />
        </div>
        {event ? (
          <div className="mt-2 flex items-start gap-2 rounded-lg bg-black/30 p-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[rgb(var(--warning))]" />
            <div className="line-clamp-2 text-[11px] leading-snug text-[rgb(var(--muted-strong))]">
              {event.description}
            </div>
          </div>
        ) : null}
      </div>

      {hover ? <HoverTooltip hover={hover} /> : null}
    </>
  );
}

function HoverTooltip({ hover }: { hover: NonNullable<HoverInfo> }) {
  return (
    <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 rounded-xl border border-[rgba(var(--accent),0.5)] bg-[rgba(8,12,24,0.94)] px-3 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur">
      {hover.kind === "location" ? (
        <div className="flex items-center gap-2">
          {locationIcon(hover.data.type)}
          <div>
            <div className="text-xs font-semibold">{hover.data.name}</div>
            <div className="font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">
              {hover.data.type.replaceAll("_", " ")} · cap {hover.data.capacity}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <UserRound className="h-3.5 w-3.5 text-[rgb(var(--accent))]" />
          <div>
            <div className="text-xs font-semibold">{hover.data.name}</div>
            <div className="font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">
              {hover.data.subtitle}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SceneLegend() {
  const items: Array<{ icon: ComponentType<{ className?: string }>; label: string; color: string }> = [
    { icon: HeartPulse, label: "Health", color: "text-[rgb(244,89,89)]" },
    { icon: BookOpen, label: "School", color: "text-[rgb(96,165,250)]" },
    { icon: ShoppingBag, label: "Market", color: "text-[rgb(251,146,60)]" },
    { icon: Wheat, label: "Farm", color: "text-[rgb(132,204,22)]" },
    { icon: PiggyBank, label: "Bank", color: "text-[rgb(167,139,250)]" },
    { icon: Shield, label: "Police", color: "text-[rgb(56,189,248)]" },
    { icon: FlaskConical, label: "Lab", color: "text-[rgb(74,222,128)]" },
    { icon: Library, label: "Library", color: "text-[rgb(196,181,253)]" },
    { icon: Factory, label: "Power", color: "text-[rgb(251,146,60)]" },
    { icon: TreePine, label: "Park", color: "text-[rgb(74,222,128)]" },
  ];
  return (
    <div className="absolute bottom-3 left-3 right-3 flex gap-1.5 overflow-x-auto rounded-xl border border-[rgba(var(--border),0.7)] bg-[rgba(8,12,24,0.82)] p-2 backdrop-blur scrollbar-thin">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border border-[rgba(var(--border-soft),0.85)] bg-black/30 px-2 py-1 text-[10px] uppercase tracking-wide ${item.color}`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="text-[rgb(var(--muted-strong))]">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ActionPanel({
  busy,
  city,
  runAction,
}: {
  busy: boolean;
  city: CityState | null;
  runAction: (action: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <div className="mt-4 space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted-strong))]">Make Something Happen</h2>
          <Badge tone="warning">agents react</Badge>
        </div>
        <p className="text-xs leading-snug text-[rgb(var(--muted))]">
          Pick an event to test the city. Citizens will move, think, talk, remember, and update relationships.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {eventButtons.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.event_type}
                variant={item.tone}
                size="sm"
                className="h-auto justify-start px-2 py-2 text-left"
                disabled={busy}
                onClick={() =>
                  runAction(() => api.triggerEvent({ event_type: item.event_type, severity: "medium" }))
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-xs">{item.label}</span>
                  <span className="block truncate font-normal text-[10px] opacity-80">{item.detail}</span>
                </span>
              </Button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted-strong))]">Mayor Tools</h2>
          <Badge tone={city?.policy?.public_health_campaign ? "success" : "default"}>
            {city?.policy?.public_health_campaign ? "campaign on" : "standard"}
          </Badge>
        </div>
        <p className="text-xs leading-snug text-[rgb(var(--muted))]">
          Change budgets and campaigns to help the city recover from events.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <PolicyButton busy={busy} label="Hospital" icon={HeartPulse} onClick={() => runAction(() => api.applyPolicy({ hospital_budget: 72 }))} />
          <PolicyButton busy={busy} label="School" icon={BookOpen} onClick={() => runAction(() => api.applyPolicy({ school_budget: 70 }))} />
          <PolicyButton busy={busy} label="Roads" icon={Bus} onClick={() => runAction(() => api.applyPolicy({ road_budget: 72 }))} />
          <PolicyButton busy={busy} label="Health Push" icon={Stethoscope} onClick={() => runAction(() => api.applyPolicy({ public_health_campaign: true }))} />
        </div>
      </div>
    </div>
  );
}

function PolicyButton({
  busy,
  label,
  icon: Icon,
  onClick,
}: {
  busy: boolean;
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <Button variant="secondary" size="sm" disabled={busy} onClick={onClick}>
      <Icon className="h-4 w-4" />
      <span className="truncate">{label}</span>
    </Button>
  );
}

function CitizenPanel({
  citizen,
  memories,
  relationships,
  conversations,
  citizenNames,
  locationById,
  tab,
  onTab,
}: {
  citizen: CitizenAgent;
  memories: Memory[];
  relationships: Relationship[];
  conversations: Conversation[];
  citizenNames: Record<string, string>;
  locationById: Record<string, Location>;
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
}) {
  const currentLocation = locationById[citizen.current_location_id]?.name ?? citizen.current_location_id;
  const targetLocation =
    Object.values(locationById).find(
      (location) =>
        citizen.target_x >= location.x &&
        citizen.target_x <= location.x + location.width &&
        citizen.target_y >= location.y &&
        citizen.target_y <= location.y + location.height,
    )?.name ?? `${citizen.target_x},${citizen.target_y}`;

  return (
    <div className="mb-4 space-y-4">
      <div className="flex items-start gap-3">
        <CitizenAvatar citizen={citizen} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold leading-tight">{citizen.name}</h1>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge tone="accent">{citizen.profession}</Badge>
                <Badge tone="violet">{citizen.mood}</Badge>
                <Badge>Age {citizen.age}</Badge>
              </div>
            </div>
            <div className="text-right font-mono text-sm">
              <div className="text-[rgb(var(--accent-2))]">${Math.round(citizen.money)}</div>
              <div className="text-xs text-[rgb(var(--muted))]">rep {Math.round(citizen.reputation)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[rgba(var(--border),0.85)] bg-gradient-to-br from-[rgba(56,189,248,0.06)] to-[rgba(167,139,250,0.04)] p-3">
        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">
          <Brain className="h-3.5 w-3.5" />
          Current thought
        </div>
        <p className="text-sm leading-relaxed">{citizen.current_thought}</p>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/30 p-1">
        <InspectorTabButton active={tab === "life"} icon={Gauge} label="Life" onClick={() => onTab("life")} />
        <InspectorTabButton active={tab === "memory"} icon={Brain} label="Memory" onClick={() => onTab("memory")} />
        <InspectorTabButton active={tab === "social"} icon={MessageCircle} label="Social" onClick={() => onTab("social")} />
      </div>

      {tab === "life" ? (
        <LifeTab citizen={citizen} currentLocation={currentLocation} targetLocation={targetLocation} />
      ) : null}
      {tab === "memory" ? <MemoryTab memories={memories} citizen={citizen} /> : null}
      {tab === "social" ? (
        <SocialTab relationships={relationships} conversations={conversations} citizenNames={citizenNames} />
      ) : null}
    </div>
  );
}

function InspectorTabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition ${
        active
          ? "bg-[rgba(56,189,248,0.18)] text-[rgb(125,211,252)] shadow-[inset_0_0_0_1px_rgba(56,189,248,0.4)]"
          : "text-[rgb(var(--muted))] hover:bg-white/5"
      }`}
      onClick={onClick}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function LifeTab({
  citizen,
  currentLocation,
  targetLocation,
}: {
  citizen: CitizenAgent;
  currentLocation: string;
  targetLocation: string;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <InfoPill icon={MapPin} label="At" value={currentLocation} />
        <InfoPill icon={Route} label="Going" value={targetLocation} />
        <InfoPill icon={BriefcaseBusiness} label="Activity" value={citizen.current_activity} wide />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Need label="Health" value={citizen.health} tone={citizen.health < 50 ? "danger" : "success"} icon={HeartPulse} />
        <Need label="Energy" value={citizen.energy} tone="water" icon={Wind} />
        <Need label="Food" value={100 - citizen.hunger} tone={citizen.hunger > 70 ? "danger" : "warning"} icon={Coffee} />
        <Need label="Calm" value={100 - citizen.stress} tone={citizen.stress > 65 ? "danger" : "accent"} icon={Sparkles} />
      </div>

      <SectionTitle label="Goals" count={citizen.short_term_goals.length + citizen.long_term_goals.length} />
      <div className="space-y-1">
        {[...citizen.short_term_goals, ...citizen.long_term_goals.slice(0, 2)].map((goal) => (
          <div key={goal} className="story-card rounded-md px-2 py-1.5 text-xs">
            {goal}
          </div>
        ))}
      </div>

      <SectionTitle label="Schedule" count={citizen.daily_schedule.length} />
      <div className="space-y-1">
        {citizen.daily_schedule.slice(0, 5).map((slot) => (
          <div
            key={`${slot.start}-${slot.activity}`}
            className="flex justify-between rounded-md bg-black/15 px-2 py-1.5 text-xs"
          >
            <span className="truncate">{String(slot.activity)}</span>
            <span className="font-mono text-[rgb(var(--muted))]">{minutesLabel(Number(slot.start))}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {citizen.skills.slice(0, 4).map((skill) => (
          <Badge key={skill} className="justify-center" tone="accent">
            {skill}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function MemoryTab({ citizen, memories }: { citizen: CitizenAgent; memories: Memory[] }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[rgba(var(--border),0.85)] bg-black/20 p-3">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">
          Semantic summary
        </div>
        <p className="text-xs leading-relaxed">{citizen.memory_summary}</p>
      </div>
      <SectionTitle label="Recent memories" count={memories.length} />
      <div className="space-y-2">
        {memories.slice(0, 7).map((memory) => (
          <div key={memory.memory_id} className="story-card rounded-md p-2">
            <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">
              <span>{memory.kind}</span>
              <span>{Math.round(memory.importance * 100)}</span>
            </div>
            <div className="text-xs leading-snug">{memory.content}</div>
          </div>
        ))}
        {memories.length === 0 ? <EmptyLine text="No durable memories loaded yet." /> : null}
      </div>
    </div>
  );
}

function SocialTab({
  relationships,
  conversations,
  citizenNames,
}: {
  relationships: Relationship[];
  conversations: Conversation[];
  citizenNames: Record<string, string>;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[rgba(var(--accent),0.35)] bg-[rgba(56,189,248,0.08)] p-3 text-xs leading-relaxed text-[rgb(var(--muted-strong))]">
        <div className="mb-1 flex items-center gap-2 font-semibold text-[rgb(var(--foreground))]">
          <Handshake className="h-4 w-4 text-[rgb(var(--accent))]" />
          How friendship forms
        </div>
        Citizens start as strangers. Repeated talks, shared events, and useful help raise familiarity, warmth, and trust.
      </div>
      <SectionTitle label="Relationships" count={relationships.length} />
      <div className="space-y-2">
        {relationships.slice(0, 8).map((relationship) => (
          <div key={relationship.relationship_id} className="story-card rounded-md p-2 text-xs">
            <div className="mb-1 flex justify-between gap-2">
              <span className="truncate">{citizenNames[relationship.other_citizen_id] ?? relationship.other_citizen_id}</span>
              <span className="font-mono text-[rgb(var(--muted))]">{relationshipStage(relationship)}</span>
            </div>
            <div className="mb-1 grid grid-cols-3 gap-1 font-mono text-[9px] uppercase tracking-wide text-[rgb(var(--muted))]">
              <span>Trust {Math.round(relationship.trust)}</span>
              <span>Warm {Math.round(relationship.warmth)}</span>
              <span>Know {Math.round(relationship.familiarity)}</span>
            </div>
            <Progress value={(relationship.trust + relationship.warmth + relationship.familiarity) / 3} tone="accent" height={5} />
            <p className="mt-1 line-clamp-2 text-[11px] text-[rgb(var(--muted))]">{relationship.notes}</p>
          </div>
        ))}
        {relationships.length === 0 ? <EmptyLine text="No social history loaded yet." /> : null}
      </div>

      <SectionTitle label="Recent conversations" count={conversations.length} />
      <div className="space-y-2">
        {conversations.slice(0, 5).map((conversation) => (
          <div key={conversation.conversation_id} className="story-card rounded-md p-2 text-xs">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">
              Day {conversation.game_day} · {minutesLabel(conversation.game_minute)}
            </div>
            <p className="mb-1 leading-snug">{conversation.summary}</p>
            <div className="space-y-1 text-[11px] text-[rgb(var(--muted))]">
              {conversation.transcript.slice(0, 3).map((line, index) => (
                <div key={`${conversation.conversation_id}-${index}`}>
                  <span className="text-[rgb(var(--foreground))]">{citizenNames[line.speaker_id] ?? line.speaker_id}:</span>{" "}
                  {line.text}
                </div>
              ))}
            </div>
          </div>
        ))}
        {conversations.length === 0 ? (
          <EmptyLine text="No conversations yet. Auto mode will create them as citizens cross paths." />
        ) : null}
      </div>
    </div>
  );
}

function StoryTimeline({ timeline }: { timeline: TimelineItem[] }) {
  return (
    <footer className="z-10 border-t border-[rgba(var(--border),0.7)] bg-[rgba(8,12,24,0.85)] px-4 py-3 backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GalleryHorizontalEnd className="h-4 w-4 text-[rgb(var(--accent))]" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted-strong))]">What Just Happened</h2>
          <Badge tone="accent">{timeline.length}</Badge>
        </div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">
          <TrendingUp className="h-3.5 w-3.5" />
          Newest first · click citizens to see what they remember
        </div>
      </div>
      <div className="grid h-[148px] grid-cols-5 gap-2 overflow-y-auto scrollbar-thin">
        {timeline.map((item) => (
          <div key={item.id} className="story-card rounded-lg p-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className={`flex h-5 items-center gap-1 rounded-full border px-1.5 text-[9px] uppercase tracking-wide ${storyTone(item.type)}`}>
                {storyIcon(item.type)}
                <span className="truncate">{storyTypeLabel(item.type)}</span>
              </span>
              <span className="font-mono text-[10px] text-[rgb(var(--muted))]">{item.time}</span>
            </div>
            <p className="line-clamp-4 text-[11px] leading-snug">{item.text}</p>
          </div>
        ))}
        {timeline.length === 0 ? (
          <div className="col-span-5 flex items-center justify-center text-xs text-[rgb(var(--muted))]">
            Waiting for the first story…
          </div>
        ) : null}
      </div>
    </footer>
  );
}

function CitizenAvatar({ citizen, small = false }: { citizen: CitizenAgent; small?: boolean }) {
  const size = small ? "h-8 w-8" : "h-14 w-14";
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center rounded-xl border border-black/40 ${size}`}
      style={{ background: `linear-gradient(150deg, ${professionHex(citizen.profession)} 30%, rgba(8,12,24,0.6))` }}
    >
      <UserRound className={small ? "h-4 w-4 text-black/85" : "h-7 w-7 text-black/85"} />
      <span
        className={`absolute rounded-full border border-black/50 ${
          small ? "-right-0.5 -top-0.5 h-2.5 w-2.5" : "-right-1 -top-1 h-3.5 w-3.5"
        }`}
        style={{ background: moodHex(citizen) }}
      />
      <span className={`absolute bottom-0.5 right-1 font-mono ${small ? "text-[8px]" : "text-[10px]"} font-bold text-black/80`}>
        {professionGlyph(citizen.profession)}
      </span>
    </span>
  );
}

function InfoPill({
  icon: Icon,
  label,
  value,
  wide = false,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={`tile-card p-2 ${wide ? "col-span-2" : ""}`}>
      <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="truncate text-xs">{value}</div>
    </div>
  );
}

function MiniNumber({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile-card px-2 py-1.5">
      <div className="font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">{label}</div>
      <div className="font-mono text-sm font-semibold">{value}</div>
    </div>
  );
}

function Need({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: ProgressTone;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="tile-card px-2 py-1.5">
      <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-[rgb(var(--muted))]">
        <span className="flex items-center gap-1.5">
          <Icon className="h-3 w-3" />
          {label}
        </span>
        <span>{Math.round(value)}</span>
      </div>
      <Progress value={value} tone={tone} height={5} />
    </div>
  );
}

function SectionTitle({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-1 mt-1 flex items-center justify-between">
      <div className="font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">{label}</div>
      <Badge>{count}</Badge>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-[rgba(var(--border),0.85)] bg-black/15 p-3 text-xs text-[rgb(var(--muted))]">
      {text}
    </div>
  );
}

function locationIcon(type: string) {
  if (type === "home") return <Home className="h-3.5 w-3.5 text-[rgb(180,150,110)]" />;
  if (type === "hospital") return <Stethoscope className="h-3.5 w-3.5 text-[rgb(244,89,89)]" />;
  if (type === "school") return <BookOpen className="h-3.5 w-3.5 text-[rgb(96,165,250)]" />;
  if (type === "bank") return <PiggyBank className="h-3.5 w-3.5 text-[rgb(167,139,250)]" />;
  if (type === "market") return <ShoppingBag className="h-3.5 w-3.5 text-[rgb(251,146,60)]" />;
  if (type === "restaurant") return <Coffee className="h-3.5 w-3.5 text-[rgb(251,146,60)]" />;
  if (type === "pharmacy") return <Pill className="h-3.5 w-3.5 text-[rgb(165,243,252)]" />;
  if (type === "farm") return <Wheat className="h-3.5 w-3.5 text-[rgb(132,204,22)]" />;
  if (type === "police") return <Shield className="h-3.5 w-3.5 text-[rgb(56,189,248)]" />;
  if (type === "bus_stop") return <Bus className="h-3.5 w-3.5 text-[rgb(165,243,252)]" />;
  if (type === "lab") return <FlaskConical className="h-3.5 w-3.5 text-[rgb(74,222,128)]" />;
  if (type === "library") return <Library className="h-3.5 w-3.5 text-[rgb(196,181,253)]" />;
  if (type === "power") return <Factory className="h-3.5 w-3.5 text-[rgb(251,146,60)]" />;
  if (type === "park") return <TreePine className="h-3.5 w-3.5 text-[rgb(74,222,128)]" />;
  if (type === "city_hall") return <Banknote className="h-3.5 w-3.5 text-[rgb(252,211,77)]" />;
  return <MapPin className="h-3.5 w-3.5 text-[rgb(var(--muted))]" />;
}

function professionHex(profession: string) {
  const colors: Record<string, string> = {
    Doctor: "rgb(239,68,68)",
    Nurse: "rgb(244,114,182)",
    Teacher: "rgb(96,165,250)",
    Student: "rgb(134,239,172)",
    Engineer: "rgb(251,191,36)",
    Driver: "rgb(203,213,225)",
    Shopkeeper: "rgb(251,146,60)",
    Banker: "rgb(167,139,250)",
    "Police Officer": "rgb(59,130,246)",
    Farmer: "rgb(74,222,128)",
    Mayor: "rgb(252,211,77)",
    Scientist: "rgb(52,211,153)",
    Researcher: "rgb(45,212,191)",
    "Restaurant Cook": "rgb(251,113,133)",
  };
  return colors[profession] ?? "rgb(226,232,240)";
}

function moodHex(citizen: CitizenAgent) {
  if (citizen.health < 55) return "rgb(244,89,89)";
  if (citizen.stress > 68) return "rgb(251,191,36)";
  if (citizen.happiness > 78) return "rgb(74,222,128)";
  return "rgb(96,165,250)";
}

function relationshipStage(relationship: Relationship) {
  if (relationship.trust >= 72 && relationship.warmth >= 70 && relationship.familiarity >= 65) {
    return "trusted friend";
  }
  if (relationship.trust >= 58 && relationship.warmth >= 56 && relationship.familiarity >= 45) {
    return "friend";
  }
  if (relationship.familiarity >= 24 || relationship.trust >= 45) {
    return "acquaintance";
  }
  return "stranger";
}

function professionGlyph(profession: string) {
  const glyphs: Record<string, string> = {
    Doctor: "+",
    Nurse: "+",
    Teacher: "T",
    Student: "S",
    Engineer: "E",
    Driver: "D",
    Shopkeeper: "$",
    Banker: "B",
    "Police Officer": "P",
    Farmer: "F",
    Mayor: "M",
    Scientist: "R",
    Researcher: "R",
    "Restaurant Cook": "C",
  };
  return glyphs[profession] ?? "·";
}

function storyTone(type: string) {
  if (type.includes("flu") || type.includes("outage") || type.includes("accident")) {
    return "border-[rgba(244,89,89,0.5)] bg-[rgba(244,89,89,0.12)] text-[rgb(252,165,165)]";
  }
  if (type === "city_festival" || type === "memory" || type === "reflection") {
    return "border-[rgba(167,139,250,0.5)] bg-[rgba(167,139,250,0.12)] text-[rgb(196,181,253)]";
  }
  if (type === "conversation" || type === "thought") {
    return "border-[rgba(56,189,248,0.5)] bg-[rgba(56,189,248,0.12)] text-[rgb(125,211,252)]";
  }
  if (type === "mayor_policy" || type === "bank_policy_change") {
    return "border-[rgba(251,191,36,0.5)] bg-[rgba(251,191,36,0.14)] text-[rgb(252,211,77)]";
  }
  return "border-[rgba(var(--border),0.85)] bg-[rgba(var(--panel-strong),0.85)] text-[rgb(var(--muted-strong))]";
}

function storyIcon(type: string) {
  const className = "h-3 w-3";
  if (type.includes("flu") || type === "doctor_treatment") return <HeartPulse className={className} />;
  if (type === "traffic_accident" || type === "citizen_arrived") return <Bus className={className} />;
  if (type === "food_shortage" || type === "farm_harvest" || type === "market_sale")
    return <ShoppingBag className={className} />;
  if (type === "school_exam" || type === "workday_started") return <BookOpen className={className} />;
  if (type === "city_festival") return <Sparkles className={className} />;
  if (type === "bank_policy_change") return <PiggyBank className={className} />;
  if (type === "power_outage") return <Zap className={className} />;
  if (type === "conversation") return <MessageCircle className={className} />;
  if (type === "thought") return <Brain className={className} />;
  if (type === "memory") return <Brain className={className} />;
  if (type === "mayor_policy") return <Banknote className={className} />;
  if (type === "new_day") return <Sunrise className={className} />;
  if (type === "social_opportunity") return <Users className={className} />;
  return <Activity className={className} />;
}

function storyTypeLabel(type: string) {
  const labels: Record<string, string> = {
    social_opportunity: "chance to talk",
    conversation: "conversation",
    thought: "thought",
    memory: "memory",
    reflection: "reflection",
    citizen_arrived: "arrived",
    workday_started: "workday",
    mayor_policy: "mayor decision",
    simulation_started: "city started",
    simulation_paused: "city paused",
    farm_harvest: "farm harvest",
    market_sale: "market sale",
    doctor_treatment: "doctor helped",
  };
  return labels[type] ?? type.replaceAll("_", " ");
}

function minutesLabel(value: number) {
  return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
}

function periodInfo(minute: number) {
  const hour = minute / 60;
  if (hour < 5) return { label: "Late night", icon: Moon, tint: "bg-[rgba(56,72,104,0.6)] text-[rgb(165,180,252)]" };
  if (hour < 7) return { label: "Dawn", icon: Sunrise, tint: "bg-[rgba(244,114,182,0.18)] text-[rgb(244,114,182)]" };
  if (hour < 12) return { label: "Morning", icon: Sun, tint: "bg-[rgba(252,211,77,0.18)] text-[rgb(252,211,77)]" };
  if (hour < 17) return { label: "Afternoon", icon: Sun, tint: "bg-[rgba(251,146,60,0.18)] text-[rgb(251,146,60)]" };
  if (hour < 19) return { label: "Dusk", icon: Sunset, tint: "bg-[rgba(244,114,182,0.2)] text-[rgb(244,114,182)]" };
  if (hour < 22) return { label: "Evening", icon: Moon, tint: "bg-[rgba(167,139,250,0.18)] text-[rgb(196,181,253)]" };
  return { label: "Night", icon: Moon, tint: "bg-[rgba(56,72,104,0.5)] text-[rgb(165,180,252)]" };
}

function weatherFor(day: number, minute: number) {
  // Deterministic faux-weather for ambient flavor.
  const seed = (day * 37 + Math.floor(minute / 240)) % 5;
  return ["clear", "breezy", "cloudy", "humid", "calm"][seed];
}

function citizenInterestScore(citizen: CitizenAgent) {
  let score = 0;
  if (citizen.health < 55) score += 3;
  if (citizen.stress > 70) score += 2;
  if (citizen.happiness > 80) score += 1;
  if (citizen.profession === "Mayor") score += 1.5;
  if (citizen.profession === "Doctor" || citizen.profession === "Police Officer") score += 1;
  // Movement adds liveliness
  if (citizen.x !== citizen.target_x || citizen.y !== citizen.target_y) score += 0.8;
  // Random sprinkle for variety
  return score + Math.random() * 1.4;
}
