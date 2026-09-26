"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { api } from "@/lib/api";
import { scenarioCatalog, type ScenarioKind } from "@/lib/scenarios";
import { conditionFromWmo, type WeatherOverride } from "@/lib/weather";
import { liveElection } from "@/lib/elections";
import { useGameStore } from "@/lib/store";
import type { CityState } from "@/lib/types";

const skies: Array<{ condition: WeatherOverride["condition"]; icon: string; label: string }> = [
  { condition: "clear", icon: "☀️", label: "Sunny" },
  { condition: "rain", icon: "🌧️", label: "Rain" },
  { condition: "thunderstorm", icon: "⛈️", label: "Thunder" },
  { condition: "snow", icon: "❄️", label: "Snow" },
  { condition: "fog", icon: "🌫️", label: "Fog" },
  { condition: "heatwave", icon: "🥵", label: "Heatwave" },
  { condition: "typhoon", icon: "🌀", label: "Typhoon" },
  { condition: "earthquake", icon: "🫨", label: "Earthquake" },
];

/** Play god: change the weather or set up a situation, then watch the residents react. */
export function GodPanel({ city, busy, act, onMessage, onStarted }: {
  city: CityState;
  busy: boolean;
  act: (action: () => Promise<CityState>) => Promise<unknown>;
  onMessage: (text: string) => void;
  /** Close the panel and fly the camera to where it's happening. */
  onStarted: (ids: string[], locationId?: string) => void;
}) {
  const [open, setOpen] = useState<ScenarioKind | null>(null);
  // An opened card's form can land below the fold; bring all of it into view.
  useEffect(() => {
    if (open) document.querySelector(".scenario-card[data-open='true']")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);
  const [place, setPlace] = useState("loc_park");
  const [first, setFirst] = useState(city.citizens[0]?.citizen_id ?? "");
  const [second, setSecond] = useState(city.citizens[1]?.citizen_id ?? "");
  const [amount, setAmount] = useState(100);
  const people = city.citizens.filter((c) => c.age >= 5);
  const watching = city.simulation_mode === "autonomous" && city.clock.running;

  const sky = (condition: WeatherOverride["condition"] | null) => act(() => api.setWeather(condition));
  const tokyo = () => act(async () => {
    const response = await fetch("https://api.open-meteo.com/v1/forecast?latitude=35.6895&longitude=139.6917&current=temperature_2m,weather_code,wind_speed_10m&timezone=Asia%2FTokyo", { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Tokyo's weather service did not answer. Try again later.");
    const data = (await response.json()) as { current: { temperature_2m: number; weather_code: number; wind_speed_10m: number } };
    const condition = conditionFromWmo(data.current.weather_code, data.current.wind_speed_10m);
    onMessage(`Live from Tokyo: ${Math.round(data.current.temperature_2m)}°C, ${condition.replace("_", " ")}. Nakameguro has the same sky for the next six hours.`);
    return api.setWeather(condition, { temp_c: data.current.temperature_2m, source: "tokyo" });
  });
  const create = (kind: ScenarioKind) => {
    const spec = scenarioCatalog.find((s) => s.kind === kind)!;
    const people = spec.needs.includes("pair") ? [first, second] : spec.needs.includes("person") ? [first] : [];
    setOpen(null);
    // Go there straight away; the reaction plays as soon as it's ready and the story card keeps track.
    onStarted(people, spec.needs.includes("place") ? place : undefined);
    void act(async () => {
      const { city: next, result, talked, error } = await api.createSituation({ kind, location_id: place, citizen_ids: [first, second], amount });
      onMessage(`${spec.icon} ${result.headline} ${talked ? "Watch their reaction." : error ? `(${error})` : "Follow it in “Happening now”."}`);
      if (result.focus_id) useGameStore.getState().focusOn([result.focus_id]);
      return next;
    });
  };
  const students = city.citizens.filter((c) => c.profession === "Student");
  const [candidateA, setCandidateA] = useState(students[0]?.citizen_id ?? "");
  const [candidateB, setCandidateB] = useState(students[1]?.citizen_id ?? "");
  const running = liveElection(city);
  const election = () => {
    onStarted([candidateA, candidateB], "loc_school");
    void act(async () => {
      const next = await api.startElection(candidateA, candidateB);
      onMessage("🗳️ The election has started. Watch the campaign in “Happening now”.");
      return next;
    });
  };
  const watch = () => act(async () => {
    await api.setMode("autonomous");
    return api.start();
  });

  return (
    <div className="panel-scroll god-panel">
      <p className="god-intro">You control the world. Change the sky or set up a situation, then watch how everyone reacts, each in their own way.</p>
      <button className="primary-action full-width" disabled={busy || watching} onClick={() => void watch()}>
        <Play size={16} /> {watching ? "The city is live" : "Watch how they react"}
      </button>

      <h4>Weather & nature</h4>
      <div className="sky-grid">
        {skies.map((s) => (
          <button key={s.condition} disabled={busy} onClick={() => void sky(s.condition)} aria-pressed={city.weather_override?.condition === s.condition}>
            <span aria-hidden="true">{s.icon}</span>{s.label}
          </button>
        ))}
      </div>
      <div className="sky-extra">
        <button className="outline-action" disabled={busy} onClick={() => void tokyo()}>🗾 Live Tokyo weather</button>
        <button className="text-action" disabled={busy || !city.weather_override} onClick={() => void sky(null)}>Back to normal</button>
      </div>

      <h4>Create a situation</h4>
      <div className="scenario-list">
        {scenarioCatalog.map((s) => (
          <div key={s.kind} className="scenario-card" data-open={open === s.kind}>
            <button className="scenario-head" onClick={() => setOpen(open === s.kind ? null : s.kind)} aria-expanded={open === s.kind}>
              <span aria-hidden="true">{s.icon}</span>
              <span><strong>{s.title}</strong><small>{s.blurb}</small></span>
            </button>
            {open === s.kind && (
              <div className="scenario-form">
                {s.needs.includes("place") && (
                  <label>Where<select value={place} onChange={(e) => setPlace(e.target.value)}>
                    {city.locations.map((l) => <option key={l.location_id} value={l.location_id}>{l.name} ({city.citizens.filter((c) => c.current_location_id === l.location_id).length} here)</option>)}
                  </select></label>
                )}
                {(s.needs.includes("person") || s.needs.includes("pair")) && (
                  <label>{s.needs.includes("pair") ? "First person" : "Who"}<select value={first} onChange={(e) => setFirst(e.target.value)}>
                    {people.map((c) => <option key={c.citizen_id} value={c.citizen_id}>{c.name} ({c.age})</option>)}
                  </select></label>
                )}
                {s.needs.includes("pair") && (
                  <label>Second person<select value={second} onChange={(e) => setSecond(e.target.value)}>
                    {people.map((c) => <option key={c.citizen_id} value={c.citizen_id}>{c.name} ({c.age})</option>)}
                  </select></label>
                )}
                {s.needs.includes("amount") && (
                  <label>Amount (${amount})<input type="range" min={10} max={2000} step={10} value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></label>
                )}
                <button className="primary-action full-width" disabled={busy} onClick={() => void create(s.kind)}>{s.icon} Make it happen</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="scenario-card" data-open={open === ("election" as ScenarioKind)}>
        <button className="scenario-head" onClick={() => setOpen(open === ("election" as ScenarioKind) ? null : ("election" as ScenarioKind))}>
          <span aria-hidden="true">🗳️</span>
          <span><strong>Student-council election</strong><small>Two students campaign, everyone votes in secret. Who wins?</small></span>
        </button>
        {open === ("election" as ScenarioKind) && (
          <div className="scenario-form">
            {running ? <p className="muted-copy">An election is already running. Follow it in “Happening now”.</p> : <>
              <label>First candidate<select value={candidateA} onChange={(e) => setCandidateA(e.target.value)}>
                {students.map((c) => <option key={c.citizen_id} value={c.citizen_id}>{c.name} ({c.age})</option>)}
              </select></label>
              <label>Second candidate<select value={candidateB} onChange={(e) => setCandidateB(e.target.value)}>
                {students.map((c) => <option key={c.citizen_id} value={c.citizen_id}>{c.name} ({c.age})</option>)}
              </select></label>
              <button className="primary-action full-width" disabled={busy || candidateA === candidateB} onClick={election}>🗳️ Start the election</button>
            </>}
          </div>
        )}
      </div>
      <p className="news-footnote">Reactions depend on each person&apos;s character, money, mood and friendships. Everything that follows is tracked in “Happening now”.</p>
    </div>
  );
}
