"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, FormEvent, ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Banknote,
  BookOpen,
  Brain,
  BriefcaseBusiness,
  Building2,
  Bus,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Coffee,
  Factory,
  FlaskConical,
  GalleryHorizontalEnd,
  Gauge,
  Handshake,
  HeartPulse,
  HelpCircle,
  Home,
  Library,
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
  X,
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
  SimulationMode,
  TimelineItem,
  TriggerEventPayload,
} from "@/lib/types";

type Tone = "accent" | "warning" | "danger" | "success" | "violet";
type InspectorTab = "life" | "memory" | "social";
type ActivePanel = "city" | "citizen" | "story" | null;
type SpeedKey = "paused" | "1x" | "2x" | "4x";
type PlayerTask = {
  task: string;
  status: string;
  location_id: string | null;
  target_citizen_id: string | null;
};
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

const professionFilters = ["All", "Student"];

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
    cityConversations,
    connectionStatus,
    error,
    loadInitialState,
    refreshCityConversations,
    connectWebSocket,
    setCity,
    selectCitizen,
  } = useGameStore();
  const [busy, setBusy] = useState(false);
  const [speed, setSpeed] = useState<SpeedKey>("paused");
  const [autoDirector, setAutoDirector] = useState(false);
  const [autoFollow, setAutoFollow] = useState(false);
  const [professionFilter, setProfessionFilter] = useState("All");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("life");
  const [hoverInfo, setHoverInfo] = useState<HoverInfo>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const lastUserSelectRef = useRef<number>(0);
  const socketRef = useRef<WebSocket | null>(null);
  const tickInFlightRef = useRef(false);
  const gameMode = city?.simulation_mode ?? "manual";
  const activeTasks = useMemo(
    () =>
      (city?.citizens ?? []).reduce<Array<{ citizen: CitizenAgent; task: PlayerTask }>>((items, citizen) => {
        const task = playerTaskFor(citizen);
        if (task?.status === "active") {
          items.push({ citizen, task });
        }
        return items;
      }, []),
    [city?.citizens],
  );

  useEffect(() => {
    loadInitialState();
    socketRef.current = connectWebSocket();
    return () => socketRef.current?.close();
  }, [connectWebSocket, loadInitialState]);

  // Tick loop driven by selected speed.
  useEffect(() => {
    const interval = SPEED_INTERVALS[speed];
    if (!interval || !city?.clock.running) return;
    if (city.simulation_mode === "manual" && activeTasks.length === 0) return;
    const id = window.setInterval(async () => {
      if (tickInFlightRef.current) return;
      tickInFlightRef.current = true;
      try {
        const next = await api.tick();
        setCity(next);
        if (next.simulation_mode === "manual" && activePlayerTaskCount(next.citizens) === 0) {
          setSpeed("paused");
        }
      } catch {
        setSpeed("paused");
      } finally {
        tickInFlightRef.current = false;
      }
    }, interval);
    return () => window.clearInterval(id);
  }, [activeTasks.length, speed, city?.clock.running, city?.simulation_mode, setCity]);

  // Auto-director: trigger random ambient events when on.
  useEffect(() => {
    if (!autoDirector || !city?.clock.running || city.simulation_mode !== "autonomous") return;
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
  }, [autoDirector, city?.clock.running, city?.events, city?.simulation_mode, setCity]);

  // Auto-follow: rotate selected citizen to keep things lively.
  useEffect(() => {
    if (!autoFollow || !city || city.simulation_mode !== "autonomous") return;
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

  useEffect(() => {
    if (activePanel !== "story") return;
    void refreshCityConversations().catch(() => undefined);
  }, [activePanel, city?.clock.tick, refreshCityConversations]);

  useEffect(() => {
    if (!city || !selectedCitizenId) return;
    void selectCitizen(selectedCitizenId).catch(() => undefined);
  }, [city?.clock.tick, city?.events.length, city, selectedCitizenId, selectCitizen]);

  const handleSelectCitizen = useCallback(
    (citizenId: string) => {
      lastUserSelectRef.current = Date.now();
      void selectCitizen(citizenId);
      setActivePanel("citizen");
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

  const selectAdjacentCitizen = useCallback(
    (direction: -1 | 1) => {
      const citizens = visibleCitizens.length > 0 ? visibleCitizens : (city?.citizens ?? []);
      if (citizens.length === 0) return;
      const currentIndex = citizens.findIndex((citizen) => citizen.citizen_id === selectedCitizen?.citizen_id);
      const baseIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = (baseIndex + direction + citizens.length) % citizens.length;
      handleSelectCitizen(citizens[nextIndex].citizen_id);
    },
    [city?.citizens, handleSelectCitizen, selectedCitizen?.citizen_id, visibleCitizens],
  );

  async function runAction(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      const result = await action();
      if (result && typeof result === "object" && "city_id" in result) {
        setCity(result as CityState);
      }
      return result;
    } finally {
      setBusy(false);
    }
  }

  async function handleModeChange(nextMode: SimulationMode) {
    if (busy || nextMode === gameMode) return;
    setBusy(true);
    try {
      const next = await api.setMode(nextMode);
      setCity(next);
      if (nextMode === "manual") {
        setSpeed("paused");
        setAutoDirector(false);
        setAutoFollow(false);
      } else {
        setSpeed("1x");
        setAutoDirector(true);
      }
    } finally {
      setBusy(false);
    }
  }

  function handleTaskAssigned(next: CityState) {
    setCity(next);
    if (next.simulation_mode === "manual") {
      setSpeed(activePlayerTaskCount(next.citizens) > 0 ? "1x" : "paused");
      setActivePanel("story");
    }
  }

  function closeGuide() {
    window.localStorage.setItem("agentcity-guide-dismissed", "true");
    setShowGuide(false);
  }

  const clockLabel = city ? minutesLabel(city.clock.minute_of_day) : "--:--";
  const period = periodInfo(city?.clock.minute_of_day ?? 0);

  return (
    <main className="agentcity-shell min-h-[100dvh] w-screen overflow-x-hidden overflow-y-auto pb-24 text-[rgb(var(--foreground))] lg:grid lg:h-[100dvh] lg:grid-rows-[68px_minmax(0,1fr)] lg:overflow-hidden lg:pb-0">
      <TopHeader
        cityName={city?.city_name}
        connectionStatus={connectionStatus}
        clock={clockLabel}
        day={city?.clock.day ?? 1}
        period={period}
        running={Boolean(city?.clock.running)}
        speed={speed}
        gameMode={gameMode}
        activeTaskCount={activeTasks.length}
        onModeChange={handleModeChange}
        onSpeed={(next) => {
          if (gameMode === "manual" && next !== "paused" && activeTasks.length === 0) {
            setSpeed("paused");
            return;
          }
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

      <section className="relative min-h-0 px-2 pt-2 pb-3 sm:px-3 lg:h-full lg:pb-3">
        <div id="city-map" className="glass-panel relative h-[68dvh] min-h-[430px] scroll-mt-24 overflow-hidden rounded-xl bg-[#0a1226] sm:h-[72dvh] lg:h-full lg:min-h-0">
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
            hover={hoverInfo}
            gameMode={gameMode}
            activeTaskCount={activeTasks.length}
          />
          <MapPanelDock
            activePanel={activePanel}
            citizen={selectedCitizen ?? null}
            conversationCount={cityConversations.length}
            onOpen={setActivePanel}
          />
          {showGuide ? <HowToPlayOverlay onClose={closeGuide} /> : null}
          {activePanel === "city" ? <SceneLegend /> : null}
        </div>

        <MobileCitizenControls
          citizen={selectedCitizen ?? null}
          busy={busy}
          runAction={runAction}
          gameMode={gameMode}
          activeTaskCount={activeTasks.length}
          onPrevious={() => selectAdjacentCitizen(-1)}
          onNext={() => selectAdjacentCitizen(1)}
          onOpenProfile={() => setActivePanel("citizen")}
        />

        {activePanel === "city" ? (
          <GameDrawer
            id="city-panel"
            title="City Controls"
            subtitle="Events, policies, citizens"
            icon={Gauge}
            side="left"
            onClose={() => setActivePanel(null)}
          >
            <HeroStats city={city} />
            <CitySystems city={city} />
            <ActionPanel busy={busy} city={city} gameMode={gameMode} runAction={runAction} />
            <CitizenRoster
              citizens={visibleCitizens}
              totalCitizens={city?.citizens.length ?? 0}
              selectedCitizenId={selectedCitizen?.citizen_id ?? null}
              professionFilter={professionFilter}
              onFilter={setProfessionFilter}
              onSelect={handleSelectCitizen}
            />
          </GameDrawer>
        ) : null}

        {activePanel === "citizen" ? (
          <GameDrawer
            id="citizen-panel"
            title={selectedCitizen?.name ?? "Citizen"}
            subtitle={selectedCitizen ? `${selectedCitizen.profession} profile` : "Select someone on the map"}
            icon={UserRound}
            side="right"
            onClose={() => setActivePanel(null)}
          >
            {error ? (
              <div className="mb-3 rounded-lg border border-[rgba(244,89,89,0.4)] bg-[rgba(244,89,89,0.1)] p-3 text-sm text-[rgb(252,165,165)]">
                {error}
              </div>
            ) : null}
            {selectedCitizen ? (
              <>
                <CitizenSwitcher
                  citizens={city?.citizens ?? []}
                  selectedCitizenId={selectedCitizen.citizen_id}
                  onSelect={handleSelectCitizen}
                />
                <CitizenPanel
                  citizen={selectedCitizen}
                  memories={memories}
                  relationships={relationships}
                  conversations={conversations}
                  citizenNames={citizenNames}
                  locationById={locationById}
                  tab={inspectorTab}
                  onTab={setInspectorTab}
                  busy={busy}
                  runAction={runAction}
                  onRefreshCitizen={() => selectCitizen(selectedCitizen.citizen_id)}
                  citizens={city?.citizens ?? []}
                  gameMode={gameMode}
                  onTaskAssigned={handleTaskAssigned}
                />
              </>
            ) : (
              <EmptyLine text="Tap a citizen on the map to inspect them." />
            )}
          </GameDrawer>
        ) : null}

        {activePanel === "story" ? (
          <GameDrawer
            id="story-feed"
            title="Conversation Feed"
            subtitle="Latest talks, memories, and city moments"
            icon={MessageSquareText}
            side="bottom"
            onClose={() => setActivePanel(null)}
          >
            <ConversationFeed
              conversations={cityConversations}
              city={city}
              timeline={timeline}
              gameMode={gameMode}
              activeTasks={activeTasks}
              onSelectCitizen={handleSelectCitizen}
            />
          </GameDrawer>
        ) : null}
      </section>

      <MobilePlayDock activePanel={activePanel} onOpen={setActivePanel} />
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
  gameMode,
  activeTaskCount,
  onModeChange,
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
  gameMode: SimulationMode;
  activeTaskCount: number;
  onModeChange: (mode: SimulationMode) => void;
  onSpeed: (next: SpeedKey) => void;
  autoDirector: boolean;
  onAutoDirector: (value: boolean) => void;
  autoFollow: boolean;
  onAutoFollow: (value: boolean) => void;
  busy: boolean;
  runAction: (action: () => Promise<unknown>) => Promise<unknown>;
  onShowGuide: () => void;
}) {
  const PeriodIcon = period.icon;
  const isStreaming = connectionStatus === "connected";
  return (
    <header className="sticky top-0 z-30 flex min-w-0 flex-col gap-3 border-b border-[rgba(var(--border),0.7)] bg-[rgba(8,12,24,0.92)] px-3 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-4 lg:static lg:py-0">
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
            <span>
              {gameMode === "manual"
                ? activeTaskCount > 0
                  ? `${activeTaskCount} player task running`
                  : "manual waits for a task"
                : speed === "paused"
                  ? "autonomous paused"
                  : `autonomous ${speed}`}
            </span>
          </div>
        </div>
      </div>

      <div className="hidden min-w-0 items-center gap-3 lg:flex">
        <ClockBlock day={day} time={clock} period={period} running={running} icon={PeriodIcon} />
      </div>

      <div className="flex w-full min-w-0 items-center gap-2 overflow-x-auto pb-1 scrollbar-thin sm:w-auto sm:pb-0">
        <ModeControl mode={gameMode} busy={busy} onModeChange={onModeChange} />
        <SpeedControl speed={speed} mode={gameMode} activeTaskCount={activeTaskCount} onSpeed={onSpeed} busy={busy} />
        {gameMode === "autonomous" ? (
          <>
            <button
              className={`btn-pill !hidden shrink-0 sm:!flex ${autoDirector ? "" : ""}`}
              data-active={autoDirector}
              onClick={() => onAutoDirector(!autoDirector)}
              title="Auto Events creates occasional city incidents and celebrations"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Auto Events
            </button>
            <button
              className="btn-pill !hidden shrink-0 sm:!flex"
              data-active={autoFollow}
              onClick={() => onAutoFollow(!autoFollow)}
              title="Follow interesting citizens automatically"
            >
              <UserRound className="h-3.5 w-3.5" />
              Follow Citizen
            </button>
          </>
        ) : null}
        <button className="btn-pill shrink-0" onClick={onShowGuide} title="Show how to play AgentCity">
          <HelpCircle className="h-3.5 w-3.5" />
          How to Play
        </button>
        <Button
          className="shrink-0"
          size="sm"
          variant="ghost"
          disabled={busy || (gameMode === "manual" && activeTaskCount === 0)}
          onClick={() => runAction(api.tick)}
          title={gameMode === "manual" ? "Advance the active player task" : "Advance one 15-minute game tick"}
        >
          <Radio className="h-4 w-4" />
          <span>{gameMode === "manual" ? "Step Task" : "Step 15m"}</span>
        </Button>
      </div>
    </header>
  );
}

function ModeControl({
  mode,
  busy,
  onModeChange,
}: {
  mode: SimulationMode;
  busy: boolean;
  onModeChange: (mode: SimulationMode) => void;
}) {
  const choices: Array<{ mode: SimulationMode; label: string; detail: string; icon: ComponentType<{ className?: string }> }> = [
    { mode: "manual", label: "Manual", detail: "tasks only", icon: MousePointerClick },
    { mode: "autonomous", label: "Auto", detail: "city lives", icon: Sparkles },
  ];

  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full border border-[rgba(var(--border),0.85)] bg-[rgba(var(--panel-strong),0.85)] p-1">
      {choices.map((choice) => {
        const Icon = choice.icon;
        const active = mode === choice.mode;
        return (
          <button
            key={choice.mode}
            disabled={busy}
            onClick={() => onModeChange(choice.mode)}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition ${
              active
                ? "bg-[rgb(var(--accent-2))] text-[#06121f] shadow-[0_4px_14px_rgba(74,222,128,0.28)]"
                : "text-[rgb(var(--muted-strong))] hover:bg-white/5"
            }`}
            title={`${choice.label}: ${choice.detail}`}
          >
            <Icon className="h-3 w-3" />
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}

function SpeedControl({
  speed,
  mode,
  activeTaskCount,
  onSpeed,
  busy,
}: {
  speed: SpeedKey;
  mode: SimulationMode;
  activeTaskCount: number;
  onSpeed: (next: SpeedKey) => void;
  busy: boolean;
}) {
  const choices: Array<{ key: SpeedKey; label: string; icon: ComponentType<{ className?: string }> }> = mode === "manual" ? [
    { key: "paused", label: "Pause", icon: Pause },
    { key: "1x", label: "Run", icon: Play },
  ] : [
    { key: "paused", label: "Pause", icon: Pause },
    { key: "1x", label: "1×", icon: Play },
    { key: "2x", label: "2×", icon: Play },
    { key: "4x", label: "4×", icon: Play },
  ];
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full border border-[rgba(var(--border),0.85)] bg-[rgba(var(--panel-strong),0.85)] p-1">
      {choices.map((choice) => {
        const Icon = choice.icon;
        const active = speed === choice.key;
        return (
          <button
            key={choice.key}
            disabled={busy || (mode === "manual" && choice.key !== "paused" && activeTaskCount === 0)}
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

function MapPanelDock({
  activePanel,
  citizen,
  conversationCount,
  onOpen,
}: {
  activePanel: ActivePanel;
  citizen: CitizenAgent | null;
  conversationCount: number;
  onOpen: (panel: ActivePanel) => void;
}) {
  const controls: Array<{
    panel: Exclude<ActivePanel, null>;
    label: string;
    detail: string;
    icon: ComponentType<{ className?: string }>;
    count?: string;
  }> = [
    { panel: "city", label: "City", detail: "events", icon: Gauge },
    { panel: "citizen", label: "Citizen", detail: citizen?.name ?? "select", icon: UserRound },
    { panel: "story", label: "Talk", detail: "conversations", icon: MessageSquareText, count: String(conversationCount) },
  ];

  return (
    <div className="pointer-events-auto absolute bottom-3 right-3 top-3 z-40 hidden w-[76px] flex-col items-stretch justify-center gap-2 sm:flex">
      {controls.map((control) => {
        const Icon = control.icon;
        const active = activePanel === control.panel;
        return (
          <button
            key={control.panel}
            className={`flex min-h-[76px] flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-center shadow-[0_10px_28px_rgba(0,0,0,0.32)] backdrop-blur transition ${
              active
                ? "border-[rgba(56,189,248,0.7)] bg-[rgba(56,189,248,0.18)]"
                : "border-[rgba(var(--border),0.65)] bg-[rgba(8,12,24,0.72)] hover:bg-[rgba(8,12,24,0.9)]"
            }`}
            onClick={() => onOpen(active ? null : control.panel)}
          >
            <Icon className="h-5 w-5 shrink-0 text-[rgb(var(--accent))]" />
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold leading-tight">{control.label}</span>
              <span className="block max-w-[60px] truncate font-mono text-[8px] uppercase tracking-wide text-[rgb(var(--muted))]">
                {control.detail}
              </span>
            </span>
            {control.count ? <Badge className="px-1.5 py-0 text-[9px]" tone="accent">{control.count}</Badge> : null}
          </button>
        );
      })}
    </div>
  );
}

function GameDrawer({
  id,
  title,
  subtitle,
  icon: Icon,
  side,
  onClose,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  side: "left" | "right" | "bottom";
  onClose: () => void;
  children: ReactNode;
}) {
  const sideClass =
    side === "left"
      ? "lg:left-3 lg:right-auto lg:top-3 lg:bottom-3 lg:w-[360px]"
      : side === "right"
        ? "lg:left-auto lg:right-[92px] lg:top-3 lg:bottom-3 lg:w-[420px]"
        : "lg:left-3 lg:right-[92px] lg:top-auto lg:bottom-3 lg:h-[44dvh] lg:min-h-[300px] lg:max-h-[520px] lg:w-auto";

  return (
    <aside
      id={id}
      className={`fixed inset-x-2 bottom-20 z-50 flex max-h-[74dvh] min-h-0 flex-col overflow-hidden rounded-2xl border border-[rgba(var(--border),0.88)] bg-[rgba(8,12,24,0.95)] shadow-[0_28px_80px_rgba(0,0,0,0.62)] backdrop-blur-xl lg:absolute lg:inset-x-auto lg:max-h-none ${sideClass}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[rgba(var(--border),0.7)] px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgba(56,189,248,0.16)] text-[rgb(var(--accent))]">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{title}</div>
            <div className="truncate font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">
              {subtitle}
            </div>
          </div>
        </div>
        <button className="btn-pill px-2 py-2" onClick={onClose} title="Close panel">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {children}
      </div>
    </aside>
  );
}

function MobileCitizenControls({
  citizen,
  busy,
  runAction,
  gameMode,
  activeTaskCount,
  onPrevious,
  onNext,
  onOpenProfile,
}: {
  citizen: CitizenAgent | null;
  busy: boolean;
  runAction: (action: () => Promise<unknown>) => Promise<unknown>;
  gameMode: SimulationMode;
  activeTaskCount: number;
  onPrevious: () => void;
  onNext: () => void;
  onOpenProfile: () => void;
}) {
  return (
    <div className="glass-panel order-2 scroll-mt-24 rounded-xl p-3 lg:hidden">
      <div className="mb-3 flex items-center gap-3">
        {citizen ? <CitizenAvatar citizen={citizen} small /> : <UserRound className="h-8 w-8 text-[rgb(var(--accent))]" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{citizen?.name ?? "Choose a citizen"}</div>
          <div className="truncate text-xs text-[rgb(var(--muted))]">
            {citizen ? `${citizen.profession} · ${citizen.current_activity}` : "Tap a person or use Next Citizen"}
          </div>
        </div>
        <Badge tone={citizen?.health && citizen.health < 65 ? "warning" : "accent"}>
          {citizen ? `${Math.round(citizen.happiness)}%` : "ready"}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" onClick={onPrevious}>
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button variant="secondary" size="sm" onClick={onNext}>
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          className="col-span-1"
          variant="default"
          size="sm"
          disabled={busy || (gameMode === "manual" && activeTaskCount === 0)}
          onClick={() => runAction(api.tick)}
        >
          <Radio className="h-4 w-4" />
          {gameMode === "manual" ? "Step Task" : "Step 15m"}
        </Button>
        <button className="btn-pill justify-center py-2.5 text-center" onClick={onOpenProfile}>
          Open Profile
        </button>
      </div>
    </div>
  );
}

function MobilePlayDock({
  activePanel,
  onOpen,
}: {
  activePanel: ActivePanel;
  onOpen: (panel: ActivePanel) => void;
}) {
  const items: Array<{ panel: ActivePanel; label: string; icon: ComponentType<{ className?: string }> }> = [
    { panel: null, label: "Map", icon: MapPin },
    { panel: "citizen", label: "Student", icon: UserRound },
    { panel: "city", label: "City", icon: Gauge },
    { panel: "story", label: "Talk", icon: MessageSquareText },
  ];
  return (
    <nav className="fixed inset-x-2 bottom-3 z-40 grid grid-cols-4 gap-1 rounded-2xl border border-[rgba(var(--border),0.9)] bg-[rgba(8,12,24,0.94)] p-1.5 shadow-[0_16px_42px_rgba(0,0,0,0.55)] backdrop-blur lg:hidden">
      {items.map((item) => {
        const Icon = item.icon;
        const active = activePanel === item.panel;
        return (
          <button
            key={item.label}
            className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium transition ${
              active ? "bg-[rgba(56,189,248,0.16)] text-[rgb(var(--foreground))]" : "text-[rgb(var(--muted-strong))] hover:bg-white/5"
            }`}
            onClick={() => onOpen(item.panel)}
          >
            <Icon className="h-4 w-4 text-[rgb(var(--accent))]" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

function HowToPlayOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="scrollbar-thin absolute left-2 right-2 top-2 z-20 max-h-[calc(100%-24px)] overflow-y-auto rounded-2xl border border-[rgba(var(--accent),0.55)] bg-[rgba(8,12,24,0.93)] p-3 shadow-[0_24px_60px_rgba(0,0,0,0.55)] backdrop-blur sm:left-4 sm:right-auto sm:top-4 sm:max-h-[calc(100%-92px)] sm:max-w-[430px] sm:p-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold">
            <HelpCircle className="h-5 w-5 text-[rgb(var(--accent))]" />
            How to play AgentCity
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[rgb(var(--muted-strong))]">
            Start in Manual to give one student a task and follow the result. Switch to Auto when you want the students to live, talk, and react on their own.
          </p>
        </div>
        <button className="btn-pill px-2 py-1" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="grid gap-2 text-xs">
        <HowToRow icon={MousePointerClick} title="Manual mode" body="The city waits. Assign a task, run it, then it pauses when the task is complete." />
        <HowToRow icon={Play} title="Autonomous mode" body="Students follow routines, meet naturally, talk, remember, and form friendships while time runs." />
        <HowToRow icon={MousePointerClick} title="Tap a student" body="The citizen drawer shows their thought, mood, money, needs, schedule, goals, memories, relationships, and conversations." />
        <HowToRow icon={Target} title="Give a task" body="Choose a conversation target, ask a student to talk or study, then open Talk to read what happened." />
        <HowToRow icon={MessageSquareText} title="Read the talk tab" body="Conversations show what two students discussed and whether they are strangers, acquaintances, friends, or trusted friends." />
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
            className={`flex min-h-14 w-full items-center gap-2 rounded-lg border px-2 py-2.5 text-left transition-all ${
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

function CitizenSwitcher({
  citizens,
  selectedCitizenId,
  onSelect,
}: {
  citizens: CitizenAgent[];
  selectedCitizenId: string;
  onSelect: (citizenId: string) => void;
}) {
  return (
    <div className="mb-3 rounded-xl border border-[rgba(var(--border),0.82)] bg-black/20 p-2">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted-strong))]">
          <Users className="h-3.5 w-3.5 text-[rgb(var(--accent))]" />
          Students
        </div>
        <Badge tone="accent">{citizens.length}</Badge>
      </div>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {citizens.map((citizen) => {
          const task = playerTaskFor(citizen);
          const active = citizen.citizen_id === selectedCitizenId;
          return (
            <button
              key={citizen.citizen_id}
              className={`flex min-h-12 items-center gap-2 rounded-lg border px-2 py-2 text-left transition ${
                active
                  ? "border-[rgba(56,189,248,0.68)] bg-[rgba(56,189,248,0.13)]"
                  : "border-[rgba(var(--border-soft),0.35)] bg-black/15 hover:border-[rgba(var(--accent),0.7)]"
              }`}
              onClick={() => onSelect(citizen.citizen_id)}
            >
              <CitizenAvatar citizen={citizen} small />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">{citizen.name}</span>
                <span className="block truncate font-mono text-[9px] uppercase tracking-wide text-[rgb(var(--muted))]">
                  {task?.status === "active" ? "task active" : relationshipShort(citizen)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SceneOverlay({
  citizen,
  city,
  event,
  hover,
  gameMode,
  activeTaskCount,
}: {
  citizen: CitizenAgent | null;
  city: CityState | null;
  event: CityEvent | null;
  hover: HoverInfo;
  gameMode: SimulationMode;
  activeTaskCount: number;
}) {
  const statusText =
    gameMode === "manual"
      ? activeTaskCount > 0
        ? `${activeTaskCount} manual task active`
        : "Manual mode: assign a task"
      : city?.clock.running
        ? "Autonomous city running"
        : "Autonomous paused";
  return (
    <>
      <div className="pointer-events-none absolute left-2 right-2 top-2 z-10 rounded-xl border border-[rgba(var(--border),0.62)] bg-[rgba(8,12,24,0.72)] p-2 shadow-2xl backdrop-blur sm:left-3 sm:right-auto sm:top-3 sm:max-w-[390px]">
        <div className="mb-1 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">
            <Route className="h-3.5 w-3.5" />
            Live focus
          </div>
          <Badge tone={gameMode === "manual" && activeTaskCount === 0 ? "warning" : city?.clock.running ? "success" : "default"}>
            {statusText}
          </Badge>
        </div>
        <div className="line-clamp-1 text-sm font-semibold leading-snug">
          {citizen ? `${citizen.name} is ${citizen.current_activity.toLowerCase()}` : "Navora is loading"}
        </div>
        <p className="mt-1 line-clamp-1 text-xs leading-snug text-[rgb(var(--muted))] sm:line-clamp-2">
          {citizen?.current_thought ??
            (gameMode === "manual"
              ? "Manual mode stays still until you assign a task to a student."
              : "Citizens move, work, react, remember, and form plans as the simulation runs.")}
        </p>
        {event ? (
          <div className="mt-2 hidden items-start gap-2 rounded-lg bg-black/25 p-2 sm:flex">
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
    <div className="absolute bottom-2 left-2 right-2 hidden gap-1.5 overflow-x-auto rounded-xl border border-[rgba(var(--border),0.7)] bg-[rgba(8,12,24,0.82)] p-2 backdrop-blur scrollbar-thin sm:flex">
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
  gameMode,
  runAction,
}: {
  busy: boolean;
  city: CityState | null;
  gameMode: SimulationMode;
  runAction: (action: () => Promise<unknown>) => Promise<unknown>;
}) {
  const manualMode = gameMode === "manual";
  return (
    <div className="mt-4 space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted-strong))]">Make Something Happen</h2>
          <Badge tone={manualMode ? "default" : "warning"}>
            {manualMode ? "auto only" : "agents react"}
          </Badge>
        </div>
        <p className="text-xs leading-snug text-[rgb(var(--muted))]">
          {manualMode
            ? "Manual mode keeps the city quiet. Switch to Auto when you want festivals, outbreaks, and policy-wide reactions."
            : "Pick an event to test the city. Citizens will move, think, talk, remember, and update relationships."}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {eventButtons.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.event_type}
                variant={item.tone}
                size="sm"
                className="min-h-12 justify-start px-2 py-2 text-left"
                disabled={busy || manualMode}
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
          <PolicyButton busy={busy || manualMode} label="Hospital" icon={HeartPulse} onClick={() => runAction(() => api.applyPolicy({ hospital_budget: 72 }))} />
          <PolicyButton busy={busy || manualMode} label="School" icon={BookOpen} onClick={() => runAction(() => api.applyPolicy({ school_budget: 70 }))} />
          <PolicyButton busy={busy || manualMode} label="Roads" icon={Bus} onClick={() => runAction(() => api.applyPolicy({ road_budget: 72 }))} />
          <PolicyButton busy={busy || manualMode} label="Health Push" icon={Stethoscope} onClick={() => runAction(() => api.applyPolicy({ public_health_campaign: true }))} />
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
    <Button className="min-h-11" variant="secondary" size="sm" disabled={busy} onClick={onClick}>
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
  busy,
  runAction,
  onRefreshCitizen,
  citizens,
  gameMode,
  onTaskAssigned,
}: {
  citizen: CitizenAgent;
  memories: Memory[];
  relationships: Relationship[];
  conversations: Conversation[];
  citizenNames: Record<string, string>;
  locationById: Record<string, Location>;
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  busy: boolean;
  runAction: (action: () => Promise<unknown>) => Promise<unknown>;
  onRefreshCitizen: () => Promise<void>;
  citizens: CitizenAgent[];
  gameMode: SimulationMode;
  onTaskAssigned: (state: CityState) => void;
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

      <AssignTaskPanel
        key={citizen.citizen_id}
        citizen={citizen}
        locations={Object.values(locationById)}
        busy={busy}
        runAction={runAction}
        onRefreshCitizen={onRefreshCitizen}
        citizens={citizens}
        gameMode={gameMode}
        onTaskAssigned={onTaskAssigned}
      />

      <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/30 p-1">
        <InspectorTabButton active={tab === "life"} icon={Gauge} label="Life" onClick={() => onTab("life")} />
        <InspectorTabButton active={tab === "memory"} icon={Brain} label="Memory" onClick={() => onTab("memory")} />
        <InspectorTabButton active={tab === "social"} icon={MessageCircle} label="Talk" onClick={() => onTab("social")} />
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

function AssignTaskPanel({
  citizen,
  locations,
  busy,
  runAction,
  onRefreshCitizen,
  citizens,
  gameMode,
  onTaskAssigned,
}: {
  citizen: CitizenAgent;
  locations: Location[];
  busy: boolean;
  runAction: (action: () => Promise<unknown>) => Promise<unknown>;
  onRefreshCitizen: () => Promise<void>;
  citizens: CitizenAgent[];
  gameMode: SimulationMode;
  onTaskAssigned: (state: CityState) => void;
}) {
  const [task, setTask] = useState("");
  const [locationId, setLocationId] = useState(citizen.current_location_id);
  const [targetCitizenId, setTargetCitizenId] = useState<string | null>(null);
  const playerTask = playerTaskFor(citizen);
  const targetCitizen = citizens.find((item) => item.citizen_id === targetCitizenId) ?? null;
  const locationsById = useMemo(
    () => Object.fromEntries(locations.map((location) => [location.location_id, location])),
    [locations],
  );
  const otherCitizens = useMemo(
    () => citizens.filter((item) => item.citizen_id !== citizen.citizen_id),
    [citizen.citizen_id, citizens],
  );
  const locationChoices = useMemo(() => {
    const preferred = ["loc_school", "loc_library", "loc_park", "loc_market", "loc_homes"];
    const picked = preferred
      .map((id) => locationsById[id])
      .filter((location): location is Location => Boolean(location));
    const current = locationsById[citizen.current_location_id];
    if (current && !picked.some((location) => location.location_id === current.location_id)) {
      picked.unshift(current);
    }
    return picked;
  }, [citizen.current_location_id, locationsById]);
  const targetName = targetCitizen?.name.split(" ")[0] ?? "a classmate";
  const quickTasks = [
    `Talk with ${targetName} about today`,
    `Study with ${targetName} at the library`,
    `Ask ${targetName} how they are feeling`,
    `Invite ${targetName} to the park`,
  ];

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = task.trim();
    if (!trimmed) return;
    const result = await runAction(() =>
      api.assignTask(citizen.citizen_id, {
        task: trimmed,
        location_id: locationId,
        target_citizen_id: targetCitizenId,
        duration_ticks: 6,
      }),
    );
    if (result && typeof result === "object" && "city_id" in result) {
      onTaskAssigned(result as CityState);
    }
    await onRefreshCitizen();
    setTask("");
  }

  async function closeTask() {
    const result = await runAction(() => api.closeTask(citizen.citizen_id));
    if (result && typeof result === "object" && "city_id" in result) {
      onTaskAssigned(result as CityState);
    }
    await onRefreshCitizen();
  }

  return (
    <form
      className="rounded-xl border border-[rgba(var(--accent),0.45)] bg-[rgba(56,189,248,0.08)] p-3"
      onSubmit={submitTask}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Target className="h-4 w-4 text-[rgb(var(--accent))]" />
            Give {citizen.name.split(" ")[0]} a task
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-[rgb(var(--muted))]">
            {gameMode === "manual"
              ? "Manual mode runs only this kind of player task, then pauses when it is complete."
              : "Tasks become goals, memories, and conversation triggers while the city keeps living."}
          </p>
        </div>
        <Badge tone={playerTask?.status === "active" ? "success" : playerTask ? "violet" : "default"}>
          {playerTask?.status === "active" ? "active" : playerTask?.status === "completed" ? "completed" : "ready"}
        </Badge>
      </div>

      {playerTask ? (
        <div className="mb-2 rounded-lg border border-[rgba(var(--border),0.72)] bg-black/20 p-2 text-xs">
          <div className="mb-0.5 font-mono text-[9px] uppercase tracking-wide text-[rgb(var(--muted))]">
            {playerTask.status === "active" ? "Current player task" : "Last player task"}
          </div>
          <div className="leading-snug">{playerTask.task}</div>
          <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">
            <MapPin className="h-3 w-3" />
            {locationsById[playerTask.location_id ?? ""]?.name ?? "Current location"}
          </div>
          {playerTask.status === "active" ? (
            <Button
              type="button"
              className="mt-2 w-full"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={closeTask}
            >
              <X className="h-4 w-4" />
              Close Task
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="mb-2">
        <div className="mb-1 font-mono text-[9px] uppercase tracking-wide text-[rgb(var(--muted))]">
          Conversation target
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
          <button
            type="button"
            className="btn-pill shrink-0"
            data-active={!targetCitizenId}
            onClick={() => setTargetCitizenId(null)}
          >
            Anyone nearby
          </button>
          {otherCitizens.map((other) => (
            <button
              key={other.citizen_id}
              type="button"
              className="btn-pill shrink-0"
              data-active={targetCitizenId === other.citizen_id}
              onClick={() => {
                setTargetCitizenId(other.citizen_id);
                setLocationId(other.current_location_id);
              }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: moodHex(other) }} />
              {other.name.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-2 flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
        {quickTasks.map((quickTask) => (
          <button
            key={quickTask}
            type="button"
            className="btn-pill shrink-0"
            onClick={() => setTask(quickTask)}
          >
            {quickTask}
          </button>
        ))}
      </div>

      <textarea
        value={task}
        onChange={(event) => setTask(event.target.value)}
        maxLength={240}
        rows={3}
        className="min-h-[76px] w-full resize-none rounded-lg border border-[rgba(var(--border),0.85)] bg-[rgba(8,12,24,0.72)] px-3 py-2 text-sm leading-snug outline-none transition focus:border-[rgba(var(--accent),0.8)]"
        placeholder="Example: Ask Iris if she wants to study together, then remember how she responds."
      />

      <div className="mt-2 flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
        {locationChoices.map((location) => (
          <button
            key={location.location_id}
            type="button"
            className="btn-pill shrink-0"
            data-active={locationId === location.location_id}
            onClick={() => setLocationId(location.location_id)}
          >
            {locationIcon(location.type)}
            {location.name}
          </button>
        ))}
      </div>

      <Button
        className="mt-2 w-full"
        type="submit"
        size="sm"
        disabled={busy || task.trim().length < 3}
      >
        <Target className="h-4 w-4" />
        Assign Task
      </Button>
    </form>
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
      className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs transition ${
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
  const visibleGoals = [...new Set([...citizen.short_term_goals, ...citizen.long_term_goals.slice(0, 2)])];

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

      <SectionTitle label="Goals" count={visibleGoals.length} />
      <div className="space-y-1">
        {visibleGoals.map((goal, index) => (
          <div key={`${goal}-${index}`} className="story-card rounded-md px-2 py-1.5 text-xs">
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
      <SectionTitle label="Recent conversations" count={conversations.length} />
      <div className="space-y-2">
        {conversations.slice(0, 5).map((conversation) => {
          const speakers = conversation.actor_ids
            .map((actorId) => citizenNames[actorId] ?? actorId)
            .join(" and ");
          return (
            <div key={conversation.conversation_id} className="story-card rounded-md p-2 text-xs">
              <div className="mb-1 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">
                <span className="truncate">{speakers || "Conversation"}</span>
                <span className="shrink-0">Day {conversation.game_day} · {minutesLabel(conversation.game_minute)}</span>
              </div>
              <p className="mb-2 leading-snug text-[rgb(var(--muted-strong))]">{conversation.summary}</p>
              <div className="space-y-1.5">
                {conversation.transcript.slice(0, 6).map((line, index) => (
                  <div
                    key={`${conversation.conversation_id}-${index}`}
                    className="rounded-lg border border-[rgba(var(--border-soft),0.8)] bg-black/20 p-2"
                  >
                    <div className="mb-0.5 font-mono text-[9px] uppercase tracking-wide text-[rgb(var(--accent))]">
                      {citizenNames[line.speaker_id] ?? line.speaker_id}
                    </div>
                    <div className="leading-snug">{line.text}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {conversations.length === 0 ? (
          <EmptyLine text="No conversations yet. Keep auto mode on, assign a talk task, or step the city forward." />
        ) : null}
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
    </div>
  );
}

function ConversationFeed({
  conversations,
  city,
  timeline,
  gameMode,
  activeTasks,
  onSelectCitizen,
}: {
  conversations: Conversation[];
  city: CityState | null;
  timeline: TimelineItem[];
  gameMode: SimulationMode;
  activeTasks: Array<{ citizen: CitizenAgent; task: PlayerTask }>;
  onSelectCitizen: (citizenId: string) => void;
}) {
  const citizenById = useMemo(
    () => Object.fromEntries(city?.citizens.map((citizen) => [citizen.citizen_id, citizen]) ?? []),
    [city?.citizens],
  );
  const locationById = useMemo(
    () => Object.fromEntries(city?.locations.map((location) => [location.location_id, location]) ?? []),
    [city?.locations],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[rgba(var(--accent),0.35)] bg-[rgba(56,189,248,0.08)] p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {gameMode === "manual" ? <MousePointerClick className="h-4 w-4 text-[rgb(var(--accent))]" /> : <Sparkles className="h-4 w-4 text-[rgb(var(--accent))]" />}
            {gameMode === "manual" ? "Manual Follow Mode" : "Autonomous City Mode"}
          </div>
          <Badge tone={activeTasks.length > 0 ? "success" : "default"}>
            {activeTasks.length > 0 ? `${activeTasks.length} task active` : "no active task"}
          </Badge>
        </div>
        <p className="text-xs leading-relaxed text-[rgb(var(--muted-strong))]">
          {gameMode === "manual"
            ? "Manual mode is easiest to follow: assign one task, read the conversation here, then the task closes and the city pauses."
            : "Autonomous mode lets the students create their own moments. Use this feed as the readable transcript of what they are saying."}
        </p>
        {activeTasks.length > 0 ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {activeTasks.map(({ citizen, task }) => (
              <button
                key={citizen.citizen_id}
                className="rounded-lg border border-[rgba(var(--border-soft),0.85)] bg-black/20 p-2 text-left text-xs hover:border-[rgba(var(--accent),0.75)]"
                onClick={() => onSelectCitizen(citizen.citizen_id)}
              >
                <div className="mb-1 font-semibold">{citizen.name}</div>
                <div className="line-clamp-2 text-[rgb(var(--muted-strong))]">{task.task}</div>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {conversations[0] ? (
        <FeaturedConversation
          conversation={conversations[0]}
          citizenById={citizenById}
          locationById={locationById}
          onSelectCitizen={onSelectCitizen}
        />
      ) : null}

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-[rgb(var(--accent))]" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted-strong))]">
              Conversations
            </h2>
            <Badge tone="accent">{conversations.length}</Badge>
          </div>
          <div className="hidden text-[10px] uppercase tracking-wide text-[rgb(var(--muted))] sm:block">
            newest first
          </div>
        </div>

        <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
          {conversations.slice(conversations[0] ? 1 : 0, 10).map((conversation) => {
            const speakers = conversation.actor_ids.map((actorId) => citizenById[actorId]).filter(Boolean);
            const locationName = conversation.location_id
              ? locationById[conversation.location_id]?.name ?? conversation.location_id
              : "City";
            const stage = conversationRelationshipStage(conversation, citizenById);

            return (
              <article key={conversation.conversation_id} className="story-card rounded-xl p-3">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      {speakers.map((speaker) => (
                        <button
                          key={speaker.citizen_id}
                          className="inline-flex max-w-[9rem] items-center gap-1 rounded-full border border-[rgba(var(--border),0.8)] bg-black/20 px-2 py-1 text-left text-[11px] font-semibold hover:border-[rgba(var(--accent),0.75)]"
                          onClick={() => onSelectCitizen(speaker.citizen_id)}
                          title={`Open ${speaker.name}`}
                        >
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: moodHex(speaker) }} />
                          <span className="truncate">{speaker.name.split(" ")[0]}</span>
                        </button>
                      ))}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">
                      <span>Day {conversation.game_day}</span>
                      <span>{minutesLabel(conversation.game_minute)}</span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {locationName}
                      </span>
                    </div>
                  </div>
                  <Badge tone={stage === "friend" || stage === "trusted friend" ? "success" : "default"}>
                    {stage}
                  </Badge>
                </div>

                <p className="mb-2 text-xs leading-relaxed text-[rgb(var(--muted-strong))]">
                  {conversation.summary}
                </p>

                <div className="space-y-1.5">
                  {conversation.transcript.slice(0, 8).map((line, index) => {
                    const speaker = citizenById[line.speaker_id];
                    return (
                      <div
                        key={`${conversation.conversation_id}-${index}`}
                        className="rounded-lg border border-[rgba(var(--border-soft),0.75)] bg-black/20 p-2"
                      >
                        <div className="mb-0.5 text-[10px] font-semibold text-[rgb(var(--accent))]">
                          {speaker?.name ?? line.speaker_id}
                        </div>
                        <div className="text-xs leading-snug">{line.text}</div>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}

          {conversations.length === 0 ? (
            <div className="rounded-xl border border-[rgba(var(--border),0.85)] bg-black/20 p-4 text-sm leading-relaxed text-[rgb(var(--muted-strong))] lg:col-span-2 xl:col-span-3">
              No conversations yet. Assign a task like “Talk to Iris about today” or trigger a school exam,
              then step time forward.
            </div>
          ) : null}
        </div>
      </div>

      <StoryTimeline timeline={timeline} compact />
    </div>
  );
}

function FeaturedConversation({
  conversation,
  citizenById,
  locationById,
  onSelectCitizen,
}: {
  conversation: Conversation;
  citizenById: Record<string, CitizenAgent | undefined>;
  locationById: Record<string, Location | undefined>;
  onSelectCitizen: (citizenId: string) => void;
}) {
  const speakers = conversation.actor_ids
    .map((actorId) => citizenById[actorId])
    .filter((speaker): speaker is CitizenAgent => Boolean(speaker));
  const locationName = conversation.location_id
    ? locationById[conversation.location_id]?.name ?? conversation.location_id
    : "City";
  const stage = conversationRelationshipStage(conversation, citizenById);

  return (
    <article className="rounded-xl border border-[rgba(var(--accent),0.5)] bg-[rgba(56,189,248,0.1)] p-3 shadow-[0_12px_36px_rgba(56,189,248,0.12)]">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <MessageSquareText className="h-4 w-4 text-[rgb(var(--accent))]" />
            Latest Conversation
          </div>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">
            <span>Day {conversation.game_day}</span>
            <span>{minutesLabel(conversation.game_minute)}</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {locationName}
            </span>
            <span>{stage}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {speakers.map((speaker) => (
            <button
              key={speaker.citizen_id}
              className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(var(--border),0.8)] bg-black/25 px-2 py-1 text-xs font-semibold hover:border-[rgba(var(--accent),0.75)]"
              onClick={() => onSelectCitizen(speaker.citizen_id)}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: moodHex(speaker) }} />
              {speaker.name.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-3 text-sm leading-relaxed text-[rgb(var(--muted-strong))]">
        {conversation.summary}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {conversation.transcript.slice(0, 8).map((line, index) => {
          const speaker = citizenById[line.speaker_id];
          return (
            <div
              key={`${conversation.conversation_id}-featured-${index}`}
              className="rounded-lg border border-[rgba(var(--border-soft),0.78)] bg-black/20 p-2"
            >
              <div className="mb-1 text-[11px] font-semibold text-[rgb(var(--accent))]">
                {speaker?.name ?? line.speaker_id}
              </div>
              <div className="text-xs leading-relaxed">{line.text}</div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function StoryTimeline({ timeline, compact = false }: { timeline: TimelineItem[]; compact?: boolean }) {
  return (
    <div className="z-10">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GalleryHorizontalEnd className="h-4 w-4 text-[rgb(var(--accent))]" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted-strong))]">What Just Happened</h2>
          <Badge tone="accent">{timeline.length}</Badge>
        </div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">
          <TrendingUp className="h-3.5 w-3.5" />
          Newest first · tap citizens to see what they remember
        </div>
      </div>
      <div
        className={`grid grid-cols-1 gap-2 sm:grid-cols-2 ${
          compact ? "lg:grid-cols-3 xl:grid-cols-4" : "max-h-[320px] overflow-y-auto scrollbar-thin lg:max-h-[210px] lg:grid-cols-4"
        }`}
      >
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
          <div className="flex items-center justify-center text-xs text-[rgb(var(--muted))] sm:col-span-2 lg:col-span-4">
            Waiting for the first story…
          </div>
        ) : null}
      </div>
    </div>
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

function playerTaskFor(citizen: CitizenAgent): PlayerTask | null {
  const rawTask = citizen.personality?.player_task;
  if (!rawTask || typeof rawTask !== "object") return null;
  const taskData = rawTask as Record<string, unknown>;
  const task = typeof taskData.task === "string" ? taskData.task : "";
  if (!task) return null;
  return {
    task,
    status: typeof taskData.status === "string" ? taskData.status : "active",
    location_id: typeof taskData.location_id === "string" ? taskData.location_id : null,
    target_citizen_id: typeof taskData.target_citizen_id === "string" ? taskData.target_citizen_id : null,
  };
}

function activePlayerTaskCount(citizens: CitizenAgent[]) {
  return citizens.filter((citizen) => playerTaskFor(citizen)?.status === "active").length;
}

function relationshipShort(citizen: CitizenAgent) {
  const friendCount = citizen.friend_ids.length;
  if (friendCount > 0) return `${friendCount} friend${friendCount === 1 ? "" : "s"}`;
  const knownCount = Object.values(citizen.relationship_scores).filter((score) => score >= 35).length;
  return `${knownCount} known`;
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

function conversationRelationshipStage(
  conversation: Conversation,
  citizenById: Record<string, CitizenAgent | undefined>,
) {
  const [firstId, secondId] = conversation.actor_ids;
  const score = firstId && secondId ? citizenById[firstId]?.relationship_scores?.[secondId] : undefined;
  if (typeof score !== "number") return "new talk";
  if (score >= 72) return "trusted friend";
  if (score >= 58) return "friend";
  if (score >= 35) return "acquaintance";
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
