"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import {
  Activity,
  AlertTriangle,
  Banknote,
  BookOpen,
  Brain,
  BriefcaseBusiness,
  Bus,
  CalendarClock,
  CircleDollarSign,
  Gamepad2,
  Gauge,
  HeartPulse,
  Home,
  MapPin,
  MessageCircle,
  Pause,
  Play,
  Radio,
  Route,
  Shield,
  Sparkles,
  Stethoscope,
  Store,
  UserRound,
  Users,
  Wheat,
  Zap,
} from "lucide-react";

import { GameCanvas } from "@/components/game/GameCanvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
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

type Tone = "accent" | "warning" | "danger" | "water";
type InspectorTab = "life" | "memory" | "social";

const eventButtons: Array<{
  label: string;
  detail: string;
  event_type: TriggerEventPayload["event_type"];
  icon: ComponentType<{ className?: string }>;
  tone: "default" | "secondary" | "danger";
}> = [
  { label: "Flu Outbreak", detail: "Health system stress test", event_type: "flu_outbreak", icon: Stethoscope, tone: "danger" },
  { label: "Traffic Accident", detail: "Police and driver response", event_type: "traffic_accident", icon: Bus, tone: "secondary" },
  { label: "Food Shortage", detail: "Farm, market, and prices", event_type: "food_shortage", icon: Activity, tone: "secondary" },
  { label: "School Exam", detail: "Students and teacher pressure", event_type: "school_exam", icon: CalendarClock, tone: "secondary" },
  { label: "City Festival", detail: "Social mood surge", event_type: "city_festival", icon: Sparkles, tone: "default" },
  { label: "Bank Policy", detail: "Loans and business money", event_type: "bank_policy_change", icon: Banknote, tone: "secondary" },
  { label: "Power Outage", detail: "Engineer emergency route", event_type: "power_outage", icon: Zap, tone: "danger" },
];

const systemRows = [
  { key: "city_health", label: "City Health", icon: HeartPulse, tone: "accent" as const },
  { key: "economy_status", label: "Local Economy", icon: Banknote, tone: "warning" as const },
  { key: "education_status", label: "Education", icon: BookOpen, tone: "water" as const },
  { key: "traffic_status", label: "Traffic Flow", icon: Bus, tone: "accent" as const },
];

const professionFilters = ["All", "Doctor", "Teacher", "Student", "Engineer", "Driver", "Shopkeeper", "Farmer", "Mayor"];

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
  const [autoTick, setAutoTick] = useState(false);
  const [professionFilter, setProfessionFilter] = useState("All");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("life");
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    loadInitialState();
    socketRef.current = connectWebSocket();
    return () => socketRef.current?.close();
  }, [connectWebSocket, loadInitialState]);

  useEffect(() => {
    if (!autoTick || !city?.clock.running) return;
    const interval = window.setInterval(async () => {
      try {
        const next = await api.tick();
        setCity(next);
      } catch {
        setAutoTick(false);
      }
    }, 1800);
    return () => window.clearInterval(interval);
  }, [autoTick, city?.clock.running, setCity]);

  useEffect(() => {
    if (!city || selectedCitizenId || !city.citizens[0]) return;
    selectCitizen(city.citizens[0].citizen_id);
  }, [city, selectedCitizenId, selectCitizen]);

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

  const clockLabel = city ? minutesLabel(city.clock.minute_of_day) : "--:--";

  return (
    <main className="agentcity-shell grid h-[100dvh] w-screen grid-rows-[76px_1fr_210px] overflow-hidden text-[rgb(var(--foreground))]">
      <header className="glass-panel z-10 flex min-w-0 items-center justify-between rounded-none border-x-0 border-t-0 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[rgb(var(--accent))] text-black shadow-[0_0_24px_rgba(108,190,134,0.26)]">
            <Gamepad2 className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-normal">AgentCity</h1>
              <Badge className="border-[rgba(var(--accent),0.8)] bg-[rgba(var(--accent),0.12)] text-[rgb(var(--accent))]">
                intelligent city sim
              </Badge>
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-2 font-mono text-xs text-[rgb(var(--muted))]">
              <span>{city?.city_name ?? "Navora"}</span>
              <span>/</span>
              <span>{connectionStatus === "connected" ? "live stream" : "REST tick sync"}</span>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-4">
          <ClockBlock day={city?.clock.day ?? 1} time={clockLabel} running={Boolean(city?.clock.running)} />
          <div className="hidden items-center gap-3 2xl:flex">
            <Metric label="People" value={city?.metrics.population ?? 0} plain icon={Users} />
            <Metric label="Happy" value={city?.metrics.average_happiness ?? 0} icon={Sparkles} />
            <Metric label="Health" value={city?.metrics.city_health ?? 0} icon={HeartPulse} />
            <Metric label="Sick" value={city?.metrics.sick_count ?? 0} plain icon={AlertTriangle} />
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={city?.clock.running ? "secondary" : "default"}
              disabled={busy}
              onClick={() => runAction(() => (city?.clock.running ? api.pause() : api.start()))}
            >
              {city?.clock.running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {city?.clock.running ? "Pause" : "Start City"}
            </Button>
            <Button
              size="sm"
              variant={autoTick ? "default" : "secondary"}
              disabled={busy}
              onClick={() => {
                const next = !autoTick;
                setAutoTick(next);
                if (next && !city?.clock.running) {
                  void runAction(api.start);
                }
              }}
            >
              <Sparkles className="h-4 w-4" />
              Auto Mode
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => runAction(api.tick)}>
              <Radio className="h-4 w-4" />
              Tick
            </Button>
          </div>
        </div>
      </header>

      <section className="grid min-h-0 grid-cols-[280px_minmax(430px,1fr)_360px] gap-3 p-3">
        <aside className="glass-panel min-h-0 overflow-y-auto rounded-lg p-3 scrollbar-thin">
          <MayorBriefing city={city} selectedCitizen={selectedCitizen ?? null} activeEvent={activeEvent} />
          <Separator />
          <CitySystems city={city} />
          <Separator />
          <CitizenRoster
            citizens={visibleCitizens}
            totalCitizens={city?.citizens.length ?? 0}
            selectedCitizenId={selectedCitizen?.citizen_id ?? null}
            professionFilter={professionFilter}
            onFilter={setProfessionFilter}
            onSelect={selectCitizen}
          />
        </aside>

        <div className="glass-panel relative min-h-0 overflow-hidden rounded-lg bg-[#101516]">
          <GameCanvas
            city={city}
            selectedCitizenId={selectedCitizen?.citizen_id ?? null}
            onSelectCitizen={(citizenId) => selectCitizen(citizenId)}
          />
          <MapSceneOverlay citizen={selectedCitizen ?? null} city={city} event={activeEvent} />
          <LocationDock locations={city?.locations ?? []} />
        </div>

        <aside className="glass-panel min-h-0 overflow-y-auto rounded-lg p-4 scrollbar-thin">
          {error ? <div className="mb-3 rounded-md border border-[rgb(var(--danger))] p-3 text-sm">{error}</div> : null}
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

          <Separator />
          <ActionPanel busy={busy} city={city} runAction={runAction} />
        </aside>
      </section>

      <StoryTimeline timeline={timeline} autoTick={autoTick} onAutoTick={setAutoTick} />
    </main>
  );
}

function ClockBlock({ day, time, running }: { day: number; time: string; running: boolean }) {
  return (
    <div className="rounded-lg border border-[rgb(var(--border))] bg-black/20 px-4 py-2">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase text-[rgb(var(--muted))]">
        <CalendarClock className="h-3.5 w-3.5" />
        Day {day}
      </div>
      <div className="mt-0.5 flex items-end gap-2">
        <div className="font-mono text-2xl leading-none">{time}</div>
        <div className={`mb-0.5 h-2 w-2 rounded-full ${running ? "bg-[rgb(var(--accent))]" : "bg-[rgb(var(--muted))]"}`} />
      </div>
    </div>
  );
}

function MayorBriefing({
  city,
  selectedCitizen,
  activeEvent,
}: {
  city: CityState | null;
  selectedCitizen: CitizenAgent | null;
  activeEvent: CityEvent | null;
}) {
  const health = Math.round(city?.metrics.city_health ?? 0);
  const happiness = Math.round(city?.metrics.average_happiness ?? 0);
  const urgent = Number(city?.metrics.sick_count ?? 0) > 0 || Boolean(activeEvent?.event_type.includes("outage"));
  const briefs = [
    { label: "Simulation", value: city?.clock.running ? "City is moving" : "Awaiting start", tone: city?.clock.running ? "accent" : "warning" },
    { label: "Focus citizen", value: selectedCitizen ? `${selectedCitizen.name}, ${selectedCitizen.profession}` : "No citizen selected", tone: "water" },
    { label: "Public mood", value: `${happiness}% happiness`, tone: happiness > 70 ? "accent" : "warning" },
    { label: "City pressure", value: urgent ? "Incident response active" : `${health}% health stability`, tone: urgent ? "danger" : "accent" },
  ] as const;

  return (
    <div className="mb-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Mayor Briefing</h2>
        <Badge>{city?.events.length ?? 0} stories</Badge>
      </div>
      <div className="space-y-2">
        {briefs.map((brief) => (
          <div key={brief.label} className="story-card rounded-md p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] uppercase text-[rgb(var(--muted))]">{brief.label}</span>
              <span className={`h-2 w-2 rounded-full ${toneDot(brief.tone)}`} />
            </div>
            <div className="mt-1 truncate text-xs">{brief.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CitySystems({ city }: { city: CityState | null }) {
  return (
    <div className="my-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">City Pulse</h2>
        <Badge>tick {city?.clock.tick ?? 0}</Badge>
      </div>
      {systemRows.map((row) => {
        const Icon = row.icon;
        const value = Number(city?.metrics[row.key as keyof CityState["metrics"]] ?? 0);
        return (
          <div key={row.key} className="rounded-md bg-black/15 p-2">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-[rgb(var(--muted))]" />
                {row.label}
              </span>
              <span className="font-mono text-[rgb(var(--muted))]">{Math.round(value)}</span>
            </div>
            <Progress value={value} tone={row.tone} />
          </div>
        );
      })}
      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="Active Events" value={city?.metrics.active_events ?? 0} icon={AlertTriangle} />
        <MiniStat label="Economy" value={Math.round(city?.metrics.economy_status ?? 0)} icon={CircleDollarSign} />
      </div>
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
    <div className="my-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Citizens</h2>
        <Badge>
          {citizens.length}/{totalCitizens}
        </Badge>
      </div>
      <div className="mb-3 flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
        {professionFilters.map((filter) => (
          <button
            key={filter}
            className={`shrink-0 rounded-md border px-2 py-1 text-[11px] transition-colors ${
              professionFilter === filter
                ? "border-[rgb(var(--accent-2))] bg-[rgba(239,184,79,0.14)]"
                : "border-[rgb(var(--border))] bg-black/10 hover:bg-black/20"
            }`}
            onClick={() => onFilter(filter)}
          >
            {filter}
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        {citizens.slice(0, 25).map((citizen) => (
          <button
            key={citizen.citizen_id}
            className={`flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left transition-colors ${
              selectedCitizenId === citizen.citizen_id
                ? "border-[rgb(var(--accent-2))] bg-[rgba(239,184,79,0.12)]"
                : "border-transparent bg-black/10 hover:border-[rgb(var(--border))] hover:bg-black/20"
            }`}
            onClick={() => onSelect(citizen.citizen_id)}
          >
            <CitizenAvatar citizen={citizen} small />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{citizen.name}</span>
              <span className="block truncate font-mono text-[10px] text-[rgb(var(--muted))]">
                {citizen.profession} / {citizen.current_activity}
              </span>
            </span>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${citizen.health < 55 ? "bg-[rgb(var(--danger))]" : "bg-[rgb(var(--accent))]"}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

function MapSceneOverlay({
  citizen,
  city,
  event,
}: {
  citizen: CitizenAgent | null;
  city: CityState | null;
  event: CityEvent | null;
}) {
  return (
    <>
      <div className="pointer-events-none absolute left-3 top-3 max-w-[360px] rounded-lg border border-[rgb(var(--border))] bg-[rgba(12,16,17,0.82)] p-3 shadow-xl backdrop-blur">
        <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase text-[rgb(var(--muted))]">
          <Route className="h-3.5 w-3.5" />
          Live city scene
        </div>
        <div className="text-sm font-medium">{citizen ? `${citizen.name} is ${citizen.current_activity.toLowerCase()}` : "Navora is loading"}</div>
        <p className="mt-1 line-clamp-2 text-xs leading-snug text-[rgb(var(--muted))]">
          {citizen?.current_thought ?? "Citizens will move, work, react, remember, and form plans as the simulation runs."}
        </p>
      </div>
      <div className="pointer-events-none absolute right-3 top-3 w-[260px] rounded-lg border border-[rgb(var(--border))] bg-[rgba(12,16,17,0.82)] p-3 shadow-xl backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase text-[rgb(var(--muted))]">World state</span>
          <Badge>{city?.clock.running ? "running" : "paused"}</Badge>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <MiniNumber label="Happy" value={`${Math.round(city?.metrics.average_happiness ?? 0)}%`} />
          <MiniNumber label="Sick" value={String(city?.metrics.sick_count ?? 0)} />
          <MiniNumber label="Events" value={String(city?.metrics.active_events ?? 0)} />
        </div>
        {event ? <div className="mt-2 line-clamp-2 text-xs text-[rgb(var(--muted))]">{event.description}</div> : null}
      </div>
    </>
  );
}

function LocationDock({ locations }: { locations: Location[] }) {
  return (
    <div className="absolute bottom-3 left-3 right-3 flex gap-2 overflow-x-auto rounded-lg border border-[rgb(var(--border))] bg-[rgba(12,16,17,0.82)] p-2 backdrop-blur scrollbar-thin">
      {locations.map((location) => (
        <div key={location.location_id} className="flex min-w-[118px] items-center gap-2 rounded-md bg-black/20 px-2 py-1.5">
          {locationIcon(location.type)}
          <div className="min-w-0">
            <div className="truncate text-[11px] font-medium">{location.name}</div>
            <div className="font-mono text-[10px] text-[rgb(var(--muted))]">cap {location.capacity}</div>
          </div>
        </div>
      ))}
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
          <h2 className="text-sm font-semibold">Event Deck</h2>
          <Badge>live reactions</Badge>
        </div>
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
                  <span className="block truncate font-normal text-[10px] opacity-75">{item.detail}</span>
                </span>
              </Button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Mayor Policy</h2>
          <Badge>{city?.policy.public_health_campaign ? "campaign on" : "standard"}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <PolicyButton busy={busy} label="Hospital" icon={HeartPulse} onClick={() => runAction(() => api.applyPolicy({ hospital_budget: 72 }))} />
          <PolicyButton busy={busy} label="School" icon={BookOpen} onClick={() => runAction(() => api.applyPolicy({ school_budget: 70 }))} />
          <PolicyButton busy={busy} label="Roads" icon={Bus} onClick={() => runAction(() => api.applyPolicy({ road_budget: 72 }))} />
          <PolicyButton busy={busy} label="Health Campaign" icon={Stethoscope} onClick={() => runAction(() => api.applyPolicy({ public_health_campaign: true }))} />
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
    <div className="mb-5 space-y-4">
      <div className="flex items-start gap-3">
        <CitizenAvatar citizen={citizen} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold leading-tight">{citizen.name}</h1>
              <div className="mt-1 flex flex-wrap gap-2">
                <Badge>{citizen.profession}</Badge>
                <Badge>{citizen.mood}</Badge>
                <Badge>Age {citizen.age}</Badge>
              </div>
            </div>
            <div className="text-right font-mono text-sm">
              <div>${Math.round(citizen.money)}</div>
              <div className="text-xs text-[rgb(var(--muted))]">rep {Math.round(citizen.reputation)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[rgb(var(--border))] bg-black/20 p-3">
        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase text-[rgb(var(--muted))]">
          <Brain className="h-3.5 w-3.5" />
          Current thought
        </div>
        <p className="text-sm leading-relaxed">{citizen.current_thought}</p>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/20 p-1">
        <InspectorTabButton active={tab === "life"} icon={Gauge} label="Life" onClick={() => onTab("life")} />
        <InspectorTabButton active={tab === "memory"} icon={Brain} label="Memory" onClick={() => onTab("memory")} />
        <InspectorTabButton active={tab === "social"} icon={MessageCircle} label="Social" onClick={() => onTab("social")} />
      </div>

      {tab === "life" ? (
        <LifeTab citizen={citizen} currentLocation={currentLocation} targetLocation={targetLocation} />
      ) : null}
      {tab === "memory" ? <MemoryTab citizen={citizen} memories={memories} /> : null}
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
      className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${
        active ? "bg-[rgb(var(--panel-strong))] text-[rgb(var(--foreground))]" : "text-[rgb(var(--muted))] hover:bg-white/5"
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
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <InfoPill icon={MapPin} label="At" value={currentLocation} />
        <InfoPill icon={Route} label="Going" value={targetLocation} />
        <InfoPill icon={BriefcaseBusiness} label="Activity" value={citizen.current_activity} wide />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Need label="Health" value={citizen.health} tone={citizen.health < 50 ? "danger" : "accent"} />
        <Need label="Energy" value={citizen.energy} tone="water" />
        <Need label="Food" value={100 - citizen.hunger} tone={citizen.hunger > 70 ? "danger" : "warning"} />
        <Need label="Calm" value={100 - citizen.stress} tone={citizen.stress > 65 ? "danger" : "accent"} />
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
          <div key={`${slot.start}-${slot.activity}`} className="flex justify-between rounded-md bg-black/15 px-2 py-1.5 text-xs">
            <span className="truncate">{String(slot.activity)}</span>
            <span className="font-mono text-[rgb(var(--muted))]">{minutesLabel(Number(slot.start))}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {citizen.skills.slice(0, 4).map((skill) => (
          <Badge key={skill} className="justify-center">
            {skill}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function MemoryTab({ citizen, memories }: { citizen: CitizenAgent; memories: Memory[] }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[rgb(var(--border))] bg-black/15 p-3">
        <div className="mb-1 font-mono text-[10px] uppercase text-[rgb(var(--muted))]">Semantic summary</div>
        <p className="text-xs leading-relaxed">{citizen.memory_summary}</p>
      </div>
      <SectionTitle label="Recent memories" count={memories.length} />
      <div className="space-y-2">
        {memories.slice(0, 7).map((memory) => (
          <div key={memory.memory_id} className="story-card rounded-md p-2">
            <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase text-[rgb(var(--muted))]">
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
    <div className="space-y-4">
      <SectionTitle label="Relationships" count={relationships.length} />
      <div className="space-y-3">
        {relationships.slice(0, 8).map((relationship) => (
          <div key={relationship.relationship_id} className="story-card rounded-md p-2 text-xs">
            <div className="mb-1 flex justify-between gap-2">
              <span className="truncate">{citizenNames[relationship.other_citizen_id] ?? relationship.other_citizen_id}</span>
              <span className="font-mono text-[rgb(var(--muted))]">trust {Math.round(relationship.trust)}</span>
            </div>
            <Progress value={relationship.trust} tone="accent" />
            <p className="mt-1 line-clamp-2 text-[11px] text-[rgb(var(--muted))]">{relationship.notes}</p>
          </div>
        ))}
        {relationships.length === 0 ? <EmptyLine text="No social history loaded yet." /> : null}
      </div>

      <SectionTitle label="Recent conversations" count={conversations.length} />
      <div className="space-y-2">
        {conversations.slice(0, 5).map((conversation) => (
          <div key={conversation.conversation_id} className="story-card rounded-md p-2 text-xs">
            <div className="mb-1 font-mono text-[10px] uppercase text-[rgb(var(--muted))]">
              Day {conversation.game_day} / {minutesLabel(conversation.game_minute)}
            </div>
            <p className="mb-1 leading-snug">{conversation.summary}</p>
            <div className="space-y-1 text-[11px] text-[rgb(var(--muted))]">
              {conversation.transcript.slice(0, 3).map((line, index) => (
                <div key={`${conversation.conversation_id}-${index}`}>
                  <span className="text-[rgb(var(--foreground))]">
                    {citizenNames[line.speaker_id] ?? line.speaker_id}:
                  </span>{" "}
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

function StoryTimeline({
  timeline,
  autoTick,
  onAutoTick,
}: {
  timeline: TimelineItem[];
  autoTick: boolean;
  onAutoTick: (value: boolean) => void;
}) {
  return (
    <footer className="glass-panel z-10 rounded-none border-x-0 border-b-0 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Story Feed</h2>
          <Badge>{timeline.length}</Badge>
        </div>
        <label className="flex items-center gap-2 text-xs text-[rgb(var(--muted))]">
          <input
            type="checkbox"
            checked={autoTick}
            onChange={(event) => onAutoTick(event.currentTarget.checked)}
          />
          Auto mode
        </label>
      </div>
      <div className="grid h-[146px] grid-cols-5 gap-2 overflow-y-auto scrollbar-thin">
        {timeline.map((item) => (
          <div key={item.id} className="story-card rounded-lg p-2">
            <div className="mb-1 flex items-center justify-between gap-2 font-mono text-[10px] uppercase text-[rgb(var(--muted))]">
              <span>{item.time}</span>
              <span className="truncate">{storyTypeLabel(item.type)}</span>
            </div>
            <p className="line-clamp-4 text-xs leading-snug">{item.text}</p>
          </div>
        ))}
      </div>
    </footer>
  );
}

function CitizenAvatar({ citizen, small = false }: { citizen: CitizenAgent; small?: boolean }) {
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center rounded-md border border-black/30 ${small ? "h-8 w-8" : "h-14 w-14"}`}
      style={{ background: professionHex(citizen.profession) }}
    >
      <UserRound className={small ? "h-4 w-4 text-black/80" : "h-7 w-7 text-black/80"} />
      <span className={`absolute rounded-full border border-black/40 ${small ? "-right-0.5 -top-0.5 h-2.5 w-2.5" : "-right-1 -top-1 h-3.5 w-3.5"}`} style={{ background: moodHex(citizen) }} />
      <span className="absolute bottom-0.5 right-1 font-mono text-[9px] font-bold text-black/75">{professionGlyph(citizen.profession)}</span>
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
    <div className={`rounded-md border border-[rgb(var(--border))] bg-black/15 p-2 ${wide ? "col-span-2" : ""}`}>
      <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase text-[rgb(var(--muted))]">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="truncate text-xs">{value}</div>
    </div>
  );
}

function Metric({
  label,
  value,
  plain = false,
  icon: Icon,
}: {
  label: string;
  value: number;
  plain?: boolean;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex min-w-20 items-center gap-2 rounded-lg border border-[rgb(var(--border))] bg-black/15 px-3 py-2">
      <Icon className="h-4 w-4 text-[rgb(var(--muted))]" />
      <div>
        <div className="font-mono text-[10px] uppercase text-[rgb(var(--muted))]">{label}</div>
        <div className="font-mono text-sm">{plain ? value : `${Math.round(value)}%`}</div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-md border border-[rgb(var(--border))] bg-black/15 p-2">
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase text-[rgb(var(--muted))]">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}

function MiniNumber({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-black/20 px-2 py-1">
      <div className="font-mono text-[10px] uppercase text-[rgb(var(--muted))]">{label}</div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}

function Need({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: Tone;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between font-mono text-xs text-[rgb(var(--muted))]">
        <span>{label}</span>
        <span>{Math.round(value)}</span>
      </div>
      <Progress value={value} tone={tone} />
    </div>
  );
}

function SectionTitle({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div className="font-mono text-xs uppercase text-[rgb(var(--muted))]">{label}</div>
      <Badge>{count}</Badge>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="rounded-md border border-[rgb(var(--border))] bg-black/10 p-3 text-xs text-[rgb(var(--muted))]">{text}</div>;
}

function locationIcon(type: string) {
  if (type === "home") return <Home className="h-3.5 w-3.5 text-[rgb(var(--muted))]" />;
  if (type === "hospital") return <Stethoscope className="h-3.5 w-3.5 text-[rgb(var(--muted))]" />;
  if (type === "school") return <BookOpen className="h-3.5 w-3.5 text-[rgb(var(--muted))]" />;
  if (type === "bank") return <Banknote className="h-3.5 w-3.5 text-[rgb(var(--muted))]" />;
  if (type === "market") return <Store className="h-3.5 w-3.5 text-[rgb(var(--muted))]" />;
  if (type === "restaurant") return <Store className="h-3.5 w-3.5 text-[rgb(var(--muted))]" />;
  if (type === "pharmacy") return <Stethoscope className="h-3.5 w-3.5 text-[rgb(var(--muted))]" />;
  if (type === "farm") return <Wheat className="h-3.5 w-3.5 text-[rgb(var(--muted))]" />;
  if (type === "police") return <Shield className="h-3.5 w-3.5 text-[rgb(var(--muted))]" />;
  if (type === "bus_stop") return <Bus className="h-3.5 w-3.5 text-[rgb(var(--muted))]" />;
  if (type === "lab") return <Brain className="h-3.5 w-3.5 text-[rgb(var(--muted))]" />;
  if (type === "library") return <BookOpen className="h-3.5 w-3.5 text-[rgb(var(--muted))]" />;
  if (type === "power") return <Zap className="h-3.5 w-3.5 text-[rgb(var(--muted))]" />;
  return <MapPin className="h-3.5 w-3.5 text-[rgb(var(--muted))]" />;
}

function professionHex(profession: string) {
  const colors: Record<string, string> = {
    Doctor: "#e05d52",
    Nurse: "#f28b82",
    Teacher: "#6da8d6",
    Student: "#8abf67",
    Engineer: "#eeb754",
    Driver: "#b9c2c7",
    Shopkeeper: "#d78b45",
    Banker: "#8f7dd6",
    "Police Officer": "#4f90bc",
    Farmer: "#5fa45f",
    Mayor: "#f0d37b",
    Scientist: "#68b8a9",
    Researcher: "#68b8a9",
    "Restaurant Cook": "#df7b59",
  };
  return colors[profession] ?? "#d7dce0";
}

function moodHex(citizen: CitizenAgent) {
  if (citizen.health < 55) return "#e05d52";
  if (citizen.stress > 68) return "#eeb754";
  if (citizen.happiness > 78) return "#73c58c";
  return "#8bc1df";
}

function toneDot(tone: Tone) {
  return {
    accent: "bg-[rgb(var(--accent))]",
    warning: "bg-[rgb(var(--accent-2))]",
    danger: "bg-[rgb(var(--danger))]",
    water: "bg-[rgb(var(--water))]",
  }[tone];
}

function storyTypeLabel(type: string) {
  return type.replaceAll("_", " ");
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
  return glyphs[profession] ?? "*";
}

function minutesLabel(value: number) {
  return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
}
